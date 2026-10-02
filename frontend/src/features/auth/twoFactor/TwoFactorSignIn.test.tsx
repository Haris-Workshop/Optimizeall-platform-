import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TwoFactorChallenge } from '@/lib/api/types';
import { json, makeUser, mockFetch, problem, session } from '@/test/fetchMock';
import { axeViolations, renderWithApp } from '@/test/render';
import { GoogleCallbackPage } from '../google/GoogleCallbackPage';
import { LoginPage } from '../LoginPage';

const anonymous = { 'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired') };

const challenge = (kind: TwoFactorChallenge['kind'] = 'verify'): TwoFactorChallenge => ({
  challengeToken: 'signed-challenge',
  kind,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
});

const setup = {
  secret: 'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
  otpAuthUri:
    'otpauth://totp/Optimize%20All:ada%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Optimize%20All&algorithm=SHA1&digits=6&period=30',
  issuer: 'Optimize All',
  accountName: 'ada@example.com',
};

const recoveryCodes = Array.from({ length: 10 }, (_, i) => `ABCDE-FGH${'JKLMNPQRST'[i]}2`);

function renderLogin(route = '/login?next=%2Fapp%2Fearnings') {
  return renderWithApp(<LoginPage />, {
    route,
    path: '/login',
    routes: [
      { path: '/app/*', element: <p>participant portal</p> },
      { path: '/review/*', element: <p>review portal</p> },
    ],
  });
}

async function enterPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Sign-in with two-step verification', () => {
  beforeEach(() => sessionStorage.clear());

  it('asks for the authenticator code after the password and signs in once it is right', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { calls } = mockFetch({
      ...anonymous,
      'POST /auth/login': () => json(200, { twoFactor: challenge() }),
      'POST /auth/2fa/verify': () =>
        ++attempts === 1
          ? problem(400, 'auth.2fa_invalid_code', 'That code didn’t work.', {
              errors: { code: ['That code didn’t work. Enter the newest code from your authenticator app.'] },
            })
          : json(200, session(makeUser())),
    });
    const { container, router } = renderLogin();
    await enterPassword(user);

    const heading = await screen.findByRole('heading', { name: 'Two-step verification' });
    expect(heading).toHaveFocus();
    // The token stays in memory: never in the address.
    expect(router.state.location.search).not.toContain('signed-challenge');
    expect(await axeViolations(container)).toEqual([]);

    const code = screen.getByLabelText(/Authentication code/);
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');

    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(
      await screen.findByText('Enter the 6-digit code from your authenticator app.'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/auth/2fa/verify')).toBe(false);

    await user.type(code, '123 456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByText(/Enter the newest code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Authentication code/)).toHaveValue('');

    await user.type(screen.getByLabelText(/Authentication code/), '654321');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByText('participant portal')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/earnings');
    expect(calls.filter((c) => c.path === '/auth/2fa/verify').map((c) => c.body)).toEqual([
      { challengeToken: 'signed-challenge', code: '123456' },
      { challengeToken: 'signed-challenge', code: '654321' },
    ]);
  });

  it('accepts a recovery code instead', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      ...anonymous,
      'POST /auth/login': () => json(200, { twoFactor: challenge() }),
      'POST /auth/2fa/verify': () => json(200, session(makeUser())),
    });
    renderLogin();
    await enterPassword(user);
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }));
    const field = screen.getByLabelText(/Recovery code/);
    await waitFor(() => expect(field).toHaveFocus());
    await user.type(field, 'abcde-fghjk');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByText('participant portal')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/auth/2fa/verify')?.body).toEqual({
      challengeToken: 'signed-challenge',
      recoveryCode: 'abcde-fghjk',
    });
  });

  it('sends the person back to the password step when the challenge expired', async () => {
    const user = userEvent.setup();
    mockFetch({
      ...anonymous,
      'POST /auth/login': () => json(200, { twoFactor: challenge() }),
      'POST /auth/2fa/verify': () =>
        problem(401, 'auth.2fa_challenge_expired', 'This sign-in step has expired or was already used.'),
    });
    renderLogin();
    await enterPassword(user);
    await user.type(await screen.findByLabelText(/Authentication code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByText('Please sign in again')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    // The password is not kept around.
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('explains a lockout after too many wrong codes', async () => {
    const user = userEvent.setup();
    mockFetch({
      ...anonymous,
      'POST /auth/login': () => json(200, { twoFactor: challenge() }),
      'POST /auth/2fa/verify': () =>
        problem(429, 'auth.2fa_locked', 'Too many wrong codes. Try again in 15 minutes.'),
    });
    renderLogin();
    await enterPassword(user);
    await user.type(await screen.findByLabelText(/Authentication code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByText('Too many wrong codes')).toBeInTheDocument();
  });

  it('walks staff through the required set-up, shows the recovery codes once, then signs in', async () => {
    const user = userEvent.setup();
    const reviewer = makeUser({ roles: ['Reviewer'], permissions: ['submissions.review'] });
    const { calls } = mockFetch({
      ...anonymous,
      'POST /auth/login': () => json(200, { twoFactor: challenge('enroll') }),
      'POST /auth/2fa/enroll/setup': () => json(200, setup),
      'POST /auth/2fa/enroll/confirm': () => json(200, { auth: session(reviewer), recoveryCodes }),
    });
    const { container, router } = renderLogin('/login');
    await enterPassword(user);

    expect(await screen.findByRole('heading', { name: 'Set up two-step verification' })).toBeInTheDocument();
    expect(screen.getByText(/requires two-step verification for staff accounts/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /QR code to add Optimize All/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Key for manual entry')).toHaveValue(setup.secret);
    expect(await axeViolations(container)).toEqual([]);

    await user.type(screen.getByLabelText(/Authentication code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on and sign in' }));
    expect(await screen.findByRole('heading', { name: 'Save your recovery codes' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Recovery codes' });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    // Not signed in (and so not redirected away) until the codes are acknowledged.
    expect(router.state.location.pathname).toBe('/login');

    await user.click(screen.getByRole('button', { name: /I’ve saved my codes/ }));
    expect(await screen.findByText('review portal')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/auth/2fa/enroll/confirm')?.body).toEqual({
      challengeToken: 'signed-challenge',
      code: '123456',
    });
  });

  it('asks for the code after Google sign-in too', async () => {
    const user = userEvent.setup();
    mockFetch({
      ...anonymous,
      'POST /auth/google/callback': () =>
        json(200, {
          status: 'twoFactorRequired',
          auth: null,
          ticket: null,
          email: null,
          displayName: null,
          returnTo: '/app/earnings',
          twoFactor: challenge(),
        }),
      'POST /auth/2fa/verify': () => json(200, session(makeUser())),
    });
    const { router } = renderWithApp(<GoogleCallbackPage />, {
      route: '/auth/google/callback?code=4%2Fabc&state=signed-state',
      path: '/auth/google/callback',
      routes: [
        { path: '/app/*', element: <p>participant portal</p> },
        { path: '/login', element: <p>login page</p> },
      ],
    });
    await user.type(await screen.findByLabelText(/Authentication code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByText('participant portal')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/earnings');
  });
});
