import { useLocation } from 'react-router-dom';
import { lazyPage } from '@/app/lazyPage';
import catalog from './siteVideos.json';

/**
 * Videos placed on built-in public pages in code (siteVideos.json, identical to the backend's site-videos.json).
 * Kept apart from the player so the always-loaded website frame carries only this catalog check: the player and its
 * Markdown transcript renderer are a separate chunk, fetched only on a page that has a video.
 */
const VIDEO_PATHS = new Set((catalog as { videos: { path: string }[] }).videos.map((v) => v.path));

const PageVideoList = lazyPage(() => import('./SiteVideo'), 'PageVideoList');

/** Renders the catalog videos for the current path (none by default). Placed at the end of each public page. */
export function PageVideos() {
  const { pathname } = useLocation();
  if (!VIDEO_PATHS.has(pathname)) return null;
  return <PageVideoList pathname={pathname} />;
}
