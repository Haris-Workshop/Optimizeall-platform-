// Inter with its optical-size axis: large figures and titles get the tighter "Display" cut automatically.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter-tight/wght.css';
// Global styles first so component styles (imported through the app) can override them.
import './styles/tokens.css';
import './styles/base.css';
import { SSR_MODULES_ATTR, SSR_ROOT_ATTR } from './app/ssrDocument';

/**
 * The entry is deliberately tiny: it only decides when the app starts (src/start.tsx). A server-rendered page is
 * painted first — with nothing but its HTML, CSS and fonts — and only then is the app's JavaScript fetched (together
 * with the page's route chunks, listed on #root) and run: the visitor sees the page as early as the network allows,
 * and downloading, compiling and hydrating never delay that first paint. Anything else starts right away.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
const serverRendered = root.hasAttribute(SSR_ROOT_ATTR);

/** Resolves once the current content has been painted (right away in a background tab, which never paints). */
function afterFirstPaint(): Promise<void> {
  if (document.visibilityState !== 'visible') return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    // A safety net for browsers that throttle animation frames.
    setTimeout(resolve, 250);
  });
}

/** Fetches the page's route chunks in parallel with the app (instead of after it). */
function preloadPageModules(container: HTMLElement) {
  for (const href of (container.getAttribute(SSR_MODULES_ATTR) ?? '').split(' ').filter(Boolean)) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.crossOrigin = '';
    link.href = href;
    document.head.appendChild(link);
  }
}

void (serverRendered ? afterFirstPaint() : Promise.resolve())
  .then(() => {
    if (serverRendered) preloadPageModules(root);
    return import('./start');
  })
  .then(({ start }) => start(root, serverRendered));
