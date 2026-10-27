import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = '<!-- APP_SCRIPT -->';
const CSS_PLACEHOLDER = '/* LEAFLET_CSS */';

const result = await build({
  entryPoints: [join(ROOT, 'src', 'app.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = await readFile(join(ROOT, 'src', 'index.html'), 'utf8');
if (!template.includes(PLACEHOLDER)) throw new Error(`Falta ${PLACEHOLDER} en src/index.html`);
const leafletCss = await readFile(join(ROOT, 'node_modules', 'leaflet', 'dist', 'leaflet.css'), 'utf8');
if (!template.includes(CSS_PLACEHOLDER)) throw new Error(`Falta ${CSS_PLACEHOLDER} en src/index.html`);
const html = template
  .replace(CSS_PLACEHOLDER, () => leafletCss.replace(/<\/style/gi, ''))
  .replace(PLACEHOLDER, () => `<script>${script}</script>`);
await writeFile(join(ROOT, 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB`);
