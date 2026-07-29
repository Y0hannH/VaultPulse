const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');

async function main() {
  if (!fs.existsSync('out')) fs.mkdirSync('out');

  await esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    // @azure/identity pulls in "open" (ESM-only, uses import.meta.url to
    // locate its xdg-open helper). esbuild's CJS output replaces
    // import.meta with `{}`, so import.meta.url becomes undefined and
    // "open" crashes with "The path argument must be of type string or an
    // instance of URL. Received undefined" as soon as it's required.
    // Keeping the Azure SDK external avoids bundling it and lets Node
    // resolve it (and "open") from node_modules unmodified at runtime.
    external: ['vscode', '@azure/identity', '@azure/keyvault-secrets'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: !production,
    minify: production,
  });

  console.log(`Build complete (${production ? 'production' : 'development'})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
