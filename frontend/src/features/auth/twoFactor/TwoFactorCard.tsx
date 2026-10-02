import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DateTime } from '@/components/ui/DateTime';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toastContext';
import { api } from '@/lib/api/client';
import type { RecoveryCodesResponse, TwoFactorSetup, TwoFactorStatus } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/useAuth';
import { mapServerErrors } from '../formErrors';
import { AuthenticatorSetupView, CODE_PATTERN, CodeField, RecoveryCodesView } from './TwoFactorParts';
import './twoFactor.css';

export const twoFactorStatusQueryKey = ['auth', 'two-factor'] as const;

const CODE_MESSAGE = 'Enter the 6-digit code from your authenticator app.';

/** Set-up in a dialog: QR code and key, confirm with a code, then the recovery codes (shown once). */
function SetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  // A new secret is created once per opening (a mutation: it must never re-run on its own like a query refetch).
  const setup = useMutation({ mutationFn: () => api.post<TwoFactorSetup>('/auth/2fa/setup') });
  const startSetup = setup.mutate;
  useEffect(() => {
    if (open) startSetup();
  }, [open, startSetup]);

  const confirm = useMutation({
    mutationFn: () => api.post<RecoveryCodesResponse>('/auth/2fa/confirm', { code }),
    onSuccess: async (response) => {
      setCodes(response.recoveryCodes);
      toast.success('Two-step verification is on', 'You’ll be asked for a code each time you sign in.');
      await queryClient.invalidateQueries({ queryKey: twoFactorStatusQueryKey });
    },
    onError: () => {
      setCode('');
      document.getElementById('tf-setup-code')?.focus();
    },
  });

  const close = () => {
    setCode('');
    setClientError(null);
    setCodes(null);
    confirm.reset();
    setup.reset();
    onClose();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const problem = CODE_PATTERN.test(code) ? null : CODE_MESSAGE;
    setClientError(problem);
    if (problem) {
      document.getElementById('tf-setup-code')?.focus();
      return;
    }
    confirm.mutate();
  };

  const server = confirm.isError ? mapServerErrors(confirm.error, ['code']) : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      icon={<ShieldCheck />}
      dismissible={!confirm.isPending}
      title={codes ? 'Save your recovery codes' : 'Set up two-step verification'}
      description={
        codes
          ? 'If you lose your phone, each code signs you in once. Store them somewhere safe; you won’t see them again.'
          : 'Add Optimize All to an authenticator app on your phone, then enter the code it shows.'
      }
      footer={
        codes ? (
          <Button onClick={close}>I’ve saved my codes</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={confirm.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="tf-setup-form" loading={confirm.isPending} disabled={!setup.data}>
              Turn on
            </Button>
          </>
        )
      }
    >
      {codes ? (
        <RecoveryCodesView codes={codes} />
      ) : setup.isPending || setup.isIdle ? (
        <div role="status" className="cluster">
          <Spinner />
          <span>Preparing your set-up…</span>
        </div>
      ) : setup.isError ? (
        <Alert tone="danger" role="alert">
          {mapServerErrors(setup.error, []).form?.title ?? 'Couldn’t start the set-up. Please try again.'}
        </Alert>
      ) : (
        <div className="stack">
          {setup.data && <AuthenticatorSetupView setup={setup.data} />}
          <form
            id="tf-setup-form"
            className="stack"
            onSubmit={onSubmit}
            noValidate
            aria-label="Confirm the code"
          >
            {server?.form && (
              <Alert tone="danger" role="alert">
                {server.form.title}
              </Alert>
            )}
            <CodeField
              id="tf-setup-code"
              value={code}
              onChange={setCode}
              error={clientError ?? server?.fields.code}
            />
          </form>
        </div>
      )}
    </Dialog>
  );
}

