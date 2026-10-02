import { ArrowDown, ArrowUp, ExternalLink, RotateCcw } from 'lucide-react';
import { Button, IconButton, Switch } from '@/components/ui';
import type { PageSection, ProductChrome, SiteLink } from '@/features/public/site/api';
import {
  CREATORS_SECTIONS,
  DEFAULT_PRODUCT_LINKS,
  DEFAULT_PRODUCTS,
  DEFAULT_SECONDARY_LINK,
  DEFAULT_SIGN_IN_LINKS,
  HOME_SECTIONS,
  mergeSections,
} from '@/features/public/site/layout';
import type { SiteSettings } from '../api';
import { type Errors, errorFor, ImageField, ListEditor, TextField } from '../shared/fields';

/**
 * Site settings tabs for the site's structure: brand assets, the section order of the home and creators pages, the
 * Academy's and Creators' header and footer, and the footer's product and sign-in groups. Each part has "Reset to
 * default" (the shipped values, as the site looked before anything was edited) and a link to the page it changes.
 */

type Set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void;

const EMPTY_LINK: SiteLink = { label: '', url: '' };

export const HOME_SECTION_LABELS: Record<string, string> = {
  logos: 'Client logos',
  partners: 'Partner placements',
  services: 'Services',
  proof: 'Results and case studies',
  process: 'How we work',
  industries: 'Industries',
  testimonials: 'Testimonials',
  insights: 'Latest articles',
  band: 'Partner band',
  more: 'More from Optimize All (Academy, Creators)',
  cta: 'Closing call to action and pricing',
  newsletter: 'Newsletter',
};

export const CREATORS_SECTION_LABELS: Record<string, string> = {
  how: 'How it works (#how-it-works)',
  earnings: 'How earnings work',
  rules: 'Campaign rules (#rules)',
  faq: 'Most asked questions',
  cta: 'Closing call to action',
};

function ResetButton({ onClick, label = 'Reset to default' }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="ghost" leadingIcon={<RotateCcw />} onClick={onClick}>
      {label}
    </Button>
  );
}

function ViewLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="seo-filelink">
      {children} <ExternalLink aria-hidden="true" size={14} />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

export function LinkFields({ value, onChange, errors, field, required = true }: { value: SiteLink; onChange: (v: SiteLink) => void; errors: Errors; field: string; required?: boolean }) {
  return (
    <div className="cms-grid-2">
      <TextField label="Label" value={value.label} onChange={(label) => onChange({ ...value, label })} error={errors[`${field}.label`]} required={required} maxLength={60} />
      <TextField label="Link" value={value.url} onChange={(url) => onChange({ ...value, url })} error={errors[`${field}.url`]} required={required} hint="/relative/path or https://…" />
    </div>
  );
}

function LinkList({ legend, items, onChange, errors, field, addLabel = 'Add link' }: { legend: string; items: SiteLink[]; onChange: (items: SiteLink[]) => void; errors: Errors; field: string; addLabel?: string }) {
  return (
    <ListEditor
      legend={legend}
      addLabel={addLabel}
      items={items}
      empty={EMPTY_LINK}
      error={errorFor(errors, field)}
      onChange={onChange}
      render={(link, update, i) => <LinkFields value={link} onChange={update} errors={errors} field={`${field}[${i}]`} />}
    />
  );
}

// ---------------------------------------------------------------------------------------------------- brand

