"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { ru } from "date-fns/locale";
import {
  AlertTriangle,
  Clock,
  MapPin,
  Mic,
  MicOff,
  Minus,
  Navigation,
  Package,
  Play,
  Plus,
  Route as RouteIcon,
  ShoppingBasket,
  Square,
  Truck,
  UserX,
  Wallet,
  X,
} from "lucide-react";

import { ChainBadge } from "@/components/crm/badges";
import { RingProgress } from "@/components/dashboard/ring-progress";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { useProductsStore } from "@/lib/products-store";
import {
  buildYandexRouteUrl,
  minutesToTime,
  planRoute,
  typicalStopFor,
} from "@/lib/route-algorithm";
import {
  PRODUCT_CATEGORY_LABEL,
  type Client,
  type ProductCategory,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Экран «Маршрут на день».
 * Кольцо загрузки машины (50 коробок, настройка), предупреждение
 * о перегрузе, порядок точек по алгоритму «Ближайший сосед» с ETA
 * и временными окнами, кнопка «Поехать» (Яндекс.Карты, мультимаршрут)
 * и режим «В дороге» с большими кнопками и голосовыми заметками.
 */

type StopFlags = Record<string, { done?: boolean; unpaid?: boolean; noshow?: boolean }>;

interface VoiceNote {
  id: string;
  url: string;
  seconds: number;
  stopName: string;
  at: Date;
}

/** Яндекс.Карты поддерживают до 10 точек мультимаршрута (склад + 9). */
const YANDEX_MAX_STOPS = 9;

export default function RoutePage() {
  const clients = useCrmStore((s) => s.clients);
  const routeStops = useCrmStore((s) => s.routeStops);
  const capacity = useCrmStore((s) => s.capacity);
  const addRouteCrossSell = useCrmStore((s) => s.addRouteCrossSell);
  const removeRouteCrossSell = useCrmStore((s) => s.removeRouteCrossSell);
  const products = useProductsStore((s) => s.products);
  /* Раскрытая панель «попутно» — id клиента. */
  const [crossPanelId, setCrossPanelId] = useState<string | null>(null);
  const setCapacity = useCrmStore((s) => s.setCapacity);
  const setRouteStops = useCrmStore((s) => s.setRouteStops);
  const setStopBoxes = useCrmStore((s) => s.setStopBoxes);
  const removeRouteStop = useCrmStore((s) => s.removeRouteStop);
  const markDelivered = useCrmStore((s) => s.markDelivered);
  const { toast } = useToast();

  const [flags, setFlags] = useState<StopFlags>({});
  const [driving, setDriving] = useState(false);
  const [notes, setNotes] = useState<VoiceNote[]>([]);

  const plan = useMemo(
    () => planRoute(routeStops, clients, capacity),
    [routeStops, clients, capacity]
  );

  const totalBoxes = routeStops.reduce((a, s) => a + s.boxes, 0);
  const totalSum = routeStops.reduce((a, s) => a + s.orderSum, 0);
  const overloaded = totalBoxes > capacity;
  const doneCount = plan.ordered.filter((s) => flags[s.client.id]?.done).length;

  /* ── Автосборка, если маршрут пуст ── */
  const buildAutoRoute = () => {
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
    toast({
      title: "Маршрут собран",
      description: `${stops.length} точек — проверьте загрузку машины.`,
      duration: 2800,
    });
  };

  /* ── Поехать: Яндекс.Карты, мультимаршрут на авто ── */
  const openYandex = () => {
    if (plan.ordered.length === 0) return;
    const limited =
      plan.ordered.length > YANDEX_MAX_STOPS
        ? plan.ordered.slice(0, YANDEX_MAX_STOPS)
        : plan.ordered;
    if (plan.ordered.length > YANDEX_MAX_STOPS) {
      toast({
        title: "Яндекс ограничивает маршрут 10 точками",
        description: `Открыли первые ${YANDEX_MAX_STOPS}, остальные — следующей ходкой.`,
        duration: 3800,
      });
    }
    window.open(buildYandexRouteUrl(limited), "_blank", "noopener");
  };

  /* ── В дороге: действия по точке ── */
  const currentStop = plan.ordered.find((s) => !flags[s.client.id]?.done) ?? null;

  const markStop = (
    client: Client,
    kind: "delivered" | "unpaid" | "noshow",
    boxes: number
  ) => {
    setFlags((f) => ({
      ...f,
      [client.id]: {
        done: true,
        unpaid: kind === "unpaid" || undefined,
        noshow: kind === "noshow" || undefined,
      },
    }));
    if (kind === "delivered") {
      markDelivered(client.id, boxes);
      toast({
        title: `Доставлено: ${client.name}`,
        description: `${boxes} коробок · ${boxes * 300} ₽ · Health Score обновится к вечеру.`,
        duration: 3000,
      });
    } else if (kind === "unpaid") {
      toast({
        title: `Не оплачено: ${client.name}`,
        description: "Долг зафиксирован — попадёт в раздел «Долги».",
        duration: 3200,
      });
    } else {
      toast({
        title: `Клиента нет: ${client.name}`,
        description: "Точка закрыта, вернёмся в следующий заезд.",
        duration: 3200,
      });
    }
  };

  /* ── Пустое состояние ── */
  if (routeStops.length === 0) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <RouteHeader points={0} />
        <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-20 text-center">
          <RouteIcon className="size-10 text-ink-soft/40" />
          <div>
            <p className="text-[15px] font-semibold text-ink">Маршрут на день пуст</p>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">
              Соберите точки со статусом «Проба» и «Постоянный» одной кнопкой
              или добавляйте клиентов по одному кнопкой «В маршрут» на карте.
            </p>
          </div>
          <button
            type="button"
            onClick={buildAutoRoute}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
          >
            <Plus className="size-4" />
            Собрать из «Проба + Постоянный»
          </button>
        </div>
      </div>
    );
  }

  /* ── Режим «В дороге» ── */
  if (driving) {
    return (
      <DrivingMode
        currentStop={currentStop}
        stopsTotal={plan.ordered.length}
        doneCount={doneCount}
        notes={notes}
        setNotes={setNotes}
        onMark={markStop}
        onExit={() => setDriving(false)}
      />
    );
  }

  /* ── Обычный режим ── */
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6 lg:px-8">
      <RouteHeader points={plan.ordered.length} />

      {/* ── Загрузка машины ── */}
      <section
        className={cn(
          "mt-4 flex flex-wrap items-center gap-5 rounded-2xl border bg-surface p-5",
          overloaded ? "border-[color-mix(in_srgb,var(--tier-red)_45%,transparent)]" : "border-border"
        )}
      >
        <RingProgress
          value={Math.min(totalBoxes, capacity * 1.4)}
          max={capacity}
          size={84}
          thickness={9}
          color={overloaded ? "var(--tier-red)" : "var(--accent)"}
          label={
            <span className="flex flex-col items-center leading-none">
              <span className="font-mono text-base font-bold">{totalBoxes}</span>
              <span className="font-mono text-[9px] text-ink-soft">из {capacity}</span>
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-semibold text-ink">
            Загружено {totalBoxes} из {capacity} коробок
          </h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            {overloaded
              ? `${plan.ordered.length} точек в машине, ${plan.skipped.length} на вторую ходку`
              : `${plan.ordered.length} точек · ${plan.totalKm} км · ~${Math.round(plan.totalMinutes / 60 * 10) / 10} ч в пути`}
          </p>
          {overloaded ? (
            <p
              className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium"
              style={{ color: "var(--tier-red)" }}
            >
              <AlertTriangle className="size-3.5" />
              Перегруз на {totalBoxes - capacity} коробок — уберите точки или
              увеличьте вместимость
            </p>
          ) : null}
        </div>

        {/* Настройка вместимости */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCapacity(Math.max(10, capacity - 5))}
            aria-label="Уменьшить вместимость"
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-ink transition-colors hover:bg-tint"
          >
            <Minus className="size-4" />
          </button>
          <div className="flex flex-col items-center px-1">
            <span className="font-mono text-[15px] font-semibold tabular-nums text-ink">
              {capacity}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-ink-soft">
              коробок
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCapacity(Math.min(300, capacity + 5))}
            aria-label="Увеличить вместимость"
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-ink transition-colors hover:bg-tint"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </section>

      {/* ── Точки маршрута ── */}
      <section className="mt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Точки по порядку объезда («ближайший сосед»)
        </h3>
        <ol className="mt-2 space-y-2">
          {plan.ordered.map((stop) => {
            const f = flags[stop.client.id];
            return (
              <li
                key={stop.client.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-2xl border bg-surface p-4 sm:flex-nowrap",
                  f?.done ? "border-border opacity-60" : "border-border"
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-accent font-mono text-[14px] font-bold text-ink">
                  {stop.index}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold text-ink">
                      {stop.client.name}
                    </p>
                    {/* Попутно: интересы клиента — предложение «заодно» (задача 9) */}
                    {stop.client.interests && stop.client.interests.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          color: "var(--accent)",
                          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                        }}
                      >
                        <ShoppingBasket className="size-3" />
                        Попутно:{" "}
                        {(stop.client.interests as ProductCategory[])
                          .slice(0, 2)
                          .map((c) => PRODUCT_CATEGORY_LABEL[c].toLowerCase())
                          .join(", ")}
                      </span>
                    )}
                    {stop.client.chainName ? (
                      <ChainBadge name={stop.client.chainName} size={stop.client.chainSize} />
                    ) : null}
                    {f?.unpaid ? (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--tier-yellow)", background: "color-mix(in srgb, var(--tier-yellow) 14%, transparent)" }}>
                        Не оплачено
                      </span>
                    ) : null}
                    {f?.noshow ? (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--tier-red)", background: "color-mix(in srgb, var(--tier-red) 12%, transparent)" }}>
                        Клиента нет
                      </span>
                    ) : null}
                    {f?.done && !f.unpaid && !f.noshow ? (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--tier-green)", background: "color-mix(in srgb, var(--tier-green) 12%, transparent)" }}>
                        Доставлено
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-ink-soft">
                    <MapPin className="size-3 shrink-0" />
                    {stop.client.address} · {stop.client.district}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className="flex items-center gap-1 text-ink-soft">
                      <Clock className="size-3" />
                      {minutesToTime(stop.window.from * 60)}–
                      {minutesToTime(stop.window.to * 60)}
                    </span>
                    <span className="font-mono text-ink">≈ {minutesToTime(stop.etaMinutes)}</span>
                    {stop.late ? (
                      <span className="flex items-center gap-1 font-medium" style={{ color: "var(--tier-red)" }}>
                        <AlertTriangle className="size-3" />
                        приедем к закрытию
                      </span>
                    ) : null}
                  </p>
                </div>

                {/* Коробки (степпер) + сумма */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setStopBoxes(stop.client.id, Math.max(1, stop.boxes - 1))
                    }
                    aria-label="Минус коробка"
                    className="flex size-8 items-center justify-center rounded-lg border border-border text-ink transition-colors hover:bg-tint"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="flex w-16 flex-col items-center">
                    <span className="font-mono text-[13.5px] font-semibold tabular-nums text-ink">
                      {stop.boxes} кор.
                    </span>
                    <span className="font-mono text-[11.5px] tabular-nums text-ink-soft">
                      {stop.orderSum.toLocaleString("ru-RU")} ₽
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setStopBoxes(stop.client.id, stop.boxes + 1)}
                    aria-label="Плюс коробка"
                    className="flex size-8 items-center justify-center rounded-lg border border-border text-ink transition-colors hover:bg-tint"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  {stop.client.interests && stop.client.interests.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setCrossPanelId(
                          crossPanelId === stop.client.id ? null : stop.client.id
                        )
                      }
                      aria-pressed={crossPanelId === stop.client.id}
                      aria-label={`Попутные товары для ${stop.client.name}`}
                      title="Попутные товары: взять с собой"
                      className="ml-1 flex size-8 items-center justify-center rounded-lg border text-accent transition-colors hover:bg-accent/10"
                      style={{
                        borderColor: crossPanelId === stop.client.id
                          ? "var(--accent)"
                          : "color-mix(in srgb, var(--accent) 40%, transparent)",
                        background: crossPanelId === stop.client.id
                          ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                          : undefined,
                      }}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeRouteStop(stop.client.id)}
                    aria-label={`Убрать ${stop.client.name} из маршрута`}
                    className="ml-1 flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--tier-red)_12%,transparent)] hover:text-[var(--tier-red)]"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* ── Панель «попутно» (задача 9): что взять к точке ── */}
                {crossPanelId === stop.client.id && (
                  <div className="w-full rounded-xl border border-accent/30 bg-accent/5 p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">
                      Взять попутно · {stop.client.name}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {products
                        .filter(
                          (prod) =>
                            (stop.client.interests ?? []).includes(prod.category) &&
                            prod.stock > 0
                        )
                        .map((prod) => {
                          const taken =
                            stop.crossSell?.find((c) => c.productId === prod.id);
                          return (
                            <div
                              key={prod.id}
                              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-medium text-ink">
                                  {prod.name}
                                </p>
                                <p className="font-mono text-[11px] text-ink-soft tabular-nums">
                                  {prod.price.toLocaleString("ru-RU")} ₽ · ост. {prod.stock}
                                </p>
                              </div>
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.94 }}
                                onClick={() =>
                                  addRouteCrossSell(stop.client.id, {
                                    productId: prod.id,
                                    name: prod.name,
                                    qty: 1,
                                    price: prod.price,
                                  })
                                }
                                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 text-[12px] font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
                              >
                                <Plus className="size-3" />
                                {taken ? `ещё (${taken.qty})` : "Взять"}
                              </motion.button>
                            </div>
                          );
                        })}
                      {products.filter(
                        (prod) =>
                          (stop.client.interests ?? []).includes(prod.category) &&
                          prod.stock > 0
                      ).length === 0 && (
                        <p className="text-[12.5px] text-ink-soft">
                          Товаров из интересов нет в наличии — загляните в «Каталог».
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Чипы взятого: «масло ×1 · 1200 ₽» */}
                {stop.crossSell && stop.crossSell.length > 0 && (
                  <div className="flex w-full flex-wrap items-center gap-1.5">
                    {stop.crossSell.map((c) => (
                      <span
                        key={c.productId}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-[11.5px] font-medium text-accent"
                      >
                        <ShoppingBasket className="size-3" />
                        {c.name} ×{c.qty} ·{" "}
                        <span className="font-mono tabular-nums">
                          {(c.qty * c.price).toLocaleString("ru-RU")} ₽
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            removeRouteCrossSell(stop.client.id, c.productId)
                          }
                          aria-label={`Убрать ${c.name}`}
                          className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-accent/20"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* Не вместилось */}
        {plan.skipped.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Не вместилось — на вторую ходку
            </h3>
            <ul className="mt-2 space-y-2">
              {plan.skipped.map((s) => (
                <li
                  key={s.client.id}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3.5"
                >
                  <Package className="size-4 shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                    {s.client.name}
                  </span>
                  <span className="font-mono text-[12.5px] tabular-nums text-ink-soft">
                    {s.boxes} кор.
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── Итоговая панель ── */}
      <section className="sticky bottom-20 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/5 lg:bottom-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[15px] font-semibold tabular-nums text-ink">
            {plan.ordered.length} точек · {plan.totalKm} км ·{" "}
            {totalSum.toLocaleString("ru-RU")} ₽
          </p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            Порядок: «ближайший сосед» от склада · выезд в{" "}
            {minutesToTime(9 * 60)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDriving(true);
            toast({
              title: "Выехали!",
              description: "Режим «В дороге»: кнопки крупнее — тыкайте на ходу.",
              duration: 2600,
            });
          }}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-tint"
        >
          <Truck className="size-4" />
          В дороге
        </button>
        <button
          type="button"
          onClick={openYandex}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
        >
          <Navigation className="size-4" />
          Поехать
        </button>
      </section>
    </div>
  );
}

/* ── Заголовок страницы ─────────────────────────────────────── */

function RouteHeader({ points }: { points: number }) {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setToday(new Date()));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          <RouteIcon className="size-6 text-accent" />
          Маршрут на день
        </h1>
        <p className="mt-0.5 text-sm capitalize text-ink-soft">
          {today
            ? format(today, "EEEE, d MMMM", { locale: ru })
            : "\u00A0"}
          {points > 0 ? ` · ${points} точек` : ""}
        </p>
      </div>
    </header>
  );
}

/* ── Режим «В дороге» ───────────────────────────────────────── */

function DrivingMode({
  currentStop,
  stopsTotal,
  doneCount,
  notes,
  setNotes,
  onMark,
  onExit,
}: {
  currentStop: {
    client: Client;
    boxes: number;
    index: number;
    etaMinutes: number;
  } | null;
  stopsTotal: number;
  doneCount: number;
  notes: VoiceNote[];
  setNotes: React.Dispatch<React.SetStateAction<VoiceNote[]>>;
  onMark: (client: Client, kind: "delivered" | "unpaid" | "noshow", boxes: number) => void;
  onExit: () => void;
}) {
  const { toast } = useToast();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAtRef = useRef(0);

  // Таймер записи.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Освобождаем микрофон при размонтировании.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast({
        title: "Микрофон недоступен",
        description: "Браузер запретил запись — заметку можно набрать текстом.",
        duration: 3400,
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        const elapsed = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000)
        );
        setNotes((n) => [
          {
            id: `note-${Date.now()}`,
            url,
            seconds: elapsed,
            stopName: currentStop?.client.name ?? "По маршруту",
            at: new Date(),
          },
          ...n,
        ]);
        toast({
          title: "Голосовая заметка сохранена",
          description: `${elapsed} сек · ${currentStop?.client.name ?? "маршрут"}`,
          duration: 2400,
        });
      };
      recorderRef.current = mr;
      startedAtRef.current = Date.now();
      setSeconds(0);
      mr.start();
      setRecording(true);
    } catch {
      toast({
        title: "Микрофон недоступен",
        description: "Разрешите доступ к микрофону в браузере.",
        duration: 3400,
      });
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-96px)] w-full max-w-3xl flex-col px-4 pb-8 sm:px-6 lg:min-h-dvh">
      <header className="flex items-center justify-between gap-3 py-5">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <Truck className="size-6 text-accent" />
            В дороге
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Точка{" "}
            <span className="font-mono tabular-nums">
              {Math.min(doneCount + 1, stopsTotal)}/{stopsTotal}
            </span>{" "}
            закрыто <span className="font-mono tabular-nums">{doneCount}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-tint"
        >
          <X className="size-4" />
          Выйти
        </button>
      </header>

      {currentStop ? (
        <>
          {/* Текущая точка */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  Сейчас на точке
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">
                  {currentStop.client.name}
                </h2>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {currentStop.client.address} · {currentStop.client.district}
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-tint px-3 py-2 text-center">
                <p className="font-mono text-lg font-bold tabular-nums leading-none text-ink">
                  {currentStop.boxes}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-soft">
                  коробок
                </p>
              </div>
            </div>
          </section>

          {/* Большие кнопки результата */}
          <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BigAction
              label="Доставлено"
              icon={<Package className="size-7" />}
              onClick={() => onMark(currentStop.client, "delivered", currentStop.boxes)}
              fg="var(--tier-green)"
            />
            <BigAction
              label="Не оплачено"
              icon={<Wallet className="size-7" />}
              onClick={() => onMark(currentStop.client, "unpaid", currentStop.boxes)}
              fg="var(--tier-yellow)"
            />
            <BigAction
              label="Клиента нет"
              icon={<UserX className="size-7" />}
              onClick={() => onMark(currentStop.client, "noshow", currentStop.boxes)}
              fg="var(--tier-red)"
            />
          </section>
        </>
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface py-14 text-center">
          <Package className="size-10" style={{ color: "var(--tier-green)" }} />
          <p className="text-[16px] font-semibold text-ink">Все точки закрыты</p>
          <p className="max-w-xs text-sm text-ink-soft">
            Маршрут выполнен. Возвращайтесь на склад — вторая ходка уже
            ждёт на экране маршрута.
          </p>
        </section>
      )}

      {/* Голосовая заметка */}
      <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-ink">Голосовая заметка</p>
            <p className="text-[12px] text-ink-soft">
              Продиктуйте детали по точке — прослушаете на складе
            </p>
          </div>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? "Остановить запись" : "Записать заметку"}
            className={cn(
              "relative flex size-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
              recording && "animate-pulse"
            )}
            style={{
              background: recording ? "var(--tier-red)" : "var(--accent)",
              color: recording ? "#fff" : "#1C1A17",
            }}
          >
            {recording ? <Square className="size-5" /> : <Mic className="size-6" />}
          </button>
        </div>
        {recording ? (
          <p className="mt-2 text-center font-mono text-[13px] tabular-nums text-ink">
            ● Запись… {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </p>
        ) : null}

        {notes.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
              >
                <Play className="size-4 shrink-0 text-ink-soft" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {n.stopName}
                  </p>
                  <p className="text-[11px] text-ink-soft">
                    {n.at.toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {n.seconds} сек
                  </p>
                </div>
                <audio controls preload="none" src={n.url} className="h-8 max-w-[45%]" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-soft">
            <MicOff className="size-3.5" />
            Заметок пока нет
          </p>
        )}
      </section>
    </div>
  );
}

function BigAction({
  label,
  icon,
  onClick,
  fg,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  fg: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border font-semibold transition-transform active:scale-[0.98]"
      style={{
        color: fg,
        borderColor: `color-mix(in srgb, ${fg} 45%, transparent)`,
        background: `color-mix(in srgb, ${fg} 10%, transparent)`,
      }}
    >
      {icon}
      <span className="text-[15px]">{label}</span>
    </button>
  );
}
