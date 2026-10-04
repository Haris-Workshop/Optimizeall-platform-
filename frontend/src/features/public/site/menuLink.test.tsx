import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MenuLink } from './SiteHeader';

describe('header menu links from the site settings', () => {
  const show = (url: string | null) =>
    render(
      <MemoryRouter>
        <MenuLink item={{ label: 'Item', url, description: null, children: null }} />
      </MemoryRouter>,
    );

  it('renders an internal path as a link', () => {
    show('/about');
    expect(screen.getByRole('link', { name: 'Item' }).getAttribute('href')).toBe('/about');
  });

  it('opens an external address in a new tab without opener or referrer', () => {
    show('https://example.com/x');
    const link = screen.getByRole('link', { name: 'Item' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', '//evil.example', '/\\evil.example'])(
    'never turns %s into a link',
    (url) => {
      const { container } = show(url);
      expect(container.querySelector('a')).toBeNull();
      expect(screen.getByText('Item')).toBeTruthy();
    },
  );
});
