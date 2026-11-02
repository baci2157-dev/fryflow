"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  BookOpen,
  Lightbulb,
  MapPin,
  Megaphone,
  Phone,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { buildAiContext } from "@/lib/ai-context";
import { useAiChatStore, type ChatMessage } from "@/lib/ai-chat-store";
import { greetingMessage, offlineAnswer } from "@/lib/ai-offline";
import { useCrmStore } from "@/lib/clients-store";
import { useDiscoveryStore } from "@/lib/discovery-store";
import { useOrdersStore } from "@/lib/orders-store";
import { useProductsStore } from "@/lib/products-store";
import { useRegionsStore } from "@/lib/regions-store";
import { useSettingsStore } from "@/lib/settings-store";
import { cn } from "@/lib/utils";

/**
 * ИИ-Директор — премиальный чат, который видит ваши цифры.
 *
 * Первое сообщение (приветствие) — самое важное: оно пересобирается
 * из живых данных стора при каждом запуске. Пузыри пользователя —
 * янтарные справа, ответы ИИ — surface-карточки слева с градиентной
 * искрой. Банк промптов — вопросы-чипы по категориям.
 */

/* ── Банк промптов ───────────────────────────────────────── */

interface PromptCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  prompts: string[];
}

const PROMPT_BANK: PromptCategory[] = [
  {
    id: "finance",
    label: "Финансы",
    icon: Wallet,
    prompts: ["Сколько у меня долгов?", "Какая выручка и маржа за 30 дней?"],
  },
  {
    id: "stock",
    label: "Склад",
    icon: Warehouse,
    prompts: ["На сколько хватит склада?", "Когда заказывать у поставщика?"],
  },
  {
    id: "marketing",
    label: "Маркетинг",
    icon: Megaphone,
    prompts: ["Как продавать без скидок?", "Что предложить шаурмичной?"],
  },
  {
    id: "leads",
    label: "Лиды",
    icon: Phone,
    prompts: ["Кому звонить сегодня?", "Сколько холодных лидов в базе?", "Есть ли новые точки, которые я ещё не обзвонил?"],
  },
  {
    id: "regions",
    label: "Регионы",
    icon: MapPin,
    prompts: ["Какой район обзванивать первым?", "Где больше всего точек?"],
  },
  {
    id: "crosssell",
    label: "Кросс-сейл",
    icon: ShoppingBasket,
    prompts: [
      "Кому предложить соус или масло — кто берёт только фри?",
      "Какой товар добавить к заказу Шаурмы на Зорге?",
      "Кому предложить соленья в этом сезоне?",
    ],
  },
];

/* ── Градиентная искра ───────────────────────────────────── */

export function SparkAvatar({ size = 44 }: { size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #F2C14E 0%, #C68A1B 55%, #A96A10 100%)",
        boxShadow: "0 4px 16px rgba(198, 138, 27, 0.35)",
      }}
      aria-hidden="true"
    >
      <Sparkles className="size-[55%]" strokeWidth={2.2} />
    </span>
  );
}

/* ── Пузыри ──────────────────────────────────────────────── */

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex justify-end"
    >
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] leading-relaxed text-accent-foreground shadow-[0_2px_8px_rgba(198,138,27,0.25)] sm:max-w-[70%]">
        {text}
      </p>
    </motion.div>
  );
}

function AiBubble({ message }: { message: Pick<ChatMessage, "content" | "source"> }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex items-end gap-2.5"
    >
      <SparkAvatar size={30} />
      <div className="min-w-0">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-[14.5px] leading-relaxed text-ink shadow-[0_1px_3px_rgba(28,26,23,0.05)] sm:max-w-[75%]">
          {message.content}
        </p>
        {message.source === "offline" && (
          <p className="mt-1 pl-1 text-[10.5px] text-ink-soft/70">
            офлайн-мозг · на ваших цифрах
          </p>
        )}
      </div>
    </motion.div>
  );
}

function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="flex items-end gap-2.5"
    >
      <SparkAvatar size={30} />
      <div className="flex h-11 items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-surface px-4">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
            className="size-2 rounded-full bg-accent"
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ── Страница ────────────────────────────────────────────── */

