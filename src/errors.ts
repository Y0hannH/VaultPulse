export interface FriendlyError {
  message: string;
  detail?: string;
}

interface VaultErrorContext {
  vaultAlias: string;
  vaultUri: string;
}

const CONSENT_MARKERS = ['aadsts65001', 'aadsts53003', 'interaction_required'];
const CANCELLED_MARKERS = ['cancel', 'user closed', 'user aborted', 'timed out waiting'];

/**
 * Maps Azure Identity / Key Vault SDK errors to a message a non-Azure-expert
 * consultant can act on, distinguishing RBAC vs Access Policies denials since
 * their remediation differs.
 */
export function toFriendlyError(err: unknown, context: VaultErrorContext): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  const statusCode = (err as { statusCode?: number })?.statusCode;

  if (CONSENT_MARKERS.some(marker => lower.includes(marker))) {
    return {
      message: `VaultPulse: Azure sign-in needs a fresh consent for "${context.vaultAlias}".`,
      detail: 'Your Azure session does not cover the https://vault.azure.net/.default scope yet. Ask your tenant admin to grant consent, then retry — VaultPulse will reopen the sign-in browser tab.',
    };
  }

  if (CANCELLED_MARKERS.some(marker => lower.includes(marker))) {
    return {
      message: `VaultPulse: Sign-in was cancelled for "${context.vaultAlias}".`,
      detail: 'The browser sign-in tab was closed before completing. Use VaultPulse: Refresh to try again.',
    };
  }

  if (statusCode === 403) {
    const isRbacDenial = lower.includes('does not have authorization to perform action') || lower.includes('microsoft.keyvault');
    if (isRbacDenial) {
      return {
        message: `VaultPulse: Access denied on "${context.vaultAlias}" (Azure RBAC).`,
        detail: `This vault uses Azure RBAC authorization. Ask an owner to assign you the "Key Vault Secrets User" role on ${context.vaultUri}.`,
      };
    }
    return {
      message: `VaultPulse: Access denied on "${context.vaultAlias}" (Access Policies).`,
      detail: `This vault uses legacy Access Policies. Ask an owner to add a policy granting "Get" and "List" secret permissions on ${context.vaultUri}.`,
    };
  }

  if (statusCode === 401) {
    return {
      message: `VaultPulse: Not authenticated for "${context.vaultAlias}".`,
      detail: 'Your Azure session may not cover this vault\'s tenant. If the vault belongs to a different Azure AD tenant, re-add it via VaultPulse: Add Vault with the correct Tenant ID, then retry.',
    };
  }

  if (statusCode === 404) {
    return {
      message: `VaultPulse: Vault or secret not found for "${context.vaultAlias}".`,
      detail: `Double-check the vault URI (${context.vaultUri}) — it may be mistyped, deleted, or in a different tenant/subscription.`,
    };
  }

  return {
    message: `VaultPulse: Failed to reach "${context.vaultAlias}".`,
    detail: raw,
  };
}
