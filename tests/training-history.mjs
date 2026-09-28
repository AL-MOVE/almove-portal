import assert from 'node:assert/strict';
import { buildTrainingHistory } from '../server/dev-crm/training-history.js';

const history = buildTrainingHistory({
  sessions: [
    { idSessao: 'pt-1', data: '2026-09-01', nomePlano: 'Força', nomeTreino: 'Upper', estado: 'REALIZADA', duracaoMin: 45 },
    { idSessao: 'pt-2', data: '2026-09-08', nomePlano: 'Força', nomeTreino: 'Upper', estado: 'REALIZADA', duracaoMin: 50, alteracoesPlano: [{ label: 'Substituído', detail: 'Supino por Chest Press' }] }
  ],
  executions: [
    { idSessao: 'pt-1', data: '2026-09-01', exercicio: 'Supino', numeroSerie: 1, reps: '10', carga: '40', velocidade: 'rir:2', tipoSessao: 'PT' },
    { idSessao: 'pt-2', data: '2026-09-08', exercicio: 'Chest Press', exercicioOriginal: 'Supino', tipoAlteracao: 'SUBSTITUIDO', motivoAlteracao: 'OCUPADO', numeroSerie: 1, reps: '10', carga: '50', velocidade: 'rir:1', tipoSessao: 'PT' },
    { idSessao: 'pt-2', data: '2026-09-08', exercicio: 'Remada', tipoAlteracao: 'ADICIONADO', numeroSerie: 1, reps: '12', carga: '30', velocidade: 'rir:2', tipoSessao: 'PT' },
    { idSessao: 'auto-1', data: '2026-09-05', nomePlano: 'Força', nomeTreino: 'Lower', exercicio: 'Agachamento', numeroSerie: 1, reps: '8', carga: '60', velocidade: 'rir:3', tipoSessao: 'AUTONOMO' }
  ]
});

assert.equal(history.length, 3);
assert.equal(history[0].idSessao, 'pt-2');
assert.equal(history[0].volumeKg, 860);
assert.equal(history[0].totalReps, 22);
assert.equal(history[0].rirMedio, 1.5);
assert.equal(history[0].numSubstituidos, 1);
assert.equal(history[0].numAdicionados, 1);
assert.equal(history[0].comparacao.volumeKg, 460);
assert.equal(history.find(item => item.idSessao === 'auto-1').tipo, 'AUTONOMO');
assert.equal(history.find(item => item.idSessao === 'auto-1').volumeKg, 480);

const records = buildTrainingHistory({ executions: [
  { idSessao: 'a', data: '2026-01-01', nomeTreino: 'A', exercicio: 'Remada', reps: 10, carga: 30 },
  { idSessao: 'b', data: '2026-02-01', nomeTreino: 'A', exercicio: 'Remada', reps: 8, carga: 35 }
] });
assert.equal(records[0].recordesPessoais[0].cargaKg, 35);
assert.equal(records[0].recordesPessoais[0].anteriorKg, 30);

const incomplete = buildTrainingHistory({ executions: [
  { idSessao: 'x', data: '2026-03-01', exercicio: 'Livre', reps: 5, carga: 10, rir: '', velocidade: 'rir:4' },
  { idSessao: 'y', data: '2026-03-02', exercicio: 'Outro', reps: 5, carga: 10 }
] });
assert.equal(incomplete.find(item => item.idSessao === 'x').rirMedio, 4);
assert.equal(incomplete.find(item => item.idSessao === 'y').comparacao, null);

console.log('Histórico e evolução de treino validados.');
