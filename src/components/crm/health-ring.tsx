"use client";

import { healthColorVar } from "@/lib/health-score";

/**
 * Кольцо Health Score для карточки клиента.
 * Цвет: 80+ зелёный, 50–79 жёлтый, ниже 50 — красный.
 * null — истории заказов нет, показываем прочерк на сером кольце.
 */
export function HealthRing({
  score,
  size = 42,
}: {
  score: number | null;
  size?: number;
}) {
  const thickness = Math.max(3, Math.round(size / 10));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const p = score === null ? 0 : Math.min(score, 100) / 100;
  const color = score === null ? "var(--ink-soft)" : healthColorVar(score);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      title={
        score === null
          ? "Health Score: нет истории заказов"
          : `Health Score: ${score}/100`
      }
      aria-label={
        score === null ? "Health Score неизвестен" : `Health Score ${score}`
      }
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset .5s ease, stroke .3s ease" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums"
        style={{ color, fontSize: Math.max(10, Math.round(size / 3.2)) }}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}
