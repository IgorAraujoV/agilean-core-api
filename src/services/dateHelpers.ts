/**
 * Converte Date para ISO string, retornando null se o Date for inválido (NaN).
 * building.date(col) retorna new Date(NaN) quando a coluna está fora do range do calendário.
 * Chamar .toISOString() em Date(NaN) lança RangeError: Invalid time value.
 */
export function safeISOString(date: Date): string | null {
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Versão que nunca retorna null — usa epoch como fallback e loga warning.
 * Para campos obrigatórios (startDate, endDate, plannedStartDate, plannedEndDate).
 */
export function safeISOStringRequired(date: Date, context?: string): string {
  if (isNaN(date.getTime())) {
    console.warn(`[WARN] Invalid Date convertida para epoch — ${context ?? 'unknown context'}`);
    return new Date(0).toISOString();
  }
  return date.toISOString();
}
