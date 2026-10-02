import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ArrowUpRight, Briefcase, Building2, CalendarClock, Check, Lock, MapPin, Wallet } from 'lucide-react';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, FormField, Input, Skeleton, Textarea } from '@/components/ui';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { siteMoney } from '@/features/public/site/format';
import { isExternalHref } from '@/lib/safeHref';
import { type EmploymentType, type JobCard, type PublicJob, type TeamMember, useJob, useJobs, useSite, useTeam, type WorkplaceType } from '../site/api';
import { useSiteCopy } from '../site/copy';
import { CtaBand, formatPublished, PublicQueryState } from '../site/components';
import { ConsentCheckbox, fieldErrorsOf, Honeypot, useFormToken, useRenewFormToken } from '../site/forms';
import { headFromSeo, useDocumentHead } from '../site/head';
import { Markdown } from '../site/Markdown';
import { useReveal } from '../site/motion';
import { PartnerSlot } from '../partners/PartnerSlot';
import { CoCta, CoHero, CoSection, Monogram, StepList } from './companyKit';

/**
 * Team, careers and a role's page. Words come from the editable page copy (`team.*`, `careers.*`), people and roles
 * from the API; nothing is invented. The server-rendered HTML (backend SeoPageResolver.TeamAsync, CareersAsync, JobAsync)
 * follows the same order and headings.
 */

function Portrait({ member, className }: { member: TeamMember; className: string }) {
  return member.photoUrl ? (
    <img className={className} src={member.photoUrl} alt="" loading="lazy" decoding="async" width={480} height={600} />
  ) : (
    <Monogram name={member.name} className={className} />
  );
}

/** The hero's mosaic of the first few people (decorative: the names are in the list below). */
function TeamMosaic({ members }: { members: TeamMember[] }) {
  const shown = members.slice(0, 6);
  if (shown.length < 2) return null;
  return (
    <div className={`oa-co-mosaic oa-co-mosaic--${Math.min(shown.length, 6)}`} aria-hidden="true">
      {shown.map((m) => (
        <Portrait key={m.slug} member={m} className="oa-co-mosaic__face" />
      ))}
    </div>
  );
}

/**
 * The hero art's room while the data loads (blank faces / a blank panel of the usual size): rendering nothing and then
 * the art pushed the whole page down on phones when the data arrived (CLS ~0.2 on a slow device).
 */
function TeamMosaicPlaceholder() {
  return (
    <div className="oa-co-mosaic oa-co-mosaic--6 oa-co-mosaic--pending" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="oa-co-mosaic__face" />
      ))}
    </div>
  );
}

