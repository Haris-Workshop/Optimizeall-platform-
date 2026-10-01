# Optimize All Lecture Studio

Turns course-pack v2 lecture scripts (`lesson.lecture.scenes[]`) into premium, branded video lectures:
ElevenLabs narration + deterministic motion-graphics slides rendered locally (no AI-video credits, no avatars),
assembled into a YouTube-ready package.

```
course pack JSON ──plan──▶ plan.json ──narrate──▶ cached TTS clips ──render──▶ scene segments ──assemble──▶ video.mp4
                                                  (sha256 keyed)      (Playwright,               poster.png (1280×720)
                                                                        frame-accurate)          captions.vtt
                                                                                                 youtube.json
                                                                        ──upload──▶ YouTube + lecture-src-patch.json
```

Output per lecture: 1920×1080, 30 fps, H.264 High (yuv420p, BT.709) + AAC 48 kHz stereo 192 kb/s, integrated
loudness −16 LUFS (two-pass EBU R128, linear gain), 3 s intro sting, outro card ("Continue at optimizeall.com /
next lesson"), amber progress bar, chapter lower-thirds, sidecar WebVTT captions, YouTube chapters in the description.

## Requirements

* Python 3.11+ (stdlib + `requests`; `imageio-ffmpeg` provides ffmpeg, or set `FFMPEG=/path/to/ffmpeg`)
* Node 20+ and Chromium for Playwright (this box: `/opt/pw-browsers`, picked up automatically)
* `npm ci` in this folder (Playwright 1.56.1 + Inter, Inter Tight, JetBrains Mono from Fontsource; git-ignored)

Tests: `python3 -m unittest discover -s tests -t .` (plan rules, caption/sentence timing, metadata, YouTube request
building with a fake HTTP layer, narration cache/ingest — no network, no credits).

## Commands (run from `tools/lecture-studio`)

| Command | What it does |
|---|---|
| `python3 -m studio plan <course>/<lesson> --summary` | Deterministic render plan: template per scene, chapter titles, TTS text (pronunciations applied), cache keys. |
| `python3 -m studio render <key> --preview` | **Free design preview**: review stills from estimated timings, before any TTS spend. |
| `python3 -m studio narrate requests <key>` | JSON list of scenes that still need audio (text to send, voice, model, character count). |
| `python3 -m studio narrate chatterbox <key>` | Narrates every uncached scene locally with Chatterbox Multilingual v3 (needs `tts_engine: "chatterbox"`; see below). |
| `python3 -m studio narrate kokoro <key>` | Narrates every uncached scene on the CPU with Kokoro-82M (needs `tts_engine: "kokoro"`; free, see below). |
| `python3 -m studio narrate ingest <key> --scene s03 --url <signed url> --credits 482.95` | Downloads one generated clip (only `https://storage.googleapis.com`) into the cache. `ingest-batch --file f.json` does many. |
| `python3 -m studio narrate api <key>` | Unattended alternative: ElevenLabs REST (`ELEVENLABS_API_KEY`), with character timestamps. |
| `python3 -m studio narrate collect <key>` / `ledger` | Durations + credits per lecture / totals across the cache. |
| `python3 -m studio render <key> [--stills] [--only s02,s05] [--burn-captions]` | Renders `intro`, every scene and `outro` into segments (reused when unchanged). |
| `python3 -m studio assemble <key> [--out DIR]` | Final MP4, poster, VTT, `youtube.json`, `report.json`. |
| `python3 -m studio upload <dir> [--dry-run]` | YouTube upload of an assembled lecture (see below). |
| `python3 -m studio run <keys or course slugs> [--all-v2] [--upload --stream] [--dry-run] [--narrate-backend api]` | Resumable batch orchestrator. |

Config: defaults in `studio/config.py`; override with `studio.config.json` (see `studio.config.example.json`) or
`LECTURE_STUDIO_CATALOG`, `LECTURE_STUDIO_WORK`, `LECTURE_STUDIO_SITE`. The work dir (`.work/` by default) holds the
TTS cache, per-lecture plans/timelines/segments/outputs, `run-state.json`, `run.log.jsonl`, the YouTube ledger
and `lecture-src-patch.json`. Nothing in it is committed.

## Production workflow

1. **Validate the pack**: `check_pack_v2.py <pack>` must print OK.
2. **Plan + preview (free)**: `plan --summary`, then `render --preview` and look at `preview/*.png`. Fix script
   issues (e.g. bullet lengths, pronunciations) in the pack, not in the studio.
3. **Narrate** — one ElevenLabs flow per lecture, `generations_count = 1`, model `eleven_multilingual_v2`,
   voice by category (ai/data/platform → Jacob L. `SO9JediIwzugrikv7xw0`; marketing/seo/design → Vanessa
   `9BYUod15YOH2aePSd97v`; sales/business → Daniel `ynTHHllfDmGsZ3G8QJt9`):
   * agent-driven (MCP): `narrate requests <key>` → for the first scene call `creative_generate_speech` with
     `estimate_only: true` and check the price; then one call per scene with the exact `text` → poll
     `creative_get_flow_run_status` (never re-call generate to "retry": each call is charged) → put each
     `media[].url` + `price.credits` into a batch file → `narrate ingest-batch <key> --file batch.json` →
     delete the batch file (signed URLs expire after 2 h anyway).
   * unattended: `narrate api <key>` with `ELEVENLABS_API_KEY` (same cache keys; also stores alignment).
   The cache key is `sha256(voice + model + exact TTS text)`: editing one scene re-narrates only that scene.
4. **Render + assemble**: `render <key> --stills && assemble <key> --out <dir>` (or `run <key>`).
5. **Review**: watch the MP4 (or the stills), check `report.json` (loudness, duration, cue count).
6. **Publish**: `upload <out dir>` → then hand `lecture-src-patch.json` (`lecture.src` = watch URL,
   `publishedAt`) to the catalog owner; the studio never edits course JSON.

### Batch/streaming mode

`run --all-v2 --upload --stream` processes lectures one at a time: skips lectures whose narration fingerprint and
stage are already done (`run-state.json`), stops when rendered outputs exceed `max_output_bytes` (3 GB), deletes
segments after assembly and the MP4 after a successful upload. `--dry-run` lists what would be narrated/rendered and
the characters (≈ credits) still to buy. With `--narrate-backend cache-only` (default) lectures without cached audio
are reported as `needs-narration` instead of spending anything.

## How the visuals are made

* `plan.py` chooses one of nine templates per scene with ordered, deterministic rules on `onScreen` + `visual`:
  `title` (scene 1), `recap` (last scene / "Recap"), `code` (visual asks for code/terminal/editor and a lesson
  code block matches the scene's words; each block used once), `keyidea` ("The principle"), `case`
  ("Example…", "Case:"), `bullets` with a pitfalls variant + "Try this now" card ("Mistakes…"), `flow`
  (arrow chains or loop/pipeline visuals: chain, loop or converge layouts), `chart` (curves: saturating
  response curves with tangent / annotated parameters, labelled *Illustrative*), `compare` ("A vs B", "Label: text"
  pairs), otherwise `bullets` (3 cards, 2×2 grid or list).
* `timeline.py` finds sentence boundaries inside each clip (character-proportional estimate snapped to real pauses
  from `silencedetect`, or exact ElevenLabs alignment when available). Bullets, nodes, chart annotations, the
  recap's next-step card and the code-highlight walkthrough are revealed when the narration reaches the words they
  match. Scene length = lead-in 0.45 s + audio + 0.75 s tail, rounded up to whole frames; audio is placed
  sample-exactly (1600 samples per frame at 48 kHz), so picture and sound cannot drift.
* `renderer/stage.js` is a small deterministic animation engine (no GSAP, no wall clock): `__seek(t)` applies
  the exact state for a frame and returns a state key; `render.mjs` screenshots only frames whose key changed (via
  CDP) and pipes JPEGs into ffmpeg. Brand: navy `#1F2659`, amber `#FCB31E`, ink `#1D174C`, Inter / Inter Tight /
  JetBrains Mono, the two-ring logo reproduced from `frontend/src/components/brand/Logo.tsx`.
* Captions: sidecar WebVTT (≤ 84 chars per cue, two balanced lines), timed from the same sentence timings.
  `--burn-captions` draws them into the picture instead (off by default: YouTube shows the sidecar track).

## Narration with Chatterbox Multilingual v3 (local, no per-character cost)

[Chatterbox Multilingual v3](https://huggingface.co/ResembleAI/chatterbox) (Resemble AI, MIT licence, released June
2026) is a 0.5B open-source TTS model with zero-shot voice cloning in 23 languages. The studio can use it instead of
ElevenLabs. Narration is then free per character, and every clip carries Resemble's built-in PerTh watermark.

**Setup** (once, on the machine that renders; a CUDA GPU is strongly recommended, because CPU is far slower than real time):

```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124   # match your CUDA; see pytorch.org
pip install -r requirements-chatterbox.txt
export HF_HOME=/big/disk/hf        # the v3 weights (~3.3 GB) download here on first use
```

**Configure** `studio.config.json`:

```json
{
  "tts_engine": "chatterbox",
  "chatterbox_model": "v3",
  "chatterbox_voices": { "ai": "voices/tech-narrator.wav", "marketing": "voices/marketing-narrator.wav",
                         "sales": "voices/business-narrator.wav", "*": "voices/tech-narrator.wav" }
}
```

You can also set the engine with `--engine chatterbox` or `LECTURE_STUDIO_TTS_ENGINE=chatterbox`.

**Reference voices:**
- Each reference voice is a clean 10–30 s mono WAV of one speaker, with no music.
- Only use a voice you have the rights to: your own, a contracted voice actor, or a licensed stock voice.
- Do not clone a person without consent.
- Do not use another TTS vendor's voices as references unless its terms allow it.
- A category without a recording uses the model's built-in default voice.

**Tuning** (defaults follow the model card):
- `chatterbox_exaggeration` is 0.5.
- `chatterbox_cfg_weight` is 0.5. Lower it to about 0.3 for a fast reference speaker.
- `chatterbox_chunk_chars` is 280.
- `chatterbox_pause_seconds` is 0.2.

**Run:**
- `python3 -m studio narrate chatterbox <course>/<lesson>` narrates one lecture.
- `--dry-run` lists the scenes and chunks without loading the model.
- `python3 -m studio run --all-v2 --stream` loads the model once for the whole batch.

**How it works:**
- One generation is capped at about 40 s of speech, so each scene is split into sentence chunks of at most 280 characters.
- Each chunk is generated with a seed derived from the cache key, so reruns are reproducible.
- Chunks are joined with a 0.2 s pause and stored as one WAV in the same content-addressed cache.
- A chunk whose length is implausible for its words (a hallucinated continuation or a cut-off) is regenerated once with another seed; if it is still implausible, the scene fails rather than caching bad audio.
- Cache keys include the engine, model, settings and a hash of the reference recording. Changing any of them re-narrates, and ElevenLabs audio is never mixed in.
- If the settings or the recording change between `plan` and `narrate`, the studio refuses to run and asks you to plan again.
- YouTube descriptions name the engine ("Narration uses an AI voice (Chatterbox by Resemble AI)").

**Quality:** listen to the first lecture of each voice before batch runs. Chatterbox does not return character timings, so
sentence timing falls back to silence detection, the same as the ElevenLabs MCP flow.

## Narration with Kokoro (free, runs on a plain CPU)

[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) is a small open-source TTS model. It runs faster than
real time on an ordinary CPU through ONNX Runtime, so a laptop or a cloud VM without a GPU can narrate the whole catalogue
at no per-character cost. It has 28 built-in English voices and **no voice cloning**; its sound is clearly good for a free
model but more synthetic than ElevenLabs or Chatterbox.

**Setup** (once): `pip install -r requirements-kokoro.txt`. The ~350 MB model files download on first use into
`<work_dir>/models/kokoro` (override with `kokoro_model_dir`) and are checked against pinned SHA-256 hashes.

**Configure** `studio.config.json` (or `--engine kokoro` / `LECTURE_STUDIO_TTS_ENGINE=kokoro`):

```json
{ "tts_engine": "kokoro", "kokoro_voices": { "sales": "bm_george", "*": "am_michael" } }
```

Default voices by category: `ai`, `data`, `platform` → `am_michael` (US male); `marketing`, `seo`, `design` → `af_heart`
(US female); `sales`, `business` → `bm_george` (British male). Any of the voices in `kokoro_tts.ENGLISH_VOICES` works.

**Tuning:** `kokoro_speed` is 1.0, `kokoro_language` is `en-us` (`en-gb` for British), `kokoro_chunk_chars` is 280 and
`kokoro_pause_seconds` is 0.2.

**Run:** `python3 -m studio narrate kokoro <course>/<lesson>` (`--dry-run` lists the chunks without loading the model), or
`run --all-v2 --stream`, which loads the model once for the whole batch. Scenes are chunked at sentence boundaries, every
chunk's length is checked against its words, and the WAVs go into the same content-addressed cache; the voice, speed and
language are part of the cache key. YouTube descriptions say "Narration uses an AI voice (Kokoro open-source TTS)".

**Measured** on a 4-core container: a 7.8-minute lecture (12 scenes, 6,939 characters) narrated in 2 min 43 s, about 2.9× real time.

**Troubleshooting:** if phonemizing fails with `Error processing file '.../espeak-ng-data/phontab'`, the bundled espeak
library is looking for its data in its build directory. Link that path to the installed `espeakng_loader/espeak-ng-data`
folder (the exact path is in the error message).

## Costs and throughput (measured in the pilot, 2026-09-25)

* **Narration**: ElevenLabs `eleven_multilingual_v2` charged exactly **1 credit per character** of TTS text
  (MCP `price.credits`), quoted at **≈ $0.18 per 1,000 credits** on this workspace's plan (MCP `price_cents`).
  * Pilot lecture A (agentic coding, 9 scenes, 3,648 chars, 3 min 53 s of speech): **3,647.6 credits** (≈ $0.66).
  * Pilot lecture B (performance marketing, 12 scenes, 5,608 chars, 6 min 23 s of speech): **5,607.4 credits** (≈ $1.02).
  * Pilot total **9,255 credits** (+ one free estimate). Transcription was not used: pause-snapped timing is free
    and adequate; `creative_transcribe_audio` would add cost per audio minute for little gain.
  * Catalogue projection (2026-09-25 snapshot: 29 v2 packs, 491 lectures, 3.32 M TTS characters, avg 6,754 per
    lecture): **≈ 3.32 M credits ≈ $600** at the quoted rate; if all 1,060 lessons in 70 packs get lectures of the
    same length, **≈ 7.2 M credits ≈ $1,300**. Re-running is free thanks to the cache; editing one scene costs only
    that scene.
* **Render + assemble** (this 4-vCPU box, 3 render workers, measured while other agents kept the load average at
  30+): lecture A (4 min 13 s of video) rendered in 217–252 s and assembled in 162–169 s ≈ **7 min**; lecture B
  (6 min 47 s) rendered in 374 s and assembled in 307 s ≈ **11.4 min** — i.e. ≈ **1.6× real time** wall clock
  (only 15–25 % of frames are unique screenshots; the rest reuse the previous frame). The current v2 catalogue
  (≈ 3,700 minutes of video) is ≈ 100 machine-hours on one such box (≈ 4 days), less on an idle machine; it
  parallelises per lecture across machines. `--preview` stills take ~10 s per lecture.
* **Size**: ≈ 5.5 MB per minute (CRF 19): 24 MB and 37 MB for the pilot lectures. Keep streaming mode on for batches (disk here is small).

## YouTube upload

Environment only: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` (OAuth refresh token of the
channel owner with scopes `youtube.upload` and `youtube.force-ssl`). Steps per lecture, each recorded in the ledger
(`youtube-ledger.json`, keyed by `course/lesson`) so reruns resume and never upload twice:
resumable `videos.insert` (8 MiB chunks, 308/Range resume, exponential backoff on 5xx/rate limits, never retries
`quotaExceeded`) → `thumbnails.set` → `captions.insert` (VTT) → playlist per course (found or created once, cached)
→ `playlistItems.insert` → patch entry `{src, publishedAt}` in `lecture-src-patch.json`.
Default metadata: privacy **unlisted** until the owner confirms public, `selfDeclaredMadeForKids: false`,
category 27 (Education), `containsSyntheticMedia: true` + an AI-narration line in the description.

**Quota — verify against the official page before the first batch** (developers.google.com is blocked from this
environment; the figures below come from 2026 third-party summaries of Google's docs):
default project quota is 10,000 units/day; `captions.insert` = 400, `thumbnails.set` = 50,
`playlistItems.insert` = 50, `playlists.insert` = 50, list calls = 1; `videos.insert` reportedly moved to its own
bucket in June 2026 (≈ 1 unit per call, 100 uploads/day by default; before that it cost 1,600 then ~100 units).
Our per-lecture cost is therefore ≈ 500 general units ⇒ **≈ 20 lectures/day** on a default project (captions
dominate) — the 491 current lectures take ~25 days unless a quota extension is granted (audit form).
**Also**: videos uploaded through an *unverified* API project are locked to private until the project passes
Google's API compliance audit — apply for the audit before the first real batch.

## Known limitations

* Template choice is rule-based; unusual `visual` directions fall back to the closest template (e.g. maps,
  storyboards and UI screen recordings are rendered as bullets/case cards, not literal illustrations).
* Charts are conceptual (saturating curves labelled *Illustrative*); the studio never invents data points.
* Caption timing is sentence-level (snapped to pauses); word-level timing needs the REST backend's alignment.
* No music bed (not licensed) and a silent intro sting, by decision.
