import { SecretClient } from '@azure/keyvault-secrets';
import { AuthService } from '../auth';
import { SecretSummary, VaultConfig } from '../models/types';

export class KeyVaultService {
  private clients = new Map<string, SecretClient>();

  constructor(private readonly auth: AuthService) {}

  private async getClient(vault: VaultConfig): Promise<SecretClient> {
    let client = this.clients.get(vault.vaultUri);
    if (!client) {
      const credential = await this.auth.getCredential(vault.tenantId);
      client = new SecretClient(vault.vaultUri, credential);
      this.clients.set(vault.vaultUri, client);
    }
    return client;
  }

  async listSecrets(vault: VaultConfig): Promise<SecretSummary[]> {
    const client = await this.getClient(vault);
    const secrets: SecretSummary[] = [];
    for await (const props of client.listPropertiesOfSecrets()) {
      secrets.push({
        name: props.name,
        enabled: props.enabled ?? true,
        contentType: props.contentType,
      });
    }
    return secrets.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Fetches the current value of a secret. Callers must never log or persist
   * the returned value — it only ever belongs in memory and, if the user
   * explicitly reveals or copies it, in the tree UI / OS clipboard.
   */
  async getSecretValue(vault: VaultConfig, secretName: string): Promise<string> {
    const client = await this.getClient(vault);
    const secret = await client.getSecret(secretName);
    if (secret.value === undefined) {
      throw new Error(`Secret "${secretName}" has no value (it may be disabled).`);
    }
    return secret.value;
  }

  /** Drops cached clients, e.g. after vault configuration changes. */
  clearClients(): void {
    this.clients.clear();
  }
}
