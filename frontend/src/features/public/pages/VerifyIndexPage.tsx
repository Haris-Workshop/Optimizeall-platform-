import { BadgeCheck } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, FormField, Input } from '@/components/ui';
import '@/features/learning/learning.css';
import { Breadcrumbs } from '../site/components';
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
 * its public verification page (/verify/certificates/:id).
 */
export function VerifyIndexPage() {
  useDocumentHead({
    title: 'Verify a certificate',
    description: 'Check an Optimize All Academy certificate: enter its credential ID or paste its verification link.',
  });
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = certificateIdFrom(value);
    if (!id) {
      setError('Enter the certificate’s ID or paste its verification link.');
      return;
    }
    setError(null);
    navigate(`/verify/certificates/${encodeURIComponent(id)}`);
  };

  return (
    <div className="container lx-public lx-public--narrow">
      <Breadcrumbs items={[{ label: 'Verify a certificate' }]} />
      <Card as="section" aria-labelledby={titleId}>
        <CardBody>
          <p className="lx-cert-mini__kicker">
            <BadgeCheck aria-hidden="true" className="lx-inline-icon" /> Certificate verification
          </p>
          <h1 id={titleId} className="lx-verify__name">
            Verify a certificate
          </h1>
          <p className="lx-verify__lead">
            Every Optimize All Academy certificate has a public verification page. Enter its credential ID, or paste the link the holder shared, to see who earned it, for which course and
            whether it is still valid.
          </p>
          <form onSubmit={submit} noValidate className="stack">
            <FormField label="Credential ID or verification link" error={error}>
              <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
            </FormField>
            <div>
              <Button type="submit">Verify certificate</Button>
            </div>
          </form>
          <p className="text-small text-muted">
            Want one yourself? <Link to="/learn">Browse the free courses</Link>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
