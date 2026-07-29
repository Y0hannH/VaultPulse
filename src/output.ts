import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('VaultPulse');
  }
  return channel;
}

/**
 * Logs full error detail (message + stack) to the VaultPulse output channel.
 * Only call this with errors raised before a secret value would be returned
 * (auth/network/HTTP failures) — never with anything that could carry a
 * secret's actual value.
 */
export function logError(context: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const ch = getOutputChannel();
  ch.appendLine(`[${new Date().toISOString()}] ${context}`);
  ch.appendLine(detail);
  ch.appendLine('');
}

/** Shows a friendly error toast with a button to open the full detail log. */
export async function showErrorWithDetails(message: string): Promise<void> {
  const choice = await vscode.window.showErrorMessage(message, 'Show Details');
  if (choice === 'Show Details') {
    getOutputChannel().show();
  }
}
