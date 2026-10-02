import json
import math
import tempfile
import unittest
import wave
from pathlib import Path

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1]))  # also runnable via discover from the repo root

from studio import chatterbox_tts as cb
from studio import narrate
from studio.config import Config
from studio.metadata import VOICE_ENGINES
from studio.packs import find_lecture
from studio.plan import build_plan

from tests.fixtures import PACK

RATE = 24000


class FakeSynth:
    """Stands in for the model: a 220 Hz tone, ~0.4 s per word (or a scripted length), recording every call."""

    sample_rate = RATE

    def __init__(self, seconds_per_word=0.4, script=None):
        self.seconds_per_word = seconds_per_word
        self.script = list(script or [])
        self.calls = []

    def synthesize(self, text, *, voice_ref, seed):
        self.calls.append({"text": text, "voice_ref": voice_ref, "seed": seed})
        secs = self.script.pop(0) if self.script else self.seconds_per_word * len(text.split())
        n = int(secs * RATE)
        return [0.3 * math.sin(2 * math.pi * 220 * i / RATE) for i in range(n)]


class SplitTests(unittest.TestCase):
    def test_sentences_merge_up_to_the_limit_and_round_trip(self):
        text = "First sentence here. Second one! Third? " + "Fourth sentence is a little longer than the others."
        chunks = cb.split_for_tts(text, 60)
        self.assertTrue(all(len(c) <= 60 for c in chunks))
        self.assertEqual(" ".join(chunks), " ".join(text.split()))
        self.assertEqual(chunks[0], "First sentence here. Second one! Third?")

    def test_long_sentences_split_at_clauses_then_words(self):
        long_sentence = ", ".join(["a clause with several words in it"] * 12) + "."
        chunks = cb.split_for_tts(long_sentence, 80)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(c) <= 80 for c in chunks))
        self.assertEqual(" ".join(chunks), long_sentence)
        no_punct = " ".join(["word"] * 100)
        self.assertTrue(all(len(c) <= 50 for c in cb.split_for_tts(no_punct, 50)))
        self.assertEqual(cb.split_for_tts("   ", 100), [])
        with self.assertRaises(ValueError):
            cb.split_for_tts("x", 10)

    def test_plausibility_bounds(self):
        self.assertTrue(cb.plausible(4.0, "ten words " * 5))
        self.assertFalse(cb.plausible(40.0, "only three words"))  # hallucinated continuation
        self.assertFalse(cb.plausible(0.2, "a cut off sentence here"))
        self.assertTrue(cb.plausible(0.5, "Yes."))

    def test_model_label(self):
        self.assertEqual(cb.model_label("v3"), "chatterbox-multilingual-v3")
        with self.assertRaises(cb.ChatterboxError):
            cb.model_label("v9")


class SceneTests(unittest.TestCase):
    def test_scene_is_one_wav_with_pauses_and_seeded_chunks(self):
        settings = cb.Settings(chunk_chars=60, pause_seconds=0.2)
        synth = FakeSynth()
        text = "One two three four five. Six seven eight nine ten. Eleven twelve thirteen fourteen fifteen sixteen."
        audio, info = cb.synthesize_scene(synth, text, key="k1", voice_ref=None, settings=settings)
        chunks = cb.split_for_tts(text, 60)
        self.assertEqual(len(synth.calls), len(chunks))
        with wave.open(_bytes_io(audio)) as w:
            self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate()), (1, 2, RATE))
            seconds = w.getnframes() / RATE
        expected = sum(0.4 * len(c.split()) for c in chunks) + 0.2 * (len(chunks) - 1)
        self.assertAlmostEqual(seconds, expected, delta=0.01)
        # Same key → same seeds (reproducible reruns); another key → other seeds.
        again = FakeSynth()
        cb.synthesize_scene(again, text, key="k1", voice_ref=None, settings=settings)
        self.assertEqual([c["seed"] for c in synth.calls], [c["seed"] for c in again.calls])
        other = FakeSynth()
        cb.synthesize_scene(other, text, key="k2", voice_ref=None, settings=settings)
        self.assertNotEqual([c["seed"] for c in synth.calls], [c["seed"] for c in other.calls])
        self.assertEqual(info["chunks"][0]["attempts"], 1)

    def test_an_implausible_chunk_is_regenerated_once_then_fails(self):
        settings = cb.Settings(chunk_chars=300)
        text = "A short sentence with seven words."
        retry = FakeSynth(script=[30.0, 2.8])
        _, info = cb.synthesize_scene(retry, text, key="k", voice_ref=None, settings=settings)
        self.assertEqual(info["chunks"][0]["attempts"], 2)
        self.assertNotEqual(retry.calls[0]["seed"], retry.calls[1]["seed"])
        with self.assertRaises(cb.ChatterboxError):
            cb.synthesize_scene(FakeSynth(script=[30.0, 31.0]), text, key="k", voice_ref=None, settings=settings)


class StudioIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def cfg(self, **kw):
        return Config(work_dir=self.root / "work", tts_engine="chatterbox", **kw)

    def test_plan_keys_depend_on_engine_voice_recording_and_settings(self):
        ref = build_plan(find_lecture(PACK, "budget-lesson"), Config(work_dir=self.root / "w0"))
        default = build_plan(find_lecture(PACK, "budget-lesson"), self.cfg())
        self.assertEqual(default["engine"], "chatterbox")
        self.assertEqual(default["voice"]["id"], "chatterbox:default")
        self.assertEqual(default["model"].split(";")[0], "chatterbox-multilingual-v3")
        self.assertNotEqual(ref["scenes"][0]["ttsKey"], default["scenes"][0]["ttsKey"])

        rec = self.root / "narrator.wav"
        _write_wav(rec, 1.0)
        voiced = build_plan(find_lecture(PACK, "budget-lesson"), self.cfg(chatterbox_voices={"marketing": str(rec)}))
        self.assertTrue(voiced["voice"]["id"].startswith("chatterbox:"))
        self.assertEqual(voiced["voice"]["ref"], str(rec))
        _write_wav(rec, 2.0)  # a new recording is a new voice
        revoiced = build_plan(find_lecture(PACK, "budget-lesson"), self.cfg(chatterbox_voices={"marketing": str(rec)}))
        self.assertNotEqual(voiced["voice"]["id"], revoiced["voice"]["id"])
        tuned = build_plan(find_lecture(PACK, "budget-lesson"), self.cfg(chatterbox_exaggeration=0.7))
        self.assertNotEqual(default["scenes"][0]["ttsKey"], tuned["scenes"][0]["ttsKey"])
        with self.assertRaises(FileNotFoundError):
            build_plan(find_lecture(PACK, "budget-lesson"), self.cfg(chatterbox_voices={"*": str(self.root / "nope.wav")}))

    def test_narrate_caches_wavs_collects_and_never_regenerates(self):
        cfg = self.cfg()
        plan = build_plan(find_lecture(PACK, "budget-lesson"), cfg)
        synth = FakeSynth()
        done = narrate.synthesize_chatterbox(cfg, plan, synth=synth, log=lambda _m: None)
        self.assertEqual(len(done), len(plan["scenes"]))
        first_calls = len(synth.calls)
        self.assertEqual(narrate.synthesize_chatterbox(cfg, plan, synth=synth, log=lambda _m: None), [])
        self.assertEqual(len(synth.calls), first_calls)
        meta = json.loads((cfg.audio_cache / f"{plan['scenes'][0]['ttsKey']}.json").read_text())
        self.assertEqual((meta["backend"], meta["credits"]), ("chatterbox", 0.0))
        self.assertTrue((cfg.audio_cache / f"{plan['scenes'][0]['ttsKey']}.wav").exists())
        from studio.workspace import LectureDir

        result = narrate.collect(cfg, plan, LectureDir(cfg, plan["key"]))
        self.assertEqual(result["credits"], 0)
        self.assertGreater(result["seconds"], 0)

    def test_engines_refuse_each_others_plans(self):
        cb_plan = build_plan(find_lecture(PACK, "budget-lesson"), self.cfg())
        with self.assertRaises(narrate.NarrationError):
            narrate.requests_for_agent(self.cfg(), cb_plan)
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_api(self.cfg(), cb_plan, api_key="x", http_post=lambda *a: None)
        el_cfg = Config(work_dir=self.root / "el")
        el_plan = build_plan(find_lecture(PACK, "budget-lesson"), el_cfg)
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_chatterbox(el_cfg, el_plan, synth=FakeSynth())
        # Settings changed after planning: plan again rather than mix audio.
        with self.assertRaises(narrate.NarrationError):
            narrate.synthesize_chatterbox(self.cfg(chatterbox_cfg_weight=0.3), cb_plan, synth=FakeSynth())

    def test_dry_run_counts_chunks_without_a_model(self):
        cfg = self.cfg()
        plan = build_plan(find_lecture(PACK, "budget-lesson"), cfg)
        rows = narrate.synthesize_chatterbox(cfg, plan, dry_run=True)
        self.assertEqual(len(rows), len(plan["scenes"]))
        self.assertTrue(all(r["dryRun"] and r["chunks"] >= 1 for r in rows))

    def test_config_file_resolves_voice_paths_and_rejects_unknown_engines(self):
        (self.root / "voices").mkdir()
        _write_wav(self.root / "voices" / "host.wav", 1.0)
        conf = self.root / "studio.config.json"
        conf.write_text(json.dumps({"tts_engine": "chatterbox", "chatterbox_voices": {"Marketing": "voices/host.wav"}}))
        cfg = Config.load(conf)
        self.assertEqual(cfg.chatterbox_voices["marketing"], str((self.root / "voices" / "host.wav").resolve()))
        conf.write_text(json.dumps({"tts_engine": "other"}))
        with self.assertRaises(ValueError):
            Config.load(conf)
        self.assertEqual(VOICE_ENGINES["chatterbox"], "Chatterbox by Resemble AI")


def _bytes_io(b):
    import io

    return io.BytesIO(b)


def _write_wav(path: Path, seconds: float):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"\x01\x00" * int(seconds * RATE))


if __name__ == "__main__":
    unittest.main()
