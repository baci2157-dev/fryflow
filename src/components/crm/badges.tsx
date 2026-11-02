"use client";

import { CalendarClock, Link2, Phone, PhoneCall, Sparkles } from "lucide-react";

import {
  CLIENT_STATUS_LABEL,
  STATUS_COLOR_VAR,
  daysSince,
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

/** Русская плюрализация дней: 1 день / 2 дня / 5 дней. */
function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

/**
 * «Новая · 3 дня» (задача 11) — первые 7 дней жизни карточки.
 * Дальше бейдж сам исчезает: точка перестала быть новой.
 */
export function NewClientBadge({ createdAt }: { createdAt?: string }) {
  if (!createdAt) return null;
  const days = daysSince(createdAt);
  if (days >= 7) return null;
  const label =
    days === 0 ? "Новая · сегодня" : `Новая · ${days} ${pluralDays(days)}`;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color: "var(--accent)",
        background: "color-mix(in srgb, var(--accent) 14%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 34%, transparent)",
      }}
    >
      <Sparkles className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Индикатор «звонили / не звонили» (задача 11): телефон с волнами —
 * была хотя бы одна запись в журнале, просто телефон — ещё не звонили.
 */
export function CalledIndicator({ called }: { called: boolean }) {
  return (
    <span
      title={called ? "Этой точке уже звонили" : "Этой точке ещё не звонили"}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={
        called
          ? {
              color: "var(--tier-green)",
              background: "color-mix(in srgb, var(--tier-green) 12%, transparent)",
            }
          : {
              color: "var(--ink-soft)",
              background: "var(--tint)",
            }
      }
    >
      {called ? (
        <PhoneCall className="size-3" aria-hidden="true" />
      ) : (
        <Phone className="size-3" aria-hidden="true" />
      )}
      {called ? "Звонили" : "Не звонили"}
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
