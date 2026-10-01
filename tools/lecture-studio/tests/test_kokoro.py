import hashlib
import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from studio import kokoro_tts as kk
from studio import narrate
from studio.config import Config
from studio.metadata import VOICE_ENGINES
from studio.packs import find_lecture
from studio.plan import build_plan

from tests.fixtures import PACK

RATE = 24000


class FakeSynth:
    """Stands in for the model: a 220 Hz tone, ~0.4 s per word, recording the voice used for every call."""

    sample_rate = RATE

    def __init__(self):
        self.voice = None
        self.calls = []
        self.known = set(kk.ENGLISH_VOICES)

    def use_voice(self, voice):
        if voice not in self.known:
            raise kk.KokoroError(f"unknown Kokoro voice {voice!r}")
        self.voice = voice

    def synthesize(self, text, *, voice_ref=None, seed=0):
        self.calls.append({"text": text, "voice": self.voice})
        n = int(0.4 * len(text.split()) * RATE)
        return [0.3 * math.sin(2 * math.pi * 220 * i / RATE) for i in range(n)]


class KokoroPlanTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def cfg(self, **kw):
        return Config(work_dir=self.root / "work", tts_engine="kokoro", **kw)

    def lecture(self):
        return find_lecture(PACK, "budget-lesson")

    def test_plan_names_the_engine_voice_and_model_and_keys_follow_every_setting(self):
        eleven = build_plan(self.lecture(), Config(work_dir=self.root / "w0"))
        plan = build_plan(self.lecture(), self.cfg())
        self.assertEqual(plan["engine"], "kokoro")
        self.assertEqual(plan["voice"], {"id": "kokoro:af_heart", "name": "Kokoro af_heart", "ref": None})  # marketing
        self.assertTrue(plan["model"].startswith(kk.MODEL_LABEL))
        keys = {s["ttsKey"] for s in plan["scenes"]}
        self.assertEqual(len(keys), len(plan["scenes"]))
        self.assertFalse(keys & {s["ttsKey"] for s in eleven["scenes"]})

        other_voice = build_plan(self.lecture(), self.cfg(kokoro_voices={"marketing": "bm_george"}))
        faster = build_plan(self.lecture(), self.cfg(kokoro_speed=1.1))
        for changed in (other_voice, faster):
            self.assertNotEqual(plan["scenes"][0]["ttsKey"], changed["scenes"][0]["ttsKey"])
        self.assertEqual(other_voice["voice"]["id"], "kokoro:bm_george")

    def test_the_star_voice_covers_other_categories_and_a_missing_one_is_an_error(self):
        cfg = self.cfg(kokoro_voices={"*": "am_adam"})
        self.assertEqual(cfg.kokoro_voice("anything")["id"], "kokoro:am_adam")
        with self.assertRaises(ValueError):
            self.cfg(kokoro_voices={}).kokoro_voice("marketing")
        self.assertEqual(self.cfg().kokoro_voice("sales")["id"], "kokoro:bm_george")
        self.assertEqual(self.cfg().kokoro_voice("ai")["id"], "kokoro:am_michael")

    def test_the_default_voices_are_real_kokoro_voices(self):
        self.assertTrue(set(kk.DEFAULT_VOICES.values()) <= set(kk.ENGLISH_VOICES))


class KokoroNarrateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def cfg(self, **kw):
        return Config(work_dir=self.root / "work", tts_engine="kokoro", **kw)

    def plan(self, cfg):
        return build_plan(find_lecture(PACK, "budget-lesson"), cfg)

    def test_scenes_are_cached_as_wavs_with_the_planned_voice_and_never_regenerated(self):
        cfg = self.cfg()
        plan = self.plan(cfg)
        synth = FakeSynth()
        done = narrate.synthesize_kokoro(cfg, plan, synth=synth, log=lambda _m: None)
        self.assertEqual(len(done), len(plan["scenes"]))
        self.assertEqual({c["voice"] for c in synth.calls}, {"af_heart"})
        calls = len(synth.calls)
        self.assertEqual(narrate.synthesize_kokoro(cfg, plan, synth=synth, log=lambda _m: None), [])
        self.assertEqual(len(synth.calls), calls)
        key = plan["scenes"][0]["ttsKey"]
        meta = json.loads((cfg.audio_cache / f"{key}.json").read_text())
        self.assertEqual((meta["backend"], meta["credits"], meta["voice"]), ("kokoro", 0.0, "kokoro:af_heart"))
        self.assertTrue((cfg.audio_cache / f"{key}.wav").exists())

        from studio.workspace import LectureDir

        result = narrate.collect(cfg, plan, LectureDir(cfg, plan["key"]))
        self.assertEqual(result["credits"], 0)
        self.assertGreater(result["seconds"], 0)

    def test_one_loaded_model_serves_lectures_with_different_voices(self):
        synth = FakeSynth()
        for voices in ({"marketing": "af_heart"}, {"marketing": "bm_george"}):
            cfg = self.cfg(kokoro_voices=voices)
            narrate.synthesize_kokoro(cfg, self.plan(cfg), synth=synth, log=lambda _m: None)
        self.assertEqual([c["voice"] for c in synth.calls if c["voice"] != "af_heart"][:1], ["bm_george"])
        self.assertIn("af_heart", {c["voice"] for c in synth.calls})

    def test_engines_refuse_each_others_plans_and_stale_settings(self):
        cfg = self.cfg()
        plan = self.plan(cfg)
        with self.assertRaises(narrate.NarrationError) as ctx:
            narrate.requests_for_agent(cfg, plan)
        self.assertIn("narrate kokoro", str(ctx.exception))
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_api(cfg, plan, api_key="x", http_post=lambda *a: None)
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_chatterbox(cfg, plan, synth=FakeSynth())
        el_cfg = Config(work_dir=self.root / "el")
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_kokoro(el_cfg, self.plan(el_cfg), synth=FakeSynth())
        with self.assertRaises(narrate.NarrationError):  # settings changed since planning: plan again
            narrate.synthesize_kokoro(self.cfg(kokoro_speed=0.9), plan, synth=FakeSynth())

    def test_an_unknown_voice_is_a_clear_error_before_any_audio(self):
        cfg = self.cfg(kokoro_voices={"*": "nobody"})
        synth = FakeSynth()
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_kokoro(cfg, self.plan(cfg), synth=synth, log=lambda _m: None)
        self.assertEqual(synth.calls, [])

    def test_dry_run_counts_chunks_without_loading_a_model(self):
        cfg = self.cfg()
        plan = self.plan(cfg)
        rows = narrate.synthesize_kokoro(cfg, plan, dry_run=True)
        self.assertEqual(len(rows), len(plan["scenes"]))
        self.assertTrue(all(r["dryRun"] and r["chunks"] >= 1 for r in rows))

    def test_an_implausibly_short_clip_fails_the_scene_instead_of_caching_bad_audio(self):
        class Mute(FakeSynth):
            def synthesize(self, text, **kw):
                return [0.0] * 100  # ~4 ms for a whole sentence

        cfg = self.cfg()
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_kokoro(cfg, self.plan(cfg), synth=Mute(), log=lambda _m: None)
        self.assertFalse(list(cfg.audio_cache.glob("*.wav")) if cfg.audio_cache.exists() else [])


class ModelFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "models"
        self.payload = {"kokoro-v1.0.onnx": b"model-bytes", "voices-v1.0.bin": b"voice-bytes"}
        self.files = {n: hashlib.sha256(b).hexdigest() for n, b in self.payload.items()}

    def tearDown(self):
        self.tmp.cleanup()

    def fetch(self, url, dest):
        self.fetched.append(url)
        Path(dest).write_bytes(self.payload[url.rsplit("/", 1)[1]])

    def test_files_are_downloaded_once_verified_and_reused(self):
        self.fetched = []
        with mock.patch.object(kk, "MODEL_FILES", self.files):
            model, voices = kk.ensure_models(self.dir, log=lambda _m: None, fetch=self.fetch)
            self.assertEqual((model.read_bytes(), voices.read_bytes()), (b"model-bytes", b"voice-bytes"))
            self.assertEqual(len(self.fetched), 2)
            kk.ensure_models(self.dir, log=lambda _m: None, fetch=self.fetch)
            self.assertEqual(len(self.fetched), 2)  # verified files are not fetched again
            model.write_bytes(b"corrupted")
            kk.ensure_models(self.dir, log=lambda _m: None, fetch=self.fetch)
            self.assertEqual(len(self.fetched), 3)  # a damaged file is replaced
            self.assertEqual(model.read_bytes(), b"model-bytes")

    def test_a_download_that_fails_its_hash_is_refused_and_leaves_nothing_behind(self):
        def tampered(url, dest):
            Path(dest).write_bytes(b"something else")

        with mock.patch.object(kk, "MODEL_FILES", self.files):
            with self.assertRaises(kk.KokoroError):
                kk.ensure_models(self.dir, log=lambda _m: None, fetch=tampered)
        self.assertEqual(list(self.dir.glob("*")), [])


class KokoroConfigTests(unittest.TestCase):
    def test_config_file_accepts_the_engine_and_resolves_the_model_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            conf = root / "studio.config.json"
            conf.write_text(json.dumps({"tts_engine": "kokoro", "kokoro_model_dir": "models",
                                        "kokoro_voices": {"*": "am_adam"}, "kokoro_speed": 1.05}))
            cfg = Config.load(conf)
            self.assertEqual(cfg.tts_engine, "kokoro")
            self.assertEqual(cfg.kokoro_models, (root / "models").resolve())
            self.assertEqual(cfg.kokoro_voice("x")["id"], "kokoro:am_adam")
            conf.write_text(json.dumps({"tts_engine": "other"}))
            with self.assertRaises(ValueError):
                Config.load(conf)
        self.assertEqual(Config().kokoro_models, Config().work_dir / "models" / "kokoro")
        self.assertEqual(VOICE_ENGINES["kokoro"], "Kokoro open-source TTS")


if __name__ == "__main__":
    unittest.main()
