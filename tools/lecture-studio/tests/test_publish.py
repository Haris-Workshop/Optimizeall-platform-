import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # also runnable as `discover -s tools/lecture-studio/tests`

from studio import metadata, publish, youtube  # noqa: E402
from studio.config import Config  # noqa: E402
from studio.packs import find_lecture  # noqa: E402
from studio.plan import build_plan  # noqa: E402
from studio.youtube import Resp, YouTube, YouTubeError  # noqa: E402

from tests.fixtures import PACK  # noqa: E402

CHANNEL = "UCtestChannelId000000000O"
API = "https://www.googleapis.com/youtube/v3"
UP = "https://www.googleapis.com/upload/youtube/v3"


def j(status, body, headers=None):
    return Resp(status, headers or {}, json.dumps(body).encode())


def err(status, reason, message="nope"):
    return j(status, {"error": {"code": status, "message": message, "errors": [{"reason": reason}]}})


class FakeYouTube:
    """A stateful fake of the endpoints the publisher uses (channel, uploads, playlists, videos, thumbnails, captions).
    ``fail`` maps an endpoint name to a list of responses returned (and consumed) instead of the normal behaviour."""

    def __init__(self, channel=CHANNEL, page=50):
        self.channel = channel
        self.page = page
        self.videos = {}  # id -> {"title", "privacy"}
        self.items = {"UU1": []}  # playlist id -> [{"itemId", "videoId", "title", "publishedAt"}]
        self.playlists = {}  # id -> title
        self.sessions = {}
        self.fail = {}
        self.force_private = False
        self.token_error = None
        self.calls = []
        self.n = 0

    def _id(self, prefix):
        self.n += 1
        return f"{prefix}{self.n:08d}"

    def add_video(self, title, privacy="unlisted"):
        vid = self._id("OLD")
        self.videos[vid] = {"title": title, "privacy": privacy}
        self.items["UU1"].append({"itemId": self._id("UI"), "videoId": vid, "title": title, "publishedAt": "2026-09-30T08:00:00Z"})
        return vid

    def add_playlist(self, title, video_ids=()):
        pid = self._id("PL")
        self.playlists[pid] = title
        self.items[pid] = [{"itemId": self._id("PI"), "videoId": v, "title": self.videos[v]["title"], "publishedAt": None}
                           for v in video_ids]
        return pid

    def names(self):
        return [c["name"] for c in self.calls]

    def _paged(self, rows, params, fn):
        start = int(params.get("pageToken") or 0)
        chunk = rows[start:start + self.page]
        body = {"items": [fn(r) for r in chunk]}
        if start + self.page < len(rows):
            body["nextPageToken"] = str(start + self.page)
        return j(200, body)

    def request(self, method, url, *, headers=None, params=None, data=None, timeout=300):
        params = params or {}
        name = {
            ("POST", youtube.TOKEN_URL): "token",
            ("GET", f"{API}/channels"): "channels.list",
            ("GET", f"{API}/playlists"): "playlists.list",
            ("POST", f"{API}/playlists"): "playlists.insert",
            ("GET", f"{API}/playlistItems"): "playlistItems.list",
            ("POST", f"{API}/playlistItems"): "playlistItems.insert",
            ("GET", f"{API}/videos"): "videos.list",
            ("POST", f"{UP}/videos"): "videos.insert",
            ("POST", f"{UP}/thumbnails/set"): "thumbnails.set",
            ("POST", f"{UP}/captions"): "captions.insert",
        }.get((method, url), "upload.put" if method == "PUT" else f"? {method} {url}")
        self.calls.append({"name": name, "params": params, "data": data, "headers": headers or {}})
        if name == "token":
            if self.token_error:
                return j(400, {"error": self.token_error, "error_description": "Token has been expired or revoked."})
            return j(200, {"access_token": "ya29.fake", "expires_in": 3600})
        if self.fail.get(name):
            return self.fail[name].pop(0)
        if name == "channels.list":
            return j(200, {"items": [{"id": self.channel, "snippet": {"title": "Optimizeall"},
                                      "contentDetails": {"relatedPlaylists": {"uploads": "UU1"}}}]})
        if name == "playlistItems.list":
            return self._paged(self.items.get(params["playlistId"], []), params, lambda r: {
                "id": r["itemId"], "snippet": {"title": r["title"], "publishedAt": r["publishedAt"], "resourceId": {"videoId": r["videoId"]}}})
        if name == "playlists.list":
            return self._paged(list(self.playlists.items()), params, lambda r: {"id": r[0], "snippet": {"title": r[1]}})
        if name == "playlists.insert":
            body = json.loads(data)
            assert body["status"]["privacyStatus"] in ("unlisted", "private")
            return j(200, {"id": self.add_playlist(body["snippet"]["title"])})
        if name == "playlistItems.insert":
            sn = json.loads(data)["snippet"]
            rows = self.items[sn["playlistId"]]
            vid = sn["resourceId"]["videoId"]
            row = {"itemId": self._id("PI"), "videoId": vid, "title": self.videos[vid]["title"], "publishedAt": None}
            rows.insert(sn.get("position", len(rows)), row)
            return j(200, {"id": row["itemId"]})
        if name == "videos.insert":
            meta = json.loads(data)
            sid = f"https://upload.fake/s/{self._id('S')}"
            self.sessions[sid] = meta
            return Resp(200, {"location": sid}, b"")
        if name == "upload.put":
            meta = self.sessions[url]
            vid = self._id("VID")
            self.videos[vid] = {"title": meta["snippet"]["title"], "privacy": meta["status"]["privacyStatus"]}
            self.items["UU1"].append({"itemId": self._id("UI"), "videoId": vid, "title": meta["snippet"]["title"],
                                      "publishedAt": "2026-10-02T10:00:00Z"})
            return j(201, {"id": vid, "status": {"uploadStatus": "uploaded"}})
        if name == "videos.list":
            v = self.videos.get(params["id"])
            if not v:
                return j(200, {"items": []})
            return j(200, {"items": [{"id": params["id"], "status": {
                "privacyStatus": "private" if self.force_private else v["privacy"], "uploadStatus": "processed"}}]})
        if name in ("thumbnails.set", "captions.insert"):
            return j(200, {"id": self._id("CAP")})
        raise AssertionError(f"unexpected request {method} {url}")


