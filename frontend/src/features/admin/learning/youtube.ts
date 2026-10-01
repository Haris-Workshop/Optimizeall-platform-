import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, API_BASE, refreshSession, tokenStore } from '@/lib/api/client';
import { ApiError, networkError, parseErrorResponse } from '@/lib/api/errors';
import { formatBytes } from '@/lib/format/text';

/** Automatic YouTube upload of lecture videos (docs/LEARNING.md). Paths are relative to /api/v1. */
const base = '/admin/learning';

export type YouTubeUploadStatus = 'pending' | 'uploading' | 'processing' | 'ready' | 'failed';
export type YouTubePrivacy = 'private' | 'unlisted' | 'public';

export interface YouTubeStatus {
  configured: boolean;
  missingVariables: string[];
  channelId: string | null;
  channelTitle: string | null;
  expectedChannelId: string | null;
  channelMatches: boolean | null;
  error: string | null;
}

/** One lesson's upload as the API answers it (enum values arrive in either casing; see `normalizeUpload`). */
export interface YouTubeUpload {
  lessonSlug: string;
  status: YouTubeUploadStatus;
  privacy: YouTubePrivacy;
  actualPrivacy: string | null;
  videoId: string | null;
  watchUrl: string | null;
  error: string | null;
  errorCode: string | null;
  notice: string | null;
  uploadedAt: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  fileName: string | null;
}

export interface CourseYouTube {
  playlistId: string | null;
  uploads: YouTubeUpload[];
}

export const youTubeKeys = {
  status: ['admin', 'learning', 'youtube', 'status'] as const,
  course: (courseId: string) => ['admin', 'learning', 'course', courseId, 'youtube'] as const,
};

const STATUSES: readonly YouTubeUploadStatus[] = ['pending', 'uploading', 'processing', 'ready', 'failed'];
const PRIVACIES: readonly YouTubePrivacy[] = ['private', 'unlisted', 'public'];

/** The API serializes enums as PascalCase or camelCase depending on the DTO; the UI works in lower case. */
export function normalizeUpload(raw: YouTubeUpload): YouTubeUpload {
  const status = String(raw.status).toLowerCase() as YouTubeUploadStatus;
  const privacy = String(raw.privacy).toLowerCase() as YouTubePrivacy;
  return {
    ...raw,
    status: STATUSES.includes(status) ? status : 'pending',
    privacy: PRIVACIES.includes(privacy) ? privacy : 'unlisted',
    actualPrivacy: raw.actualPrivacy ? String(raw.actualPrivacy).toLowerCase() : null,
  };
}

/** Rows that will still change on their own: polling continues until none is left. */
export function isActiveStatus(status: YouTubeUploadStatus): boolean {
  return status === 'pending' || status === 'uploading' || status === 'processing';
}

export const YOUTUBE_POLL_MS = 4000;

export function useYouTubeStatus() {
  return useQuery({
    queryKey: youTubeKeys.status,
    queryFn: ({ signal }) => api.get<YouTubeStatus>(`${base}/youtube/status`, { signal }),
    staleTime: 60_000,
  });
}

/**
 * The course's YouTube uploads. Refetches every few seconds while any row is queued, uploading or processing, stops
 * when all are ready or failed, and pauses while the tab is hidden (catching up as soon as it is visible again).
 */
export function useCourseYouTube(courseId: string, enabled = true) {
  const qc = useQueryClient();
  const key = youTubeKeys.course(courseId);
  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async ({ signal }) => {
      const data = await api.get<CourseYouTube>(`${base}/courses/${courseId}/youtube`, { signal });
      return { ...data, uploads: data.uploads.map(normalizeUpload) };
    },
    refetchInterval: (q) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
      return q.state.data?.uploads.some((u) => isActiveStatus(u.status)) ? YOUTUBE_POLL_MS : false;
    },
    refetchIntervalInBackground: false,
  });

  const active = query.data?.uploads.some((u) => isActiveStatus(u.status)) ?? false;
  useEffect(() => {
    if (!active) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void qc.invalidateQueries({ queryKey: key });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active, qc, key]);

  /** Puts a row the API just answered into the cache so the UI updates (and polling restarts) without waiting. */
  const applyUpload = (upload: YouTubeUpload) => {
    const row = normalizeUpload(upload);
    qc.setQueryData<CourseYouTube>(key, (old) => {
      const uploads = old?.uploads ?? [];
      const exists = uploads.some((u) => u.lessonSlug === row.lessonSlug);
      return {
        playlistId: old?.playlistId ?? null,
        uploads: exists ? uploads.map((u) => (u.lessonSlug === row.lessonSlug ? row : u)) : [...uploads, row],
      };
    });
  };
  return { query, applyUpload };
}

const lessonPath = (courseId: string, lessonSlug: string) =>
  `${base}/courses/${courseId}/lessons/${encodeURIComponent(lessonSlug)}/youtube`;

export const retryYouTubeUpload = (courseId: string, lessonSlug: string) =>
  api.post<YouTubeUpload>(`${lessonPath(courseId, lessonSlug)}/retry`);

