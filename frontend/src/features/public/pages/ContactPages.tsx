import { ArrowRight, CalendarClock, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button, ButtonLink, FormField, Select, Textarea } from '@/components/ui';
import { usePage, useServices, useSite } from '../site/api';
import { Blocks } from '../site/Blocks';
import { useSiteCopy } from '../site/copy';
import { useDocumentHead } from '../site/head';
import { CheckList, CoHero, StepList } from './companyKit';
import { ContactFields, type ContactValues, EMPTY_CONTACT, FormSuccess, ServicePicker, SubmitRow, useLeadForm, validateContact } from './leadForm';

/**
 * /contact and /free-audit: a dark hero, then the form on a raised card with the reassurance beside it. Words come from
 * the editable page copy (`contact.*`, `audit.*`) and the contact page's CMS text; contact details from the site
 * settings. The server-rendered HTML (backend SeoPageResolver.FormPageAsync) carries the same texts.
 */

function ContactItem({ icon, label, value, href, external }: { icon: ReactNode; label: string; value: string; href?: string; external?: boolean }) {
  const body = (
    <>
      <span className="oa-co-contactlist__icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="oa-co-contactlist__label">{label}</span>
        <span className="oa-co-contactlist__value">{value}</span>
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <a href={href} className="oa-co-contactlist__link" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
          {body}
          {external && <span className="visually-hidden"> (opens in a new tab)</span>}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

function ContactDetails() {
  const { data: site } = useSite();
  const copy = useSiteCopy();
  const id = useId();
  const c = site?.contact;
  if (!c || !(c.email || c.phone || c.whatsApp || c.address || c.hours)) return null;
  return (
    <section className="oa-co-panel" aria-labelledby={id}>
      <h2 id={id} className="oa-co-panel__title">
        {copy.text('contact.details.title')}
      </h2>
      <ul className="oa-co-contactlist">
        {c.email && <ContactItem icon={<Mail />} label="Email" value={c.email} href={`mailto:${c.email}`} />}
        {c.phone && <ContactItem icon={<Phone />} label="Phone" value={c.phone} href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} />}
        {c.whatsApp && <ContactItem icon={<MessageCircle />} label="WhatsApp" value="WhatsApp us" href={`https://wa.me/${c.whatsApp.replace(/\D/g, '')}`} external />}
        {c.address && <ContactItem icon={<MapPin />} label="Address" value={c.address} />}
        {c.hours && <ContactItem icon={<Clock />} label="Hours" value={c.hours} />}
      </ul>
    </section>
  );
}

/** /contact */
export function ContactPage() {
  const services = useServices();
  const page = usePage('contact');
  const form = useLeadForm<object>('/public/inquiries/contact');
  const [contact, setContact] = useState<ContactValues>(EMPTY_CONTACT);
  const [message, setMessage] = useState('');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const copy = useSiteCopy();
  const callId = useId();
  const formTitleId = useId();
  useDocumentHead({ title: copy.text('contact.seo.title'), description: copy.text('contact.seo.description') });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateContact(contact);
    if (message.trim().length < 10) next.message = 'Tell us a little more (at least 10 characters).';
    if (!form.consent) next.consent = 'Please tick the box so we can reply.';
    setErrors(next);
    if (Object.keys(next).length === 0) form.mutation.mutate({ ...contact, message, serviceSlugs: slugs });
  };
  const all = { ...form.serverErrors, ...errors };
  const cmsText = page.data?.blocks.filter((b) => b.type === 'richText') ?? [];

  return (
    <div className="oa-co-page">
      <CoHero
        className="oa-co-hero--overlap"
        size="compact"
        eyebrow={copy.text('contact.hero.eyebrow')}
        title={copy.text('contact.hero.title')}
        lead={copy.text('contact.hero.lead')}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Contact' }]}
        meta={<CheckList items={copy.list('contact.points')} className="oa-co-checks--inline" />}
      />
      <div className="container oa-co-formlayout">
        {form.mutation.isSuccess ? (
          <FormSuccess title={copy.text('contact.success.title')} reference={form.mutation.data.reference}>
            <p>{form.mutation.data.message}</p>
          </FormSuccess>
        ) : (
          <form className="oa-co-card oa-co-form" onSubmit={submit} noValidate aria-label="Contact form">
            <div className="oa-co-card__head">
              <h2 id={formTitleId} className="oa-co-card__title">
                {copy.text('contact.form.title')}
              </h2>
              <p className="oa-co-card__intro">{copy.text('contact.form.intro')}</p>
            </div>
            <ContactFields values={contact} onChange={setContact} errors={all} />
            <FormField label="How can we help?" required error={all.message}>
              <Textarea rows={5} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
            </FormField>
            <ServicePicker groups={services.data ?? []} selected={slugs} onChange={setSlugs} legend="Services you're interested in (optional)" error={all.serviceSlugs} />
            {form.consentField(errors.consent)}
            {form.generalError}
            <SubmitRow>
              <Button type="submit" size="lg" variant="highlight" loading={form.mutation.isPending} disabled={form.token.isLoading}>
                {copy.text('contact.submit')}
              </Button>
            </SubmitRow>
          </form>
        )}
        <aside className="oa-co-aside" aria-label="Contact details">
          {cmsText.length > 0 && (
            <div className="oa-co-panel oa-co-panel--quiet oa-co-panel--cms">
              <Blocks blocks={cmsText} />
            </div>
          )}
          <section className="oa-co-panel oa-co-panel--dark" aria-labelledby={callId}>
            <span className="oa-co-panel__icon" aria-hidden="true">
              <CalendarClock />
            </span>
            <h2 id={callId} className="oa-co-panel__title">
              {copy.text('contact.call.title')}
            </h2>
            <p>{copy.text('contact.call.text')}</p>
            <div>
              <ButtonLink to="/book-a-consultation" variant="secondary" trailingIcon={<ArrowRight />}>
                {copy.text('contact.call.cta')}
              </ButtonLink>
            </div>
          </section>
          <ContactDetails />
        </aside>
      </div>
    </div>
  );
}

