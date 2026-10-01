import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultLandingPath } from '@/app/portals';
import { rememberEnrolIntent, clearEnrolIntent } from '@/features/learning/enrolIntent';
import { clearSignupIntent, readSignupIntent, rememberSignupIntent } from '@/lib/auth/signupIntent';
import { json, makeUser, mockFetch, problem, session } from '@/test/fetchMock';
import { renderWithApp } from '@/test/render';
import { AUDIENCE_COPY, resolveAudience } from './audience';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { VerifyEmailPage } from './VerifyEmailPage';

const anonymous = { 'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired') };

afterEach(() => {
  clearEnrolIntent();
  clearSignupIntent();
});

const params = (q: string) => new URLSearchParams(q);

describe('resolveAudience', () => {
  it('follows the query string', () => {
    expect(resolveAudience(params(''))).toBe('generic');
    expect(resolveAudience(params('audience=learner'))).toBe('learner');
    expect(resolveAudience(params('audience=creator&next=%2Flearn%2Fx'))).toBe('creator');
    expect(resolveAudience(params('next=%2Flearn%2Fseo%3Fenrol%3D1'))).toBe('learner');
    expect(resolveAudience(params('ref=FRIEND42'))).toBe('creator');
    expect(resolveAudience(params('invite=VIP'))).toBe('creator');
    expect(resolveAudience(params('next=%2Fcreators'))).toBe('creator');
    expect(resolveAudience(params('next=%2Fjoin%2Fabc'))).toBe('creator');
    expect(resolveAudience(params('next=%2Fc%2Fabc'))).toBe('creator');
    expect(resolveAudience(params('next=%2Fservices'))).toBe('generic');
  });

  it('falls back to a remembered enrol intent, but referral codes win', () => {
    rememberEnrolIntent('seo-basics');
    expect(resolveAudience(params(''))).toBe('learner');
    expect(resolveAudience(params('ref=FRIEND42'))).toBe('creator');
  });
});

function renderRegister(route: string) {
  return renderWithApp(<RegisterPage />, {
    route,
    path: '/register',
    routes: [{ path: '/check-email', element: <p>check email page</p> }],
  });
}

describe('RegisterPage audience copy', () => {
  it.each([
    ['/register', 'generic'],
    ['/register?audience=learner', 'learner'],
    ['/register?next=%2Flearn%2Fseo%3Fenrol%3D1', 'learner'],
    ['/register?audience=creator', 'creator'],
    ['/register?ref=FRIEND42', 'creator'],
  ] as const)('%s speaks to the %s audience', async (route, audience) => {
    mockFetch(anonymous);
    renderRegister(route);
    const copy = AUDIENCE_COPY[audience];
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.subtitle)).toBeInTheDocument();
    for (const benefit of copy.benefits) expect(screen.getByText(benefit)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: new RegExp(copy.termsLabel, 'i') })).toBeInTheDocument();
  });

  it('learner and generic copy never mention campaigns in the headline or terms', () => {
    for (const a of ['learner', 'generic'] as const) {
      expect(AUDIENCE_COPY[a].termsLabel).not.toMatch(/participant|campaign/i);
    }
    expect(AUDIENCE_COPY.creator.subtitle).toMatch(/campaigns/);
  });

  it('sends returnTo and audience, and remembers a learner signup intent', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({ ...anonymous, 'POST /auth/register': () => json(202, { message: 'ok' }) });
    renderRegister('/register?next=%2Flearn%2Fseo-basics%3Fenrol%3D1');
    await user.type(screen.getByLabelText('Email'), 'grace@example.com');
    await user.type(screen.getByLabelText('Password'), 'Correct-Horse-42');
    await user.type(screen.getByLabelText('Display name'), 'Grace Hopper');
    await user.selectOptions(screen.getByLabelText('Country'), 'GB');
    await user.click(screen.getByRole('checkbox', { name: /accept the terms and privacy policy/i }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('check email page')).toBeInTheDocument();
    const body = calls.find((c) => c.path === '/auth/register')!.body as Record<string, unknown>;
    expect(body).toMatchObject({ audience: 'learner', returnTo: '/learn/seo-basics?enrol=1', acceptTerms: true });
    expect(readSignupIntent()).toBe('learner');
  }, 30_000);

  it('omits audience for the generic page', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({ ...anonymous, 'POST /auth/register': () => json(202, { message: 'ok' }) });
    renderRegister('/register');
    await user.type(screen.getByLabelText('Email'), 'grace@example.com');
    await user.type(screen.getByLabelText('Password'), 'Correct-Horse-42');
    await user.type(screen.getByLabelText('Display name'), 'Grace Hopper');
    await user.selectOptions(screen.getByLabelText('Country'), 'GB');
    await user.click(screen.getByRole('checkbox', { name: /accept the terms and privacy policy/i }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('check email page')).toBeInTheDocument();
    const body = calls.find((c) => c.path === '/auth/register')!.body as Record<string, unknown>;
    expect(body.audience).toBeUndefined();
    expect(body.returnTo).toBeUndefined();
    expect(readSignupIntent()).toBeNull();
  }, 30_000);
});

