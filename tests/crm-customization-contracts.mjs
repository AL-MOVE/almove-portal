import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizarOpcoesOperacionais } from '../server/dev-crm/operational-options.js';
import { normalizeQuickPaymentMethod } from '../server/dev-crm/quick-payment.js';
import { validarDespesa } from '../server/dev-crm/dev-crm-expenses.js';

const opcoes = normalizarOpcoesOperacionais({
  metodosPagamento: ['Transferência', 'Cheque'],
  categoriasDespesa: ['Renda do ginásio', 'Formação'],
  tiposNota: ['Nota técnica', 'Contacto'],
  modosEspeciais: ['Férias', 'Recuperação'],
  modalidadesContrato: ['Mensal', 'Por sessão'],
  prazosRevisaoAvaliacao: [30, 60, 90]
});
assert.deepEqual(opcoes.metodosPagamento, ['Transferência', 'Cheque']);
assert.deepEqual(opcoes.categoriasDespesa, ['Renda do ginásio', 'Formação']);
assert.deepEqual(opcoes.prazosRevisaoAvaliacao, [30, 60, 90]);
assert.equal(normalizeQuickPaymentMethod('Cheque', opcoes.metodosPagamento), 'Cheque');
assert.throws(() => normalizeQuickPaymentMethod('Cripto', opcoes.metodosPagamento), /METODO_PAGAMENTO_INVALIDO/);
assert.equal(validarDespesa({ tipo: 'avulsa', categoria: 'Formação', descricao: 'Curso', valor: 10, mesAno: '2026-10' }, opcoes.categoriasDespesa).categoria, 'Formação');
assert.throws(() => normalizarOpcoesOperacionais({ metodosPagamento: ['MB Way', 'mb way'], categoriasDespesa: ['Outros'] }), /METODOS_PAGAMENTO_DUPLICADOS/);
assert.throws(() => normalizarOpcoesOperacionais({ prazosRevisaoAvaliacao: [3] }), /PRAZOS_REVISAO_INVALIDOS/);

const [coach, settings, dashboard, actions, expenses] = await Promise.all([
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-settings.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-dashboard.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-client-actions.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-expenses.js', import.meta.url), 'utf8')
]);

assert.doesNotMatch(coach, /<h3>Interface<\/h3>/);
for (const trecho of ['Pagamentos por método', 'dashboardFiltroMetodo', 'renderResumoMetodosPagamentoCRM', 'Opções do CRM', 'modalOpcoesOperacionaisOverlay', 'guardarOpcoesOperacionaisCRM', 'Estados protegidos:', 'coach-app-link', '>App Coach</span>']) assert.ok(coach.includes(trecho), 'Falta no frontend: ' + trecho);
assert.doesNotMatch(coach, /nav-item-label">App Coach \(mobile\)/);
assert.match(settings, /save-operational-options/);
assert.match(settings, /OPCOES_OPERACIONAIS_CONFLITO/);
assert.match(dashboard, /operationalOptions/);
assert.match(actions, /carregarOpcoesOperacionais/);
assert.match(expenses, /categoriasPermitidas/);

console.log('Personalização segura do CRM e resumo de pagamentos validados.');
