/**
 * The web app's Content-Security-Policy (docs/SECURITY.md § Content-Security-Policy). nginx sends it in production
 * (nginx/snippets/security-headers.conf, kept identical by csp.test.ts) and `vite preview` sends the same header
 * (seoShell.ts), so the e2e suites run the app under the production policy.
 *
 * Scripts and styles are strict: same-origin files only, no inline code. Styles allow exactly the `<style>` elements a
 * page's server lists by hash in the {@link STYLE_HASHES_HEADER} response header:
 *  - the API's document (/_document): the small style block of its plain, crawlable copy (SeoDocumentWriter.cs);
 *  - the server renderer (server/ssr-server.mjs): the page's own block, which carries the inline styles of the
 *    server-rendered markup until the app starts (see extractInlineStyles in ssrDocument.ts).
 * After hydration React writes styles through the CSSOM (element.style), which CSP does not restrict, so style
 * attributes never reach the HTML parser.
 */

/** Response header (API documents, server renderer) listing the CSP hashes of the document's `<style>` elements. */
export const STYLE_HASHES_HEADER = 'x-oa-style-hashes';

/** A header value of {@link STYLE_HASHES_HEADER}: space-separated `'sha256-…'` sources (nginx accepts nothing else). */
export const STYLE_HASHES = /^'sha256-[A-Za-z0-9+/]+={0,2}'( 'sha256-[A-Za-z0-9+/]+={0,2}')*$/;

export interface CspOptions {
  /** The document's style hashes ({@link STYLE_HASHES_HEADER}); empty for static files and the app shell. */
  styleHashes?: string;
  /** Extra img-src hosts (IMG_SRC_EXTRA on the web container). */
  imgSrcExtra?: string;
  /** Extra media-src hosts (MEDIA_SRC_EXTRA on the web container). */
  mediaSrcExtra?: string;
  /**
   * The request arrived over HTTPS (directly or through the TLS-terminating load balancer): adds
   * `upgrade-insecure-requests`. Plain-http deployments and local runs do not get it (it would send their own
   * same-origin requests to https).
   */
  https?: boolean;
}

/**
 * The policy for a response. The text matches what nginx sends byte for byte (an empty extra host list leaves a space
 * before the `;`, as nginx's variable substitution does).
 */
export function contentSecurityPolicy({ styleHashes = '', imgSrcExtra = '', mediaSrcExtra = '', https = false }: CspOptions = {}): string {
  const hashes = STYLE_HASHES.test(styleHashes) ? ` ${styleHashes}` : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self'${hashes}`,
    `img-src 'self' data: blob: https://i.ytimg.com ${imgSrcExtra}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    `media-src 'self' blob: ${mediaSrcExtra}`,
    "frame-src 'self' https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
