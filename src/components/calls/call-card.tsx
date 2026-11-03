"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Phone, PhoneOff, Search } from "lucide-react";

import {
  CalledIndicator,
  CallbackBadge,
  ChainBadge,
  NewClientBadge,
  StatusBadge,
} from "@/components/crm/badges";
import type { Call, Client } from "@/types/models";
import {
  CALL_RESULT_LABEL,
  CLIENT_TYPE_LABEL,
  PRIORITY_COLOR_VAR,
  PRIORITY_LABEL,
} from "@/types/models";
import { cn } from "@/lib/utils";

/** Русская плюрализация: 1 попытка / 2 попытки / 5 попыток. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** «1,2» — для расстояния до заказа (запятая — по-русски). */
function formatKm(km: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(km);
}

/** «сегодня» / «вчера» / «N дн. назад». */
export function humanDaysAgo(iso: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  );
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${days} ${plural(days, "день", "дня", "дней")} назад`;
}

/** Поиск точки в 2ГИС (для клиентов без телефона). */
export function build2gisUrl(client: Client): string {
  return `https://2gis.ru/rostov-na-donu/search/${encodeURIComponent(
    `${client.name}, ${client.address}`
  )}`;
}

/**
 * Карточка клиента в списке обзвона: приоритетная полоска, крупный
 * телефон моноширинным, счётчик попыток, «Позвонить» (tel:) и
 * «Записать результат». Без телефона — «Найти в 2ГИС».
 */
export function CallCard({
  client,
  lastCall,
  attempts,
  callbackDate,
  inRoute,
  highlighted,
  orderDistanceKm,
  onResult,
}: {
  client: Client;
  lastCall: Call | null;
  attempts: number;
  callbackDate?: string;
  inRoute: boolean;
  highlighted: boolean;
  /** Задача 18C: расстояние до ближайшего заказа сегодня, км
   *  (null — заказов на сегодня нет). */
  orderDistanceKm?: number | null;
  onResult: () => void;
}) {
  const telHref = client.phone
    ? `tel:${client.phone.replace(/[^+\d]/g, "")}`
    : undefined;

  /* Задача 18C: близость к сегодняшнему заказу — бейдж до 2 км (зелёный)
   * и 2–5 км (жёлтый); цвет — те же переменные, что у приоритетов базы. */
  const proximity =
    orderDistanceKm == null || orderDistanceKm > 5
      ? null
      : orderDistanceKm <= 2
        ? { label: "Рядом с заказом", color: "var(--tier-green)" }
        : { label: "Близко", color: "var(--tier-yellow)" };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-surface p-5 pl-[22px] transition-shadow",
        highlighted
          ? "border-accent/70 shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
          : "border-border"
      )}
    >
      {/* Полоска приоритета */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: PRIORITY_COLOR_VAR[client.priorityTier] }}
      />

      {/* Строка 1: название + бейдж приоритета */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[16px] font-semibold leading-snug tracking-tight text-ink">
              {client.name}
            </h3>
            {client.chainName ? (
              <ChainBadge name={client.chainName} size={client.chainSize} />
            ) : null}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {client.district} · {CLIENT_TYPE_LABEL[client.type]}
            {orderDistanceKm != null
              ? ` · ${
                  orderDistanceKm < 0.1
                    ? "точка заказа"
                    : `${formatKm(orderDistanceKm)} км от заказа`
                }`
              : ""}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide"
          style={{
            color: PRIORITY_COLOR_VAR[client.priorityTier],
            background: `color-mix(in srgb, ${PRIORITY_COLOR_VAR[client.priorityTier]} 12%, transparent)`,
          }}
        >
          {PRIORITY_LABEL[client.priorityTier]}
        </span>
      </div>

      {/* Строка 2: телефон крупно (моно) или заглушка */}
      <div className="mt-3">
        {client.phone ? (
          <a
            href={telHref}
            className="font-mono text-[19px] font-medium tracking-tight text-ink hover:text-accent"
          >
            {client.phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
            <PhoneOff className="size-4" />
            Телефон не указан
          </span>
        )}
      </div>

      {/* Строка 3: статусы воронки + индикаторы новой точки и звонков */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <StatusBadge status={client.status} />
        {proximity ? (
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              color: proximity.color,
              background: `color-mix(in srgb, ${proximity.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${proximity.color} 32%, transparent)`,
            }}
          >
            {proximity.label}
          </span>
        ) : null}
        <NewClientBadge createdAt={client.createdAt} />
        <CalledIndicator called={attempts > 0} />
        {callbackDate ? <CallbackBadge date={callbackDate} /> : null}
        {inRoute ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            В маршруте
          </span>
        ) : null}
      </div>

      {/* Строка 4: счётчик попыток */}
      <p className="mt-2 text-[12.5px] text-ink-soft">
        {attempts === 0 ? (
          "Ещё не звонили"
        ) : lastCall ? (
          <>
            <span className="font-mono font-semibold tabular-nums text-ink">
              {attempts}
            </span>{" "}
            {plural(attempts, "попытка", "попытки", "попыток")} · последний —{" "}
            {CALL_RESULT_LABEL[lastCall.result].toLowerCase()}{" "}
            <span className="font-mono tabular-nums">
              {humanDaysAgo(lastCall.createdAt)}
            </span>
          </>
        ) : null}
      </p>

      {/* Строка 5: действия */}
      <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {client.phone ? (
          <a
            href={telHref}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            <Phone className="size-[18px]" strokeWidth={2.4} />
            Позвонить
          </a>
        ) : (
          <a
            href={build2gisUrl(client)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-tint text-[14px] font-semibold text-ink transition-all hover:border-accent/40 hover:bg-accent/10 active:scale-[0.98]"
          >
            <Search className="size-4" />
            Найти в 2ГИС
          </a>
        )}
        <button
          type="button"
          onClick={onResult}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-[14px] font-semibold text-ink transition-all hover:border-accent/40 hover:bg-accent/10 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Записать результат
        </button>
      </div>
    </motion.article>
  );
}
