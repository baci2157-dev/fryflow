"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleDot,
  Database,
  Download,
  Layers,
  Link2,
  PhoneOff,
  Plus,
  Search,
  Upload,
  Users,
} from "lucide-react";

import { ClientCard } from "@/components/crm/client-card";
import { ClientFormDialog } from "@/components/crm/client-form-dialog";
import { ClientSheet } from "@/components/crm/client-sheet";
import { ImportDialog } from "@/components/shared/import-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CLIENT_IMPORT_SAMPLE,
  parseClientsFile,
  runClientsImport,
} from "@/lib/import-clients";
import { useCrmStore } from "@/lib/clients-store";
import { calcHealthScore, isAtRisk } from "@/lib/health-score";
import { useUiStore } from "@/lib/ui-store";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  DISTRICTS,
  PRIORITY_COLOR_VAR,
  type Client,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Экран «Клиенты» — база CRM FryFlow.
 * Заголовок + счётчик, «+ Добавить» (янтарная), «Экспорт CSV»,
 * поиск через Command Palette. Фильтры-чипы с иконками и счётчиками,
 * селект района, карточки в стиле Apple Wallet.
 */

type ChipId = "all" | "green" | "yellow" | "red" | "risk" | "chains" | "nophone";

export default function ClientsPage() {
  const clients = useCrmStore((s) => s.clients);
  const hydrated = useCrmStore((s) => s.hydrated);
  const seeding = useCrmStore((s) => s.seeding);
  const { toast } = useToast();
  const togglePalette = useUiStore((s) => s.togglePalette);
  const focusClientId = useUiStore((s) => s.crmFocusClientId);
  const clearClientFocus = useUiStore((s) => s.clearClientFocus);
  const formIntent = useUiStore((s) => s.clientFormIntent);
  const clearClientFormIntent = useUiStore((s) => s.clearClientFormIntent);

  const [chip, setChip] = useState<ChipId>("all");
  const [district, setDistrict] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);
  // Локальные источники открытия + производные от интентов палитры —
  // без копирования в эффектах (setState-в-effect запрещён линтером).
  const [localSheetId, setLocalSheetId] = useState<string | null>(null);
  const [localFormOpen, setLocalFormOpen] = useState(false);
  const [localEditClient, setLocalEditClient] = useState<Client | null>(null);

  const focusClient = focusClientId
    ? (clients.find((c) => c.id === focusClientId) ?? null)
    : null;
  const sheetClient =
    focusClient ??
    (localSheetId ? (clients.find((c) => c.id === localSheetId) ?? null) : null);
  const editClient =
    formIntent?.mode === "edit"
      ? (clients.find((c) => c.id === formIntent.clientId) ?? null)
      : localEditClient;

  const closeSheet = () => {
    if (focusClientId) clearClientFocus();
    setLocalSheetId(null);
  };

  const closeForm = () => {
    if (formIntent) clearClientFormIntent();
    setLocalFormOpen(false);
  };

  const openNewForm = () => {
    setLocalEditClient(null);
    setLocalFormOpen(true);
  };

  const openEditForm = (client: Client) => {
    setLocalEditClient(client);
    setLocalFormOpen(true);
    setLocalSheetId(null);
    if (focusClientId) clearClientFocus();
  };

  /* ── Счётчики для чипов ── */
  const counts = useMemo(() => {
    const c = {
      all: clients.length,
      green: 0,
      yellow: 0,
      red: 0,
      risk: 0,
      chains: 0,
      nophone: 0,
    };
    for (const cl of clients) {
      if (cl.priorityTier === "green") c.green++;
      else if (cl.priorityTier === "yellow") c.yellow++;
      else c.red++;
      if (isAtRisk(cl)) c.risk++;
      if (cl.chainName) c.chains++;
      if (!cl.phone) c.nophone++;
    }
    return c;
  }, [clients]);

  const districtCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const cl of clients) map.set(cl.district, (map.get(cl.district) ?? 0) + 1);
    return map;
  }, [clients]);

  /* ── Фильтрация + сортировка ── */
  const filtered = useMemo(() => {
    const tierRank = { green: 0, yellow: 1, red: 2 } as const;
    return clients
      .filter((c) => {
        if (district !== "all" && c.district !== district) return false;
        switch (chip) {
          case "green":
          case "yellow":
          case "red":
            return c.priorityTier === chip;
          case "risk":
            return isAtRisk(c);
          case "chains":
            return Boolean(c.chainName);
          case "nophone":
            return !c.phone;
          default:
            return true;
        }
      })
      .sort((a, b) => {
        // Иерархия: приоритет → Health Score → название.
        const t = tierRank[a.priorityTier] - tierRank[b.priorityTier];
        if (t !== 0) return t;
        const sa = calcHealthScore(a).score ?? -1;
        const sb = calcHealthScore(b).score ?? -1;
        if (sb !== sa) return sb - sa;
        return a.name.localeCompare(b.name, "ru");
      });
  }, [clients, chip, district]);

  /* ── Экспорт CSV (BOM + «;» — открывается в Excel/Numbers) ── */
  const exportCsv = () => {
    const header = [
      "Название",
      "Тип",
      "Статус",
      "Приоритет",
      "Район",
      "Адрес",
      "Телефон",
      "Сеть",
      "Филиалов",
      "Health Score",
      "Широта",
      "Долгота",
      "Создан",
    ];
    const esc = (v: string | number | undefined | null) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((c) =>
      [
        esc(c.name),
        esc(CLIENT_TYPE_LABEL[c.type]),
        esc(CLIENT_STATUS_LABEL[c.status]),
        esc(c.priorityTier.toUpperCase()),
        esc(c.district),
        esc(c.address),
        esc(c.phone || "нет"),
        esc(c.chainName ?? ""),
        esc(c.chainSize ?? ""),
        esc(calcHealthScore(c).score ?? "нет"),
        esc(c.coordinates.lat),
        esc(c.coordinates.lng),
        esc(c.createdAt.slice(0, 10)),
      ].join(";")
    );
    const csv = "\uFEFF" + header.map(esc).join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fryflow-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "CSV выгружен",
      description: `${filtered.length} клиентов с текущими фильтрами.`,
      duration: 3000,
    });
  };

  /* ── Чипы фильтров ── */
  const chips: Array<{
    id: ChipId;
    label: string;
    count: number;
    icon: React.ReactNode;
  }> = [
    { id: "all", label: "Все", count: counts.all, icon: <Layers className="size-3.5" /> },
    {
      id: "green",
      label: "Green",
      count: counts.green,
      icon: <CircleDot className="size-3.5" style={{ color: PRIORITY_COLOR_VAR.green }} />,
    },
    {
      id: "yellow",
      label: "Yellow",
      count: counts.yellow,
      icon: <CircleDot className="size-3.5" style={{ color: PRIORITY_COLOR_VAR.yellow }} />,
    },
    {
      id: "red",
      label: "Red",
      count: counts.red,
      icon: <CircleDot className="size-3.5" style={{ color: PRIORITY_COLOR_VAR.red }} />,
    },
    {
      id: "risk",
      label: "В зоне риска",
      count: counts.risk,
      icon: <AlertTriangle className="size-3.5" style={{ color: "var(--tier-red)" }} />,
    },
    { id: "chains", label: "Сети", count: counts.chains, icon: <Link2 className="size-3.5" /> },
    { id: "nophone", label: "Без телефона", count: counts.nophone, icon: <PhoneOff className="size-3.5" /> },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <Users className="size-6 text-accent" />
            Клиенты
            <span className="rounded-full bg-tint px-2.5 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
              {clients.length}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {counts.chains} сетей · {counts.green} green · {counts.risk} в зоне риска
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openNewForm}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
          >
            <Plus className="size-4" />
            Добавить
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
          <button
            type="button"
            onClick={togglePalette}
            aria-label="Поиск клиентов (Command Palette)"
            title="Поиск — Ctrl+K / ⌘K"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-ink-soft transition-colors hover:bg-tint hover:text-ink"
          >
            <Search className="size-4" />
          </button>
        </div>
      </header>

      {/* ── Фильтры-чипы ── */}
      <div
        className="fryflow-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Фильтры клиентов"
      >
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={chip === c.id}
            onClick={() => setChip(c.id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              chip === c.id
                ? "border-transparent bg-ink text-bg"
                : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
            )}
          >
            {c.icon}
            {c.label}
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                chip === c.id ? "opacity-70" : "text-ink-soft"
              )}
            >
              {c.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Район + счётчик результата ── */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <label className="relative inline-flex items-center">
          <span className="sr-only">Фильтр по району</span>
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="h-10 appearance-none rounded-xl border border-border bg-surface pl-3.5 pr-9 text-[13.5px] text-ink focus:border-accent/50 focus:outline-none"
          >
            <option value="all">Все районы</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d} · {districtCounts.get(d) ?? 0}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3.5 text-[10px] text-ink-soft">
            ▾
          </span>
        </label>
        <p className="shrink-0 text-xs text-ink-soft">
          Показано <span className="font-mono tabular-nums">{filtered.length}</span> из{" "}
          <span className="font-mono tabular-nums">{clients.length}</span>
          {district !== "all" ? ` · ${district}` : ""}
        </p>
      </div>

      {/* Скелетон первого запуска: база 173 точек грузится из сида */}
      {clients.length === 0 && (!hydrated || seeding) ? (
        <div className="mt-4">
          <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink-soft">
            <Database className="size-4 animate-pulse text-accent" />
            Загружаем базу — 173 точки Ростова-на-Дону…
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[118px] animate-pulse rounded-2xl border border-border bg-surface"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        </div>
      ) : /* ── Карточки ── */
      filtered.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Users className="size-8 text-ink-soft/50" />
          {clients.length === 0 ? (
            <>
              <p className="text-sm font-medium text-ink">База пуста</p>
              <p className="max-w-xs text-[13px] leading-snug text-ink-soft">
                Восстановите её в Настройках — кнопка «Восстановить базу» — или добавьте точку вручную.
              </p>
              <button
                type="button"
                onClick={openNewForm}
                className="text-sm font-medium text-accent hover:underline"
              >
                + Добавить клиента
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Нет клиентов по этим фильтрам.</p>
              <button
                type="button"
                onClick={() => {
                  setChip("all");
                  setDistrict("all");
                }}
                className="text-sm font-medium text-accent hover:underline"
              >
                Сбросить фильтры
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onOpen={() => setLocalSheetId(client.id)}
              onEdit={() => openEditForm(client)}
            />
          ))}
        </div>
      )}

      {/* ── Лист деталей + форма ── */}
      <ClientSheet
        client={sheetClient}
        open={Boolean(sheetClient)}
        onClose={closeSheet}
        onEdit={openEditForm}
      />
      <ClientFormDialog
        open={localFormOpen || formIntent !== null}
        onClose={closeForm}
        editClient={editClient}
      />

      {/* ── Массовый импорт JSON (задача 9): валидация + дедуп + геокодинг ── */}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Импорт клиентов из JSON"
        what="клиентов"
        sample={CLIENT_IMPORT_SAMPLE}
        sampleName="fryflow-clients-sample.json"
        run={(text, onProgress) => runClientsImport(parseClientsFile(text), onProgress)}
        onDone={(o) =>
          toast({
            title:
              o.imported === 0 && o.duplicates > 0 && o.errors.length === 0
                ? "Новых клиентов нет — все записи уже в базе"
                : `Импорт завершён: +${o.imported} клиентов`,
            description:
              o.imported === 0 && o.duplicates > 0 && o.errors.length === 0
                ? `${o.duplicates} дубликатов пропущено — совпали по названию и адресу.`
                : [
                    o.duplicates > 0 ? `${o.duplicates} дублей пропущено` : null,
                    o.errors.length > 0 ? `${o.errors.length} с ошибками` : null,
                    o.warnings.length > 0 ? `${o.warnings.length} без точных координат` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Чистая загрузка — все записи в базе.",
            duration: 5000,
          })
        }
      />
    </div>
  );
}
