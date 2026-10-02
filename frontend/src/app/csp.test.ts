import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, STYLE_HASHES } from './csp';

const nginx = (file: string) => readFileSync(join(__dirname, '..', '..', 'nginx', file), 'utf8');

describe('contentSecurityPolicy', () => {
  it('is the policy nginx sends (snippets/security-headers.conf), variables included', () => {
    const header = nginx('snippets/security-headers.conf').match(/add_header Content-Security-Policy "([^"]+)" always;/)![1];
    // nginx's variables in place of the options: $oa_style_hashes and $oa_csp_upgrade start with their separator.
    const asNginx = contentSecurityPolicy({ imgSrcExtra: '$oa_img_src_extra', mediaSrcExtra: '$oa_media_src_extra' })
      .replace("style-src 'self'", "style-src 'self'$oa_style_hashes")
      .concat('$oa_csp_upgrade');
    expect(header).toBe(asNginx);
  });

  it('is strict for scripts and styles: no inline code, no eval, nothing but listed hashes', () => {
    const policy = contentSecurityPolicy({ styleHashes: "'sha256-abc=' 'sha256-def+/='" });
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*/);
    expect(policy).toContain("script-src 'self';");
    expect(policy).toContain("style-src 'self' 'sha256-abc=' 'sha256-def+/=';");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('upgrade-insecure-requests');
    expect(contentSecurityPolicy({ https: true })).toMatch(/; upgrade-insecure-requests$/);
  });

  it('ignores style hash lists that are not just sha256 sources (as nginx does)', () => {
    for (const bad of ["'unsafe-inline'", "'sha256-abc=' 'unsafe-inline'", "'sha256-abc='; script-src *", 'https://evil.example']) {
      expect(STYLE_HASHES.test(bad)).toBe(false);
      expect(contentSecurityPolicy({ styleHashes: bad })).toContain("style-src 'self';");
    }
    const map = nginx('default.conf.template').match(/map \$upstream_http_x_oa_style_hashes \$oa_style_hashes \{[\s\S]*?"~([^"]+)"/)![1];
    expect(map).toBe(STYLE_HASHES.source);
  });
});
