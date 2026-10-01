"""Expressive delivery for narration engines without emotion controls (Kokoro).

A flat read comes from one speed and one pause length for every sentence. Here each scene gets a delivery profile from its
template (a title scene is welcoming, a key idea weighty, a case study conversational, the recap warm and unhurried) and each
sentence is shaped by what it is: a question is asked a little slower and followed by a beat for the listener to think, a
very short sentence is given room, an exclamation lifts, a sentence that ends with a colon holds before what follows, a very
long one keeps its momentum, the first settles in and the last lands. A tiny deterministic variation (from the cache key)
stops the rhythm repeating exactly. Everything here is pure and seeded, so the same text and key always give the same plan.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from .chatterbox_tts import split_for_tts

_SENTENCE = re.compile(r"(?<=[.!?…])[\"')\]]*\s+")

MIN_SPEED = 0.85
MAX_SPEED = 1.15


@dataclass(frozen=True)
class Profile:
    speed: float
    sentence_pause: float  # seconds after a sentence
    clause_pause: float  # seconds after a comma, colon or dash inside a sentence


# By scene template (see plan.choose_template): the emotional shape of the scene.
PROFILES: dict[str, Profile] = {
    "title": Profile(0.97, 0.34, 0.14),  # welcoming
    "keyidea": Profile(0.95, 0.36, 0.14),  # weighty
    "code": Profile(0.96, 0.30, 0.12),  # precise
    "compare": Profile(0.98, 0.30, 0.12),
    "bullets": Profile(0.99, 0.28, 0.12),
    "case": Profile(1.01, 0.26, 0.10),  # conversational storytelling
    "recap": Profile(0.95, 0.36, 0.14),  # warm, unhurried close
}
DEFAULT_PROFILE = Profile(0.98, 0.30, 0.12)


@dataclass(frozen=True)
class Segment:
    text: str
    speed: float
    pause_after: float  # seconds of silence after this segment (0 after the last)
    kind: str  # question | exclaim | short | long | colon | statement


def profile_for(template: str | None, base_speed: float = 1.0) -> Profile:
    p = PROFILES.get(template or "", DEFAULT_PROFILE)
    return Profile(p.speed * base_speed, p.sentence_pause, p.clause_pause)


def _jitter(key: str, index: int) -> float:
    """A repeatable ±1.2 % speed variation per sentence."""
    h = int(hashlib.sha256(f"{key}:{index}".encode()).hexdigest()[:6], 16)
    return ((h % 2001) - 1000) / 1000 * 0.012


def _kind(sentence: str) -> str:
    words = len(sentence.split())
    if sentence.endswith("?"):
        return "question"
    if sentence.endswith("!"):
        return "exclaim"
    if sentence.endswith(":"):
        return "colon"
    if words <= 4:
        return "short"
    if words >= 30:
        return "long"
    return "statement"


_SPEED_DELTA = {"question": -0.04, "exclaim": 0.04, "short": -0.06, "long": 0.03, "colon": -0.02, "statement": 0.0}
_PAUSE_EXTRA = {"question": 0.15, "exclaim": 0.0, "short": 0.10, "long": 0.0, "colon": 0.12, "statement": 0.0}


def plan_segments(text: str, profile: Profile, *, key: str, max_chars: int = 280) -> list[Segment]:
    """The sentences of ``text`` as synthesis segments with their own speed and trailing pause. A sentence longer than
    ``max_chars`` is split at clause punctuation (the pieces share the sentence's speed; only the last gets its pause)."""
    flat = " ".join(text.split())
    if not flat:
        return []
    sentences = [s.strip() for s in _SENTENCE.split(flat) if s.strip()]
    out: list[Segment] = []
    last = len(sentences) - 1
    for i, sentence in enumerate(sentences):
        kind = _kind(sentence)
        speed = profile.speed + _SPEED_DELTA[kind] + _jitter(key, i)
        if i == 0:
            speed -= 0.02  # settle in
        if i == last:
            speed -= 0.03  # land it
        speed = min(MAX_SPEED, max(MIN_SPEED, speed))
        pause = 0.0 if i == last else profile.sentence_pause + _PAUSE_EXTRA[kind]
        pieces = split_for_tts(sentence, max_chars) if len(sentence) > max_chars else [sentence]
        for j, piece in enumerate(pieces):
            tail = j == len(pieces) - 1
            out.append(Segment(piece, round(speed, 4), round(pause if tail else profile.clause_pause, 3), kind))
    return out


# ------------------------------------------------------------------------------------------------ mastering

# Light mastering for synthetic speech: remove rumble, add a little presence and warmth, even out the level, tame sibilance
# and limit peaks. The final video is loudness-normalised separately (assemble).
MASTER_FILTER = (
    "highpass=f=70,"
    "equalizer=f=180:t=q:w=1.0:g=1.2,"  # warmth
    "equalizer=f=3200:t=q:w=1.2:g=1.5,"  # presence
    "equalizer=f=7500:t=q:w=2.0:g=-2.0,"  # sibilance
    "acompressor=threshold=-21dB:ratio=2.2:attack=12:release=160:makeup=2,"
    "alimiter=limit=0.89:level=0"  # level=0: cap peaks only; its auto-level would lift them back to full scale
)


def master_wav(wav: bytes) -> bytes:
    """The scene WAV after the mastering chain (same sample rate, mono, 16-bit). Goes through temporary files, not pipes:
    ffmpeg cannot know the length of a piped WAV, so the header would claim an unknown size."""
    import tempfile  # noqa: PLC0415
    from pathlib import Path  # noqa: PLC0415

    from .audio import run_ffmpeg  # noqa: PLC0415 - only needed when mastering is on

    with tempfile.TemporaryDirectory(prefix="studio-master-") as tmp:
        src, dst = Path(tmp) / "in.wav", Path(tmp) / "out.wav"
        src.write_bytes(wav)
        run_ffmpeg(["-y", "-i", str(src), "-af", MASTER_FILTER, "-ac", "1", "-c:a", "pcm_s16le", str(dst)])
        return dst.read_bytes()
