import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  DateTime,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Stat,
  Switch,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage, isApiError } from '@/lib/api/errors';
import { W } from '../api';
import {
  AreaField,
  type Errors,
  LinesField,
  ListEditor,
  MultiCheck,
  SwitchField,
  TextField,
  toErrors,
} from '../shared/fields';
import type { CrawlerGroup } from './SeoAdmin';

/**
 * Agency → Website → SEO → robots.txt, Sitemaps and llms.txt (`/agency/website/seo/files`). The files are generated from
 * the site's content on every request; editors add rules, hide addresses or groups and write llms.txt's introduction.
 * Every save is audited and served at once.
 */

export interface RobotsWarning {
  code: string;
  message: string;
}

export interface SitemapGroupDefaults {
  changeFrequency: string | null;
  priority: number | null;
}

export interface SitemapGroup {
  name: string;
  label: string;
  kind: 'urls' | 'images' | 'videos';
  excluded: boolean;
  urlCount: number;
  hiddenCount: number;
  lastModified: string | null;
  defaults: SitemapGroupDefaults | null;
  files: { name: string; url: string; urlCount: number; lastModified: string | null }[];
}

export interface LlmsCustomSection {
  title: string;
  body: string;
}

export interface SeoFiles {
  robots: {
    extraRules: string[];
    extraText: string | null;
    extraSitemaps: string[];
    generated: string;
    warnings: RobotsWarning[];
    crawlerGroups: CrawlerGroup[];
  };
  sitemap: {
    indexUrl: string;
    groups: SitemapGroup[];
    excludedGroups: string[];
    excludedPaths: string[];
    extraPaths: string[];
    groupDefaults: Record<string, SitemapGroupDefaults>;
    listedUrls: number;
    hiddenUrls: number;
    generatedAt: string;
    lastModified: string | null;
    changeFrequencies: string[];
    indexNowEnabled: boolean;
  };
  llms: {
    enabled: boolean;
    summary: string | null;
    intro: string | null;
    defaultSummary: string;
    defaultIntro: string;
    sections: { key: string; label: string; included: boolean }[];
    customSections: LlmsCustomSection[];
    academyGuideEnabled: boolean;
  };
  siteUrl: string;
  updatedAt: string;
  concurrencyStamp: string;
}

export interface SitemapUrlRow {
  path: string;
  url: string;
  group: string;
  title: string;
  lastModified: string | null;
  hiddenBy: 'page' | 'address' | null;
  extra: boolean;
}

export const FILES_KEY = ['website', 'seo', 'files'] as const;
const SETTINGS_KEY = ['website', 'seo', 'settings'] as const;

/** The files document; shared by the three tabs (one concurrency stamp with the crawler settings). */
function useSeoFiles() {
  return useQuery({ queryKey: FILES_KEY, queryFn: () => api.get<SeoFiles>(`${W}/seo/files`) });
}

/** After any save: the files, the crawler settings (same stamp) and the SEO overview ("in sitemap") are refreshed. */
function useSaved() {
  const qc = useQueryClient();
  return (data: SeoFiles) => {
    qc.setQueryData(FILES_KEY, data);
    void qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    void qc.invalidateQueries({ queryKey: ['website', 'seo', 'overview'] });
    void qc.invalidateQueries({ queryKey: ['website', 'seo', 'sitemap-urls'] });
  };
}

function FileLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="seo-filelink">
      {children} <ExternalLink aria-hidden="true" size={14} />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------------------------------------- robots.txt

interface RobotsDraft {
  extraRules: string[];
  extraText: string;
  extraSitemaps: string[];
}

interface RobotsPreview {
  text: string;
  warnings: RobotsWarning[];
  errors: Record<string, string[]>;
}

