import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rotaPorHost = host => vercel.redirects.find(item => item.source === '/' && item.has?.some(regra => regra.type === 'host' && regra.value === host));

assert.equal(rotaPorHost('crm.almove.pt')?.destination, '/coach-firebase.html');
assert.equal(rotaPorHost('coach.almove.pt')?.destination, '/coach-mobile.html');
assert.equal(rotaPorHost('portal.almove.pt'), undefined, 'O portal do cliente não pode ser reencaminhado para uma interface de equipa.');
assert.equal(rotaPorHost('crm.almove.pt')?.permanent, false, 'A raiz CRM deve poder mudar sem ficar memorizada pelo browser.');
assert.equal(rotaPorHost('coach.almove.pt')?.permanent, false, 'A raiz Coach deve poder mudar sem ficar memorizada pelo browser.');
console.log('Rotas de produção por domínio validadas.');
