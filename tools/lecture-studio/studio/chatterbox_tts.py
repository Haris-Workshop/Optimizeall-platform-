"""Chatterbox Multilingual (Resemble AI, MIT licence) as a local narration engine.

The model runs on the machine that runs the studio (a CUDA GPU in practice; Apple MPS works; CPU is far slower than real
time). Weights download once from the Hugging Face repo ``ResembleAI/chatterbox`` into the HF cache. Every output carries
Resemble's PerTh watermark (applied inside the library), which suits the AI-disclosure policy of the lectures.

One generate() call produces at most ~40 s of speech (1,000 speech tokens at 25 Hz), so each scene's narration is split
into sentence chunks, generated chunk by chunk with a seed derived from the cache key (reruns are reproducible) and joined
with a short pause. A chunk whose length is implausible for its text (a hallucinated continuation, or a cut-off) is
generated once more with another seed and otherwise fails the scene, so bad audio never reaches the cache.

The heavy imports (torch, chatterbox) happen only when a model is loaded; planning, tests and the ElevenLabs flow do not
need them. Install with ``pip install -r requirements-chatterbox.txt``.
"""
from __future__ import annotations

import hashlib
import io
import re
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

ENGINE = "chatterbox"
SUPPORTED_MODELS = ("v3", "v2")

# Speaking-rate sanity bounds per chunk, in seconds per word (natural narration is ~0.35-0.5 s/word).
MIN_SECONDS_PER_WORD = 0.16
MAX_SECONDS_PER_WORD = 1.25
MIN_CHUNK_SECONDS = 0.6


class ChatterboxError(RuntimeError):
    pass


def model_label(version: str) -> str:
    """The model string used in plans and cache keys, e.g. ``chatterbox-multilingual-v3``."""
    if version not in SUPPORTED_MODELS:
        raise ChatterboxError(f"unknown Chatterbox model {version!r} (use one of {', '.join(SUPPORTED_MODELS)})")
    return f"chatterbox-multilingual-{version}"


def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# ---------------------------------------------------------------------------------------------------- text chunking

_SENTENCE = re.compile(r"(?<=[.!?…])[\"')\]]*\s+")
_CLAUSE = re.compile(r"(?<=[,;:—–])\s+")


def split_for_tts(text: str, max_chars: int = 280) -> list[str]:
    """Sentence chunks of at most ``max_chars`` (sentences are merged while they fit; an over-long sentence is split at
    clause punctuation, then at word boundaries). Joining the chunks with spaces gives back the normalised text."""
    if max_chars < 40:
        raise ValueError("max_chars must be at least 40")
    words_text = " ".join(text.split())
    if not words_text:
        return []

    pieces: list[str] = []
    for sentence in _SENTENCE.split(words_text):
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) <= max_chars:
            pieces.append(sentence)
            continue
        for clause in _CLAUSE.split(sentence):
            clause = clause.strip()
            while len(clause) > max_chars:
                cut = clause.rfind(" ", 0, max_chars + 1)
                if cut <= 0:
                    cut = max_chars
                pieces.append(clause[:cut].strip())
                clause = clause[cut:].strip()
            if clause:
                pieces.append(clause)

    chunks: list[str] = []
    for piece in pieces:
        if chunks and len(chunks[-1]) + 1 + len(piece) <= max_chars:
            chunks[-1] = f"{chunks[-1]} {piece}"
        else:
            chunks.append(piece)
    return chunks


def plausible(seconds: float, text: str) -> bool:
    words = max(1, len(text.split()))
    if seconds < MIN_CHUNK_SECONDS and words > 2:
        return False
    return MIN_SECONDS_PER_WORD * words <= seconds <= max(MAX_SECONDS_PER_WORD * words, 2.0)


def chunk_seed(key: str, index: int, attempt: int) -> int:
    return int(hashlib.sha256(f"{key}:{index}:{attempt}".encode()).hexdigest()[:8], 16)


# ---------------------------------------------------------------------------------------------------- the model


class Synthesizer(Protocol):
    sample_rate: int

    def synthesize(self, text: str, *, voice_ref: Path | None, seed: int) -> "list[float] | object":
        """Mono float samples in [-1, 1] at ``sample_rate`` (numpy array or list)."""


@dataclass
class Settings:
    model: str = "v3"
    language: str = "en"
    device: str = "auto"
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    temperature: float = 0.8
    chunk_chars: int = 280
    pause_seconds: float = 0.2

    def signature(self) -> str:
        """Everything that changes the audio (goes into the cache key next to the voice and the text)."""
        return (f"{model_label(self.model)};lang={self.language};exag={self.exaggeration:g};cfg={self.cfg_weight:g};"
                f"temp={self.temperature:g};chunk={self.chunk_chars};pause={self.pause_seconds:g}")


