import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rotaPorHost = host => vercel.rewrites.find(item => item.source === '/' && item.has?.some(regra => regra.type === 'host' && new RegExp(regra.value).test(host)));

assert.equal(rotaPorHost('crm.almove.pt')?.destination, '/coach-firebase.html');
assert.equal(rotaPorHost('coach.almove.pt')?.destination, '/coach-mobile.html');
assert.equal(rotaPorHost('portal.almove.pt'), undefined, 'O portal do cliente não pode ser reencaminhado para uma interface de equipa.');
console.log('Rotas de produção por domínio validadas.');
