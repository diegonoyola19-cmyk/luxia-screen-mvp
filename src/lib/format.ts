export function formatNumber(value: number, digits = 2) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat('es-SV', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(safeValue);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('es-SV', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
