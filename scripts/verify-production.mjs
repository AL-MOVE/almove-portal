import assert from 'node:assert/strict';

const applications = [
  { name: 'Portal', url: 'https://portal.almove.pt/', marker: /Entra no teu acompanhamento|id="inicioSaudacao"/ },
  { name: 'CRM', url: 'https://crm.almove.pt/', marker: /Hoje no Coach|coach-firebase/ },
  { name: 'Coach', url: 'https://coach.almove.pt/', marker: /App Coach|coach-mobile|Entrar na área de gestão/ }
];

for (const application of applications) {
  const response = await fetch(application.url, { redirect: 'follow', cache: 'no-store' });
  assert.equal(response.status, 200, `${application.name}: página indisponível`);
  assert.equal(new URL(response.url).hostname, new URL(application.url).hostname, `${application.name}: saiu do domínio final`);
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /frame-ancestors 'none'/, `${application.name}: CSP incompleta`);
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=/, `${application.name}: HSTS em falta`);
  assert.match(await response.text(), application.marker, `${application.name}: interface inesperada`);
  console.log(`${application.name}: página, domínio e cabeçalhos OK.`);
}

const health = await fetch('https://portal.almove.pt/api/health', { cache: 'no-store' });
assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
for (const domain of ['crm.almove.pt', 'coach.almove.pt']) {
  const response = await fetch(`https://${domain}/api/dev-crm`, { cache: 'no-store' });
  assert.equal(response.status, 401, `${domain}: API de equipa não recusou pedido anónimo`);
}
const portalData = await fetch('https://portal.almove.pt/api/almove?fn=getBootstrapPortal', { cache: 'no-store' });
assert.equal(portalData.status, 400, 'Portal: API de dados não recusou pedido anónimo');
const invite = await fetch('https://portal.almove.pt/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(invite.status, 401, 'Portal: convite sem HMAC não foi recusado');

const configSource = await (await fetch('https://portal.almove.pt/js/firebase-config.js', { cache: 'no-store' })).text();
const apiKey = configSource.match(/apiKey:\s*['"]([^'"]+)/)?.[1];
assert.ok(apiKey, 'Firebase: apiKey pública não encontrada');
const firebaseProject = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(apiKey)}`);
assert.equal(firebaseProject.status, 200, 'Firebase: configuração de autenticação indisponível');
const domains = (await firebaseProject.json()).authorizedDomains || [];
for (const domain of ['portal.almove.pt', 'crm.almove.pt', 'coach.almove.pt']) assert.ok(domains.includes(domain), `Firebase: ${domain} não autorizado`);
console.log('APIs anónimas recusadas e três domínios autorizados no Firebase.');
