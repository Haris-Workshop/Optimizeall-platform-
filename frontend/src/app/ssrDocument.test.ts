import { describe, expect, it } from 'vitest';
import { SHELL_BODY_INCLUDE, SHELL_HEAD_INCLUDE } from './seoShellCore';
import { injectRenderedPage, pageAssets, serializeState, SSR_ROOT_ATTR, SSR_STATE_ID, type Manifest } from './ssrDocument';

const manifest: Manifest = {
  'index.html': {
    file: 'assets/index-a1.js',
    src: 'index.html',
    isEntry: true,
    imports: ['_react-r1.js', '_query-q1.js'],
    css: ['assets/index-c1.css'],
  },
  '_react-r1.js': { file: 'assets/react-r1.js' },
  '_query-q1.js': { file: 'assets/query-q1.js' },
  '_marketing-m1.js': { file: 'assets/marketing-m1.js', imports: ['index.html', '_react-r1.js'], css: ['assets/marketing-m1.css'] },
  '_kit-k1.js': { file: 'assets/kit-k1.js', imports: ['_marketing-m1.js'], css: ['assets/kit-k1.css'] },
  'src/features/public/pages/HomePage.tsx': {
    file: 'assets/HomePage-h1.js',
    src: 'src/features/public/pages/HomePage.tsx',
    isDynamicEntry: true,
    imports: ['index.html', '_react-r1.js', '_kit-k1.js', '_marketing-m1.js'],
    css: ['assets/HomePage-h1.css'],
  },
  'src/features/public/pages/BlogPages.tsx': {
    file: 'assets/BlogPages-b1.js',
    src: 'src/features/public/pages/BlogPages.tsx',
    isDynamicEntry: true,
    imports: ['_marketing-m1.js'],
  },
};

describe('pageAssets (stylesheets and chunks of server-rendered route modules)', () => {
  it('links the route module, its shared chunks and their styles — dependencies first — without the entry', () => {
    expect(pageAssets(manifest, ['src/features/public/pages/HomePage.tsx'])).toEqual({
      css: ['/assets/marketing-m1.css', '/assets/kit-k1.css', '/assets/HomePage-h1.css'],
      js: ['/assets/marketing-m1.js', '/assets/kit-k1.js', '/assets/HomePage-h1.js'],
    });
  });

  it('lists a chunk shared by several modules once, and ignores unknown modules', () => {
    const assets = pageAssets(manifest, ['src/features/public/pages/BlogPages.tsx', 'src/features/public/pages/HomePage.tsx', 'src/nope.tsx']);
    expect(assets.css.filter((c) => c.includes('marketing'))).toHaveLength(1);
    expect(assets.js.filter((c) => c.includes('marketing'))).toHaveLength(1);
    expect(assets.js).not.toContain('/assets/index-a1.js');
    expect(assets.css).not.toContain('/assets/index-c1.css');
  });
});

describe('serializeState', () => {
  it('can never close the script element or break a line', () => {
    const json = serializeState({ text: '</script><script>alert(1)</script> & \u2028\u2029' });
    expect(json).not.toMatch(/<|>|&|\u2028|\u2029/);
    expect(JSON.parse(json)).toEqual({ text: '</script><script>alert(1)</script> & \u2028\u2029' });
  });
});

describe('injectRenderedPage', () => {
  const apiDocument =
    '<!doctype html>\n<html lang="en">\n<head>\n<title>Home</title>\n' +
    SHELL_HEAD_INCLUDE +
    '\n</head>\n<body>\n<div id="root"><div id="oa-ssr" class="oa-ssr"><main><h1>Plain</h1></main></div></div>\n' +
    SHELL_BODY_INCLUDE +
    '\n</body>\n</html>\n';
  const page = {
    html: '<div class="site-layout"><main id="main"><h1>Designed</h1></main></div>',
    state: { queries: [{ queryKey: ['public', 'site'] }] },
    assets: { css: ['/assets/HomePage-h1.css'], js: ['/assets/HomePage-h1.js'] },
  };

  it("replaces the plain copy with the app's markup, links the page's assets after the shell, embeds the state", () => {
    const out = injectRenderedPage(apiDocument, page)!;
    expect(out).not.toContain('oa-ssr');
    expect(out).not.toContain('Plain');
    expect(out).toContain(`<div id="root" ${SSR_ROOT_ATTR}><div class="site-layout"><main id="main"><h1>Designed</h1></main></div></div>`);
    const head = out.slice(0, out.indexOf('</head>'));
    expect(head.indexOf(SHELL_HEAD_INCLUDE)).toBeLessThan(head.indexOf('<link rel="stylesheet" crossorigin href="/assets/HomePage-h1.css">'));
    expect(head).toContain('<link rel="modulepreload" crossorigin href="/assets/HomePage-h1.js">');
    expect(out).toContain(`<script type="application/json" id="${SSR_STATE_ID}">{"queries":[{"queryKey":["public","site"]}]}</script>`);
    // The shell's body include (the app's scripts) still follows #root, and the head is untouched otherwise.
    expect(out.indexOf(SSR_STATE_ID)).toBeLessThan(out.indexOf(SHELL_BODY_INCLUDE));
    expect(out).toContain('<title>Home</title>');
    expect(out.match(/<div id="root"/g)).toHaveLength(1);
  });

  it('leaves documents of another shape alone', () => {
    expect(injectRenderedPage('<!doctype html><p>no shell</p>', page)).toBeNull();
    expect(injectRenderedPage(apiDocument.replace(SHELL_BODY_INCLUDE, ''), page)).toBeNull();
  });
});
