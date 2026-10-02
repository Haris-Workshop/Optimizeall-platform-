"""`publish` / `upload`: ledger-driven, resumable, quota-aware publishing of assembled lectures to YouTube.

Per lecture (courses in catalogue order, lectures in lecture order): resumable ``videos.insert`` (unless the channel already
has a video with the exact same title: that one is adopted as ``skipped-duplicate``) -> ``videos.list`` status read-back
-> ``thumbnails.set`` -> ``captions.insert`` -> course playlist (reused by title or created, unlisted) -> playlist item at the
lecture's position. Every finished step is written to the ledger (``<work>/youtube-ledger.json``) at once, and the committed
table ``tools/lecture-studio/youtube-uploads.md`` is regenerated from it, so a stopped run resumes exactly where it stopped.
At the end the YouTube URL is written into ``lesson.lecture.src`` (+ ``publishedAt``) of the course pack JSON, which is what
the Academy lesson page embeds.

Nothing secret is written anywhere: credentials stay in the environment, the upload session URL stays in the ledger (work
dir, never committed) and never reaches the committed log.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import metadata
from .config import TOOL_DIR, Config
from .packs import LectureRef, find_lecture, iter_lectures, load_pack
from .workspace import read_json, write_json
from .youtube import QUOTA, QUOTA_REASONS, YouTube, YouTubeError, check_privacy, youtube_id

AUTH_REASONS = {"invalid_grant", "invalid_client", "unauthorized_client", "authError", "unauthorized", "UNAUTHENTICATED"}
DEFAULT_LOG = TOOL_DIR / "youtube-uploads.md"
DONE = ("yes", "no", "refused")  # terminal states of the thumbnail and captions steps
WITHHELD_UPLOAD_STATUS = ("rejected", "failed", "deleted")


def watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def now_utc() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def pacific_date(now: datetime | None = None) -> str:
    """The YouTube quota day (it resets at midnight Pacific time)."""
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo("America/Los_Angeles")
    except Exception:  # no tz database: PST is close enough for bookkeeping
        tz = timezone(timedelta(hours=-8))
    return (now or datetime.now(timezone.utc)).astimezone(tz).date().isoformat()


class Stop(Exception):
    """Ends the whole run (quota, auth, channel mismatch, repeated error, budget)."""

    def __init__(self, reason: str, detail: str = ""):
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason
        self.detail = detail


def classify(err: Exception) -> str:
    """quota | auth | refused (HTTP 403 on an optional step) | error."""
    if isinstance(err, YouTubeError):
        if err.reason in QUOTA_REASONS:
            return "quota"
        if err.status == 401 or err.reason in AUTH_REASONS or str(err).startswith("missing environment variables"):
            return "auth"
        if err.status == 403:
            return "refused"
    return "error"


def signature(err: Exception) -> tuple:
    if isinstance(err, YouTubeError):
        return ("YouTubeError", err.status, err.reason or str(err)[:120])
    return (type(err).__name__, str(err)[:120])


# ---------------------------------------------------------------------- lectures to publish

@dataclass
class Item:
    ref: LectureRef
    out: Path  # directory with video.mp4, poster.png, captions.vtt, youtube.json

    @property
    def key(self) -> str:
        return self.ref.key

    @property
    def number(self) -> int:
        return self.ref.lecture_number

    @property
    def course_title(self) -> str:
        return self.ref.pack.get("title", self.ref.course_slug)

    def files(self) -> dict:
        stored = read_json(self.out / "youtube.json", {}) or {}
        f = stored.get("files") or {}
        return {"video": self.out / f.get("video", "video.mp4"), "thumbnail": self.out / f.get("thumbnail", "poster.png"),
                "captions": self.out / f.get("captions", "captions.vtt")}

    @property
    def assembled(self) -> bool:
        return (self.out / "youtube.json").is_file() and self.files()["video"].is_file()


def catalogue_slugs(cfg: Config) -> list[str]:
    """Catalogue order: course pack files sorted by slug (the order `run --all-v2` uses too)."""
    return [p.stem for p in sorted(Path(cfg.catalog_dir).glob("*.json"))]


def collect(cfg: Config, courses: list[str] | None = None) -> list[Item]:
    """Every lecture of the selected courses (all by default), courses in catalogue order (or the order given),
    lectures in lecture order, with the work-dir output directory each one is assembled into."""
    out: list[Item] = []
    for slug in courses or catalogue_slugs(cfg):
        for ref in iter_lectures(load_pack(cfg.catalog_dir, slug)):
            out.append(Item(ref, cfg.work_dir / "lectures" / ref.course_slug / ref.lesson_slug / "out"))
    return out


def publish_metadata(cfg: Config, item: Item) -> dict:
    """The metadata to send, rebuilt from the current pack (title "Course: Lecture N, Topic") and the lecture's own
    plan/timeline (chapters match the assembled video). Falls back to the stored youtube.json with a fresh title."""
    stored = read_json(item.out / "youtube.json", {}) or {}
    root = item.out.parent
    saved = read_json(root / "plan.json") if (root / "plan.json").is_file() else None
    timeline = read_json(root / "timeline.json") if (root / "timeline.json").is_file() else None
    ref = item.ref
    if saved:
        plan = json.loads(json.dumps(saved))
        plan["course"]["title"] = ref.pack.get("title", ref.course_slug)
        plan["lesson"]["title"] = ref.lesson.get("title", ref.lesson_slug)
        plan["lectureNumber"] = item.number
    else:
        plan = None
    if plan and timeline:
        meta = metadata.build(cfg, plan, timeline, ref.pack, credits=stored.get("narrationCredits"))
        meta["files"] = stored.get("files") or {}
    else:
        meta = json.loads(json.dumps(stored))
        meta.setdefault("snippet", {})
        meta.setdefault("status", {})
        ident = plan or {"course": {"title": ref.pack.get("title", ref.course_slug)},
                         "lesson": {"title": ref.lesson.get("title", ref.lesson_slug), "number": ref.lesson_index + 1},
                         "lectureTitle": ref.title, "lectureNumber": item.number}
        meta["snippet"]["title"] = metadata.youtube_title(ident)
        meta.setdefault("playlist", {"title": ref.pack.get("title", ref.course_slug), "description": ""})
        meta.setdefault("captions", {"language": cfg.youtube_language, "name": "English"})
    meta["status"]["privacyStatus"] = check_privacy(cfg.youtube_privacy)
    meta["playlist"]["title"] = ref.pack.get("title", ref.course_slug)
    return meta


# ---------------------------------------------------------------------- ledger

class Ledger:
    """``{"lectures": {key: entry}, "playlists": {course title: id}, "quota": {"date": pacific day, "used": units}}``."""

    def __init__(self, path: Path):
        self.path = path
        data = read_json(path, None) or {}
        self.data = {"lectures": data.get("lectures") or {}, "playlists": data.get("playlists") or {},
                     "quota": data.get("quota") or {}}
        for e in self.data["lectures"].values():
            self._normalize(e)

    @staticmethod
    def _normalize(e: dict) -> None:
        """Older ledgers stored ``thumbnail: true`` and only ``captionId``."""
        if e.get("thumbnail") is True:
            e["thumbnail"] = "yes"
        if e.get("captionId") and not e.get("captions"):
            e["captions"] = "yes"
        if e.get("videoId") and not e.get("status"):
            e["status"] = "uploaded"

    @property
    def lectures(self) -> dict:
        return self.data["lectures"]

    @property
    def playlists(self) -> dict:
        return self.data["playlists"]

    def entry(self, key: str) -> dict:
        return self.lectures.setdefault(key, {})

    def used_today(self, today: str) -> int:
        q = self.data["quota"]
        return int(q.get("used", 0)) if q.get("date") == today else 0

    def set_used_today(self, today: str, used: int) -> None:
        self.data["quota"] = {"date": today, "used": int(used)}

    def save(self) -> None:
        write_json(self.path, self.data)


def default_ledger(cfg: Config) -> Path:
    return cfg.work_dir / "youtube-ledger.json"


def lecture_done(e: dict, *, retry_refused: bool = False) -> bool:
    ok = ("yes", "no") if retry_refused else DONE
    return bool(e.get("videoId") and e.get("privacyStatus") and e.get("thumbnail") in ok and e.get("captions") in ok
                and e.get("playlistItemId"))


def estimate(e: dict, item: Item, *, playlist_known: bool, refused: dict, retry_refused: bool = False) -> tuple[int, list[str]]:
    """Units the remaining steps of one lecture will cost, by the client's unit table, and the step names."""
    files = item.files()
    pending = ("yes", "no") if retry_refused else DONE
    steps: list[tuple[str, int]] = []
    if not e.get("videoId"):
        steps.append(("video", QUOTA["videos.insert"]))
    if not e.get("privacyStatus") or not e.get("videoId"):
        steps.append(("status", QUOTA["videos.list"]))
    if e.get("thumbnail") not in pending and files["thumbnail"].is_file() and "thumbnail" not in refused:
        steps.append(("thumbnail", QUOTA["thumbnails.set"]))
    if e.get("captions") not in pending and files["captions"].is_file() and "captions" not in refused:
        steps.append(("captions", QUOTA["captions.insert"]))
    if not e.get("playlistItemId"):
        steps.append(("playlist", QUOTA["playlistItems.insert"] + (0 if playlist_known else QUOTA["playlists.insert"])))
    return sum(u for _, u in steps), [s for s, _ in steps]


