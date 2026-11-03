"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Map as MapIcon, Route, Trash2 } from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { typicalStopFor } from "@/lib/route-algorithm";
import type { Client } from "@/types/models";
import type { MapMode } from "@/components/logistics/map-canvas";
import { cn } from "@/lib/utils";

/* Карта — только на клиенте: Leaflet требует window. */
const MapCanvas = dynamic(
  () => import("@/components/logistics/map-canvas"),
  {
    ssr: false,
    loading: () => (
      <div className="fryflow-skeleton size-full rounded-2xl border border-border" />
    ),
  }
) as React.ComponentType<{
  clients: Client[];
  mode: MapMode;
  routeIds: Set<string>;
  onToggleRoute: (client: Client) => void;
  flyTarget: { coords: Array<{ lat: number; lng: number }>; nonce: number } | null;
}>;

/**
 * Экран «Карта» (логистика): точки клиентов на OpenStreetMap.
 * Режимы: статус воронки / приоритет базы / сети.
 * Чипы районов фильтруют маркеры и подлетают к району (flyTo).
 * «Собрать маршрут» отбирает пробных и постоянных клиентов.
 */

const MODES: Array<{ id: MapMode; label: string }> = [
  { id: "funnel", label: "Статус воронки" },
  { id: "tier", label: "Приоритет базы" },
  { id: "chain", label: "Сети" },
];

