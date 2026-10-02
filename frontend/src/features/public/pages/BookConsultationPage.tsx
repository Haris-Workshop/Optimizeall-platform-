import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Clock, Globe2 } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, EmptyState, FormField, Skeleton, Textarea } from '@/components/ui';
import { api } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import { browserTimeZone } from '@/lib/format/dates';
import { type Slots, useServices } from '../site/api';
import { useSiteCopy } from '../site/copy';
import { useDocumentHead } from '../site/head';
import { CheckList, CoHero } from './companyKit';
import { ContactFields, type ContactValues, EMPTY_CONTACT, FormSuccess, ServicePicker, SubmitRow, useLeadForm, validateContact } from './leadForm';

function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Slots grouped by the visitor's local day (in their own time zone). Pure; exported for tests. */
export function groupSlotsByDay(slots: string[], timeZone: string): { key: string; slots: string[] }[] {
  const days = new Map<string, string[]>();
  for (const slot of slots) {
    const key = dayKey(slot, timeZone);
    days.set(key, [...(days.get(key) ?? []), slot]);
  }
  return [...days.entries()].map(([key, list]) => ({ key, slots: list }));
}

/**
 * /book-a-consultation — pick a free slot (shown in the visitor's time zone) and book a call. Two parts on one card
 * (the time, then the visitor's details) with a live summary of the chosen call beside it.
 */
