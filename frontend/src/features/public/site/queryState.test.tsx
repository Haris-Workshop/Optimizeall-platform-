import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { json, mockFetch, problem } from '@/test/fetchMock';
import { renderWithApp } from '@/test/render';
import { PublicQueryState } from './components';

const notFound = new ApiError({ status: 404, code: 'website.not_found', title: 'Not found' });

function renderMissing(backTo?: { to: string; label: string }) {
  mockFetch({
    'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired'),
    'GET /public/site': () => json(200, {}),
    'GET /public/redirects': () => problem(404, 'http_404', 'Not found'),
  });
  return renderWithApp(
    <PublicQueryState error={notFound} isLoading={false} notFoundTitle="We couldn't find that service" backTo={backTo}>
      <p>content</p>
    </PublicQueryState>,
    { withAuth: false },
  );
}

describe('PublicQueryState (a detail page that does not exist)', () => {
  it('leads back to the list it belongs to, as well as home, and is the page heading', async () => {
    renderMissing({ to: '/services', label: 'Browse all services' });
    expect(await screen.findByRole('heading', { level: 1, name: "We couldn't find that service" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all services' })).toHaveAttribute('href', '/services');
    expect(screen.getByRole('link', { name: 'Go to the homepage' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('keeps the home link only for pages without a list to return to', async () => {
    renderMissing();
    expect(await screen.findByRole('heading', { level: 2, name: "We couldn't find that service" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the homepage' })).toHaveAttribute('href', '/');
  });
});
