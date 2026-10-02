"""YouTube Data API v3 client: resumable upload, thumbnail, captions, playlists, channel listings (see publish.py for the
ledger-driven, resumable, quota-aware publisher that uses it).

Credentials come ONLY from the environment: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
(an OAuth 2.0 refresh token for the channel owner with the https://www.googleapis.com/auth/youtube.upload and
https://www.googleapis.com/auth/youtube.force-ssl scopes). Nothing secret is ever logged or written to disk.

The HTTP layer is injectable (``Http``) so request building is unit-tested without the network.
"""
from __future__ import annotations

import json
import os
import random
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/youtube/v3"
UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3"
CHUNK = 8 * 1024 * 1024  # must be a multiple of 256 KiB
RETRY_STATUS = {500, 502, 503, 504}
# Quota units per call: the client's own estimate of what a run costs (Google's published costs; videos.insert is
# counted at the documented 1,600 units so a daily budget is never overrun even if the call is billed that way).
QUOTA = {"channels.list": 1, "videos.insert": 1600, "captions.insert": 400, "thumbnails.set": 50, "playlistItems.insert": 50,
         "playlists.insert": 50, "playlists.list": 1, "playlistItems.list": 1, "videos.list": 1}
QUOTA_REASONS = ("quotaExceeded", "dailyLimitExceeded", "uploadLimitExceeded")
# Only these two are ever sent: the publisher refuses "public" outright (the owner flips videos to public by hand).
ALLOWED_PRIVACY = ("unlisted", "private")


class YouTubeError(RuntimeError):
    def __init__(self, msg: str, status: int | None = None, reason: str | None = None):
        super().__init__(msg)
        self.status = status
        self.reason = reason


@dataclass
class Resp:
    status: int
    headers: dict
    body: bytes

    def json(self):
        return json.loads(self.body.decode("utf-8") or "{}")


class Http:
    """Minimal requests wrapper (swapped for a fake in tests)."""

    def request(self, method: str, url: str, *, headers=None, params=None, data=None, timeout=300) -> Resp:
        import requests

        r = requests.request(method, url, headers=headers, params=params, data=data, timeout=timeout, allow_redirects=False)
        return Resp(r.status_code, {k.lower(): v for k, v in r.headers.items()}, r.content)


def _redact(text: str) -> str:
    for var in ("YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CLIENT_ID"):
        v = os.environ.get(var)
        if v:
            text = text.replace(v, "***")
    return text


def _error(resp: Resp, what: str) -> YouTubeError:
    reason = None
    try:
        body = resp.json()
        err = body.get("error", {})
        if isinstance(err, str):  # OAuth endpoint: {"error": "invalid_grant", "error_description": "..."}
            reason, msg = err, body.get("error_description") or ""
        else:
            errs = err.get("errors") or [{}]
            reason = errs[0].get("reason") or err.get("status")
            msg = err.get("message") or ""
    except Exception:
        msg = resp.body[:300].decode("utf-8", "replace")
    return YouTubeError(_redact(f"{what} failed: HTTP {resp.status} {reason or ''} {msg}".strip()), resp.status, reason)


def check_privacy(privacy: str) -> str:
    if privacy not in ALLOWED_PRIVACY:
        raise YouTubeError(f"privacy {privacy!r} refused: the studio only publishes 'unlisted' or 'private' "
                           "(make a video public by hand in YouTube Studio once the owner approves it)")
    return privacy