export function BookConsultationPage() {
  const timeZone = browserTimeZone();
  const services = useServices();
  const slotsQuery = useQuery({ queryKey: ['public', 'slots'], queryFn: () => api.get<Slots>('/public/consultations/slots', { query: { days: 21 } }) });
  const form = useLeadForm<object>('/public/consultations');
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactValues>(EMPTY_CONTACT);
  const [notes, setNotes] = useState('');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const copy = useSiteCopy();
  const timeId = useId();
  const detailsId = useId();
  const summaryId = useId();
  const agendaId = useId();
  useDocumentHead({ title: copy.text('booking.seo.title'), description: copy.text('booking.seo.description') });

  const days = useMemo(() => groupSlotsByDay(slotsQuery.data?.slots ?? [], timeZone), [slotsQuery.data, timeZone]);
  const activeDay = days.find((d) => d.key === day) ?? days[0];
  const fmt = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { timeZone, ...options }).format(new Date(iso));
  const fmtDay = (iso: string) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtLongDay = (iso: string) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtTime = (iso: string) => fmt(iso, { hour: 'numeric', minute: '2-digit' });
  const slotTaken = isApiError(form.mutation.error) && form.mutation.error.code === 'website.slot_taken';
  const minutes = slotsQuery.data?.slotMinutes;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateContact(contact);
    if (!slot) next.slot = 'Pick a time for your call.';
    if (!form.consent) next.consent = 'Please tick the box so we can confirm your booking.';
    setErrors(next);
    if (Object.keys(next).length === 0)
      form.mutation.mutate(
        { ...contact, slotStart: slot, visitorTimeZone: timeZone, notes, serviceSlugs: slugs },
        {
          onError: (error) => {
            if (isApiError(error) && error.code === 'website.slot_taken') {
              setSlot(null);
              void slotsQuery.refetch();
            }
          },
        },
      );
  };
  const all = { ...form.serverErrors, ...errors };

  if (form.mutation.isSuccess) {
    const booked = form.mutation.data as unknown as { reference: string; slotStart: string };
    return (
      <div className="oa-co-page">
        <CoHero
          className="oa-co-hero--overlap"
          size="compact"
          eyebrow={copy.text('booking.hero.eyebrow')}
          title={copy.text('booking.success.hero')}
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Book a consultation' }]}
        />
        <div className="container oa-co-formlayout oa-co-formlayout--single">
          <FormSuccess title={copy.text('booking.success.title')} reference={booked.reference}>
            <div className="oa-co-booked">
              <span className="oa-co-booked__day">{fmtLongDay(booked.slotStart)}</span>
              <span className="oa-co-booked__time">
                {fmtTime(booked.slotStart)} ({timeZone})
              </span>
            </div>
            <p>
              Your call is on <strong>{fmtDay(booked.slotStart)}</strong> at <strong>{fmtTime(booked.slotStart)}</strong> ({timeZone}). We've
              emailed you the details.
            </p>
          </FormSuccess>
        </div>
      </div>
    );
  }

  return (
    <div className="oa-co-page">
      <CoHero
        className="oa-co-hero--overlap"
        size="compact"
        eyebrow={copy.text('booking.hero.eyebrow')}
        title={copy.text('booking.hero.title')}
        lead={copy.text('booking.hero.lead')}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Book a consultation' }]}
        meta={<CheckList items={copy.list('booking.points')} className="oa-co-checks--inline" />}
      />
      <div className="container oa-co-formlayout">
        <form className="oa-co-card oa-co-form" onSubmit={submit} noValidate aria-label="Book a consultation">
          <div className="oa-co-part" role="group" aria-labelledby={timeId}>
            <h2 id={timeId} className="oa-co-part__legend">
              <span className="oa-co-part__num" aria-hidden="true">
                1
              </span>
              {copy.text('booking.time.title')}
              <span className="oa-co-part__hint">(times shown in {timeZone})</span>
            </h2>
            {slotsQuery.isLoading ? (
              <Skeleton height={160} />
            ) : days.length === 0 ? (
              <EmptyState compact title={copy.text('booking.empty.title')} headingLevel={3} description={copy.text('booking.empty.description')} />
            ) : (
              <>
                <div className="oa-co-days" role="group" aria-label="Day">
                  {days.map((d) => {
                    const first = d.slots[0];
                    return (
                      <button
                        key={d.key}
                        type="button"
                        className="oa-co-day"
                        aria-pressed={activeDay?.key === d.key}
                        aria-label={fmtLongDay(first)}
                        onClick={() => {
                          setDay(d.key);
                          setSlot(null);
                        }}
                      >
                        <span className="oa-co-day__wd" aria-hidden="true">
                          {fmt(first, { weekday: 'short' })}
                        </span>
                        <span className="oa-co-day__num tabular" aria-hidden="true">
                          {fmt(first, { day: 'numeric' })}
                        </span>
                        <span className="oa-co-day__mo" aria-hidden="true">
                          {fmt(first, { month: 'short' })}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="oa-co-slots" role="group" aria-label={`Times on ${activeDay ? fmtDay(activeDay.slots[0]) : ''}`}>
                  {(activeDay?.slots ?? []).map((s) => (
                    <button key={s} type="button" className="oa-co-slot" aria-pressed={slot === s} onClick={() => setSlot(s)}>
                      {fmtTime(s)}
                    </button>
                  ))}
                </div>
              </>
            )}
            {all.slot && (
              <p className="site-field-error" role="alert">
                {all.slot}
              </p>
            )}
            {slotTaken && (
              <Alert tone="warning" title="That time was just taken">
                Please pick another slot — the list has been refreshed.
              </Alert>
            )}
          </div>
          <div className="oa-co-part" role="group" aria-labelledby={detailsId}>
            <h2 id={detailsId} className="oa-co-part__legend">
              <span className="oa-co-part__num" aria-hidden="true">
                2
              </span>
              {copy.text('booking.details.title')}
            </h2>
            <ContactFields values={contact} onChange={setContact} errors={all} />
            <ServicePicker groups={services.data ?? []} selected={slugs} onChange={setSlugs} legend="What would you like to discuss? (optional)" />
            <FormField label="Anything we should know?" optional>
              <Textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </div>
          {form.consentField(errors.consent)}
          {!slotTaken && form.generalError}
          <SubmitRow>
            <Button type="submit" size="lg" variant="highlight" loading={form.mutation.isPending} disabled={form.token.isLoading}>
              {slot ? `Book ${fmtDay(slot)} at ${fmtTime(slot)}` : copy.text('booking.submit')}
            </Button>
          </SubmitRow>
        </form>
        <aside className="oa-co-aside" aria-label="Your booking">
          <section className="oa-co-panel oa-co-panel--dark" aria-labelledby={summaryId}>
            <h2 id={summaryId} className="oa-co-panel__title">
              {copy.text('booking.summary.title')}
            </h2>
            <div className="oa-co-summary" aria-live="polite">
              <span className="oa-co-summary__label">
                <CalendarClock aria-hidden="true" width={14} height={14} /> {slot ? fmtLongDay(slot) : copy.text('booking.summary.empty')}
              </span>
              <span className="oa-co-summary__value tabular">{slot ? fmtTime(slot) : '—'}</span>
            </div>
            <dl className="oa-co-dl">
              {minutes ? (
                <div>
                  <dt>
                    <Clock aria-hidden="true" width={14} height={14} /> Length
                  </dt>
                  <dd>{copy.text('booking.summary.length', { minutes })}</dd>
                </div>
              ) : null}
              <div>
                <dt>
                  <Globe2 aria-hidden="true" width={14} height={14} /> Time zone
                </dt>
                <dd>{timeZone}</dd>
              </div>
            </dl>
          </section>
          <section className="oa-co-panel" aria-labelledby={agendaId}>
            <h2 id={agendaId} className="oa-co-panel__title">
              {copy.text('booking.agenda.title')}
            </h2>
            <CheckList items={copy.list('booking.agenda.items')} />
          </section>
        </aside>
      </div>
    </div>
  );
}
