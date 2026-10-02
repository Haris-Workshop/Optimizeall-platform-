import { useMemo, useRef, type IframeHTMLAttributes } from 'react';

/** Attribute that holds an element's inline style in the frame's markup until it is applied (see {@link prepareHtml}). */
const STYLE_ATTR = 'data-oa-style';

/** A start tag (attribute values may contain `>` inside quotes). */
const START_TAG = /<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;
/** One attribute of a start tag: leading space, name, optional `= value`. */
const ATTRIBUTE = /(\s+)([^\s"'>/=]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

/**
 * An HTML document (an email) with its styles taken out of the markup: `style` attributes become {@link STYLE_ATTR}
 * and the `<style>` elements' CSS is returned separately. Plain string rewriting: parsing the email in the app's
 * document (DOMParser, `<template>`) would already apply — and refuse — its styles under the app's CSP.
 */
export function prepareHtml(html: string): { html: string; css: string } {
  const css: string[] = [];
  const out = html
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_m, text: string) => {
      css.push(text);
      return '';
    })
    // Stylesheets from other hosts (web fonts) are not allowed by the CSP either: dropped rather than refused.
    .replace(/<link\b[^>]*\brel\s*=\s*["']?[^"'>]*\bstylesheet\b[^>]*>/gi, '')
    .replace(START_TAG, (tag) =>
      tag.replace(ATTRIBUTE, (attr, space: string, name: string, value?: string) =>
        name.toLowerCase() === 'style' ? `${space}${STYLE_ATTR}${value ?? ''}` : attr,
      ),
    );
  return { html: out, css: css.join('\n') };
}

/** Applies the styles {@link prepareHtml} took out, through the CSSOM (allowed by the CSP), once the frame has loaded. */
export function applyStyles(frame: HTMLIFrameElement, css: string): void {
  const doc = frame.contentDocument;
  const win = frame.contentWindow as (Window & typeof globalThis) | null;
  if (!doc || !win) return;
  for (const el of doc.querySelectorAll<HTMLElement>(`[${STYLE_ATTR}]`)) {
    el.style.cssText = el.getAttribute(STYLE_ATTR) ?? '';
    el.removeAttribute(STYLE_ATTR);
  }
  if (css) {
    // A constructed stylesheet belongs to the document whose window built it.
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(css.replace(/@import[^;]*;/g, ''));
    doc.adoptedStyleSheets = [sheet];
  }
}

type Props = Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'srcDoc' | 'sandbox' | 'onLoad'> & {
  /** The document to show (an email's HTML). */
  html: string;
  title: string;
};

/**
 * Shows an HTML document — an email preview — in a sandboxed frame under the app's strict CSP
 * (docs/SECURITY.md § Content-Security-Policy). A `srcdoc` frame inherits the page's policy, which refuses the email's
 * `<style>` elements and `style` attributes, so they are taken out of the markup ({@link prepareHtml}) and applied
 * through the CSSOM when the frame loads. The sandbox still runs no scripts; it keeps the frame's origin only so the
 * app can reach its document to style it.
 */
export function HtmlPreviewFrame({ html, title, ...rest }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const prepared = useMemo(() => prepareHtml(html), [html]);
  return (
    <iframe
      {...rest}
      ref={ref}
      title={title}
      sandbox="allow-same-origin"
      srcDoc={prepared.html}
      onLoad={() => {
        if (ref.current) applyStyles(ref.current, prepared.css);
      }}
    />
  );
}
