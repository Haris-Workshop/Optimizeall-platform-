import { Clapperboard, ExternalLink, RefreshCw, RotateCcw, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DateTime } from '@/components/ui/DateTime';
import { FormField } from '@/components/ui/FormField';
import { ProgressBar } from '@/components/ui/Progress';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toastContext';
import { formatDateTime } from '@/lib/format/dates';
import { formatBytes } from '@/lib/format/text';
import { QueryError } from '../shared/common';
import { adminErrorMessage } from '../shared/errors';
import {
  describeUploadProblem,
  isActiveStatus,
  resyncYouTubeUpload,
  retryYouTubeUpload,
  STATUS_LABELS,
  uploadLessonVideo,
  useYouTubeStatus,
  validateLectureVideo,
  YOUTUBE_ACCEPT,
  YOUTUBE_MAX_BYTES,
  type UploadProgress,
  type YouTubePrivacy,
  type YouTubeUpload,
  type YouTubeUploadStatus,
} from './youtube';
import './youtube.css';

const STATUS_TONE: Record<YouTubeUploadStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  pending: 'neutral',
  uploading: 'info',
  processing: 'info',
  ready: 'success',
  failed: 'danger',
};

const PRIVACY_OPTIONS = [
  { value: 'unlisted', label: 'Unlisted (anyone with the link)' },
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
];

