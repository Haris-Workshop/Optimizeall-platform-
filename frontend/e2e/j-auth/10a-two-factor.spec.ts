import { createHmac } from 'node:crypto';
import { type BrowserContext, type Page, expect, test } from '@playwright/test';
import { latestMail } from '../journeys/support/api';
import type { Credentials } from '../journeys/support/fixtures';
import { axeViolations } from '../journeys/support/ui';
import {
  ApiSession,
  accounts,
  landing,
  raw,
  registerVerified,
  signOut,
  webStorageDump,
} from './support/auth';

/**
 * Two-step verification (TOTP) end to end with real time: set-up from Account security (QR code + key, recovery codes
 * shown once), the code step after the password, a wrong code, a recovery code, replay of a used code, and an
 * administrator's reset after a lost phone.
 */

const STEP_MS = 30_000;

function base32Decode(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of value.replace(/[\s=]/g, '').toUpperCase()) {
    buffer = (buffer << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238: HMAC-SHA-1, 6 digits, 30-second steps. */
function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hash[hash.length - 1]! & 0x0f;
  const binary = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, '0');
}

const currentStep = () => Math.floor(Date.now() / STEP_MS);

/** Codes work once per 30-second step: waits for a step after `lastUsed`, then returns its code and step. */
async function freshCode(secret: string, lastUsed: number): Promise<{ code: string; step: number }> {
  while (currentStep() <= lastUsed) await new Promise((r) => setTimeout(r, 500));
  const step = currentStep();
  return { code: totp(secret, step), step };
}

test.describe.serial('two-step verification', () => {
  let tia: Credentials;
  let context: BrowserContext;
  let page: Page;
  let secret = '';
  let lastStep = 0;
  let recoveryCodes: string[] = [];

  test.beforeAll(async ({ browser }) => {
    tia = await registerVerified('tia', 'Tia Twostep');
    context = await browser.newContext();
    page = await context.newPage();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('sets it up from Account security with the QR code and saves the recovery codes', async () => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(tia.email);
    await page.getByLabel('Password', { exact: true }).fill(tia.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(landing.participant);

    // The link in security emails resolves to the participant's Profile → Security.
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/app\/profile\/security$/);
    const card = page.getByRole('region', { name: 'Two-step verification' });
    await expect(card.getByText('Off', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Set up two-step verification' }).click();

    const dialog = page.getByRole('dialog', { name: 'Set up two-step verification' });
    await expect(dialog.getByRole('img', { name: /QR code to add Optimize All/ })).toBeVisible();
    secret = await dialog.getByLabel('Key for manual entry').inputValue();
    expect(secret.replace(/\s/g, '')).toMatch(/^[A-Z2-7]{32}$/);
    expect(await axeViolations(page)).toEqual([]);

    const first = await freshCode(secret, 0);
    await dialog.getByLabel(/Authentication code/).fill(first.code);
    await dialog.getByRole('button', { name: 'Turn on' }).click();
    lastStep = first.step;

    const saved = page.getByRole('dialog', { name: 'Save your recovery codes' });
    const items = saved.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
    await expect(items).toHaveCount(10);
    recoveryCodes = await items.allTextContents();
    await saved.getByRole('button', { name: 'I’ve saved my codes' }).click();
    await expect(card.getByText('On', { exact: true })).toBeVisible();
    await expect(card.getByText('10 of 10 recovery codes unused.')).toBeVisible();
    expect((await latestMail(tia.email, /Two-step verification is on/)).subject).toContain('is on');
  });

  test('asks for the code after the password, refuses a wrong one and signs in with the right one', async () => {
    await signOut(page, tia.displayName);
    await page.getByLabel('Email', { exact: true }).fill(tia.email);
    await page.getByLabel('Password', { exact: true }).fill(tia.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await expect(page).toHaveURL(/\/login(\?|$)/);
    // No session yet, and the challenge never lands in the address or in Web Storage.
    expect(page.url()).not.toMatch(/challenge|token/i);
    expect((await context.cookies()).some((c) => c.name === 'oa_refresh')).toBe(false);
    expect(await webStorageDump(page)).not.toMatch(/challenge/i);
    expect(await axeViolations(page)).toEqual([]);

    const { code, step } = await freshCode(secret, lastStep);
    const wrong = code === '000000' ? '111111' : '000000';
    await page.getByLabel(/Authentication code/).fill(wrong);
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByText(/That code didn’t work/)).toBeVisible();

    await page.getByLabel(/Authentication code/).fill(code);
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(landing.participant);
    lastStep = step;
  });

  test('a used code is refused (replay), and a recovery code signs in once', async () => {
    // Replay through the API: the code of the step just accepted, on a new challenge.
    const login = await raw('POST', '/auth/login', { body: { email: tia.email, password: tia.password } });
    expect(login.status).toBe(200);
    const challenge = (login.json!.twoFactor as { challengeToken: string }).challengeToken;
    expect(login.setCookies.some((c) => c.startsWith('oa_refresh=') && !c.startsWith('oa_refresh=;'))).toBe(
      false,
    );
    const replay = await raw('POST', '/auth/2fa/verify', {
      body: { challengeToken: challenge, code: totp(secret, lastStep) },
    });
    expect(replay.status).toBe(400);
    expect(replay.json!.code).toBe('auth.2fa_invalid_code');

    await signOut(page, tia.displayName);
    await page.getByLabel('Email', { exact: true }).fill(tia.email);
    await page.getByLabel('Password', { exact: true }).fill(tia.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
    await page.getByLabel(/Recovery code/).fill(recoveryCodes[0]!);
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(landing.participant);
    expect((await latestMail(tia.email, /recovery code was used/)).text).toContain('9');

    const again = await raw('POST', '/auth/login', { body: { email: tia.email, password: tia.password } });
    const reused = await raw('POST', '/auth/2fa/verify', {
      body: {
        challengeToken: (again.json!.twoFactor as { challengeToken: string }).challengeToken,
        recoveryCode: recoveryCodes[0],
      },
    });
    expect(reused.status).toBe(400);
  });

  test('an administrator resets it after a lost phone; the password alone signs in again', async () => {
    const admin = await ApiSession.login(accounts.admin.email, accounts.admin.password);
    const found = await admin.get<{ items: { id: string; email: string }[] }>(
      `/admin/users?search=${encodeURIComponent(tia.email)}`,
    );
    const id = found.items.find((u) => u.email === tia.email)!.id;
    const detail = await admin.get<{ twoFactor: { enabled: boolean } }>(`/admin/users/${id}`);
    expect(detail.twoFactor.enabled).toBe(true);

    const reset = await admin.post<{ twoFactor: { enabled: boolean } }>(
      `/admin/users/${id}/two-factor/reset`,
      {
        reason: 'Lost phone; identity checked from the account email address',
        confirm: true,
      },
    );
    expect(reset.twoFactor.enabled).toBe(false);
    expect((await latestMail(tia.email, /Two-step verification is off/)).text).toContain('an administrator');

    // Signed out everywhere: the open page goes back to sign-in, and the password alone is enough now.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('Email', { exact: true }).fill(tia.email);
    await page.getByLabel('Password', { exact: true }).fill(tia.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(landing.participant);
  });
});
