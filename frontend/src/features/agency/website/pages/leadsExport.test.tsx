import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { json, makeUser, mockFetch, problem, session } from '@/test/fetchMock';
import { renderWithApp } from '@/test/render';
import { InquiriesPage, InquiryDetailPage, SubscribersPage } from './LeadsAdmin';

const staff = makeUser({
  id: 'staff-1',
  roles: ['Admin'],
  permissions: ['site.manage'],
  displayName: 'Web Editor',
});
const empty = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
const csv = () => new Response('reference\n', { status: 200, headers: { 'Content-Type': 'text/csv' } });

function exportUrl(path: string): URL {
  const call = vi.mocked(fetch).mock.calls.find(([u]) => String(u).includes(path));
  if (!call) throw new Error(`${path} was not requested`);
  return new URL(String(call[0]), 'http://localhost');
}

describe('Website lead exports', () => {
  it('exports the inquiries the inbox shows: search and assignee included, not only type and status', async () => {
    const user = userEvent.setup();
    mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/inquiries': () => json(200, empty),
      'GET /agency/website/inquiries/export.csv': csv,
    });
    renderWithApp(<InquiriesPage />, {
      route: '/agency/website/inquiries?type=Contact&status=New&assignedTo=me&search=acme',
      path: '/agency/website/inquiries',
    });
    await user.click(await screen.findByRole('button', { name: 'Export CSV' }));
    await vi.waitFor(() => exportUrl('/inquiries/export.csv'));
    const url = exportUrl('/inquiries/export.csv');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: 'Contact',
      status: 'New',
      assignedTo: 'me',
      search: 'acme',
    });
  });

  it('says why an export over the row cap was refused instead of failing silently', async () => {
    const user = userEvent.setup();
    const message =
      '60,000 rows match these filters, but one export can hold at most 50,000. Narrow the filters (for example a shorter date range) and export again.';
    mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/inquiries': () => json(200, empty),
      'GET /agency/website/inquiries/export.csv': () => problem(422, 'export.too_large', message),
    });
    renderWithApp(<InquiriesPage />, {
      route: '/agency/website/inquiries',
      path: '/agency/website/inquiries',
    });
    await user.click(await screen.findByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText('Export failed')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('exports the newsletter subscribers matching the search too', async () => {
    const user = userEvent.setup();
    mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/newsletter/subscribers': () => json(200, empty),
      'GET /agency/website/newsletter/subscribers/export.csv': csv,
    });
    renderWithApp(<SubscribersPage />, {
      route: '/agency/website/subscribers',
      path: '/agency/website/subscribers',
    });
    await user.type(await screen.findByRole('searchbox'), 'ann');
    // The search is applied (debounced) before the export is asked for.
    await vi.waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([u]) => /newsletter\/subscribers\?.*search=ann/.test(String(u))),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await vi.waitFor(() => exportUrl('/subscribers/export.csv'));
    expect(exportUrl('/subscribers/export.csv').searchParams.get('search')).toBe('ann');
  });
});

describe('Inquiry detail', () => {
  const inquiry = {
    id: 'inq-1', reference: 'OA-9599EE6D', type: 'Contact', status: 'New', name: 'Lead Walker', email: 'lead+1@example.com', company: null,
    serviceSlugs: [], budgetRange: null, utmSource: null, utmCampaign: null, assignedToUserId: null, createdAt: '2026-10-04T15:18:00Z',
    phone: null, website: null, message: 'Hello', packageIds: [], timeline: null, details: {}, utmMedium: null, utmTerm: null, utmContent: null,
    referrer: null, landingPath: '/contact', consentVersion: 'forms-2026-09', consentAt: '2026-10-04T15:18:00Z', staffNotes: null,
    bookingId: null, updatedAt: '2026-10-04T15:18:00Z', concurrencyStamp: 'stamp',
  };
  const open = (permissions: string[]) => {
    mockFetch({
      'POST /auth/refresh': () => json(200, session(makeUser({ id: 'staff-1', roles: ['Admin'], permissions }))),
      'GET /agency/website/inquiries/inq-1': () => json(200, inquiry),
      'GET /agency/staff': () => json(200, []),
    });
    renderWithApp(<InquiryDetailPage />, { route: '/agency/website/inquiries/inq-1', path: '/agency/website/inquiries/:inquiryId' });
  };

  it('leads on to the CRM lead it created, found by its email', async () => {
    open(['site.manage', 'crm.view']);
    const link = await screen.findByRole('link', { name: 'Find this lead in the CRM' });
    expect(link).toHaveAttribute('href', '/agency/crm/contacts?search=lead%2B1%40example.com');
  });

  it('does not offer the CRM link to staff without CRM access', async () => {
    open(['site.manage']);
    await screen.findByText('Lead Walker');
    expect(screen.queryByRole('link', { name: 'Find this lead in the CRM' })).not.toBeInTheDocument();
  });
});
