import { describe, expect, it } from 'vitest';
import { prepareHtml } from './HtmlPreviewFrame';

describe('prepareHtml (email previews under the strict CSP)', () => {
  it('takes every style attribute and style element out of the markup, keeping their CSS', () => {
    const { html, css } = prepareHtml(
      '<html><head><style>.a{color:red}</style><link rel="stylesheet" href="https://fonts.example/x.css"></head>' +
        '<body><table style="width:100%"><tr><td style="color: #333; font-family: \'Inter\'">Hi Ada</td></tr></table>' +
        '<style>@media (max-width:600px){.a{color:blue}}</style></body></html>',
    );
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/\sstyle=|<style|rel="stylesheet"/);
    expect(html).toContain('data-oa-style="width:100%"');
    expect(html).toContain(`data-oa-style="color: #333; font-family: 'Inter'"`);
    expect(html).toContain('Hi Ada');
    expect(css).toBe('.a{color:red}\n@media (max-width:600px){.a{color:blue}}');
  });
});
