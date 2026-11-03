"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { LocateFixed, Layers, MessageSquareText, Phone, Snowflake } from "lucide-react";
import { format } from "date-fns";

import { CallCard } from "@/components/calls/call-card";
import { CallResultSheet } from "@/components/calls/result-sheet";
import { ScriptsPanel } from "@/components/calls/scripts-panel";
import { useCrmStore } from "@/lib/clients-store";
import { useOrdersStore } from "@/lib/orders-store";
import { haversineKm } from "@/lib/route-algorithm";
import type { CallsFilter } from "@/lib/ui-store";
import { useUiStore } from "@/lib/ui-store";
import { DISTRICTS, type Call, type ClientStatus } from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Экран «Звонки» — воронка холодных продаж.
 *
 * Сортировка списка: сначала green-приоритет, потом yellow, потом red;
 * внутри приоритета — кто дольше не получал внимания (по дате
 * последнего звонка; не звонили вовсе — наверх).
 *
 * Задача 18C — гео-сортировка: если на сегодня есть заказы с координатами
 * (адрес доставки = клиент заказа), список сортируется по расстоянию
 * (гаверсинус, lib/route-algorithm) до ближайшего сегодняшнего заказа:
 * до 2 км — бейдж «Рядом с заказом» (зелёный), 2–5 км — «Близко»
 * (жёлтый). Кнопка «Показывать только рядом» режет список до 2 км.
 * Заказов на сегодня нет — прежняя сортировка по приоритету и давности.
 *
 * Чипы-фильтры: Все / Холодные / Недозвон / Перезвонить / Проба / Отказ,
 * селект района. «Скрипты» — панель с возражениями и калькулятором.
 *
 * Интент из других разделов («План на сегодня» на дашборде) выводится
 * при рендере поверх локального состояния и сбрасывается при первом
 * действии пользователя — без setState-в-effect.
 */

const FILTERS: Array<{
  id: CallsFilter;
  label: string;
  status?: ClientStatus;
}> = [
  { id: "all", label: "Все" },
  { id: "cold", label: "Холодные", status: "cold" },
  { id: "no_answer", label: "Недозвон", status: "no_answer" },
  { id: "callback", label: "Перезвонить", status: "callback" },
  { id: "trial", label: "Проба", status: "trial" },
  { id: "refused", label: "Отказ", status: "refused" },
];

