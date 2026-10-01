"""Kokoro-82M (Apache-2.0) as a free, CPU-only narration engine.

Kokoro is a small open-source model that runs faster than real time on an ordinary CPU through ONNX Runtime, so a
laptop or a cloud VM without a GPU can narrate the catalogue at no per-character cost. It has built-in voices (no
cloning) and English plus a few other languages. The model files (~350 MB) come from the kokoro-onnx GitHub release and
are verified against pinned SHA-256 hashes before use.

Scene handling (sentence chunking, a plausibility check on every chunk's length, WAV assembly) is shared with the
Chatterbox engine in ``chatterbox_tts``; only the synthesizer differs. Kokoro is deterministic, so no seeds are needed.

The heavy import (kokoro_onnx) happens only when a model is loaded. Install with ``pip install -r requirements-kokoro.txt``.
"""
from __future__ import annotations

import hashlib
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import delivery
from .chatterbox_tts import (ChatterboxError, _to_pcm16, chunk_seed, plausible, split_for_tts,  # noqa: F401 - re-exported
                             synthesize_scene)

ENGINE = "kokoro"
MODEL_LABEL = "kokoro-82m-v1.0"

RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
MODEL_FILES = {
    "kokoro-v1.0.onnx": "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}

# American (a*) and British (b*) English voices shipped with Kokoro v1.0: f = female, m = male.
ENGLISH_VOICES = (
    "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river",
    "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck",
    "am_santa", "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
)

# One narrator for the whole academy: af_heart is Kokoro's top-rated voice (grade A in its published voice table; the male
# voices grade around C+), and a single consistent voice is also a stronger brand. Override per course category with
# kokoro_voices, e.g. {"sales": "bm_george"} or a blend such as "af_heart:0.7+af_bella:0.3"; "*" covers every other category.
DEFAULT_VOICES = {"*": "af_heart"}


class KokoroError(ChatterboxError):
    """Same family as the Chatterbox errors, so the shared scene code and callers handle both."""


STYLES = ("expressive", "plain")


@dataclass
class Settings:
    language: str = "en-us"
    speed: float = 1.0
    chunk_chars: int = 280
    pause_seconds: float = 0.2
    style: str = "expressive"  # expressive: per-scene/per-sentence delivery (delivery.py); plain: one speed, even pauses
    master: bool = True  # light mastering of every scene (delivery.MASTER_FILTER)

    def signature(self) -> str:
        """Everything that changes the audio apart from the voice and the text (both are in the cache key already)."""
        if self.style not in STYLES:
            raise KokoroError(f"unknown Kokoro style {self.style!r} (use one of {', '.join(STYLES)})")
        return (f"{MODEL_LABEL};lang={self.language};speed={self.speed:g};chunk={self.chunk_chars};"
                f"pause={self.pause_seconds:g};style={self.style};master={int(self.master)}")


def parse_voice(spec: str) -> list[tuple[str, float]]:
    """``af_heart`` or a blend such as ``af_heart:0.7+af_bella:0.3`` -> [(voice, weight)] with weights summing to 1."""
    parts = []
    for piece in spec.split("+"):
        name, _, weight = piece.strip().partition(":")
        if not name:
            raise KokoroError(f"empty voice in {spec!r}")
        try:
            w = float(weight) if weight else 1.0
        except ValueError as exc:
            raise KokoroError(f"bad voice weight in {spec!r}") from exc
        if w <= 0:
            raise KokoroError(f"voice weights must be positive in {spec!r}")
        parts.append((name, w))
    total = sum(w for _, w in parts)
    return [(n, w / total) for n, w in parts]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def ensure_models(model_dir: Path, log: Callable[[str], None] = print, fetch=None) -> tuple[Path, Path]:
    """Paths of the model and voices files in ``model_dir``, downloading (atomically) and verifying any that are missing
    or fail their hash. ``fetch(url, dest_path)`` is injectable for tests."""
    model_dir.mkdir(parents=True, exist_ok=True)
    for name, expected in MODEL_FILES.items():
        dest = model_dir / name
        if dest.is_file() and sha256_file(dest) == expected:
            continue
        log(f"downloading {name} from the kokoro-onnx release")
        tmp = dest.with_suffix(dest.suffix + ".part")
        try:
            (fetch or urllib.request.urlretrieve)(f"{RELEASE}/{name}", str(tmp))
            if sha256_file(tmp) != expected:
                raise KokoroError(f"{name} does not match its pinned SHA-256; refusing to use it")
            os.replace(tmp, dest)
        finally:
            tmp.unlink(missing_ok=True)
    return model_dir / "kokoro-v1.0.onnx", model_dir / "voices-v1.0.bin"


class KokoroSynthesizer:
    """The real model (lazy, one load per process; the voice can change between lectures)."""

    def __init__(self, settings: Settings, model_dir: Path, log: Callable[[str], None] = print):
        try:
            from kokoro_onnx import Kokoro  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - depends on the machine
            raise KokoroError("Kokoro is not installed: pip install -r tools/lecture-studio/requirements-kokoro.txt") from exc
        model, voices = ensure_models(model_dir, log)
        log("loading Kokoro-82M on the CPU")
        self.settings = settings
        self.model = Kokoro(str(model), str(voices))
        self.sample_rate = 24000
        self.voice = DEFAULT_VOICES["*"]
        self.available = set(self.model.get_voices())

    def use_voice(self, voice: str) -> None:
        parts = parse_voice(voice)
        unknown = [n for n, _ in parts if n not in self.available]
        if unknown:
            raise KokoroError(f"unknown Kokoro voice {unknown[0]!r}")
        if len(parts) == 1:
            self.voice = parts[0][0]
        else:  # a blend of style vectors: a richer timbre than either voice alone
            self.voice = sum(w * self.model.get_voice_style(n) for n, w in parts)

    def synthesize(self, text: str, *, voice_ref=None, seed: int = 0, speed: float | None = None,
                   sentence_pause: float | None = None, clause_pause: float | None = None):
        kw = {}
        if sentence_pause is not None:
            kw["sentence_pause"] = sentence_pause
        if clause_pause is not None:
            kw["clause_pause"] = clause_pause
        samples, rate = self.model.create(text, voice=self.voice, speed=self.settings.speed if speed is None else speed,
                                          lang=self.settings.language, **kw)
        if int(rate) != self.sample_rate:
            raise KokoroError(f"unexpected sample rate {rate}")
        return samples


# ---------------------------------------------------------------------------------------------------- one scene


def synthesize_scene_expressive(synth, text: str, *, key: str, template: str | None, settings: Settings,
                                log: Callable[[str], None] = lambda _m: None) -> tuple[bytes, dict]:
    """WAV bytes of a scene delivered with the profile of its template and a per-sentence pace and pause (delivery.py),
    optionally mastered. Each segment's length is checked against its words; one retry at a slightly different pace, then
    the scene fails rather than caching bad audio."""
    import io  # noqa: PLC0415
    import wave  # noqa: PLC0415

    profile = delivery.profile_for(template, settings.speed)
    segments = delivery.plan_segments(text, profile, key=key, max_chars=settings.chunk_chars)
    if not segments:
        raise KokoroError("empty narration")
    rate = synth.sample_rate
    pcm = bytearray()
    report = []
    for i, seg in enumerate(segments):
        samples, seconds, attempt = None, 0.0, 0
        for attempt in range(2):
            speed = seg.speed if attempt == 0 else min(delivery.MAX_SPEED, max(delivery.MIN_SPEED, seg.speed * 0.97))
            samples = synth.synthesize(seg.text, voice_ref=None, seed=chunk_seed(key, i, attempt), speed=speed,
                                       sentence_pause=profile.sentence_pause, clause_pause=profile.clause_pause)
            seconds = len(samples) / rate
            if plausible(seconds, seg.text):
                break
            log(f"  segment {i + 1}/{len(segments)}: {seconds:.1f}s for {len(seg.text.split())} words looks wrong, retrying")
        else:
            raise KokoroError(f"segment {i + 1}/{len(segments)} produced {seconds:.1f}s for {len(seg.text.split())} words "
                              f"twice: {seg.text[:80]!r}")
        pcm += _to_pcm16(samples)
        if seg.pause_after:
            pcm += _to_pcm16([0.0] * int(round(seg.pause_after * rate)))
        report.append({"chars": len(seg.text), "seconds": round(seconds, 3), "speed": seg.speed, "kind": seg.kind,
                       "pauseAfter": seg.pause_after, "attempts": attempt + 1})
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(pcm))
    audio = buf.getvalue()
    if settings.master:
        audio = delivery.master_wav(audio)
    return audio, {"chunks": report, "sampleRate": rate, "template": template, "style": "expressive", "mastered": settings.master}
