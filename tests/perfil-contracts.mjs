import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const esperados = new Map([
  ['dados', 'perfilDadosPessoais'], ['plano', 'perfilPlano'],
  ['mapa', 'perfilMapa'], ['passaporte', 'perfilPassaporte'], ['evolucao', 'perfilEvolucao'],
  ['peso', 'perfilPesoDiario'], ['avaliacoes', 'perfilAvaliacoes'], ['caminhada', 'perfilMetricas'],
  ['corrida', 'perfilMetricas']
]);

for (const [atalho, painel] of esperados) {
  assert.match(html, new RegExp(`data-abrir-perfil="${atalho}"`), `Falta o atalho ${atalho}`);
  assert.match(html, new RegExp(`id="${painel}"`), `Falta o painel ${painel}`);
}

for (const modulo of ['/js/activity-heatmap.js']) {
  assert.match(html, new RegExp(`<script src="${modulo}"></script>`), `Falta carregar ${modulo}`);
}

assert.doesNotMatch(html, /data-abrir-perfil="avatar"/, 'O avatar foi removido das opções do cliente.');
assert.doesNotMatch(html, /<script src="\/js\/avatar-studio\.js"><\/script>/, 'O módulo de avatar não deve atrasar o portal.');
assert.match(html, /carregarMapaAtividadePortal\(\)/, 'O Mapa deve carregar sem abrir dados físicos');
assert.match(html, /carregarPassaporteTecnicoPortal\(\)/, 'O Passaporte deve carregar sem abrir dados físicos');
assert.match(html, /if \(id === "perfilMapa"\) \{[\s\S]*carregarMapaAtividadePortal/, 'O atalho Mapa deve usar a leitura própria e mostrar carregamento.');
assert.match(html, /if \(id === "perfilPassaporte"\) \{[\s\S]*carregarPassaporteTecnicoPortal/, 'O atalho Passaporte deve usar a leitura própria e mostrar carregamento.');
assert.doesNotMatch(html, /function iniciarDadosPerfil\(\)[\s\S]{0,600}obterProgressoPortal/, 'Abrir o Perfil não pode pedir o código de dados físicos');
console.log('Contratos de navegação do Perfil validados.');
