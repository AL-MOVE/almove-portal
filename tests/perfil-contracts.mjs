import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const esperados = new Map([
  ['dados', 'perfilDadosPessoais'], ['avatar', 'perfilAvatar'], ['plano', 'perfilPlano'],
  ['mapa', 'perfilMapa'], ['passaporte', 'perfilPassaporte'], ['evolucao', 'perfilEvolucao'],
  ['peso', 'perfilPesoDiario'], ['avaliacoes', 'perfilAvaliacoes'], ['caminhada', 'perfilMetricas'],
  ['corrida', 'perfilMetricas']
]);

for (const [atalho, painel] of esperados) {
  assert.match(html, new RegExp(`data-abrir-perfil="${atalho}"`), `Falta o atalho ${atalho}`);
  assert.match(html, new RegExp(`id="${painel}"`), `Falta o painel ${painel}`);
}

for (const modulo of ['/js/avatar-studio.js', '/js/activity-heatmap.js']) {
  assert.match(html, new RegExp(`<script src="${modulo}"></script>`), `Falta carregar ${modulo}`);
}

assert.match(html, /btnVoltarAvatar[\s\S]*fecharDetalhePerfilSimples\("perfilAvatar"\)/, 'O Avatar tem de permitir voltar ao Perfil');
assert.match(html, /carregarAvatarPortal\(false\)/, 'O Avatar tem de carregar a configuração guardada');
assert.match(html, /guardarAvatarPortal/, 'O Avatar tem de usar a gravação autenticada');
assert.match(html, /carregarMapaAtividadePortal\(\)/, 'O Mapa deve carregar sem abrir dados físicos');
assert.match(html, /carregarPassaporteTecnicoPortal\(\)/, 'O Passaporte deve carregar sem abrir dados físicos');
assert.match(html, /if \(id === "perfilMapa"\) carregarMapaAtividadePortal/, 'O atalho Mapa deve usar a leitura própria');
assert.match(html, /if \(id === "perfilPassaporte"\) carregarPassaporteTecnicoPortal/, 'O atalho Passaporte deve usar a leitura própria');
assert.doesNotMatch(html, /function iniciarDadosPerfil\(\)[\s\S]{0,600}obterProgressoPortal/, 'Abrir o Perfil não pode pedir o código de dados físicos');
console.log('Contratos de navegação do Perfil validados.');
