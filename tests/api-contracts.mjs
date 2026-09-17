import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, proxy] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../api/almove.js', import.meta.url), 'utf8')
]);

const chamadas = new Set([...html.matchAll(/chamarApi(?:Direta)?\("([A-Za-z][A-Za-z0-9_]+)"/g)].map(([, fn]) => fn));
const permitidas = new Set([...proxy.matchAll(/'([A-Za-z][A-Za-z0-9_]+)'/g)].map(([, fn]) => fn));
for (const fn of chamadas) {
  assert.ok(permitidas.has(fn), `A interface chama ${fn}, mas o proxy não o permite`);
}
assert.ok(!html.includes('guardarAvaliacaoFisicaPortal'), 'O cliente não pode gravar avaliações físicas diretamente');
console.log(`Contratos da API validados para ${chamadas.size} operações.`);
