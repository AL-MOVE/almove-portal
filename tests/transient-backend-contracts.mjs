import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { erroTemporarioGoogle, respostaErroServico } from '../api/_transient-errors.js';

assert.equal(erroTemporarioGoogle({ code: 8, message: 'RESOURCE_EXHAUSTED' }), true);
assert.equal(erroTemporarioGoogle({ code: 14, message: 'UNAVAILABLE' }), true);
assert.equal(erroTemporarioGoogle({ code: 'ACESSO_NEGADO' }), false);
assert.deepEqual(respostaErroServico({ code: 8 }), { estado: 503, codigo: 'SERVICO_TEMPORARIAMENTE_INDISPONIVEL' });

const source = fs.readFileSync(new URL('../js/firebase-crm-session.js', import.meta.url), 'utf8');
let chamadas = 0;
const contexto = {
  window: null,
  Promise,
  setTimeout: callback => callback(),
  fetch: async () => {
    chamadas += 1;
    return { status: chamadas < 3 ? 503 : 200, ok: chamadas === 3 };
  }
};
contexto.window = contexto;
vm.runInNewContext(source, contexto, { filename: 'firebase-crm-session.js' });
const resposta = await contexto.AlMoveSessaoCRM.pedido('/api/teste', { method: 'GET' });
assert.equal(resposta.status, 200);
assert.equal(chamadas, 3, 'Pedidos GET transitórios devem ter retentativas limitadas.');

chamadas = 0;
contexto.fetch = async () => ({ status: (++chamadas, 401), ok: false });
const semRetentativa = await contexto.AlMoveSessaoCRM.pedido('/api/teste', { method: 'GET' });
assert.equal(semRetentativa.status, 401);
assert.equal(chamadas, 1, 'Erros de autenticação não podem ser repetidos automaticamente.');

console.log('Falhas transitórias do backend têm HTTP, retentativa e mensagens seguras.');
