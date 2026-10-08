const CODIGOS_GOOGLE_TEMPORARIOS = new Set(['4', '8', '10', '13', '14']);
const NOMES_GOOGLE_TEMPORARIOS = [
  'deadline-exceeded', 'resource-exhausted', 'aborted', 'internal', 'unavailable',
  'deadline_exceeded', 'resource_exhausted'
];

export function codigoErro(erro, predefinido = 'FALHA') {
  return String(erro?.code ?? erro?.message ?? predefinido).trim() || predefinido;
}

export function erroTemporarioGoogle(erro) {
  const codigo = codigoErro(erro, '').toLowerCase();
  const mensagem = String(erro?.message || '').toLowerCase();
  return CODIGOS_GOOGLE_TEMPORARIOS.has(codigo)
    || NOMES_GOOGLE_TEMPORARIOS.some(nome => codigo.includes(nome) || mensagem.includes(nome));
}

export function respostaErroServico(erro, predefinido = 'FALHA') {
  if (erroTemporarioGoogle(erro)) {
    return Object.freeze({ estado: 503, codigo: 'SERVICO_TEMPORARIAMENTE_INDISPONIVEL' });
  }
  return Object.freeze({ estado: 500, codigo: codigoErro(erro, predefinido) });
}

export function registarErroTemporario(origem, erro) {
  const codigo = codigoErro(erro, 'FALHA');
  const mensagem = String(erro?.message || '').trim();
  console.error('[ALMOVE_API]', String(origem || 'desconhecida'), { codigo, mensagem });
}
