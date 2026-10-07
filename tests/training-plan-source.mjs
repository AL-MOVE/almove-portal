import assert from 'node:assert/strict';
import { normalizarPlanosOrigem } from '../server/dev-crm/training-plan-source.js';

const linhas = normalizarPlanosOrigem({ planos: [
  { fonteLinha: 14, idCliente: '240017', nomePlano: ' T1 ', nomeTreino: 'FB', ordem: 1, exercicio: 'Agachamento', series: 3, repsMin: 8, repsMax: 12, rir: 2, atualizadoEm: '2026-09-01T10:00:00.000Z', validade: '2026-11-01T00:00:00.000Z', visibilidade: '', descansoSegundos: 90 },
  { fonteLinha: 15, idCliente: '240017', nomePlano: 'T1', nomeTreino: 'UPPER', ordem: 1, exercicio: 'Remada', series: 4, repsMin: 10, repsMax: 10, rir: '', visibilidade: 'PT', tipoPrescricao: 'tempo', aquecimento: 'true' },
  { fonteLinha: 16, idCliente: 'outro', nomePlano: 'Ignorar', nomeTreino: 'X', exercicio: 'Y' },
  { fonteLinha: 17, idCliente: '240017', nomePlano: 'Inválido', nomeTreino: '', exercicio: '' }
] }, '240017');

assert.equal(linhas.length, 2);
assert.equal(linhas[0].nomePlano, 'T1');
assert.equal(linhas[0].visibilidade, 'CLIENTE');
assert.equal(linhas[0].descansoSegundos, 90);
assert.equal(linhas[1].visibilidade, 'PT');
assert.equal(linhas[1].tipoPrescricao, 'TEMPO');
assert.equal(linhas[1].aquecimento, true);
assert.equal(linhas[1].rir, null);

console.log('Recuperação segura de planos da origem validada.');
