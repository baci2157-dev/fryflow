"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

/**
 * Спарклайн: кривая без осей, высота 40px (recharts <Line>).
 * Цвет — янтарный акцент Warm Precision по умолчанию.
 */
export function Sparkline({
  data,
  height = 40,
  stroke = "var(--accent)",
  strokeWidth = 2,
}: {
  data: number[];
  height?: number;
  stroke?: string;
  strokeWidth?: number;
}) {
  const points = data.map((v, i) => ({ i, v }));

  return (
    <div className="w-full" style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive
            animationDuration={900}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
