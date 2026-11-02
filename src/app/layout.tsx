import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { PwaBoot } from "@/components/pwa/pwa-boot";
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
  title: "FryFlow — CRM оптовых продаж картофеля фри",
  description:
    "Рабочее место оптовика: клиенты, звонки, заказы, склад, долги, регионы и ИИ-Директор. Картофель фри 2,5 кг — 300 ₽/уп от 10 коробок.",
  applicationName: "FryFlow",
  keywords: [
    "FryFlow",
    "картофель фри",
    "опт",
    "HoReCa",
    "CRM",
    "дашборд",
    "Ростов-на-Дону",
  ],
  /* PWA: манифест + иконки (золотая картошка фри, тема #E5A83B) */
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/fryflow.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  /* iOS: открывается как нативное приложение — без адресной строки Safari */
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FryFlow",
  },
  formatDetection: { telephone: true },
  openGraph: {
    title: "FryFlow",
    description: "CRM оптовых продаж замороженного картофеля фри",
    type: "website",
  },
};

/** PWA-вьюпорт: во весь экран iPhone (с «челкой») и без лишнего зума. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  /* theme-color для обеих тем: светлая и тёмная (PwaBoot держит в тон
   *  ручному переключателю темы тоже). */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F4EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0E0C" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        {/* iOS: открываться как нативное приложение (React поднимет meta в head) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <ThemeProvider>
          <PwaBoot />
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