class YouTube:
    def __init__(self, http: Http | None = None, *, client_id=None, client_secret=None, refresh_token=None,
                 channel_id=None, sleep=time.sleep, max_retries: int = 6):
        self.http = http or Http()
        self.channel_id = channel_id or os.environ.get("YOUTUBE_CHANNEL_ID")
        self._channel_verified = False
        self.client_id = client_id or os.environ.get("YOUTUBE_CLIENT_ID")
        self.client_secret = client_secret or os.environ.get("YOUTUBE_CLIENT_SECRET")
        self.refresh_token = refresh_token or os.environ.get("YOUTUBE_REFRESH_TOKEN")
        self.sleep = sleep
        self.max_retries = max_retries
        self._token = None
        self._token_exp = 0.0
        self.quota_used = 0
        self.uploads_playlist_id: str | None = None

    # ------------------------------------------------------------------ auth
    def token(self) -> str:
        if self._token and time.time() < self._token_exp - 60:
            return self._token
        missing = [n for n, v in (("YOUTUBE_CLIENT_ID", self.client_id), ("YOUTUBE_CLIENT_SECRET", self.client_secret),
                                  ("YOUTUBE_REFRESH_TOKEN", self.refresh_token)) if not v]
        if missing:
            raise YouTubeError(f"missing environment variables: {', '.join(missing)}")
        resp = self.http.request("POST", TOKEN_URL, headers={"content-type": "application/x-www-form-urlencoded"}, data={
            "client_id": self.client_id, "client_secret": self.client_secret,
            "refresh_token": self.refresh_token, "grant_type": "refresh_token",
        })
        if resp.status != 200:
            raise _error(resp, "OAuth token refresh")
        body = resp.json()
        self._token = body["access_token"]
        self._token_exp = time.time() + float(body.get("expires_in", 3600))
        return self._token

    def verify_channel(self) -> None:
        """Channel guard: refuse to publish unless the authenticated channel is the configured YOUTUBE_CHANNEL_ID.
        A success is remembered for this process; a mismatch is never cached. Nothing is uploaded on a mismatch."""
        if self._channel_verified:
            return
        expected = (self.channel_id or "").strip()
        if not expected:
            raise YouTubeError("missing environment variables: YOUTUBE_CHANNEL_ID (the channel every upload must go to)")
        items = self.call("GET", f"{API}/channels", what="channels.list",
                          params={"part": "id,snippet,contentDetails", "mine": "true"}).json().get("items", [])
        if len(items) != 1:
            raise YouTubeError(f"the credentials manage {len(items)} channels; expected exactly one ({expected}). Nothing was uploaded")
        found = items[0].get("id", "")
        if found != expected:
            title = (items[0].get("snippet") or {}).get("title", "?")
            raise YouTubeError(
                f"channel mismatch: the credentials belong to '{title}' ({found}) but YOUTUBE_CHANNEL_ID is {expected}. "
                "Nothing was uploaded. YouTube channel ids mix the letter O and the digit 0: copy the id from the channels.list output")
        self.uploads_playlist_id = ((items[0].get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads")
        self._channel_verified = True

    def _auth(self, extra=None) -> dict:
        h = {"authorization": f"Bearer {self.token()}"}
        if extra:
            h.update(extra)
        return h

    # ------------------------------------------------------------------ transport with backoff
    def call(self, method: str, url: str, *, what: str, params=None, headers=None, data=None, ok=(200,)) -> Resp:
        for attempt in range(self.max_retries + 1):
            resp = self.http.request(method, url, headers=self._auth(headers), params=params, data=data)
            if resp.status in ok:
                self.quota_used += QUOTA.get(what, 0)
                return resp
            if resp.status == 401 and attempt == 0:
                self._token = None  # expired token: refresh once
                continue
            err = _error(resp, what)
            if err.reason in QUOTA_REASONS:
                raise err  # retrying cannot help until the quota resets (midnight Pacific time)
            retriable = resp.status in RETRY_STATUS or err.reason in ("rateLimitExceeded", "userRateLimitExceeded", "backendError")
            if not retriable or attempt == self.max_retries:
                self.quota_used += QUOTA.get(what, 0)  # a refused call is billed too: count it (conservative)
                raise err
            self.sleep(min(64, 2 ** attempt) + random.random())
        raise YouTubeError(f"{what}: retries exhausted")

    # ------------------------------------------------------------------ resumable upload
    def start_upload(self, meta: dict, size: int) -> str:
        check_privacy(meta["status"]["privacyStatus"])
        body = json.dumps({"snippet": meta["snippet"], "status": meta["status"]}).encode("utf-8")
        resp = self.call(
            "POST", f"{UPLOAD_API}/videos", what="videos.insert",
            params={"uploadType": "resumable", "part": "snippet,status", "notifySubscribers": "false"},
            headers={"content-type": "application/json; charset=UTF-8", "x-upload-content-length": str(size),
                     "x-upload-content-type": "video/mp4"},
            data=body,
        )
        loc = resp.headers.get("location")
        if not loc:
            raise YouTubeError("resumable session did not return a Location header")
        return loc

    def upload_status(self, session_url: str, size: int) -> tuple[int, dict | None]:
        """Ask the server how many bytes it has (for resuming). Returns (next_offset, video or None)."""
        resp = self.http.request("PUT", session_url, headers=self._auth({"content-range": f"bytes */{size}", "content-length": "0"}))
        if resp.status in (200, 201):
            return size, resp.json()
        if resp.status == 308:
            rng = resp.headers.get("range")
            return (int(rng.split("-")[1]) + 1 if rng else 0), None
        if resp.status in (404, 410):
            return -1, None  # session expired: start a new one
        raise _error(resp, "upload status")

    def upload_file(self, session_url: str, path: Path, *, offset: int = 0, progress=None) -> dict:
        size = path.stat().st_size
        with path.open("rb") as fh:
            while True:
                fh.seek(offset)
                chunk = fh.read(CHUNK)
                end = offset + len(chunk) - 1
                for attempt in range(self.max_retries + 1):
                    try:
                        resp = self.http.request("PUT", session_url, headers=self._auth({
                            "content-length": str(len(chunk)), "content-range": f"bytes {offset}-{end}/{size}",
                            "content-type": "video/mp4"}), data=chunk)
                    except Exception:  # network drop: ask the server where we are
                        resp = None
                    if resp is not None and resp.status in (200, 201):
                        return resp.json()
                    if resp is not None and resp.status == 308:
                        rng = resp.headers.get("range")
                        offset = int(rng.split("-")[1]) + 1 if rng else 0
                        break
                    if resp is not None and resp.status not in RETRY_STATUS:
                        raise _error(resp, "video upload")
                    if attempt == self.max_retries:
                        raise YouTubeError("video upload: retries exhausted")
                    self.sleep(min(64, 2 ** attempt) + random.random())
                    offset, video = self.upload_status(session_url, size)
                    if video:
                        return video
                    if offset < 0:
                        raise YouTubeError("upload session expired", 410)
                    break
                if progress:
                    progress(offset, size)

    # ------------------------------------------------------------------ other resources
    def set_thumbnail(self, video_id: str, path: Path) -> None:
        ctype = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        self.call("POST", f"{UPLOAD_API}/thumbnails/set", what="thumbnails.set",
                  params={"videoId": video_id, "uploadType": "media"}, headers={"content-type": ctype}, data=path.read_bytes())

    @staticmethod
    def caption_body(video_id: str, vtt: bytes, language: str, name: str, boundary: str | None = None) -> tuple[bytes, str]:
        boundary = boundary or f"oa{uuid.uuid4().hex}"
        meta = json.dumps({"snippet": {"videoId": video_id, "language": language, "name": name, "isDraft": False}})
        parts = [
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n".encode(),
            f"--{boundary}\r\nContent-Type: text/vtt\r\n\r\n".encode() + vtt + b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
        return b"".join(parts), f"multipart/related; boundary={boundary}"

    def insert_captions(self, video_id: str, path: Path, language: str, name: str) -> str:
        body, ctype = self.caption_body(video_id, path.read_bytes(), language, name)
        resp = self.call("POST", f"{UPLOAD_API}/captions", what="captions.insert",
                         params={"uploadType": "multipart", "part": "snippet"}, headers={"content-type": ctype}, data=body)
        return resp.json().get("id", "")

    def _pages(self, url: str, what: str, params: dict):
        page = None
        while True:
            q = dict(params, maxResults="50")
            if page:
                q["pageToken"] = page
            data = self.call("GET", url, what=what, params=q).json()
            yield from data.get("items", [])
            page = data.get("nextPageToken")
            if not page:
                return

    def list_playlists(self) -> dict[str, str]:
        """{title: playlist id} of the channel's playlists (any privacy; the first one wins on a duplicate title)."""
        out: dict[str, str] = {}
        for it in self._pages(f"{API}/playlists", "playlists.list", {"part": "snippet", "mine": "true"}):
            out.setdefault(it["snippet"]["title"], it["id"])
        return out

    def list_playlist_items(self, playlist_id: str) -> list[dict]:
        """[{itemId, videoId, title, publishedAt, position}] of a playlist (1 unit per page of 50)."""
        out = []
        for it in self._pages(f"{API}/playlistItems", "playlistItems.list", {"part": "snippet", "playlistId": playlist_id}):
            sn = it.get("snippet") or {}
            out.append({"itemId": it.get("id"), "videoId": (sn.get("resourceId") or {}).get("videoId"), "title": sn.get("title", ""),
                        "publishedAt": sn.get("publishedAt"), "position": sn.get("position")})
        return out

    def channel_uploads(self) -> list[dict]:
        """Every video on the channel (its "uploads" playlist, private and unlisted included for the owner)."""
        self.verify_channel()
        if not self.uploads_playlist_id:
            raise YouTubeError("channels.list returned no uploads playlist for the channel")
        return self.list_playlist_items(self.uploads_playlist_id)

    def video_status(self, video_id: str) -> dict | None:
        """The video's status as YouTube reports it (privacyStatus, uploadStatus, rejectionReason...), None if not found."""
        items = self.call("GET", f"{API}/videos", what="videos.list", params={"part": "status", "id": video_id}).json().get("items", [])
        return (items[0].get("status") or {}) if items else None

    def create_playlist(self, title: str, description: str, privacy: str) -> str:
        check_privacy(privacy)
        body = json.dumps({"snippet": {"title": title[:150], "description": description[:5000]}, "status": {"privacyStatus": privacy}})
        resp = self.call("POST", f"{API}/playlists", what="playlists.insert", params={"part": "snippet,status"},
                         headers={"content-type": "application/json"}, data=body.encode())
        return resp.json()["id"]

    def add_to_playlist(self, playlist_id: str, video_id: str, position: int | None = None) -> str:
        snippet = {"playlistId": playlist_id, "resourceId": {"kind": "youtube#video", "videoId": video_id}}
        if position is not None:
            snippet["position"] = position
        resp = self.call("POST", f"{API}/playlistItems", what="playlistItems.insert", params={"part": "snippet"},
                         headers={"content-type": "application/json"}, data=json.dumps({"snippet": snippet}).encode())
        return resp.json().get("id", "")


_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_id(url: str | None) -> str | None:
    """The video id of an accepted lecture URL (same forms as the backend's YouTube.IdFrom), else None."""
    if not url:
        return None
    u = urlsplit(url)
    if u.scheme != "https":
        return None
    host, path = u.hostname or "", u.path.rstrip("/")
    vid = None
    if host in ("www.youtube.com", "youtube.com", "m.youtube.com") and path == "/watch":
        vid = next((v for k, v in parse_qsl(u.query) if k == "v"), None)
    elif host == "youtu.be" and path.count("/") == 1:
        vid = path[1:]
    elif host in ("www.youtube-nocookie.com", "youtube-nocookie.com") and path.startswith("/embed/") and path.count("/") == 2:
        vid = path[len("/embed/"):]
    return vid if vid and _ID.match(vid) else None
