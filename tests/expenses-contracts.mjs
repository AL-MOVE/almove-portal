import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATEGORIAS_DESPESA, validarDespesa } from '../server/dev-crm/dev-crm-expenses.js';

assert.ok(CATEGORIAS_DESPESA.includes('Renda do ginásio'));
assert.deepEqual(validarDespesa({
  tipo: 'recorrente', categoria: 'Renda do ginásio', descricao: 'Renda da sala', valor: '450.50', mesAno: '2026-09'
}), { tipo: 'recorrente', categoria: 'Renda do ginásio', descricao: 'Renda da sala', valor: 450.5, mesInicio: '2026-09' });
assert.throws(() => validarDespesa({ tipo: 'mensal', categoria: 'Outros', descricao: 'Teste', valor: 1, mesAno: '2026-09' }), /DESPESA_TIPO_INVALIDO/);
assert.throws(() => validarDespesa({ tipo: 'avulsa', categoria: 'Fora da lista', descricao: 'Teste', valor: 1, mesAno: '2026-09' }), /DESPESA_CATEGORIA_INVALIDA/);
assert.throws(() => validarDespesa({ tipo: 'avulsa', categoria: 'Outros', descricao: 'Teste', valor: 0, mesAno: '2026-09' }), /DESPESA_VALOR_INVALIDO/);

const [api, dashboard, coach] = await Promise.all([
  readFile(new URL('../api/dev-crm.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-dashboard.js', import.meta.url), 'utf8'),
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8')
]);
assert.match(api, /expenses: despesas/);
assert.match(dashboard, /obterResumoDespesas/);
assert.match(dashboard, /lucroEstimado/);
assert.match(dashboard, /ticketMedioPack/);
assert.match(dashboard, /valorHoraRealizada/);
assert.match(await readFile(new URL('../server/dev-crm/dev-crm-expenses.js', import.meta.url), 'utf8'), /DESPESA_NAO_APAGAVEL/);
for (const trecho of ['getDespesasCRM', 'guardarDespesaCRM', 'terminarDespesaRecorrenteCRM', 'apagarDespesaCRM', '/api/dev-crm-expenses', 'financasTicketMedio', 'financasValorHoraContratada', 'financasValorHoraRealizada']) {
  assert.ok(coach.includes(trecho), 'Falta a integração financeira: ' + trecho);
}
console.log('Contratos de despesas CRM validados.');
