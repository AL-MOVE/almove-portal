import { obterAdminFirebase } from './_firebase.js';

const PROJETO_DEVELOPMENT = 'almove-portal-dev';
const AMBIENTES = new Set(['development', 'production']);

/**
 * Define qual o único projeto Firebase que pode servir o CRM neste deployment.
 * Development não é configurável para evitar que uma variável acidental exponha
 * dados de outro projeto. Production só abre com ambos os valores explícitos.
 */
export function obterAmbienteCrm(variaveis = process.env) {
  const ambiente = String(variaveis.ALMOVE_CRM_ENV || 'development').trim().toLowerCase();
  if (!AMBIENTES.has(ambiente)) return Object.freeze({ ambiente: '', projetoPermitido: '' });
  if (ambiente === 'development') return Object.freeze({ ambiente, projetoPermitido: PROJETO_DEVELOPMENT });

  const projetoPermitido = String(variaveis.ALMOVE_CRM_PROJECT_ID || '').trim();
  return Object.freeze({ ambiente, projetoPermitido });
}

/** O browser nunca decide o ambiente: esta validação corre apenas no servidor. */
export function crmFirebasePermitido(variaveis = process.env) {
  const configuracao = obterAmbienteCrm(variaveis);
  if (!configuracao.projetoPermitido) return false;
  return obterAdminFirebase().projeto === configuracao.projetoPermitido;
}