export function RobotsTab({ onOpenCrawlers }: { onOpenCrawlers?: () => void }) {
  const toast = useToast();
  const saved = useSaved();
  const query = useSeoFiles();
  const [draft, setDraft] = useState<RobotsDraft | null>(null);
  const [version, setVersion] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (query.data && !draft) {
      const r = query.data.robots;
      setDraft({ extraRules: r.extraRules, extraText: r.extraText ?? '', extraSitemaps: r.extraSitemaps });
    }
  }, [query.data, draft]);

  const debounced = useDebounced(draft);
  const preview = useQuery({
    queryKey: ['website', 'seo', 'robots-preview', debounced],
    queryFn: () => api.post<RobotsPreview>(`${W}/seo/files/robots/preview`, debounced),
    enabled: !!debounced,
    placeholderData: (prev) => prev,
  });

  const save = useMutation({
    mutationFn: (confirmDisallowAll: boolean) =>
      api.put<SeoFiles>(`${W}/seo/files/robots`, {
        ...draft,
        confirmDisallowAll,
        concurrencyStamp: query.data!.concurrencyStamp,
      }),
    onSuccess: (data) => {
      saved(data);
      setErrors({});
      setConfirming(false);
      toast.success('robots.txt saved', 'The new rules are served now.');
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'seo.confirm_disallow_all') {
        setConfirming(true);
        return;
      }
      if (isApiError(e)) setErrors(toErrors(e.errors));
      toast.error(errorMessage(e));
    },
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!draft || !query.data) return <Skeleton height={420} />;
  const data = query.data;
  const previewErrors = Object.entries(preview.data?.errors ?? {});
  const warnings = preview.data?.warnings ?? data.robots.warnings;
  const disallowAll = warnings.some((w) => w.code === 'disallowAll');

  return (
    <div className="seo-files">
      <div className="cms-form">
        <p className="text-muted">
          robots.txt is generated: the public site is open, signed-in areas, the API, personal links and
          search results are closed to every crawler, and each crawler group follows the policy in{' '}
          {onOpenCrawlers ? (
            <Button variant="link" size="sm" onClick={onOpenCrawlers}>
              Crawlers &amp; AI
            </Button>
          ) : (
            'Crawlers & AI'
          )}
          . Add your own rules below; they are checked before saving and recorded in the audit log.{' '}
          <FileLink href="/robots.txt">Open /robots.txt</FileLink>
        </p>
        <fieldset className="cms-fieldset">
          <legend>Crawler groups</legend>
          <ul className="seo-groups">
            {data.robots.crawlerGroups.map((g) => (
              <li key={g.key}>
                <Badge tone={g.allowed ? 'success' : 'danger'} size="sm">
                  {g.allowed ? 'Allowed' : 'Blocked'}
                </Badge>{' '}
                {g.label}
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset className="cms-fieldset">
          <legend>Your additions</legend>
          <LinesField
            key={`rules-${version}`}
            label="Rules for every crawler that may crawl the site"
            value={draft.extraRules}
            onChange={(extraRules) => setDraft({ ...draft, extraRules })}
            error={
              errors.extraRules ?? Object.entries(errors).find(([k]) => k.startsWith('extraRules['))?.[1]
            }
            hint="One rule per line: 'Disallow: /drafts/', 'Allow: /drafts/public' or 'Crawl-delay: 5'. Added to the search-engine, AI and catch-all groups."
          />
          <AreaField
            label="Extra lines (groups for other crawlers, comments)"
            value={draft.extraText}
            onChange={(extraText) => setDraft({ ...draft, extraText })}
            rows={6}
            error={errors.extraText}
            hint="Appended after the generated groups, e.g. 'User-agent: ExampleBot' followed by 'Disallow: /'. Crawlers in the groups above are set with their toggle instead."
          />
          <LinesField
            key={`sitemaps-${version}`}
            label="Extra sitemaps"
            value={draft.extraSitemaps}
            onChange={(extraSitemaps) => setDraft({ ...draft, extraSitemaps })}
            error={
              errors.extraSitemaps ??
              Object.entries(errors).find(([k]) => k.startsWith('extraSitemaps['))?.[1]
            }
            hint={`Absolute URLs, one per line, listed after ${data.sitemap.indexUrl}.`}
          />
        </fieldset>
        <div className="cms-form__actions">
          <Button
            onClick={() => save.mutate(false)}
            loading={save.isPending}
            disabled={previewErrors.length > 0}
          >
            Save robots.txt
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<RotateCcw />}
            onClick={() => {
              setDraft({ extraRules: [], extraText: '', extraSitemaps: [] });
              setVersion((v) => v + 1);
            }}
          >
            Remove my additions
          </Button>
        </div>
      </div>
      <section className="seo-files__preview" aria-labelledby="robots-preview-title">
        <h2 id="robots-preview-title" className="seo-files__title">
          Preview {preview.isFetching && <span className="text-small text-muted">(updating…)</span>}
        </h2>
        {previewErrors.length > 0 && (
          <Alert tone="danger" title="Fix these lines before saving">
            <ul>
              {previewErrors.map(([field, messages]) => (
                <li key={field}>{messages[0]}</li>
              ))}
            </ul>
          </Alert>
        )}
        {warnings.map((w) => (
          <Alert
            key={w.code + w.message}
            tone="warning"
            title={w.code === 'searchBlocked' ? 'Search engines are blocked' : 'This closes the whole site'}
          >
            {w.message}
          </Alert>
        ))}
        {/* A scrollable preview must be focusable so keyboard users can scroll it. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <pre className="seo-files__code" role="group" aria-label="robots.txt preview" tabIndex={0}>
          {preview.data?.text ?? data.robots.generated}
        </pre>
      </section>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title="Close the site to crawlers?"
        description={
          disallowAll
            ? warnings.find((w) => w.code === 'disallowAll')?.message
            : 'A rule closes the whole site to a crawler.'
        }
        confirmText="CLOSE SITE"
        confirmLabel="Save anyway"
        onConfirm={() => save.mutateAsync(true).then(() => undefined)}
      >
        <p>Type CLOSE SITE to confirm. Search engines drop pages they may no longer crawl.</p>
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- Sitemaps

const PRIORITIES = ['', '1.0', '0.9', '0.8', '0.7', '0.6', '0.5', '0.4', '0.3', '0.2', '0.1', '0.0'];

interface SitemapDraft {
  excludedGroups: string[];
  excludedPaths: string[];
  extraPaths: string[];
  groupDefaults: Record<string, SitemapGroupDefaults>;
}

function hiddenLabel(row: SitemapUrlRow) {
  if (row.hiddenBy === 'page')
    return (
      <Badge tone="neutral" size="sm">
        Hidden by the page’s setting
      </Badge>
    );
  if (row.hiddenBy === 'address')
    return (
      <Badge tone="warning" size="sm">
        Excluded
      </Badge>
    );
  return (
    <Badge tone="success" size="sm">
      Listed
    </Badge>
  );
}

function SitemapUrls({ data }: { data: SeoFiles }) {
  const toast = useToast();
  const saved = useSaved();
  const [group, setGroup] = useState('');
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const urls = useQuery({
    queryKey: ['website', 'seo', 'sitemap-urls', group, state, q],
    queryFn: () =>
      api.get<{ rows: SitemapUrlRow[]; total: number; truncated: boolean }>(`${W}/seo/files/sitemap/urls`, {
        query: { group: group || undefined, state: state || undefined, q: q || undefined },
      }),
    placeholderData: (prev) => prev,
  });
  const toggle = useMutation({
    mutationFn: ({ path, excluded }: { path: string; excluded: boolean }) =>
      api.post<SeoFiles>(`${W}/seo/files/sitemap/urls`, {
        path,
        excluded,
        concurrencyStamp: data.concurrencyStamp,
      }),
    onSuccess: (result, v) => {
      saved(result);
      toast.success(v.excluded ? 'Address left out of the sitemap' : 'Address listed in the sitemap again');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: DataTableColumn<SitemapUrlRow>[] = [
    {
      id: 'path',
      header: 'Address',
      primary: true,
      sortable: true,
      sortValue: (r) => r.path,
      cell: (r) => (
        <div className="seo-cell">
          <a href={r.path} target="_blank" rel="noreferrer">
            {r.path}
          </a>
          <span className="text-small text-muted">{r.title}</span>
        </div>
      ),
    },
    {
      id: 'group',
      header: 'Sitemap',
      sortable: true,
      sortValue: (r) => r.group,
      cell: (r) => r.group,
      hideOnMobile: true,
    },
    {
      id: 'modified',
      header: 'Last change',
      sortable: true,
      sortValue: (r) => r.lastModified ?? '',
      cell: (r) =>
        r.lastModified ? <DateTime value={r.lastModified} /> : <span className="text-muted">—</span>,
      hideOnMobile: true,
    },
    { id: 'state', header: 'State', cell: (r) => hiddenLabel(r), mobileSlot: 'badge' },
    {
      id: 'action',
      header: <span className="visually-hidden">Action</span>,
      cell: (r) =>
        r.hiddenBy === 'page' ? (
          <span className="text-small text-muted">Change it in the page’s SEO settings</span>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={toggle.isPending && toggle.variables?.path === r.path}
            onClick={() => toggle.mutate({ path: r.path, excluded: r.hiddenBy !== 'address' })}
          >
            {r.hiddenBy === 'address' ? 'Include' : 'Exclude'}
            <span className="visually-hidden"> {r.path}</span>
          </Button>
        ),
    },
  ];

  return (
    <section className="stack" aria-labelledby="sitemap-urls-title">
      <h2 id="sitemap-urls-title" className="seo-files__title">
        Addresses
      </h2>
      <div className="seo-files__filters">
        <Select
          aria-label="Sitemap"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          options={[
            { value: '', label: 'All sitemaps' },
            ...data.sitemap.groups
              .filter((g) => g.kind === 'urls')
              .map((g) => ({ value: g.name, label: g.label })),
          ]}
        />
        <Select
          aria-label="State"
          value={state}
          onChange={(e) => setState(e.target.value)}
          options={[
            { value: '', label: 'Listed and hidden' },
            { value: 'listed', label: 'Listed' },
            { value: 'hidden', label: 'Hidden or excluded' },
          ]}
        />
        <Input
          aria-label="Search addresses and titles"
          placeholder="Search addresses and titles"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {urls.isError ? (
        <ErrorState error={urls.error} onRetry={() => void urls.refetch()} />
      ) : (
        <DataTable
          caption="Public addresses in the sitemaps"
          columns={columns}
          rows={urls.data?.rows ?? []}
          getRowId={(r) => r.path}
          loading={!urls.data}
          emptyState={<p className="text-muted">No address matches.</p>}
        />
      )}
      {urls.data?.truncated && (
        <p className="text-small text-muted">
          Showing 1,000 of {urls.data.total} addresses: narrow the search.
        </p>
      )}
    </section>
  );
}

export function SitemapsTab() {
  const toast = useToast();
  const saved = useSaved();
  const query = useSeoFiles();
  const [draft, setDraft] = useState<SitemapDraft | null>(null);
  const [version, setVersion] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (query.data && !draft) {
      const s = query.data.sitemap;
      setDraft({
        excludedGroups: s.excludedGroups,
        excludedPaths: s.excludedPaths,
        extraPaths: s.extraPaths,
        groupDefaults: s.groupDefaults,
      });
    }
  }, [query.data, draft]);
  // A per-address toggle in the table changes the stored exclusions: keep the bulk editor in step.
  useEffect(() => {
    if (
      query.data &&
      draft &&
      query.data.sitemap.excludedPaths.join('\n') !== draft.excludedPaths.join('\n')
    ) {
      setDraft((d) => (d ? { ...d, excludedPaths: query.data!.sitemap.excludedPaths } : d));
      setVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stored list changes
  }, [query.data?.sitemap.excludedPaths]);

  const save = useMutation({
    mutationFn: () =>
      api.put<SeoFiles>(`${W}/seo/files/sitemap`, {
        ...draft,
        concurrencyStamp: query.data!.concurrencyStamp,
      }),
    onSuccess: (data) => {
      saved(data);
      setErrors({});
      toast.success('Sitemap settings saved', 'sitemap.xml reflects them now.');
    },
    onError: (e) => {
      if (isApiError(e)) setErrors(toErrors(e.errors));
      toast.error(errorMessage(e));
    },
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!draft || !query.data) return <Skeleton height={420} />;
  const data = query.data;
  const setDefaults = (name: string, patch: Partial<SitemapGroupDefaults>) => {
    const current = draft.groupDefaults[name] ?? { changeFrequency: null, priority: null };
    const next = { ...current, ...patch };
    const groupDefaults = { ...draft.groupDefaults };
    if (next.changeFrequency || next.priority !== null) groupDefaults[name] = next;
    else delete groupDefaults[name];
    setDraft({ ...draft, groupDefaults });
  };

  return (
    <div className="stack">
      <div className="grid-auto">
        <Stat label="Listed addresses" value={data.sitemap.listedUrls} />
        <Stat label="Hidden or excluded" value={data.sitemap.hiddenUrls} />
        <Stat
          label="Newest change"
          value={data.sitemap.lastModified ? new Date(data.sitemap.lastModified).toLocaleDateString() : '—'}
        />
        <Stat
          label="Generated"
          value={new Date(data.sitemap.generatedAt).toLocaleTimeString()}
          hint="On every request"
        />
      </div>
      <Alert tone="info" title="Submitting the sitemap">
        The sitemap index is <FileLink href="/sitemap.xml">{data.sitemap.indexUrl}</FileLink> and robots.txt
        points to it. Search engines no longer accept “ping” requests, so nothing is sent from here: add the
        index once in Google Search Console and Bing Webmaster Tools and they re-read it on their own.{' '}
        {data.sitemap.indexNowEnabled
          ? 'IndexNow is on: Bing and other IndexNow engines are told about changed pages every 10 minutes.'
          : 'IndexNow (Crawlers & AI tab) can tell Bing about changed pages as they happen.'}
      </Alert>
      <fieldset className="cms-fieldset">
        <legend>Sitemap files</legend>
        <div className="seo-table-scroll">
          <table className="seo-groups-table">
            <caption className="visually-hidden">Sitemap groups</caption>
            <thead>
              <tr>
                <th scope="col">Sitemap</th>
                <th scope="col">Addresses</th>
                <th scope="col">Last change</th>
                <th scope="col">Change frequency</th>
                <th scope="col">Priority</th>
                <th scope="col">In the index</th>
              </tr>
            </thead>
            <tbody>
              {data.sitemap.groups.map((g) => {
                const d = draft.groupDefaults[g.name];
                const included = !draft.excludedGroups.includes(g.name);
                return (
                  <tr key={g.name}>
                    <th scope="row">
                      <span className="seo-cell">
                        <span>{g.label}</span>
                        <span className="text-small text-muted">
                          {g.files.length > 0
                            ? g.files.map((f) => (
                                <a
                                  key={f.name}
                                  href={`/sitemaps/${f.name}.xml`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {f.name}.xml{' '}
                                </a>
                              ))
                            : `${g.name}.xml (empty)`}
                        </span>
                      </span>
                    </th>
                    <td>
                      {g.urlCount}
                      {g.hiddenCount > 0 && (
                        <span className="text-small text-muted"> (+{g.hiddenCount} hidden)</span>
                      )}
                    </td>
                    <td>{g.lastModified ? <DateTime value={g.lastModified} /> : '—'}</td>
                    <td>
                      {g.kind === 'urls' ? (
                        <Select
                          aria-label={`Change frequency of ${g.label}`}
                          value={d?.changeFrequency ?? ''}
                          onChange={(e) => setDefaults(g.name, { changeFrequency: e.target.value || null })}
                          options={[
                            { value: '', label: 'Not set' },
                            ...data.sitemap.changeFrequencies.map((f) => ({ value: f, label: f })),
                          ]}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {g.kind === 'urls' ? (
                        <Select
                          aria-label={`Priority of ${g.label}`}
                          value={
                            d?.priority !== null && d?.priority !== undefined ? d.priority.toFixed(1) : ''
                          }
                          onChange={(e) =>
                            setDefaults(g.name, { priority: e.target.value ? Number(e.target.value) : null })
                          }
                          options={PRIORITIES.map((p) => ({ value: p, label: p || 'Not set' }))}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Switch
                        label={`List ${g.label} in sitemap.xml`}
                        hideLabel
                        checked={included}
                        onCheckedChange={(on) =>
                          setDraft({
                            ...draft,
                            excludedGroups: on
                              ? draft.excludedGroups.filter((x) => x !== g.name)
                              : [...draft.excludedGroups, g.name],
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-small text-muted">
          Change frequency and priority are hints that Google ignores; other search engines may use them. A
          group left out of the index keeps its pages indexable and in llms.txt.
        </p>
      </fieldset>
      <div className="cms-grid-2">
        <LinesField
          key={`extra-${version}`}
          label="Extra addresses"
          value={draft.extraPaths}
          onChange={(extraPaths) => setDraft({ ...draft, extraPaths })}
          error={errors.extraPaths ?? Object.entries(errors).find(([k]) => k.startsWith('extraPaths['))?.[1]}
          hint="Public pages the generator does not know about, one path per line (e.g. /webinar). Added to the pages sitemap."
        />
        <LinesField
          key={`excluded-${version}`}
          label="Excluded addresses"
          value={draft.excludedPaths}
          onChange={(excludedPaths) => setDraft({ ...draft, excludedPaths })}
          error={
            errors.excludedPaths ?? Object.entries(errors).find(([k]) => k.startsWith('excludedPaths['))?.[1]
          }
          hint="One path per line. Also set per address in the table below."
        />
      </div>
      <div className="cms-form__actions">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save sitemap settings
        </Button>
      </div>
      <SitemapUrls data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- llms.txt

interface LlmsDraft {
  summary: string;
  intro: string;
  includedSections: string[];
  customSections: LlmsCustomSection[];
  academyGuideEnabled: boolean;
}

export function LlmsTab() {
  const toast = useToast();
  const saved = useSaved();
  const query = useSeoFiles();
  const [draft, setDraft] = useState<LlmsDraft | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [file, setFile] = useState<'index' | 'academy'>('index');
  useEffect(() => {
    if (query.data && !draft) {
      const l = query.data.llms;
      setDraft({
        summary: l.summary ?? '',
        intro: l.intro ?? '',
        includedSections: l.sections.filter((s) => s.included).map((s) => s.key),
        customSections: l.customSections,
        academyGuideEnabled: l.academyGuideEnabled,
      });
    }
  }, [query.data, draft]);
  const preview = useQuery({
    queryKey: ['website', 'seo', 'llms-preview', file, query.data?.concurrencyStamp],
    queryFn: () => api.get<string>(`${W}/seo/files/llms/preview`, { query: { file } }),
    enabled: !!query.data,
  });
  const allSections = useMemo(() => query.data?.llms.sections ?? [], [query.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<SeoFiles>(`${W}/seo/files/llms`, {
        summary: draft!.summary || null,
        intro: draft!.intro || null,
        excludedSections: allSections.map((s) => s.key).filter((k) => !draft!.includedSections.includes(k)),
        customSections: draft!.customSections,
        academyGuideEnabled: draft!.academyGuideEnabled,
        concurrencyStamp: query.data!.concurrencyStamp,
      }),
    onSuccess: (data) => {
      saved(data);
      setErrors({});
      toast.success('llms.txt saved', 'The new version is served now.');
    },
    onError: (e) => {
      if (isApiError(e)) setErrors(toErrors(e.errors));
      toast.error(errorMessage(e));
    },
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!draft || !query.data) return <Skeleton height={420} />;
  const l = query.data.llms;

  return (
    <div className="seo-files">
      <div className="cms-form">
        {!l.enabled && (
          <Alert tone="warning" title="llms.txt is switched off">
            It answers 404 until “Publish llms.txt” is on in the Crawlers &amp; AI tab. You can still prepare
            it here.
          </Alert>
        )}
        <p className="text-muted">
          A Markdown guide to the site for AI assistants, generated from published pages.{' '}
          <FileLink href="/llms.txt">Open /llms.txt</FileLink> ·{' '}
          <FileLink href="/llms-full.txt">/llms-full.txt</FileLink>
        </p>
        <TextField
          label="Summary"
          value={draft.summary}
          onChange={(summary) => setDraft({ ...draft, summary })}
          placeholder={l.defaultSummary}
          error={errors.summary}
          hint="One line under the title. Empty: the default search description."
        />
        <AreaField
          label="Introduction"
          value={draft.intro}
          onChange={(intro) => setDraft({ ...draft, intro })}
          rows={8}
          error={errors.intro}
          hint={
            <>
              Empty: the generated introduction.{' '}
              <Button variant="link" size="sm" onClick={() => setDraft({ ...draft, intro: l.defaultIntro })}>
                Start from the generated text
              </Button>
            </>
          }
        />
        <MultiCheck
          legend="Generated sections"
          options={allSections.map((s) => ({ value: s.key, label: s.label }))}
          value={draft.includedSections}
          onChange={(includedSections) => setDraft({ ...draft, includedSections })}
          error={errors.excludedSections}
        />
        <ListEditor<LlmsCustomSection>
          legend="Your sections"
          items={draft.customSections}
          onChange={(customSections) => setDraft({ ...draft, customSections })}
          empty={{ title: '', body: '' }}
          addLabel="Add a section"
          render={(item, update, i) => (
            <div className="cms-stack">
              <TextField
                label="Heading"
                value={item.title}
                onChange={(title) => update({ ...item, title })}
                required
                error={errors[`customSections[${i}].title`]}
              />
              <AreaField
                label="Text (Markdown)"
                value={item.body}
                onChange={(body) => update({ ...item, body })}
                rows={4}
                required
                error={errors[`customSections[${i}].body`]}
              />
            </div>
          )}
        />
        <SwitchField
          label="Publish the academy guide (/llms/academy.txt)"
          checked={draft.academyGuideEnabled}
          onChange={(academyGuideEnabled) => setDraft({ ...draft, academyGuideEnabled })}
          description="Every course with its modules and a summary of each lesson, linked from llms.txt."
        />
        <div className="cms-form__actions">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save llms.txt
          </Button>
        </div>
      </div>
      <section className="seo-files__preview" aria-labelledby="llms-preview-title">
        <h2 id="llms-preview-title" className="seo-files__title">
          As served now
        </h2>
        <Select
          aria-label="File"
          value={file}
          onChange={(e) => setFile(e.target.value as 'index' | 'academy')}
          options={[
            { value: 'index', label: '/llms.txt' },
            { value: 'academy', label: '/llms/academy.txt' },
          ]}
        />
        {preview.isError ? (
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        ) : (
          // A scrollable preview must be focusable so keyboard users can scroll it.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          <pre className="seo-files__code" role="group" aria-label="llms.txt preview" tabIndex={0}>
            {preview.data ?? 'Loading…'}
          </pre>
        )}
        <p className="text-small text-muted">Save to update the preview.</p>
      </section>
    </div>
  );
}
