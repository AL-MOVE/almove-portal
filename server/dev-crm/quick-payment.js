export const QUICK_PAYMENT_STATUSES = Object.freeze(['Pago', 'Pendente']);

export const QUICK_PAYMENT_METHODS = Object.freeze([
  '',
  'MB Way',
  'Transferência',
  'Mão',
  'Stripe',
  'Débito direto',
  'Multibanco',
  'Numerário'
]);

export function normalizeQuickPaymentStatus(value) {
  const normalized = String(value || '').trim();
  if (!QUICK_PAYMENT_STATUSES.includes(normalized)) throw new Error('ESTADO_PAGAMENTO_INVALIDO');
  return normalized;
}

export function normalizeQuickPaymentMethod(value, allowedMethods = QUICK_PAYMENT_METHODS) {
  const normalized = String(value || '').trim();
  if (!['', ...(allowedMethods || [])].includes(normalized)) throw new Error('METODO_PAGAMENTO_INVALIDO');
  return normalized;
}