# ---------------------------------------------------------------------- committed log

LOG_COLUMNS = ("Course", "Lecture", "Title", "Video ID", "Playlist ID", "Privacy (as reported)", "Captions", "Thumbnail",
               "Uploaded at (UTC)", "Notes")


def _cell(v) -> str:
    return str(v if v not in (None, "") else "—").replace("|", "\\|").replace("\n", " ")


def _state(v) -> str:
    return v if v in DONE else "pending"


def write_log(path: Path, ledger: Ledger) -> None:
    """Deterministic Markdown table of every lecture the ledger knows (course order, then lecture order)."""
    rows = []
    for key, e in ledger.lectures.items():
        if not (e.get("videoId") or e.get("error")):
            continue
        notes = []
        if e.get("status") == "skipped-duplicate":
            notes.append("duplicate on the channel: adopted, not uploaded again")
        if e.get("privacyStatus") == "private":
            notes.append("YouTube set it to private")
        if e.get("uploadStatus") in WITHHELD_UPLOAD_STATUS:
            notes.append(f"upload {e['uploadStatus']}: {e.get('rejectionReason') or e.get('failureReason') or '?'}")
        for step in ("thumbnail", "captions"):
            if e.get(step) == "refused":
                notes.append(f"{step} refused: {e.get(step + 'Reason', '')}")
        if e.get("error"):
            notes.append(f"error: {e['error']}")
        course, _, _ = key.partition("/")
        rows.append(((course, int(e.get("lectureNumber") or 0), key), [
            e.get("courseTitle") or course, e.get("lectureNumber"), e.get("title") or key, e.get("videoId"),
            e.get("playlistId"), e.get("privacyStatus"), _state(e.get("captions")), _state(e.get("thumbnail")),
            e.get("uploadedAt"), "; ".join(notes)]))
    rows.sort(key=lambda r: r[0])
    lines = [
        "# YouTube uploads (lecture studio)",
        "",
        "Generated by `python3 -m studio publish` from the upload ledger after every step; do not edit by hand.",
        "One row per lecture, courses in catalogue order, lectures in lecture order. Privacy is what YouTube reported",
        "after the upload; captions/thumbnail: yes, no (no file), refused (YouTube refused the call) or pending.",
        "",
        "| " + " | ".join(LOG_COLUMNS) + " |",
        "|" + "|".join("---" for _ in LOG_COLUMNS) + "|",
        *("| " + " | ".join(_cell(c) for c in cells) + " |" for _, cells in rows),
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "\n".join(lines) + "\n"
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------- embeds in the course packs

def embed_withheld(e: dict) -> str | None:
    """Why a recorded video must not be embedded (yet), or None."""
    if not e.get("videoId"):
        return "no video"
    if not e.get("privacyStatus"):
        return "status not read back yet"
    if e["privacyStatus"] not in ("unlisted", "public"):
        return f"YouTube reports it {e['privacyStatus']}"
    if e.get("uploadStatus") in WITHHELD_UPLOAD_STATUS:
        return f"upload {e['uploadStatus']}"
    return None


def apply_embeds(cfg: Config, ledger: Ledger, *, keys: list[str] | None = None, dry_run: bool = False) -> dict:
    """Write ``lecture.src`` (watch URL) + ``publishedAt`` into the course pack JSON of every published lecture.
    Packs keep their exact formatting (2-space indent, UTF-8, trailing newline); a pack is only rewritten if it changed.
    A lecture whose src already points at another video is left alone and reported as a conflict."""
    res = {"applied": [], "unchanged": 0, "withheld": [], "conflicts": [], "packsWritten": []}
    by_course: dict[str, list[str]] = {}
    for key, e in ledger.lectures.items():
        if keys is not None and key not in keys:
            continue
        if not e.get("videoId"):
            continue
        why = embed_withheld(e)
        if why:
            res["withheld"].append({"key": key, "videoId": e["videoId"], "reason": why})
            continue
        by_course.setdefault(key.split("/", 1)[0], []).append(key)
    for course in sorted(by_course):
        path = Path(cfg.catalog_dir) / f"{course}.json"
        if not path.is_file():
            res["conflicts"].append({"key": course, "reason": "course pack not found"})
            continue
        before = path.read_text(encoding="utf-8")
        pack = json.loads(before)
        for key in sorted(by_course[course]):
            e = ledger.lectures[key]
            try:
                lecture = find_lecture(pack, key.split("/", 1)[1]).lecture
            except KeyError:
                res["conflicts"].append({"key": key, "reason": "lesson not found in the pack"})
                continue
            url, day = watch_url(e["videoId"]), (e.get("uploadedAt") or now_utc())[:10]
            current = lecture.get("src")
            if current and youtube_id(current) != e["videoId"]:
                res["conflicts"].append({"key": key, "reason": f"lecture.src already set to {current}"})
                continue
            if current == url and lecture.get("publishedAt"):
                res["unchanged"] += 1
                continue
            lecture["src"] = url
            if not lecture.get("publishedAt") or current != url:
                lecture["publishedAt"] = day
            res["applied"].append({"key": key, "src": url})
        after = json.dumps(pack, indent=2, ensure_ascii=False) + "\n"
        if after != before:
            if not dry_run:
                path.write_text(after, encoding="utf-8")
            res["packsWritten"].append(str(path))
    return res


# ---------------------------------------------------------------------- the publisher

@dataclass
class Publisher:
    cfg: Config
    yt: YouTube | None = None
    ledger_path: Path | None = None
    log_path: Path | None = DEFAULT_LOG
    max_quota: int = 10000
    retry_refused: bool = False
    echo: object = print
    today: str = field(default_factory=pacific_date)

    def __post_init__(self):
        self.ledger = Ledger(self.ledger_path or default_ledger(self.cfg))
        self.refused: dict[str, str] = {}  # step -> reason, remembered for the rest of this run
        self.base_used = self.ledger.used_today(self.today)
        self.channel_titles: dict[str, dict] | None = None
        self.channel_playlists: dict[str, str] | None = None
        self.members: dict[str, dict[str, str]] = {}  # playlist id -> {videoId: playlist item id}
        self.counts = {"uploaded": 0, "duplicates": 0}
        self.private: list[dict] = []
        self.failed: list[dict] = []

    # ------------------------------------------------------------ bookkeeping
    def say(self, msg: str) -> None:
        if self.echo:
            self.echo(f"[publish] {msg}")

    @property
    def used(self) -> int:
        return self.yt.quota_used if self.yt else 0

    def save(self) -> None:
        self.ledger.set_used_today(self.today, self.base_used + self.used)
        self.ledger.save()
        if self.log_path:
            write_log(self.log_path, self.ledger)

    # ------------------------------------------------------------ channel state (read once per run)
    def _titles(self) -> dict[str, dict]:
        if self.channel_titles is None:
            self.channel_titles = {}
            for v in self.yt.channel_uploads():
                self.channel_titles.setdefault(v["title"], v)
        return self.channel_titles

    def _playlist(self, item: Item, meta: dict) -> str:
        title = item.course_title
        if self.channel_playlists is None:
            self.channel_playlists = self.yt.list_playlists()
        pid = self.channel_playlists.get(title)
        if pid:
            if pid not in self.members:
                self.members[pid] = {v["videoId"]: v["itemId"] for v in self.yt.list_playlist_items(pid)}
        else:
            pid = self.yt.create_playlist(title, meta["playlist"].get("description", ""), self.cfg.youtube_privacy)
            self.channel_playlists[title] = pid
            self.members[pid] = {}
            self.say(f"created playlist '{title}' ({pid})")
        self.ledger.playlists[title] = pid
        return pid

    def _position(self, item: Item, pid: str) -> int:
        """Lecture N goes to position N-1 once lectures 1..N-1 are in; otherwise after the earlier ones present."""
        earlier = {e.get("videoId") for k, e in self.ledger.lectures.items()
                   if k.split("/", 1)[0] == item.ref.course_slug and int(e.get("lectureNumber") or 0) < item.number}
        return sum(1 for v in self.members.get(pid, {}) if v in earlier)

    # ------------------------------------------------------------ one lecture
    def _upload(self, e: dict, meta: dict, video: Path) -> dict:
        size = video.stat().st_size
        session, offset = e.get("uploadSession"), 0
        if session:
            offset, done = self.yt.upload_status(session, size)
            if done:
                return done
            if offset < 0:
                session = None
        if not session:
            session = self.yt.start_upload(meta, size)
            e["uploadSession"] = session  # resumable for about a week if the run dies mid-upload (work dir only)
            self.save()
        return self.yt.upload_file(session, video, offset=max(0, offset))

    def _optional(self, e: dict, step: str, path: Path, fn) -> None:
        if e.get(step) in (("yes", "no") if self.retry_refused else DONE):
            return
        if not path.is_file():
            e[step] = "no"
        elif step in self.refused:
            e[step], e[step + "Reason"] = "refused", f"not attempted: refused earlier in this run ({self.refused[step]})"
        else:
            try:
                fn()
                e[step] = "yes"
                e.pop(step + "Reason", None)
            except YouTubeError as err:
                if classify(err) != "refused":
                    raise
                self.refused[step] = str(err)
                e[step], e[step + "Reason"] = "refused", str(err)
                self.say(f"{step} refused by YouTube ({err}); continuing without it for the rest of this run")
        self.save()

    def publish_one(self, item: Item) -> dict:
        e = self.ledger.entry(item.key)
        meta = publish_metadata(self.cfg, item)
        files = item.files()
        e.update({"courseTitle": item.course_title, "lectureNumber": item.number})
        e.setdefault("title", meta["snippet"]["title"])
        if not e.get("videoId"):
            e["title"] = meta["snippet"]["title"]
            dup = self._titles().get(e["title"])
            if dup:
                e.update({"videoId": dup["videoId"], "status": "skipped-duplicate", "uploadedAt": dup.get("publishedAt") or now_utc()})
                self.counts["duplicates"] += 1
                self.say(f"{item.key}: a video titled '{e['title']}' is already on the channel ({dup['videoId']}): not uploading again")
            else:
                self.say(f"{item.key}: uploading '{e['title']}' ({files['video'].stat().st_size / 1e6:.1f} MB)")
                res = self._upload(e, meta, files["video"])
                e.update({"videoId": res["id"], "status": "uploaded", "uploadedAt": now_utc()})
                self._titles()[e["title"]] = {"videoId": res["id"], "title": e["title"]}
                self.counts["uploaded"] += 1
            e.pop("uploadSession", None)
            self.save()
        vid = e["videoId"]
        if not e.get("privacyStatus"):
            st = self.yt.video_status(vid)
            if st is None:
                e.update({"privacyStatus": "not found", "uploadStatus": "deleted"})
            else:
                e.update({"privacyStatus": st.get("privacyStatus"), "uploadStatus": st.get("uploadStatus")})
                for k in ("rejectionReason", "failureReason"):
                    if st.get(k):
                        e[k] = st[k]
            if e["privacyStatus"] != self.cfg.youtube_privacy:
                self.say(f"{item.key}: YouTube reports the video as {e['privacyStatus']} (requested {self.cfg.youtube_privacy}); "
                         "recorded, not changed")
            self.save()
        self._optional(e, "thumbnail", files["thumbnail"], lambda: self.yt.set_thumbnail(vid, files["thumbnail"]))
        self._optional(e, "captions", files["captions"], lambda: e.__setitem__(
            "captionId", self.yt.insert_captions(vid, files["captions"], meta["captions"]["language"], meta["captions"]["name"])))
        if not e.get("playlistItemId"):
            pid = self._playlist(item, meta)
            members = self.members.setdefault(pid, {})
            if vid in members:
                e["playlistItemId"] = members[vid]
            else:
                e["playlistItemId"] = members[vid] = self.yt.add_to_playlist(pid, vid, self._position(item, pid))
            e["playlistId"] = pid
            self.save()
        e.pop("error", None)
        self.save()
        return e

    # ------------------------------------------------------------ the run
    def run(self, items: list[Item], *, dry_run: bool = False, embeds: bool = True) -> dict:
        check_privacy(self.cfg.youtube_privacy)
        # A lecture already on YouTube counts even if streaming mode deleted its local MP4.
        assembled = [i for i in items if i.assembled or self.ledger.lectures.get(i.key, {}).get("videoId")]
        done_before = [i for i in assembled if lecture_done(self.ledger.lectures.get(i.key, {}), retry_refused=self.retry_refused)]
        todo = [i for i in assembled if i not in done_before]
        summary = {
            "catalogueLectures": len(items),
            "courses": len({i.ref.course_slug for i in items}),
            "assembled": len(assembled),
            "notAssembled": len(items) - len(assembled),
            "alreadyDone": len(done_before),
            "toPublish": len(todo),
            "dryRun": dry_run,
        }
        stopped, next_item, last_sig = None, None, None
        if dry_run:
            summary.update(self._dry_run(todo))
        else:
            try:
                if todo:
                    self.yt = self.yt or YouTube()
                    self.yt.verify_channel()  # before any byte is sent; a mismatch stops everything
                    self.say(f"channel verified ({self.yt.channel_id}); {len(todo)} lectures to publish, "
                             f"{self.max_quota - self.base_used} units left today")
                for item in todo:
                    e = self.ledger.lectures.get(item.key, {})
                    est, steps = estimate(e, item, playlist_known=item.course_title in (self.channel_playlists or {}),
                                          refused=self.refused, retry_refused=self.retry_refused)
                    left = self.max_quota - self.base_used - self.used
                    if est > left:
                        raise Stop("daily-budget", f"{item.key} needs ≈{est} units ({', '.join(steps)}); {left} left of "
                                                   f"{self.max_quota} today (resets at midnight Pacific time)")
                    try:
                        self.publish_one(item)
                        last_sig = None
                        self.say(f"{item.key}: done ({self.ledger.lectures[item.key]['videoId']})")
                    except Stop:
                        raise
                    except Exception as err:  # noqa: BLE001 - classified below
                        kind = classify(err)
                        ent = self.ledger.entry(item.key)
                        ent["error"] = str(err)[:300]
                        self.save()
                        if kind in ("quota", "auth"):
                            raise Stop("quota-exceeded" if kind == "quota" else "auth-failure", str(err)[:300])
                        self.failed.append({"key": item.key, "error": str(err)[:300]})
                        self.say(f"{item.key}: failed ({err}); continuing with the next lecture")
                        sig = signature(err)
                        if sig == last_sig:
                            raise Stop("repeated-error", f"the same error on two consecutive lectures: {str(err)[:300]}")
                        last_sig = sig
            except Stop as s:
                stopped = s
            except YouTubeError as err:  # channel guard / listings before the first lecture
                kind = classify(err)
                stopped = Stop({"quota": "quota-exceeded", "auth": "auth-failure"}.get(kind, "channel-check"), str(err)[:300])
            if stopped:
                self.say(f"stopped: {stopped}")
            if self.yt:
                self.save()
        for i in assembled:
            if not lecture_done(self.ledger.lectures.get(i.key, {}), retry_refused=self.retry_refused):
                next_item = i
                break
        considered = {i.key for i in items}
        entries = {k: e for k, e in self.ledger.lectures.items() if k in considered}
        summary.update({
            "uploadedThisRun": self.counts["uploaded"],
            "skippedDuplicates": self.counts["duplicates"],
            "failed": self.failed,
            "playlists": {i.ref.course_slug: self.ledger.playlists[i.course_title]
                          for i in items if i.course_title in self.ledger.playlists},
            "privateVideos": [{"key": k, "videoId": e["videoId"], "privacyStatus": e["privacyStatus"],
                               "uploadStatus": e.get("uploadStatus"), "rejectionReason": e.get("rejectionReason")}
                              for k, e in entries.items() if e.get("privacyStatus") == "private"],
            "quota": {"usedThisRun": self.used, "usedToday": self.base_used + self.used, "maxQuota": self.max_quota,
                      "pacificDate": self.today, "unitTable": "studio.youtube.QUOTA"} if not dry_run else summary.pop("quota"),
            "stoppedReason": (f"{stopped.reason}: {stopped.detail}" if stopped and stopped.detail else
                              (stopped.reason if stopped else None)),
            "nextLecture": next_item.key if next_item else None,
            "refusals": {"thisRun": dict(self.refused),
                         "lectures": [{"key": k, "step": s, "reason": e.get(s + "Reason")}
                                      for k, e in entries.items() for s in ("thumbnail", "captions") if e.get(s) == "refused"]},
        })
        if embeds:
            summary["embeds"] = apply_embeds(self.cfg, self.ledger, keys=sorted(considered), dry_run=dry_run)
        summary["ledger"] = str(self.ledger.path)
        summary["log"] = str(self.log_path) if self.log_path else None
        return summary

    def _dry_run(self, todo: list[Item]) -> dict:
        """No network: the plan and its estimated cost, and how many lectures fit in today's remaining budget."""
        known = {i.course_title for i in todo if i.course_title in self.ledger.playlists}
        uploads = sum(1 for e in self.ledger.lectures.values() if e.get("videoId"))
        reads = QUOTA["channels.list"] + (uploads // 50 + 1) * QUOTA["playlistItems.list"] + QUOTA["playlists.list"]
        left = self.max_quota - self.base_used - reads
        total, fit, plan, stopped_at = reads, 0, [], None
        for item in todo:
            e = self.ledger.lectures.get(item.key, {})
            est, steps = estimate(e, item, playlist_known=item.course_title in known, refused={}, retry_refused=self.retry_refused)
            if item.course_title not in known:
                est += QUOTA["playlistItems.list"]  # an existing course playlist is read once
            known.add(item.course_title)
            fits = stopped_at is None and est <= left
            if fits:
                left -= est
                fit += 1
            elif stopped_at is None:
                stopped_at = item.key
            total += est
            title = publish_metadata(self.cfg, item)["snippet"]["title"]
            plan.append({"key": item.key, "lecture": item.number, "title": title, "steps": steps, "units": est, "fitsToday": fits})
            self.say(f"{'today' if fits else 'later'}  {item.key}  #{item.number}  ≈{est} units  [{', '.join(steps)}]  {title}")
        return {"plan": plan, "lecturesFittingToday": fit, "firstLectureOverBudget": stopped_at,
                "quota": {"estimatedTotal": total, "upfrontReads": reads, "usedTodayBefore": self.base_used,
                          "maxQuota": self.max_quota, "pacificDate": self.today, "perFullLecture": sum(
                              QUOTA[k] for k in ("videos.insert", "videos.list", "thumbnails.set", "captions.insert",
                                                 "playlistItems.insert"))}}


# ---------------------------------------------------------------------- single directory (`upload`, `run --upload`)

def upload_lecture_dir(cfg: Config, d: Path, *, dry_run: bool = False, ledger: Path | None = None, yt: YouTube | None = None,
                       log_path: Path | None = DEFAULT_LOG, embeds: bool = True, echo=print) -> dict:
    """Publish one assembled lecture directory (the same steps, ledger and log as `publish`). Raises if it stopped/failed."""
    stored = json.loads((Path(d) / "youtube.json").read_text(encoding="utf-8"))
    course, lesson = stored["key"].split("/", 1)
    item = Item(find_lecture(load_pack(cfg.catalog_dir, course), lesson), Path(d))
    pub = Publisher(cfg, yt=yt, ledger_path=ledger, log_path=log_path, echo=echo)
    summary = pub.run([item], dry_run=dry_run, embeds=embeds)
    if dry_run:
        return summary
    e = pub.ledger.lectures.get(item.key, {})
    if summary["stoppedReason"] or summary["failed"] or not e.get("videoId"):
        raise YouTubeError(f"{item.key}: {summary['stoppedReason'] or (summary['failed'] or [{}])[0].get('error') or 'not published'}")
    return {"key": item.key, "videoId": e["videoId"], "url": watch_url(e["videoId"]), "status": e.get("status"),
            "privacyStatus": e.get("privacyStatus"), "thumbnail": e.get("thumbnail"), "captions": e.get("captions"),
            "playlistId": e.get("playlistId"), "quotaUsed": pub.used, "embeds": summary.get("embeds")}
