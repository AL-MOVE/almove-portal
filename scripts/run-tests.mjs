import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const files = (await readdir(new URL('../tests/', import.meta.url))).filter(name => name.endsWith('.mjs')).sort();
for (const file of files) {
  console.log(`\nTEST ${file}`);
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(`../tests/${file}`, import.meta.url))], { stdio: 'inherit', env: process.env });
    child.on('exit', value => resolve(value ?? 1)); child.on('error', () => resolve(1));
  });
  if (code !== 0) process.exit(code);
}
console.log(`\n${files.length} testes concluídos.`);
