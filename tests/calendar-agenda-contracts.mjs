import assert from 'node:assert/strict';
import { chaveTituloAgenda, normalizarTituloAgenda, reconhecerClienteAgenda } from '../server/dev-crm/calendar-agenda.js';

const clientes = [
  { id: '1', nome: 'Leonor Vidal Pinto' },
  { id: '2', nome: 'Armindo Manuel' },
  { id: '3', nome: 'Armindo Costa' }
];

assert.equal(normalizarTituloAgenda('  Sessão — Leonór Vidal! '), 'sessao leonor vidal');
assert.equal(reconhecerClienteAgenda('PT Leonor Vidal Pinto', clientes).cliente?.id, '1');
assert.equal(reconhecerClienteAgenda('Treino Leonor Pinto', clientes).cliente?.id, '1');
assert.equal(reconhecerClienteAgenda('Armindo', clientes).cliente, null);
assert.equal(reconhecerClienteAgenda('Armindo', clientes).motivo, 'Primeiro nome ambíguo');
assert.equal(reconhecerClienteAgenda('Cliente externo', clientes).motivo, 'Cliente não encontrado no CRM');
assert.equal(reconhecerClienteAgenda('PNT', clientes, new Map([['pnt', '2']])).cliente?.id, '2');
assert.equal(chaveTituloAgenda('PT Leonor'), chaveTituloAgenda('pt-leonor'));

console.log('Associação segura da Agenda Google validada.');
