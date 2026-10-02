import clsx from 'clsx';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { onServerRenderedPage } from '@/lib/ssr';
import { siteNumber } from './format';

/**
 * Motion for the marketing pages, CSS-first and dependency-free:
 * - {@link useReveal}: reveal-on-scroll. Section headings and `[data-reveal]` elements fade and rise in (children of
 *   `[data-reveal='stagger']` one after another) the first time they enter the viewport.
 * - {@link useInViewClass}: toggles `is-inview` so looping CSS animations run only while visible (paused offscreen).
 * - {@link CountUp}: a number that counts up once when it scrolls into view.
 * Nothing is hidden unless the page is mounted, IntersectionObserver exists and the visitor has not asked for reduced
 * motion: the server-rendered HTML, reduced-motion visitors and old browsers always see every word, statically.
 */

export function prefersReducedMotion(): boolean {
  return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function motionAllowed(): boolean {
  return typeof IntersectionObserver !== 'undefined' && !prefersReducedMotion();
}

const REVEAL_SELECTOR = '.site-section__head, [data-reveal]';

/**
 * Reveal-on-scroll for everything under `root`. Re-scans after every render (content that arrives from the API later
 * is picked up); each element is observed once and unobserved as soon as it is revealed.
 *
 * Only elements close to the screen ever change: one observer hides an element (`oa-pending`, marketing.css) when it
 * comes within a screen's height of the viewport, a second one plays its entrance (`is-revealed`; stagger delays come
 * from :nth-child) when it scrolls in. Nothing is toggled on the page's root, nothing is written into style attributes
 * and the rest of a long page is left alone: any of these would make the browser recompute the style of thousands of
 * elements at once on a large page, a long main-thread task right after hydration.
 */
export function useReveal(root: RefObject<HTMLElement>) {
  /** Starts watching one element; null while motion is off. */
  const watch = useRef<((node: Element) => void) | null>(null);
  const seen = useRef(new WeakSet<Element>());
  const scanned = useRef(false);
  /** The first look at a server-rendered page (see below); elements are handed to `watch` when it is done. */
  const firstLook = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !motionAllowed()) return;
    // Created first: in a frame where an element is both near and in view, it is hidden before it is revealed.
    const near = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          near.unobserve(entry.target);
          if (!entry.target.classList.contains('is-revealed')) entry.target.classList.add('oa-pending');
        }
      },
      { rootMargin: '100% 0px 100% 0px' },
    );
    const inView = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          inView.unobserve(entry.target);
          near.unobserve(entry.target);
          entry.target.classList.remove('oa-pending');
          entry.target.classList.add('is-revealed');
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    watch.current = (node) => {
      near.observe(node);
      inView.observe(node);
    };
    if (onServerRenderedPage() && !scanned.current) {
      // A server-rendered page was on screen before the app started: whatever is visible stays as it was painted (no
      // flash). An observer tells which elements those are without forcing a layout (sections below the fold are not
      // even laid out yet, content-visibility in site.css); only the others get an entrance.
      const look = new IntersectionObserver((entries) => {
        look.disconnect();
        firstLook.current = null;
        for (const entry of entries) if (!entry.isIntersecting) watch.current?.(entry.target);
      });
      firstLook.current = look;
    }
    scanned.current = true;
    return () => {
      firstLook.current?.disconnect();
      firstLook.current = null;
      near.disconnect();
      inView.disconnect();
      watch.current = null;
      // A remount (StrictMode, fast refresh) observes everything again with new observers; nothing stays hidden.
      seen.current = new WeakSet();
      el.querySelectorAll('.oa-pending').forEach((node) => node.classList.remove('oa-pending'));
    };
  }, [root]);

  useEffect(() => {
    const el = root.current;
    if (!el || !watch.current) return;
    const look = firstLook.current;
    el.querySelectorAll(REVEAL_SELECTOR).forEach((node) => {
      if (seen.current.has(node)) return;
      seen.current.add(node);
      if (look) look.observe(node);
      else watch.current?.(node);
    });
  });
}

/** Adds `is-inview` to the element while it is (nearly) on screen: looping animations pause offscreen. */
export function useInViewClass<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-inview');
      return;
    }
    const io = new IntersectionObserver(([entry]) => el.classList.toggle('is-inview', entry.isIntersecting), { rootMargin: '80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A figure that counts up from zero the first time it is visible (1.2s, ease-out). The final value is what assistive
 * technology reads, and the box reserves the final width so nothing shifts while it counts.
 */
export function CountUp({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number>(value);
  const format = (n: number) => siteNumber(n) + suffix;

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionAllowed() || value <= 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    let started = false;
    // Server-rendered: the final figure was painted. It is only reset (to count up later) once the observer has said it
    // is off screen; one that is visible keeps its value.
    let first = onServerRenderedPage();
    if (!first) setShown(0);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (first) {
          first = false;
          if (entry.isIntersecting) {
            io.disconnect();
            return;
          }
          setShown(0);
        }
        if (!entry.isIntersecting || started) return;
        started = true;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 1200);
          setShown(Math.round(easeOut(t) * value));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} className={clsx('oa-count', className)} style={{ '--oa-count-ch': format(value).length } as CSSProperties}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="visually-hidden">{format(value)}</span>
    </span>
  );
}

/**
 * An endless horizontal marquee (decorative duplicate for the loop is aria-hidden). Pauses on hover and focus, while
 * offscreen, and becomes a static wrapped list when reduced motion is requested.
 */
export function Marquee({ items, label, className }: { items: ReactNode[]; label: string; className?: string }) {
  const ref = useInViewClass<HTMLDivElement>();
  if (items.length === 0) return null;
  return (
    <div ref={ref} className={clsx('oa-marquee', className)}>
      <ul className="oa-marquee__track" aria-label={label}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <ul className="oa-marquee__track oa-marquee__track--clone" aria-hidden="true">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Pointer-following glow on hover-capable devices: sets --mx/--my (in px) on the card under the pointer. */
export function trackGlow(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const card = (e.target as HTMLElement).closest<HTMLElement>('[data-glow]');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}
