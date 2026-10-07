import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const coachCrm = fs.readFileSync(new URL('../coach-firebase.html', import.meta.url), 'utf8');
const loginCrm = fs.readFileSync(new URL('../dev-crm.html', import.meta.url), 'utf8');
const rotaPorHost = host => vercel.redirects.find(item => item.source === '/' && item.has?.some(regra => regra.type === 'host' && regra.value === host));

assert.equal(rotaPorHost('crm.almove.pt')?.destination, '/dev-crm.html?next=%2Fcoach-firebase.html');
assert.equal(rotaPorHost('coach.almove.pt')?.destination, '/coach-mobile.html');
assert.equal(rotaPorHost('portal.almove.pt'), undefined, 'O portal do cliente não pode ser reencaminhado para uma interface de equipa.');
assert.equal(rotaPorHost('crm.almove.pt')?.permanent, false, 'A raiz CRM deve poder mudar sem ficar memorizada pelo browser.');
assert.match(rotaPorHost('crm.almove.pt')?.destination || '', /next=%2Fcoach-firebase\.html/, 'A raiz CRM deve validar a sessão antes de abrir a interface.');
assert.equal(rotaPorHost('coach.almove.pt')?.permanent, false, 'A raiz Coach deve poder mudar sem ficar memorizada pelo browser.');
assert.match(loginCrm, /location\.hostname === 'crm\.almove\.pt'/, 'O login deve reconhecer o domínio curto do CRM.');
assert.match(loginCrm, /'almove:crm-next'/, 'O login deve preservar internamente o destino antes de limpar o endereço.');
assert.match(loginCrm, /history\.replaceState\(null, '', '\/'\)/, 'O login deve esconder a rota técnica no domínio CRM.');
assert.match(coachCrm, /location\.hostname === 'crm\.almove\.pt' && location\.pathname === '\/coach-firebase\.html'/, 'A interface deve reconhecer a rota técnica do CRM em Produção.');
assert.match(coachCrm, /history\.replaceState\(null, '', '\/'\)/, 'A interface autenticada deve manter apenas o endereço curto do CRM.');
assert.match(coachCrm, /App Coach \(mobile\)/, 'O CRM deve ter um atalho para a app Coach móvel.');
assert.match(coachCrm, /https:\/\/coach\.almove\.pt\//, 'Em produção, o atalho deve usar o domínio Coach.');
console.log('Rotas de produção por domínio validadas.');
