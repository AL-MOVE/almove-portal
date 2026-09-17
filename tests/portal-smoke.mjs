import assert from 'node:assert/strict';

const base = (process.env.PORTAL_BASE_URL || 'https://portal.almove.pt').replace(/\/$/, '');
const testEmail = process.env.PORTAL_TEST_EMAIL || '';

const pagina = await fetch(`${base}/`, { redirect: 'follow' });
assert.equal(pagina.status, 200, 'A página principal deve responder com 200');
assert.match(pagina.headers.get('content-security-policy') || '', /frame-ancestors 'none'/, 'CSP deve impedir incorporação');
const html = await pagina.text();
assert.match(html, /AL MOVE/, 'A página deve conter a marca AL MOVE');
assert.match(html, /id="inicioSaudacao"/, 'O ecrã inicial deve existir');

const saude = await fetch(`${base}/api/health`, { cache: 'no-store' });
assert.equal(saude.status, 200, 'O endpoint de saúde deve responder');
const estadoSaude = await saude.json();
assert.equal(estadoSaude.ok, true, 'O endpoint de saúde deve indicar ok');
assert.equal(estadoSaude.version ?? estadoSaude.versao, 53, 'O domínio deve estar na versão 53');

// O Avatar e o Mapa são módulos separados. Sem estes ficheiros as respetivas
// páginas parecem abrir, mas ficam vazias — uma falha fácil de não notar num
// deploy manual pela interface do GitHub.
for (const ficheiro of ['/js/avatar-studio.js', '/js/activity-heatmap.js']) {
  const modulo = await fetch(`${base}${ficheiro}`, { cache: 'no-store' });
  assert.equal(modulo.status, 200, `${ficheiro} deve estar publicado`);
  assert.match(await modulo.text(), /window\.ALMove/, `${ficheiro} deve expor o módulo esperado`);
}

const escritaPorGet = await fetch(`${base}/api/almove?fn=registarCheckin`, { headers: { 'X-ALMOVE-Session': 'invalida' } });
assert.equal(escritaPorGet.status, 405, 'GET não pode executar gravações');

// O smoke test nunca consome um link real. Confirma apenas que o fluxo público
// aceita o pedido com uma resposta neutra, sem revelar se o email existe.
if (testEmail) {
  const inicio = await fetch(`${base}/api/almove`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: 'pedirLinkLoginPortal', email: testEmail, dispositivo: 'GitHub Actions smoke test' })
  });
  const resposta = await inicio.json();
  assert.equal(resposta.ok, true, `O pedido de login deve ser aceite: ${resposta.erro || ''}`);
  assert.equal(resposta.dados?.enviado, true, 'A resposta pública deve permanecer neutra');
}

console.log(`Smoke test concluído em ${base}${testEmail ? ' com pedido de login' : ''}.`);
