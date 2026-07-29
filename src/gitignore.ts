import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Lightweight, good-enough check — doesn't walk up to a parent repo root. */
export function isGitRepo(root: string): boolean {
  return fs.existsSync(path.join(root, '.git'));
}

/**
 * Resolves whether `relativePath` is covered by a .gitignore rule, using
 * `git check-ignore` so nested/parent .gitignore files and negation patterns
 * are handled correctly instead of reimplementing gitignore syntax.
 * Resolves to undefined if git isn't available or the check can't be run —
 * callers should treat that as "unknown" and skip warning.
 */
export function isPathGitIgnored(root: string, relativePath: string): Promise<boolean | undefined> {
  return new Promise(resolve => {
    execFile('git', ['check-ignore', '-q', relativePath], { cwd: root }, error => {
      if (!error) {
        resolve(true);
      } else if ('code' in error && error.code === 1) {
        resolve(false);
      } else {
        resolve(undefined);
      }
    });
  });
}
