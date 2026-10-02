import clsx from 'clsx';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Clock,
  Compass,
  Eye,
  FileText,
  GraduationCap,
  Info,
  Layers,
  ListTree,
  Lock,
  LogIn,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Route,
  Search,
  Target,
  Timer,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { startTransition, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toastContext';
import { errorMessage } from '@/lib/api/errors';
import { Permissions } from '@/lib/auth/permissions';
import { useAuth } from '@/lib/auth/useAuth';
import {
  CATEGORY_LABELS,
  courseKeywords,
  formatHours,
  formatMinutes,
  formatReviewed,
  useCategories,
  useEnrol,
  useMyCourse,
  useMyPath,
  useMyPaths,
  usePath,
  usePaths,
  usePublicCatalog,
  usePublicCourse,
  usePublicLesson,
  type CourseDetail,
  type JsonLd,
  type LearningSeo,
  type PathDetail,
  type PathProgress,
} from '@/features/learning/api';
import { PublicCatalog } from '@/features/learning/components/CatalogBrowser';
import { CategoryArt } from '@/features/learning/components/CategoryArt';
import { BadgeImage, CategoryTag, categoryClass, CourseCard, LevelTag, LinkedInIcon } from '@/features/learning/components/CourseCard';
import { LearnSlot } from '@/features/learning/components/LearnSlot';
import { WorkWithUsCard } from '@/features/learning/components/WorkWithUsCard';
import { LessonView } from '@/features/learning/components/LessonView';
import { useCountUp } from '@/features/learning/components/Motion';
import { authPathForEnrol, clearEnrolIntent, ENROL_PARAM, rememberEnrolIntent } from '@/features/learning/enrolIntent';
import '@/features/learning/learning.css';
import '@/features/learning/academy.css';
import { PartnerLinksProvider } from '../partners/PartnerLinksContext';
import { useAcademyOverview } from '../site/academy';
import { AcademyHubExtras } from '../site/AcademyOverview';
import { useSiteCopy } from '../site/copy';
import { useDocumentHead } from '../site/head';
import { Markdown } from '../site/Markdown';
import { useReveal } from '../site/motion';
import { NotFound } from '../NotFound';
import { AcademyHeroArt } from './AcademyArt';
import { AcademyPathCard, AcademySection, AcademyStage, CertificatePlaque, StageEyebrow, StageFigures, useReadingProgress } from './AcademyParts';

/**
 * The free public academy (/learn, /learn/paths, /learn/paths/:pathSlug, /learn/:slug, /learn/:slug/:lessonSlug): every
 * course, lesson and lecture transcript is readable without an account; knowledge checks work in the browser. Enrolling
 * ("Enrol for free — start learning") signs the visitor in or up and brings them back to the course, where the
 * enrolment completes and lesson 1 opens in "My learning" (see enrolIntent.ts).
 *
 * Each page opens on the academy's dark stage (AcademyParts.tsx) and continues in editorial sections; marketing words
 * come from the editable page copy (`academy.*`), facts and figures only from the learning API.
 */
export const academyPaths = {
  home: '/learn',
  paths: '/learn/paths',
  path: (slug: string) => `/learn/paths/${encodeURIComponent(slug)}`,
  course: (slug: string) => `/learn/${encodeURIComponent(slug)}`,
  lesson: (slug: string, lesson: string) => `/learn/${encodeURIComponent(slug)}/${encodeURIComponent(lesson)}`,
  portalCourse: (slug: string) => `/app/learning/courses/${encodeURIComponent(slug)}`,
  portalLesson: (slug: string, lesson: string) =>
    `/app/learning/courses/${encodeURIComponent(slug)}/lessons/${encodeURIComponent(lesson)}`,
};

function headFrom(seo: LearningSeo | undefined, jsonLd: JsonLd[] | undefined, type: 'website' | 'article' = 'website') {
  return seo
    ? { title: seo.title, description: seo.description, canonical: seo.canonicalPath, noIndex: seo.noIndex, jsonLd, type }
    : {};
}

function useCanLearn() {
  const { status, user } = useAuth();
  const signedIn = status === 'authenticated';
  return {
    status,
    signedIn,
    // Enrolments belong to learner (participant) accounts; staff accounts can read everything but not enrol.
    canLearn: signedIn && !!user?.permissions.includes(Permissions.ParticipantPortal),
  };
}

/** Reveal-on-scroll for a page root (site/motion.tsx); returns the ref to put on the root. */
function useRevealRoot() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  return root;
}

function PageLoading({ height = 420 }: { height?: number }) {
  return (
    <div className="ax ax-loading container" aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading…
      </span>
      <Skeleton height={height} radius="var(--radius-2xl)" />
    </div>
  );
}

function PageError({ error, title, retry }: { error: unknown; title: string; retry: () => void }) {
  return (
    <div className="ax container ax-loading">
      <ErrorState error={error} title={title} onRetry={retry} />
    </div>
  );
}

const STAFF_NOTE = 'You’re signed in with a staff account. Enrolment is for learner accounts — you can read every lesson here.';

// ---------------------------------------------------------------- direct enrol

/**
 * "Enrol for free — start learning". Signed in: enrols (idempotent) and opens the first unfinished lesson. Signed out:
 * goes to registration (or sign-in) with a validated return path to this course + ?enrol=1, and remembers the intent in
 * this browser for the email-verification round trip. Back here signed in with ?enrol=1, it completes automatically.
 */