export function BrandTab({ draft, set, errors, defaults }: { draft: SiteSettings; set: Set; errors: Errors; defaults?: SiteSettings | null }) {
  const brand = draft.brand ?? { logoUrl: null, logoDarkUrl: null, faviconUrl: null };
  const update = (patch: Partial<typeof brand>) => set('brand', { ...brand, ...patch });
  return (
    <div className="cms-form">
      <p className="text-muted">
        Without an upload the site uses the built-in Optimize All logo and icons. The logo shows in the header and footer
        of the agency site, the Academy and Creators; use a transparent PNG or SVG about 60 px high.
      </p>
      <ImageField label="Logo" value={brand.logoUrl} onChange={(logoUrl) => update({ logoUrl: logoUrl || null })} error={errors['brand.logoUrl']} />
      <ImageField label="Logo on dark backgrounds" value={brand.logoDarkUrl} onChange={(logoDarkUrl) => update({ logoDarkUrl: logoDarkUrl || null })} error={errors['brand.logoDarkUrl']} />
      <ImageField label="Browser icon (favicon)" value={brand.faviconUrl} onChange={(faviconUrl) => update({ faviconUrl: faviconUrl || null })} error={errors['brand.faviconUrl']} />
      <p className="text-small text-muted">
        The organization logo for search engines (structured data) is set under SEO &amp; organization; the default social
        image there too.
      </p>
      <div>
        <ResetButton onClick={() => set('brand', defaults?.brand ?? { logoUrl: null, logoDarkUrl: null, faviconUrl: null })} label="Use the built-in brand assets" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- layout

function SectionList({
  legend,
  sections,
  labels,
  onChange,
  idPrefix,
}: {
  legend: string;
  sections: PageSection[];
  labels: Record<string, string>;
  onChange: (sections: PageSection[]) => void;
  idPrefix: string;
}) {
  const move = (from: number, to: number) => {
    const next = [...sections];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  return (
    <ol className="cms-sections" aria-label={legend}>
      {sections.map((s, i) => {
        const label = labels[s.key] ?? s.key;
        return (
          <li key={s.key} className="cms-sections__item" data-hidden={s.visible ? undefined : ''}>
            <span className="cms-sections__num tabular" aria-hidden="true">
              {i + 1}
            </span>
            <Switch
              id={`${idPrefix}-${s.key}`}
              label={label}
              description={s.visible ? 'Shown' : 'Hidden'}
              checked={s.visible}
              onCheckedChange={(visible) => onChange(sections.map((x) => (x.key === s.key ? { ...x, visible } : x)))}
            />
            <span className="cms-sections__tools">
              <IconButton size="sm" variant="ghost" label={`Move ${label} up`} icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, i - 1)} />
              <IconButton size="sm" variant="ghost" label={`Move ${label} down`} icon={<ArrowDown />} disabled={i === sections.length - 1} onClick={() => move(i, i + 1)} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LayoutTab({ draft, set }: { draft: SiteSettings; set: Set }) {
  const home = mergeSections(draft.layouts?.home, HOME_SECTIONS);
  const creators = mergeSections(draft.layouts?.creators, CREATORS_SECTIONS);
  const update = (patch: Partial<{ home: PageSection[]; creators: PageSection[] }>) => set('layouts', { home, creators, ...patch });
  return (
    <div className="cms-form">
      <p className="text-muted">
        Choose which sections the page shows and in what order. The hero always comes first. Sections without content (no
        testimonials yet, no published articles) stay hidden on their own. Texts are edited in Page texts.
      </p>
      <fieldset className="cms-fieldset">
        <legend>Home page</legend>
        <SectionList legend="Home page sections" idPrefix="layout-home" sections={home} labels={HOME_SECTION_LABELS} onChange={(h) => update({ home: h })} />
        <div className="cluster">
          <ResetButton onClick={() => update({ home: HOME_SECTIONS.map((key) => ({ key, visible: true })) })} />
          <ViewLink href="/">View the home page</ViewLink>
        </div>
      </fieldset>
      <fieldset className="cms-fieldset">
        <legend>Creators page (/creators)</legend>
        <SectionList legend="Creators page sections" idPrefix="layout-creators" sections={creators} labels={CREATORS_SECTION_LABELS} onChange={(c) => update({ creators: c })} />
        <p className="text-small text-muted">The Creators menu links to #how-it-works and #rules: hiding those sections also hides their targets.</p>
        <div className="cluster">
          <ResetButton onClick={() => update({ creators: CREATORS_SECTIONS.map((key) => ({ key, visible: true })) })} />
          <ViewLink href="/creators">View the creators page</ViewLink>
        </div>
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- products

function ProductFields({
  name,
  field,
  value,
  onChange,
  errors,
  fallback,
  href,
}: {
  name: string;
  field: string;
  value: ProductChrome;
  onChange: (v: ProductChrome) => void;
  errors: Errors;
  fallback: ProductChrome;
  href: string;
}) {
  return (
    <fieldset className="cms-fieldset">
      <legend>{name}</legend>
      <LinkList legend={`${name}: header menu`} items={value.nav} onChange={(nav) => onChange({ ...value, nav })} errors={errors} field={`${field}.nav`} />
      <fieldset className="cms-fieldset">
        <legend>{name}: header button</legend>
        <LinkFields value={value.cta} onChange={(cta) => onChange({ ...value, cta })} errors={errors} field={`${field}.cta`} />
      </fieldset>
      <LinkList legend={`${name}: footer links`} items={value.footerLinks} onChange={(footerLinks) => onChange({ ...value, footerLinks })} errors={errors} field={`${field}.footerLinks`} />
      <TextField label="Footer note" value={value.footerNote} onChange={(footerNote) => onChange({ ...value, footerNote: footerNote || null })} error={errors[`${field}.footerNote`]} maxLength={200} />
      <fieldset className="cms-fieldset">
        <legend>{name}: link after the footer note</legend>
        <LinkFields
          value={value.footerNoteLink ?? EMPTY_LINK}
          onChange={(l) => onChange({ ...value, footerNoteLink: l.label || l.url ? l : null })}
          errors={errors}
          field={`${field}.footerNoteLink`}
          required={false}
        />
      </fieldset>
      <div className="cluster">
        <ResetButton onClick={() => onChange(fallback)} />
        <ViewLink href={href}>{`View ${name}`}</ViewLink>
      </div>
    </fieldset>
  );
}

export function ProductsTab({ draft, set, errors, defaults }: { draft: SiteSettings; set: Set; errors: Errors; defaults?: SiteSettings | null }) {
  const fallback = defaults?.products ?? DEFAULT_PRODUCTS;
  const products = draft.products ?? fallback;
  return (
    <div className="cms-form">
      <p className="text-muted">
        The Academy (/learn, /verify) and the Creators programme (/creators, /join) have their own small header and footer.
        Their wordmark follows the site name and the logo in Brand.
      </p>
      <ProductFields
        name="Academy"
        field="products.academy"
        value={products.academy}
        onChange={(academy) => set('products', { ...products, academy })}
        errors={errors}
        fallback={fallback.academy}
        href="/learn"
      />
      <ProductFields
        name="Creators"
        field="products.creators"
        value={products.creators}
        onChange={(creators) => set('products', { ...products, creators })}
        errors={errors}
        fallback={fallback.creators}
        href="/creators"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- header + footer extras

export function HeaderQuietLink({ draft, set, errors, defaults }: { draft: SiteSettings; set: Set; errors: Errors; defaults?: SiteSettings | null }) {
  const fallback = defaults?.header.secondaryLink ?? DEFAULT_SECONDARY_LINK;
  return (
    <fieldset className="cms-fieldset">
      <legend>Quiet link next to the button</legend>
      <LinkFields value={draft.header.secondaryLink ?? fallback} onChange={(secondaryLink) => set('header', { ...draft.header, secondaryLink })} errors={errors} field="header.secondaryLink" />
      <p className="text-small text-muted">A plain text link before the header button (“Free Academy” by default). Use a path on this site.</p>
      <div>
        <ResetButton onClick={() => set('header', { ...draft.header, secondaryLink: fallback })} />
      </div>
    </fieldset>
  );
}

export function FooterGroups({ draft, set, errors, defaults }: { draft: SiteSettings; set: Set; errors: Errors; defaults?: SiteSettings | null }) {
  const productDefaults = defaults?.footer.productLinks ?? DEFAULT_PRODUCT_LINKS;
  const signInDefaults = defaults?.footer.signInLinks ?? DEFAULT_SIGN_IN_LINKS;
  return (
    <>
      <LinkList
        legend="Sibling products group (“More from Optimize All”)"
        items={draft.footer.productLinks ?? productDefaults}
        onChange={(productLinks) => set('footer', { ...draft.footer, productLinks })}
        errors={errors}
        field="footer.productLinks"
      />
      <LinkList
        legend="Sign-in group"
        items={draft.footer.signInLinks ?? signInDefaults}
        onChange={(signInLinks) => set('footer', { ...draft.footer, signInLinks })}
        errors={errors}
        field="footer.signInLinks"
      />
      <p className="text-small text-muted">
        These two groups follow the columns above; their titles are page texts (Shared site sections). The mobile menu
        lists the sibling products too.
      </p>
      <div className="cluster">
        <ResetButton onClick={() => set('footer', { ...draft.footer, productLinks: productDefaults, signInLinks: signInDefaults })} label="Reset both groups" />
      </div>
    </>
  );
}
