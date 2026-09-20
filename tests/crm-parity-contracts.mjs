import assert from 'node:assert/strict';
import fs from 'node:fs';

const interfaceAtual = fs.readFileSync(new URL('../apps-script/Index.html', import.meta.url), 'utf8');
const backendAtual = fs.readFileSync(new URL('../apps-script/Code.js', import.meta.url), 'utf8');
const plano = fs.readFileSync(new URL('../docs/CRM-PARITY-MIGRATION.md', import.meta.url), 'utf8');

for (const destino of ['dashboard', 'agenda', 'clientes', 'inativos', 'renovar', 'recibos', 'pagamentos', 'pacotesEspeciais', 'checkins', 'avaliacoes']) {
  assert.match(interfaceAtual, new RegExp('data-tab="' + destino + '"|id="' + destino + '"'), 'Falta a secção atual: ' + destino);
}
for (const acao of ['getCRMData', 'getAgendaSemanalCMR', 'criarCliente', 'renovarPacksEmBloco', 'getRecibosPendentes', 'getPagamentosResumo', 'getPacotesEspeciais', 'getCheckinsResumoHoje', 'getPedidosAvaliacaoCRM']) {
  assert.match(backendAtual, new RegExp('function ' + acao + '\\('), 'Falta a função atual: ' + acao);
}
assert.match(plano, /Fonte de verdade atual/);
assert.match(plano, /Nenhuma melhoria de interface entra antes de a função correspondente ter paridade/);
console.log('Contrato de paridade do CRM validado.');
