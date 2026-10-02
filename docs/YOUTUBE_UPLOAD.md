# Automatic YouTube upload of lecture videos

Optional feature of the Learning module ([LEARNING.md](LEARNING.md)). An administrator uploads a lecture video once; the
API queues it, uploads it to the Optimize All YouTube channel (@optimizeall, channel id `UC2fDn6VljqnoQQhvYCt6oOQ`),
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
| `YouTube__MaxUploadBytes` | no | optional: largest accepted file in bytes (nginx allows 2100 MB on the upload route: 2 GB plus multipart overhead and the thumbnail) |
| `YouTube__UploadLeaseSeconds` / `YouTube__HeartbeatSeconds` | no | optional tuning: how long a worker owns an upload without renewing it (default 600) and how often a running upload renews it (default 60) |

None set = feature disabled (upload actions hidden, endpoints answer "not configured"). Some set but not all = the API
**stops at startup** with a message naming the missing variables, so a half-configured production never runs. Samples:
[`.env.example`](../.env.example) (YouTube section), `render.yaml` / `deploy/render/render-mysql.yaml` (`sync: false`,
no values), [DEPLOYMENT.md](DEPLOYMENT.md#510-features-that-depend-on-external-credentials).

**Channel guard.** Before each upload the API calls `channels.list?mine=true` with the stored credentials and refuses to
upload unless the returned channel id equals `YOUTUBE_CHANNEL_ID`. A token for the wrong Google account or channel can
therefore never publish to another channel; the job fails with a clear message instead.

## 3. Flow, statuses, retries

Admin picks a lesson and uploads the video file -> the API stores it and queues a (`pending`) row in `lesson_youtube_uploads` ->
the **upload job** (`YouTubeUploadJob`, every minute) claims the row with a conditional update and a lease and starts a
**resumable** upload (`videos.insert`, chunked) -> YouTube **processes** the video, followed by the separate
**processing job** (`YouTubeProcessingJob`, every minute, its own lease, so a long upload never delays it) -> **ready**
-> the lesson's video `src` is set to the YouTube URL (embedded through `youtube-nocookie.com`, see LEARNING.md) and the
course playlist (`learning_courses.YouTubePlaylistId`, created once on first use) gets the video. Both jobs are safe to run
on several API instances at once.

**Leases.** An upload row is owned by one worker for `UploadLeaseSeconds`; the worker renews the lease every
`HeartbeatSeconds` (a failed renewal is logged and retried at the next tick). If a renewal finds the row taken over (lease
expired, another instance reclaimed it) the upload is cancelled and the row is left to its new owner; the old worker never
fails the row. A worker that died leaves an expired lease: the row is queued again and that attempt counts.

**No second video after a lost response.** The description of every uploaded video ends with the line
`optimizeall-upload:<uploadId>`. Before any re-attempt of a row that may already have reached YouTube (a previous attempt
failed, timed out or was reclaimed), the job looks for that marker among the channel's recent uploads (about 50, 3 quota
units) and **adopts** the video it finds (status `processing`) instead of uploading again. A first attempt never searches.
If the search itself fails the file is not sent blind: the failure is handled like any upload error (backoff or quota wait).
Limitation: after a *Retry* of a video YouTube rejected, the old rejected video carries the same marker, so a response lost
during that second upload could adopt the rejected one, which then fails again and needs one more Retry.

**Processing.** A video still processing is looked at after 1, 2, 5, then every 10 minutes. After **24 hours** in
`processing` the row becomes `failed` with `errorCode` `processing_timeout`; check the video in YouTube Studio, then press
**Re-sync**. A permanent refusal (`forbidden`) while following a video fails the row at once; temporary errors back off the
same way. The public lesson `processing` flag is true only while a row is pending, uploading or processing, so it turns
false as soon as a row fails. Re-sync takes the same lease as the job: while the job (or an upload) holds the row it answers
409 `youtube.busy`.

**Playlist.** The playlist id is stored with a conditional update; if two workers create a playlist at the same moment the
loser uses the winner's playlist and deletes its own extra one. The position of a new video is computed from the playlist's
real items (before the first item of a later lesson, otherwise at the end); if the playlist cannot be read the video is
appended and the row shows a notice.