/** The YouTube connection at the top of the Videos tab: connected channel, or what is missing. */
export function YouTubeConnectionPanel() {
  const q = useYouTubeStatus();
  return (
    <Card as="section" aria-labelledby="yt-connection-heading">
      <CardHeader
        title="YouTube connection"
        titleId="yt-connection-heading"
        description="Lecture videos you upload here are published to the platform’s YouTube channel."
        actions={<Clapperboard aria-hidden="true" />}
      />
      <CardBody className="stack">
        {q.isPending ? (
          <Skeleton height={48} />
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data.configured ? (
          <Alert tone="warning" title="YouTube isn’t configured">
            Uploads are unavailable until these server settings are provided:{' '}
            {q.data.missingVariables.map((name, i) => (
              <span key={name}>
                {i > 0 && ', '}
                <code>{name}</code>
              </span>
            ))}
            {q.data.missingVariables.length === 0 && 'the YouTube settings'}.
          </Alert>
        ) : (
          <>
            <dl className="yt-facts">
              <div>
                <dt>Connected channel</dt>
                <dd>{q.data.channelTitle ?? 'Unknown channel'}</dd>
              </div>
              <div>
                <dt>Channel ID</dt>
                <dd>
                  <code>{q.data.channelId ?? '–'}</code>
                </dd>
              </div>
              <div>
                <dt>Expected channel</dt>
                <dd>
                  <code>{q.data.expectedChannelId ?? 'Not set'}</code>{' '}
                  {q.data.channelMatches === true && <Badge tone="success">Matches</Badge>}
                  {q.data.channelMatches === false && <Badge tone="danger">Doesn’t match</Badge>}
                  {q.data.channelMatches === null && <Badge>Not checked</Badge>}
                </dd>
              </div>
            </dl>
            {q.data.channelMatches === false && (
              <Alert tone="danger" title="Wrong YouTube channel connected">
                Uploads are blocked because the connected channel isn’t the expected one. Re-authorize the connection with the expected channel.
              </Alert>
            )}
            {q.data.error && (
              <Alert tone="danger" title="YouTube reported a problem">
                {q.data.error}
              </Alert>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function UploadStatusBadge({ upload }: { upload: Pick<YouTubeUpload, 'status'> }) {
  return (
    <Badge tone={STATUS_TONE[upload.status]} dot>
      {STATUS_LABELS[upload.status]}
    </Badge>
  );
}

const keptPrivate = (u: YouTubeUpload) => u.status === 'ready' && (u.actualPrivacy === 'private' && u.privacy !== 'private');

interface LessonUploadProps {
  courseId: string;
  lessonSlug: string;
  lessonTitle: string;
  upload: YouTubeUpload | undefined;
  /** Puts the API's answer into the course's upload list (restarts polling). */
  onUpload: (upload: YouTubeUpload) => void;
  /** Re-reads the course's upload list. */
  onRefresh: () => void;
}

/** One lesson's YouTube controls: upload with progress, status, retry, re-sync, watch link. */
export function LessonYouTubeUpload({ courseId, lessonSlug, lessonTitle, upload, onUpload, onRefresh }: LessonUploadProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<YouTubePrivacy>('unlisted');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<'retry' | 'resync' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const idBase = `yt-${lessonSlug}`;

  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (picked: File | undefined) => {
    setActionError(null);
    if (!picked) {
      setFile(null);
      setFileError(null);
      return;
    }
    const problem = validateLectureVideo(picked);
    setFileError(problem);
    setFile(problem ? null : picked);
  };

  const start = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setActionError(null);
    setProgress({ loaded: 0, total: file.size });
    try {
      const row = await uploadLessonVideo(courseId, lessonSlug, file, { privacy, signal: controller.signal, onProgress: setProgress });
      onUpload(row);
      toast.success('Upload sent to YouTube', `${file.name} is now ${STATUS_LABELS[row.status].toLowerCase()}.`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') toast.info('Upload cancelled', 'Nothing was sent to YouTube.');
      else setActionError(adminErrorMessage(e));
    } finally {
      abortRef.current = null;
      setSending(false);
      setProgress(null);
    }
  };

  const act = async (kind: 'retry' | 'resync') => {
    setBusy(kind);
    setActionError(null);
    try {
      const row = await (kind === 'retry' ? retryYouTubeUpload : resyncYouTubeUpload)(courseId, lessonSlug);
      onUpload(row);
      toast.success(kind === 'retry' ? 'Retrying the upload' : 'Status re-synced from YouTube');
    } catch (e) {
      setActionError(adminErrorMessage(e));
      onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const problem = upload ? describeUploadProblem(upload, (iso) => formatDateTime(iso)) : null;
  const active = sending || (upload ? isActiveStatus(upload.status) : false);
  const watchUrl = upload?.watchUrl && /^https:\/\//i.test(upload.watchUrl) ? upload.watchUrl : null;
  const percent = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <section className="yt-lesson" aria-label={`YouTube upload for ${lessonTitle}`}>
      <h4 className="yt-lesson__title">
        <Clapperboard aria-hidden="true" /> YouTube
      </h4>

      <div className="yt-status" role="status" aria-live="polite">
        {upload ? (
          <>
            <UploadStatusBadge upload={upload} />
            {keptPrivate(upload) && <Badge tone="warning">Kept private by YouTube</Badge>}
            {upload.fileName && <span className="text-small text-muted">{upload.fileName}</span>}
            {upload.status === 'ready' && upload.uploadedAt && (
              <span className="text-small text-muted">
                Uploaded <DateTime value={upload.uploadedAt} format="relative" />
              </span>
            )}
          </>
        ) : (
          <span className="text-small text-muted">No video uploaded to YouTube yet.</span>
        )}
      </div>

      {upload?.notice && (
        <Alert tone="warning" title={keptPrivate(upload) ? 'Kept private by YouTube' : 'Notice from YouTube'}>
          {upload.notice}
        </Alert>
      )}
      {problem && (
        <Alert tone={problem.tone} title={problem.title}>
          {problem.message}
        </Alert>
      )}
      {actionError && <Alert tone="danger">{actionError}</Alert>}

      <div className="yt-controls">
        <FormField label="Lecture video file" id={`${idBase}-file`} error={fileError ?? undefined} hint={`MP4, MOV or WebM, up to ${formatBytes(YOUTUBE_MAX_BYTES)}.`}>
          <input
            ref={fileRef}
            id={`${idBase}-file`}
            type="file"
            accept={YOUTUBE_ACCEPT}
            disabled={active}
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </FormField>
        <FormField label="Privacy" id={`${idBase}-privacy`}>
          <Select
            id={`${idBase}-privacy`}
            value={privacy}
            options={PRIVACY_OPTIONS}
            disabled={active}
            onChange={(e) => setPrivacy(e.target.value as YouTubePrivacy)}
          />
        </FormField>
      </div>

      {progress && (
        <div className="yt-progress">
          <ProgressBar
            label={`Uploading ${file?.name ?? 'video'}`}
            value={progress.loaded}
            max={Math.max(progress.total, 1)}
            valueText={`${percent}% · ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}`}
          />
          <Button size="sm" variant="secondary" leadingIcon={<X />} onClick={() => abortRef.current?.abort()}>
            Cancel upload
          </Button>
        </div>
      )}

      <div className="lx-actions">
        <Button leadingIcon={<Upload />} disabled={!file || active} onClick={() => void start()}>
          Upload to YouTube
        </Button>
        {upload?.status === 'failed' && (
          <Button variant="secondary" leadingIcon={<RotateCcw />} loading={busy === 'retry'} disabled={busy !== null} onClick={() => void act('retry')}>
            Retry
          </Button>
        )}
        {upload?.videoId && (
          <Button variant="secondary" leadingIcon={<RefreshCw />} loading={busy === 'resync'} disabled={busy !== null} onClick={() => void act('resync')}>
            Re-sync
          </Button>
        )}
        {watchUrl && (
          <a className="ui-link yt-watch" href={watchUrl} target="_blank" rel="noopener noreferrer">
            Watch on YouTube<span className="visually-hidden"> (opens in a new tab): {lessonTitle}</span> <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}
