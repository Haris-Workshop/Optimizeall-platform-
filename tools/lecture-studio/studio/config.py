"""Configuration: defaults, optional JSON override file and environment variables.

Nothing secret lives here. YouTube OAuth credentials are read from the environment only (see youtube.py).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = TOOL_DIR.parent.parent

# Voice per course category (owner decision, 2026-09). voice_ids come from creative_list_voices.
VOICE_JACOB = "SO9JediIwzugrikv7xw0"
VOICE_VANESSA = "9BYUod15YOH2aePSd97v"
VOICE_DANIEL = "ynTHHllfDmGsZ3G8QJt9"
DEFAULT_VOICES = {
    "ai": VOICE_JACOB,
    "data": VOICE_JACOB,
    "platform": VOICE_JACOB,
    "marketing": VOICE_VANESSA,
    "seo": VOICE_VANESSA,
    "design": VOICE_VANESSA,
    "sales": VOICE_DANIEL,
    "business": VOICE_DANIEL,
}
VOICE_NAMES = {VOICE_JACOB: "Jacob L.", VOICE_VANESSA: "Vanessa", VOICE_DANIEL: "Daniel"}


def _kokoro_default_voices() -> dict:
    from .kokoro_tts import DEFAULT_VOICES as kokoro_voices  # light: no model libraries are imported here

    return kokoro_voices


def _default_catalog() -> Path:
    env = os.environ.get("LECTURE_STUDIO_CATALOG")
    if env:
        return Path(env)
    return REPO_ROOT / "backend/src/OptimizeAll.Api/Modules/Learning/Catalog"


def _default_work() -> Path:
    return Path(os.environ.get("LECTURE_STUDIO_WORK", str(TOOL_DIR / ".work")))


def _default_node_modules() -> Path:
    env = os.environ.get("LECTURE_STUDIO_NODE_MODULES")
    if env:
        return Path(env)
    return REPO_ROOT / "frontend/node_modules"


@dataclass
class Config:
    catalog_dir: Path = field(default_factory=_default_catalog)
    work_dir: Path = field(default_factory=_default_work)
    node_modules: Path = field(default_factory=_default_node_modules)
    site_base_url: str = "https://www.optimizeall.com"
    model_id: str = "eleven_multilingual_v2"
    voices: dict = field(default_factory=lambda: dict(DEFAULT_VOICES))
    fallback_voice: str = VOICE_JACOB
    width: int = 1920
    height: int = 1080
    fps: int = 30
    lead_in: float = 0.45  # seconds of picture before the narration starts in each scene
    tail: float = 0.75  # seconds after the narration ends (breathing room + exit animation)
    intro_seconds: float = 3.0
    outro_seconds: float = 6.0
    loudness_lufs: float = -16.0
    true_peak: float = -1.5
    render_workers: int = 3
    max_output_bytes: int = 3 * 1024**3  # keep local outputs under 3 GB
    youtube_privacy: str = "unlisted"
    youtube_category_id: str = "27"  # Education
    youtube_language: str = "en"
    # Narration engine: "elevenlabs" (MCP flow or REST API), "chatterbox" (Chatterbox Multilingual, local GPU model) or
    # "kokoro" (Kokoro-82M, free, runs on a plain CPU).
    tts_engine: str = field(default_factory=lambda: os.environ.get("LECTURE_STUDIO_TTS_ENGINE", "elevenlabs"))
    chatterbox_model: str = "v3"
    chatterbox_language: str = "en"
    chatterbox_device: str = "auto"  # auto = cuda, then mps, then cpu
    chatterbox_exaggeration: float = 0.5
    chatterbox_cfg_weight: float = 0.5
    chatterbox_temperature: float = 0.8
    chatterbox_chunk_chars: int = 280
    chatterbox_pause_seconds: float = 0.2
    # Reference recording per course category (a clean 10-30 s WAV of a voice you have the rights to). Categories
    # without one use the model's built-in default voice.
    chatterbox_voices: dict = field(default_factory=dict)
    kokoro_language: str = "en-us"
    kokoro_speed: float = 1.0
    kokoro_chunk_chars: int = 280
    kokoro_pause_seconds: float = 0.2
    kokoro_style: str = "expressive"  # expressive | plain (see delivery.py)
    kokoro_master: bool = True  # light mastering of every scene
    kokoro_model_dir: Path | None = None  # default: <work_dir>/models/kokoro (the ~350 MB model files download there)
    # Built-in Kokoro voice per course category ("*" = any other); see kokoro_tts.ENGLISH_VOICES.
    kokoro_voices: dict = field(default_factory=lambda: dict(_kokoro_default_voices()))

    @property
    def cache_dir(self) -> Path:
        return self.work_dir / "cache"

    @property
    def audio_cache(self) -> Path:
        return self.cache_dir / "tts"

    def voice_for(self, category: str | None) -> str:
        return self.voices.get((category or "").lower(), self.fallback_voice)

    def chatterbox_settings(self):
        from .chatterbox_tts import Settings

        return Settings(model=self.chatterbox_model, language=self.chatterbox_language, device=self.chatterbox_device,
                        exaggeration=float(self.chatterbox_exaggeration), cfg_weight=float(self.chatterbox_cfg_weight),
                        temperature=float(self.chatterbox_temperature), chunk_chars=int(self.chatterbox_chunk_chars),
                        pause_seconds=float(self.chatterbox_pause_seconds))

    def chatterbox_voice(self, category: str | None) -> dict:
        """{id, name, ref} for a category: the id hashes the reference recording, so a new recording never reuses audio
        cached for the old one."""
        from .chatterbox_tts import file_sha

        ref = self.chatterbox_voices.get((category or "").lower()) or self.chatterbox_voices.get("*")
        if not ref:
            return {"id": "chatterbox:default", "name": "Chatterbox default voice", "ref": None}
        path = Path(ref)
        if not path.is_file():
            raise FileNotFoundError(f"Chatterbox reference voice not found: {path}")
        return {"id": f"chatterbox:{file_sha(path)[:16]}", "name": path.stem, "ref": str(path)}

    def kokoro_settings(self):
        from .kokoro_tts import Settings

        return Settings(language=self.kokoro_language, speed=float(self.kokoro_speed),
                        chunk_chars=int(self.kokoro_chunk_chars), pause_seconds=float(self.kokoro_pause_seconds),
                        style=self.kokoro_style, master=bool(self.kokoro_master))

    @property
    def kokoro_models(self) -> Path:
        return self.kokoro_model_dir or self.work_dir / "models" / "kokoro"

    def kokoro_voice(self, category: str | None) -> dict:
        """{id, name, ref} for a category; the voice name is part of the id, so changing it never reuses cached audio."""
        voice = self.kokoro_voices.get((category or "").lower()) or self.kokoro_voices.get("*")
        if not voice:
            raise ValueError(f"no Kokoro voice configured for category {category!r} (and no '*' fallback)")
        return {"id": f"kokoro:{voice}", "name": f"Kokoro {voice}", "ref": None}

    def lesson_url(self, course: str, lesson: str) -> str:
        return f"{self.site_base_url.rstrip('/')}/learn/{course}/{lesson}"

    @classmethod
    def load(cls, path: str | os.PathLike | None = None) -> "Config":
        cfg = cls()
        p = Path(path) if path else TOOL_DIR / "studio.config.json"
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            for key, value in data.items():
                if key.startswith("_"):
                    continue
                if not hasattr(cfg, key):
                    raise ValueError(f"unknown config key {key!r} in {p}")
                if key in ("catalog_dir", "work_dir", "node_modules", "kokoro_model_dir"):
                    value = (p.parent / value).resolve() if not os.path.isabs(value) else Path(value)
                if key == "chatterbox_voices":
                    value = {k.lower(): str((p.parent / v).resolve()) if not os.path.isabs(v) else v for k, v in value.items()}
                setattr(cfg, key, value)
        if os.environ.get("LECTURE_STUDIO_SITE"):
            cfg.site_base_url = os.environ["LECTURE_STUDIO_SITE"]
        if os.environ.get("LECTURE_STUDIO_TTS_ENGINE"):
            cfg.tts_engine = os.environ["LECTURE_STUDIO_TTS_ENGINE"]
        if cfg.tts_engine not in ("elevenlabs", "chatterbox", "kokoro"):
            raise ValueError(f"tts_engine must be 'elevenlabs', 'chatterbox' or 'kokoro', not {cfg.tts_engine!r}")
        if os.environ.get("LECTURE_STUDIO_WORK"):
            cfg.work_dir = Path(os.environ["LECTURE_STUDIO_WORK"])
        return cfg
