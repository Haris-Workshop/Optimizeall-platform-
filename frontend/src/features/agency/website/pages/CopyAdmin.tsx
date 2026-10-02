import { PageHeader } from '@/components/ui';
import { CopyEditor } from '@/features/admin/content/CopyEditor';
import '@/features/admin/admin.css';

/** The public page that shows each group's texts. */
const PREVIEW_PATHS: Record<string, string> = {
  home: '/',
  shared: '/',
  services: '/services',
  pricing: '/pricing',
  industries: '/industries',
  agencyPages: '/services',
  partners: '/partners',
  blog: '/blog',
  company: '/team',
  forms: '/contact',
  creators: '/creators',
  academy: '/learn',
};

/** Agency → Website → Page texts: headlines, introductions, buttons and lists of every built-in website page. */
export function SiteCopyPage() {
  return (
    <div className="stack">
      <PageHeader
        title="Page texts"
        description="The wording of the built-in website pages — home, services, pricing, industries, case studies, blog, team, careers, the contact and booking forms and the creators page. Navigation, footer links and contact details live in Site settings; content pages in Pages."
      />
      <CopyEditor
        endpoint="/agency/website/copy"
        title="Website texts"
        description="Pick a page, change its texts and save. Reset a text to go back to the original wording. Changes go live immediately and are recorded in the audit log."
        previewPaths={PREVIEW_PATHS}
      />
    </div>
  );
}
