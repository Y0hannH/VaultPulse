import { AzureCliCredential, InteractiveBrowserCredential, TokenCredential } from '@azure/identity';

export const KEYVAULT_SCOPE = 'https://vault.azure.net/.default';

/** Page shown in the browser tab once the interactive sign-in completes.
 *  MSAL writes this verbatim as the response body; browsers content-sniff the
 *  leading <!DOCTYPE html> and render it. */
function authResultPage(opts: {
  accent: string; glyph: string; title: string; message: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VaultPulse</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #1e1e1e; color: #e4e4e4;
    display: flex; align-items: center; justify-content: center; min-height: 100vh;
  }
  .card {
    background: #252526; border: 1px solid #3c3c3c; border-radius: 12px;
    padding: 44px 52px; text-align: center; max-width: 440px;
  }
  .icon {
    width: 60px; height: 60px; margin: 0 auto 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 32px; line-height: 1;
    background: ${opts.accent}26; color: ${opts.accent};
  }
  h1 { font-size: 19px; font-weight: 600; margin-bottom: 10px; }
  p { font-size: 13.5px; color: #9d9d9d; line-height: 1.55; }
  .brand {
    margin-top: 26px; font-size: 12px; color: #6e6e6e;
    letter-spacing: .6px; text-transform: uppercase;
  }
  .brand a { color: inherit; text-decoration: none; }
  .brand a:hover { color: #9d9d9d; text-decoration: underline; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${opts.glyph}</div>
    <h1>${opts.title}</h1>
    <p>${opts.message}</p>
    <div class="brand">🔐 VaultPulse · <a href="https://evolve-data.fr" target="_blank" rel="noopener noreferrer">evolve-data.fr</a></div>
  </div>
</body>
</html>`;
}

const AUTH_SUCCESS_HTML = authResultPage({
  accent: '#3fb950',
  glyph: '✓',
  title: 'Authentication successful',
  message: "You're signed in to Azure. You can close this tab and return to VS Code.",
});

const AUTH_ERROR_HTML = authResultPage({
  accent: '#f85149',
  glyph: '✕',
  title: 'Authentication failed',
  message: 'Something went wrong during sign-in. Close this tab and try again from VS Code.',
});

/**
 * Resolves an Azure credential per vault (keyed by tenantId) without requiring
 * a manual `az login` in a terminal: it tries the Azure CLI session silently
 * first (fast, no popup), and falls back to an interactive browser sign-in
 * only when that fails — mirroring FabricPulse's auth UX.
 */
export class AuthService {
  private credentials = new Map<string, TokenCredential>();
  /** Deduplicates concurrent sign-in attempts for the same tenant key. */
  private inflight = new Map<string, Promise<TokenCredential>>();

  async getCredential(tenantId?: string): Promise<TokenCredential> {
    const key = tenantId ?? '__default__';
    const cached = this.credentials.get(key);
    if (cached) {
      return cached;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const promise = this.resolveCredential(key, tenantId);
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async resolveCredential(key: string, tenantId?: string): Promise<TokenCredential> {
    // Try the Azure CLI session first — silent, no popup, works for anyone
    // who already ran `az login`.
    const cliCredential = new AzureCliCredential(tenantId ? { tenantId } : {});
    try {
      await cliCredential.getToken(KEYVAULT_SCOPE);
      this.credentials.set(key, cliCredential);
      return cliCredential;
    } catch {
      // CLI not installed, not logged in, or wrong tenant → fall back to browser
    }

    // Interactive browser fallback — opens the system browser, no terminal needed.
    // Deliberately not setting redirectUri: on Node, @azure/identity/msal-node
    // binds its loopback listener to 127.0.0.1 on an OS-assigned random port
    // when none is given, instead of a fixed, predictable one.
    const browserCredential = new InteractiveBrowserCredential({
      ...(tenantId ? { tenantId } : {}),
      browserCustomizationOptions: {
        successMessage: AUTH_SUCCESS_HTML,
        errorMessage: AUTH_ERROR_HTML,
      },
    });
    this.credentials.set(key, browserCredential);
    return browserCredential;
  }

  /** Forces re-authentication for a tenant (e.g. after a stale/expired session). */
  clearCredential(tenantId?: string): void {
    this.credentials.delete(tenantId ?? '__default__');
  }

  clearAll(): void {
    this.credentials.clear();
  }
}
