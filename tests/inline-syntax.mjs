import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

assert.ok(scripts.length > 0, 'O portal deve conter o script de arranque.');
scripts.forEach((script, index) => {
  new Function(script);
  console.log(`Script inline ${index + 1} válido.`);
});