function MemberCard({ member }: { member: TeamMember }) {
  const links = member.socialLinks.filter((l) => isExternalHref(l.url));
  return (
    <article className="oa-co-member">
      <Portrait member={member} className="oa-co-member__portrait" />
      <div className="oa-co-member__body">
        <h3 className="oa-co-member__name">{member.name}</h3>
        <p className="oa-co-member__role">{member.role}</p>
        {member.bio && <p className="oa-co-member__bio">{member.bio}</p>}
        {member.expertise.length > 0 && (
          <ul className="oa-co-chips" aria-label={`${member.name}'s expertise`}>
            {member.expertise.map((x) => (
              <li key={x} className="oa-co-chip">
                {x}
              </li>
            ))}
          </ul>
        )}
        {links.length > 0 && (
          <ul className="oa-co-member__links">
            {links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                  <ArrowUpRight aria-hidden="true" />
                  <span className="visually-hidden"> profile of {member.name} (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** /team */
export function TeamPage() {
  const { data, isLoading, error } = useTeam();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead({ title: copy.text('team.seo.title'), description: copy.text('team.seo.description') });
  const members = data ?? [];
  return (
    <div ref={root} className="oa-co-page">
      <CoHero
        eyebrow={copy.text('team.hero.eyebrow')}
        title={copy.text('team.hero.title')}
        lead={copy.text('team.hero.lead')}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Team' }]}
        aside={isLoading ? <TeamMosaicPlaceholder /> : members.length > 1 ? <TeamMosaic members={members} /> : undefined}
      />
      <PublicQueryState error={error} isLoading={false} notFoundTitle="Team unavailable">
        <CoSection eyebrow={copy.text('team.people.eyebrow')} title={copy.text('team.people.title')}>
          {isLoading ? (
            <div className="oa-co-team">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height={420} />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="oa-co-empty">
              <h3>{copy.text('team.empty.title')}</h3>
              <p>{copy.text('team.empty.text')}</p>
              <Link to="/book-a-consultation" className="oa-co-arrowlink">
                {copy.text('contact.call.cta')} <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <ul className="oa-co-team" data-reveal="stagger">
              {members.map((m) => (
                <li key={m.slug}>
                  <MemberCard member={m} />
                </li>
              ))}
            </ul>
          )}
        </CoSection>
      </PublicQueryState>
      <CoSection tone="muted" layout="split" eyebrow={copy.text('team.principles.eyebrow')} title={copy.text('team.principles.title')}>
        <StepList steps={copy.pairs('team.principles.items')} />
      </CoSection>
      <CoCta
        eyebrow={copy.text('team.join.eyebrow')}
        title={copy.text('team.join.title')}
        text={copy.text('team.join.text')}
        primary={{ to: '/careers', label: copy.text('team.join.link') }}
      />
    </div>
  );
}

export const WORKPLACE_LABEL: Record<WorkplaceType, string> = { OnSite: 'On-site', Hybrid: 'Hybrid', Remote: 'Remote' };
export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FullTime: 'Full-time',
  PartTime: 'Part-time',
  Contract: 'Contract',
  Internship: 'Internship',
  Temporary: 'Temporary',
};

function RoleRow({ job }: { job: JobCard }) {
  return (
    <article className="oa-co-role">
      <div>
        <p className="oa-co-role__dept">{job.department}</p>
        <h3 className="oa-co-role__title">
          <Link to={`/careers/${job.slug}`} className="oa-co-stretch">
            {job.title}
          </Link>
        </h3>
        {job.summary && <p className="oa-co-role__summary">{job.summary}</p>}
      </div>
      <ul className="oa-co-chips" aria-label="Role details">
        <li className="oa-co-chip">
          <MapPin aria-hidden="true" /> {job.location}
        </li>
        {job.location !== WORKPLACE_LABEL[job.workplace] && <li className="oa-co-chip">{WORKPLACE_LABEL[job.workplace]}</li>}
        <li className="oa-co-chip">{EMPLOYMENT_LABEL[job.employmentType]}</li>
      </ul>
      <span className="oa-co-role__go" aria-hidden="true">
        <ArrowRight />
      </span>
    </article>
  );
}

/** The careers hero's panel: open roles per team, straight from the list of roles. */
function RolesAtAGlance({ jobs }: { jobs: JobCard[] }) {
  const byDept = new Map<string, number>();
  for (const j of jobs) byDept.set(j.department, (byDept.get(j.department) ?? 0) + 1);
  return (
    <div className="oa-co-glass oa-co-glance">
      <p className="oa-co-glance__count">
        <span className="tabular">{jobs.length}</span> {jobs.length === 1 ? 'open role' : 'open roles'}
      </p>
      <ul className="oa-co-glance__list">
        {[...byDept.entries()].map(([dept, n]) => (
          <li key={dept}>
            <span>{dept}</span>
            <span className="tabular">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** RolesAtAGlance's room while the roles load (see TeamMosaicPlaceholder). */
function RolesAtAGlancePlaceholder() {
  return (
    <div className="oa-co-glass oa-co-glance" aria-hidden="true">
      <p className="oa-co-glance__count">
        <span className="tabular">{'\u00a0'}</span>
        {'\u00a0'}
      </p>
      <ul className="oa-co-glance__list">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i}>
            <Skeleton height={16} width="60%" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** /careers */
export function CareersPage() {
  const { data, isLoading, error } = useJobs();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead({ title: copy.text('careers.seo.title'), description: copy.text('careers.seo.description') });
  const jobs = data ?? [];
  return (
    <div ref={root} className="oa-co-page">
      <CoHero
        eyebrow={copy.text('careers.hero.eyebrow')}
        title={copy.text('careers.hero.title')}
        lead={copy.text('careers.hero.lead')}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Careers' }]}
        actions={
          isLoading || jobs.length > 0 ? (
            <a href="#open-roles" className={buttonClasses('highlight', 'lg')}>
              {copy.text('careers.openRoles')}
              <ArrowRight aria-hidden="true" width={18} height={18} />
            </a>
          ) : undefined
        }
        aside={isLoading ? <RolesAtAGlancePlaceholder /> : jobs.length > 0 ? <RolesAtAGlance jobs={jobs} /> : undefined}
      />
      <CoSection eyebrow={copy.text('careers.why.eyebrow')} title={copy.text('careers.why.title')}>
        <ul className="oa-co-features oa-co-features--4" data-reveal="stagger">
          {copy.pairs('careers.why.items').map((item, i) => (
            <li key={item.title}>
              <div className="oa-co-feature">
                <div className="oa-co-feature__top">
                  <span className="oa-co-feature__index" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="oa-co-feature__title">{item.title}</h3>
                <p className="oa-co-feature__text">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </CoSection>
      <PublicQueryState error={error} isLoading={false} notFoundTitle="Careers unavailable">
        <CoSection id="open-roles" tone="muted" eyebrow={copy.text('careers.roles.eyebrow')} title={copy.text('careers.openRoles')} intro={jobs.length > 0 ? copy.text('careers.roles.intro') : undefined}>
          {isLoading ? (
            <Skeleton height={240} />
          ) : jobs.length === 0 ? (
            <div className="oa-co-empty">
              <h3>{copy.text('careers.empty.title')}</h3>
              <p>{copy.text('careers.empty.description')}</p>
              <Link to="/contact" className="oa-co-arrowlink">
                Contact us <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <ul className="oa-co-roles" data-reveal="stagger">
              {jobs.map((job) => (
                <li key={job.slug}>
                  <RoleRow job={job} />
                </li>
              ))}
            </ul>
          )}
          <PartnerSlot slot="careers.index" keywords={['careers', 'professional development']} categories={['careers']} />
        </CoSection>
      </PublicQueryState>
      <CoSection layout="split" eyebrow={copy.text('careers.process.eyebrow')} title={copy.text('careers.process.title')}>
        <StepList steps={copy.pairs('careers.process.steps')} />
      </CoSection>
      <CoCta title={copy.text('careers.cta.title')} text={copy.text('careers.cta.text')} primary={{ to: '/contact', label: 'Contact us' }} />
    </div>
  );
}

function salaryText(job: PublicJob): string | null {
  const s = job.salary;
  if (!s) return null;
  const fmt = (n: number) => siteMoney(n, s.currency, { currencyDisplay: 'narrowSymbol' }).replace(/\.00$/, '');
  const range = s.min !== null && s.max !== null ? `${fmt(s.min)} – ${fmt(s.max)}` : s.min !== null ? `From ${fmt(s.min)}` : s.max !== null ? `Up to ${fmt(s.max)}` : null;
  return range ? `${range} per ${s.period.toLowerCase()}` : null;
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li>
      <span className="oa-co-facts__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="oa-co-facts__label">{label}</p>
        <p className="oa-co-facts__value">{children}</p>
      </div>
    </li>
  );
}

/** /careers/:slug — role details and the application form (PDF CV). */
export function JobDetailPage() {
  const { slug = '' } = useParams();
  const { data: job, isLoading, error } = useJob(slug);
  const copy = useSiteCopy();
  const factsId = useId();
  useDocumentHead(job ? headFromSeo(job.seo, job.jsonLd) : { title: 'Careers' });
  const salary = job ? salaryText(job) : null;
  return (
    <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="This role is no longer open">
      {job && (
        <div className="oa-co-page">
          <CoHero
            size="compact"
            eyebrow={job.department}
            title={job.title}
            lead={job.summary}
            breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Careers', to: '/careers' }, { label: job.title }]}
            actions={
              <a href="#apply" className={buttonClasses('highlight', 'lg')}>
                {copy.text('careers.detail.applyTitle')}
                <ArrowRight aria-hidden="true" width={18} height={18} />
              </a>
            }
            aside={
              <section className="oa-co-glass" aria-labelledby={factsId}>
                <h2 id={factsId} className="oa-co-glass__title">
                  {copy.text('careers.detail.factsTitle')}
                </h2>
                <ul className="oa-co-facts">
                  <Fact icon={<MapPin />} label="Location">
                    {job.location === WORKPLACE_LABEL[job.workplace] ? job.location : `${job.location} (${WORKPLACE_LABEL[job.workplace]})`}
                  </Fact>
                  <Fact icon={<Briefcase />} label="Employment">
                    {EMPLOYMENT_LABEL[job.employmentType]}
                  </Fact>
                  <Fact icon={<Building2 />} label="Team">
                    {job.department}
                  </Fact>
                  {salary && (
                    <Fact icon={<Wallet />} label="Salary">
                      {salary}
                    </Fact>
                  )}
                  {job.postedAt && (
                    <Fact icon={<CalendarClock />} label="Posted">
                      {formatPublished(job.postedAt)}
                    </Fact>
                  )}
                  {job.closesAt && (
                    <Fact icon={<CalendarClock />} label="Apply by">
                      {formatPublished(job.closesAt)}
                    </Fact>
                  )}
                </ul>
              </section>
            }
          />
          <div className="container oa-co-job">
            <div className="oa-co-job__body">
              <div className="oa-co-prose">
                <Markdown source={job.descriptionMarkdown} />
              </div>
              {job.requirements.length > 0 && (
                <section aria-labelledby={`${factsId}-req`}>
                  <h2 id={`${factsId}-req`} className="oa-co-subtitle">
                    {copy.text('careers.detail.requirementsTitle')}
                  </h2>
                  <ul className="oa-co-ticklist">
                    {job.requirements.map((r) => (
                      <li key={r}>
                        <Check aria-hidden="true" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {job.benefits.length > 0 && (
                <section aria-labelledby={`${factsId}-ben`}>
                  <h2 id={`${factsId}-ben`} className="oa-co-subtitle">
                    {copy.text('careers.detail.benefitsTitle')}
                  </h2>
                  <ul className="oa-co-ticklist">
                    {job.benefits.map((b) => (
                      <li key={b}>
                        <Check aria-hidden="true" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p>
                <Link to="/careers" className="oa-co-arrowlink">
                  <ArrowLeft aria-hidden="true" /> {copy.text('careers.detail.backLink')}
                </Link>
              </p>
            </div>
            <div className="oa-co-job__apply" id="apply">
              <ApplicationForm job={job} />
            </div>
          </div>
        </div>
      )}
    </PublicQueryState>
  );
}

const PDF_TYPES = ['application/pdf'];

function ApplicationForm({ job }: { job: PublicJob }) {
  const { data: site } = useSite();
  const copy = useSiteCopy();
  const token = useFormToken();
  const renewToken = useRenewFormToken();
  const id = useId();
  const [values, setValues] = useState({ name: '', email: '', phone: '', portfolioUrl: '', coverLetter: '' });
  const [cv, setCv] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [nickname, setNickname] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const apply = useMutation({
    mutationFn: () => {
      const form = new FormData();
      for (const [k, v] of Object.entries(values)) if (v.trim()) form.append(k, v.trim());
      form.append('nickname', nickname);
      form.append('formToken', token.data?.token ?? '');
      form.append('consent', String(consent));
      form.append('consentVersion', site?.consent.careersVersion ?? 'careers-2026-09');
      if (cv) form.append('cv', cv);
      return api.upload<{ reference: string; message: string }>(`/public/careers/${encodeURIComponent(job.slug)}/applications`, form);
    },
    onSuccess: () => void renewToken(),
    onError: (e) => setErrors(fieldErrorsOf(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (values.name.trim().length < 2) next.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Enter a valid email address.';
    if (values.portfolioUrl.trim() && !values.portfolioUrl.trim().startsWith('https://')) next.portfolioUrl = 'Use an https:// link.';
    if (!cv) next.cv = 'Attach your CV as a PDF.';
    if (!consent) next.consent = 'Please agree so we can process your application.';
    setErrors(next);
    if (Object.keys(next).length === 0) apply.mutate();
  };

  if (apply.isSuccess)
    return (
      <div className="oa-co-card">
        <Alert tone="success" title="Application received">
          {apply.data.message} Reference {apply.data.reference}.
        </Alert>
      </div>
    );

  return (
    <form className="oa-co-card oa-co-form" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <div className="oa-co-card__head">
        <h2 id={`${id}-title`} className="oa-co-card__title">
          {copy.text('careers.detail.applyTitle')}
        </h2>
        <p className="oa-co-card__intro">{copy.text('careers.detail.applyIntro')}</p>
      </div>
      <FormField label="Full name" required error={errors.name}>
        <Input autoComplete="name" value={values.name} onChange={(e) => set('name')(e.target.value)} />
      </FormField>
      <FormField label="Email" required error={errors.email}>
        <Input type="email" autoComplete="email" value={values.email} onChange={(e) => set('email')(e.target.value)} />
      </FormField>
      <FormField label="Phone" optional error={errors.phone}>
        <Input type="tel" autoComplete="tel" value={values.phone} onChange={(e) => set('phone')(e.target.value)} />
      </FormField>
      <FormField label="Portfolio or LinkedIn" optional hint="An https:// link." error={errors.portfolioUrl}>
        <Input type="url" value={values.portfolioUrl} onChange={(e) => set('portfolioUrl')(e.target.value)} />
      </FormField>
      <FormField label="CV" required hint="PDF only, up to 5 MB." error={errors.cv}>
        <Input
          type="file"
          className="site-file"
          accept={PDF_TYPES.join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (file && (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024)) {
              setErrors((x) => ({ ...x, cv: file.size > 5 * 1024 * 1024 ? 'Your CV must be 5 MB or smaller.' : 'Upload your CV as a PDF file.' }));
              setCv(null);
              e.target.value = '';
              return;
            }
            setErrors(({ cv: _ignored, ...rest }) => rest);
            setCv(file);
          }}
        />
      </FormField>
      <FormField label="Cover letter" optional error={errors.coverLetter}>
        <Textarea rows={5} maxLength={5000} value={values.coverLetter} onChange={(e) => set('coverLetter')(e.target.value)} />
      </FormField>
      <Honeypot value={nickname} onChange={setNickname} />
      <ConsentCheckbox
        id={`${id}-consent`}
        text={site?.consent.careersText ?? 'I agree that Optimize All may store my application to assess me for this role.'}
        checked={consent}
        onChange={setConsent}
        error={errors.consent}
      />
      {apply.isError && !Object.keys(errors).length && (
        <Alert tone="danger" title="We couldn't send your application">
          {errorMessage(apply.error)}
        </Alert>
      )}
      <div className="oa-co-form__submit">
        <Button type="submit" size="lg" variant="highlight" loading={apply.isPending} disabled={token.isLoading}>
          Send application
        </Button>
        <p className="oa-co-form__note">
          <Lock aria-hidden="true" /> {copy.text('forms.privacyNote')}
        </p>
      </div>
    </form>
  );
}

export function CareersCta() {
  const copy = useSiteCopy();
  return <CtaBand title={copy.text('careers.cta.title')} text={copy.text('careers.cta.text')} />;
}
