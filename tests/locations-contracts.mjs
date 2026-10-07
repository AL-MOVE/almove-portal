import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { locaisPadrao, normalizarLocais, rendaDoLocalNoMes, validarLocalCliente } from '../server/dev-crm/locations.js';

const padrao = locaisPadrao('2026-10');
assert.deepEqual(padrao.map(local => local.nome), ['LFitness', 'PN Gym', 'Online']);
assert.equal(rendaDoLocalNoMes(padrao[0], '2026-10'), 375);
assert.equal(rendaDoLocalNoMes(padrao[0], '2026-09'), 0);
assert.equal(padrao[2].rendaMensal, 0);

const alterados = normalizarLocais([
  { ...padrao[0], rendaMensal: 425 },
  padrao[1],
  padrao[2]
], { mes: '2026-11', anteriores: padrao });
assert.equal(rendaDoLocalNoMes(alterados[0], '2026-10'), 375);
assert.equal(rendaDoLocalNoMes(alterados[0], '2026-11'), 425);
assert.deepEqual(alterados[0].rendaHistorico, [
  { valor: 375, inicio: '2026-10', fim: '2026-10' },
  { valor: 425, inicio: '2026-11', fim: '' }
]);
const desativadoNoPrimeiroMes = normalizarLocais([{ ...padrao[0], ativo: false, rendaMensal: 0 }], { mes: '2026-10', anteriores: [padrao[0]] });
assert.deepEqual(desativadoNoPrimeiroMes[0].rendaHistorico, []);

const semPnGym = normalizarLocais([alterados[0], alterados[2]], { mes: '2026-12', anteriores: alterados });
const pnPreservado = semPnGym.find(local => local.id === 'pn-gym');
assert.ok(pnPreservado);
assert.equal(pnPreservado.ativo, false);
assert.equal(validarLocalCliente({ locais: semPnGym }, 'lfitness', { permitirVazio: false }), 'lfitness');
assert.throws(() => validarLocalCliente({ locais: semPnGym }, 'pn-gym', { permitirVazio: false }), /CLIENTE_LOCAL_INVALIDO/);
assert.equal(validarLocalCliente({ locais: semPnGym }, 'pn-gym', { permitirVazio: false, permitirInativo: true }), 'pn-gym');
assert.throws(() => normalizarLocais([{ id: 'a', nome: 'Mesmo' }, { id: 'b', nome: 'mesmo' }], { mes: '2026-10' }), /LOCAL_NOME_DUPLICADO/);

const [dashboard, settings, clients, coach, bridge] = await Promise.all([
  readFile(new URL('../server/dev-crm/dev-crm-dashboard.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-settings.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-client-create.js', import.meta.url), 'utf8'),
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/locations-bridge.js', import.meta.url), 'utf8')
]);
for (const fragmento of ['locationFilter', 'clientesMetricas', 'catalogoLocais']) assert.ok(dashboard.includes(fragmento), 'Dashboard sem integração: ' + fragmento);
assert.match(settings, /save-locations/);
assert.match(clients, /permitirVazio: false/);
for (const fragmento of ['dashboardFiltroLocal', 'clientesFiltroLocal', 'novoClienteLocal', 'financasFiltroLocal', 'modalLocaisOverlay', 'guardarLocaisCRM']) assert.ok(coach.includes(fragmento), 'Frontend sem integração: ' + fragmento);
assert.match(bridge, /locationId=/);

console.log('Contratos de ginásios, filtros e rendas validados.');
