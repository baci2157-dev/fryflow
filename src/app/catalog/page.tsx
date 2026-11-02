"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Carrot,
  Droplet,
  Leaf,
  Package,
  Plus,
  ShoppingBasket,
  Snowflake,
  Soup,
  Upload,
  Download,
  TriangleAlert,
} from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { ImportDialog } from "@/components/shared/import-dialog";
import { useToast } from "@/hooks/use-toast";
import { csvDateSuffix, downloadCsv } from "@/lib/csv";
import {
  PRODUCT_IMPORT_SAMPLE,
  parseProductsFile,
  runProductsImport,
} from "@/lib/import-products";
import {
  useProductsStore,
  type NewProductInput,
} from "@/lib/products-store";
import {
  PRODUCT_CATEGORY_COLOR,
  PRODUCT_CATEGORY_LABEL,
  type Product,
  type ProductCategory,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Экран «Каталог» — попутные товары (задача 9, cross-sell).
 *
 * Картофель фри везём точкам каждый день; вместе с ним удобно
 * продавать масло, соусы и зелень — та же машина, тот же рейс,
 * а маржа выше. Здесь — карточки товаров, фильтр по категориям,
 * добавление/импорт/экспорт.
 *
 * Интересы клиента (в его карточке) связываются с категориями
 * отсюда: при создании заказа FryFlow подсказывает «этот обычно
 * берёт масло», в маршруте дня — бейдж «Попутно».
 */

const money = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

/** Иконка категории: масло — капля, соус — соусница, зелень — лист. */
const CATEGORY_ICON: Record<ProductCategory, typeof Droplet> = {
  oil: Droplet,
  sauce: Soup,
  greens: Leaf,
  vegetables: Carrot,
  semis: Snowflake,
  packaging: Package,
};

const CATEGORY_KEYS = Object.keys(PRODUCT_CATEGORY_LABEL) as ProductCategory[];

export default function CatalogPage() {
  const products = useProductsStore((s) => s.products);
  const { toast } = useToast();

  const [cat, setCat] = useState<ProductCategory | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  /* ── Счётчики по категориям ── */
  const counts = useMemo(() => {
    const c = new Map<ProductCategory, number>();
    for (const p of products) c.set(p.category, (c.get(p.category) ?? 0) + 1);
    return c;
  }, [products]);

  const filtered = useMemo(
    () =>
      (cat === "all" ? products : products.filter((p) => p.category === cat))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [products, cat]
  );

  /* ── Сводка: стоимость склада попутных товаров ── */
  const stockValue = useMemo(
    () => products.reduce((sum, p) => sum + p.price * p.stock, 0),
    [products]
  );

  /* ── Экспорт CSV (Excel-дружелюбный: BOM + «;») ── */
  const exportCsv = () => {
    downloadCsv(
      `fryflow-catalog-${csvDateSuffix()}`,
      ["Название", "Категория", "Ед.", "Цена, ₽", "Себестоимость, ₽", "Маржа, ₽", "Остаток", "Описание"],
      filtered.map((p) => [
        p.name,
        PRODUCT_CATEGORY_LABEL[p.category],
        p.unit,
        p.price,
        p.cost,
        p.price - p.cost,
        p.stock,
        p.description,
      ])
    );
    toast({
      title: "CSV выгружен",
      description: `${filtered.length} товаров с текущим фильтром.`,
      duration: 3000,
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <ShoppingBasket className="size-6 text-accent" />
            Каталог
            <span className="rounded-full bg-tint px-2.5 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
              {products.length}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Попутные товары · склад{" "}
            <span className="font-mono tabular-nums text-ink">
              {money(stockValue)} ₽
            </span>{" "}
            — масло, соусы и зелень едут в той же машине
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
          >
            <Plus className="size-4" />
            Добавить товар
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-tint"
          >
            <Upload className="size-4" />
            Импорт JSON
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-tint"
          >
            <Download className="size-4" />
            Экспорт CSV
          </button>
        </div>
      </header>

      {/* ── Фильтр по категориям ── */}
      <div
        className="fryflow-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Категории товаров"
      >
        <CategoryChip
          active={cat === "all"}
          onClick={() => setCat("all")}
          label="Все"
          count={products.length}
        />
        {CATEGORY_KEYS.map((key) => (
          <CategoryChip
            key={key}
            active={cat === key}
            onClick={() => setCat(key)}
            label={PRODUCT_CATEGORY_LABEL[key]}
            count={counts.get(key) ?? 0}
            color={PRODUCT_CATEGORY_COLOR[key]}
            icon={CATEGORY_ICON[key]}
          />
        ))}
      </div>

      {/* ── Карточки товаров ── */}
      {filtered.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <ShoppingBasket className="size-8 text-ink-soft/50" />
          <p className="text-sm text-ink-soft">
            {cat === "all"
              ? "Каталог пуст — добавьте масло, соус или зелень."
              : `В категории «${PRODUCT_CATEGORY_LABEL[cat]}» пока нет товаров.`}
          </p>
          <button
            type="button"
            onClick={() => setCat("all")}
            className="text-sm font-medium text-accent hover:underline"
          >
            Показать все
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Форма товара ── */}
      <ProductFormDialog open={formOpen} onClose={() => setFormOpen(false)} />

      {/* ── Импорт JSON ── */}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Импорт товаров из JSON"
        what="товаров"
        sample={PRODUCT_IMPORT_SAMPLE}
        sampleName="fryflow-products-sample.json"
        run={(text, onProgress) => runProductsImport(parseProductsFile(text), onProgress)}
        onDone={(o) =>
          toast({
            title: `Импорт завершён: +${o.imported} товаров`,
            description:
              o.duplicates > 0
                ? `${o.duplicates} дублей пропущено (по названию).`
                : "Каталог обновлён.",
            duration: 4000,
          })
        }
      />
    </div>
  );
}

/* ── Чип категории ─────────────────────────────────────────── */

function CategoryChip({
  active,
  onClick,
  label,
  count,
  color,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
  icon?: typeof Droplet;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "border-transparent bg-ink text-bg"
          : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
      )}
    >
      {Icon && (
        <Icon
          className="size-3.5"
          style={active ? undefined : { color: color ?? "var(--accent)" }}
        />
      )}
      {label}
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          active ? "opacity-70" : "text-ink-soft"
        )}
      >
        {count}
      </span>
    </button>
  );
}