export default function CallsPage() {
  const clients = useCrmStore((s) => s.clients);
  const calls = useCrmStore((s) => s.calls);
  const routeStops = useCrmStore((s) => s.routeStops);

  const callsIntent = useUiStore((s) => s.callsIntent);
  const clearCallsIntent = useUiStore((s) => s.clearCallsIntent);

  const [chip, setChip] = useState<CallsFilter>("all");
  const [district, setDistrict] = useState("all");
  const [resultClientId, setResultClientId] = useState<string | null>(null);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  /* Задача 18C: «Показывать только рядом» — радиус 2 км от сегодняшних заказов. */
  const [nearbyOnly, setNearbyOnly] = useState(false);

  // Интент (переход с дашборда) бьёт над локальным выбором до первого
  // действия пользователя — затем он сбрасывается.
  const activeChip: CallsFilter = callsIntent?.filter ?? chip;
  const highlightId = callsIntent?.clientId ?? null;

  const applyChip = (f: CallsFilter) => {
    clearCallsIntent();
    setChip(f);
  };

  /* Сводка звонков по клиентам: попытки, последний звонок, ближайший перезвон. */
  const callsByClient = useMemo(() => {
    const map = new Map<
      string,
      { attempts: number; last: Call | null; callback?: string }
    >();
    for (const c of calls) {
      const entry = map.get(c.clientId) ?? { attempts: 0, last: null };
      entry.attempts += 1;
      if (!entry.last) entry.last = c;
      if (
        c.result === "callback" &&
        c.callbackDate &&
        (!entry.callback || c.callbackDate < entry.callback)
      ) {
        entry.callback = c.callbackDate;
      }
      map.set(c.clientId, entry);
    }
    return map;
  }, [calls]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: clients.length };
    for (const f of FILTERS) {
      if (f.status) c[f.id] = clients.filter((x) => x.status === f.status).length;
    }
    return c;
  }, [clients]);

  const districtCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const cl of clients) map.set(cl.district, (map.get(cl.district) ?? 0) + 1);
    return map;
  }, [clients]);

  /* ── Задача 18C: гео-сортировка по близости к сегодняшним заказам ──
   * Опорные точки — клиенты заказов с доставкой сегодня (адрес доставки
   * заказа = адрес его клиента). Черновики и точки с примерными
   * координатами (needsGeocode — центр города) опорой не служат. */
  const orders = useOrdersStore((s) => s.orders);
  const todayOrderPoints = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const byId = new Map(clients.map((c) => [c.id, c]));
    const pts: Array<{ lat: number; lng: number }> = [];
    for (const o of orders) {
      if (o.deliveryDate !== today || o.isDraft) continue;
      const cl = byId.get(o.clientId);
      if (cl && !cl.needsGeocode) pts.push(cl.coordinates);
    }
    return pts;
  }, [orders, clients]);

  const geoMode = todayOrderPoints.length > 0;

  /* Расстояние каждого клиента до ближайшего заказа сегодня, км. */
  const distanceKm = useMemo(() => {
    const map = new Map<string, number>();
    if (!geoMode) return map;
    for (const c of clients) {
      let best = Infinity;
      for (const p of todayOrderPoints) {
        const d = haversineKm(c.coordinates, p);
        if (d < best) best = d;
      }
      map.set(c.id, best);
    }
    return map;
  }, [clients, todayOrderPoints, geoMode]);

  const nearbyCount = useMemo(
    () =>
      geoMode
        ? [...distanceKm.values()].filter((d) => d <= 2).length
        : 0,
    [geoMode, distanceKm]
  );

  /* Фильтрация + сортировка. Заказы на сегодня есть (geoMode) —
   * сортируем по расстоянию до ближайшего заказа (Задача 18C);
   * нет — green → yellow → red, внутри — по давности последнего
   * звонка (кто дольше без внимания, тот выше). */
  const sorted = useMemo(() => {
    const tierRank = { green: 0, yellow: 1, red: 2 } as const;
    const list = clients.filter((c) => {
      if (district !== "all" && c.district !== district) return false;
      if (nearbyOnly && (distanceKm.get(c.id) ?? Infinity) > 2) return false;
      const f = FILTERS.find((x) => x.id === activeChip);
      return !f?.status || c.status === f.status;
    });
    if (geoMode) {
      return list.sort(
        (a, b) =>
          (distanceKm.get(a.id) ?? Infinity) -
            (distanceKm.get(b.id) ?? Infinity) ||
          a.name.localeCompare(b.name, "ru")
      );
    }
    return list.sort((a, b) => {
      const t = tierRank[a.priorityTier] - tierRank[b.priorityTier];
      if (t !== 0) return t;
      const la = callsByClient.get(a.id)?.last?.createdAt ?? "";
      const lb = callsByClient.get(b.id)?.last?.createdAt ?? "";
      if (la !== lb) return la.localeCompare(lb); // кто дольше без звонка — выше
      return a.name.localeCompare(b.name, "ru");
    });
  }, [clients, activeChip, district, callsByClient, geoMode, distanceKm, nearbyOnly]);

  const resultClient = resultClientId
    ? (clients.find((c) => c.id === resultClientId) ?? null)
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <Phone className="size-6 text-accent" />
            Звонки
            <span className="rounded-full bg-tint px-2.5 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
              {counts.all}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Воронка: {counts.cold} холодных · {counts.callback} на перезвоне ·{" "}
            {counts.no_answer} недозвон
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              clearCallsIntent();
              setScriptsOpen(true);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
          >
            <MessageSquareText className="size-4 text-accent" />
            Скрипты
          </button>
          <span className="hidden items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-ink-soft sm:inline-flex">
            <Snowflake className="size-3.5 text-accent" />
            Проба: 2,5 кг за 350 ₽
          </span>
        </div>
      </header>

      {/* ── Чипы-фильтры ── */}
      <div
        className="fryflow-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Фильтры воронки"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={activeChip === f.id}
            onClick={() => applyChip(f.id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              activeChip === f.id
                ? "border-transparent bg-ink text-bg"
                : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
            )}
          >
            {f.id === "all" ? <Layers className="size-3.5" /> : null}
            {f.label}
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                activeChip === f.id ? "opacity-70" : "text-ink-soft"
              )}
            >
              {counts[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Район + фильтр «рядом» + подсказка сортировки ── */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative inline-flex items-center">
            <span className="sr-only">Фильтр по району</span>
            <select
              value={district}
              onChange={(e) => {
                clearCallsIntent();
                setDistrict(e.target.value);
              }}
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
          {/* Задача 18C: радиус 2 км от сегодняшних заказов — есть только
           * когда есть с чем сравнивать (заказы на сегодня). */}
          {geoMode ? (
            <button
              type="button"
              role="tab"
              aria-selected={nearbyOnly}
              onClick={() => setNearbyOnly((v) => !v)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-[13px] font-medium transition-colors",
                nearbyOnly
                  ? "border-transparent bg-ink text-bg"
                  : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
              )}
            >
              <LocateFixed className="size-3.5" />
              Показывать только рядом
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  nearbyOnly ? "opacity-70" : "text-ink-soft"
                )}
              >
                {nearbyCount}
              </span>
            </button>
          ) : null}
        </div>
        <p className="shrink-0 text-xs text-ink-soft">
          Показано{" "}
          <span className="font-mono tabular-nums">{sorted.length}</span> из{" "}
          <span className="font-mono tabular-nums">{clients.length}</span> ·{" "}
          {geoMode
            ? "по близости к сегодняшнему заказу: сначала ближние"
            : "green → yellow → red, дальше — кто дольше без звонка"}
        </p>
      </div>

      {/* ── Список карточек ── */}
      {sorted.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Phone className="size-8 text-ink-soft/50" />
          <p className="text-sm text-ink-soft">Нет клиентов по этим фильтрам.</p>
          <button
            type="button"
            onClick={() => {
              applyChip("all");
              setDistrict("all");
            }}
            className="text-sm font-medium text-accent hover:underline"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {sorted.map((client) => {
              const info = callsByClient.get(client.id);
              return (
                <CallCard
                  key={client.id}
                  client={client}
                  lastCall={info?.last ?? null}
                  attempts={info?.attempts ?? 0}
                  callbackDate={info?.callback}
                  inRoute={routeStops.some((r) => r.clientId === client.id)}
                  highlighted={highlightId === client.id}
                  orderDistanceKm={geoMode ? distanceKm.get(client.id) ?? null : null}
                  onResult={() => {
                    clearCallsIntent();
                    setResultClientId(client.id);
                  }}
                />
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Модалка результата (key — сброс состояния на нового клиента) ── */}
      {resultClient && (
        <CallResultSheet
          key={resultClient.id}
          client={resultClient}
          open
          onClose={() => setResultClientId(null)}
        />
      )}

      {/* ── Панель скриптов ── */}
      <ScriptsPanel open={scriptsOpen} onClose={() => setScriptsOpen(false)} />
    </div>
  );
}
