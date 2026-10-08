export const METODOS_PAGAMENTO_PADRAO = Object.freeze([
  'MB Way', 'Transferência', 'Mão', 'Stripe', 'Débito direto', 'Multibanco', 'Numerário'
]);

export const CATEGORIAS_DESPESA_PADRAO = Object.freeze([
  'Renda do ginásio', 'Software e subscrições', 'Equipamento', 'Marketing', 'Transporte', 'Serviços profissionais', 'Outros'
]);
export const TIPOS_NOTA_PADRAO = Object.freeze(['Nota', 'Contacto', 'Saúde', 'Decisão']);
export const MODOS_ESPECIAIS_PADRAO = Object.freeze(['Férias', 'Deload']);
export const MODALIDADES_CONTRATO_PADRAO = Object.freeze(['Mensal', 'Total antecipado', 'Por sessão', 'Outra']);
export const PRAZOS_REVISAO_PADRAO = Object.freeze([28, 42, 56, 84, 112]);

function falha(codigo) { const erro = new Error(codigo); erro.code = codigo; return erro; }
function texto(valor, maximo = 80) { return String(valor ?? '').trim().slice(0, maximo); }

function normalizarLista(entrada, predefinida, codigo) {
  const origem = entrada == null ? predefinida : entrada;
  if (!Array.isArray(origem) || origem.length < 1 || origem.length > 30) throw falha(codigo + '_INVALIDOS');
  const vistos = new Set();
  const lista = origem.map(item => {
    const valor = texto(item);
    const chave = valor.toLocaleLowerCase('pt-PT');
    if (!valor) throw falha(codigo + '_INVALIDOS');
    if (vistos.has(chave)) throw falha(codigo + '_DUPLICADOS');
    vistos.add(chave);
    return valor;
  });
  return Object.freeze(lista);
}

function normalizarPrazos(entrada) {
  const origem = entrada == null ? PRAZOS_REVISAO_PADRAO : entrada;
  if (!Array.isArray(origem) || origem.length < 1 || origem.length > 20) throw falha('PRAZOS_REVISAO_INVALIDOS');
  const prazos = origem.map(Number);
  if (prazos.some(valor => !Number.isInteger(valor) || valor < 7 || valor > 365) || new Set(prazos).size !== prazos.length) throw falha('PRAZOS_REVISAO_INVALIDOS');
  return Object.freeze(prazos);
}

export function normalizarOpcoesOperacionais(entrada = {}) {
  return Object.freeze({
    metodosPagamento: normalizarLista(entrada.metodosPagamento, METODOS_PAGAMENTO_PADRAO, 'METODOS_PAGAMENTO'),
    categoriasDespesa: normalizarLista(entrada.categoriasDespesa, CATEGORIAS_DESPESA_PADRAO, 'CATEGORIAS_DESPESA'),
    tiposNota: normalizarLista(entrada.tiposNota, TIPOS_NOTA_PADRAO, 'TIPOS_NOTA'),
    modosEspeciais: normalizarLista(entrada.modosEspeciais, MODOS_ESPECIAIS_PADRAO, 'MODOS_ESPECIAIS'),
    modalidadesContrato: normalizarLista(entrada.modalidadesContrato, MODALIDADES_CONTRATO_PADRAO, 'MODALIDADES_CONTRATO'),
    prazosRevisaoAvaliacao: normalizarPrazos(entrada.prazosRevisaoAvaliacao)
  });
}

export async function carregarOpcoesOperacionais(db) {
  const snap = await db.collection('crmDevelopmentSettings').doc('operational-options').get();
  const dados = snap.exists ? snap.data() || {} : {};
  const opcoes = normalizarOpcoesOperacionais(dados);
  return Object.freeze({ ...opcoes, revision: Number(dados.revision || 0), configured: snap.exists });
}
