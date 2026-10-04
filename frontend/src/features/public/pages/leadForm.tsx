import { useMutation } from '@tanstack/react-query';
import { Check, Lock } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Alert, ButtonLink, FormField, Input } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage, isApiError } from '@/lib/api/errors';
import { type ServiceCategoryGroup, useSite } from '../site/api';
import { useSiteCopy } from '../site/copy';
import { ConsentCheckbox, fieldErrorsOf, Honeypot, useFormToken, useRenewFormToken, withFormEnvelope } from '../site/forms';

export interface ContactValues {
  name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
}

export const EMPTY_CONTACT: ContactValues = { name: '', email: '', phone: '', company: '', website: '' };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(values: ContactValues, requireWebsite = false): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.name.trim().length < 2) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address, e.g. name@company.com.';
  if (values.phone.trim() && !/^\+?[0-9][0-9 ().-]{5,30}$/.test(values.phone.trim())) errors.phone = 'Enter a valid phone number.';
  if (requireWebsite && !values.website.trim()) errors.website = 'Enter the website you would like us to audit.';
  else if (values.website.trim() && !/^(https?:\/\/)?[^\s/$.?#]+\.[^\s]+$/i.test(values.website.trim())) errors.website = 'Enter a website address such as example.com.';
  return errors;
}

/** Name, email, phone, company and website fields shared by the lead forms. */
export function ContactFields({
  values,
  onChange,
  errors,
  websiteRequired,
  showWebsite = true,
}: {
  values: ContactValues;
  onChange: (values: ContactValues) => void;
  errors: Record<string, string>;
  websiteRequired?: boolean;
  showWebsite?: boolean;
}) {
  const set = (key: keyof ContactValues) => (e: { target: { value: string } }) => onChange({ ...values, [key]: e.target.value });
  return (
    <>
      <div className="site-form__row">
        <FormField label="Full name" required error={errors.name}>
          <Input autoComplete="name" value={values.name} onChange={set('name')} />
        </FormField>
        <FormField label="Work email" required error={errors.email}>
          <Input type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        </FormField>
      </div>
      <div className="site-form__row">
        <FormField label="Company" optional error={errors.company}>
          <Input autoComplete="organization" value={values.company} onChange={set('company')} />
        </FormField>
        <FormField label="Phone" optional error={errors.phone}>
          <Input type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} />
        </FormField>
      </div>
      {showWebsite && (
        <FormField label="Website" required={websiteRequired} optional={!websiteRequired} error={errors.website} hint="For example yourcompany.com">
          <Input type="url" inputMode="url" autoComplete="url" value={values.website} onChange={set('website')} />
        </FormField>
      )}
    </>
  );
}

/**
 * The services as toggle chips, grouped under their service line. Each chip is a real checkbox labelled with the
 * service name, so keyboard, screen-reader and form behaviour are the browser's own.
 */
