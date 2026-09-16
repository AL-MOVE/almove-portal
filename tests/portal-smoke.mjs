import assert from 'node:assert/strict';

const base = (process.env.PORTAL_BASE_URL || 'https://almove-portal.vercel.app').replace(/\/$/, '');
const token = process.env.PORTAL_TEST_TOKEN || '';

const pagina = await fetch(`${base}/`, { redirect: 'follow' });
assert.equal(pagina.status, 200, 'A página principal deve responder com 200');
assert.match(pagina.headers.get('content-security-policy') || '', /frame-ancestors 'none'/, 'CSP deve impedir incorporação');
const html = await pagina.text();
assert.match(html, /AL MOVE/, 'A página deve conter a marca AL MOVE');
assert.match(html, /id="inicioSaudacao"/, 'O ecrã inicial deve existir');

const saude = await fetch(`${base}/api/health`, { cache: 'no-store' });
assert.equal(saude.status, 200, 'O endpoint de saúde deve responder');
assert.equal((await saude.json()).ok, true, 'O endpoint de saúde deve indicar ok');

const escritaPorGet = await fetch(`${base}/api/almove?fn=registarCheckin`, { headers: { 'X-ALMOVE-Session': 'invalida' } });
assert.equal(escritaPorGet.status, 405, 'GET não pode executar gravações');

if (token) {
  const inicio = await fetch(`${base}/api/almove`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: 'criarSessaoPortal', token, dispositivo: 'GitHub Actions smoke test' })
  });
  const sessao = await inicio.json();
  assert.equal(sessao.ok, true, `A sessão de teste deve iniciar: ${sessao.erro || ''}`);
  const resumo = await fetch(`${base}/api/almove?fn=getResumoInicioPortal&data=%7B%7D`, {
    headers: { 'X-ALMOVE-Session': sessao.dados.sessao }
  });
  const dados = await resumo.json();
  assert.equal(dados.ok, true, `A leitura autenticada deve funcionar: ${dados.erro || ''}`);
}

console.log(`Smoke test concluído em ${base}${token ? ' com sessão autenticada' : ''}.`);
