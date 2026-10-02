import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { accessiblePortals } from '@/app/portals';
import { SecurityPage } from '@/features/participant/profile/SecurityPage';
import { meetsRequirement, Permissions } from '@/lib/auth/permissions';
import { useAuth } from '@/lib/auth/useAuth';

/** The participant portal keeps security under Profile; every other portal has /<portal>/account/security. */
export function accountSecurityPath(permissions: readonly string[], portalBasePath?: string): string {
  if (portalBasePath && portalBasePath !== '/app') return `${portalBasePath}/account/security`;
  if (meetsRequirement(permissions, { anyOf: [Permissions.ParticipantPortal] }))
    return '/app/profile/security';
  const first = accessiblePortals(permissions)[0];
  return first ? `${first.basePath}/account/security` : '/app/profile/security';
}

/**
 * Account security (password, two-step verification, Google) inside a staff or client portal: the same cards as the
 * participant's Profile → Security.
 */
export function AccountSecurityPage() {
  useEffect(() => {
    document.title = 'Account security · Optimize All';
  }, []);
  return (
    <>
      <PageHeader
        title="Account security"
        description="Your password, two-step verification and sign-in with Google. These settings belong to you, not to the portal."
      />
      <SecurityPage />
    </>
  );
}

/** `/account/security` (the link in security emails): sends the signed-in user to their portal's security page. */
export function AccountSecurityRedirect() {
  const { permissions } = useAuth();
  return <Navigate to={accountSecurityPath(permissions)} replace />;
}
