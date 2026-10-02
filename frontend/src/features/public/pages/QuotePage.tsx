import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Checkbox, FormField, RadioGroup, Select, Textarea } from '@/components/ui';
import { siteMoney } from '@/features/public/site/format';
import { usePricing, useServices } from '../site/api';
import { PERIOD_SUFFIX } from '../site/components';
import { useSiteCopy } from '../site/copy';
import { useDocumentHead } from '../site/head';
import { CheckList, CoHero } from './companyKit';
import { ContactFields, type ContactValues, EMPTY_CONTACT, FormSuccess, ServicePicker, SubmitRow, useLeadForm, validateContact } from './leadForm';

const STEPS = ['Services', 'Project', 'Your details'] as const;

/**
 * /get-a-quote — three-step quote request: services & packages → budget & timeline → contact details. Each step is
 * validated before the next; the step heading takes focus when the step changes; the summary beside the form follows
 * the visitor's answers.
 */
export function QuotePage() {
  const [params] = useSearchParams();
  const services = useServices();
  const pricing = usePricing();
  const form = useLeadForm<object>('/public/inquiries/quote');
  const [step, setStep] = useState(0);
  const [slugs, setSlugs] = useState<string[]>(() => (params.get('service') ? [params.get('service')!] : []));
  const [packageIds, setPackageIds] = useState<string[]>(() => (params.get('package') ? [params.get('package')!] : []));
  const [budget, setBudget] = useState('');
  const [timeline, setTimeline] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState<ContactValues>(EMPTY_CONTACT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The step the heading was last focused for (StrictMode-safe, unlike a "first render" flag).
  const focusedStep = useRef(step);
  const copy = useSiteCopy();
  const summaryId = useId();
  const nextId = useId();
  useDocumentHead({ title: copy.text('quote.seo.title'), description: copy.text('quote.seo.description') });

  useEffect(() => {
    if (focusedStep.current === step) return;
    focusedStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  // A preselected package implies its service.
  useEffect(() => {
    const pkg = params.get('package');
    if (!pkg || !pricing.data) return;
    const owner = pricing.data.services.find((s) => s.packages.some((p) => p.id === pkg));
    if (owner) setSlugs((current) => (current.includes(owner.service.slug) ? current : [...current, owner.service.slug]));
  }, [params, pricing.data]);

  const packagesForSelection = useMemo(
    () => (pricing.data?.services ?? []).filter((s) => slugs.includes(s.service.slug)),
    [pricing.data, slugs],
  );

  const validate = (index: number): Record<string, string> => {
    const next: Record<string, string> = {};
    if (index === 0 && slugs.length === 0 && packageIds.length === 0) next.serviceSlugs = 'Pick at least one service.';
    if (index === 1) {
      if (!budget) next.budgetRange = 'Pick a budget range.';
      if (!timeline) next.timeline = 'Pick a timeline.';
      if (message.trim().length < 10) next.message = 'Describe your project in a sentence or two (at least 10 characters).';
    }
    if (index === 2) {
      Object.assign(next, validateContact(contact));
      if (!form.consent) next.consent = 'Please tick the box so we can prepare your quote.';
    }
    return next;
  };

  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      next();
      return;
    }
    const all = { ...validate(0), ...validate(1), ...validate(2) };
    setErrors(all);
    if (Object.keys(all).length > 0) {
      if (all.serviceSlugs) setStep(0);
      else if (all.budgetRange || all.timeline || all.message) setStep(1);
      return;
    }
    // Only send packages that belong to a selected service.
    const validPackages = packageIds.filter((id) => packagesForSelection.some((s) => s.packages.some((p) => p.id === id)));
    form.mutation.mutate({ ...contact, serviceSlugs: slugs, packageIds: validPackages, budgetRange: budget, timeline, message });
  };

  const all = { ...form.serverErrors, ...errors };

  // The live summary: names of the chosen services and packages, and the labels of the chosen budget and timeline.
  const serviceNames = (services.data ?? []).flatMap((g) => g.services).filter((s) => slugs.includes(s.slug)).map((s) => s.name);
  const packageNames = packagesForSelection.flatMap((s) => s.packages.filter((p) => packageIds.includes(p.id)).map((p) => `${s.service.name} — ${p.name}`));
  const budgetLabel = form.budgetRanges.find((b) => b.value === budget)?.label;
  const timelineLabel = form.timelines.find((t) => t.value === timeline)?.label;
  const nothingYet = serviceNames.length === 0 && packageNames.length === 0 && !budgetLabel && !timelineLabel;

  return (
    <div className="oa-co-page">
      <CoHero
        className="oa-co-hero--overlap"
        size="compact"
        eyebrow={copy.text('quote.hero.eyebrow')}
        title={copy.text('quote.hero.title')}
        lead={copy.text('quote.hero.lead')}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Get a quote' }]}
        meta={<CheckList items={copy.list('quote.points')} className="oa-co-checks--inline" />}
      />
      <div className="container oa-co-formlayout">
        {form.mutation.isSuccess ? (
          <FormSuccess title={copy.text('quote.success.title')} reference={form.mutation.data.reference}>
            <p>{copy.text('quote.success.text')}</p>
          </FormSuccess>
        ) : (
          <form className="oa-co-card oa-co-form" onSubmit={submit} noValidate aria-labelledby="quote-step-title">
            <ol className="oa-co-stepper" aria-label="Quote steps">
              {STEPS.map((label, i) => (
                <li key={label} aria-current={i === step ? 'step' : undefined} className={i < step ? 'is-done' : i === step ? 'is-current' : undefined}>
                  <span className="oa-co-stepper__row">
                    <span className="oa-co-stepper__n tabular" aria-hidden="true">
                      {i < step ? <Check /> : i + 1}
                    </span>
                    <span className="oa-co-stepper__label">
                      {label}
                      {i < step && <span className="visually-hidden"> (done)</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <h2 id="quote-step-title" ref={headingRef} tabIndex={-1} className="oa-co-card__title">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </h2>

            {step === 0 && (
              <div key="s0" className="oa-co-wizard__step">
                <ServicePicker groups={services.data ?? []} selected={slugs} onChange={setSlugs} legend="Which services do you need?" error={all.serviceSlugs} />
                {packagesForSelection.length > 0 && (
                  <fieldset className="site-checkgroup oa-co-packages">
                    <legend>Interested in a specific package? (optional)</legend>
                    <div className="site-checkgroup__grid">
                      {packagesForSelection.flatMap(({ service, packages }) =>
                        packages.map((p) => (
                          <Checkbox
                            key={p.id}
                            label={`${service.name} — ${p.name}`}
                            description={
                              p.isCustomQuote || p.price === null
                                ? 'Custom quote'
                                : `${siteMoney(p.price, p.currency, { currencyDisplay: 'narrowSymbol' })} ${PERIOD_SUFFIX[p.billingPeriod]}`
                            }
                            checked={packageIds.includes(p.id)}
                            onChange={(e) => setPackageIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))}
                          />
                        )),
                      )}
                    </div>
                  </fieldset>
                )}
              </div>
            )}

            {step === 1 && (
              <div key="s1" className="oa-co-wizard__step">
                <FormField label="Monthly budget" required error={all.budgetRange}>
                  <Select value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Choose a range" options={form.budgetRanges} />
                </FormField>
                <RadioGroup
                  legend="When would you like to start?"
                  value={timeline || null}
                  onChange={setTimeline}
                  options={form.timelines.map((t) => ({ value: t.value, label: t.label }))}
                  error={all.timeline}
                  required
                />
                <FormField label="Project details" required error={all.message} hint="Goals, current situation, anything we should know.">
                  <Textarea rows={5} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
                </FormField>
              </div>
            )}

            {step === 2 && (
              <div key="s2" className="oa-co-wizard__step">
                <ContactFields values={contact} onChange={setContact} errors={all} />
                {form.consentField(errors.consent)}
                {form.generalError}
              </div>
            )}

            <div className="oa-co-wizard__actions">
              {step > 0 ? (
                <Button type="button" variant="ghost" leadingIcon={<ArrowLeft />} onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              {step < STEPS.length - 1 ? (
                <Button type="button" size="lg" trailingIcon={<ArrowRight />} onClick={next}>
                  Next
                </Button>
              ) : (
                <SubmitRow>
                  <Button type="submit" size="lg" variant="highlight" loading={form.mutation.isPending} disabled={form.token.isLoading}>
                    {copy.text('quote.submit')}
                  </Button>
                </SubmitRow>
              )}
            </div>
          </form>
        )}
        <aside className="oa-co-aside" aria-label="Your quote request">
          <section className="oa-co-panel oa-co-panel--dark" aria-labelledby={summaryId}>
            <h2 id={summaryId} className="oa-co-panel__title">
              {copy.text('quote.summary.title')}
            </h2>
            {nothingYet ? (
              <p>{copy.text('quote.summary.empty')}</p>
            ) : (
              <dl className="oa-co-dl">
                {serviceNames.length > 0 && (
                  <div>
                    <dt>Services</dt>
                    <dd>{serviceNames.join(', ')}</dd>
                  </div>
                )}
                {packageNames.length > 0 && (
                  <div>
                    <dt>Packages</dt>
                    <dd>{packageNames.join(', ')}</dd>
                  </div>
                )}
                {budgetLabel && (
                  <div>
                    <dt>Budget</dt>
                    <dd>{budgetLabel}</dd>
                  </div>
                )}
                {timelineLabel && (
                  <div>
                    <dt>Start</dt>
                    <dd>{timelineLabel}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>
          <section className="oa-co-panel" aria-labelledby={nextId}>
            <h2 id={nextId} className="oa-co-panel__title">
              {copy.text('quote.next.title')}
            </h2>
            <ol className="oa-co-numbered">
              {copy.list('quote.next.items').map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
