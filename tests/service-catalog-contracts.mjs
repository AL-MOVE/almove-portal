import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_SERVICE_CATALOG,
  normalizeServiceCatalog,
  packShapeForService,
  priceForService,
  serviceByCode
} from '../server/dev-crm/service-catalog.js';

assert.equal(serviceByCode(DEFAULT_SERVICE_CATALOG, '1x45').preco, 119);
assert.equal(serviceByCode(DEFAULT_SERVICE_CATALOG, '2x45').preco, 219);
assert.deepEqual(packShapeForService(serviceByCode(DEFAULT_SERVICE_CATALOG, '2x45')), {
  frequencia: '2x45', sessoesTotal: 8, duracaoMinutos: 45, servicoId: '2x45', servicoNome: 'PT - 2x45 min'
});

assert.deepEqual(priceForService({
  catalogo: DEFAULT_SERVICE_CATALOG,
  codigo: '2x45',
  cliente: { precoPersonalizado: 99, precoPersonalizadoServico: '1x45' }
}), { preco: 219, origem: 'catalogo', servico: serviceByCode(DEFAULT_SERVICE_CATALOG, '2x45') });

assert.equal(priceForService({
  catalogo: DEFAULT_SERVICE_CATALOG,
  codigo: '2x45',
  cliente: { precoPersonalizado: 189.9, precoPersonalizadoServico: '2x45' }
}).preco, 189.9);

assert.equal(priceForService({
  catalogo: DEFAULT_SERVICE_CATALOG,
  codigo: '1x30',
  packsAnteriores: [
    { frequencia: '2x45', mesAno: '2026-09', preco: 219 },
    { frequencia: '1x30', mesAno: '2026-08', preco: 89 }
  ]
}).preco, 89);

assert.throws(() => priceForService({ catalogo: DEFAULT_SERVICE_CATALOG, codigo: '1x30', permitirLegado: false }), /SERVICO_SEM_PRECO/);
const inativo = DEFAULT_SERVICE_CATALOG.map(item => item.codigo === '1x45' ? { ...item, ativo: false } : item);
assert.throws(() => priceForService({ catalogo: inativo, codigo: '1x45' }), /SERVICO_INDISPONIVEL/);
assert.equal(priceForService({ catalogo: inativo, codigo: '1x45', permitirServicoInativo: true }).preco, 119);
assert.throws(() => normalizeServiceCatalog([
  { id: 'a', codigo: 'duo', nome: 'Duo A', sessoesPorSemana: 1, duracaoMinutos: 45, preco: 100 },
  { id: 'b', codigo: 'duo', nome: 'Duo B', sessoesPorSemana: 2, duracaoMinutos: 45, preco: 180 }
]), /CODIGO_SERVICO_DUPLICADO/);

const actions = fs.readFileSync(new URL('../server/dev-crm/dev-crm-client-actions.js', import.meta.url), 'utf8');
const renewals = fs.readFileSync(new URL('../server/dev-crm/dev-crm-renewals.js', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../server/dev-crm/dev-crm-settings.js', import.meta.url), 'utf8');
const crm = fs.readFileSync(new URL('../coach-firebase.html', import.meta.url), 'utf8');
assert.match(actions, /precoPersonalizadoServico/);
assert.match(actions, /PACK_PAGO_REQUER_CONFIRMACAO/);
assert.match(actions, /priceForService/);
assert.match(renewals, /priceForService/);
assert.match(settings, /save-service-catalog/);
assert.match(crm, /Serviços e preços/);
assert.match(crm, /guardarCatalogoServicos/);
assert.match(crm, /atualizarPreviaPrecoPack/);

console.log('Catálogo e cálculo de preços validados.');