export default function AiAssistantPage() {
  const messages = useAiChatStore((s) => s.messages);
  const addMessage = useAiChatStore((s) => s.addMessage);
  const clear = useAiChatStore((s) => s.clear);

  const clients = useCrmStore((s) => s.clients);
  const calls = useCrmStore((s) => s.calls);
  const discoveredLeads = useDiscoveryStore((s) => s.leads);
  const orders = useOrdersStore((s) => s.orders);
  const movements = useOrdersStore((s) => s.movements);
  const payments = useOrdersStore((s) => s.payments);
  const regions = useRegionsStore((s) => s.partners);
  const products = useProductsStore((s) => s.products);
  const charter = useSettingsStore((s) => s.ai.charter);
  /** Тумблер «Поиск в интернете» (задача 10): тренды и конкуренты. */
  const webSearch = useSettingsStore((s) => s.ai.webSearch);

  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Живой контекст бизнеса — пересобирается при каждом изменении стора. */
  const context = useMemo(
    () =>
      buildAiContext({
        clients,
        orders,
        movements,
        payments,
        regions,
        products,
        calls,
        discovered: discoveredLeads,
      }),
    [clients, orders, movements, payments, regions, products, calls, discoveredLeads]
  );
  const greeting = useMemo(() => greetingMessage(context), [context]);

  /* Автоскролл к свежему сообщению. scroll-mb — чтобы последний пузырь
   * останавливался выше плавающей строки ввода и открытого банка промптов. */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length, typing, bankOpen]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;
    setInput("");
    setBankOpen(false);

    addMessage("user", text);
    const history = [
      { role: "assistant" as const, content: greeting },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ]
      .filter((m) => m.content)
      .slice(-10);

    setTyping(true);
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, history, charter, webSearch }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reply: string; source: "zai" | "offline" };
      addMessage("assistant", data.reply, data.source);
    } catch {
      /* Сеть подвела — отвечает локальный офлайн-мозг. */
      addMessage("assistant", offlineAnswer(text, context), "offline");
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex items-center gap-3.5 py-6">
        <SparkAvatar size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            ИИ-Директор
          </h1>
          <p className="mt-0.5 truncate text-[13px] text-ink-soft">
            Видит ваши цифры: склад, долги, выручку и лиды
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clear();
              setInput("");
            }}
            title="Очистить историю"
            className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-ink-soft transition-colors hover:border-tier-red/40 hover:text-tier-red"
          >
            <Trash2 className="size-[18px]" />
          </button>
        )}
      </header>

      {/* ── Лента сообщений ── */}
      {/* pb — воздух под плавающей строкой ввода и банком промптов:
          контент прокручивается ЗА них, а не под ними. */}
      <div
        className={cn(
          "flex min-h-[52dvh] flex-1 flex-col gap-4",
          bankOpen ? "pb-[440px]" : "pb-[170px]"
        )}
      >
        {/* Приветствие — не хранится, пересобирается из живых цифр */}
        <AiBubble message={{ content: greeting }} />

        <AnimatePresence initial={false}>
          {messages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={m.id} text={m.content} />
            ) : (
              <AiBubble key={m.id} message={m} />
            )
          )}
          {typing && <TypingBubble key="typing" />}
        </AnimatePresence>
        <div
          ref={bottomRef}
          className={cn("h-1", bankOpen ? "scroll-mb-[410px]" : "scroll-mb-[150px]")}
        />
      </div>

      {/* ── Строка ввода (над BottomNav на мобильных) ── */}
      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 mt-6 lg:bottom-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-[0_10px_36px_rgba(28,26,23,0.12)] backdrop-blur-xl">
          {/* Банк промптов */}
          <AnimatePresence initial={false}>
            {bankOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              >
                <div className="fryflow-scroll max-h-64 overflow-y-auto border-b border-border p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {PROMPT_BANK.map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <div key={cat.id}>
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                            <Icon className="size-3.5 text-accent" />
                            {cat.label}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {cat.prompts.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => void send(p)}
                                className="rounded-full border border-border bg-tint/60 px-3 py-1.5 text-left text-[12.5px] text-ink transition-all hover:border-accent/50 hover:bg-accent/10 active:scale-[0.97]"
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Кнопка банка + поле ввода */}
          <div className="flex items-center gap-2 p-2">
            <button
              type="button"
              onClick={() => setBankOpen((v) => !v)}
              className={cn(
                "inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-colors",
                bankOpen
                  ? "bg-accent/12 text-accent"
                  : "border border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
              )}
            >
              {bankOpen ? (
                <BookOpen className="size-[18px]" />
              ) : (
                <Lightbulb className="size-[18px]" />
              )}
              <span className="hidden sm:inline">Банк промптов</span>
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Спросите ИИ-Директора…"
                aria-label="Вопрос ИИ-Директору"
                autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-[15px] text-ink outline-none placeholder:text-ink-soft/60"
              />
              <motion.button
                type="submit"
                whileTap={{ scale: 0.92 }}
                disabled={!input.trim() || typing}
                aria-label="Отправить"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-[0_4px_12px_rgba(198,138,27,0.35)] transition-opacity hover:bg-accent/90 disabled:opacity-35 disabled:shadow-none"
              >
                <ArrowUp className="size-5" strokeWidth={2.6} />
              </motion.button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