def resolve_device(device: str) -> str:
    if device != "auto":
        return device
    import torch  # noqa: PLC0415 - heavy, optional dependency

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class ChatterboxSynthesizer:
    """The real model (lazy, one load per process; conditionals are prepared once per reference voice)."""

    def __init__(self, settings: Settings, log: Callable[[str], None] = print):
        try:
            import torch  # noqa: F401, PLC0415
            from chatterbox.mtl_tts import SUPPORTED_LANGUAGES, ChatterboxMultilingualTTS  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - depends on the machine
            raise ChatterboxError(
                "Chatterbox is not installed: pip install -r tools/lecture-studio/requirements-chatterbox.txt"
            ) from exc
        if settings.language not in SUPPORTED_LANGUAGES:
            raise ChatterboxError(f"Chatterbox does not support language {settings.language!r}")
        self.settings = settings
        self.device = resolve_device(settings.device)
        if self.device == "cpu":
            log("warning: Chatterbox on CPU is much slower than real time; use a CUDA GPU for full courses")
        log(f"loading Chatterbox Multilingual {settings.model} on {self.device} (first run downloads ~3.3 GB of weights)")
        self.model = ChatterboxMultilingualTTS.from_pretrained(device=self.device, t3_model=settings.model)
        self.sample_rate = int(self.model.sr)
        self._default_conds = self.model.conds
        self._voice: str | None = None

    def _use_voice(self, voice_ref: Path | None) -> None:
        wanted = str(voice_ref) if voice_ref else None
        if wanted == self._voice:
            return
        if voice_ref is None:
            self.model.conds = self._default_conds
        else:
            self.model.prepare_conditionals(str(voice_ref), exaggeration=self.settings.exaggeration)
        self._voice = wanted

    def synthesize(self, text: str, *, voice_ref: Path | None, seed: int):
        import torch  # noqa: PLC0415

        self._use_voice(voice_ref)
        torch.manual_seed(seed)
        if self.device == "cuda":
            torch.cuda.manual_seed_all(seed)
        s = self.settings
        wav = self.model.generate(text, language_id=s.language, exaggeration=s.exaggeration,
                                  cfg_weight=s.cfg_weight, temperature=s.temperature)
        return wav.squeeze(0).cpu().numpy()


# ---------------------------------------------------------------------------------------------------- one scene


def _to_pcm16(samples) -> bytes:
    try:
        import numpy as np  # noqa: PLC0415 - always present next to torch; plain Python otherwise

        arr = np.clip(np.asarray(samples, dtype=np.float64), -1.0, 1.0)
        return np.round(arr * 32767).astype("<i2").tobytes()
    except ImportError:
        pass
    out = bytearray()
    for v in samples:
        f = float(v)
        f = 1.0 if f > 1.0 else -1.0 if f < -1.0 else f
        out += int(round(f * 32767)).to_bytes(2, "little", signed=True)
    return bytes(out)


def synthesize_scene(synth: Synthesizer, text: str, *, key: str, voice_ref: Path | None, settings: Settings,
                     log: Callable[[str], None] = lambda _m: None) -> tuple[bytes, dict]:
    """WAV bytes (16-bit mono) of a whole scene plus metadata (chunks, attempts, seconds)."""
    chunks = split_for_tts(text, settings.chunk_chars)
    if not chunks:
        raise ChatterboxError("empty narration")
    rate = synth.sample_rate
    pause = _to_pcm16([0.0] * int(round(settings.pause_seconds * rate)))
    pcm = bytearray()
    report = []
    for i, chunk in enumerate(chunks):
        samples, seconds, attempt = None, 0.0, 0
        for attempt in range(2):
            samples = synth.synthesize(chunk, voice_ref=voice_ref, seed=chunk_seed(key, i, attempt))
            seconds = len(samples) / rate
            if plausible(seconds, chunk):
                break
            log(f"  chunk {i + 1}/{len(chunks)}: {seconds:.1f}s for {len(chunk.split())} words looks wrong, regenerating")
        else:
            raise ChatterboxError(
                f"chunk {i + 1}/{len(chunks)} produced {seconds:.1f}s for {len(chunk.split())} words twice: "
                f"{chunk[:80]!r}"
            )
        if i:
            pcm += pause
        pcm += _to_pcm16(samples)
        report.append({"chars": len(chunk), "seconds": round(seconds, 3), "attempts": attempt + 1})

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(pcm))
    return buf.getvalue(), {"chunks": report, "sampleRate": rate}
