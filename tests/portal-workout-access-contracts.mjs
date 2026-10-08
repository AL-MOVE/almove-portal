import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [portal, api] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../api/almove.js', import.meta.url), 'utf8')
]);

assert.match(portal, />Os meus treinos</);
assert.match(portal, /id="perfilTreinos"/);
assert.match(portal, /Podes consultar exercícios, séries, repetições e RIR a qualquer momento/);
assert.match(portal, /tentativasAnteriores >= 1/);
assert.match(portal, /O check-in de hoje já foi concluído e não pode ser alterado/);
assert.match(portal, /Fazer segunda e última tentativa/);
assert.doesNotMatch(portal, /then\(renderPlanosConsulta\)/, 'A lista resolvida pelo pedido não pode ser confundida com o indicador de erro do renderizador.');
assert.match(api, /'getPlanoAtivoPortal'.*'registarCheckin'.*'registarTesteProntidao'.*'registarExecucaoTreino'.*'registarPosTreino'.*'registarSessaoMinimaPortal'/s);

console.log('Consulta dos treinos sem check-in e bloqueios do fluxo diário validados.');
