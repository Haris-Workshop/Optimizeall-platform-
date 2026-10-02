import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import type {
  AuthResponse,
  TwoFactorChallenge,
  TwoFactorEnrolledResponse,
  TwoFactorSetup,
} from '@/lib/api/types';
import { mapServerErrors, type MappedErrors } from '../formErrors';
import { AuthenticatorSetupView, CODE_PATTERN, CodeField, RecoveryCodesView } from './TwoFactorParts';
import './twoFactor.css';

export interface TwoFactorSignInStepProps {
  challenge: TwoFactorChallenge;
  /** The session, once the second step is done: the caller adopts it and navigates on. */
  onSignedIn: (session: AuthResponse) => void;
  /** Back to the first step (the challenge expired, or the person wants to start over). */
  onRestart: () => void;
}

/** Errors that end the challenge: the person has to sign in again. */
const RESTART_CODES = new Set(['auth.2fa_challenge_expired', 'account.suspended']);

function RestartAlert({ error, onRestart }: { error: MappedErrors['form']; onRestart: () => void }) {
  if (!error) return null;
  const restart = RESTART_CODES.has(error.code);
  return (
    <Alert
      tone={error.code === 'auth.2fa_locked' ? 'warning' : 'danger'}
      role="alert"
      title={
        restart
          ? 'Please sign in again'
          : error.code === 'auth.2fa_locked'
            ? 'Too many wrong codes'
            : 'That didn’t work'
      }
      actions={
        restart ? (
          <Button variant="secondary" onClick={onRestart}>
            Back to sign in
          </Button>
        ) : undefined
      }
    >
      {error.title}
    </Alert>
  );
}

/**
 * The second sign-in step after the password (or Google): enter the authenticator code, or a recovery code; or, when
 * the platform requires two-step verification for this staff account and it isn't set up, set it up now. Rendered by
 * the sign-in and Google callback pages in place of their form; the challenge token stays in memory only.
 */
export function TwoFactorSignInStep(props: TwoFactorSignInStepProps) {
  return props.challenge.kind === 'enroll' ? <EnrollStep {...props} /> : <VerifyStep {...props} />;
}

