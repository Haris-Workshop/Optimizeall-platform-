import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, FormField, Input } from '@/components/ui';
import { isCredentialCode, lookupCertificateByCode } from '@/features/learning/api';
import { isApiError } from '@/lib/api/errors';
import { PageHero } from '../site/components';
import { useDocumentHead } from '../site/head';

/** The certificate id from what a visitor pasted: a bare id, or a full verification link (/verify/certificates/:id). */
export function certificateIdFrom(input: string): string {
  const value = input.trim();
  const match = /\/verify\/certificates\/([^/?#\s]+)/i.exec(value);
  if (match) return decodeURIComponent(match[1]);
  return value.replace(/[/?#\s]+/g, '');
}

/**
 * /verify: the front door for employers and clients. Paste a certificate's verification link or credential ID and open
 * its public verification page (/verify/certificates/:id). The hero explains; the form sits beside it as the focal panel.
 */
export function VerifyIndexPage() {
  useDocumentHead({
    title: 'Verify a certificate',
    description: 'Check an Optimize All Academy certificate: enter its credential ID or paste its verification link.',
  });
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (checking) return;
    const id = certificateIdFrom(value);
    if (!id) {
      setError('Enter the certificate’s ID or paste its verification link.');
      return;
    }
    setError(null);
    if (!isCredentialCode(id)) {
      navigate(`/verify/certificates/${encodeURIComponent(id)}`);
      return;
    }
    // A credential ID ("OA-XXXX-XXXX") is looked up here, so a typo shows a message next to the field instead of a
    // "not found" page, and a hit opens the certificate's own verification page.
    setChecking(true);
    try {
      const found = await lookupCertificateByCode(id);
      navigate(`/verify/certificates/${encodeURIComponent(found.id)}`);
    } catch (failure) {
      setError(
        isApiError(failure) && failure.status === 404
          ? 'We couldn’t find a certificate with that ID. Check it against the certificate and try again.'
          : 'We couldn’t check that right now. Please try again in a moment.',
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <PageHero
      breadcrumbs={[{ label: 'Verify a certificate' }]}
      eyebrow={
        <>
          <BadgeCheck aria-hidden="true" /> Certificate verification
        </>
      }
      title="Verify a certificate"
      lead="Every Optimize All Academy certificate has a public verification page. Enter its credential ID, or paste the link the holder shared, to see who earned it, for which course and whether it is still valid."
      actions={
        <p className="site-verify__note">
          Want one yourself? <Link to="/learn">Browse the free courses</Link>.
        </p>
      }
    >
      <div className="site-hero__panel site-verify">
        <span className="site-panel__icon" aria-hidden="true">
          <ShieldCheck />
        </span>
        <form onSubmit={(e) => void submit(e)} noValidate className="site-verify__form">
          <FormField label="Credential ID or verification link" error={error}>
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
          </FormField>
          <Button type="submit" size="lg" fullWidth loading={checking}>
            Verify certificate
          </Button>
        </form>
      </div>
    </PageHero>
  );
}
