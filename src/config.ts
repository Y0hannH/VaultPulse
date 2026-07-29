import * as vscode from 'vscode';
import { VaultConfig } from './models/types';

const SECTION = 'vaultpulse';
const KEY = 'vaults';

export function getConfiguredVaults(): VaultConfig[] {
  const raw = vscode.workspace.getConfiguration(SECTION).get<VaultConfig[]>(KEY, []);
  return raw.filter(v => v && typeof v.alias === 'string' && typeof v.vaultUri === 'string');
}

export async function addVaultToWorkspace(vault: VaultConfig): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  const current = config.get<VaultConfig[]>(KEY, []);

  if (current.some(v => v.vaultUri.toLowerCase() === vault.vaultUri.toLowerCase())) {
    throw new Error(`A vault with URI ${vault.vaultUri} is already configured.`);
  }

  await config.update(KEY, [...current, vault], vscode.ConfigurationTarget.Workspace);
}