/* ── Карточка товара: воздушная, иконка категории, цена моно ── */

function ProductCard({ product: p }: { product: Product }) {
  const Icon = CATEGORY_ICON[p.category];
  const color = PRODUCT_CATEGORY_COLOR[p.category];
  const margin = p.price - p.cost;
  const marginPct = p.price > 0 ? Math.round((margin / p.price) * 100) : 0;
  const lowStock = p.stock <= 5;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="flex flex-col rounded-2xl border border-border bg-surface p-5"
    >
      {/* Шапка: иконка + бейдж категории */}
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
          }}
        >
          <Icon className="size-5" />
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
          }}
        >
          {PRODUCT_CATEGORY_LABEL[p.category]}
        </span>
      </div>

      {/* Название + описание */}
      <h3 className="mt-3 text-[15.5px] font-semibold leading-snug text-ink">
        {p.name}
      </h3>
      {p.description && (
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">
          {p.description}
        </p>
      )}

      {/* Низ: цена крупно моно + остаток */}
      <div className="mt-auto pt-4">
        <p className="text-right font-mono text-2xl font-semibold tabular-nums text-accent">
          {money(p.price)}{" "}
          <span className="text-sm font-medium text-ink-soft">₽</span>
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-[11.5px]">
          <span className="text-ink-soft">
            за <span className="font-medium text-ink">{p.unit}</span> · маржа{" "}
            <span className="font-mono tabular-nums text-tier-green">
              {marginPct}%
            </span>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono font-semibold tabular-nums",
              lowStock
                ? "bg-tier-red/10 text-tier-red"
                : "bg-tint text-ink-soft"
            )}
          >
            {lowStock && <TriangleAlert className="size-3" />}
            {p.stock} {p.unit}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

/* ── Форма «Добавить товар» ────────────────────────────────── */

function ProductFormDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const addProduct = useProductsStore((s) => s.addProduct);
  const { toast } = useToast();

  const [form, setForm] = useState<NewProductInput>({
    name: "",
    category: "oil",
    unit: "кг",
    price: 0,
    cost: 0,
    stock: 0,
    description: "",
  });
  const [touched, setTouched] = useState(false);

  const nameOk = form.name.trim().length >= 2;
  const priceOk = form.price > 0;
  const valid = nameOk && priceOk;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    addProduct({
      ...form,
      name: form.name.trim(),
      cost: Math.max(0, Math.round(form.cost)),
      price: Math.round(form.price),
      stock: Math.max(0, Math.round(form.stock)),
      description: form.description.trim(),
    });
    toast({
      title: "Товар добавлен",
      description: `«${form.name.trim()}» уже в каталоге — виден в подсказках к заказам.`,
      duration: 3200,
    });
    setForm({
      name: "",
      category: "oil",
      unit: "кг",
      price: 0,
      cost: 0,
      stock: 0,
      description: "",
    });
    setTouched(false);
    onClose();
  };

  const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);

  return (
    <SpringSheet
      open={open}
      onClose={onClose}
      variant="dialog"
      title="Новый товар"
    >
      <div className="mt-4 space-y-4 pb-2">
        {/* Название */}
        <div>
          <Label>Название *</Label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Масло фритюрное"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          {touched && !nameOk && (
            <p className="mt-1 text-[12px] text-tier-red">Название — минимум 2 символа</p>
          )}
        </div>

        {/* Категория — цветные кнопки */}
        <div>
          <Label>Категория *</Label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_KEYS.map((key) => {
              const active = form.category === key;
              const color = PRODUCT_CATEGORY_COLOR[key];
              const Icon = CATEGORY_ICON[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setForm({ ...form, category: key })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors"
                  style={{
                    color: active ? color : "var(--ink-soft)",
                    borderColor: active
                      ? `color-mix(in srgb, ${color} 55%, transparent)`
                      : "var(--border)",
                    background: active
                      ? `color-mix(in srgb, ${color} 12%, transparent)`
                      : "var(--surface)",
                  }}
                >
                  <Icon className="size-3.5" />
                  {PRODUCT_CATEGORY_LABEL[key]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Единица */}
        <div>
          <Label>Единица *</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["л", "кг", "шт"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={form.unit === u}
                onClick={() => setForm({ ...form, unit: u })}
                className={cn(
                  "h-10 rounded-xl border text-[13px] font-medium transition-colors",
                  form.unit === u
                    ? "border-accent bg-accent/15 text-ink"
                    : "border-border bg-surface text-ink-soft hover:bg-tint"
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Цена / закуп / остаток */}
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <Label>Цена, ₽ *</Label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={form.price || ""}
              onChange={(e) => setForm({ ...form, price: num(e.target.value) })}
              placeholder="350"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-right font-mono text-[15px] font-semibold tabular-nums text-ink focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <Label>Закуп, ₽</Label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={form.cost || ""}
              onChange={(e) => setForm({ ...form, cost: num(e.target.value) })}
              placeholder="260"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-right font-mono text-[15px] tabular-nums text-ink focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <Label>Остаток</Label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={form.stock || ""}
              onChange={(e) => setForm({ ...form, stock: num(e.target.value) })}
              placeholder="10"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-right font-mono text-[15px] tabular-nums text-ink focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
        {touched && !priceOk && (
          <p className="-mt-1 text-[12px] text-tier-red">Цена должна быть больше нуля</p>
        )}
        {priceOk && form.cost > 0 && form.price <= form.cost && (
          <p className="-mt-1 text-[12px] text-tier-yellow">
            Цена ниже закупа — маржа отрицательная, проверьте
          </p>
        )}

        {/* Описание */}
        <div>
          <Label>Описание</Label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="Фасовка, для кого, как продаётся…"
            className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {/* Кнопки */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-border bg-surface text-[14px] font-semibold text-ink transition-colors hover:bg-tint"
          >
            Отмена
          </button>
          <motion.button
            type="button"
            whileTap={valid ? { scale: 0.98 } : undefined}
            onClick={submit}
            className={cn(
              "h-11 flex-[2] rounded-xl text-[14px] font-semibold transition-colors",
              valid
                ? "bg-accent text-[#1C1A17] hover:bg-accent/90"
                : "cursor-not-allowed bg-tint text-ink-soft/60"
            )}
          >
            Добавить товар
          </motion.button>
        </div>
      </div>
    </SpringSheet>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
      {children}
    </label>
  );
}
