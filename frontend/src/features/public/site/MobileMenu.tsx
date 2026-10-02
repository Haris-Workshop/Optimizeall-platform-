import { Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { IconButton } from '@/components/ui';
import { useModalBehavior } from '@/components/ui/useModalBehavior';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * The public site's mobile menu: the "Open menu" button and the modal sheet it opens (focus moves in and is trapped,
 * Escape, the backdrop and the close button close it, page scroll is locked, focus returns to the button).
 *
 * Built so that a tap answers at once on a slow phone (interaction latency): the sheet is rendered once, in the
 * background when the page is idle (or on the first tap), and from then on opening and closing only show and hide it;
 * the entrance is a CSS animation. The open state lives here, not in the header, so a tap re-renders this button and
 * the sheet's frame, never the header or the menu's contents (`children`, created by the caller).
 */
export function MobileMenu({
  title,
  headerContent,
  children,
}: {
  /** The sheet's accessible name ("Menu"). */
  title: string;
  /** Shown in the sheet's header in place of the (visually hidden) title, e.g. the logo. */
  headerContent?: ReactNode;
  /** The menu itself. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { pathname } = useLocation();
  const close = () => setOpen(false);
  useModalBehavior(open, panelRef, { onClose: close });

  // A new page closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  // Rendered while the page is idle, so that even the first tap only has to show it.
  useEffect(() => {
    if (rendered) return;
    const w = window as IdleWindow;
    if (w.requestIdleCallback && w.cancelIdleCallback) {
      const handle = w.requestIdleCallback(() => setRendered(true), { timeout: 5_000 });
      return () => w.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setRendered(true), 2_000);
    return () => window.clearTimeout(timer);
  }, [rendered]);

  // Following a link in the menu closes it (a link to the page already shown would otherwise leave it open).
  const isRendered = rendered || open;
  useEffect(() => {
    const panel = panelRef.current;
    if (!isRendered || !panel) return;
    const onClick = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.ui-drawer__body a[href]')) setOpen(false);
    };
    panel.addEventListener('click', onClick);
    return () => panel.removeEventListener('click', onClick);
  }, [isRendered]);

  return (
    <>
      <IconButton
        className="public-header__menu"
        label="Open menu"
        icon={<Menu />}
        aria-expanded={open}
        onClick={() => {
          setRendered(true);
          setOpen(true);
        }}
      />
      {isRendered &&
        createPortal(
          <>
            <div className="ui-drawer-backdrop site-sheet-backdrop" aria-hidden="true" hidden={!open} onMouseDown={close} />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              hidden={!open}
              className="ui-drawer ui-drawer--right site-drawer-panel site-sheet"
            >
              <div className="ui-drawer__header">
                {headerContent}
                <h2 id={titleId} className={headerContent ? 'ui-drawer__title visually-hidden' : 'ui-drawer__title'}>
                  {title}
                </h2>
                <IconButton label="Close menu" icon={<X />} onClick={close} />
              </div>
              <div className="ui-drawer__body">
                {children}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
