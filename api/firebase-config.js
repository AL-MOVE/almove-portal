const CAMPOS_PUBLICOS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

function configuracaoPublica() {
  const bruto = String(process.env.FIREBASE_WEB_CONFIG_JSON || '').trim();
  if (!bruto) return null;
  let dados;
  try { dados = JSON.parse(bruto); } catch { return null; }
  const configuracao = {};
  for (const campo of CAMPOS_PUBLICOS) configuracao[campo] = String(dados[campo] || '').trim();
  if (!configuracao.apiKey || !configuracao.authDomain || !configuracao.projectId || !configuracao.appId) return null;
  return configuracao;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  }
  const configuracao = configuracaoPublica();
  if (!configuracao) return res.status(404).json({ ok: false, erro: 'Configuração indisponível' });
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json(configuracao);
}
