import { ArrowRight, ArrowUpRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

const REPO_URL = "https://github.com/baci2157-dev/fryflow";

const stats = [
  { value: "16", label: "Next.js · App Router" },
  { value: "5", label: "базовых дизайн-токенов" },
  { value: "2", label: "темы: Light и Dark" },
  { value: "4", label: "Tailwind CSS" },
];

const tokens = [
  { name: "--bg", light: "#F7F4EF", dark: "#0F0E0C", css: "var(--bg)" },
  { name: "--surface", light: "#FFFFFF", dark: "#1A1815", css: "var(--surface)" },
  { name: "--border", light: "#E8E2D9", dark: "#2C2823", css: "var(--border)" },
  { name: "--ink", light: "#1C1A17", dark: "#F0EDE8", css: "var(--ink)" },
  { name: "--accent", light: "#C68A1B", dark: "#E5A83B", css: "var(--accent)" },
];

const stack = [
  "Next.js 16 с App Router и React 19",
  "TypeScript в строгом режиме",
  "Tailwind CSS 4 с дизайн-токенами Warm Precision",
  "Переключатель темы Sun/Moon с сохранением в localStorage",
  "Inter — для текста, JetBrains Mono — для цифр",
  "Полный набор компонентов shadcn/ui",
  "Чистая история Git: первый коммит в ветке main",
  ".env и node_modules не попадают в репозиторий",
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <p className="font-mono text-xs tracking-[0.18em] text-accent uppercase sm:text-sm">
          FryFlow · Warm Precision · v0.1.0
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-ink sm:text-6xl sm:leading-[1.1]">
          Тёплая <span className="text-accent">точность</span> для быстрых
          интерфейсов
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
          Стартовый каркас FryFlow: Next.js 16 с App Router, TypeScript и
          Tailwind CSS 4. Пять дизайн-токенов Warm Precision, две темы с
          сохранением выбора, Inter для текста и JetBrains Mono для цифр.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href="#tokens">
              Смотреть токены
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Репозиторий на GitHub
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Стек в цифрах */}
      <section
        aria-label="Стек проекта в цифрах"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4"
      >
        {stats.map((s) => (
          <div key={s.label} className="bg-surface p-4 sm:p-5">
            <p className="font-mono text-2xl font-semibold tracking-tight text-ink tabular-nums sm:text-3xl">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-ink-soft">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Дизайн-токены */}
      <section id="tokens" className="scroll-mt-24 py-16 sm:py-24">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Дизайн-токены
        </h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Пять базовых переменных Warm Precision. Образцы ниже живут на
          CSS-переменных — переключите тему, и цвета сменятся вместе с ней.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {tokens.map((t) => (
            <div
              key={t.name}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div
                className="h-14 rounded-lg border border-border"
                style={{ backgroundColor: t.css }}
              />
              <p className="mt-3 font-mono text-sm text-ink">{t.name}</p>
              <p className="mt-1 font-mono text-xs text-ink-soft tabular-nums">
                {t.light} · {t.dark}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Типографика */}
      <section className="pb-16 sm:pb-24">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Типографика
        </h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Inter отвечает за текст, JetBrains Mono — за цифры: табличные
          моноширинные знаки не «прыгают» при обновлении данных.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="font-mono text-xs tracking-[0.14em] text-ink-soft uppercase">
              Inter · текст
            </p>
            <p className="mt-4 text-xl leading-snug font-medium text-ink sm:text-2xl">
              Съешь ещё этих мягких французских булок, да выпей чаю.
            </p>
            <p className="mt-4 text-sm text-ink-soft">
              Начертания 400–700, кириллица и латиница.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="font-mono text-xs tracking-[0.14em] text-ink-soft uppercase">
              JetBrains Mono · цифры
            </p>
            <p className="mt-4 font-mono text-xl leading-snug text-ink tabular-nums sm:text-2xl">
              0123456789
            </p>
            <p className="mt-4 font-mono text-sm text-ink-soft tabular-nums">
              1 234 567,89 ₽ · 98,6 % · 12:34:56
            </p>
          </div>
        </div>
      </section>

      {/* Что настроено */}
      <section className="pb-16 sm:pb-24">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Что уже настроено
        </h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {stack.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <Check
                className="mt-0.5 size-4 shrink-0 text-accent"
                strokeWidth={2.5}
              />
              <span className="text-sm leading-relaxed text-ink">{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
