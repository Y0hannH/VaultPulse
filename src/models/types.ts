export interface VaultConfig {
  alias: string;
  vaultUri: string;
  /** Azure AD tenant ID, only needed when it differs from your default signed-in account/tenant. */
  tenantId?: string;
}

export interface SecretSummary {
  name: string;
  enabled: boolean;
  contentType?: string;
}