export const resyncYouTubeUpload = (courseId: string, lessonSlug: string) =>
  api.post<YouTubeUpload>(`${lessonPath(courseId, lessonSlug)}/resync`);

// ---------- Client-side file check ----------

export const YOUTUBE_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'] as const;
export const YOUTUBE_ACCEPT = YOUTUBE_VIDEO_EXTENSIONS.join(',');
/** Largest lecture video the upload form accepts (YouTube itself takes far more; this keeps one request bounded). */
export const YOUTUBE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** A user-facing message, or null when the file can be uploaded. */
export function validateLectureVideo(file: File, maxBytes: number = YOUTUBE_MAX_BYTES): string | null {
  const name = file.name.toLowerCase();
  if (!YOUTUBE_VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext)))
    return `“${file.name}” isn’t supported. Choose an MP4, MOV or WebM video.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > maxBytes) return `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  return null;
}

// ---------- Upload with byte progress ----------

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadOptions {
  privacy: YouTubePrivacy;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

function sendOnce(url: string, form: FormData, token: string | null, options: UploadOptions): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Requested-With', 'fetch');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.({ loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => {
      options.signal?.removeEventListener('abort', abort);
      resolve({ status: xhr.status, body: xhr.responseText, type: xhr.getResponseHeader('Content-Type') ?? '' });
    };
    xhr.onerror = () => {
      options.signal?.removeEventListener('abort', abort);
      reject(networkError());
    };
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    if (options.signal) {
      if (options.signal.aborted) return reject(new DOMException('Upload cancelled', 'AbortError'));
      options.signal.addEventListener('abort', abort, { once: true });
    }
    xhr.send(form);
  });
}

/**
 * Uploads a lecture video (multipart) with real byte progress (XMLHttpRequest upload events; fetch cannot report
 * them). Same auth as the API client: bearer token, one refresh-and-retry on 401. Rejects with ApiError, or with an
 * AbortError DOMException when `signal` aborts.
 */
export async function uploadLessonVideo(courseId: string, lessonSlug: string, file: File, options: UploadOptions): Promise<YouTubeUpload> {
  const url = `${API_BASE}${lessonPath(courseId, lessonSlug)}`;
  const form = () => {
    const f = new FormData();
    f.append('file', file);
    f.append('privacy', options.privacy);
    return f;
  };
  const tokenUsed = tokenStore.get();
  let result = await sendOnce(url, form(), tokenUsed, options);
  if (result.status === 401) {
    const session = await refreshSession().catch(() => null);
    if (!session)
      throw new ApiError({ status: 401, code: 'auth.session_expired', title: 'Your session has expired. Please sign in again.' });
    result = await sendOnce(url, form(), session.accessToken, options);
  }
  if (result.status < 200 || result.status >= 300)
    throw await parseErrorResponse(new Response(result.body, { status: result.status, headers: { 'Content-Type': result.type } }));
  return normalizeUpload(JSON.parse(result.body) as YouTubeUpload);
}

// ---------- Plain-language errors ----------

export interface UploadProblem {
  tone: 'warning' | 'danger';
  title?: string;
  message: string;
  /** True when an administrator must re-authorize the YouTube connection (shown prominently). */
  reauthorize?: boolean;
}

/** Friendly copy for a failed row. `format` renders the quota-reset time. */
export function describeUploadProblem(upload: YouTubeUpload, format: (iso: string) => string): UploadProblem | null {
  if (upload.status !== 'failed' && !upload.errorCode) return null;
  switch (upload.errorCode) {
    case 'quota_exceeded':
      return {
        tone: 'warning',
        message: `YouTube’s daily upload quota is used up. This will retry automatically after the daily quota resets${
          upload.nextAttemptAt ? ` (next attempt ${format(upload.nextAttemptAt)})` : ''
        }.`,
      };
    case 'invalid_grant':
      return {
        tone: 'danger',
        title: 'Re-authorize the YouTube connection',
        reauthorize: true,
        message:
          'YouTube no longer accepts the saved authorization (it was revoked or has expired). An administrator must re-authorize the YouTube connection before any lecture can be uploaded. Retrying will not help until then.',
      };
    case 'channel_mismatch':
      return {
        tone: 'danger',
        message: 'The connected YouTube channel isn’t the channel this platform is set up to publish to. Connect the expected channel, then retry.',
      };
    case 'upload_failed':
      return { tone: 'danger', message: 'YouTube didn’t accept the upload. Check the video file, then retry.' };
    case 'not_configured':
      return { tone: 'danger', message: 'YouTube uploads aren’t set up on this server yet. Ask an administrator to finish the YouTube configuration.' };
    default:
      return { tone: 'danger', message: upload.error ?? 'The upload failed. Try again.' };
  }
}

export const STATUS_LABELS: Record<YouTubeUploadStatus, string> = {
  pending: 'Queued',
  uploading: 'Uploading',
  processing: 'Processing on YouTube',
  ready: 'Ready',
  failed: 'Failed',
};
