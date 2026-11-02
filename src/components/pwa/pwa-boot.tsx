"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * PWA-загрузчик FryFlow (задача 8).
 *
 * 1. Регистрирует Service Worker (/sw.js) — кэш интерфейса
 *    и API (stale-while-revalidate), приложение открывается офлайн.
 * 2. Держит meta theme-color в тон актуальной теме: светлая —
 *    #F7F4EF, тёмная — #0F0E0C (строка состояния телефона красится
 *    в цвет приложения, как у нативного).
 *
 * Компонент ничего не рендерит — только эффекты.
 */

/** Фон Warm Precision по темам (globals.css). */
const THEME_BG = { light: "#F7F4EF", dark: "#0F0E0C" } as const;

export function PwaBoot() {
  const { resolvedTheme } = useTheme();

  /* Регистрация Service Worker после полной загрузки страницы. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* регистрация не критична — приложение работает и без SW */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  /* theme-color в цвет активной темы (обе метки — системная и общая). */
  useEffect(() => {
    const color =
      resolvedTheme === "dark" ? THEME_BG.dark : THEME_BG.light;
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", color));
  }, [resolvedTheme]);

  return null;
}
