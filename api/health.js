export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, servico: 'almove-portal', versao: 45, data: new Date().toISOString() });
}
