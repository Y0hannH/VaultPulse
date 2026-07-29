# 🔐 VaultPulse

> Read-only Azure Key Vault secrets viewer — right inside VS Code.

![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85-007ACC?style=flat-square&logo=visualstudiocode)
![Version](https://img.shields.io/badge/Version-0.1.0-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-00B4D8?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square)

---

## What is VaultPulse?

VaultPulse gives you a TreeView of the Azure Key Vaults you work with — grouped by client or environment — so you can check a connection string or API key without switching to the Azure Portal or the `az` CLI. Secret values are masked by default and only fetched from Azure when you explicitly reveal or copy them.

Part of the [Evolve](https://evolve-data.fr) data consulting toolset, alongside [FabricPulse](https://github.com/Y0hannH/FabricPulse) (Microsoft Fabric pipeline monitoring) and dbt Forge (dbt authoring).

**v1 is read-only.** Creating, editing, or deleting secrets, and managing keys/certificates, are out of scope for now.

---

## Features

- List the Key Vaults you've configured (no auto-discovery — you decide what's in scope)
- List the secrets in a selected vault
- Reveal a secret's value on demand (masked by default), auto-hidden after 30s or as soon as VS Code loses focus
- Copy a secret's value to the clipboard
- Manage several vaults / several clients from a single panel
- Filter the tree by vault alias or secret name

---

## Getting Started

### Prerequisites

- VS Code 1.85+
- An Azure account with `Get` (and ideally `List`) permission on the secrets you want to see, via Azure RBAC or an Access Policy — no terminal setup required, see [Authentication](#authentication)

### Installation

1. Install the extension from the VS Code Marketplace (or a `.vsix` build)
2. Open a workspace folder — vault configuration lives in `.vscode/settings.json`
3. Run **VaultPulse: Add Vault** from the Command Palette, or add vaults directly in settings (see [Configuration](#configuration))

### First Run

Open the VaultPulse icon in the Activity Bar, expand a vault to list its secrets, and click the eye icon on a secret to reveal it.

---

## Authentication

No manual `az login` required. Same approach as FabricPulse: when you expand a vault for the first time, VaultPulse tries your existing **Azure CLI session** silently in the background; if none is found (or it doesn't have access to that tenant), it automatically opens a **browser tab** for you to sign in interactively — no terminal step needed.

- If you already run `az login` as part of your workflow, that session is picked up automatically and nothing else happens.
- Otherwise, a browser tab opens once per tenant; sign in with the Microsoft account that has access to the vault, and the tab confirms success — you can close it and go back to VS Code.
- Being signed in to the built-in **"Azure Resources"** extension does **not** count as either of these — it's a separate sign-in session VaultPulse doesn't read. If a vault fails to expand and you're relying on that extension only, use the browser sign-in flow described above instead.
- If a vault lives in a **different Azure AD tenant** than your default account, set its `tenantId` (see [Configuration](#configuration)) so the right sign-in prompt (CLI or browser) targets that tenant.

---

## Configuration

Vaults are declared per **workspace** — not in your global/user settings — so different clients or projects can each have their own vault list. There's no automatic discovery (no Resource Graph scan, no subscription enumeration): you decide exactly what shows up.

### Option A — `VaultPulse: Add Vault` (recommended)

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **VaultPulse: Add Vault**
3. Enter a display name (e.g. `Client A - Prod`) and the vault's URI (e.g. `https://clienta-prod.vault.azure.net`)
4. Optionally enter an Azure AD Tenant ID, only if this vault is in a different tenant than your default account — press Enter to skip

This writes the entry into `.vscode/settings.json` for you, with basic validation (URI must start with `https://`, no duplicate `vaultUri`).

### Option B — edit `.vscode/settings.json` directly

```jsonc
// .vscode/settings.json
{
  "vaultpulse.vaults": [
    // Same tenant as your default Azure account — no tenantId needed
    { "alias": "Client A - Prod", "vaultUri": "https://clienta-prod.vault.azure.net" },
    { "alias": "Client A - Dev",  "vaultUri": "https://clienta-dev.vault.azure.net" },

    // Different client, different Azure AD tenant — tenantId required
    { "alias": "Client B - Prod", "vaultUri": "https://clientb-prod.vault.azure.net", "tenantId": "11111111-2222-3333-4444-555555555555" }
  ]
}
```

`vaultpulse.vaults` is a JSON **array**; each entry is an **object** with exactly these fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `alias` | `string` | yes | Free-text display name shown in the tree, e.g. `"Client A - Prod"` |
| `vaultUri` | `string` | yes | Full vault URL, must start with `https://`, no trailing slash — e.g. `"https://clienta-prod.vault.azure.net"` |
| `tenantId` | `string` | no | Azure AD tenant GUID — only set this if the vault lives in a different tenant than your default Azure account (see [Authentication](#authentication)) |

A couple of things that are easy to miss:

- The setting only exists at **workspace** scope — a folder must be open in VS Code, and it won't show up under your user settings.
- Hand-editing the JSON skips the validation that **Add Vault** does (no `https://` check, no duplicate check) — a typo just shows up later as a vault that fails to expand.
- The tree picks up changes to `.vscode/settings.json` automatically; you don't need to run **Refresh** after saving.

---

## Commands

| Command | Description |
|---|---|
| `vaultpulse.openDocumentation` | Open this documentation in VS Code's Markdown Preview |
| `vaultpulse.filter` | Filter the tree by vault alias, or by secret name for vaults already expanded this session |
| `vaultpulse.clearFilter` | Clear the active filter |
| `vaultpulse.addVault` | Add a vault (prompts for alias + URI, writes to workspace settings) |
| `vaultpulse.refresh` | Refresh the vault/secret list |
| `vaultpulse.revealSecret` | Show the value of the selected secret |
| `vaultpulse.hideSecret` | Mask the value again |
| `vaultpulse.copySecret` | Copy the secret's value to the clipboard |

### Filtering

Click the search icon in the panel toolbar (or run **VaultPulse: Filter Vaults & Secrets**) and type a search term:

- A vault whose **alias** matches is shown with all its secrets.
- A vault whose alias doesn't match is still shown if one of its **secrets** matches by name — but only for vaults you've already expanded at least once in this session (their secret names are cached in memory). It only shows the matching secrets, not the full list.
- Vaults you haven't expanded yet are matched on alias only — filtering never triggers a new Azure call.

The active filter shows next to the view title, and **Clear Filter** appears in the toolbar while a filter is set.

---

## Troubleshooting

VaultPulse inspects the error returned by Azure and surfaces a specific message instead of a generic failure. Every error toast has a **Show Details** button that opens the `VaultPulse` output channel (View → Output → VaultPulse) with the full underlying error — useful when reporting an issue.

**Sign-in was cancelled**
The browser tab opened for interactive sign-in was closed before completing. Use **VaultPulse: Refresh** to try again.

**Access denied (403)** — Key Vault has two authorization modes, and a 403 means something different in each:

- **Azure RBAC**: you're missing a role assignment (e.g. "Key Vault Secrets User") on the vault or a parent scope.
- **Access Policies (legacy)**: you're missing an access policy entry granting `Get`/`List` on secrets.

VaultPulse tells you which mode applies and what to ask an owner for, rather than a generic "Forbidden".

**Sign-in needs fresh consent**
If your Azure session predates the vault's required consent for the `https://vault.azure.net/.default` scope, VaultPulse surfaces that explicitly rather than failing silently — it will reopen the sign-in browser tab on retry.

**Not authenticated (401)**
Your session may not cover this vault's tenant. If the vault is in a different Azure AD tenant, re-add it via **VaultPulse: Add Vault** with the correct Tenant ID.

**Vault or secret not found (404)**
Double-check the vault URI for typos, and that it's in the tenant your sign-in session (CLI or browser) actually authenticated against.

---

## Local Data & Privacy

VaultPulse does not collect any data, and never persists secret values.

- **Secret values**: held in memory only, for the current VS Code session — never written to disk, never logged (including in debug output), cleared when you hide a secret or close VS Code
- **Vault and secret names**: may be cached locally for UX (e.g. tree state) — values are not
- **Vault configuration**: stored in your workspace's `.vscode/settings.json`, like any other VS Code setting
- No telemetry, no backend, no external calls beyond the Azure Key Vault SDK talking directly to your vaults

Copying a secret uses `vscode.env.clipboard.writeText()` only — VaultPulse never writes secret values anywhere else.

---

## Security posture

- **Workspace Trust**: VaultPulse declares `capabilities.untrustedWorkspaces.supported: false` and stays disabled in untrusted workspaces. Without this, an untrusted/cloned folder could ship a crafted `.vscode/settings.json` that points VaultPulse at an attacker-chosen vault using your own credentials the moment you expand it.
- **Sign-in loopback port**: the interactive browser sign-in binds to `127.0.0.1` on an OS-assigned random port each time, never a fixed one, and only for the duration of the sign-in.
- **Auto-hide**: a revealed secret masks itself again after 30 seconds, or immediately if the VS Code window loses focus (alt-tab, screen share, lock screen) — whichever comes first.
- **Shared extension process**: like every VS Code extension, VaultPulse runs in the same Extension Host process as your other installed extensions — VS Code doesn't sandbox extensions from each other the way a browser isolates tabs. Don't install extensions you don't trust on a machine used to access client secrets.
- **`vaultpulse.vaults` in git**: this setting exposes vault aliases/URIs (and optional tenant IDs) — never secret values, but potentially sensitive client/topology information. If `.vscode/settings.json` is tracked by git, **VaultPulse: Add Vault** warns you once (only when it detects the repo doesn't already ignore that file) so you can decide whether to add it to `.gitignore`.

---

## Current Scope

Multi-vault, multi-tenant TreeView; reveal/hide; copy to clipboard; RBAC vs Access Policies error handling. Read-only — no key/certificate management, no create/update/delete.

---

## Contributing

Issues and PRs welcome at [github.com/Y0hannH/VaultPulse](https://github.com/Y0hannH/VaultPulse).

---

## License

MIT © 2026 [Evolve](https://evolve-data.fr) — Yohann

---

*Built with ♥ by Evolve*
