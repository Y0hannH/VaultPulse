import * as vscode from 'vscode';
import { KeyVaultService } from '../services/keyVaultService';
import { getConfiguredVaults } from '../config';
import { toFriendlyError } from '../errors';
import { logError, showErrorWithDetails } from '../output';
import { VaultConfig } from '../models/types';
import { VaultTreeItem, SecretTreeItem, VaultPulseItem } from './treeItems';

/** A revealed secret auto-hides after this long, limiting how long it sits in plain text. */
const AUTO_HIDE_MS = 30_000;

export class VaultTreeProvider implements vscode.TreeDataProvider<VaultPulseItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<VaultPulseItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _onDidChangeFilter = new vscode.EventEmitter<string>();
  readonly onDidChangeFilter = this._onDidChangeFilter.event;

  /** vaultUri -> loaded secret items, populated lazily on first expand. */
  private secretsByVault = new Map<string, SecretTreeItem[]>();

  /** Pending auto-hide timers, keyed by the revealed SecretTreeItem. */
  private revealTimers = new Map<SecretTreeItem, ReturnType<typeof setTimeout>>();

  /** Lowercased filter text; empty means "no filter". */
  private filterText = '';

  constructor(private readonly keyVault: KeyVaultService) {}

  /** Clears the cached secret list for one vault, or every vault if omitted. */
  refresh(vaultUri?: string): void {
    if (vaultUri) {
      this.clearAutoHideTimers(this.secretsByVault.get(vaultUri));
      this.secretsByVault.delete(vaultUri);
    } else {
      for (const items of this.secretsByVault.values()) {
        this.clearAutoHideTimers(items);
      }
      this.secretsByVault.clear();
    }
    this._onDidChangeTreeData.fire();
  }

  /** Repaints a single tree item in place (e.g. after reveal/hide). */
  refreshItem(item: VaultPulseItem): void {
    this._onDidChangeTreeData.fire(item);
  }

  /** Reveals a secret's value and schedules it to auto-hide after AUTO_HIDE_MS. */
  revealSecret(item: SecretTreeItem, value: string): void {
    item.setRevealed(value);
    this.clearAutoHideTimer(item);
    this.revealTimers.set(item, setTimeout(() => this.hideSecret(item), AUTO_HIDE_MS));
    this.refreshItem(item);
  }

  /** Masks a secret's value again and cancels its pending auto-hide timer, if any. */
  hideSecret(item: SecretTreeItem): void {
    this.clearAutoHideTimer(item);
    item.setRevealed(undefined);
    this.refreshItem(item);
  }

  /** Masks every currently revealed secret, e.g. when the VS Code window loses focus. */
  hideAllRevealed(): void {
    for (const item of [...this.revealTimers.keys()]) {
      this.hideSecret(item);
    }
  }

  private clearAutoHideTimer(item: SecretTreeItem): void {
    const timer = this.revealTimers.get(item);
    if (timer) {
      clearTimeout(timer);
      this.revealTimers.delete(item);
    }
  }

  private clearAutoHideTimers(items: SecretTreeItem[] | undefined): void {
    items?.forEach(item => this.clearAutoHideTimer(item));
  }

  /**
   * Filters vaults by alias, and secrets of vaults already loaded in this
   * session by name. Never triggers a Key Vault call — vaults that haven't
   * been expanded yet are only matched on alias.
   */
  setFilter(text: string): void {
    this.filterText = text.trim().toLowerCase();
    void vscode.commands.executeCommand('setContext', 'vaultpulse.filterActive', this.filterText.length > 0);
    this._onDidChangeFilter.fire(this.filterText);
    this._onDidChangeTreeData.fire();
  }

  getFilter(): string {
    return this.filterText;
  }

  getTreeItem(element: VaultPulseItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VaultPulseItem): Promise<VaultPulseItem[]> {
    if (!element) {
      const vaults = getConfiguredVaults();
      const visible = this.filterText ? vaults.filter(v => this.vaultMatchesFilter(v)) : vaults;
      return visible.map(v => new VaultTreeItem(v));
    }

    if (element instanceof VaultTreeItem) {
      return this.loadSecrets(element);
    }

    return [];
  }

  private vaultMatchesFilter(vault: VaultConfig): boolean {
    if (vault.alias.toLowerCase().includes(this.filterText)) {
      return true;
    }
    const cached = this.secretsByVault.get(vault.vaultUri);
    return cached?.some(s => s.secretName.toLowerCase().includes(this.filterText)) ?? false;
  }

  private async loadSecrets(vaultItem: VaultTreeItem): Promise<SecretTreeItem[]> {
    const { vault } = vaultItem;
    let items = this.secretsByVault.get(vault.vaultUri);

    if (!items) {
      try {
        const summaries = await this.keyVault.listSecrets(vault);
        items = summaries.map(s => new SecretTreeItem(vault, s.name));
        this.secretsByVault.set(vault.vaultUri, items);
      } catch (err) {
        // Safe to log in full: these are auth/network failures raised before any
        // secret value is fetched, never the secret payload itself.
        logError(`listSecrets failed for "${vault.alias}" (${vault.vaultUri})`, err);
        const friendly = toFriendlyError(err, { vaultAlias: vault.alias, vaultUri: vault.vaultUri });
        showErrorWithDetails(`${friendly.message} ${friendly.detail ?? ''}`.trim());
        return [];
      }
    }

    // Alias already matched the filter (or there's no filter): show every secret.
    // Otherwise the vault only qualified via a secret match — show just those.
    if (this.filterText && !vault.alias.toLowerCase().includes(this.filterText)) {
      return items.filter(s => s.secretName.toLowerCase().includes(this.filterText));
    }
    return items;
  }
}
