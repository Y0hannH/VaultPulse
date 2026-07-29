import * as vscode from 'vscode';
import { AuthService } from './auth';
import { KeyVaultService } from './services/keyVaultService';
import { VaultTreeProvider } from './tree/vaultTreeProvider';
import { SecretTreeItem } from './tree/treeItems';
import { addVaultToWorkspace } from './config';
import { toFriendlyError } from './errors';
import { getOutputChannel, logError, showErrorWithDetails } from './output';
import { isGitRepo, isPathGitIgnored } from './gitignore';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[VaultPulse] Activating...');

  const authService = new AuthService();
  const keyVaultService = new KeyVaultService(authService);
  const treeProvider = new VaultTreeProvider(keyVaultService);
  const view = vscode.window.createTreeView('vaultpulse.vaultsView', {
    treeDataProvider: treeProvider,
  });

  context.subscriptions.push(
    view,
    getOutputChannel(),

    treeProvider.onDidChangeFilter(filterText => {
      view.description = filterText ? `Filter: "${filterText}"` : undefined;
    }),

    // Masking every revealed secret when VS Code loses focus (screen share,
    // alt-tab, lock screen) limits how long a plaintext value stays on screen.
    vscode.window.onDidChangeWindowState(state => {
      if (!state.focused) {
        treeProvider.hideAllRevealed();
      }
    }),

    // vaultpulse.openDocumentation ─────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.openDocumentation', async () => {
      const readmeUri = vscode.Uri.joinPath(context.extensionUri, 'README.md');
      await vscode.commands.executeCommand('markdown.showPreview', readmeUri);
    }),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('vaultpulse.vaults')) {
        keyVaultService.clearClients();
        treeProvider.refresh();
      }
    }),

    // vaultpulse.filter ────────────────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.filter', async () => {
      const value = await vscode.window.showInputBox({
        title: 'VaultPulse — Filter',
        prompt: 'Filter vaults by alias, or secrets already loaded this session by name',
        placeHolder: 'e.g. Client A, or a secret name',
        value: treeProvider.getFilter(),
      });
      if (value === undefined) return; // cancelled, keep the existing filter
      treeProvider.setFilter(value);
    }),

    // vaultpulse.clearFilter ───────────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.clearFilter', () => {
      treeProvider.setFilter('');
    }),

    // vaultpulse.addVault ──────────────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.addVault', async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('VaultPulse: Open a workspace folder first — vaults are stored in .vscode/settings.json.');
        return;
      }

      const alias = await vscode.window.showInputBox({
        title: 'VaultPulse — Add Vault',
        prompt: 'Display name for this vault',
        placeHolder: 'e.g. Client A - Prod',
        validateInput: v => v.trim().length > 0 ? null : 'Alias cannot be empty',
      });
      if (!alias) return;

      const vaultUri = await vscode.window.showInputBox({
        title: 'VaultPulse — Add Vault',
        prompt: 'Key Vault URI',
        placeHolder: 'https://my-vault.vault.azure.net',
        validateInput: v => {
          try {
            const url = new URL(v);
            return url.protocol === 'https:' ? null : 'URI must use https';
          } catch {
            return 'Enter a valid URI, e.g. https://my-vault.vault.azure.net';
          }
        },
      });
      if (!vaultUri) return;

      const tenantIdRaw = await vscode.window.showInputBox({
        title: 'VaultPulse — Add Vault',
        prompt: 'Azure AD Tenant ID (optional — press Enter to skip)',
        placeHolder: 'Leave empty to use your default Azure account',
        validateInput: v => {
          if (!v) return null;
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
            ? null
            : 'Enter a valid tenant GUID, or leave empty';
        },
      });
      const tenantId = tenantIdRaw?.trim() || undefined;

      try {
        await addVaultToWorkspace({
          alias: alias.trim(),
          vaultUri: vaultUri.trim().replace(/\/$/, ''),
          ...(tenantId ? { tenantId } : {}),
        });
        treeProvider.refresh();
        void warnIfSettingsNotGitIgnored();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`VaultPulse: ${msg}`);
      }
    }),

    // vaultpulse.refresh ───────────────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.refresh', () => {
      treeProvider.refresh();
    }),

    // vaultpulse.revealSecret ──────────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.revealSecret', async (item: SecretTreeItem) => {
      if (!(item instanceof SecretTreeItem)) return;
      try {
        const value = await keyVaultService.getSecretValue(item.vault, item.secretName);
        treeProvider.revealSecret(item, value);
      } catch (err) {
        // Safe to log in full: getSecretValue throws before returning anything
        // on failure, so err never carries the secret payload.
        logError(`revealSecret failed for "${item.secretName}" in "${item.vault.alias}"`, err);
        const friendly = toFriendlyError(err, { vaultAlias: item.vault.alias, vaultUri: item.vault.vaultUri });
        showErrorWithDetails(`${friendly.message} ${friendly.detail ?? ''}`.trim());
      }
    }),

    // vaultpulse.hideSecret ────────────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.hideSecret', (item: SecretTreeItem) => {
      if (!(item instanceof SecretTreeItem)) return;
      treeProvider.hideSecret(item);
    }),

    // vaultpulse.copySecret ────────────────────────────────────────────────
    vscode.commands.registerCommand('vaultpulse.copySecret', async (item: SecretTreeItem) => {
      if (!(item instanceof SecretTreeItem)) return;
      try {
        const value = item.isRevealed && item.revealedValue !== undefined
          ? item.revealedValue
          : await keyVaultService.getSecretValue(item.vault, item.secretName);
        await vscode.env.clipboard.writeText(value);
        vscode.window.showInformationMessage(`VaultPulse: "${item.secretName}" copied to clipboard.`);
      } catch (err) {
        logError(`copySecret failed for "${item.secretName}" in "${item.vault.alias}"`, err);
        const friendly = toFriendlyError(err, { vaultAlias: item.vault.alias, vaultUri: item.vault.vaultUri });
        showErrorWithDetails(`${friendly.message} ${friendly.detail ?? ''}`.trim());
      }
    }),
  );
}

/**
 * Warns once, right after a vault is added, if .vscode/settings.json — which
 * now carries this vault's alias/URI — is tracked by git and not ignored.
 * Silent if the workspace isn't a git repo, or git isn't available: we only
 * want to speak up when we're sure there's something to flag.
 */
async function warnIfSettingsNotGitIgnored(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root || !isGitRepo(root)) return;

  const ignored = await isPathGitIgnored(root, '.vscode/settings.json');
  if (ignored === false) {
    vscode.window.showWarningMessage(
      'VaultPulse: .vscode/settings.json is tracked by git and now contains this vault\'s alias/URI. If this repo is shared beyond people who should know your client/vault list, consider adding it to .gitignore.',
    );
  }
}

export function deactivate(): void {}
