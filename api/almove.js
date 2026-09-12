// Este ficheiro vive em /api/almove.js no projecto da Vercel.
// É o "estafeta": recebe o pedido do browser (no mesmo domínio, sem CORS),
// fala com o Apps Script por trás (servidor-para-servidor, sem CORS),
// e devolve a resposta ao browser tal como veio.

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyiOl7KkXMYSFv9lKKVb2sMspvwER2P5IMlpNQcr9csLyEDnzJqvVqisE-XVuAHgeUV/exec';

export default async function handler(req, res) {
  try {
    let respostaGoogle;

    if (req.method === 'GET') {
      const params = new URLSearchParams(req.query);
      params.set('api', '1'); // <-- isto é que faltava: diz ao doGet para entrar no modo API
      respostaGoogle = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);
    } else if (req.method === 'POST') {
      // Enviamos como texto simples de propósito — evita que o browser peça
      // autorização prévia (preflight) ao Apps Script, que não sabe responder a isso.
      const corpo = Object.assign({}, req.body, { api: '1' });
      respostaGoogle = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(corpo),
      });
    } else {
      res.status(405).json({ ok: false, erro: 'Método não suportado' });
      return;
    }

    const texto = await respostaGoogle.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(texto);
  } catch (erro) {
    res.status(500).json({ ok: false, erro: String(erro) });
  }
}
