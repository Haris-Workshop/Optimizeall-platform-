import { describe, expect, it } from 'vitest';
import { prepareHtml } from './HtmlPreviewFrame';

describe('prepareHtml (email previews under the strict CSP)', () => {
  it('takes every style attribute and style element out of the markup, keeping their CSS', () => {
    const { html, css } = prepareHtml(
      '<html><head><style>.a{color:red}</style><link rel="stylesheet" href="https://fonts.example/x.css"></head>' +
        '<body><table STYLE="width:100%" title=\'a > style="b"\'><tr><td style="color: #333; font-family: \'Inter\'">Hi Ada</td></tr></table>' +
        '<style>@media (max-width:600px){.a{color:blue}}</style></body></html>',
    );
    expect(html).not.toMatch(/<style|rel="stylesheet"/);
    expect(html).toContain(`data-oa-style="width:100%" title='a > style="b"'`);
    expect(html).toContain(`data-oa-style="color: #333; font-family: 'Inter'"`);
    expect(html).toContain('Hi Ada');
    expect(css).toBe('.a{color:red}\n@media (max-width:600px){.a{color:blue}}');
  });
});
