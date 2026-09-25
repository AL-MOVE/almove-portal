import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8');

// These fields originate in Firestore or the legacy data service. The Coach
// renders them with innerHTML, so a future change must retain output encoding.
assert.match(html, /function escaparHtmlCRM\(valor\)[\s\S]*?\.replace\(\/&\/g, '&amp;'\)[\s\S]*?\.replace\(\/<\/g, '&lt;'\)[\s\S]*?\.replace\(\/>\/g, '&gt;'\)/);
assert.match(html, /function idParaOnclickCRM\(id\)[\s\S]*?replace\(\/\\\\\/g, '\\\\\\\\'\)[\s\S]*?replace\(\/'\/g, "\\\\'"\)/);

for (const trecho of [
  "escaparHtmlCRM(item.nome)", "escaparHtmlCRM(item.nota)", "escaparHtmlCRM(item.dataHora)",
  "escaparHtmlCRM(item.titulo)", "escaparHtmlCRM(c.nome)", "escaparHtmlCRM(c.estado)",
  "escaparHtmlCRM(c.servicoAtual || '—')", "escaparHtmlCRM(c.contacto || '—')",
  "escaparHtmlCRM(c.notas || 'Sem notas')", "escaparHtmlCRM(p.nome)",
  "escaparHtmlCRM(p.frequencia)", "escaparHtmlCRM(t.nome)",
  "escaparHtmlCRM(ex.nome)", "escaparHtmlCRM(ex.exercicio)",
  "escaparHtmlCRM(item.descricao)", "escaparHtmlCRM(item.categoria)"
]) {
  assert.ok(html.includes(trecho), 'Falta encoding HTML na superfície: ' + trecho);
}

assert.match(html, /value="' \+ escaparHtmlCRM\(ex\.notas \|\| ''\) \+ '"/);
assert.match(html, /value="' \+ escaparHtmlCRM\(valor \|\| ''\) \+ '"/);
assert.match(html, /const id = idParaOnclickCRM\(item\.id\);/);

console.log('Saídas dinâmicas do Coach usam encoding HTML e argumentos inline seguros.');
