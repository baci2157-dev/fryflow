"use client";

import { useState } from "react";
import {
  Calculator,
  CheckCircle2,
  MessageSquareText,
  PhoneCall,
  Quote,
  ShieldQuestion,
} from "lucide-react";

import { BenefitCalculator } from "@/components/calls/benefit-calculator";
import { SpringSheet } from "@/components/crm/spring-sheet";
import {
  AFTER_CALL_CHECKLIST,
  BASE_SCRIPT,
  KEY_NUMBERS,
  OBJECTIONS,
} from "@/lib/call-scripts";

/**
 * Панель «Скрипты и возражения»: правый Drawer на десктопе,
 * полноэкранный лист на мобильных. Базовый скрипт, карточки
 * возражений, ключевые цифры, калькулятор выгоды и чек-лист
 * «Что делать после звонка» — всё под рукой во время звонка.
 */
export function ScriptsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [calcOpen, setCalcOpen] = useState(false);

  return (
    <>
      <SpringSheet
        open={open}
        onClose={onClose}
        variant="drawer"
        desktopWidth={480}
        mobileFullscreen
        title={
          <span className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-accent" />
            Скрипты и возражения
          </span>
        }
      >
        {/* ── Базовый скрипт ── */}
        <section className="mt-4">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            <PhoneCall className="size-3.5" />
            Базовый скрипт
          </h4>
          <ol className="mt-2 space-y-2">
            {BASE_SCRIPT.map((phrase, i) => (
              <li
                key={phrase.tag}
                className="rounded-2xl border border-border bg-tint/50 p-3.5"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[12px] font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">
                    {phrase.tag}
                  </span>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink">
                  {phrase.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Возражения и ответы ── */}
        <section className="mt-6">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            <ShieldQuestion className="size-3.5" />
            Возражения и ответы ({OBJECTIONS.length})
          </h4>
          <div className="mt-2 space-y-2">
            {OBJECTIONS.map((o) => (
              <div
                key={o.objection}
                className="overflow-hidden rounded-2xl border border-border"
              >
                <p className="border-b border-border bg-tint/60 px-3.5 py-2 text-[13px] font-semibold text-ink">
                  <Quote className="mr-1.5 inline size-3.5 -translate-y-px text-ink-soft" />
                  «{o.objection}»
                </p>
                <p className="px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
                  {o.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Ключевые цифры ── */}
        <section className="mt-6">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Ключевые цифры
          </h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {KEY_NUMBERS.map((n) => (
              <div key={n.label} className="rounded-2xl border border-border p-3">
                <p className="text-[11px] text-ink-soft">{n.label}</p>
                <p className="mt-0.5 font-mono text-[17px] font-bold tracking-tight text-ink">
                  {n.value}
                </p>
                <p className="mt-0.5 text-[11px] leading-tight text-ink-soft">
                  {n.hint}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[14.5px] font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.99]"
          >
            <Calculator className="size-[18px]" />
            Открыть калькулятор выгоды
          </button>
        </section>

        {/* ── Чек-лист после звонка ── */}
        <section className="mt-6 mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Что делать после звонка
          </h4>
          <ul className="mt-2 space-y-1.5 rounded-2xl border border-border p-3.5">
            {AFTER_CALL_CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <span className="text-[13px] leading-relaxed text-ink">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </SpringSheet>

      <BenefitCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />
    </>
  );
}
