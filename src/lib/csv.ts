/**
 * Экспорт CSV для FryFlow.
 *
 * Требования владельца: файл должен открываться в русском Excel без
 * кракозябр — поэтому BOM (UTF-8 с сигнатурой) и разделитель «;»
 * (в русской локали Excel запятая — десятичный разделитель).
 */

/** Экранирование ячейки: кавычки удваиваются, обрамляем при спецсимволах. */
function escapeCell(value: string | number): string {
  const s = String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Собирает CSV-содержимое: заголовки + строки.
 * Строки — массивы ячеек; первый аргумент rows — заголовки.
 */
export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number>>
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(";"));
  // BOM — чтобы Excel распознал UTF-8, \r\n — родной перевод строки Win.
  return "\uFEFF" + lines.join("\r\n");
}

/** Скачивает CSV-файл с именем вида fryflow-orders-2026-11-02.csv. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Дата для имени файла: 2026-11-02. */
export function csvDateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}
