import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TwoFactorStatus } from '@/lib/api/types';
import { json, makeUser, mockFetch, problem, session } from '@/test/fetchMock';
import { axeViolations, renderWithApp } from '@/test/render';
import { AccountSecurityPage } from '../AccountSecurityPage';
import { TwoFactorCard } from './TwoFactorCard';

const signedIn = { 'POST /auth/refresh': () => json(200, session(makeUser())) };

const status = (overrides: Partial<TwoFactorStatus> = {}): TwoFactorStatus => ({
  enabled: false,
  enabledAt: null,
  setupPending: false,
  recoveryCodesRemaining: 0,
  recoveryCodesGeneratedAt: null,
  lastUsedAt: null,
  required: false,
  hasPassword: true,
  ...overrides,
});

const on = status({
  enabled: true,
  enabledAt: '2026-09-01T10:00:00Z',
  recoveryCodesRemaining: 10,
  recoveryCodesGeneratedAt: '2026-09-01T10:00:00Z',
});

const setup = {
  secret: 'JBSW Y3DP EHPK 3PXP',
  otpAuthUri: 'otpauth://totp/Optimize%20All:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Optimize%20All',
  issuer: 'Optimize All',
  accountName: 'ada@example.com',
};
const codes = Array.from({ length: 10 }, (_, i) => `KLMNP-QRST${'ABCDEFGHJK'[i]}`);

function renderCard() {
  return renderWithApp(<TwoFactorCard />, { route: '/app/profile/security', path: '/app/profile/security' });
}

describe('TwoFactorCard', () => {
  it('sets up two-step verification with a QR code and shows the recovery codes once', async () => {
    const user = userEvent.setup();
    let enabled = false;
    const { calls } = mockFetch({
      ...signedIn,
      'GET /auth/2fa': () => json(200, enabled ? on : status()),
      'POST /auth/2fa/setup': () => json(200, setup),
      'POST /auth/2fa/confirm': (req) => {
        if ((req.body as { code: string }).code !== '246810')
          return problem(400, 'auth.2fa_invalid_code', 'That code didn’t work.', {
            errors: { code: ['That code didn’t work. Enter the newest code from your authenticator app.'] },
          });
        enabled = true;
        return json(200, { recoveryCodes: codes });
      },
    });
    const { container } = renderCard();
    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Set up two-step verification' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set up two-step verification' });
    expect(await within(dialog).findByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Key for manual entry')).toHaveValue(setup.secret);
    expect(await axeViolations(document.body)).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(
      await within(dialog).findByText('Enter the 6-digit code from your authenticator app.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Authentication code/), '111111');
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(await within(dialog).findByText(/Enter the newest code/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Authentication code/), '246-810');
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));

    const saved = await screen.findByRole('dialog', { name: 'Save your recovery codes' });
    expect(within(saved).getByRole('list', { name: 'Recovery codes' }).querySelectorAll('li')).toHaveLength(
      10,
    );
    await user.click(within(saved).getByRole('button', { name: 'I’ve saved my codes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('On')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/auth/2fa/setup')).toHaveLength(1);
  });

  it('turns it off with the password and a code', async () => {
    const user = userEvent.setup();
    let enabled = true;
    const { calls } = mockFetch({
      ...signedIn,
      'GET /auth/2fa': () => json(200, enabled ? on : status()),
      'POST /auth/2fa/disable': () => {
        enabled = false;
        return new Response(null, { status: 204 });
      },
    });
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off two-step verification?' });
    await user.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    expect(await within(dialog).findByText('Enter your password.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Password/), 'my-password');
    await user.type(within(dialog).getByLabelText(/Authentication code/), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.path === '/auth/2fa/disable')?.body).toEqual({
      password: 'my-password',
      code: '123456',
    });
    expect(await screen.findByText('Off')).toBeInTheDocument();
  });

  it('creates new recovery codes after a code', async () => {
    const user = userEvent.setup();
    mockFetch({
      ...signedIn,
      'GET /auth/2fa': () => json(200, { ...on, recoveryCodesRemaining: 2 }),
      'POST /auth/2fa/recovery-codes': () => json(200, { recoveryCodes: codes }),
    });
    renderCard();
    expect(await screen.findByText('2 recovery codes left')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create new recovery codes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create new recovery codes' });
    await user.type(within(dialog).getByLabelText(/Authentication code/), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Create new codes' }));
    expect(await screen.findByRole('dialog', { name: 'Your new recovery codes' })).toBeInTheDocument();
  });

  it('does not offer to turn it off when the staff policy requires it', async () => {
    mockFetch({ ...signedIn, 'GET /auth/2fa': () => json(200, { ...on, required: true }) });
    renderCard();
    expect(await screen.findByText('Required for your account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new recovery codes' })).toBeInTheDocument();
  });

  it('is read-only while viewing as the user', async () => {
    const viewing = makeUser({
      impersonatedBy: {
        id: 'staff-1',
        displayName: 'Support',
        email: 'support@example.com',
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    mockFetch({
      'POST /auth/refresh': () => json(200, session(viewing)),
      'GET /auth/2fa': () => json(200, on),
    });
    renderCard();
    expect(await screen.findByText(/two-step verification can’t be changed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });
});

describe('AccountSecurityPage', () => {
  it('gives staff portals the same security cards', async () => {
    mockFetch({
      'POST /auth/refresh': () =>
        json(200, session(makeUser({ roles: ['Finance'], permissions: ['payouts.view'] }))),
      'GET /auth/2fa': () => json(200, status({ required: true })),
      'GET /auth/external-logins': () =>
        json(200, { hasPassword: true, googleEnabled: false, externalLogins: [] }),
    });
    const { container } = renderWithApp(<AccountSecurityPage />, {
      route: '/finance/account/security',
      path: '/finance/account/security',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Account security' })).toBeInTheDocument();
    expect(await screen.findByText(/Required for staff accounts/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/Current password/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});
