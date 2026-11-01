"use client";

import { CalendarClock, Link2 } from "lucide-react";

import {
  CLIENT_STATUS_LABEL,
  STATUS_COLOR_VAR,
  type ClientStatus,
} from "@/types/models";

/** Бейдж статуса воронки — цвет из CSS-переменных Warm Precision. */
export function StatusBadge({ status }: { status: ClientStatus }) {
  const color = STATUS_COLOR_VAR[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      {CLIENT_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Белый бейдж сети с числом филиалов — «золото» базы,
 * одинаково заметен в светлой и тёмной теме.
 */
export function ChainBadge({
  name,
  size,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1C1A17] shadow-sm">
      <Link2 className="size-3" aria-hidden="true" />
      {name}
      {size ? <span className="font-mono">×{size}</span> : null}
    </span>
  );
}

/** Плашка «Перезвонить N ноя» — ближайшая дата перезвона. */
export function CallbackBadge({ date }: { date: string }) {
  const d = new Date(date);
  const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const iso = new Date(date);
  const today = new Date();
  const overdue =
    iso.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: overdue ? "var(--tier-red)" : "var(--accent)",
        background: overdue
          ? "color-mix(in srgb, var(--tier-red) 12%, transparent)"
          : "color-mix(in srgb, var(--accent) 12%, transparent)",
      }}
    >
      <CalendarClock className="size-3" aria-hidden="true" />
      {overdue ? "Просрочен перезвон" : "Перезвон"} {label}
    </span>
  );
}
