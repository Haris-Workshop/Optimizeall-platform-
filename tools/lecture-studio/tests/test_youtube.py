import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1]))  # also runnable via discover from the repo root

from studio import youtube
from studio.config import Config
from studio.youtube import Resp, YouTube, YouTubeError


class FakeHttp:
    """Scripted HTTP: a list of (matcher, response) consumed in order; records every request."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def request(self, method, url, *, headers=None, params=None, data=None, timeout=300):
        self.calls.append({"method": method, "url": url, "headers": headers or {}, "params": params or {}, "data": data})
        if url == youtube.TOKEN_URL:
            return Resp(200, {}, json.dumps({"access_token": "ya29.test", "expires_in": 3600}).encode())
        if not self.script:
            raise AssertionError(f"unexpected request {method} {url}")
        want, resp = self.script.pop(0)
        assert want in f"{method} {url}", f"expected {want}, got {method} {url}"
        return resp


def j(status, body, headers=None):
    return Resp(status, headers or {}, json.dumps(body).encode())


CHANNEL = "UCtestChannelId000000000O"


def channels_ok(channel=CHANNEL, title="Optimizeall"):
    return ("GET https://www.googleapis.com/youtube/v3/channels", j(200, {"items": [{"id": channel, "snippet": {"title": title}}]}))


def client(script, channel_id=CHANNEL):
    return YouTube(FakeHttp(script), client_id="cid", client_secret="csecret", refresh_token="rtok", channel_id=channel_id,
                   sleep=lambda s: None)


META = {
    "key": "demo/lesson",
    "snippet": {"title": "T", "description": "D", "tags": ["a"], "categoryId": "27"},
    "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False},
    "playlist": {"title": "Demo Course", "description": "PD"},
    "captions": {"language": "en", "name": "English"},
    "files": {"video": "video.mp4", "thumbnail": "poster.png", "captions": "captions.vtt"},
    "durationSeconds": 12.5,
}


class RequestBuildingTests(unittest.TestCase):
    def test_token_refresh_and_start_upload(self):
        yt = client([("POST https://www.googleapis.com/upload/youtube/v3/videos", Resp(200, {"location": "https://up/session"}, b""))])
        loc = yt.start_upload(META, 1234)
        self.assertEqual(loc, "https://up/session")
        tok, start = yt.http.calls
        self.assertEqual(tok["data"]["grant_type"], "refresh_token")
        self.assertEqual(start["params"], {"uploadType": "resumable", "part": "snippet,status", "notifySubscribers": "false"})
        self.assertEqual(start["headers"]["authorization"], "Bearer ya29.test")
        self.assertEqual(start["headers"]["x-upload-content-length"], "1234")
        self.assertEqual(start["headers"]["x-upload-content-type"], "video/mp4")
        body = json.loads(start["data"])
        self.assertEqual(body["status"]["privacyStatus"], "unlisted")
        self.assertNotIn("playlist", body)

    def test_chunked_upload_with_308_and_retry(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "v.mp4"
            p.write_bytes(b"x" * (youtube.CHUNK + 10))
            yt = client([
                ("PUT https://up/s", Resp(308, {"range": f"bytes=0-{youtube.CHUNK - 1}"}, b"")),
                ("PUT https://up/s", Resp(503, {}, b"{}")),  # transient: ask status, then resend
                ("PUT https://up/s", Resp(308, {"range": f"bytes=0-{youtube.CHUNK - 1}"}, b"")),
                ("PUT https://up/s", j(200, {"id": "VID123", "status": {"uploadStatus": "uploaded"}})),
            ])
            res = yt.upload_file("https://up/s", p)
            self.assertEqual(res["id"], "VID123")
            puts = [c for c in yt.http.calls if c["method"] == "PUT"]
            self.assertEqual(puts[0]["headers"]["content-range"], f"bytes 0-{youtube.CHUNK - 1}/{youtube.CHUNK + 10}")
            self.assertEqual(puts[2]["headers"]["content-range"], f"bytes */{youtube.CHUNK + 10}")
            self.assertEqual(puts[3]["headers"]["content-range"], f"bytes {youtube.CHUNK}-{youtube.CHUNK + 9}/{youtube.CHUNK + 10}")

    def test_quota_exceeded_is_not_retried(self):
        err = {"error": {"code": 403, "message": "quota", "errors": [{"reason": "quotaExceeded"}]}}
        yt = client([("POST https://www.googleapis.com/upload/youtube/v3/captions", j(403, err))])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "c.vtt"
            p.write_text("WEBVTT\n")
            with self.assertRaises(YouTubeError) as ctx:
                yt.insert_captions("VID", p, "en", "English")
        self.assertEqual(ctx.exception.reason, "quotaExceeded")
        self.assertEqual(len([c for c in yt.http.calls if "captions" in c["url"]]), 1)

    def test_rate_limit_is_retried(self):
        err = {"error": {"code": 403, "errors": [{"reason": "rateLimitExceeded"}]}}
        yt = client([("POST https://www.googleapis.com/youtube/v3/playlistItems", j(403, err)),
                     ("POST https://www.googleapis.com/youtube/v3/playlistItems", j(200, {"id": "PLI"}))])
        self.assertEqual(yt.add_to_playlist("PL", "VID"), "PLI")
        self.assertEqual(yt.quota_used, 50)

    def test_caption_multipart_body(self):
        body, ctype = YouTube.caption_body("VID", b"WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHi\n", "en", "English", boundary="BND")
        self.assertEqual(ctype, "multipart/related; boundary=BND")
        text = body.decode()
        self.assertIn('"videoId": "VID"', text)
        self.assertIn("Content-Type: text/vtt", text)
        self.assertTrue(text.endswith("--BND--\r\n"))

    def test_missing_credentials(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            yt = YouTube(FakeHttp([]))
            with self.assertRaises(YouTubeError) as ctx:
                yt.token()
        self.assertIn("YOUTUBE_REFRESH_TOKEN", str(ctx.exception))

    def test_secrets_are_redacted_from_errors(self):
        with mock.patch.dict(os.environ, {"YOUTUBE_CLIENT_SECRET": "s3cr3t"}):
            e = youtube._error(Resp(400, {}, json.dumps({"error": {"message": "bad client s3cr3t"}}).encode()), "x")
        self.assertNotIn("s3cr3t", str(e))

    def test_constructor_credentials_are_redacted_too(self):
        youtube.YouTube(youtube.Http(), client_id="client-id-123", client_secret="constructor-secret-xyz", refresh_token="refresh-token-abcdef")
        e = youtube._error(Resp(400, {}, json.dumps({"error": {"message": "bad constructor-secret-xyz / refresh-token-abcdef"}}).encode()), "x")
        self.assertNotIn("constructor-secret-xyz", str(e))
        self.assertNotIn("refresh-token-abcdef", str(e))


class ChannelGuardTests(unittest.TestCase):
    def test_a_matching_channel_passes_and_is_checked_once(self):
        yt = client([channels_ok()])
        yt.verify_channel()
        yt.verify_channel()  # remembered: no second request
        self.assertEqual([c["url"] for c in yt.http.calls if "channels" in c["url"]], ["https://www.googleapis.com/youtube/v3/channels"])
        self.assertEqual(yt.http.calls[-1]["params"], {"part": "id,snippet,contentDetails", "mine": "true"})

    def test_a_mismatch_names_both_ids_and_is_never_cached_as_success(self):
        yt = client([channels_ok(channel="UCsomeoneElse"), channels_ok(channel="UCsomeoneElse")])
        for _ in range(2):  # the second call must ask again, not trust the first
            with self.assertRaises(YouTubeError) as ctx:
                yt.verify_channel()
        msg = str(ctx.exception)
        self.assertIn("UCsomeoneElse", msg)
        self.assertIn(CHANNEL, msg)
        self.assertIn("Nothing was uploaded", msg)
        self.assertEqual(len([c for c in yt.http.calls if "channels" in c["url"]]), 2)

    def test_a_missing_channel_setting_is_refused_without_any_request(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            yt = YouTube(FakeHttp([]), client_id="cid", client_secret="x", refresh_token="r")
            with self.assertRaises(YouTubeError) as ctx:
                yt.verify_channel()
        self.assertIn("YOUTUBE_CHANNEL_ID", str(ctx.exception))
        self.assertEqual(yt.http.calls, [])


class ListingTests(unittest.TestCase):
    def test_uploads_are_listed_page_by_page_from_the_uploads_playlist(self):
        ch = ("GET https://www.googleapis.com/youtube/v3/channels", j(200, {"items": [
            {"id": CHANNEL, "snippet": {"title": "x"}, "contentDetails": {"relatedPlaylists": {"uploads": "UUabc"}}}]}))
        page = lambda items, nxt=None: ("GET https://www.googleapis.com/youtube/v3/playlistItems", j(200, dict(
            {"items": [{"id": f"I{v}", "snippet": {"title": t, "resourceId": {"videoId": v}}} for v, t in items]},
            **({"nextPageToken": nxt} if nxt else {}))))
        yt = client([ch, page([("V1", "One")], "p2"), page([("V2", "Two")])])
        got = yt.channel_uploads()
        self.assertEqual([(v["videoId"], v["title"]) for v in got], [("V1", "One"), ("V2", "Two")])
        calls = [c for c in yt.http.calls if "playlistItems" in c["url"]]
        self.assertEqual(calls[0]["params"], {"part": "snippet", "playlistId": "UUabc", "maxResults": "50"})
        self.assertEqual(calls[1]["params"]["pageToken"], "p2")
        self.assertEqual(yt.quota_used, 3)

    def test_video_status(self):
        yt = client([("GET https://www.googleapis.com/youtube/v3/videos", j(200, {"items": [{"status": {"privacyStatus": "private", "uploadStatus": "rejected", "rejectionReason": "duplicate"}}]})),
                     ("GET https://www.googleapis.com/youtube/v3/videos", j(200, {"items": []}))])
        self.assertEqual(yt.video_status("V")["rejectionReason"], "duplicate")
        self.assertIsNone(yt.video_status("gone"))

    def test_oauth_errors_keep_their_reason(self):
        e = youtube._error(Resp(400, {}, json.dumps({"error": "invalid_grant", "error_description": "Token has been expired or revoked."}).encode()), "OAuth")
        self.assertEqual(e.reason, "invalid_grant")
        self.assertIn("expired or revoked", str(e))

    def test_a_refused_call_is_counted(self):
        yt = client([("POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set", j(403, {"error": {"errors": [{"reason": "forbidden"}]}}))])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.png"
            p.write_bytes(b"x")
            with self.assertRaises(YouTubeError) as ctx:
                yt.set_thumbnail("V", p)
        self.assertEqual((ctx.exception.status, ctx.exception.reason, yt.quota_used), (403, "forbidden", 50))

    def test_youtube_ids(self):
        self.assertEqual(youtube.youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "dQw4w9WgXcQ")
        self.assertEqual(youtube.youtube_id("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertIsNone(youtube.youtube_id("https://www.youtube.com/embed/dQw4w9WgXcQ"))
        self.assertIsNone(youtube.youtube_id("http://youtu.be/dQw4w9WgXcQ"))


if __name__ == "__main__":
    unittest.main()
