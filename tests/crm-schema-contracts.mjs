import assert from 'node:assert/strict';
import {
  normalizarAvaliacaoFisicaLegada, normalizarCheckinLegado, normalizarClienteLegado,
  normalizarPackLegado, normalizarSessaoLegada
} from '../api/_crm-schema.js';

assert.deepEqual(normalizarClienteLegado({
  id: 'C017', nome: 'Cristiana de Almeida Moreira', estado: 'Ativo', contacto: '912345678',
  email: 'cristiana@example.pt', nif: '123456789', morada: 'Rua do Movimento, 17', servicoAtual: 'PT - 2x45 min', precoPersonalizado: '89.5', suspensoMes: '', cancelarMes: '2026-10', contratoFileId: '1A2b3C', assinaturaAceiteEm: '2026-09-20T10:00:00.000Z', diaPagamento: 8, metodoPagamento: 'MB Way', notas: 'Teste'
}), {
  id: 'C017', nome: 'Cristiana de Almeida Moreira', estado: 'Ativo', contacto: '912345678',
  email: 'cristiana@example.pt', nif: '123456789', morada: 'Rua do Movimento, 17', servicoAtual: 'PT - 2x45 min', precoPersonalizado: 89.5, suspensoMes: '', cancelarMes: '2026-10', contratoFileId: '1A2b3C', assinaturaAceiteEm: '2026-09-20T10:00:00.000Z', diaPagamento: 8, metodoPagamento: 'MB Way', notas: 'Teste'
});
assert.deepEqual(normalizarPackLegado({ idCliente: 'C017', mesAno: '2026-09', frequencia: 'PT - 2x45 min', sessoesTotal: 8, sessoesConfirmadas: 3, duracaoMinutos: 45, estadoPagamento: 'Pago', preco: 89.5 }), {
  clientId: 'C017', mesAno: '2026-09', frequencia: 'PT - 2x45 min', sessoesTotal: 8, sessoesConfirmadas: 3, duracaoMinutos: 45, estadoPagamento: 'Pago', preco: 89.5
});
assert.throws(() => normalizarClienteLegado({ id: '', nome: 'A' }), /MIGRACAO_CLIENTE_INVALIDO/);
assert.throws(() => normalizarPackLegado({ idCliente: 'C1', mesAno: '2026-09', sessoesTotal: 2, sessoesConfirmadas: 3 }), /MIGRACAO_PACK_SESSOES_INVALIDAS/);
assert.deepEqual(normalizarSessaoLegada({ idCliente: 'C017', mesAno: '2026-09', numSessao: 3, estado: 'Confirmada', dataConfirmada: '2026-09-18' }), {
  clientId: 'C017', mesAno: '2026-09', numSessao: 3, estado: 'Confirmada', dataConfirmada: '2026-09-18'
});
assert.throws(() => normalizarSessaoLegada({ idCliente: 'C017', mesAno: '2026-09', numSessao: 3, estado: 'Confirmada' }), /MIGRACAO_SESSAO_SEM_DATA/);
assert.deepEqual(normalizarCheckinLegado({ idCliente: 'C017', dataHora: '2026-09-18T08:00:00.000Z', sono: 4, stress: 2, cansaco: 3, refeicoes: 4, doms: 1, nota: 'Bem' }), {
  clientId: 'C017', dataHora: '2026-09-18T08:00:00.000Z', sono: 4, stress: 2, cansaco: 3, refeicoes: 4, doms: 1, nota: 'Bem'
});
assert.throws(() => normalizarCheckinLegado({ idCliente: 'C017', dataHora: '2026-09-18', sono: 7, stress: 2, cansaco: 3, refeicoes: 4, doms: 1 }), /MIGRACAO_CHECKIN_INVALIDO/);
assert.deepEqual(normalizarAvaliacaoFisicaLegada({ idCliente: 'C017', atualizadoEm: '2026-09-18', pesoKg: 70.5, alturaCm: 176, massaGordaPercent: '' }), {
  clientId: 'C017', atualizadoEm: '2026-09-18', pesoKg: 70.5, alturaCm: 176, massaGordaPercent: null, cinturaCm: null, abdomenCm: null, bracoDireitoCm: null, bracoEsquerdoCm: null, pernaDireitaCm: null, pernaEsquerdaCm: null
});
console.log('Esquema de migração CRM validado.');
