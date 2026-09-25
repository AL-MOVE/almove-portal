import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const marca = 'André Martins - Personal Trainer';
const [portal, coach, entrada, manifestoCliente, manifestoCoach, workerCliente, workerCoach, definicoes] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8'),
  readFile(new URL('../dev-crm.html', import.meta.url), 'utf8'),
  readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
  readFile(new URL('../coach-manifest.json', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../coach-sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-settings.js', import.meta.url), 'utf8')
]);

for (const superficie of [portal, coach, entrada]) {
  assert.ok(superficie.includes(marca), 'A interface deve apresentar a nova identidade.');
}
for (const manifesto of [JSON.parse(manifestoCliente), JSON.parse(manifestoCoach)]) {
  assert.equal(manifesto.name, marca, 'A PWA deve usar a nova identidade no sistema.');
}
assert.match(definicoes, /nome: 'André Martins - Personal Trainer'/);
assert.match(definicoes, /nome === 'AL MOVE' \? PADRAO\.nome/);
assert.match(workerCliente, /almove-portal-v68/);
assert.match(workerCoach, /almove-coach-shell-v4/);
console.log('Identidade visível e atualização das PWAs validadas.');
