import hashlib
import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from studio import delivery
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

    def synthesize(self, text, *, voice_ref=None, seed=0, speed=None, sentence_pause=None, clause_pause=None):
        self.calls.append({"text": text, "voice": self.voice, "speed": speed})
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


class DeliveryTests(unittest.TestCase):
    TEXT = "Have you ever wondered why? Short one. This is a normal statement of average length for narration. Look out!"

    def test_each_sentence_is_shaped_by_what_it_is(self):
        segs = {s.text: s for s in delivery.plan_segments(self.TEXT, delivery.profile_for("case"), key="k")}
        question, short, statement, shout = (segs["Have you ever wondered why?"], segs["Short one."],
                                             segs["This is a normal statement of average length for narration."], segs["Look out!"])
        self.assertEqual((question.kind, short.kind, statement.kind, shout.kind), ("question", "short", "statement", "exclaim"))
        self.assertGreater(question.pause_after, statement.pause_after)  # a beat to think after a question
        self.assertGreater(short.pause_after, statement.pause_after)  # room after a punchy line
        self.assertLess(short.speed, statement.speed)
        self.assertEqual(shout.pause_after, 0.0)  # the last sentence has no trailing pause (the scene tail handles it)

    def test_the_plan_is_repeatable_and_varies_with_the_key_and_template(self):
        a = delivery.plan_segments(self.TEXT, delivery.profile_for("recap"), key="k1")
        self.assertEqual(a, delivery.plan_segments(self.TEXT, delivery.profile_for("recap"), key="k1"))
        self.assertNotEqual([s.speed for s in a], [s.speed for s in delivery.plan_segments(self.TEXT, delivery.profile_for("recap"), key="k2")])
        self.assertNotEqual([s.pause_after for s in a], [s.pause_after for s in delivery.plan_segments(self.TEXT, delivery.profile_for("case"), key="k1")])
        self.assertEqual(delivery.profile_for("nonsense"), delivery.profile_for(None))

    def test_speeds_stay_inside_the_safe_range_and_long_sentences_split_at_clauses(self):
        long_sentence = ", ".join(["a clause with several words in it"] * 20) + "."
        segs = delivery.plan_segments(long_sentence, delivery.profile_for("case", 1.4), key="k", max_chars=120)
        self.assertGreater(len(segs), 1)
        self.assertTrue(all(delivery.MIN_SPEED <= s.speed <= delivery.MAX_SPEED for s in segs))
        self.assertTrue(all(len(s.text) <= 120 for s in segs))
        self.assertEqual(delivery.plan_segments("   ", delivery.DEFAULT_PROFILE, key="k"), [])

    def test_voice_blends_parse_and_normalise(self):
        self.assertEqual(kk.parse_voice("af_heart"), [("af_heart", 1.0)])
        blend = kk.parse_voice("af_heart:0.7+af_bella:0.3")
        self.assertEqual([n for n, _ in blend], ["af_heart", "af_bella"])
        self.assertAlmostEqual(sum(w for _, w in blend), 1.0)
        self.assertAlmostEqual(kk.parse_voice("a:2+b:2")[0][1], 0.5)
        for bad in ("", "a:0", "a:x", "a:-1"):
            with self.assertRaises(kk.KokoroError):
                kk.parse_voice(bad)

    def test_the_mastering_chain_produces_a_valid_wav(self):
        import io
        import wave

        raw = io.BytesIO()
        with wave.open(raw, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(b"".join(int(8000 * math.sin(2 * math.pi * 220 * i / RATE)).to_bytes(2, "little", signed=True)
                                   for i in range(RATE)))
        try:
            mastered = delivery.master_wav(raw.getvalue())
        except RuntimeError as exc:
            if "ffmpeg not found" in str(exc):
                self.skipTest("ffmpeg is not available")
            raise
        with wave.open(io.BytesIO(mastered)) as w:
            self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate()), (1, 2, RATE))
            self.assertAlmostEqual(w.getnframes() / RATE, 1.0, delta=0.05)


    def test_mastering_never_pushes_peaks_to_full_scale(self):
        import array
        import io
        import wave

        raw = io.BytesIO()
        with wave.open(raw, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            # Speech-like: a quiet voiced tone with loud transients every half second. (A steady sine does not trigger the
            # limiter's auto-level, which lifted real speech to full scale before level=0 was set.)
            samples = array.array("h", (
                int((3500 + (24500 if i % (RATE // 2) < 600 else 0)) * math.sin(2 * math.pi * (140 + 60 * math.sin(i / RATE * 3)) * i / RATE))
                for i in range(RATE * 3)))
            w.writeframes(samples.tobytes())
        try:
            mastered = delivery.master_wav(raw.getvalue())
        except RuntimeError as exc:
            if "ffmpeg not found" in str(exc):
                self.skipTest("ffmpeg is not available")
            raise
        with wave.open(io.BytesIO(mastered)) as w:
            out = array.array("h")
            out.frombytes(w.readframes(w.getnframes()))
        self.assertLess(max(abs(x) for x in out), int(0.95 * 32767))


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

    def test_expressive_style_varies_pace_per_sentence_and_is_part_of_the_cache_key(self):
        cfg = self.cfg(kokoro_master=False)
        plan = self.plan(cfg)
        self.assertIn("style=expressive", plan["model"])
        synth = FakeSynth()
        narrate.synthesize_kokoro(cfg, plan, synth=synth, log=lambda _m: None)
        self.assertGreater(len({c["speed"] for c in synth.calls}), 3)
        plain = self.plan(self.cfg(kokoro_style="plain", kokoro_master=False))
        self.assertIn("style=plain", plain["model"])
        self.assertNotEqual(plan["scenes"][0]["ttsKey"], plain["scenes"][0]["ttsKey"])
        self.assertNotEqual(plan["scenes"][0]["ttsKey"], self.plan(self.cfg(kokoro_master=True))["scenes"][0]["ttsKey"])
        meta = json.loads((cfg.audio_cache / f"{plan['scenes'][0]['ttsKey']}.json").read_text())
        self.assertTrue(all("speed" in c and "kind" in c for c in meta["chunks"]))

    def test_plain_style_still_narrates_with_one_speed(self):
        cfg = self.cfg(kokoro_style="plain", kokoro_master=False)
        synth = FakeSynth()
        narrate.synthesize_kokoro(cfg, self.plan(cfg), synth=synth, log=lambda _m: None)
        self.assertTrue(synth.calls)
        self.assertEqual({c["speed"] for c in synth.calls}, {None})

    def test_mastering_runs_on_every_scene_when_enabled(self):
        cfg = self.cfg(kokoro_master=True)
        with mock.patch.object(delivery, "master_wav", side_effect=lambda wav: wav) as master:
            narrate.synthesize_kokoro(cfg, self.plan(cfg), synth=FakeSynth(), log=lambda _m: None)
        self.assertEqual(master.call_count, len(self.plan(cfg)["scenes"]))

    def test_an_unknown_style_is_refused(self):
        with self.assertRaises(kk.KokoroError):
            self.cfg(kokoro_style="dramatic").kokoro_settings().signature()

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
