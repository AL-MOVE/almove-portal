import assert from 'node:assert/strict';
import { normalizarClienteLegado, normalizarPackLegado } from '../api/_crm-schema.js';

assert.deepEqual(normalizarClienteLegado({
  id: 'C017', nome: 'Cristiana de Almeida Moreira', estado: 'Ativo', contacto: '912345678',
  nif: '123456789', servicoAtual: 'PT - 2x45 min', precoPersonalizado: '89.5', diaPagamento: 8, metodoPagamento: 'MB Way', notas: 'Teste'
}), {
  id: 'C017', nome: 'Cristiana de Almeida Moreira', estado: 'Ativo', contacto: '912345678',
  nif: '123456789', servicoAtual: 'PT - 2x45 min', precoPersonalizado: 89.5, diaPagamento: 8, metodoPagamento: 'MB Way', notas: 'Teste'
});
assert.deepEqual(normalizarPackLegado({ idCliente: 'C017', mesAno: '2026-09', frequencia: 'PT - 2x45 min', sessoesTotal: 8, sessoesConfirmadas: 3, duracaoMinutos: 45, estadoPagamento: 'Pago', preco: 89.5 }), {
  clientId: 'C017', mesAno: '2026-09', frequencia: 'PT - 2x45 min', sessoesTotal: 8, sessoesConfirmadas: 3, duracaoMinutos: 45, estadoPagamento: 'Pago', preco: 89.5
});
assert.throws(() => normalizarClienteLegado({ id: '', nome: 'A' }), /MIGRACAO_CLIENTE_INVALIDO/);
assert.throws(() => normalizarPackLegado({ idCliente: 'C1', mesAno: '2026-09', sessoesTotal: 2, sessoesConfirmadas: 3 }), /MIGRACAO_PACK_SESSOES_INVALIDAS/);
console.log('Esquema de migração CRM validado.');
