import * as vscode from 'vscode';
import { VaultConfig } from '../models/types';

export class VaultTreeItem extends vscode.TreeItem {
  readonly kind = 'vault' as const;

  constructor(public readonly vault: VaultConfig) {
    super(vault.alias, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = vault.vaultUri.replace(/^https:\/\//, '');
    this.tooltip = vault.tenantId ? `${vault.vaultUri}\nTenant: ${vault.tenantId}` : vault.vaultUri;
    this.iconPath = new vscode.ThemeIcon('key');
    this.contextValue = 'vault';
  }
}

export class SecretTreeItem extends vscode.TreeItem {
  readonly kind = 'secret' as const;
  private _revealedValue: string | undefined;

  constructor(
    public readonly vault: VaultConfig,
    public readonly secretName: string,
  ) {
    super(secretName, vscode.TreeItemCollapsibleState.None);
    this.setRevealed(undefined);
  }

  get isRevealed(): boolean {
    return this._revealedValue !== undefined;
  }

  get revealedValue(): string | undefined {
    return this._revealedValue;
  }

  /** Pass a value to reveal it in the tree, or undefined to mask it again. */
  setRevealed(value: string | undefined): void {
    this._revealedValue = value;
    if (value === undefined) {
      this.description = '••••••••';
      this.tooltip = 'Value hidden — click the eye icon to reveal';
      this.iconPath = new vscode.ThemeIcon('eye-closed');
      this.contextValue = 'secret-hidden';
    } else {
      this.description = value;
      this.tooltip = 'Value revealed — click the eye icon to hide';
      this.iconPath = new vscode.ThemeIcon('eye');
      this.contextValue = 'secret-revealed';
    }
  }
}

export type VaultPulseItem = VaultTreeItem | SecretTreeItem;
