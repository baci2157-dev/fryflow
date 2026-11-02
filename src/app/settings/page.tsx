"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  FileText,
  RotateCcw,
  Sparkles,
  Timer,
} from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { useAiChatStore } from "@/lib/ai-chat-store";
import { useCrmStore } from "@/lib/clients-store";
import { useOrdersStore } from "@/lib/orders-store";
import {
  CHARTER_EXAMPLES,
  CHARTER_MAX,
  DEFAULT_REQUISITES,
  useSettingsStore,
} from "@/lib/settings-store";
import { cn } from "@/lib/utils";

/**
 * Настройки FryFlow: ИИ-Директор (интервалы проактивных советов —
 * заглушка до следующей задачи), Устав для ИИ (системный промпт)
 * и Реквизиты для счетов — из них собирается каждый PDF-счёт.
 *
 * Всё сохраняется автоматически (zustand persist) — кнопки «Сохранить»
 * нет, как и лишней работы у владельца.
 */

/* ── Карточка-блок ───────────────────────────────────────── */

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{hint}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

/* ── Поле ввода ──────────────────────────────────────────── */

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "tel";
  wide?: boolean;
}) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="text-[12px] font-medium text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg px-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-accent/60 focus:bg-surface"
      />
    </label>
  );
}

/* ── Страница ────────────────────────────────────────────── */