export default function LogisticsPage() {
  const router = useRouter();
  const clients = useCrmStore((s) => s.clients);
  const routeStops = useCrmStore((s) => s.routeStops);
  const setRouteStops = useCrmStore((s) => s.setRouteStops);
  const toggleRouteStop = useCrmStore((s) => s.toggleRouteStop);
  const clearRoute = useCrmStore((s) => s.clearRoute);
  const { toast } = useToast();

  const [mode, setMode] = useState<MapMode>("funnel");
  const [district, setDistrict] = useState<string>("all");
  const [flyTarget, setFlyTarget] = useState<{
    coords: Array<{ lat: number; lng: number }>;
    nonce: number;
  } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const capacity = useCrmStore((s) => s.capacity);

  const routeIds = useMemo(
    () => new Set(routeStops.map((r) => r.clientId)),
    [routeStops]
  );

  const districtCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of clients) map.set(c.district, (map.get(c.district) ?? 0) + 1);
    return map;
  }, [clients]);

  const visibleClients = useMemo(
    () => (district === "all" ? clients : clients.filter((c) => c.district === district)),
    [clients, district]
  );

  const selectDistrict = (d: string) => {
    setDistrict(d);
    const coords =
      d === "all"
        ? []
        : clients.filter((c) => c.district === d).map((c) => c.coordinates);
    setFlyTarget((prev) => ({ coords, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const handleToggleRoute = (client: Client) => {
    const added = toggleRouteStop(typicalStopFor(client));
    toast({
      title: added ? "Точка добавлена в маршрут" : "Точка убрана",
      description: `${client.name} — маршрут на экране «Маршрут».`,
      duration: 2400,
    });
  };

  /** Автосборка: клиенты со статусом «Проба» или «Постоянный». */
  const buildRoute = () => {
    const stops = clients
      .filter((c) => c.status === "trial" || c.status === "regular")
      .map(typicalStopFor);
    if (stops.length === 0) {
      toast({
        title: "Некого возить",
        description: "Нет клиентов со статусом «Проба» или «Постоянный».",
        duration: 3200,
      });
      return;
    }
    setRouteStops(stops);
    setPanelOpen(true);
  };

  const totalBoxes = routeStops.reduce((a, s) => a + s.boxes, 0);
  const totalSum = routeStops.reduce((a, s) => a + s.orderSum, 0);
  const overloaded = totalBoxes > capacity;

  return (
    <div className="mx-auto flex h-[calc(100dvh-96px)] w-full max-w-[1600px] flex-col px-4 pb-4 sm:px-6 lg:h-dvh lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3 pt-5 lg:pt-6">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <MapIcon className="size-6 text-accent" />
            Карта
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {clients.length} точек · {districtCounts.size} районов ·{" "}
            {routeStops.length} в маршруте
          </p>
        </div>

        {/* Режимы карты */}
        <div
          className="inline-flex rounded-xl border border-border bg-surface p-1"
          role="tablist"
          aria-label="Режим карты"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "h-10 rounded-lg px-3 text-[12.5px] font-medium transition-colors",
                mode === m.id
                  ? "bg-ink text-bg"
                  : "text-ink-soft hover:bg-tint hover:text-ink"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Чипы районов ── */}
      <div
        className="fryflow-scroll mb-3 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Районы"
      >
        <DistrictChip
          label="Все"
          count={clients.length}
          active={district === "all"}
          onClick={() => selectDistrict("all")}
        />
        {[...districtCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([d, n]) => (
            <DistrictChip
              key={d}
              label={d}
              count={n}
              active={district === d}
              onClick={() => selectDistrict(d)}
            />
          ))}
      </div>

      {/* ── Карта ── */}
      <div className="relative min-h-[300px] flex-1 overflow-hidden rounded-2xl border border-border">
        <MapCanvas
          clients={visibleClients}
          mode={mode}
          routeIds={routeIds}
          onToggleRoute={handleToggleRoute}
          flyTarget={flyTarget}
        />

        {/* Плавающая кнопка сборки маршрута */}
        <button
          type="button"
          onClick={buildRoute}
          className="absolute bottom-[calc(84px+env(safe-area-inset-bottom))] left-4 z-[1200] inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-[#1C1A17] shadow-lg shadow-black/15 transition-colors hover:bg-accent/90"
        >
          <Route className="size-4" />
          Собрать маршрут
        </button>
      </div>

      {/* ── Панель собранного маршрута ── */}
      <SpringSheet
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        variant="dialog"
        title={
          <span className="flex items-center gap-2">
            <Route className="size-4 text-accent" />
            Маршрут собран
          </span>
        }
      >
        <div className="mt-4 space-y-2">
          {routeStops.map((stop) => {
            const client = clients.find((c) => c.id === stop.clientId);
            if (!client) return null;
            return (
              <div
                key={stop.clientId}
                className="flex items-center gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">
                    {client.name}
                  </p>
                  <p className="text-[12px] text-ink-soft">
                    {client.district} · {client.address}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[13px] tabular-nums text-ink">
                  {stop.boxes} кор.
                </span>
                <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-ink">
                  {stop.orderSum.toLocaleString("ru-RU")} ₽
                </span>
                <button
                  type="button"
                  onClick={() => toggleRouteStop(stop)}
                  aria-label={`Убрать ${client.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--tier-red)_12%,transparent)] hover:text-[var(--tier-red)]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-tint/60 p-4 text-[13.5px]">
          <p className="text-ink">
            Итого:{" "}
            <span className="font-mono font-semibold">{routeStops.length}</span> точек ·{" "}
            <span
              className="font-mono font-semibold"
              style={{ color: overloaded ? "var(--tier-red)" : "var(--ink)" }}
            >
              {totalBoxes}/{capacity}
            </span>{" "}
            коробок ·{" "}
            <span className="font-mono font-semibold">
              {totalSum.toLocaleString("ru-RU")} ₽
            </span>
          </p>
          {overloaded ? (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--tier-red)" }}>
              Перегруз на {totalBoxes - capacity} коробок — лишние точки уйдут
              на вторую ходку.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => clearRoute()}
            className="h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-semibold text-ink transition-colors hover:bg-tint"
          >
            Очистить
          </button>
          <button
            type="button"
            onClick={() => {
              setPanelOpen(false);
              router.push("/route");
            }}
            className="h-11 flex-[2] rounded-xl bg-accent text-sm font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
          >
            Открыть маршрут
          </button>
        </div>
      </SpringSheet>
    </div>
  );
}

function DistrictChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "border-transparent bg-ink text-bg"
          : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
      )}
    >
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