/** /free-audit — free marketing audit request. */
export function FreeAuditPage() {
  const services = useServices();
  const form = useLeadForm<object>('/public/inquiries/audit');
  const [contact, setContact] = useState<ContactValues>(EMPTY_CONTACT);
  const [goals, setGoals] = useState('');
  const [budget, setBudget] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const copy = useSiteCopy();
  const includedId = useId();
  const stepsId = useId();
  useDocumentHead({ title: copy.text('audit.seo.title'), description: copy.text('audit.seo.description') });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateContact(contact, true);
    if (goals.trim().length < 5) next.goals = 'Tell us what you want to achieve.';
    if (!budget) next.budgetRange = 'Pick a budget range.';
    if (slugs.length === 0) next.serviceSlugs = 'Pick at least one area to audit.';
    if (!form.consent) next.consent = 'Please tick the box so we can send your audit.';
    setErrors(next);
    if (Object.keys(next).length === 0)
      form.mutation.mutate({ ...contact, goals, budgetRange: budget, competitors, serviceSlugs: slugs });
  };
  const all = { ...form.serverErrors, ...errors };

  return (
    <div className="oa-co-page">
      <CoHero
        className="oa-co-hero--overlap"
        size="compact"
        eyebrow={copy.text('audit.hero.eyebrow')}
        title={copy.text('audit.hero.title')}
        lead={copy.text('audit.hero.lead')}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Free audit' }]}
      />
      <div className="container oa-co-formlayout">
        {form.mutation.isSuccess ? (
          <FormSuccess title={copy.text('audit.success.title')} reference={form.mutation.data.reference}>
            <p>{copy.text('audit.success.text')}</p>
          </FormSuccess>
        ) : (
          <form className="oa-co-card oa-co-form" onSubmit={submit} noValidate aria-label="Free audit request">
            <div className="oa-co-card__head">
              <h2 className="oa-co-card__title">{copy.text('audit.form.title')}</h2>
            </div>
            <ContactFields values={contact} onChange={setContact} errors={all} websiteRequired />
            <FormField label="What are your goals?" required error={all.goals} hint="E.g. more qualified leads, lower cost per sale, rank for key terms.">
              <Textarea rows={4} maxLength={2000} value={goals} onChange={(e) => setGoals(e.target.value)} />
            </FormField>
            <FormField label="Monthly marketing budget" required error={all.budgetRange}>
              <Select value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Choose a range" options={form.budgetRanges} />
            </FormField>
            <ServicePicker groups={services.data ?? []} selected={slugs} onChange={setSlugs} legend="What should we look at?" error={all.serviceSlugs} />
            <FormField label="Main competitors" optional error={all.competitors}>
              <Textarea rows={2} maxLength={500} value={competitors} onChange={(e) => setCompetitors(e.target.value)} />
            </FormField>
            {form.consentField(errors.consent)}
            {form.generalError}
            <SubmitRow>
              <Button type="submit" size="lg" variant="highlight" loading={form.mutation.isPending} disabled={form.token.isLoading}>
                {copy.text('audit.submit')}
              </Button>
            </SubmitRow>
          </form>
        )}
        <aside className="oa-co-aside" aria-label="About the audit">
          <section className="oa-co-panel oa-co-panel--dark" aria-labelledby={includedId}>
            <h2 id={includedId} className="oa-co-panel__title">
              {copy.text('audit.included.title')}
            </h2>
            <CheckList items={copy.list('audit.included.items')} />
          </section>
          <section className="oa-co-panel" aria-labelledby={stepsId}>
            <h2 id={stepsId} className="oa-co-panel__title">
              {copy.text('audit.steps.title')}
            </h2>
            <StepList steps={copy.pairs('audit.steps.items')} className="oa-co-steps--compact" />
          </section>
        </aside>
      </div>
    </div>
  );
}