/** New recovery codes: needs a current code; shows the new set once. */
function RegenerateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const regenerate = useMutation({
    mutationFn: () => api.post<RecoveryCodesResponse>('/auth/2fa/recovery-codes', { code }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: twoFactorStatusQueryKey }),
    onError: () => setCode(''),
  });
  const close = () => {
    setCode('');
    setClientError(null);
    regenerate.reset();
    onClose();
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const problem = CODE_PATTERN.test(code) ? null : CODE_MESSAGE;
    setClientError(problem);
    if (problem) document.getElementById('tf-regenerate-code')?.focus();
    else regenerate.mutate();
  };
  const server = regenerate.isError ? mapServerErrors(regenerate.error, ['code']) : null;
  const codes = regenerate.data?.recoveryCodes;

  return (
    <Dialog
      open={open}
      onClose={close}
      icon={<RefreshCw />}
      dismissible={!regenerate.isPending}
      title={codes ? 'Your new recovery codes' : 'Create new recovery codes'}
      description={
        codes
          ? 'Your old codes no longer work. Store these somewhere safe; you won’t see them again.'
          : 'Your current recovery codes stop working as soon as the new ones are created.'
      }
      footer={
        codes ? (
          <Button onClick={close}>I’ve saved my codes</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={regenerate.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="tf-regenerate-form" loading={regenerate.isPending}>
              Create new codes
            </Button>
          </>
        )
      }
    >
      {codes ? (
        <RecoveryCodesView codes={codes} />
      ) : (
        <form
          id="tf-regenerate-form"
          className="stack"
          onSubmit={onSubmit}
          noValidate
          aria-label="Confirm with a code"
        >
          {server?.form && (
            <Alert tone="danger" role="alert">
              {server.form.title}
            </Alert>
          )}
          <CodeField
            id="tf-regenerate-code"
            value={code}
            onChange={setCode}
            error={clientError ?? server?.fields.code}
          />
        </form>
      )}
    </Dialog>
  );
}

