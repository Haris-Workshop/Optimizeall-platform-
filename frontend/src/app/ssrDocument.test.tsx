import type { CSSProperties } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SHELL_BODY_INCLUDE, SHELL_HEAD_INCLUDE } from './seoShellCore';
import {
  extractInlineStyles,
  injectRenderedPage,
  pageAssets,
  restoreInlineStyles,
  serializeState,
  SSR_MODULES_ATTR,
  SSR_ROOT_ATTR,
  SSR_STATE_ID,
  SSR_STYLE_ATTR,
  SSR_STYLE_ID,
  type Manifest,
} from './ssrDocument';

const manifest: Manifest = {
  'index.html': {
    file: 'assets/index-a1.js',
    src: 'index.html',
    isEntry: true,
    imports: ['_react-r1.js', '_query-q1.js'],
    dynamicImports: ['_start-s1.js'],
    css: ['assets/index-c1.css'],
  },
  // The app chunk the entry starts: linked by the shell itself.
  '_start-s1.js': { file: 'assets/start-s1.js', imports: ['_react-r1.js'], css: ['assets/start-s1.css'] },
  '_react-r1.js': { file: 'assets/react-r1.js' },
  '_query-q1.js': { file: 'assets/query-q1.js' },
  '_marketing-m1.js': { file: 'assets/marketing-m1.js', imports: ['index.html', '_react-r1.js'], css: ['assets/marketing-m1.css'] },
  '_kit-k1.js': { file: 'assets/kit-k1.js', imports: ['_marketing-m1.js'], css: ['assets/kit-k1.css'] },
  'src/features/public/pages/HomePage.tsx': {
    file: 'assets/HomePage-h1.js',
    src: 'src/features/public/pages/HomePage.tsx',
    isDynamicEntry: true,
    imports: ['index.html', '_start-s1.js', '_react-r1.js', '_kit-k1.js', '_marketing-m1.js'],
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
    expect(out).toContain(
      `<div id="root" ${SSR_ROOT_ATTR} ${SSR_MODULES_ATTR}="/assets/HomePage-h1.js"><div class="site-layout"><main id="main"><h1>Designed</h1></main></div></div>`,
    );
    const head = out.slice(0, out.indexOf('</head>'));
    expect(head.indexOf(SHELL_HEAD_INCLUDE)).toBeLessThan(head.indexOf('<link rel="stylesheet" crossorigin href="/assets/HomePage-h1.css">'));
    // Scripts are not fetched before the first paint (src/main.tsx preloads them afterwards).
    expect(head).not.toContain('modulepreload');
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

describe('extractInlineStyles / restoreInlineStyles (strict CSP: no style attributes in HTML)', () => {
  const hostile = 'red}body{display:none}</style><script>alert(1)</script>/*';
  const markup = renderToString(
    <div className="hero" style={{ '--i': 2 } as CSSProperties}>
      <p style={{ fontFamily: '"Inter Tight", sans-serif', width: '40%' }} title='say style="x"'>
        style=&quot;not an attribute&quot; and {'style="text"'}
      </p>
      <svg viewBox="0 0 10 10">
        <rect className="bar" style={{ '--i': 2 } as CSSProperties} width="2" height="2" />
      </svg>
      <span style={{ color: hostile }} />
      <span data-style="kept" />
    </div>,
  );

  it('moves every style attribute into one rule per distinct value, outranking class selectors', () => {
    const { html, css } = extractInlineStyles(markup);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).toContain(`${SSR_STYLE_ATTR}="--i:2"`);
    expect(html).toContain('data-style="kept"');
    // Text and other attributes that mention style="…" are untouched (React escapes their quotes).
    expect(html).toContain('title="say style=&quot;x&quot;"');
    expect(html).toContain('style=&quot;text&quot;');
    expect(css.match(/\{--i:2\}/g)).toHaveLength(1);
    expect(css).toContain(`[${SSR_STYLE_ATTR}="--i:2"]:not(#oa-x):not(#oa-x):not(#oa-x){--i:2}`);
    expect(css).toContain('{font-family:"Inter Tight", sans-serif;width:40%}');
  });

  it('keeps hostile values inside their rule and the style element', () => {
    const { css } = extractInlineStyles(markup);
    expect(css).not.toMatch(/<|>/);
    // Exactly one opening and one closing brace per rule: nothing in a value can end the rule or open another.
    expect(css.match(/\{/g)).toHaveLength(3);
    expect(css.match(/\}/g)).toHaveLength(3);
    expect(css).not.toContain('/*');
  });

  it('applies the same styles in the browser, then restores them as element styles before hydration', () => {
    const { html, css } = extractInlineStyles(markup);
    const style = document.createElement('style');
    style.id = SSR_STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    // Every element is matched by the rule for its own value (and by no other).
    const rules = [...style.sheet!.cssRules] as CSSStyleRule[];
    for (const el of root.querySelectorAll(`[${SSR_STYLE_ATTR}]`)) {
      const matching = rules.filter((r) => el.matches(r.selectorText));
      expect(matching, el.outerHTML).toHaveLength(1);
    }
    const hostileEl = root.querySelectorAll('span')[0]!;
    expect(hostileEl.getAttribute(SSR_STYLE_ATTR)).toBe(`color:${hostile}`);

    restoreInlineStyles(root);
    expect(root.querySelector(`[${SSR_STYLE_ATTR}]`)).toBeNull();
    expect(document.getElementById(SSR_STYLE_ID)).toBeNull();
    expect((root.querySelector('p') as HTMLElement).style.width).toBe('40%');
    expect((root.querySelector('rect') as SVGElement).style.getPropertyValue('--i')).toBe('2');
    root.remove();
  });

  it('puts the block after the page stylesheets in the head', () => {
    const doc = `<html><head>${SHELL_HEAD_INCLUDE}</head><body><div id="root"><div id="oa-ssr"></div></div>${SHELL_BODY_INCLUDE}</body></html>`;
    const out = injectRenderedPage(doc, { html: '<p data-oa-style="--i:1"></p>', css: 'x{y:z}', state: {}, assets: { css: ['/a.css'], js: [] } })!;
    expect(out).toContain(`<link rel="stylesheet" crossorigin href="/a.css">\n<style id="${SSR_STYLE_ID}">x{y:z}</style>`);
    expect(injectRenderedPage(doc, { html: '<p></p>', css: '', state: {}, assets: { css: [], js: [] } })).not.toContain('<style');
  });
});
