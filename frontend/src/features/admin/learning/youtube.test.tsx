import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { json, mockFetch } from '@/test/fetchMock';
import { axeViolations, testQueryClient } from '@/test/render';
import { LessonYouTubeUpload, YouTubeConnectionPanel } from './YouTubeUpload';
import {
  describeUploadProblem,
  normalizeUpload,
  useCourseYouTube,
  validateLectureVideo,
  YOUTUBE_MAX_BYTES,
  YOUTUBE_POLL_MS,
  type YouTubeUpload,
} from './youtube';

const row = (over: Partial<YouTubeUpload> = {}): YouTubeUpload => ({
  lessonSlug: 'l1',
  status: 'pending',
  privacy: 'unlisted',
  actualPrivacy: null,
  videoId: null,
  watchUrl: null,
  error: null,
  errorCode: null,
  notice: null,
  uploadedAt: null,
  attempts: 0,
  nextAttemptAt: null,
  fileName: null,
  ...over,
});

function renderUi(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

function Lesson({ upload, onUpload = vi.fn() }: { upload?: YouTubeUpload; onUpload?: (u: YouTubeUpload) => void }) {
  return <LessonYouTubeUpload courseId="c1" lessonSlug="l1" lessonTitle="What an agent is" upload={upload} onUpload={onUpload} onRefresh={vi.fn()} />;
}

afterEach(() => vi.unstubAllGlobals());

describe('status badges', () => {
  it.each([
    ['pending', 'Queued'],
    ['uploading', 'Uploading'],
    ['processing', 'Processing on YouTube'],
    ['ready', 'Ready'],
    ['failed', 'Failed'],
  ] as const)('shows %s as "%s" in a polite live region', (status, label) => {
    renderUi(<Lesson upload={row({ status })} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(within(region).getByText(label)).toBeInTheDocument();
  });

  it('accepts PascalCase enum values from the API', () => {
    expect(normalizeUpload({ ...row(), status: 'Processing' as never, privacy: 'Unlisted' as never }).status).toBe('processing');
  });

  it('shows the kept-private notice when YouTube overrides the privacy', () => {
    const { container } = renderUi(<Lesson upload={row({ status: 'ready', videoId: 'abc', actualPrivacy: 'private', notice: 'New channels keep videos private until verified.' })} />);
    expect(within(container.querySelector<HTMLElement>('.yt-status')!).getByText('Kept private by YouTube')).toBeInTheDocument();
    expect(screen.getByText('New channels keep videos private until verified.')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderUi(<Lesson upload={row({ status: 'failed', errorCode: 'upload_failed' })} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('action buttons', () => {
  it('offers Retry only for failed rows', () => {
    const { unmount } = renderUi(<Lesson upload={row({ status: 'failed' })} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    unmount();
    for (const status of ['pending', 'uploading', 'processing', 'ready'] as const) {
      const r = renderUi(<Lesson upload={row({ status, videoId: 'abc' })} />);
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      r.unmount();
    }
    renderUi(<Lesson />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('offers Re-sync and the watch link only when there is a video id / watch url', () => {
    const { unmount } = renderUi(<Lesson upload={row({ status: 'processing' })} />);
    expect(screen.queryByRole('button', { name: 'Re-sync' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Watch on YouTube/ })).toBeNull();
    unmount();
    renderUi(<Lesson upload={row({ status: 'ready', videoId: 'abc', watchUrl: 'https://www.youtube.com/watch?v=abc' })} />);
    expect(screen.getByRole('button', { name: 'Re-sync' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Watch on YouTube/ });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('posts retry and re-sync and shows the returned row', async () => {
    const onUpload = vi.fn();
    const { calls } = mockFetch({
      'POST /admin/learning/courses/c1/lessons/l1/youtube/retry': () => json(202, row({ status: 'pending' })),
      'POST /admin/learning/courses/c1/lessons/l1/youtube/resync': () => json(200, row({ status: 'ready', videoId: 'abc' })),
    });
    const { rerender } = renderUi(<Lesson upload={row({ status: 'failed', videoId: 'abc' })} onUpload={onUpload} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' })));
    await userEvent.click(screen.getByRole('button', { name: 'Re-sync' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' })));
    expect(calls.map((c) => c.path)).toEqual([
      '/admin/learning/courses/c1/lessons/l1/youtube/retry',
      '/admin/learning/courses/c1/lessons/l1/youtube/resync',
    ]);
    rerender(<div />);
  });
});

describe('error messages', () => {
  const fmt = (iso: string) => `at ${iso}`;

  it('maps every error code to plain language', () => {
    const msg = (errorCode: string | null, extra: Partial<YouTubeUpload> = {}) => describeUploadProblem(row({ status: 'failed', errorCode, ...extra }), fmt)!;
    expect(msg('quota_exceeded', { nextAttemptAt: '2026-10-02T08:00:00Z' }).message).toMatch(
      /will retry automatically after the daily quota resets \(next attempt at 2026-10-02T08:00:00Z\)/,
    );
    expect(msg('invalid_grant').reauthorize).toBe(true);
    expect(msg('channel_mismatch').message).toMatch(/isn’t the channel/);
    expect(msg('upload_failed').message).toMatch(/didn’t accept the upload/);
    expect(msg('not_configured').message).toMatch(/aren’t set up/);
    expect(msg(null, { error: 'Boom from YouTube' }).message).toBe('Boom from YouTube');
    expect(describeUploadProblem(row({ status: 'ready' }), fmt)).toBeNull();
  });

  it('shows a prominent re-authorize warning for invalid_grant, and the quota retry message', () => {
    const { unmount } = renderUi(<Lesson upload={row({ status: 'failed', errorCode: 'invalid_grant', error: 'raw' })} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Re-authorize the YouTube connection');
    expect(screen.queryByText('raw')).toBeNull();
    unmount();
    renderUi(<Lesson upload={row({ status: 'failed', errorCode: 'quota_exceeded', nextAttemptAt: '2026-10-02T08:00:00Z' })} />);
    expect(screen.getByText(/will retry automatically after the daily quota resets \(next attempt/)).toBeInTheDocument();
  });
});

describe('connection panel', () => {
  it('lists only the names of missing variables when not configured', async () => {
    mockFetch({
      'GET /admin/learning/youtube/status': () =>
        json(200, { configured: false, missingVariables: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_REFRESH_TOKEN'], channelId: null, channelTitle: null, expectedChannelId: null, channelMatches: null, error: null }),
    });
    renderUi(<YouTubeConnectionPanel />);
    const alert = await screen.findByText('YouTube isn’t configured');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('YOUTUBE_CLIENT_ID')).toBeInTheDocument();
    expect(screen.getByText('YOUTUBE_REFRESH_TOKEN')).toBeInTheDocument();
  });

  it('shows the connected channel and whether it matches the expected one', async () => {
    mockFetch({
      'GET /admin/learning/youtube/status': () =>
        json(200, { configured: true, missingVariables: [], channelId: 'UC123', channelTitle: 'Optimize All', expectedChannelId: 'UC123', channelMatches: true, error: null }),
    });
    const { unmount } = renderUi(<YouTubeConnectionPanel />);
    expect(await screen.findByText('Optimize All')).toBeInTheDocument();
    expect(screen.getByText('Matches')).toBeInTheDocument();
    unmount();
    mockFetch({
      'GET /admin/learning/youtube/status': () =>
        json(200, { configured: true, missingVariables: [], channelId: 'UC999', channelTitle: 'Other', expectedChannelId: 'UC123', channelMatches: false, error: null }),
    });
    renderUi(<YouTubeConnectionPanel />);
    expect(await screen.findByText('Doesn’t match')).toBeInTheDocument();
  });
});

describe('file check', () => {
  it('accepts mp4/mov/webm and rejects other types, empty and oversized files', () => {
    const f = (name: string, size = 10) => new File([new Uint8Array(Math.min(size, 10))], name, { type: '' });
    expect(validateLectureVideo(f('a.MP4'))).toBeNull();
    expect(validateLectureVideo(f('a.mov'))).toBeNull();
    expect(validateLectureVideo(f('a.webm'))).toBeNull();
    expect(validateLectureVideo(f('a.avi'))).toMatch(/isn’t supported/);
    expect(validateLectureVideo(new File([], 'a.mp4'))).toMatch(/empty/);
    const big = new File([new Uint8Array(4)], 'big.mp4');
    Object.defineProperty(big, 'size', { value: YOUTUBE_MAX_BYTES + 1 });
    expect(validateLectureVideo(big)).toMatch(/The limit is/);
  });
});

class FakeXhr {
  static last: FakeXhr | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  withCredentials = false;
  headers: Record<string, string> = {};
  method = '';
  url = '';
  body: FormData | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  getResponseHeader() {
    return 'application/json';
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
}

describe('upload with progress', () => {
  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXhr));

  it('rejects a bad file before sending and keeps the button disabled', async () => {
    renderUi(<Lesson />);
    const input = screen.getByLabelText('Lecture video file');
    await userEvent.upload(input, new File(['x'], 'notes.pdf', { type: 'application/pdf' }), { applyAccept: false });
    expect(await screen.findByText(/isn’t supported/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload to YouTube' })).toBeDisabled();
    expect(FakeXhr.last).toBeNull();
  });

  it('defaults privacy to unlisted, shows real byte progress, and posts the file and privacy', async () => {
    const onUpload = vi.fn();
    renderUi(<Lesson onUpload={onUpload} />);
    expect(screen.getByLabelText('Privacy')).toHaveValue('unlisted');
    await userEvent.selectOptions(screen.getByLabelText('Privacy'), 'private');
    await userEvent.upload(screen.getByLabelText('Lecture video file'), new File([new Uint8Array(1000)], 'lecture.mp4', { type: 'video/mp4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload to YouTube' }));
    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/v1/admin/learning/courses/c1/lessons/l1/youtube');
    expect(xhr.body!.get('privacy')).toBe('private');
    expect((xhr.body!.get('file') as File).name).toBe('lecture.mp4');
    act(() => xhr.upload.onprogress!({ lengthComputable: true, loaded: 250, total: 1000 }));
    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '250');
    expect(bar).toHaveAttribute('aria-valuemax', '1000');
    expect(bar).toHaveAttribute('aria-valuetext', expect.stringContaining('25%'));
    await act(async () => {
      xhr.status = 202;
      xhr.responseText = JSON.stringify({ ...row({ status: 'Uploading' as never, fileName: 'lecture.mp4' }) });
      xhr.onload!();
    });
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ status: 'uploading' })));
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  });

  it('can be cancelled', async () => {
    const onUpload = vi.fn();
    renderUi(<Lesson onUpload={onUpload} />);
    await userEvent.upload(screen.getByLabelText('Lecture video file'), new File(['abc'], 'lecture.webm', { type: 'video/webm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload to YouTube' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel upload' }));
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Upload to YouTube' })).toBeEnabled();
  });

  it('shows the server’s problem when the upload is refused', async () => {
    renderUi(<Lesson />);
    await userEvent.upload(screen.getByLabelText('Lecture video file'), new File(['abc'], 'lecture.mp4', { type: 'video/mp4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload to YouTube' }));
    const xhr = FakeXhr.last!;
    await act(async () => {
      xhr.status = 413;
      xhr.responseText = JSON.stringify({ status: 413, code: 'file.too_large', title: 'That video is too large.' });
      xhr.onload!();
    });
    expect(await screen.findByText('That video is too large.')).toBeInTheDocument();
  });
});

describe('polling', () => {
  function Harness() {
    const { query } = useCourseYouTube('c1');
    return <p data-testid="s">{query.data?.uploads.map((u) => u.status).join(',') ?? 'loading'}</p>;
  }

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('polls while a row is active, then stops once every row is terminal', async () => {
    let n = 0;
    const statuses = ['Uploading', 'processing', 'ready'];
    const { fn } = mockFetch({
      'GET /admin/learning/courses/c1/youtube': () => json(200, { playlistId: null, uploads: [row({ status: statuses[Math.min(n++, 2)] as never })] }),
    });
    renderUi(<Harness />);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('uploading'));
    await act(() => vi.advanceTimersByTimeAsync(YOUTUBE_POLL_MS + 50));
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('processing'));
    await act(() => vi.advanceTimersByTimeAsync(YOUTUBE_POLL_MS + 50));
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('ready'));
    const callsWhenDone = fn.mock.calls.length;
    expect(callsWhenDone).toBe(3);
    await act(() => vi.advanceTimersByTimeAsync(YOUTUBE_POLL_MS * 5));
    expect(fn.mock.calls.length).toBe(callsWhenDone);
  });

  it('does not poll when everything is already terminal, and pauses while the tab is hidden', async () => {
    const { fn } = mockFetch({
      'GET /admin/learning/courses/c1/youtube': () => json(200, { playlistId: null, uploads: [row({ status: 'failed' })] }),
    });
    const { unmount } = renderUi(<Harness />);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('failed'));
    await act(() => vi.advanceTimersByTimeAsync(YOUTUBE_POLL_MS * 3));
    expect(fn.mock.calls.length).toBe(1);
    unmount();

    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const second = mockFetch({
      'GET /admin/learning/courses/c1/youtube': () => json(200, { playlistId: null, uploads: [row({ status: 'processing' })] }),
    });
    renderUi(<Harness />);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('processing'));
    await act(() => vi.advanceTimersByTimeAsync(YOUTUBE_POLL_MS * 3));
    expect(second.fn.mock.calls.length).toBe(1);
    hidden.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(second.fn.mock.calls.length).toBeGreaterThan(1));
    hidden.mockRestore();
  });
});