/** Turning it off: password (when the account has one) plus an app code or a recovery code. */
function DisableDialog({
  open,
  onClose,
  hasPassword,
}: {
  open: boolean;
  onClose: () => void;
  hasPassword: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const disable = useMutation({
    mutationFn: () =>
      api.post<void>('/auth/2fa/disable', {
        password: hasPassword ? password : undefined,
        ...(useRecovery ? { recoveryCode: recoveryCode.trim() } : { code }),
      }),
    onSuccess: async () => {
      toast.success('Two-step verification is off', 'Signing in now only needs your password or Google.');
      await queryClient.invalidateQueries({ queryKey: twoFactorStatusQueryKey });
      close();
    },
    onError: () => {
      setCode('');
      setRecoveryCode('');
    },
  });
  const close = () => {
    setPassword('');
    setCode('');
    setRecoveryCode('');
    setUseRecovery(false);
    setClientErrors({});
    disable.reset();
    onClose();
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (hasPassword && !password) found.password = 'Enter your password.';
    if (!useRecovery && !CODE_PATTERN.test(code)) found.code = CODE_MESSAGE;
    if (useRecovery && recoveryCode.replace(/[\s-]/g, '').length !== 10)
      found.recoveryCode = 'Enter one of your recovery codes, like ABCDE-FGHJK.';
    setClientErrors(found);
    const first = ['password', 'code', 'recoveryCode'].find((k) => found[k]);
    if (first) document.getElementById(`tf-disable-${first}`)?.focus();
    else disable.mutate();
  };
  const server = disable.isError
    ? mapServerErrors(disable.error, ['password', 'code', 'recoveryCode'])
    : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      icon={<ShieldOff />}
      tone="danger"
      dismissible={!disable.isPending}
      title="Turn off two-step verification?"
      description="Your account will be protected by your password (or Google) only. Your recovery codes stop working."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={disable.isPending}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form="tf-disable-form" loading={disable.isPending}>
            Turn off
          </Button>
        </>
      }
    >
      <form
        id="tf-disable-form"
        className="stack"
        onSubmit={onSubmit}
        noValidate
        aria-label="Confirm turning it off"
      >
        {server?.form && (
          <Alert tone="danger" role="alert">
            {server.form.title}
          </Alert>
        )}
        {hasPassword && (
          <FormField
            id="tf-disable-password"
            label="Password"
            required
            error={clientErrors.password ?? server?.fields.password}
          >
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
        )}
        {useRecovery ? (
          <FormField
            id="tf-disable-recoveryCode"
            label="Recovery code"
            required
            error={clientErrors.recoveryCode ?? server?.fields.recoveryCode}
          >
            <Input
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
              className="tf-key"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />
          </FormField>
        ) : (
          <CodeField
            id="tf-disable-code"
            value={code}
            onChange={setCode}
            error={clientErrors.code ?? server?.fields.code}
          />
        )}
        <div>
          <Button variant="link" onClick={() => setUseRecovery((v) => !v)}>
            {useRecovery ? 'Use your authenticator app instead' : 'Use a recovery code instead'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Account security → two-step verification: turn it on (authenticator app), create new recovery codes, turn it off.
 * When the platform requires it for staff, turning it off isn't offered. While impersonating, it is read-only (the
 * API refuses changes too: it is the account owner's credential).
 */
export function TwoFactorCard() {
  const { impersonation } = useAuth();
  const [dialog, setDialog] = useState<'setup' | 'regenerate' | 'disable' | null>(null);
  const status = useQuery({
    queryKey: twoFactorStatusQueryKey,
    queryFn: () => api.get<TwoFactorStatus>('/auth/2fa'),
  });
  const data = status.data;
  const readOnly = !!impersonation;

  return (
    <Card as="section" aria-labelledby="two-factor-title">
      <CardHeader
        titleId="two-factor-title"
        title="Two-step verification"
        description="Protect your account with a code from an authenticator app on your phone, asked for each time you sign in after your password or Google."
      />
      <CardBody className="stack">
        {status.isPending ? (
          <div role="status" className="cluster">
            <Spinner />
            <span>Loading…</span>
          </div>
        ) : status.isError || !data ? (
          <Alert
            tone="danger"
            role="alert"
            actions={
              <Button variant="secondary" onClick={() => void status.refetch()}>
                Try again
              </Button>
            }
          >
            Couldn’t load your two-step verification settings.
          </Alert>
        ) : data.enabled ? (
          <>
            <div className="tf-status">
              <Badge tone="success" dot>
                On
              </Badge>
              <span className="text-small text-muted">
                Since <DateTime value={data.enabledAt} format="date" />
                {data.lastUsedAt && (
                  <>
                    {' '}
                    · last used <DateTime value={data.lastUsedAt} format="relative" />
                  </>
                )}
              </span>
            </div>
            {data.recoveryCodesRemaining <= 3 ? (
              <Alert tone="warning" title={`${data.recoveryCodesRemaining} recovery codes left`}>
                Create a new set so you can still sign in if you lose your phone.
              </Alert>
            ) : (
              <p className="text-small">
                <KeyRound aria-hidden="true" size={16} /> {data.recoveryCodesRemaining} of 10 recovery codes
                unused.
              </p>
            )}
            {data.required && (
              <Alert tone="info" title="Required for your account">
                Your organisation requires two-step verification for staff accounts, so it can’t be turned
                off. If you change phones, set up the new one before resetting the old one, or ask an
                administrator to reset it.
              </Alert>
            )}
            {readOnly ? (
              <p className="text-small text-muted">
                You’re viewing as this user: two-step verification can’t be changed.
              </p>
            ) : (
              <div className="cluster">
                <Button
                  variant="secondary"
                  leadingIcon={<RefreshCw />}
                  onClick={() => setDialog('regenerate')}
                >
                  Create new recovery codes
                </Button>
                {!data.required && (
                  <Button
                    variant="secondary"
                    leadingIcon={<ShieldOff />}
                    onClick={() => setDialog('disable')}
                  >
                    Turn off
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="tf-status">
              <Badge tone="neutral">Off</Badge>
              {data.required && (
                <span className="text-small">Required for staff accounts: set it up to keep signing in.</span>
              )}
            </div>
            {readOnly ? (
              <p className="text-small text-muted">
                You’re viewing as this user: two-step verification can’t be changed.
              </p>
            ) : (
              <div>
                <Button leadingIcon={<ShieldCheck />} onClick={() => setDialog('setup')}>
                  Set up two-step verification
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
      <SetupDialog open={dialog === 'setup'} onClose={() => setDialog(null)} />
      <RegenerateDialog open={dialog === 'regenerate'} onClose={() => setDialog(null)} />
      <DisableDialog
        open={dialog === 'disable'}
        onClose={() => setDialog(null)}
        hasPassword={data?.hasPassword ?? true}
      />
    </Card>
  );
}
