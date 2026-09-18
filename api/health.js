export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // `versao` mantém compatibilidade com o portal; `version` é o contrato
  // usado pelos monitores externos.
  res.status(200).json({ ok: true, servico: 'almove-portal', versao: 61, version: 61, data: new Date().toISOString() });
}