function VerifyStep({ challenge, onSignedIn, onRestart }: TwoFactorSignInStepProps) {
  const [mode, setMode] = useState<'app' | 'recovery'>('app');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [server, setServer] = useState<MappedErrors | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Two-step verification · Optimize All';
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (server?.form) alertRef.current?.focus();
  }, [server]);

  const fieldId = mode === 'app' ? 'tf-verify-code' : 'tf-verify-recovery';

  const switchMode = () => {
    setMode((m) => (m === 'app' ? 'recovery' : 'app'));
    setClientError(null);
    setServer(null);
    // Move focus to the field that just appeared.
    setTimeout(
      () => document.getElementById(mode === 'app' ? 'tf-verify-recovery' : 'tf-verify-code')?.focus(),
      0,
    );
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServer(null);
    const problem =
      mode === 'app'
        ? CODE_PATTERN.test(code)
          ? null
          : 'Enter the 6-digit code from your authenticator app.'
        : recoveryCode.replace(/[\s-]/g, '').length === 10
          ? null
          : 'Enter one of your recovery codes, like ABCDE-FGHJK.';
    setClientError(problem);
    if (problem) {
      document.getElementById(fieldId)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const session = await api.post<AuthResponse>(
        '/auth/2fa/verify',
        mode === 'app'
          ? { challengeToken: challenge.challengeToken, code }
          : { challengeToken: challenge.challengeToken, recoveryCode: recoveryCode.trim() },
      );
      onSignedIn(session);
    } catch (error) {
      const mapped = mapServerErrors(error, ['code', 'recoveryCode']);
      setServer(mapped);
      if (isApiError(error) && error.code === 'auth.2fa_invalid_code') {
        setCode('');
        setRecoveryCode('');
        document.getElementById(fieldId)?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__header">
        <h1 className="auth-page__title" ref={headingRef} tabIndex={-1}>
          Two-step verification
        </h1>
        <p className="auth-page__subtitle">
          {mode === 'app'
            ? 'Your password was right. To finish signing in, enter the code from your authenticator app.'
            : 'Enter one of the recovery codes you saved when you set up two-step verification. Each code works once.'}
        </p>
      </div>

      {server?.form && (
        <div ref={alertRef} tabIndex={-1}>
          <RestartAlert error={server.form} onRestart={onRestart} />
        </div>
      )}

      <form className="auth-form" onSubmit={onSubmit} noValidate aria-label="Two-step verification">
        {mode === 'app' ? (
          <CodeField
            id="tf-verify-code"
            value={code}
            onChange={setCode}
            error={clientError ?? server?.fields.code}
          />
        ) : (
          <FormField
            id="tf-verify-recovery"
            label="Recovery code"
            hint="Ten letters and numbers, for example ABCDE-FGHJK."
            error={clientError ?? server?.fields.recoveryCode}
            required
          >
            <Input
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              className="tf-key"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />
          </FormField>
        )}
        <Button type="submit" size="lg" fullWidth loading={submitting} leadingIcon={<ShieldCheck />}>
          Verify and sign in
        </Button>
      </form>

      <div className="stack">
        <Button
          variant="ghost"
          leadingIcon={mode === 'app' ? <KeyRound /> : <Smartphone />}
          onClick={switchMode}
        >
          {mode === 'app' ? 'Use a recovery code instead' : 'Use your authenticator app instead'}
        </Button>
        <p className="text-small text-muted">
          Lost your phone and your recovery codes? Contact support from the email address on your account;
          after a check, an administrator can reset two-step verification.{' '}
          <Button variant="link" onClick={onRestart}>
            Start over
          </Button>
        </p>
      </div>
    </div>
  );
}

type EnrollPhase =
  | { kind: 'loading' }
  | { kind: 'setup'; setup: TwoFactorSetup }
  | { kind: 'codes'; enrolled: TwoFactorEnrolledResponse }
  | { kind: 'error'; error: NonNullable<MappedErrors['form']> };

function EnrollStep({ challenge, onSignedIn, onRestart }: TwoFactorSignInStepProps) {
  const [phase, setPhase] = useState<EnrollPhase>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [server, setServer] = useState<MappedErrors | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requested = useRef(false);

  useEffect(() => {
    document.title = 'Set up two-step verification · Optimize All';
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    api
      .post<TwoFactorSetup>('/auth/2fa/enroll/setup', { challengeToken: challenge.challengeToken })
      .then((setup) => setPhase({ kind: 'setup', setup }))
      .catch((error: unknown) => {
        const form = mapServerErrors(error, []).form;
        if (form) setPhase({ kind: 'error', error: form });
      });
  }, [challenge.challengeToken]);

  useEffect(() => {
    if (phase.kind === 'codes') headingRef.current?.focus();
  }, [phase.kind]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServer(null);
    const problem = CODE_PATTERN.test(code) ? null : 'Enter the 6-digit code from your authenticator app.';
    setClientError(problem);
    if (problem) {
      document.getElementById('tf-enroll-code')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const enrolled = await api.post<TwoFactorEnrolledResponse>('/auth/2fa/enroll/confirm', {
        challengeToken: challenge.challengeToken,
        code,
      });
      setPhase({ kind: 'codes', enrolled });
    } catch (error) {
      setServer(mapServerErrors(error, ['code']));
      if (isApiError(error) && error.code === 'auth.2fa_invalid_code') {
        setCode('');
        document.getElementById('tf-enroll-code')?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (phase.kind === 'codes')
    return (
      <div className="auth-page">
        <div className="auth-page__header">
          <h1 className="auth-page__title" ref={headingRef} tabIndex={-1}>
            Save your recovery codes
          </h1>
          <p className="auth-page__subtitle">
            Two-step verification is on. If you lose your phone, each of these codes signs you in once. Store
            them somewhere safe, like a password manager; you won’t see them again.
          </p>
        </div>
        <RecoveryCodesView codes={phase.enrolled.recoveryCodes} />
        <Button size="lg" fullWidth onClick={() => onSignedIn(phase.enrolled.auth)}>
          I’ve saved my codes, continue
        </Button>
      </div>
    );

  return (
    <div className="auth-page">
      <div className="auth-page__header">
        <h1 className="auth-page__title" ref={headingRef} tabIndex={-1}>
          Set up two-step verification
        </h1>
        <p className="auth-page__subtitle">
          Your organisation requires two-step verification for staff accounts. Set it up now to finish signing
          in; it takes about a minute.
        </p>
      </div>

      {phase.kind === 'loading' && (
        <div role="status" aria-live="polite" className="cluster">
          <Spinner />
          <span>Preparing your set-up…</span>
        </div>
      )}
      {phase.kind === 'error' && <RestartAlert error={phase.error} onRestart={onRestart} />}
      {server?.form && <RestartAlert error={server.form} onRestart={onRestart} />}

      {phase.kind === 'setup' && (
        <>
          <AuthenticatorSetupView setup={phase.setup} />
          <form
            className="auth-form"
            onSubmit={onSubmit}
            noValidate
            aria-label="Confirm two-step verification"
          >
            <CodeField
              id="tf-enroll-code"
              value={code}
              onChange={setCode}
              error={clientError ?? server?.fields.code}
            />
            <Button type="submit" size="lg" fullWidth loading={submitting} leadingIcon={<ShieldCheck />}>
              Turn on and sign in
            </Button>
          </form>
        </>
      )}
      <p className="text-small text-muted">
        <Button variant="link" onClick={onRestart}>
          Back to sign in
        </Button>
      </p>
    </div>
  );
}