def fake_timeline(plan, scene_len=30.0):
    t, scenes = 3.0, []
    for sc in plan["scenes"]:
        scenes.append({"id": sc["id"], "start": t, "chapter": sc["chapter"]})
        t += scene_len
    return {"scenes": scenes, "intro": {"duration": 3.0}, "outro": {"start": t, "duration": 6.0}, "totalSeconds": t + 6}


def make_pack():
    """Two modules; the first lesson has no lecture, so lecture numbers differ from lesson numbers."""
    pack = copy.deepcopy(PACK)
    base = pack["modules"][0]["lessons"][1]
    lessons = []
    for slug, title in (("lesson-a", "Average versus marginal"), ("lesson-b", "Response curves"), ("lesson-c", "Planning budgets")):
        les = copy.deepcopy(base)
        les["slug"], les["title"] = slug, title
        lessons.append(les)
    pack["modules"] = [
        {"title": "Module one", "lessons": [pack["modules"][0]["lessons"][0], lessons[0], lessons[1]]},
        {"title": "Module two", "lessons": [lessons[2]]},
    ]
    return pack


KEYS = ["demo-course/lesson-a", "demo-course/lesson-b", "demo-course/lesson-c"]


class Env:
    def __init__(self, root: Path, *, assembled=KEYS, privacy="unlisted"):
        self.root = root
        self.catalog = root / "catalog"
        self.catalog.mkdir()
        self.pack_path = self.catalog / "demo-course.json"
        self.pack_path.write_text(json.dumps(make_pack(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        self.cfg = Config(catalog_dir=self.catalog, work_dir=root / "work", youtube_privacy=privacy)
        self.log = root / "youtube-uploads.md"
        pack = make_pack()
        for key in assembled:
            ref = find_lecture(pack, key.split("/")[1])
            plan = build_plan(ref, self.cfg)
            d = self.cfg.work_dir / "lectures" / ref.course_slug / ref.lesson_slug
            (d / "out").mkdir(parents=True)
            (d / "plan.json").write_text(json.dumps(plan))
            (d / "timeline.json").write_text(json.dumps(fake_timeline(plan)))
            (d / "out" / "video.mp4").write_bytes(b"v" * 100)
            (d / "out" / "poster.png").write_bytes(b"\x89PNG")
            (d / "out" / "captions.vtt").write_text("WEBVTT\n")
            (d / "out" / "youtube.json").write_text(json.dumps({"key": key, "snippet": {"title": "old"}, "status": {},
                                                                "files": {"video": "video.mp4", "thumbnail": "poster.png", "captions": "captions.vtt"}}))

    def publisher(self, server, **kw):
        yt = YouTube(server, client_id="cid", client_secret="csecret", refresh_token="rtok", channel_id=CHANNEL, sleep=lambda s: None)
        return publish.Publisher(self.cfg, yt=yt, log_path=self.log, echo=None, today="2026-10-02", **kw)

    def run(self, server, **kw):
        embeds = kw.pop("embeds", True)
        pub = self.publisher(server, **kw)
        return pub.run(publish.collect(self.cfg), embeds=embeds), pub

    def ledger(self):
        return json.loads((self.cfg.work_dir / "youtube-ledger.json").read_text())["lectures"]


class TitleAndDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config()
        self.pack = make_pack()
        self.plan = build_plan(find_lecture(self.pack, "lesson-c"), self.cfg)

    def test_lecture_number_counts_lectures_across_modules(self):
        self.assertEqual(self.plan["lectureNumber"], 3)
        self.assertEqual(self.plan["lesson"]["number"], 4)  # lesson position includes the lesson without a lecture

    def test_title_format(self):
        self.assertEqual(metadata.youtube_title(self.plan), "Demo Course: Testing the Studio: Lecture 3, Planning budgets")

    def test_long_titles_shorten_the_course_then_cut_the_topic(self):
        plan = dict(self.plan, course=dict(self.plan["course"], title="Course: with a very long subtitle that goes on"),
                    lesson=dict(self.plan["lesson"], title="T" * 70))
        title = metadata.youtube_title(plan)
        self.assertEqual(title, "Course: Lecture 3, " + "T" * 70)
        plan["lesson"]["title"] = "Topic " + "x" * 120
        title = metadata.youtube_title(plan)
        self.assertEqual(len(title), 100)
        self.assertTrue(title.startswith("Course: Lecture 3, Topic x"))
        self.assertTrue(title.endswith("…"))
        plan["lesson"]["title"] = "a <b> c"
        self.assertNotIn("<", metadata.youtube_title(plan))

    def test_description_chapters_start_at_00_00_and_carry_links_and_hashtags(self):
        meta = metadata.build(self.cfg, self.plan, fake_timeline(self.plan), self.pack)
        desc = meta["snippet"]["description"]
        chapters = desc.split("Chapters\n", 1)[1].split("\n\n", 1)[0].splitlines()
        self.assertEqual(chapters[0], "00:00 Introduction")
        self.assertEqual(chapters[1][:5], "00:33")
        self.assertIn("Course: Demo Course: Testing the Studio — https://www.optimizeall.com/learn/demo-course", desc)
        self.assertTrue(desc.rstrip().endswith("#OptimizeAll #OnlineLearning #DemoCourse"))
        self.assertIn("Narration uses an AI voice", desc)
        self.assertTrue(meta["status"]["containsSyntheticMedia"])
        self.assertEqual((meta["snippet"]["defaultLanguage"], meta["snippet"]["defaultAudioLanguage"]), ("en", "en"))
        self.assertEqual(metadata.fmt_chapter(75.9), "01:15")
        self.assertEqual(metadata.fmt_chapter(3725), "1:02:05")

    def test_a_short_first_chapter_is_merged(self):
        tl = fake_timeline(self.plan)
        tl["scenes"][1]["start"] = 5.0
        starts = [s for s, _ in metadata.chapters(tl)]
        self.assertEqual(starts[0], 0.0)
        self.assertGreaterEqual(starts[1], 10.0)

    def test_course_hashtag(self):
        self.assertEqual(metadata.course_hashtag("AI for Sales Teams (2026)"), "#AIForSalesTeams")
        self.assertEqual(metadata.course_hashtag("Prompt engineering: foundations"), "#PromptEngineering")


class PrivacyTests(unittest.TestCase):
    def test_public_is_refused_before_any_request(self):
        with self.assertRaises(YouTubeError):
            youtube.check_privacy("public")
        server = FakeYouTube()
        yt = YouTube(server, client_id="c", client_secret="s", refresh_token="r", channel_id=CHANNEL)
        with self.assertRaises(YouTubeError):
            yt.start_upload({"snippet": {}, "status": {"privacyStatus": "public"}}, 10)
        with self.assertRaises(YouTubeError):
            yt.create_playlist("x", "", "public")
        self.assertEqual(server.calls, [])

    def test_publisher_refuses_a_public_config(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d), privacy="public")
            server = FakeYouTube()
            with self.assertRaises(YouTubeError):
                env.run(server)
            self.assertEqual(server.calls, [])


class PublishTests(unittest.TestCase):
    def test_full_run_then_nothing_left(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            s, pub = env.run(server)
            self.assertIsNone(s["stoppedReason"])
            self.assertEqual((s["uploadedThisRun"], s["skippedDuplicates"], s["alreadyDone"], s["assembled"]), (3, 0, 0, 3))
            self.assertIsNone(s["nextLecture"])
            names = server.names()
            self.assertEqual(names.count("videos.insert"), 3)
            self.assertEqual(names.count("videos.list"), 3)
            self.assertEqual(names.count("playlists.insert"), 1)
            # unlisted everywhere, metadata per spec
            meta = json.loads(next(c for c in server.calls if c["name"] == "videos.insert")["data"])
            self.assertEqual(meta["status"]["privacyStatus"], "unlisted")
            self.assertEqual(meta["snippet"]["title"], "Demo Course: Testing the Studio: Lecture 1, Average versus marginal")
            self.assertEqual(meta["snippet"]["categoryId"], "27")
            self.assertFalse(meta["status"]["selfDeclaredMadeForKids"])
            pl = json.loads(next(c for c in server.calls if c["name"] == "playlists.insert")["data"])
            self.assertEqual(pl, {"snippet": {"title": "Demo Course: Testing the Studio", "description": pl["snippet"]["description"]},
                                  "status": {"privacyStatus": "unlisted"}})
            positions = [json.loads(c["data"])["snippet"]["position"] for c in server.calls if c["name"] == "playlistItems.insert"]
            self.assertEqual(positions, [0, 1, 2])
            pid = s["playlists"]["demo-course"]
            self.assertEqual([server.videos[r["videoId"]]["title"].split(", ")[0][-9:] for r in server.items[pid]],
                             ["Lecture 1", "Lecture 2", "Lecture 3"])
            # quota by the client's unit table: channel + uploads listing + playlists listing + 3 x (insert, status,
            # thumbnail, captions, playlist item) + one playlist
            self.assertEqual(s["quota"]["usedThisRun"], 1 + 1 + 1 + 3 * (1600 + 1 + 50 + 400 + 50) + 50)
            ledger = env.ledger()
            self.assertEqual(ledger[KEYS[0]]["thumbnail"], "yes")
            self.assertEqual(ledger[KEYS[0]]["captions"], "yes")
            self.assertEqual(ledger[KEYS[0]]["privacyStatus"], "unlisted")
            self.assertNotIn("uploadSession", ledger[KEYS[0]])
            self.assertNotIn("ya29", (env.cfg.work_dir / "youtube-ledger.json").read_text())
            # second run: nothing to do, no request at all
            server2 = FakeYouTube()
            s2, _ = env.run(server2)
            self.assertEqual(server2.calls, [])
            self.assertEqual((s2["alreadyDone"], s2["uploadedThisRun"]), (3, 0))

    def test_duplicates_by_title_are_adopted_and_existing_playlists_reused(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube(page=1)  # paged listings (1 unit per page)
            old = server.add_video("Demo Course: Testing the Studio: Lecture 1, Average versus marginal")
            server.add_video("Something else")
            pid = server.add_playlist("Demo Course: Testing the Studio", [old])
            s, _ = env.run(server)
            self.assertEqual((s["uploadedThisRun"], s["skippedDuplicates"]), (2, 1))
            self.assertEqual(server.names().count("videos.insert"), 2)
            self.assertEqual(server.names().count("playlists.insert"), 0)
            e = env.ledger()[KEYS[0]]
            self.assertEqual((e["videoId"], e["status"], e["playlistId"]), (old, "skipped-duplicate", pid))
            self.assertEqual(e["uploadedAt"], "2026-09-30T08:00:00Z")
            # the adopted video was already in the playlist: not added twice; the others follow it in order
            self.assertEqual([r["videoId"] for r in server.items[pid]][0], old)
            self.assertEqual(len(server.items[pid]), 3)
            self.assertEqual(s["playlists"], {"demo-course": pid})
            self.assertIn("duplicate on the channel", env.log.read_text())

    def test_refused_thumbnail_and_captions_are_recorded_remembered_and_the_run_continues(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            server.fail["thumbnails.set"] = [err(403, "forbidden", "The authenticated user doesnt have permissions to upload thumbnails")]
            server.fail["captions.insert"] = [err(403, "insufficientPermissions", "Request had insufficient authentication scopes.")]
            s, _ = env.run(server)
            self.assertIsNone(s["stoppedReason"])
            self.assertEqual(s["uploadedThisRun"], 3)
            names = server.names()
            self.assertEqual((names.count("thumbnails.set"), names.count("captions.insert")), (1, 1))  # never retried
            ledger = env.ledger()
            for key in KEYS:
                self.assertEqual((ledger[key]["thumbnail"], ledger[key]["captions"]), ("refused", "refused"))
            self.assertIn("forbidden", ledger[KEYS[0]]["thumbnailReason"])
            self.assertIn("refused earlier in this run", ledger[KEYS[1]]["captionsReason"])
            self.assertEqual(set(s["refusals"]["thisRun"]), {"thumbnail", "captions"})
            self.assertEqual(len(s["refusals"]["lectures"]), 6)
            row = next(ln for ln in env.log.read_text().splitlines() if "Lecture 1," in ln)
            self.assertIn("| refused | refused |", row)
            # a later run does not redo them, unless asked to
            server2 = FakeYouTube()
            env.run(server2)
            self.assertEqual(server2.calls, [])
            server3 = FakeYouTube()
            s3, _ = env.run(server3, retry_refused=True)
            self.assertEqual((server3.names().count("thumbnails.set"), server3.names().count("captions.insert")), (3, 3))
            self.assertEqual(env.ledger()[KEYS[2]]["thumbnail"], "yes")
            self.assertEqual(s3["uploadedThisRun"], 0)

    def test_quota_exceeded_stops_and_the_next_run_resumes_at_the_next_lecture(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            # lecture 1 completes; lecture 2's captions hit the daily quota
            server.fail["captions.insert"] = [j(200, {"id": "CAP1"}), err(403, "quotaExceeded")]
            s, _ = env.run(server)
            self.assertTrue(s["stoppedReason"].startswith("quota-exceeded"))
            self.assertEqual(s["nextLecture"], KEYS[1])
            self.assertEqual(server.names().count("videos.insert"), 2)
            ledger = env.ledger()
            self.assertTrue(publish.lecture_done(ledger[KEYS[0]]))
            self.assertEqual(ledger[KEYS[1]]["thumbnail"], "yes")  # finished steps stay recorded
            self.assertNotIn("captions", ledger[KEYS[1]])
            self.assertNotIn(KEYS[2], ledger)
            # the next day: lecture 2 resumes at captions (no second upload), lecture 3 is published
            server.calls.clear()
            pub = env.publisher(server)
            pub.today = "2026-10-03"
            pub.base_used = pub.ledger.used_today(pub.today)
            s2 = pub.run(publish.collect(env.cfg))
            names = server.names()
            self.assertIsNone(s2["stoppedReason"])
            self.assertEqual(names.count("videos.insert"), 1)
            self.assertEqual(names.count("captions.insert"), 2)
            self.assertEqual(names.count("thumbnails.set"), 1)
            self.assertEqual((s2["alreadyDone"], s2["uploadedThisRun"]), (1, 1))
            self.assertTrue(all(publish.lecture_done(e) for e in env.ledger().values()))

    def test_daily_budget_stops_before_a_lecture_that_would_not_fit(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            s, _ = env.run(server, max_quota=4500)
            self.assertTrue(s["stoppedReason"].startswith("daily-budget"))
            self.assertEqual(s["uploadedThisRun"], 2)
            self.assertEqual(s["nextLecture"], KEYS[2])
            used = s["quota"]["usedToday"]
            # same Pacific day: the budget already spent counts
            server.calls.clear()
            s2, _ = env.run(server, max_quota=4500)
            self.assertTrue(s2["stoppedReason"].startswith("daily-budget"))
            self.assertEqual(s2["quota"]["usedToday"], used + 1)  # only the channel check
            self.assertNotIn("videos.insert", server.names())

    def test_auth_failure_stops_the_run(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            server.token_error = "invalid_grant"
            s, _ = env.run(server)
            self.assertTrue(s["stoppedReason"].startswith("auth-failure"))
            self.assertIn("invalid_grant", s["stoppedReason"])
            self.assertEqual(server.names(), ["token"])

    def test_auth_failure_mid_run_stops_and_keeps_finished_work(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            server.fail["videos.insert"] = [Resp(200, {"location": "https://upload.fake/s/x"}, b""), err(401, "authError"), err(401, "authError")]
            server.sessions["https://upload.fake/s/x"] = {"snippet": {"title": "Demo Course: Testing the Studio: Lecture 1, Average versus marginal"},
                                                         "status": {"privacyStatus": "unlisted"}}
            s, _ = env.run(server)
            self.assertTrue(s["stoppedReason"].startswith("auth-failure"))
            self.assertTrue(publish.lecture_done(env.ledger()[KEYS[0]]))
            self.assertEqual(s["nextLecture"], KEYS[1])

    def test_the_same_error_on_two_consecutive_lectures_stops(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            server.fail["videos.insert"] = [err(400, "invalidTitle"), err(400, "invalidTitle"), err(400, "invalidTitle")]
            s, _ = env.run(server)
            self.assertTrue(s["stoppedReason"].startswith("repeated-error"))
            self.assertEqual([f["key"] for f in s["failed"]], KEYS[:2])
            self.assertEqual(server.names().count("videos.insert"), 2)
            self.assertIn("invalidTitle", env.ledger()[KEYS[0]]["error"])
            self.assertIn("error: videos.insert failed", env.log.read_text())

    def test_a_single_error_does_not_stop_the_run(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            server.fail["videos.insert"] = [err(400, "invalidTitle")]
            s, _ = env.run(server)
            self.assertIsNone(s["stoppedReason"])
            self.assertEqual(s["uploadedThisRun"], 2)
            self.assertEqual(s["nextLecture"], KEYS[0])

    def test_private_status_is_recorded_and_reported_and_not_embedded(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            server.force_private = True
            s, _ = env.run(server)
            self.assertEqual(len(s["privateVideos"]), 3)
            self.assertEqual(s["privateVideos"][0]["privacyStatus"], "private")
            self.assertEqual(env.ledger()[KEYS[0]]["privacyStatus"], "private")
            self.assertEqual(len(s["embeds"]["withheld"]), 3)
            self.assertEqual(s["embeds"]["applied"], [])
            self.assertIn("YouTube set it to private", env.log.read_text())
            self.assertNotIn('"src": "https://www.youtube', env.pack_path.read_text())
            self.assertEqual([c for c in server.calls if c["name"] == "videos.list"][0]["params"], {"part": "status", "id": env.ledger()[KEYS[0]]["videoId"]})

    def test_channel_mismatch_uploads_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube(channel="UCsomeoneElse")
            s, _ = env.run(server)
            self.assertTrue(s["stoppedReason"].startswith("channel-check"))
            self.assertEqual(server.names(), ["token", "channels.list"])

    def test_lectures_without_an_assembled_video_are_skipped_and_counted(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d), assembled=KEYS[1:2])
            server = FakeYouTube()
            s, _ = env.run(server)
            self.assertEqual((s["catalogueLectures"], s["assembled"], s["notAssembled"], s["uploadedThisRun"]), (3, 1, 2, 1))
            meta = json.loads(next(c for c in server.calls if c["name"] == "videos.insert")["data"])
            self.assertEqual(meta["snippet"]["title"], "Demo Course: Testing the Studio: Lecture 2, Response curves")
            self.assertEqual(json.loads(next(c for c in server.calls if c["name"] == "playlistItems.insert")["data"])["snippet"]["position"], 0)

    def test_dry_run_makes_no_request_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            before = env.pack_path.read_text()
            pub = publish.Publisher(env.cfg, log_path=env.log, echo=None, today="2026-10-02")
            s = pub.run(publish.collect(env.cfg), dry_run=True)
            self.assertIsNone(pub.yt)
            self.assertEqual(s["lecturesFittingToday"], 3)
            self.assertEqual(s["quota"]["perFullLecture"], 2101)
            self.assertEqual([p["units"] for p in s["plan"]], [2152, 2101, 2101])
            self.assertFalse((env.cfg.work_dir / "youtube-ledger.json").exists())
            self.assertFalse(env.log.exists())
            s = publish.Publisher(env.cfg, log_path=env.log, echo=None, max_quota=5000).run(publish.collect(env.cfg), dry_run=True)
            self.assertEqual((s["lecturesFittingToday"], s["firstLectureOverBudget"]), (2, KEYS[2]))
            self.assertEqual(before, env.pack_path.read_text())


class LogAndEmbedTests(unittest.TestCase):
    def test_log_is_a_deterministic_table_without_secrets(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube()
            env.run(server)
            text = env.log.read_text()
            lines = [ln for ln in text.splitlines() if ln.startswith("| Demo")]
            self.assertEqual(len(lines), 3)
            self.assertEqual([ln.split(" | ")[1] for ln in lines], ["1", "2", "3"])
            cells = lines[0].strip("| ").split(" | ")
            led = env.ledger()[KEYS[0]]
            self.assertEqual(cells[:9], ["Demo Course: Testing the Studio", "1",
                                         "Demo Course: Testing the Studio: Lecture 1, Average versus marginal",
                                         led["videoId"], led["playlistId"], "unlisted", "yes", "yes", led["uploadedAt"]])
            self.assertNotIn("upload.fake", text)
            self.assertNotIn("ya29", text)
            # regenerated from the ledger: same content, rows in course/lecture order whatever the ledger order
            ledger = publish.Ledger(env.cfg.work_dir / "youtube-ledger.json")
            ledger.data["lectures"] = dict(reversed(list(ledger.lectures.items())))
            other = Path(d) / "again.md"
            publish.write_log(other, ledger)
            self.assertEqual(other.read_text(), text)

    def test_embeds_write_src_and_publishedAt_and_keep_the_formatting(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            before = env.pack_path.read_text()
            s, _ = env.run(FakeYouTube())
            self.assertEqual(len(s["embeds"]["applied"]), 3)
            after = env.pack_path.read_text()
            pack = json.loads(after)
            lec = find_lecture(pack, "lesson-b").lecture
            vid = env.ledger()[KEYS[1]]["videoId"]
            self.assertEqual(lec["src"], f"https://www.youtube.com/watch?v={vid}")
            self.assertEqual(youtube.youtube_id(lec["src"]), vid)
            self.assertRegex(lec["publishedAt"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertEqual(after, json.dumps(pack, indent=2, ensure_ascii=False) + "\n")
            # only added lines: src + publishedAt per lecture
            import difflib

            diff = [ln for ln in difflib.unified_diff(before.splitlines(), after.splitlines(), lineterm="", n=0)
                    if ln[:1] in "+-" and not ln.startswith(("+++", "---"))]
            # per lecture: the closing bracket before the new keys gains a comma, plus the two new lines
            self.assertEqual(len(diff), 12)
            self.assertEqual(sorted({ln[1:].split(":")[0].strip() for ln in diff if ":" in ln}), ['"publishedAt"', '"src"'])
            # idempotent
            again = publish.apply_embeds(env.cfg, publish.Ledger(env.cfg.work_dir / "youtube-ledger.json"))
            self.assertEqual((again["applied"], again["unchanged"], again["packsWritten"]), ([], 3, []))

    def test_an_existing_src_for_another_video_is_a_conflict(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            pack = json.loads(env.pack_path.read_text())
            find_lecture(pack, "lesson-a").lecture["src"] = "https://youtu.be/AAAAAAAAAAA"
            env.pack_path.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n")
            s, _ = env.run(FakeYouTube())
            self.assertEqual([c["key"] for c in s["embeds"]["conflicts"]], [KEYS[0]])
            self.assertEqual(find_lecture(json.loads(env.pack_path.read_text()), "lesson-a").lecture["src"], "https://youtu.be/AAAAAAAAAAA")


class SingleDirectoryTests(unittest.TestCase):
    def test_upload_one_directory(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            yt = YouTube(FakeYouTube(), client_id="c", client_secret="s", refresh_token="r", channel_id=CHANNEL, sleep=lambda s: None)
            out = env.cfg.work_dir / "lectures" / "demo-course" / "lesson-b" / "out"
            res = publish.upload_lecture_dir(env.cfg, out, yt=yt, log_path=env.log, echo=None)
            self.assertEqual(res["url"], f"https://www.youtube.com/watch?v={res['videoId']}")
            self.assertEqual((res["thumbnail"], res["captions"], res["privacyStatus"]), ("yes", "yes", "unlisted"))
            self.assertEqual(len(res["embeds"]["applied"]), 1)
            dry = publish.upload_lecture_dir(env.cfg, out, dry_run=True, log_path=env.log, echo=None)
            self.assertEqual(dry["alreadyDone"], 1)

    def test_wrong_channel_raises_and_sends_no_video_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            env = Env(Path(d))
            server = FakeYouTube(channel="UCwrong")
            yt = YouTube(server, client_id="c", client_secret="s", refresh_token="r", channel_id=CHANNEL, sleep=lambda s: None)
            with self.assertRaises(YouTubeError):
                publish.upload_lecture_dir(env.cfg, env.cfg.work_dir / "lectures" / "demo-course" / "lesson-a" / "out", yt=yt, log_path=env.log, echo=None)
            self.assertNotIn("videos.insert", server.names())
            self.assertNotIn("upload.put", server.names())


if __name__ == "__main__":
    unittest.main()
