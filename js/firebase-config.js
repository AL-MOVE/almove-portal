/* Configuração pública da aplicação Web Firebase em produção.
 * Não contém palavras-passe, contas de serviço ou chaves administrativas.
 * Em pré-visualizações, a configuração vem da Vercel para nunca apontar
 * clientes de teste ao projeto Firebase real.
 */
const CONFIGURACAO_PRODUCAO = Object.freeze({
  apiKey: 'AIzaSyBSklEif8LB-XSqU2YkIOKa_6V-tWdFY5U',
  authDomain: 'almove-portal.firebaseapp.com',
  projectId: 'almove-portal',
  storageBucket: 'almove-portal.firebasestorage.app',
  messagingSenderId: '373380729689',
  appId: '1:373380729689:web:18e269a5512fc8e65eda48'
});

function validarConfiguracaoFirebase(configuracao) {
  if (!configuracao || typeof configuracao !== 'object') return null;
  const campos = ['apiKey', 'authDomain', 'projectId', 'appId'];
  if (campos.some(campo => !String(configuracao[campo] || '').trim())) return null;
  return Object.freeze({
    apiKey: String(configuracao.apiKey),
    authDomain: String(configuracao.authDomain),
    projectId: String(configuracao.projectId),
    storageBucket: String(configuracao.storageBucket || ''),
    messagingSenderId: String(configuracao.messagingSenderId || ''),
    appId: String(configuracao.appId)
  });
}

let configuracaoPreVisualizacao = null;
async function obterConfiguracaoFirebase() {
  if (location.hostname === 'portal.almove.pt') return CONFIGURACAO_PRODUCAO;
  if (configuracaoPreVisualizacao) return configuracaoPreVisualizacao;
  const resposta = await fetch('/api/firebase-config', { cache: 'no-store', credentials: 'same-origin' });
  if (!resposta.ok) throw new Error('CONFIGURACAO_FIREBASE_EM_FALTA');
  const configuracao = validarConfiguracaoFirebase(await resposta.json());
  if (!configuracao) throw new Error('CONFIGURACAO_FIREBASE_EM_FALTA');
  configuracaoPreVisualizacao = configuracao;
  return configuracao;
}

window.ALMOVE_FIREBASE_CONFIG = Object.freeze({ obter: obterConfiguracaoFirebase });
