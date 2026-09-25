import assert from 'node:assert/strict';
import { calcularPagamentosEmAtraso, pagamentoEstaConfirmado } from '../server/dev-crm/payment-status.js';

assert.equal(pagamentoEstaConfirmado(' Pago '), true);
assert.equal(pagamentoEstaConfirmado('Pendente'), false);

const clientes = [
  { id: 'a', nome: 'Ana', estado: 'Ativo', diaPagamento: 10 },
  { id: 'b', nome: 'Bruno', estado: 'Ativo', diaPagamento: 30 },
  { id: 'c', nome: 'Carla', estado: 'Ativo', diaPagamento: 5 },
  { id: 'd', nome: 'Diogo', estado: 'Pausado', diaPagamento: 5 },
  { id: 'e', nome: 'Eva', estado: 'Ativo', diaPagamento: null }
];
const packs = [
  { clientId: 'a', mesAno: '2026-09', estadoPagamento: 'Pendente', preco: 120 },
  { clientId: 'b', mesAno: '2026-09', estadoPagamento: 'Pendente', preco: 80 },
  { clientId: 'c', mesAno: '2026-09', estadoPagamento: 'Pago', preco: 100 },
  { clientId: 'd', mesAno: '2026-09', estadoPagamento: 'Pendente', preco: 100 },
  { clientId: 'e', mesAno: '2026-09', estadoPagamento: 'Pendente', preco: 100 }
];

const atrasos = calcularPagamentosEmAtraso({ clientes, packs, mesAno: '2026-09', hoje: new Date('2026-09-25T12:00:00Z') });
assert.deepEqual(atrasos.map(item => [item.idCliente, item.valorEmAtraso]), [['a', 120]]);
assert.equal(calcularPagamentosEmAtraso({ clientes, packs, mesAno: '2026-09', hoje: new Date('2026-09-08T12:00:00Z') }).length, 0);

const atrasoAnterior = calcularPagamentosEmAtraso({
  clientes: [{ id: 'a', nome: 'Ana', estado: 'Ativo', diaPagamento: 31 }],
  packs: [{ clientId: 'a', mesAno: '2026-08', estadoPagamento: 'Pendente', preco: 120 }],
  mesAno: '2026-09', hoje: new Date('2026-09-01T12:00:00Z')
});
assert.equal(atrasoAnterior[0].mesReferencia, '2026-08');
console.log('Contratos de pagamentos Development validados.');
