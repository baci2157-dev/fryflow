"use client";

import { motion } from "framer-motion";

/**
 * Кольцо прогресса (для Health Score и счётчиков дня).
 * Дуга анимируется spring-физикой framer-motion.
 */
export function RingProgress({
  value,
  max,
  size = 64,
  thickness = 6,
  label,
  color = "var(--accent)",
}: {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  label?: React.ReactNode;
  /** Цвет дуги, например var(--tier-red) при перегрузе. */
  color?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(max > 0 ? value / max : 0, 0), 1);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={thickness}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold text-ink tabular-nums">
        {label ?? value}
      </div>
    </div>
  );
}
