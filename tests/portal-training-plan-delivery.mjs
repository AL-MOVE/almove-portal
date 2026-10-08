import assert from 'node:assert/strict';
import {
  aplicarPlanosPortal,
  combinarPlanosPortal,
  construirPlanosPortalFirestore
} from '../server/portal-training-plans.js';

const linhas = [
  { idCliente: 'armindo', nomePlano: 'Novo PPL', nomeTreino: 'Push', ordem: 2, exercicio: 'Elevação lateral', series: 3, repsMin: 12, repsMax: 15, rir: 2, visibilidade: 'CLIENTE', atualizadoEm: '2026-10-08T15:00:00.000Z', validade: '2026-12-31' },
  { idCliente: 'armindo', nomePlano: 'Novo PPL', nomeTreino: 'Push', ordem: 1, exercicio: 'Supino', series: 4, repsMin: 8, repsMax: 10, rir: 2, visibilidade: 'CLIENTE', atualizadoEm: '2026-10-08T15:00:00.000Z', validade: '2026-12-31' },
  { idCliente: 'armindo', nomePlano: 'Novo PPL', nomeTreino: 'Pull', ordem: 1, exercicio: 'Remada', series: 4, repsMin: 10, repsMax: 12, visibilidade: '', atualizadoEm: '2026-10-08T15:00:00.000Z', validade: '2026-12-31' },
  { idCliente: 'armindo', nomePlano: 'Novo PPL', nomeTreino: 'Pernas', ordem: 1, exercicio: 'Agachamento', series: 4, repsMin: 6, repsMax: 8, visibilidade: 'CLIENTE', atualizadoEm: '2026-10-08T15:00:00.000Z', validade: '2026-12-31' },
  { idCliente: 'armindo', nomePlano: 'Privado', nomeTreino: 'PT', ordem: 1, exercicio: 'Teste PT', visibilidade: 'PT', atualizadoEm: '2026-10-08T16:00:00.000Z' },
  { idCliente: 'outro-cliente', nomePlano: 'Não pode aparecer', nomeTreino: 'A', ordem: 1, exercicio: 'Segredo', visibilidade: 'CLIENTE', atualizadoEm: '2026-10-08T17:00:00.000Z' }
];

const firebase = construirPlanosPortalFirestore(linhas, 'armindo', new Date('2026-10-08T18:00:00.000Z'));
assert.equal(firebase.length, 1, 'Só os planos autónomos do cliente autenticado devem seguir para o Portal.');
assert.equal(firebase[0].nome, 'Novo PPL');
assert.deepEqual(firebase[0].treinos.map(treino => treino.nome), ['Push', 'Pull', 'Pernas']);
assert.deepEqual(firebase[0].treinos[0].exercicios.map(item => item.exercicio), ['Supino', 'Elevação lateral'], 'A ordem definida no CRM deve ser preservada.');
assert.equal(firebase[0].expirado, false);

const antigos = [{
  nome: 'Novo PPL', atualizadoEm: '2026-09-01T10:00:00.000Z', validoAte: '2026-10-01', expirado: true,
  treinos: [{ nome: 'push', exercicios: [{ exercicio: 'Antigo' }], feitoAntes: true, diasDesde: 4, dataRealizacao: '2026-10-04' }]
}, {
  nome: 'Plano legado', atualizadoEm: '2026-08-01T10:00:00.000Z', treinos: []
}];

const combinados = combinarPlanosPortal(antigos, firebase);
assert.equal(combinados.length, 2, 'Planos antigos ainda não migrados devem continuar disponíveis.');
assert.equal(combinados[0].nome, 'Novo PPL', 'A versão mais recente do Firestore deve substituir a versão antiga com o mesmo nome.');
assert.equal(combinados[0].treinos[0].exercicios[0].exercicio, 'Supino');
assert.equal(combinados[0].treinos[0].feitoAntes, true, 'O estado de execução guardado na origem antiga deve ser preservado.');

const resposta = aplicarPlanosPortal({ ok: true, temPlanos: true, planosCliente: antigos, planoAtivoNome: 'Plano legado' }, firebase);
assert.equal(resposta.planoAtivoNome, 'Novo PPL');
assert.equal(resposta.temPlanos, true);
assert.deepEqual(resposta.planosCliente.map(plano => plano.nome), ['Novo PPL', 'Plano legado']);

console.log('Entrega de planos autónomos Firestore → Portal validada com isolamento.');
