import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../coach-firebase.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim());

assert.ok(scripts.length > 0, 'O Coach deve conter scripts inline para validar.');
scripts.forEach((script, index) => {
  new Function(script);
  console.log(`Script inline do Coach ${index + 1} válido.`);
});
