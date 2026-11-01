"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Провайдер темы FryFlow.
 * Класс .dark вешается на <html>, выбор сохраняется в localStorage
 * под ключом "fryflow-theme". До первого выбора действует системная тема.
 */
export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="fryflow-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
