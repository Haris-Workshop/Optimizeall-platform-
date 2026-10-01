# Automatic YouTube upload of lecture videos

Optional feature of the Learning module ([LEARNING.md](LEARNING.md)). An administrator uploads a lecture video once; the
API queues it, uploads it to the Optimize All YouTube channel (@optimizeall, channel id `UC2fDn6VljqnoQQhvYCt6o0Q`),
waits for YouTube to process it and links it into the lesson as a normal YouTube `src` (nocookie embed). Nothing else
changes: lessons keep working with any YouTube URL entered by hand.

## 1. Setup

1. **Google Cloud project.** [console.cloud.google.com](https://console.cloud.google.com/) -> pick or create a project ->
   **APIs & Services -> Library -> YouTube Data API v3 -> Enable**.
2. **OAuth consent screen.** External, fill in app name, support email and privacy/terms URLs, add the scopes below, then
   **Publish app** so its status is **In production**. In *Testing* status Google expires refresh tokens after **7 days**
   and the feature would stop weekly with `invalid_grant`. (Unverified apps in production show a warning screen at
   consent; that is fine for the channel owner approving their own app.)
3. **OAuth client.** Credentials -> Create credentials -> OAuth client ID. Type **Web application** with the redirect URI
   `https://developers.google.com/oauthplayground` (used only to obtain the token below), or **Desktop app** if you use a
   local script. This yields `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.
4. **Refresh token for the channel owner.** Sign in as the Google account that owns the Optimize All channel (if it is a
   brand account, select the channel when asked) and authorize these scopes with offline access (`access_type=offline`,
   `prompt=consent`):
   * `https://www.googleapis.com/auth/youtube.upload` - `videos.insert`
   * `https://www.googleapis.com/auth/youtube` - playlists (`playlists.list/insert`, `playlistItems.insert`),
     `channels.list?mine=true` (channel guard) and `videos.list` (processing status)

   The OAuth Playground (gear icon: "Use your own OAuth credentials", offline access) is the easiest way; copy the
   **refresh token** it returns. Store it as `YOUTUBE_REFRESH_TOKEN`; never paste it in tickets, chat or the repository.
5. Set the four variables (section 2) on the API and restart it. The admin Learning screen then shows the upload action.

Scope reconciliation with `tools/lecture-studio`: its uploader documents `youtube.upload` + `youtube.force-ssl`
(`force-ssl` is what `captions.insert` needs; this feature does not upload captions). `youtube` is the broader scope
that also covers playlist and list calls, so the API needs `upload` + `youtube`. One token serves both tools only if it
was granted all three scopes; otherwise use a separate token per tool (both keep the same variable names).

## 2. Environment variables

| Variable | Secret | Meaning |
|---|---|---|
| `YOUTUBE_CLIENT_ID` | no (keep with the others) | OAuth client id |
| `YOUTUBE_CLIENT_SECRET` | **yes** | OAuth client secret (`YOUTUBE_CLIENT_SECRET_FILE` in the container image) |
| `YOUTUBE_REFRESH_TOKEN` | **yes** | channel owner's refresh token (`YOUTUBE_REFRESH_TOKEN_FILE`) |
| `YOUTUBE_CHANNEL_ID` | no | the channel uploads must land on (public id above) |
| `YouTube__DefaultPrivacy` | no | optional: `unlisted` (default), `private` or `public` |
| `YouTube__MaxUploadBytes` | no | optional: largest accepted file in bytes (nginx allows 2 GB on the upload route) |

None set = feature disabled (upload actions hidden, endpoints answer "not configured"). Some set but not all = the API
**stops at startup** with a message naming the missing variables, so a half-configured production never runs. Samples:
[`.env.example`](../.env.example) (YouTube section), `render.yaml` / `deploy/render/render-mysql.yaml` (`sync: false`,
no values), [DEPLOYMENT.md](DEPLOYMENT.md#510-features-that-depend-on-external-credentials).

**Channel guard.** Before each upload the API calls `channels.list?mine=true` with the stored credentials and refuses to
upload unless the returned channel id equals `YOUTUBE_CHANNEL_ID`. A token for the wrong Google account or channel can
therefore never publish to another channel; the job fails with a clear message instead.

## 3. Flow, statuses, retries

Admin picks a lesson and uploads the video file -> the API stores it and queues a (`pending`) row in `lesson_youtube_uploads` ->
a background job (leased, safe with several API instances) starts a **resumable** upload (`videos.insert`, chunked, resumes
from the last acknowledged byte) -> YouTube **processes** the video (job polls `videos.list`) -> **ready** -> the lesson's
video `src` is set to the YouTube URL (embedded through `youtube-nocookie.com`, see LEARNING.md) and the course playlist
(`courses.youtube_playlist_id`, created once on first use) gets the video.

Statuses (lifecycle order): `pending` -> `uploading` -> `processing` -> `ready`; plus `failed` (needs an admin action
or has exhausted retries). A quota wait stays in its current status with a later next-attempt time. The row also keeps the YouTube video id,
the privacy actually applied, the attempt count, the next attempt time and the last error text (no secrets).

Retry and backoff:
* Network errors, HTTP 5xx and rate limits: exponential backoff with jitter, resuming the same upload session.
* An expired access token (401) is refreshed once automatically from the refresh token.
* `quotaExceeded` is **never** retried in a loop: the job waits until the quota resets (**midnight Pacific time**) and
  continues then.
* Permanent errors (invalid file, forbidden, channel mismatch, `invalid_grant`) fail the row immediately with the message.

## 4. Quota

The default YouTube Data API quota is 10,000 units per project per day and `videos.insert` costs **1,600 units**, so a
default project publishes about **6 uploads per day** (playlist and list calls cost 1-50 units each). Plan batches
accordingly; a quota extension is requested through Google's audit/extension form. Google has changed quota rules before,
so check the current figures in the Google Cloud console quota page and the official docs before large batches (the
`tools/lecture-studio` README quotes different, third-party figures for the same call; trust the console).

## 5. Unverified API project limitation

Videos uploaded through an API project that has **not passed Google's API compliance audit** are locked to **Private**
by YouTube, whatever privacy is requested. The system detects the privacy actually applied, reports it to the admin as a
**notice** (not an error), and **does not link a private video into the public lesson page** (it would show "video
unavailable" to learners). Apply for the audit (YouTube API Services - Audit and Quota Extension Form); once approved,
re-run the affected rows (or re-link them) and they become embeddable. Until then lectures can be reviewed on YouTube
Studio by the channel owner and the lesson keeps its manual URL option.

## 6. Data model

* New table **`lesson_youtube_uploads`**: one row per upload attempt for a lesson (course and lesson ids, status,
  YouTube video id, applied privacy, attempts, next attempt time, last error, timestamps).
* New column **`courses.youtube_playlist_id`**: the YouTube playlist of the course, created on first upload and reused.
* Lessons are **not rows**: they live inside the versioned course pack JSON (LEARNING.md section 2), so upload state
  cannot be a column on a lesson. The table references the lesson by its stable id within the course instead, and a ready
  upload writes the video `src` through the normal lesson-video edit path (validation, content hash and versioning apply).

## 7. Admin usage

Admin portal -> Learning -> a course -> lesson videos: choose the file for a lesson and start the upload; follow the
status (pending / uploading / processing / ready / failed), see notices (private-only project, quota wait) and use retry
after fixing a failed row. Requires the existing Learning management permission (`learning.manage`). The browser sends the file
to the API once (up to 2 GB through the bundled nginx, which uses a dedicated location with a long timeout for this route
only); everything after that is server-side, so the admin can close the page.

Endpoints (all under `/api/v1/admin/learning`, as used by the admin UI): `GET /youtube/status` (configured?, missing
variables, channel id/title and whether it matches `YOUTUBE_CHANNEL_ID`), `GET /courses/{course}/youtube` (playlist id
and the course's upload rows), `POST /courses/{course}/lessons/{lesson}/youtube` (multipart file; the 2 GB route),
`POST .../youtube/retry` and `POST .../youtube/resync` (re-read the video's state from YouTube and relink). A row exposes
`lessonSlug`, `status`, `privacy`, `actualPrivacy`, `videoId`, `watchUrl`, `error`, `errorCode`, `notice`, `uploadedAt`,
`attempts`, `nextAttemptAt`, `fileName`.

## 8. Security notes

* Secrets only from environment or `_FILE` secret files; never in `appsettings*.json`, logs, API responses, the database
  or the row's error text. Treat the refresh token like the channel password.
* Only authenticated admins with the Learning manage permission can upload; file type and size are validated server-side
  (the proxy limit is only a cap).
* The channel guard prevents uploads to an unintended channel. Revoking the app at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions) disables the feature immediately.
* Rotate by creating a new client secret / refresh token, updating the secret, restarting the API.

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| API will not start, names missing `YOUTUBE_*` variables | partial configuration: set all four or clear all |
| `invalid_grant` | refresh token revoked, expired (app still in *Testing*: 7 days), password changed with Gmail scopes, or the client was deleted. Set the app to **In production**, re-run the consent (section 1.4), replace `YOUTUBE_REFRESH_TOKEN`, restart, retry failed rows |
| `quotaExceeded` / row waiting | daily quota used (about 6 uploads); it continues after the midnight Pacific reset |
| Video is Private on YouTube and not shown in the lesson | unverified API project (section 5) |
| Channel mismatch / forbidden | token belongs to another account or brand channel; redo consent selecting the Optimize All channel |
| 413 or timeout from the proxy | another proxy in front of nginx limits body size/time on the upload route: allow `client_max_body_size 2g`, no request buffering, 1 h timeouts there |
| Stuck in `processing` | YouTube is still transcoding a long video; it is polled until ready |

## 10. Relationship to `tools/lecture-studio`

[`tools/lecture-studio`](../tools/lecture-studio/README.md) is the offline producer that renders lectures and has its
own YouTube uploader (resumable upload, thumbnail, captions, playlist, ledger `youtube-ledger.json`, patch file
`lecture-src-patch.json`). It is a **separate path to the same channel** with the same variable names and its own
playlist cache; the two share neither ledger nor database. Do not upload the same lesson with both: pick one per
lesson (offline batch for the bulk catalog, the admin upload for individual replacements), and remember they draw from
the **same project quota**.