**Files.** The uploaded file stays in private storage until YouTube confirmed the video (then it is deleted). A lecture
poster is used as the thumbnail only if it is an image of the learning media (`LearningMedia`); any other file id is ignored
with a notice ("No thumbnail was set..."). The processing job also deletes the file of an upload that has been `failed`
for **14 days** (the row stays, `errorCode` becomes `file_expired`, with a notice) and stored upload files that no upload
row refers to any more (older than a day). Staged lecture files can only be read through `/api/v1/files/{id}` by staff with
`learning.manage`, whatever their public flag says. A lesson that no longer exists in the course fails the row with
`lesson_missing` (no attempts are used).

Every call that acts on the channel (thumbnail, status polling, playlist, re-sync) first verifies the channel guard.

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
  YouTube video id, applied privacy, attempts, next attempt time, last error, timestamps, lease, `ProcessingSince`,
  `PollAttempts`, `UploadMayExist`; unique on course + lesson, so enqueueing is idempotent).
* New column **`learning_courses.YouTubePlaylistId`**: the YouTube playlist of the course, created on first upload and reused.
* Migrations `AddLessonYouTubeUploads` and `AddYouTubeUploadProcessingState` (both providers, incremental).
* Lessons are **not rows**: they live inside the versioned course pack JSON (LEARNING.md section 2), so upload state
  cannot be a column on a lesson. The table references the lesson by its stable id within the course instead, and a ready
  upload writes the video `src` through the normal lesson-video edit path (validation, content hash and versioning apply).

## 7. Admin usage

Admin portal -> Learning -> a course -> lesson videos: choose the file for a lesson and start the upload; follow the
status (pending / uploading / processing / ready / failed), see notices (private-only project, quota wait) and use retry
after fixing a failed row. Requires the existing Learning management permission (`learning.manage`). The browser sends the file
to the API once (up to 2 GB; the bundled nginx allows 2100 MB on this route, which uses a dedicated location with a long timeout for this route
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
| `channel_mismatch` on the very first upload | `YOUTUBE_CHANNEL_ID` was mistyped. YouTube channel ids mix the letter **O** and the digit **0** (and `l`/`I`/`1`), which are easy to confuse when copying. Copy the id from the `channels.list` response (admin YouTube status panel) instead of retyping it |
| `invalid_grant` | refresh token revoked, expired (app still in *Testing*: 7 days), password changed with Gmail scopes, or the client was deleted. Set the app to **In production**, re-run the consent (section 1.4), replace `YOUTUBE_REFRESH_TOKEN`, restart, retry failed rows |
| `quotaExceeded` / row waiting | daily quota used (about 6 uploads); it continues after the midnight Pacific reset |
| Video is Private on YouTube and not shown in the lesson | unverified API project (section 5) |
| Channel mismatch / forbidden | token belongs to another account or brand channel; redo consent selecting the Optimize All channel |
| 413 or timeout from the proxy | another proxy in front of nginx limits body size/time on the upload route: allow `client_max_body_size 2100m`, no request buffering, 1 h timeouts there |
| Stuck in `processing` | YouTube is still transcoding a long video; it is polled with back-off. After 24 h the row fails with `processing_timeout`: check Studio, then press Re-sync |
| `file_expired` | the failed upload's file was deleted after 14 days; upload the video again |
| `lesson_missing` | the lesson was removed from the course after the upload was queued |

## 10. Relationship to `tools/lecture-studio`

[`tools/lecture-studio`](../tools/lecture-studio/README.md) is the offline producer that renders lectures and has its
own YouTube publisher (`python3 -m studio publish`: resumable upload, thumbnail, captions, course playlist, ledger
`youtube-ledger.json`, committed log `tools/lecture-studio/youtube-uploads.md`; it writes the watch URL into
`lesson.lecture.src` + `publishedAt` of the course pack JSON). It is a **separate path to the same channel** with the
same variable names; it reuses a course playlist with the course title and skips any lecture whose exact title is
already on the channel, but the two share neither ledger nor database. Do not upload the same lesson with both: pick one per
lesson (offline batch for the bulk catalog, the admin upload for individual replacements), and remember they draw from
the **same project quota**.
