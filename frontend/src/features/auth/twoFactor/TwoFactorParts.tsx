import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CopyField } from '@/components/ui/CopyField';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import type { TwoFactorSetup } from '@/lib/api/types';
import { QrCode } from '@/lib/qr/QrCode';
import './twoFactor.css';

/** Digits only, at most six: what the authenticator app shows (spaces and dashes typed by habit are dropped). */
export function cleanCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export const CODE_PATTERN = /^\d{6}$/;

export interface CodeFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | string[] | null;
  label?: string;
  hint?: string;
}

/** The 6-digit code input: numeric keyboard on phones and one-time-code autofill (SMS-style) where supported. */
export function CodeField({
  id,
  value,
  onChange,
  error,
  label = 'Authentication code',
  hint = 'The 6-digit code from your authenticator app. It changes every 30 seconds.',
}: CodeFieldProps) {
  return (
    <FormField id={id} label={label} hint={hint} error={error} required className="tf-code-input">
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(cleanCode(e.target.value))}
      />
    </FormField>
  );
}

/** QR code plus the same secret for typing in by hand, with numbered steps. */
export function AuthenticatorSetupView({ setup }: { setup: TwoFactorSetup }) {
  return (
    <div className="tf-setup">
      <div className="tf-setup__qr">
        <QrCode
          value={setup.otpAuthUri}
          size={176}
          label={`QR code to add ${setup.issuer} (${setup.accountName}) to your authenticator app`}
        />
      </div>
      <div className="stack">
        <ol className="tf-setup__steps">
          <li>
            Open an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator,
            1Password or Authy.
          </li>
          <li>Scan the QR code, or add an account by hand with the key below (time-based).</li>
          <li>Enter the 6-digit code the app shows to finish.</li>
        </ol>
        <CopyField label="Key for manual entry" value={setup.secret} className="tf-key" />
        <p className="text-small text-muted">
          Account: {setup.accountName} · Issuer: {setup.issuer}
        </p>
      </div>
    </div>
  );
}

/** The recovery codes, shown once, with copy and download (a plain text file). */
export function RecoveryCodesView({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `Optimize All recovery codes\nEach code signs you in once if you can't use your authenticator app.\n\n${codes.join('\n')}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'optimize-all-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <ol className="tf-codes" aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="cluster">
        <Button variant="secondary" leadingIcon={copied ? <Check /> : <Copy />} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button variant="secondary" leadingIcon={<Download />} onClick={download}>
          Download as text
        </Button>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Recovery codes copied to the clipboard' : ''}
      </span>
    </div>
  );
}
