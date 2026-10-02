import type { ReactNode } from 'react';
import './StatusPage.css';

export interface StatusPageProps {
  code?: string;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  /** Extra content under the actions (the website 404's helpful links). */
  footer?: ReactNode;
  /** Render as the page's main landmark (for pages outside any layout). */
  standalone?: boolean;
}

/**
 * Full-width message page (404, 403, crash): a status code set large and faint behind an icon tile, the page's h1, a
 * short explanation and the ways forward. The large code is decorative, drawn by CSS from `data-code`; the small code
 * above the title is the text.
 */
export function StatusPage({ code, icon, title, description, actions, footer, standalone }: StatusPageProps) {
  const content = (
    <div className="status-page">
      <div className="status-page__hero">
        {code && <span className="status-page__art" data-code={code} aria-hidden="true" />}
        <span className="status-page__icon" aria-hidden="true">
          {icon}
        </span>
        {code && <p className="status-page__code">{code}</p>}
        <h1 className="status-page__title">{title}</h1>
        <p className="status-page__description">{description}</p>
        {actions && <div className="status-page__actions">{actions}</div>}
      </div>
      {footer}
    </div>
  );
  return standalone ? (
    <main id="main" className="status-page__standalone">
      {content}
    </main>
  ) : (
    content
  );
}