function useEnrolAndStart(course: CourseDetail | undefined) {
  const slug = course?.card.slug ?? '';
  const { status, signedIn, canLearn } = useCanLearn();
  const navigate = useNavigate();
  const toast = useToast();
  const enrol = useEnrol(slug);
  const [params, setParams] = useSearchParams();
  const auto = params.get(ENROL_PARAM) === '1';
  const ran = useRef(false);
  const first = course?.modules[0]?.lessons[0]?.slug;

  const start = () => {
    if (!course) return;
    enrol.mutate(undefined, {
      onSuccess: (data) => {
        clearEnrolIntent();
        const lesson = data.progress?.resumeLessonSlug ?? first;
        navigate(lesson ? academyPaths.portalLesson(slug, lesson) : academyPaths.portalCourse(slug), { replace: auto });
      },
      onError: (e) => toast.error('Enrolment failed', errorMessage(e)),
    });
  };

  useEffect(() => {
    if (!auto || !course || status === 'loading' || ran.current) return;
    if (canLearn) {
      ran.current = true;
      start();
    } else if (signedIn) {
      // A staff account: nothing to enrol; drop the intent and keep the page.
      ran.current = true;
      clearEnrolIntent();
      const next = new URLSearchParams(params);
      next.delete(ENROL_PARAM);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, course, status, canLearn, signedIn]);

  const goSignUp = (mode: 'login' | 'register') => {
    rememberEnrolIntent(slug);
    navigate(authPathForEnrol(slug, mode));
  };

  return {
    start,
    goSignUp,
    pending: enrol.isPending || (auto && canLearn && !enrol.isError),
    failed: enrol.isError,
    error: enrol.error,
    signedIn,
    canLearn,
    auto,
  };
}

function EnrolActions({ course, flow, compact }: { course: CourseDetail; flow: ReturnType<typeof useEnrolAndStart>; compact?: boolean }) {
  const first = course.modules[0]?.lessons[0]?.slug;
  return (
    <>
      {flow.canLearn ? (
        <Button size="lg" variant="highlight" leadingIcon={<GraduationCap aria-hidden="true" />} loading={flow.pending} onClick={flow.start}>
          Enrol for free — start learning
        </Button>
      ) : flow.signedIn ? (
        first && (
          <ButtonLink to={academyPaths.lesson(course.card.slug, first)} size="lg" variant="highlight" leadingIcon={<BookOpen aria-hidden="true" />}>
            Start the first lesson
          </ButtonLink>
        )
      ) : (
        <Button size="lg" variant="highlight" leadingIcon={<GraduationCap aria-hidden="true" />} onClick={() => flow.goSignUp('register')}>
          Enrol for free — start learning
        </Button>
      )}
      {!compact && !flow.canLearn && !flow.signedIn && (
        <Button size="lg" variant="secondary" leadingIcon={<LogIn aria-hidden="true" />} onClick={() => flow.goSignUp('login')}>
          I have an account
        </Button>
      )}
      {!compact && first && (flow.canLearn || !flow.signedIn) && (
        <ButtonLink to={academyPaths.lesson(course.card.slug, first)} size="lg" variant="ghost" leadingIcon={<Eye aria-hidden="true" />}>
          Preview lesson 1
        </ButtonLink>
      )}
    </>
  );
}

/** The closing panel of a course page: track progress (signed in) or create a free account. */
function SignUpCta({ next, slug, title, text }: { next: string; slug: string; title: string; text: string }) {
  const { signedIn } = useCanLearn();
  const navigate = useNavigate();
  const headingId = useId();
  const go = (mode: 'login' | 'register') => {
    rememberEnrolIntent(slug);
    navigate(authPathForEnrol(slug, mode));
  };
  return (
    <section className="ax-closing" aria-labelledby={headingId} data-reveal="">
      <div className="ax-closing__mark" aria-hidden="true">
        <Award />
      </div>
      <div className="ax-closing__text">
        <h2 id={headingId} className="ax-closing__title">
          {signedIn ? 'Track this course in your dashboard' : title}
        </h2>
        <p>{text}</p>
      </div>
      <div className="ax-closing__actions">
        {signedIn ? (
          <ButtonLink to={next} variant="highlight" trailingIcon={<ArrowRight aria-hidden="true" />}>
            Open in my learning
          </ButtonLink>
        ) : (
          <>
            <Button variant="highlight" leadingIcon={<UserPlus aria-hidden="true" />} onClick={() => go('register')}>
              Create a free account
            </Button>
            <Button variant="secondary" onClick={() => go('login')}>
              Sign in
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The enrol prompt under a public lesson. Visitors are sent to register / sign in and come back to the course, which
 * enrols them (the same intent mechanism as the course page). A signed-in learner who is not enrolled yet gets an explicit
 * "Enrol for free" button — enrolment is never silent — and a visible "Try again" when it fails. Staff accounts read
 * every lesson but have no enrol control.
 */
function LessonEnrolPrompt({ slug, lessonSlug }: { slug: string; lessonSlug: string }) {
  const { signedIn, canLearn } = useCanLearn();
  const navigate = useNavigate();
  const toast = useToast();
  const mine = useMyCourse(slug, canLearn);
  const enrol = useEnrol(slug);
  const lessonInPortal = academyPaths.portalLesson(slug, lessonSlug);

  if (signedIn && !canLearn)
    return (
      <p className="lx-enrolling lx-enrolling--info" role="note">
        <Info aria-hidden="true" /> {STAFF_NOTE}
      </p>
    );
  if (canLearn && mine.isPending) return null;
  if (canLearn && mine.data?.progress)
    return (
      <section className="ax-lesson-enrol" aria-label="Your progress">
        <div className="ax-lesson-enrol__text">
          <p className="ax-lesson-enrol__title">You’re enrolled in this course</p>
          <p>Open the lesson in My learning to save your progress and take the final assessment.</p>
        </div>
        <div className="ax-lesson-enrol__actions">
          <ButtonLink to={lessonInPortal} variant="highlight" trailingIcon={<ArrowRight aria-hidden="true" />}>
            Open in my learning
          </ButtonLink>
        </div>
      </section>
    );

  const enrolNow = () =>
    enrol.mutate(undefined, {
      onSuccess: () => {
        clearEnrolIntent();
        navigate(lessonInPortal);
      },
      onError: (e) => toast.error('Enrolment failed', errorMessage(e)),
    });
  const go = (mode: 'login' | 'register') => {
    rememberEnrolIntent(slug);
    navigate(authPathForEnrol(slug, mode));
  };

  return (
    <section className="ax-lesson-enrol" aria-labelledby="lesson-enrol-heading">
      <span className="ax-lesson-enrol__icon" aria-hidden="true">
        <GraduationCap />
      </span>
      <div className="ax-lesson-enrol__text">
        <h2 id="lesson-enrol-heading" className="ax-lesson-enrol__title">
          Enrol for free to save your progress
        </h2>
        <p>Reading is always free. Enrol to keep your place, take the final assessment and earn a verifiable certificate.</p>
      </div>
      {enrol.isError && (
        <Alert
          tone="danger"
          title="We couldn’t enrol you"
          actions={
            <Button size="sm" variant="secondary" loading={enrol.isPending} onClick={enrolNow}>
              Try again
            </Button>
          }
        >
          {errorMessage(enrol.error)}
        </Alert>
      )}
      <div className="ax-lesson-enrol__actions">
        {canLearn ? (
          <Button variant="highlight" leadingIcon={<GraduationCap aria-hidden="true" />} loading={enrol.isPending && !enrol.isError} onClick={enrolNow}>
            Enrol for free
          </Button>
        ) : (
          <>
            <Button variant="highlight" leadingIcon={<UserPlus aria-hidden="true" />} onClick={() => go('register')}>
              Enrol for free
            </Button>
            <Button variant="secondary" onClick={() => go('login')}>
              I have an account
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- /learn (the academy hub)

export const ACADEMY_TITLE = 'Free courses with certificates';
export const ACADEMY_DESCRIPTION =
  'Optimize All Academy: free, practical courses in sales, marketing, SEO and AI. Learn at your own pace and add a verified certificate to LinkedIn.';

function HubSearch({ onSearch, placeholder }: { onSearch: (q: string) => void; placeholder: string }) {
  const id = useId();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(q.trim());
  };
  return (
    <form className="ax-search" role="search" aria-label="Search the academy" onSubmit={submit}>
      <label htmlFor={id} className="visually-hidden">
        Search free courses
      </label>
      <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} leading={<Search aria-hidden="true" />} />
      <Button type="submit" variant="highlight">
        Search
      </Button>
    </form>
  );
}

/** A figure that counts up once (immediately for reduced motion); the final value is what assistive technology reads. */
function useCounted(value: number): string {
  const shown = useCountUp(value);
  return shown.toLocaleString('en');
}

export function AcademyPage() {
  useDocumentHead({
    // Same title and description as the server-rendered page (SeoPageResolver.Learning.cs), within 60 / 155 characters.
    title: ACADEMY_TITLE,
    description: ACADEMY_DESCRIPTION,
    canonical: academyPaths.home,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
          { '@type': 'ListItem', position: 2, name: 'Academy', item: academyPaths.home },
        ],
      },
    ],
  });
  const copy = useSiteCopy();
  const root = useRevealRoot();
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const paths = usePaths();
  const overview = useAcademyOverview();
  const fresh = usePublicCatalog({ sort: 'newest', pageSize: 4 });
  const { canLearn } = useCanLearn();
  const myPaths = useMyPaths(canLearn);
  const catalogRef = useRef<HTMLElement>(null);
  const [catalogKey, setCatalogKey] = useState(0);
  const totalCourses = categories.data?.reduce((s, c) => s + c.courseCount, 0) ?? 0;
  const lessonCount = overview.data?.lessonCount ?? 0;
  const pathCount = paths.data?.paths.length ?? 0;
  const subjectCount = categories.data?.filter((c) => c.courseCount > 0).length ?? 0;
  const progressBySlug = new Map(myPaths.data?.map((p) => [p.card.slug, p.progress]) ?? []);
  const courses = useCounted(totalCourses);
  const lessons = useCounted(lessonCount);
  const badges = (fresh.data?.items ?? []).map((c) => c.badgeImageUrl);

  // A link to /learn?category=…#catalog (the course page's subject crumb) lands on the catalogue.
  const { hash } = useLocation();
  const catalogReady = categories.isSuccess;
  useEffect(() => {
    if (hash === '#catalog' && catalogReady) catalogRef.current?.scrollIntoView({ block: 'start' });
  }, [hash, catalogReady]);

  const toCatalog = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // A non-blocking update (React can interrupt it): re-rendering the catalog is heavy, and a tap on a subject on a
    // slow phone should paint at once (interaction latency, INP). The router's own update is a transition already.
    startTransition(() => {
      setParams(next, { replace: true });
      setCatalogKey((k) => k + 1); // the catalog's search box is uncontrolled: remount it with the new query
    });
    catalogRef.current?.scrollIntoView({ block: 'start' });
  };

  const figures = [
    ...(totalCourses > 0 ? [{ value: courses, label: 'Free courses' }] : []),
    ...(lessonCount > 0 ? [{ value: lessons, label: 'Lessons' }] : []),
    ...(pathCount > 0 ? [{ value: String(pathCount), label: 'Learning paths' }] : []),
    ...(subjectCount > 0 ? [{ value: String(subjectCount), label: 'Subjects' }] : []),
    { value: '$0', label: 'Price, forever' },
  ];

  return (
    <div ref={root} className="ax ax-hub">
      <AcademyStage className="ax-hub-hero">
        <div className="ax-hero">
          <div className="ax-hero__copy">
            <StageEyebrow>{copy.text('academy.hero.eyebrow')}</StageEyebrow>
            <h1 className="ax-display">
              {copy.text('academy.hero.title')} <span className="ax-accent">{copy.text('academy.hero.titleAccent')}</span>
            </h1>
            <p className="ax-lead">{copy.text('academy.hero.lead')}</p>
            <HubSearch onSearch={(q) => toCatalog({ q, category: '' })} placeholder={copy.text('academy.hero.searchPlaceholder')} />
            <ul className="ax-points">
              {copy.list('academy.hero.points').map((p, i) => (
                <li key={p}>
                  {i === 2 ? <LinkedInIcon /> : i === 1 ? <BadgeCheck aria-hidden="true" /> : <Check aria-hidden="true" />} {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="ax-hero__visual">
            <AcademyHeroArt badges={badges} />
          </div>
        </div>
        <StageFigures items={figures} label="The academy in numbers" />
      </AcademyStage>

      {categories.data && categories.data.length > 0 && (
        <AcademySection
          eyebrow={copy.text('academy.subjects.eyebrow')}
          title={copy.text('academy.subjects.title')}
          intro={copy.text('academy.subjects.intro')}
        >
          <ul className="ax-subjects" data-reveal="stagger">
            {categories.data.map((c) => (
              <li key={c.category}>
                <button type="button" className={clsx('ax-subject', categoryClass(c.category))} onClick={() => toCatalog({ category: c.category, q: '' })}>
                  <span className="ax-subject__art">
                    <CategoryArt category={c.category} />
                  </span>
                  <span className="ax-subject__name">{CATEGORY_LABELS[c.category]}</span>
                  <span className="ax-subject__count">
                    {c.courseCount} {c.courseCount === 1 ? 'course' : 'courses'}
                  </span>
                  <ArrowUpRight aria-hidden="true" className="ax-subject__go" />
                </button>
              </li>
            ))}
          </ul>
        </AcademySection>
      )}

      {paths.data && paths.data.paths.length > 0 && (
        <AcademySection
          className="ax-section--tint"
          eyebrow={copy.text('academy.paths.eyebrow')}
          title={copy.text('academy.paths.title')}
          intro={copy.text('academy.paths.intro')}
          action={
            <ButtonLink to={academyPaths.paths} variant="secondary" trailingIcon={<ArrowRight aria-hidden="true" />}>
              {copy.text('academy.paths.cta')}
            </ButtonLink>
          }
        >
          <ul className="ax-paths" data-reveal="stagger" aria-label="Learning paths">
            {paths.data.paths.slice(0, 4).map((p, i) => (
              <li key={p.slug}>
                <AcademyPathCard path={p} to={academyPaths.path(p.slug)} progress={progressBySlug.get(p.slug)} index={i} />
              </li>
            ))}
          </ul>
        </AcademySection>
      )}

      {fresh.data && fresh.data.items.length > 0 && (
        <AcademySection eyebrow={copy.text('academy.new.eyebrow')} title={copy.text('academy.new.title')}>
          <ul className="lx-grid lx-grid--rail ax-rail" data-reveal="stagger" aria-label="New courses">
            {fresh.data.items.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} to={academyPaths.course(course.slug)} headingLevel={3} />
              </li>
            ))}
          </ul>
        </AcademySection>
      )}

      <section className="ax-chapter" aria-labelledby="hub-cert" id="certificates">
        <div className="ax-chapter__panel">
          <div className="ax-stage__backdrop" aria-hidden="true" />
          <div className="container ax-chapter__inner">
            <div className="ax-chapter__text" data-reveal="">
              <p className="ax-eyebrow">{copy.text('academy.cert.eyebrow')}</p>
              <h2 id="hub-cert" className="ax-title">
                {copy.text('academy.cert.title')}
              </h2>
              <p className="ax-intro">{copy.text('academy.cert.text')}</p>
              <ul className="ax-checks">
                {copy.list('academy.cert.points').map((p) => (
                  <li key={p}>
                    <Check aria-hidden="true" /> {p}
                  </li>
                ))}
              </ul>
              <Link to="/verify" className="ax-arrowlink">
                {copy.text('academy.cert.cta')} <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="ax-chapter__art" data-reveal="">
              <CertificatePlaque size="lg" badgeUrl={badges[0]} className="ax-chapter__plaque" />
            </div>
          </div>
        </div>
      </section>

      <AcademySection
        id="catalog"
        sectionRef={catalogRef}
        className="ax-catalog"
        eyebrow={copy.text('academy.catalog.eyebrow')}
        title={copy.text('academy.catalog.title')}
        intro={copy.text('academy.catalog.intro')}
      >
        <PublicCatalog key={catalogKey} linkFor={academyPaths.course} headingLevel={3} />
      </AcademySection>
      <AcademyHubExtras />
    </div>
  );
}

// ---------------------------------------------------------------- /learn/:slug

const PHONE_QUERY = '(max-width: 767px)';

/**
 * True on phones once the hero's actions have scrolled out of view: the course page then shows a compact sticky bar with
 * the same actions, so enrolling is always one tap away. Never on wider screens, never without IntersectionObserver.
 */
function useStickyActions(target: RefObject<HTMLElement | null>): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return;
    const phone = window.matchMedia(PHONE_QUERY);
    let visible = true;
    const update = () => setShow(phone.matches && !visible);
    const observer = new IntersectionObserver(([entry]) => {
      // Only once the actions are above the viewport (scrolled past), not while the page is still loading below them.
      visible = entry!.isIntersecting || entry!.boundingClientRect.top > 0;
      update();
    });
    observer.observe(el);
    phone.addEventListener?.('change', update);
    return () => {
      observer.disconnect();
      phone.removeEventListener?.('change', update);
    };
  }, [target]);
  return show;
}

function CurriculumModule({ index, module, defaultOpen, lessonLink }: { index: number; module: CourseDetail['modules'][number]; defaultOpen: boolean; lessonLink: (slug: string) => string }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const minutes = module.lessons.reduce((sum, l) => sum + l.durationMinutes, 0);
  return (
    <li className={clsx('ax-module', open && 'is-open')}>
      <h3 className="ax-module__heading">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className="ax-module__toggle">
          <span className="ax-module__num tabular" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="ax-module__title">
            <span className="ax-module__name">{module.title}</span>
            <span className="ax-module__meta">
              {module.lessons.length} lessons · {formatMinutes(minutes)}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="ax-module__chevron" />
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="ax-module__panel">
        {module.summary && <p className="ax-module__summary">{module.summary}</p>}
        <ol className="ax-module__lessons">
          {module.lessons.map((l) => (
            <li key={l.slug} className="ax-lessonrow">
              <span className="ax-lessonrow__icon" aria-hidden="true">
                {l.type === 'Video' ? <PlayCircle /> : <FileText />}
              </span>
              <Link to={lessonLink(l.slug)} className="ax-lessonrow__link">
                {l.title}
              </Link>
              <span className="ax-lessonrow__dur">
                {l.hasLecture && (
                  <span className="ax-lessonrow__lecture">
                    <Clapperboard aria-hidden="true" />
                    <span className="visually-hidden">Video lecture, </span>
                    {l.lectureMinutes}′
                  </span>
                )}
                {l.type === 'Video' ? 'Video · ' : ''}
                {l.durationMinutes} min
              </span>
            </li>
          ))}
        </ol>
      </div>
    </li>
  );
}

function CourseBody({ course, flow }: { course: CourseDetail; flow: ReturnType<typeof useEnrolAndStart> }) {
  const copy = useSiteCopy();
  const root = useRevealRoot();
  const actionsRef = useRef<HTMLDivElement>(null);
  const sticky = useStickyActions(actionsRef);
  const card = course.card;
  const reviewed = formatReviewed(course.lastReviewed);
  const slug = card.slug;
  const lessonLink = (l: string) => academyPaths.lesson(slug, l);
  const totalMinutes = course.modules.reduce((s, m) => s + m.lessons.reduce((t, l) => t + l.durationMinutes, 0), 0);
  return (
    // Partner links in course Markdown get rel="sponsored" + UTM tags.
    <PartnerLinksProvider>
      <div ref={root} className={clsx('ax ax-course', categoryClass(card.category), sticky && 'has-sticky-cta')}>
        <AcademyStage className="ax-course-hero" labelledBy="course-title">
          <nav aria-label="Breadcrumb" className="ax-crumbs">
            <ol>
              {/* Root crumb is "Academy" (the academy is its own product; no Home crumb). */}
              <li>
                <Link to={academyPaths.home}>Academy</Link>
              </li>
              <li>
                <Link to={`${academyPaths.home}?category=${encodeURIComponent(card.category)}#catalog`}>{CATEGORY_LABELS[card.category]}</Link>
              </li>
            </ol>
          </nav>
          <div className="ax-hero ax-hero--course">
            <div className="ax-hero__copy">
              <p className="ax-course-hero__kicker">
                <CategoryTag category={card.category} /> <span>Free course · Certificate included</span>
              </p>
              <h1 id="course-title" className="ax-display ax-display--course">
                {card.title}
              </h1>
              <p className="ax-lead">{card.subtitle}</p>
              <ul className="ax-facts" aria-label="Course facts">
                <li>
                  <LevelTag level={card.level} />
                </li>
                <li>
                  <Clock aria-hidden="true" /> {formatMinutes(card.estimatedMinutes)}
                </li>
                <li>
                  <FileText aria-hidden="true" /> {card.lessonCount} lessons in {card.moduleCount} modules
                </li>
                {course.lectureCount > 0 && (
                  <li>
                    <Clapperboard aria-hidden="true" /> {formatMinutes(course.lectureMinutes)} of video lectures
                  </li>
                )}
                {reviewed && (
                  <li>
                    <RefreshCw aria-hidden="true" /> Updated {reviewed}
                  </li>
                )}
              </ul>
              <div className="ax-actions" ref={actionsRef}>
                <EnrolActions course={course} flow={flow} />
              </div>
            </div>
            <figure className="ax-course-hero__cert">
              <CertificatePlaque badgeUrl={course.badge.imageUrl} course={card.title} />
              <figcaption>
                <span className="ax-course-hero__cert-kicker">Earn the badge</span>
                <span className="ax-course-hero__cert-name">{course.badge.name}</span>
              </figcaption>
            </figure>
          </div>
        </AcademyStage>

        <div className="container ax-course__status">
          {flow.failed && flow.canLearn && (
            <Alert
              tone="danger"
              title="We couldn’t enrol you"
              actions={
                <Button size="sm" variant="secondary" loading={flow.pending} onClick={flow.start}>
                  Try again
                </Button>
              }
            >
              {errorMessage(flow.error)}
            </Alert>
          )}
          {flow.auto && flow.canLearn && (
            <p className="lx-enrolling" role="status">
              <GraduationCap aria-hidden="true" /> Enrolling you in {card.title} and opening the first lesson…
            </p>
          )}
          {flow.signedIn && !flow.canLearn && (
            <p className="lx-enrolling lx-enrolling--info" role="note">
              <Info aria-hidden="true" /> {STAFF_NOTE}
            </p>
          )}
        </div>

        <nav className="ax-course-nav" aria-label="On this page">
          <ul className="container">
            <li>
              <a href="#about">{copy.text('academy.course.aboutTitle')}</a>
            </li>
            <li>
              <a href="#syllabus">{copy.text('academy.course.curriculumTitle')}</a>
            </li>
            <li>
              <a href="#certificate">{copy.text('academy.course.certEyebrow')}</a>
            </li>
          </ul>
        </nav>

        <section id="about" className="ax-section ax-course-about" aria-labelledby="about-heading">
          <div className="container ax-split">
            <div className="ax-split__main" data-reveal="">
              <h2 id="about-heading" className="ax-title ax-title--sm">
                {copy.text('academy.course.aboutTitle')}
              </h2>
              <div className="ax-prose">
                <Markdown source={course.description} minLevel={3} />
              </div>
              {course.tools.length > 0 && (
                <>
                  <h3 className="ax-subhead">Tools you’ll use</h3>
                  <ul className="ax-chips" aria-label="Tools you’ll use">
                    {course.tools.map((t) => (
                      <li key={t}>
                        <Wrench aria-hidden="true" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {card.skills.length > 0 && (
                <>
                  <h3 className="ax-subhead">Skills</h3>
                  <ul className="ax-chips ax-chips--plain" aria-label="Skills">
                    {card.skills.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <section className="ax-outcomes" aria-labelledby="outcomes-heading" data-reveal="">
              <h2 id="outcomes-heading" className="ax-outcomes__title">
                <Target aria-hidden="true" /> {copy.text('academy.course.outcomesTitle')}
              </h2>
              <ol className="ax-outcomes__list">
                {course.outcomes.map((o, i) => (
                  <li key={o}>
                    <span className="ax-outcomes__num tabular" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{o}</span>
                  </li>
                ))}
              </ol>
              {course.prerequisites.length > 0 && (
                <div className="ax-outcomes__prereq">
                  <h3 className="ax-subhead">Recommended first</h3>
                  <ul className="ax-links">
                    {course.prerequisites.map((p) => (
                      <li key={p.slug}>
                        <Link to={academyPaths.course(p.slug)}>
                          {p.title} <ArrowRight aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </section>

        <section id="syllabus" className="ax-section ax-section--tint" aria-labelledby="syllabus-heading">
          <div className="container ax-split ax-split--wide">
            <div className="ax-head ax-head--side" data-reveal="">
              <div className="ax-head__text">
                <p className="ax-eyebrow">{copy.text('academy.course.curriculumEyebrow')}</p>
                <h2 id="syllabus-heading" className="ax-title">
                  {copy.text('academy.course.curriculumTitle')}
                </h2>
                <dl className="ax-sumlist">
                  <div>
                    <dt>Modules</dt>
                    <dd className="tabular">{course.modules.length}</dd>
                  </div>
                  <div>
                    <dt>Lessons</dt>
                    <dd className="tabular">{card.lessonCount}</dd>
                  </div>
                  <div>
                    <dt>Reading time</dt>
                    <dd className="tabular">{formatHours(totalMinutes)}</dd>
                  </div>
                  <div>
                    <dt>Assessment questions</dt>
                    <dd className="tabular">{course.exam.questionCount}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <ol className="ax-modules">
              {course.modules.map((m, i) => (
                <CurriculumModule key={m.slug} index={i} module={m} defaultOpen={i === 0} lessonLink={lessonLink} />
              ))}
              <li className="ax-module ax-module--exam">
                <div className="ax-module__toggle ax-module__toggle--static">
                  <span className="ax-module__num" aria-hidden="true">
                    <Award />
                  </span>
                  <span className="ax-module__title">
                    <span className="ax-module__name">{copy.text('academy.course.examTitle')}</span>
                    <span className="ax-module__meta">
                      {course.exam.questionCount} questions · {course.exam.timeLimitMinutes} minutes · pass mark {course.exam.passingScore}%
                    </span>
                  </span>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section id="certificate" className="ax-section ax-course-cert" aria-labelledby="cert-heading">
          <div className="container">
            <div className="ax-certcard" data-reveal="">
              <div className="ax-certcard__art">
                <CertificatePlaque size="lg" badgeUrl={course.badge.imageUrl} course={card.title} />
              </div>
              <div className="ax-certcard__text">
                <p className="ax-eyebrow">{copy.text('academy.course.certEyebrow')}</p>
                <h2 id="cert-heading" className="ax-title ax-title--sm">
                  {copy.text('academy.course.certTitle')}
                </h2>
                <p className="ax-intro">
                  Earn the <strong>{course.badge.name}</strong> badge: {course.badge.description}
                </p>
                <p className="ax-muted">{course.badge.criteria}</p>
                <ul className="ax-checks ax-checks--grid">
                  {copy.list('academy.course.certPerks').map((p) => (
                    <li key={p}>
                      <BadgeCheck aria-hidden="true" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <section className="ax-exam" aria-labelledby="exam-heading" data-reveal="">
              <h2 id="exam-heading" className="ax-exam__title">
                {copy.text('academy.course.examTitle')}
              </h2>
              <ul className="ax-exam__facts">
                <li>
                  <FileText aria-hidden="true" />
                  <span className="ax-exam__value tabular">{course.exam.questionCount}</span>
                  <span className="ax-exam__label">questions drawn from a larger pool</span>
                </li>
                <li>
                  <Timer aria-hidden="true" />
                  <span className="ax-exam__value tabular">{course.exam.timeLimitMinutes} min</span>
                  <span className="ax-exam__label">time limit</span>
                </li>
                <li>
                  <Award aria-hidden="true" />
                  <span className="ax-exam__value tabular">{course.exam.passingScore}%</span>
                  <span className="ax-exam__label">pass mark</span>
                </li>
                <li>
                  <RotateCcw aria-hidden="true" />
                  <span className="ax-exam__value tabular">{course.exam.maxAttemptsPerDay}</span>
                  <span className="ax-exam__label">attempts per 24 hours</span>
                </li>
              </ul>
            </section>
          </div>
        </section>

        <div className="container ax-course__end">
          <SignUpCta next={academyPaths.portalCourse(slug)} slug={slug} title={copy.text('academy.course.ctaTitle')} text={copy.text('academy.course.ctaText')} />
          {/* Partner slot (course page). */}
          <LearnSlot slot="learn.course" keywords={courseKeywords(card.skills, card.category)} categories={[card.category]} />
          <WorkWithUsCard />
        </div>

        {sticky && (
          <div className="lx-sticky-cta ax-sticky" role="region" aria-label="Course actions">
            <p className="lx-sticky-cta__title">{card.title}</p>
            <div className="lx-sticky-cta__actions">
              <EnrolActions course={course} flow={flow} compact />
            </div>
          </div>
        )}
      </div>
    </PartnerLinksProvider>
  );
}

export function AcademyCoursePage() {
  const { slug = '' } = useParams();
  const q = usePublicCourse(slug);
  const flow = useEnrolAndStart(q.data);
  useDocumentHead(headFrom(q.data?.seo, q.data?.jsonLd));
  if (q.isPending) return <PageLoading />;
  if (q.isError) {
    if ((q.error as { status?: number }).status === 404) return <NotFound />;
    return <PageError error={q.error} title="This course isn’t available right now" retry={() => void q.refetch()} />;
  }
  return <CourseBody course={q.data} flow={flow} />;
}

// ---------------------------------------------------------------- /learn/:slug/:lessonSlug

/** The course outline beside a lesson: every module and lesson, the current one marked. */
function LessonOutline({ course, current }: { course: CourseDetail; current: string }) {
  const lessons = course.modules.flatMap((m) => m.lessons);
  const position = lessons.findIndex((l) => l.slug === current) + 1;
  const list = (
    <ol className="ax-outline__modules">
      {course.modules.map((m, i) => (
        <li key={m.slug}>
          <p className="ax-outline__module">
            <span className="tabular" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>{' '}
            {m.title}
          </p>
          <ol className="ax-outline__lessons">
            {m.lessons.map((l) => (
              <li key={l.slug}>
                <Link
                  to={academyPaths.lesson(course.card.slug, l.slug)}
                  aria-current={l.slug === current ? 'page' : undefined}
                  className={clsx('ax-outline__link', l.slug === current && 'is-current')}
                >
                  {l.title}
                </Link>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
  return (
    <nav className="ax-outline" aria-label="Course outline">
      <Link to={academyPaths.course(course.card.slug)} className="ax-outline__course">
        <span className="ax-outline__kicker">Course</span>
        {course.card.title}
      </Link>
      {position > 0 && (
        <ProgressBar
          value={position}
          max={lessons.length}
          label="Where you are"
          valueText={`Lesson ${position} of ${lessons.length}`}
          className="ax-outline__progress"
        />
      )}
      <details className="ax-outline__toggle">
        <summary>
          <ListTree aria-hidden="true" /> All lessons
        </summary>
        {list}
      </details>
      <div className="ax-outline__full">{list}</div>
    </nav>
  );
}

function LessonBody({ slug, lessonSlug, lesson }: { slug: string; lessonSlug: string; lesson: NonNullable<ReturnType<typeof usePublicLesson>['data']> }) {
  const course = usePublicCourse(slug);
  const reading = useRef<HTMLDivElement>(null);
  const progress = useReadingProgress(reading);
  return (
    <div className={clsx('ax ax-lessonpage', categoryClass(lesson.category))}>
      <div className="ax-readbar" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` } as CSSProperties} />
      </div>
      <div className="container ax-lessonpage__grid">
        {course.data ? <LessonOutline course={course.data} current={lessonSlug} /> : <div className="ax-outline ax-outline--empty" />}
        <div className="ax-lessonpage__main" ref={reading}>
          <LessonView
            lesson={lesson}
            courseLink={academyPaths.course(slug)}
            lessonLink={(l) => academyPaths.lesson(slug, l)}
            footer={<LessonEnrolPrompt slug={slug} lessonSlug={lessonSlug} />}
          />
        </div>
      </div>
    </div>
  );
}

export function AcademyLessonPage() {
  const { slug = '', lessonSlug = '' } = useParams();
  const q = usePublicLesson(slug, lessonSlug);
  // The course (for the outline beside the lesson) loads in parallel with the lesson, and the page renders once both
  // have answered: rendering the lesson first pushed it down when the outline arrived (a large layout shift on phones,
  // where the outline sits above the lesson). A course that fails to load only drops the outline.
  const course = usePublicCourse(slug);
  useDocumentHead(headFrom(q.data?.seo, q.data?.jsonLd, 'article'));
  if (q.isPending || course.isPending) return <PageLoading height={520} />;
  if (q.isError) {
    if ((q.error as { status?: number }).status === 404) return <NotFound />;
    return <PageError error={q.error} title="This lesson isn’t available right now" retry={() => void q.refetch()} />;
  }
  return <LessonBody slug={slug} lessonSlug={lessonSlug} lesson={q.data} />;
}

// ---------------------------------------------------------------- /learn/paths

export function AcademyPathsPage() {
  const q = usePaths();
  const copy = useSiteCopy();
  const root = useRevealRoot();
  const { canLearn } = useCanLearn();
  const mine = useMyPaths(canLearn);
  useDocumentHead(headFrom(q.data?.seo, q.data?.jsonLd));
  const progress = new Map(mine.data?.map((p) => [p.card.slug, p.progress]) ?? []);
  const all = q.data?.paths ?? [];
  const courses = all.reduce((s, p) => s + p.courseCount, 0);
  return (
    <div ref={root} className="ax ax-pathsindex">
      <AcademyStage compact>
        <nav aria-label="Breadcrumb" className="ax-crumbs">
          <ol>
            <li>
              <Link to={academyPaths.home}>Academy</Link>
            </li>
          </ol>
        </nav>
        <StageEyebrow>{copy.text('academy.pathsPage.eyebrow')}</StageEyebrow>
        <h1 className="ax-display ax-display--compact">{copy.text('academy.pathsPage.title')}</h1>
        <p className="ax-lead">{copy.text('academy.pathsPage.lead')}</p>
        {/* Shown with dashes while the paths load, so the hero does not grow (and push the page) when they arrive. */}
        {(q.isPending || all.length > 0) && (
          <StageFigures
            label="Learning paths in numbers"
            items={[
              { value: q.isPending ? '–' : String(all.length), label: 'Learning paths' },
              { value: q.isPending ? '–' : String(courses), label: 'Course steps' },
              { value: '$0', label: 'Price, forever' },
            ]}
          />
        )}
      </AcademyStage>
      <section className="ax-section" aria-label="All learning paths">
        <div className="container">
          {q.isPending && (
            <div className="ax-paths" aria-busy="true">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} height={320} radius="var(--radius-2xl)" />
              ))}
            </div>
          )}
          {q.isError && <ErrorState error={q.error} title="Learning paths aren’t available right now" onRetry={() => void q.refetch()} />}
          {q.data && (
            <ul className="ax-paths" data-reveal="stagger" aria-label="Learning paths">
              {q.data.paths.map((p, i) => (
                <li key={p.slug}>
                  <AcademyPathCard path={p} to={academyPaths.path(p.slug)} progress={progress.get(p.slug)} headingLevel={2} index={i} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- /learn/paths/:pathSlug

function PathBody({ path, progress, actions }: { path: PathDetail; progress: PathProgress | null; actions: ReactNode }) {
  const copy = useSiteCopy();
  const root = useRevealRoot();
  const card = path.card;
  const byCourse = new Map(progress?.courses.map((c) => [c.slug, c]) ?? []);
  const doneCount = progress?.completedCourses ?? 0;
  const tint = card.categories[0] ? categoryClass(card.categories[0]) : 'lx-cat--platform';
  return (
    <div ref={root} className={clsx('ax ax-pathpage', tint)}>
      <AcademyStage labelledBy="path-title">
        <nav aria-label="Breadcrumb" className="ax-crumbs">
          <ol>
            <li>
              <Link to={academyPaths.home}>Academy</Link>
            </li>
            <li>
              <Link to={academyPaths.paths}>Learning paths</Link>
            </li>
          </ol>
        </nav>
        <div className="ax-hero ax-hero--course">
          <div className="ax-hero__copy">
            <StageEyebrow>
              <Route aria-hidden="true" className="ax-pill__icon" /> Learning path · Free
            </StageEyebrow>
            <h1 id="path-title" className="ax-display ax-display--course">
              {card.title}
            </h1>
            <p className="ax-lead">{card.subtitle}</p>
            <ul className="ax-facts" aria-label="Path facts">
              <li>
                <LevelTag level={card.level} />
              </li>
              <li>
                <Layers aria-hidden="true" /> {card.courseCount} courses in order
              </li>
              <li>
                <BookOpen aria-hidden="true" /> {card.lessonCount} lessons
              </li>
              <li>
                <Clock aria-hidden="true" /> {formatHours(card.totalMinutes)} in total
              </li>
              <li>
                <Award aria-hidden="true" /> {card.badges.length} certificates
              </li>
            </ul>
            <div className="ax-actions">{actions}</div>
            {progress?.started && (
              <div className="ax-pathpage__progress">
                <ProgressBar
                  value={progress.progressPercent}
                  label="Path progress"
                  valueText={`${doneCount} of ${progress.courseCount} courses completed (${progress.progressPercent}%)`}
                />
              </div>
            )}
          </div>
          <figure className="ax-badgewall">
            <ul className="ax-badgewall__grid" aria-hidden="true">
              {card.badges.slice(0, 6).map((b, i) => (
                <li key={b.courseSlug} className={clsx(byCourse.get(b.courseSlug)?.passed && 'is-earned')} style={{ '--n': i } as CSSProperties}>
                  <BadgeImage src={b.imageUrl} size={84} />
                </li>
              ))}
            </ul>
            <figcaption>
              <span className="ax-course-hero__cert-kicker">Badges along the way</span>
              <span className="ax-course-hero__cert-name">
                {progress?.started ? `${doneCount} of ${card.badges.length} earned` : `${card.badges.length} verifiable badges`}
              </span>
            </figcaption>
          </figure>
        </div>
      </AcademyStage>

      <section className="ax-section" aria-labelledby="timeline-heading">
        <div className="container ax-split ax-split--route">
          <div className="ax-route">
            <h2 id="timeline-heading" className="ax-title ax-title--sm" data-reveal="">
              {copy.text('academy.path.routeTitle')}
            </h2>
            <ol className="ax-route__steps" data-reveal="stagger">
              {path.courses.map(({ position, course }) => {
                const p = byCourse.get(course.slug);
                const isNext = progress?.nextCourseSlug === course.slug;
                const state = p?.passed ? 'done' : isNext && progress?.started ? 'next' : p?.enrolled ? 'active' : 'todo';
                return (
                  <li key={course.slug} className={clsx('ax-step', `is-${state}`, categoryClass(course.category))}>
                    <span className="ax-step__node tabular" aria-hidden="true">
                      {p?.passed ? <Check /> : String(position).padStart(2, '0')}
                    </span>
                    <article className="ax-step__card">
                      <div className="ax-step__badge">
                        <BadgeImage src={course.badgeImageUrl} size={64} />
                      </div>
                      <div className="ax-step__text">
                        <p className="ax-step__kicker">
                          Step {position} · <CategoryTag category={course.category} />
                          {isNext && <span className="ax-step__next">{progress?.started ? 'Up next' : 'Start here'}</span>}
                        </p>
                        <h3 className="ax-step__title">
                          <Link to={academyPaths.course(course.slug)} className="ax-stretch">
                            {course.title}
                          </Link>
                        </h3>
                        <p className="ax-step__subtitle">{course.subtitle}</p>
                        <p className="ax-step__meta">
                          <LevelTag level={course.level} /> · {course.lessonCount} lessons · {formatHours(course.estimatedMinutes)} · badge: {course.badgeName}
                        </p>
                        {p?.enrolled && !p.passed && <ProgressBar value={p.progressPercent} label="Your progress" className="ax-step__progress" />}
                        {p?.passed && (
                          <p className="ax-step__done">
                            <CheckCircle2 aria-hidden="true" /> Completed · certificate earned
                          </p>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
            <p className="ax-muted ax-route__note">
              <Lock aria-hidden="true" /> {copy.text('academy.path.note')}
            </p>
          </div>

          <aside className="ax-pathaside" aria-label="About this path">
            <section className="ax-panel" aria-labelledby="path-about" data-reveal="">
              <h2 id="path-about" className="ax-panel__title">
                <Compass aria-hidden="true" /> About this path
              </h2>
              <div className="ax-prose">
                <Markdown source={path.description} minLevel={3} />
              </div>
            </section>
            {path.outcomes.length > 0 && (
              <section className="ax-panel" aria-labelledby="path-outcomes" data-reveal="">
                <h2 id="path-outcomes" className="ax-panel__title">
                  <Target aria-hidden="true" /> What you’ll be able to do
                </h2>
                <ul className="ax-checks">
                  {path.outcomes.map((o) => (
                    <li key={o}>
                      <Check aria-hidden="true" /> {o}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {path.audience.length > 0 && (
              <section className="ax-panel" aria-labelledby="path-audience" data-reveal="">
                <h2 id="path-audience" className="ax-panel__title">
                  <Users aria-hidden="true" /> Who it’s for
                </h2>
                <ul className="ax-chips ax-chips--plain">
                  {path.audience.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </section>
            )}
            {path.courses[0] && (
              <div className="ax-panel ax-panel--cert">
                <BadgeImage src={card.badges[0]?.imageUrl ?? ''} size={56} />
                <p>
                  <strong>Every course in this path ends with a verifiable certificate.</strong> Collect all {card.badges.length} badges and show the
                  whole path on your LinkedIn profile.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

export function AcademyPathPage() {
  const { pathSlug = '' } = useParams();
  const q = usePath(pathSlug);
  const { canLearn, signedIn } = useCanLearn();
  const mine = useMyPath(pathSlug, canLearn);
  const navigate = useNavigate();
  useDocumentHead(headFrom(q.data?.seo, q.data?.jsonLd));
  if (q.isPending) return <PageLoading />;
  if (q.isError) {
    if ((q.error as { status?: number }).status === 404) return <NotFound />;
    return <PageError error={q.error} title="This learning path isn’t available right now" retry={() => void q.refetch()} />;
  }
  const path = q.data;
  const progress = mine.data?.progress ?? null;
  const nextSlug = progress?.nextCourseSlug ?? path.courses[0]?.course.slug;
  const next = path.courses.find((c) => c.course.slug === nextSlug)?.course;
  return (
    <PathBody
      path={path}
      progress={progress}
      actions={
        next && (
          <>
            <ButtonLink to={academyPaths.course(next.slug)} size="lg" variant="highlight" trailingIcon={<ArrowRight aria-hidden="true" />}>
              {progress?.started ? `Continue: ${next.title}` : `Start with ${next.title}`}
            </ButtonLink>
            {!signedIn && (
              <Button
                size="lg"
                variant="secondary"
                leadingIcon={<UserPlus aria-hidden="true" />}
                onClick={() => {
                  rememberEnrolIntent(next.slug);
                  navigate(authPathForEnrol(next.slug, 'register'));
                }}
              >
                Enrol for free
              </Button>
            )}
          </>
        )
      }
    />
  );
}
