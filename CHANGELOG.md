# Changelog

All notable changes to VaultPulse are documented here.

## [0.1.0] - Unreleased

### Added
- Initial release: read-only Azure Key Vault secrets viewer
- TreeView listing configured vaults and their secrets
- Reveal / hide secret values on demand (masked by default)
- Copy secret value to clipboard
- Multi-vault, multi-tenant support via `vaultpulse.vaults` workspace setting, with optional per-vault `tenantId`
- Authentication with silent Azure CLI session first, automatic interactive browser sign-in fallback — no manual `az login` required
- Dedicated `VaultPulse` output channel + "Show Details" action on error notifications for full diagnostics
- Friendly error messages distinguishing Azure RBAC vs Access Policies authorization failures, sign-in cancellation, and consent-required cases
- Filter the tree by vault alias, or by secret name for vaults already expanded this session (no extra Azure calls)
- `VaultPulse: Open Documentation` command opening the README via VS Code's built-in Markdown Preview (no custom webview)

### Fixed
- Bundling `@azure/identity` with esbuild broke its `open` dependency (`import.meta.url` → `undefined` under CJS output), crashing interactive sign-in with "The path argument must be of type string or an instance of URL". `@azure/identity` and `@azure/keyvault-secrets` are now kept external and resolved from `node_modules` at runtime.

### Security
- VaultPulse now declares `untrustedWorkspaces.supported: false` and stays disabled in untrusted workspaces, preventing a crafted `.vscode/settings.json` from silently pointing it at an attacker-chosen vault.
- Interactive sign-in no longer uses a fixed redirect port (`localhost:8766`); the SDK now binds to an OS-assigned random loopback port each time.
- Revealed secrets now auto-hide after 30 seconds or immediately when the VS Code window loses focus.
- **VaultPulse: Add Vault** warns if `.vscode/settings.json` is tracked by git and not gitignored, since it now reveals this vault's alias/URI to anyone with repo access.
