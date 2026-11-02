"use client";

import { useProductsStore, type NewProductInput } from "@/lib/products-store";
import type { ProductCategory } from "@/types/models";

/**
 * Импорт каталога попутных товаров из JSON (задача 9 — по аналогии
 * с клиентами). Формат: массив объектов
 *   { name, category, unit, price, cost, stock, description }
 *
 * Дедупликация — по name (регистр не важит). Битые строки собираются
 * в список с причинами, файл целиком не отбраковывается.
 */

const CATEGORIES: readonly ProductCategory[] = [
  "oil",
  "sauce",
  "greens",
  "vegetables",
  "semis",
  "packaging",
];
const UNITS = ["л", "кг", "шт"] as const;

export interface ProductImportRow {
  name?: unknown;
  category?: unknown;
  unit?: unknown;
  price?: unknown;
  cost?: unknown;
  stock?: unknown;
  description?: unknown;
}

export interface ImportIssue {
  name: string;
  reason: string;
}

export interface ImportOutcome {
  imported: number;
  duplicates: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export type ImportProgress = (done: number, total: number, label: string) => void;

function parseRow(
  row: ProductImportRow,
  index: number
): { ok: true; input: NewProductInput } | { ok: false; name: string; reason: string } {
  const fallbackName = `Строка ${index + 1}`;

  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (name.length < 2) return { ok: false, name: fallbackName, reason: "Не указано название" };

  const category =
    typeof row.category === "string" && CATEGORIES.includes(row.category as ProductCategory)
      ? (row.category as ProductCategory)
      : null;
  if (!category) {
    return {
      ok: false,
      name,
      reason: `Категория «${String(row.category)}» — нужно: oil, sauce, greens, vegetables, semis, packaging`,
    };
  }

  const unit =
    typeof row.unit === "string" && (UNITS as readonly string[]).includes(row.unit)
      ? (row.unit as NewProductInput["unit"])
      : null;
  if (!unit) return { ok: false, name, reason: `Единица «${String(row.unit)}» — нужно: л, кг или шт` };

  const price = Number(row.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, name, reason: "Цена должна быть числом больше нуля" };
  }
  const cost = Number(row.cost ?? 0);
  if (!Number.isFinite(cost) || cost < 0) {
    return { ok: false, name, reason: "Себестоимость должна быть числом ≥ 0" };
  }
  const stock = Number(row.stock ?? 0);
  if (!Number.isFinite(stock) || stock < 0) {
    return { ok: false, name, reason: "Остаток должен быть числом ≥ 0" };
  }

  return {
    ok: true,
    input: {
      name,
      category,
      unit,
      price: Math.round(price),
      cost: Math.round(cost),
      stock: Math.round(stock),
      description: typeof row.description === "string" ? row.description.trim() : "",
    },
  };
}

export interface ParsedProductsFile {
  valid: Array<{ input: NewProductInput; name: string }>;
  errors: ImportIssue[];
  total: number;
}

/** Разбор JSON-текста каталога. Бросает Error при битом JSON/структуре. */
export function parseProductsFile(text: string): ParsedProductsFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Файл не является корректным JSON");
  }

  const rows: unknown[] | null = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { products?: unknown[] }).products)
      ? ((data as { products: unknown[] }).products)
      : null;
  if (!rows) {
    throw new Error('Ожидается массив объектов или { "products": [...] }');
  }

  const valid: ParsedProductsFile["valid"] = [];
  const errors: ImportIssue[] = [];
  rows.forEach((raw, i) => {
    const parsed = parseRow(raw as ProductImportRow, i);
    if (parsed.ok) valid.push({ input: parsed.input, name: parsed.input.name });
    else errors.push({ name: parsed.name, reason: parsed.reason });
  });
  return { valid, errors, total: rows.length };
}

/** Импорт каталога: дедуп по названию + запись в стор. */
export async function runProductsImport(
  parsed: ParsedProductsFile,
  onProgress: ImportProgress
): Promise<ImportOutcome> {
  const existing = new Set(
    useProductsStore.getState().products.map((p) => p.name.toLowerCase())
  );
  const addProduct = useProductsStore.getState().addProduct;

  let imported = 0;
  let duplicates = 0;
  const total = parsed.valid.length;

  parsed.valid.forEach(({ input, name }, i) => {
    onProgress(i, total, name);
    const dedup = input.name.toLowerCase();
    if (existing.has(dedup)) {
      duplicates++;
      return;
    }
    addProduct(input);
    existing.add(dedup);
    imported++;
  });

  onProgress(total, total, "готово");
  return { imported, duplicates, errors: parsed.errors, warnings: [] };
}

export const PRODUCT_IMPORT_SAMPLE = JSON.stringify(
  [
    {
      name: "Масло фритюрное",
      category: "oil",
      unit: "л",
      price: 1200,
      cost: 950,
      stock: 18,
      description: "Канистра 5 л",
    },
    {
      name: "Котлеты для бургеров",
      category: "semis",
      unit: "кг",
      price: 480,
      cost: 360,
      stock: 30,
      description: "Замороженные, 100 г — идеальны к фри",
    },
  ],
  null,
  2
);
