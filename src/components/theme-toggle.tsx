"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Переключатель темы (Sun/Moon).
 * Выбор сохраняется в localStorage (ключ "fryflow-theme").
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  // До монтирования подписи нейтральны: иначе SSR-разметка
  // не совпадёт с первым клиентским рендером (hydration mismatch).
  const label = !mounted
    ? "Переключить тему"
    : isDark
      ? "Включить светлую тему"
      : "Включить тёмную тему";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-ink transition-colors hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-[18px]" strokeWidth={2} />
        ) : (
          <Moon className="size-[18px]" strokeWidth={2} />
        )
      ) : (
        <span className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
