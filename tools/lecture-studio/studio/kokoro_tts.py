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

from .chatterbox_tts import ChatterboxError, split_for_tts, synthesize_scene  # noqa: F401 - re-exported for callers

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

# Category -> voice, as chosen by listening to samples: a US male for the technical courses, a US female for the
# marketing-side courses and a British male for sales and business.
DEFAULT_VOICES = {
    "ai": "am_michael", "data": "am_michael", "platform": "am_michael",
    "marketing": "af_heart", "seo": "af_heart", "design": "af_heart",
    "sales": "bm_george", "business": "bm_george",
    "*": "am_michael",
}


class KokoroError(ChatterboxError):
    """Same family as the Chatterbox errors, so the shared scene code and callers handle both."""


@dataclass
class Settings:
    language: str = "en-us"
    speed: float = 1.0
    chunk_chars: int = 280
    pause_seconds: float = 0.2

    def signature(self) -> str:
        """Everything that changes the audio apart from the voice and the text (both are in the cache key already)."""
        return f"{MODEL_LABEL};lang={self.language};speed={self.speed:g};chunk={self.chunk_chars};pause={self.pause_seconds:g}"


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
        if voice not in self.available:
            raise KokoroError(f"unknown Kokoro voice {voice!r}")
        self.voice = voice

    def synthesize(self, text: str, *, voice_ref=None, seed: int = 0):
        samples, rate = self.model.create(text, voice=self.voice, speed=self.settings.speed, lang=self.settings.language)
        if int(rate) != self.sample_rate:
            raise KokoroError(f"unexpected sample rate {rate}")
        return samples
