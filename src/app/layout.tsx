import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
    "Стартовый каркас FryFlow: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, дизайн-токены Warm Precision, темы Light/Dark, Inter и JetBrains Mono.",
  applicationName: "FryFlow",
  keywords: [
    "FryFlow",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "Warm Precision",
    "дизайн-токены",
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
          <div className="flex min-h-dvh flex-col bg-bg">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
