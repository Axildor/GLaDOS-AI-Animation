import { build } from 'esbuild';
import { statSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  minify: false,
  outfile: 'axidos-card.js',
  legalComments: 'none',
  logLevel: 'info',
});

const size = statSync('axidos-card.js').size;
const kb = (size / 1024).toFixed(1);
console.log(`\nBuilt axidos-card.js (${kb} KB)`);
if (size > 120 * 1024) {
  console.warn('WARNING: bundle exceeds 120 KB — check for accidental dependency inclusion');
}