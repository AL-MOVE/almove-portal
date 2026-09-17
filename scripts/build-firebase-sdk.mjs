import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL('js/firebase-sdk-entry.js', root))],
  outfile: fileURLToPath(new URL('js/firebase-sdk.js', root)),
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none'
});
