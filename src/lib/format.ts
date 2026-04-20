export function formatNumber(value: number, digits = 2) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat('es-SV', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(safeValue);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-SV', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