export default function SettingsPage() {
  const invoice = useSettingsStore((s) => s.invoice);
  const setInvoice = useSettingsStore((s) => s.setInvoice);
  const ai = useSettingsStore((s) => s.ai);
  const setAi = useSettingsStore((s) => s.setAi);
  const resetCharter = useSettingsStore((s) => s.resetCharter);
  const resetRequisites = useSettingsStore((s) => s.resetRequisites);

  const resetCrm = useCrmStore((s) => s.resetDemo);
  const resetOrders = useOrdersStore((s) => s.resetDemo);
  const clearChat = useAiChatStore((s) => s.clear);
  const { toast } = useToast();

  const charterLen = ai.charter.length;
  const overLimit = charterLen > CHARTER_MAX;

  const appendCharterChip = (text: string) => {
    const base = ai.charter.trimEnd();
    const next = base ? `${base} ${text}` : text;
    setAi({ charter: next.slice(0, CHARTER_MAX) });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="py-6 lg:py-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          Настройки
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Всё сохраняется автоматически — настроил один раз и забыл
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {/* ── ИИ-Директор ── */}
        <Section
          icon={<Sparkles className="size-5" />}
          title="ИИ-Ассистент"
          hint="Устав и интервалы для ИИ-Директора, который видит ваши цифры"
        >
          {/* Устав */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-ink-soft">
                Устав для ИИ (системный промпт)
              </span>
              <span
                className={cn(
                  "font-mono text-[11.5px] tabular-nums",
                  overLimit ? "font-semibold text-tier-red" : "text-ink-soft"
                )}
              >
                {charterLen}/{CHARTER_MAX}
              </span>
            </div>
            <textarea
              value={ai.charter}
              onChange={(e) => setAi({ charter: e.target.value.slice(0, CHARTER_MAX + 200) })}
              rows={5}
              placeholder="Правила, которые ИИ соблюдает в каждом ответе…"
              className={cn(
                "mt-1.5 w-full resize-y rounded-xl border bg-bg p-3.5 text-[14px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:bg-surface",
                overLimit ? "border-tier-red/60" : "border-border focus:border-accent/60"
              )}
            />
            <div className="mt-2.5">
              <p className="text-[11.5px] text-ink-soft">
                Тапни, чтобы добавить правило:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CHARTER_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => appendCharterChip(ex)}
                    className="rounded-full border border-border bg-tint/60 px-3 py-1.5 text-[12px] text-ink transition-all hover:border-accent/50 hover:bg-accent/10 active:scale-[0.97]"
                  >
                    + {ex}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                resetCharter();
                toast({ title: "Устав сброшен", description: "Вернули текст по умолчанию.", duration: 2800 });
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <RotateCcw className="size-3.5" />
              Сбросить устав
            </button>
          </div>

          {/* Интервалы проактивных советов — заглушка до следующей задачи */}
          <div className="mt-5 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">
                  Проактивные советы
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">
                  ИИ сам напомнит о долгах и складе. Интервалы заработают в
                  следующей задаче — сейчас собираем правила.
                </p>
              </div>
              {/* Сегмент 2/3/4 часа — выбор сохраняется в стор */}
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-bg p-1">
                <Timer className="ml-1.5 size-3.5 text-ink-soft" />
                {([2, 3, 4] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setAi({ intervalHours: h, proactive: true })}
                    className={cn(
                      "h-8 rounded-lg px-2.5 font-mono text-[12.5px] font-semibold tabular-nums transition-colors",
                      ai.intervalHours === h
                        ? "bg-accent text-accent-foreground"
                        : "text-ink-soft hover:bg-tint hover:text-ink"
                    )}
                  >
                    {h} ч
                  </button>
                ))}
              </div>
            </div>
            <Link
              href="/ai-assistant"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98]"
            >
              <Sparkles className="size-4" />
              Открыть чат с ИИ-Директором
            </Link>
          </div>
        </Section>

        {/* ── Реквизиты для счетов ── */}
        <Section
          icon={<FileText className="size-5" />}
          title="Реквизиты для счетов"
          hint="Из этих полей собирается каждый PDF-счёт — уровень «серьёзного поставщика»"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Форма */}
            <div>
              <span className="text-[12px] font-medium text-ink-soft">Форма</span>
              <div className="mt-1.5 flex gap-1 rounded-xl border border-border bg-bg p-1">
                {(["ИП", "ООО"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setInvoice({ legalForm: f })}
                    className={cn(
                      "h-9 flex-1 rounded-lg text-[13.5px] font-semibold transition-colors",
                      invoice.legalForm === f
                        ? "bg-accent text-accent-foreground"
                        : "text-ink-soft hover:bg-tint hover:text-ink"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {/* НДС */}
            <div>
              <span className="text-[12px] font-medium text-ink-soft">Ставка НДС</span>
              <div className="mt-1.5 flex gap-1 rounded-xl border border-border bg-bg p-1">
                {(["Без НДС", "20%", "5%", "7%"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setInvoice({ vatRate: v })}
                    className={cn(
                      "h-9 flex-1 rounded-lg text-[12.5px] font-semibold transition-colors",
                      invoice.vatRate === v
                        ? "bg-accent text-accent-foreground"
                        : "text-ink-soft hover:bg-tint hover:text-ink"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <Field
              wide
              label="Полное наименование"
              value={invoice.companyName}
              onChange={(v) => setInvoice({ companyName: v })}
              placeholder="Смирнов Алексей Викторович"
            />
            <Field
              wide
              label="Юридический адрес"
              value={invoice.address}
              onChange={(v) => setInvoice({ address: v })}
              placeholder="344011, г. Ростов-на-Дону, …"
            />
            <Field
              label="ИНН"
              value={invoice.inn}
              onChange={(v) => setInvoice({ inn: v.replace(/\D/g, "").slice(0, 12) })}
              placeholder="615312345678"
            />
            <Field
              label="Телефон"
              value={invoice.phone}
              onChange={(v) => setInvoice({ phone: v })}
              placeholder="+7 (918) 500-40-30"
              type="tel"
            />
            <Field
              label="Расчётный счёт"
              value={invoice.account}
              onChange={(v) => setInvoice({ account: v.replace(/\D/g, "").slice(0, 20) })}
              placeholder="40802810400000123456"
            />
            <Field
              label="БИК"
              value={invoice.bik}
              onChange={(v) => setInvoice({ bik: v.replace(/\D/g, "").slice(0, 9) })}
              placeholder="046030707"
            />
            <Field
              wide
              label="Банк"
              value={invoice.bank}
              onChange={(v) => setInvoice({ bank: v })}
              placeholder="Филиал «Ростовский» АО «Тинькофф Банк»"
            />
            <Field
              label="Корр. счёт"
              value={invoice.corrAccount}
              onChange={(v) => setInvoice({ corrAccount: v.replace(/\D/g, "").slice(0, 20) })}
              placeholder="30101810100000000707"
            />
            <Field
              label="Подписант (ФИО)"
              value={invoice.signatoryName}
              onChange={(v) => setInvoice({ signatoryName: v })}
              placeholder="Смирнов А.В."
            />
            <Field
              wide
              label="Должность подписанта"
              value={invoice.signatoryTitle}
              onChange={(v) => setInvoice({ signatoryTitle: v })}
              placeholder="Индивидуальный предприниматель"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
              <BadgeCheck className="size-4 text-tier-green" />
              Счёт № СЧ-ГГГГММДД-NNN · откроется в новой вкладке
            </p>
            <button
              type="button"
              onClick={() => {
                resetRequisites();
                toast({
                  title: "Реквизиты сброшены",
                  description: "Вернули демо-значения по умолчанию.",
                  duration: 2800,
                });
              }}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <RotateCcw className="size-3.5" />
              Сбросить
            </button>
          </div>
        </Section>

        {/* ── Демо-данные ── */}
        <Section
          icon={<RotateCcw className="size-5" />}
          title="Демо-данные"
          hint="Вернуть базу, заказы, склад и чат ИИ к стартовому демо-состоянию"
        >
          <button
            type="button"
            onClick={() => {
              resetCrm();
              resetOrders();
              clearChat();
              toast({
                title: "Демо-данные восстановлены",
                description:
                  "Клиенты, звонки, заказы, склад и чат ИИ — как при первом запуске. Настройки не тронуты.",
                duration: 4200,
              });
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
          >
            <RotateCcw className="size-4 text-accent" />
            Сбросить к демо-данным
          </button>
        </Section>
      </div>
    </div>
  );
}
