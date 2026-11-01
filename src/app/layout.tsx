import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FryFlow — тёплая точность для быстрых интерфейсов",
  description:
    "Рабочее место FryFlow: дашборд, звонки, заказы, долги и склад. Next.js 16, TypeScript, Tailwind CSS 4, дизайн-система Warm Precision.",
  applicationName: "FryFlow",
  keywords: [
    "FryFlow",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "Warm Precision",
    "дашборд",
    "CRM",
  ],
  icons: { icon: "/fryflow.svg" },
  openGraph: {
    title: "FryFlow",
    description: "Тёплая точность для быстрых интерфейсов",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