export function ServicePicker({
  groups,
  selected,
  onChange,
  legend,
  error,
}: {
  groups: ServiceCategoryGroup[];
  selected: string[];
  onChange: (slugs: string[]) => void;
  legend: string;
  error?: string;
}) {
  const id = useId();
  const toggle = (slug: string, on: boolean) => onChange(on ? [...selected, slug] : selected.filter((s) => s !== slug));
  const visible = groups.filter((g) => g.services.length > 0);
  return (
    <fieldset className="oa-co-picker" aria-describedby={error ? `${id}-error` : undefined} data-invalid={error ? 'true' : undefined}>
      <legend>{legend}</legend>
      {visible.map((g) => (
        <div key={g.slug} className="oa-co-picker__group">
          {visible.length > 1 && (
            <p className="oa-co-picker__label" aria-hidden="true">
              {g.name}
            </p>
          )}
          <div className="oa-co-picker__chips">
            {g.services.map((s) => (
              <label key={s.slug} className="oa-co-pick">
                <input type="checkbox" checked={selected.includes(s.slug)} onChange={(e) => toggle(s.slug, e.target.checked)} />
                <span className="oa-co-pick__box" aria-hidden="true">
                  <Check />
                </span>
                {s.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      {error && (
        <p className="site-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Submission plumbing shared by the contact, audit and quote forms. */
export function useLeadForm<T extends object>(path: string) {
  const token = useFormToken();
  const renewToken = useRenewFormToken();
  const { data: site } = useSite();
  const [nickname, setNickname] = useState('');
  const [consent, setConsent] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const consentVersion = site?.consent.formVersion ?? 'forms-2026-09';
  const mutation = useMutation({
    mutationFn: (body: T) =>
      api.post<{ reference: string; message: string }>(path, withFormEnvelope(body, token.data?.token, consentVersion, { nickname, consent })),
    onSuccess: () => void renewToken(),
    onError: (error) => setServerErrors(fieldErrorsOf(error)),
  });
  const consentField = (error?: string) => (
    <>
      <Honeypot value={nickname} onChange={setNickname} />
      <ConsentCheckbox
        id={`consent-${path.replace(/\W/g, '-')}`}
        text={site?.consent.formText ?? 'I agree that Optimize All may use my details to respond to my request.'}
        checked={consent}
        onChange={setConsent}
        error={error ?? serverErrors.consent}
      />
    </>
  );
  const generalError =
    mutation.isError && !Object.keys(serverErrors).some((k) => k !== 'consent') ? (
      <Alert tone="danger" title="We couldn't send your request">
        {isApiError(mutation.error) && mutation.error.code === 'website.form_too_fast'
          ? 'That was quick! Please check your answers and send the form again.'
          : errorMessage(mutation.error)}
      </Alert>
    ) : null;
  return { token, consent, mutation, serverErrors, consentField, generalError, budgetRanges: token.data?.budgetRanges ?? [], timelines: token.data?.timelines ?? [] };
}

/** The send button with the privacy note beside it (editable: `forms.privacyNote`). */
export function SubmitRow({ children }: { children: ReactNode }) {
  const copy = useSiteCopy();
  return (
    <div className="oa-co-form__submit">
      {children}
      <p className="oa-co-form__note">
        <Lock aria-hidden="true" /> {copy.text('forms.privacyNote')}
      </p>
    </div>
  );
}

/** Space kept above the confirmation so the sticky site header does not cover it. */
const SUCCESS_SCROLL_OFFSET = 96;

/**
 * Scrolls the element into view, just under the sticky header, once it has mounted. The form a confirmation replaces is
 * far taller than the confirmation: without this the browser keeps the old scroll offset and the visitor lands on the
 * footer with the confirmation above the fold.
 */
export function useBringIntoView(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const top = (ref.current?.getBoundingClientRect().top ?? 0) + window.scrollY - SUCCESS_SCROLL_OFFSET;
    window.scrollTo({ top: Math.max(0, top) });
  }, [ref]);
}

/**
 * The confirmation that replaces a submitted form: a tick, the heading (focused, so it is announced and keyboard users
 * start from it), the message, the reference and two ways onward.
 */
export function FormSuccess({ title, reference, children }: { title: string; reference?: string; children?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);
  useBringIntoView(card);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <div ref={card} className="oa-co-card oa-co-success" role="status" aria-live="polite">
      <span className="oa-co-success__mark" aria-hidden="true">
        <Check />
      </span>
      <h2 ref={heading} tabIndex={-1} className="oa-co-success__title">
        {title}
      </h2>
      {children}
      {reference && (
        <p className="oa-co-success__ref">
          Your reference: <strong>{reference}</strong>
        </p>
      )}
      <div className="oa-co-success__actions">
        <ButtonLink to="/case-studies" variant="secondary">
          Browse case studies
        </ButtonLink>
        <ButtonLink to="/" variant="ghost">
          Back to the homepage
        </ButtonLink>
      </div>
    </div>
  );
}