describe('LoginPage neutral copy and links', () => {
  it('says who signs in here and carries the remembered course into Create account', () => {
    mockFetch(anonymous);
    rememberEnrolIntent('seo-basics');
    renderWithApp(<LoginPage />, { route: '/login', path: '/login' });
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText(/Clients, learners and creators all sign in here/)).toBeInTheDocument();
    expect(screen.getByText(/set up by the Optimize All team/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register?next=%2Flearn%2Fseo-basics%3Fenrol%3D1',
    );
  });

  it('sends a learner-only account to My learning, but respects an explicit next', async () => {
    const user = userEvent.setup();
    rememberSignupIntent('learner');
    mockFetch({ ...anonymous, 'POST /auth/login': () => json(200, session(makeUser())) });
    const { router } = renderWithApp(<LoginPage />, {
      route: '/login',
      path: '/login',
      routes: [{ path: '/app/*', element: <p>participant portal</p> }],
    });
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/learning'));
  });
});

describe('defaultLandingPath for learners', () => {
  const learner = ['participant.portal'];
  it('lands learner-intent participants in My learning and everyone else as before', () => {
    expect(defaultLandingPath(learner, null, 'learner')).toBe('/app/learning');
    expect(defaultLandingPath(learner, null, 'creator')).toBe('/app');
    expect(defaultLandingPath(learner, null, null)).toBe('/app');
  });

  it('respects an explicit permitted next first', () => {
    expect(defaultLandingPath(learner, '/app/earnings', 'learner')).toBe('/app/earnings');
  });

  it('does not redirect staff with a learner intent', () => {
    expect(defaultLandingPath(['participant.portal', 'submissions.review'], null, 'learner')).toBe('/review');
  });
});

describe('VerifyEmailPage next handling', () => {
  const verifyRoute = (q: string) => `/verify-email?token=tok${q}`;
  const ok = { ...anonymous, 'POST /auth/verify-email': () => json(200, { message: 'Verified.' }) };

  it('prefers next from the link over the remembered course and continues to login with it', async () => {
    rememberEnrolIntent('other-course');
    mockFetch(ok);
    renderWithApp(<VerifyEmailPage />, {
      route: verifyRoute('&next=%2Flearn%2Fseo-basics%3Fenrol%3D1'),
      path: '/verify-email',
    });
    const link = await screen.findByRole('link', { name: 'Sign in and start learning' });
    expect(link).toHaveAttribute('href', '/login?verified=1&next=%2Flearn%2Fseo-basics%3Fenrol%3D1');
  });

  it('falls back to the remembered course when the link has no next', async () => {
    rememberEnrolIntent('other-course');
    mockFetch(ok);
    renderWithApp(<VerifyEmailPage />, { route: verifyRoute(''), path: '/verify-email' });
    const link = await screen.findByRole('link', { name: 'Sign in and start learning' });
    expect(link).toHaveAttribute('href', '/login?verified=1&next=%2Flearn%2Fother-course%3Fenrol%3D1');
  });

  it('ignores an unsafe next and shows the plain sign-in', async () => {
    mockFetch(ok);
    renderWithApp(<VerifyEmailPage />, { route: verifyRoute('&next=%2F%2Fevil.example.com'), path: '/verify-email' });
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/login?verified=1');
  });
});
