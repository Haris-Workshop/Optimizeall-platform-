import { test as base, expect, type BrowserContext } from '@playwright/test';

/**
 * Content-Security-Policy violations (docs/SECURITY.md § Content-Security-Policy). The app runs under the production
 * policy in every e2e setup: nginx sends it (E2E_WEB_SERVER=nginx) and so does `vite preview` (seoShell.ts, from
 * src/app/csp.ts). Scripts and styles are strict, so a style attribute in server HTML, an inline `<style>` the server
 * did not hash, or a script/frame/image from a host the policy does not list is refused by the browser, and these
 * checks fail the test.
 *
 * Both signals are collected for every page and frame of the context: `securitypolicyviolation` events (reported
 * through a binding, so they survive navigations) and the browser's console errors about the policy (which also cover
 * sandboxed frames that run no script).
 */
export interface CspGuard {
  /** Every violation so far ("url: directive blocked … "). */
  readonly violations: string[];
  /** Fails (softly when `soft`) if any violation was recorded, then starts a new list. */
  expectNone(where?: string, options?: { soft?: boolean }): void;
}

const guards = new WeakMap<BrowserContext, Promise<CspGuard>>();

/** Starts recording CSP violations in `context` (idempotent: one recorder per context). Call before opening pages. */
export function guardCsp(context: BrowserContext): Promise<CspGuard> {
  let guard = guards.get(context);
  if (!guard) {
    guard = install(context);
    guards.set(context, guard);
  }
  return guard;
}

async function install(context: BrowserContext): Promise<CspGuard> {
  const violations: string[] = [];
  await context.exposeBinding('__oaCspViolation', ({ frame }, text: string) => {
    violations.push(`${frame.url()}: ${text}`);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as { __oaCspViolation?: (text: string) => void }).__oaCspViolation;
      report?.(
        `${e.effectiveDirective} blocked ${e.blockedURI || 'inline'}` +
          (e.sample ? ` "${e.sample}"` : '') +
          (e.sourceFile ? ` at ${e.sourceFile}:${e.lineNumber}` : ''),
      );
    });
  });
  context.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text()))
      violations.push(`${message.page()?.url() ?? '?'}: ${message.text()}`);
  });
  return {
    violations,
    expectNone(where, { soft = false } = {}) {
      const found = violations.splice(0);
      (soft ? expect.soft : expect)(found, `Content-Security-Policy violations${where ? ` on ${where}` : ''}`).toEqual([]);
    },
  };
}

/**
 * Playwright's `test` with a CSP guard on the test's own context: the test fails if any of its pages (or frames) broke
 * the policy. Tests that open contexts of their own call {@link guardCsp} on them.
 */
export const test = base.extend<{ csp: CspGuard }>({
  csp: [
    async ({ context }, use) => {
      const guard = await guardCsp(context);
      await use(guard);
      guard.expectNone();
    },
    { auto: true },
  ],
});

export { expect };
