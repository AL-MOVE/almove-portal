import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeQuickPaymentMethod, normalizeQuickPaymentStatus, QUICK_PAYMENT_METHODS } from '../server/dev-crm/quick-payment.js';

const html = fs.readFileSync(new URL('../coach-firebase.html', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../server/dev-crm/dev-crm-dashboard.js', import.meta.url), 'utf8');
const actions = fs.readFileSync(new URL('../server/dev-crm/dev-crm-client-actions.js', import.meta.url), 'utf8');

assert.equal(normalizeQuickPaymentStatus('Pago'), 'Pago');
assert.equal(normalizeQuickPaymentStatus(' Pendente '), 'Pendente');
assert.throws(() => normalizeQuickPaymentStatus('Cancelado'), /ESTADO_PAGAMENTO_INVALIDO/);
assert.ok(QUICK_PAYMENT_METHODS.includes('MB Way'));
assert.ok(QUICK_PAYMENT_METHODS.includes('Transferência'));
assert.equal(normalizeQuickPaymentMethod(' Débito direto '), 'Débito direto');
assert.throws(() => normalizeQuickPaymentMethod('Crédito informal'), /METODO_PAGAMENTO_INVALIDO/);

for (const heading of ['Cliente', 'Atividade', 'Ginásio', 'Preço', 'Pack', 'Pagamento', 'Método', 'Sessões']) {
  assert.match(html, new RegExp('role="columnheader">' + heading));
}
assert.match(html, /alterarEstadoPagamentoCarteira/);
assert.match(html, /alterarMetodoPagamentoCarteira/);
assert.match(html, /@container carteira \(max-width: 980px\)/);
assert.match(html, /precoOrigem === 'personalizado'/);
assert.match(actions, /acao === 'set-payment-status'/);
assert.match(actions, /acao === 'set-payment-method'/);
assert.match(dashboard, /metodoPagamento: p\.metodoPagamento/);
assert.match(dashboard, /precoOrigem: p\.precoOrigem/);

console.log('Carteira operacional com pagamentos rápidos válida.');
