"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Megaphone,
  RotateCcw,
  Send,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { useToast } from "@/hooks/use-toast";
import { useAdviceStore } from "@/lib/advice-store";
import { useAiChatStore } from "@/lib/ai-chat-store";
import { backupCounts, downloadBackup } from "@/lib/backup";
import { useCrmStore } from "@/lib/clients-store";
import { queueFetch } from "@/lib/offline-queue";
import { useOrdersStore } from "@/lib/orders-store";
import { useProductsStore } from "@/lib/products-store";
import { useRegionsStore } from "@/lib/regions-store";
import {
  CHARTER_EXAMPLES,
  CHARTER_MAX,
  DEFAULT_REQUISITES,
  useSettingsStore,
} from "@/lib/settings-store";
import { cn } from "@/lib/utils";

/**
 * Настройки FryFlow (задача 7):
 *
 *  • ИИ-Ассистент — устав, проактивные советы (вкл/выкл) и интервал
 *    2/3/4 ч: пока вы в приложении — советы на Дашборде, ушли —
 *    критичные алерты прилетают в Telegram;
 *  • Telegram — токен бота и Chat ID (токен хранится ТОЛЬКО на
 *    сервере: клиент видит маску), тест сообщения, чёткая
 *    инструкция подключения (@BotFather → Business Mode →
 *    @userinfobot) и симуляция заявки клиента для проверки;
 *  • Автопостинг — Chat ID групп, интервал 2/3/7 дней и базовый
 *    шаблон: ИИ переписывает его уникально (анти-спам) и
 *    подставляет актуальные остатки склада;
 *  • Реквизиты для счетов — из них собирается каждый PDF-счёт.
 *
 * Всё сохраняется автоматически (zustand persist / серверный
 * конфиг) — кнопки «Сохранить» нет, как и лишней работы.
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
  onBlur,
  placeholder,
  type = "text",
  wide,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: "text" | "tel" | "password";
  wide?: boolean;
  hint?: string;
}) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="text-[12px] font-medium text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg px-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-accent/60 focus:bg-surface"
      />
      {hint && <span className="mt-1 block text-[11.5px] text-ink-soft">{hint}</span>}
    </label>
  );
}

/* ── Инлайн-результат действия (успех/ошибка без модалок) ── */

function InlineResult({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug",
        ok ? "text-tier-green" : "text-tier-red"
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{children}</span>
    </motion.p>
  );
}

/* ── Статус Telegram из серверного конфига ────────────────── */

interface TgStatus {
  connected: boolean;
  hasToken: boolean;
  tokenHint: string;
  chatId: string;
  groups: string[];
  intervalDays: 2 | 3 | 7;
  template: string;
  lastPostAt: number;
  webhookActive: boolean;
  autopostReady: boolean;
}

/* ── Блок Telegram ───────────────────────────────────────── */

function TelegramSection() {
  const { toast } = useToast();
  const movements = useOrdersStore((s) => s.movements);

  const [status, setStatus] = useState<TgStatus | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [groupsText, setGroupsText] = useState("");
  const [intervalDays, setIntervalDays] = useState<TgStatus["intervalDays"]>(3);
  const [template, setTemplate] = useState("");

  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [simResult, setSimResult] = useState<{ ok: boolean; name?: string; boxes?: number; error?: string } | null>(null);
  const [postResult, setPostResult] = useState<{ posted?: number; error?: string; text?: string } | null>(null);
  const [busy, setBusy] = useState<"test" | "sim" | "post" | null>(null);

  useEffect(() => {
    fetch("/api/telegram/config")
      .then((r) => r.json())
      .then((d: TgStatus) => {
        setStatus(d);
        setChatId(d.chatId);
        setGroupsText(d.groups.join(", "));
        setIntervalDays(d.intervalDays);
        setTemplate(d.template);
      })
      .catch(() => setStatus(null));
  }, []);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as TgStatus & { error?: string };
      if (!res.ok) {
        toast({ title: "Не сохранено", description: data.error, duration: 4200 });
        return false;
      }
      setStatus(data);
      return true;
    } catch {
      toast({ title: "Сервер недоступен", description: "Проверьте соединение.", duration: 3200 });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    setTestResult(null);
    try {
      /* Офлайн-очередь: нет сети — сообщение встанет в очередь
       * (IndexedDB) и уйдёт само при восстановлении связи. */
      const { queued, res } = await queueFetch({
        kind: "telegram",
        label: "Тестовое сообщение Telegram",
        url: "/api/telegram/test",
        method: "POST",
      });
      if (queued) {
        setTestResult({
          ok: false,
          error:
            "Нет сети — сообщение сохранено в очередь и уйдёт автоматически при подключении (баннер «Ожидает синхронизации» наверху).",
        });
        return;
      }
      const data = (await res?.json()) as { ok: boolean; error?: string };
      setTestResult(data ?? { ok: false, error: "Пустой ответ сервера." });
    } catch {
      setTestResult({ ok: false, error: "Сервер недоступен — проверьте соединение." });
    } finally {
      setBusy(null);
    }
  };

  const simulateRequest = async () => {
    setBusy("sim");
    setSimResult(null);
    try {
      const res = await fetch("/api/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo: true,
          message: {
            text: "Здравствуйте! Нужно 12 коробок картошки фри на четверг, оплата картой при получении",
            from: { first_name: "Ахмед", last_name: "Усманов" },
            chat: { id: 555111 },
          },
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        draft?: { clientName: string; boxes: number; deliveryDate: string };
        error?: string;
      };
      if (data.ok && data.draft) {
        setSimResult({
          ok: true,
          name: data.draft.clientName,
          boxes: data.draft.boxes,
        });
        toast({
          title: "Заявка создана",
          description: `Черновик: ${data.draft.clientName}, ${data.draft.boxes} уп. — проверьте вкладку «Черновики» в «Заказах».`,
          duration: 5200,
        });
      } else {
        setSimResult({ ok: false, error: data.error ?? "Не удалось создать заявку." });
      }
    } catch {
      setSimResult({ ok: false, error: "Сервер недоступен." });
    } finally {
      setBusy(null);
    }
  };

  const publishNow = async () => {
    setBusy("post");
    setPostResult(null);
    try {
      const packs = movements.reduce(
        (sum, m) => sum + (m.type === "in" ? m.quantityPacks : -m.quantityPacks),
        0
      );
      const res = await fetch("/api/telegram/autopost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          stockKg: Math.round(packs * 25) / 10,
          stockPacks: packs,
        }),
      });
      const data = (await res.json()) as { posted?: number; error?: string; text?: string };
      setPostResult(data);
    } catch {
      setPostResult({ error: "Сервер недоступен." });
    } finally {
      setBusy(null);
    }
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/telegram/webhook`
      : "/api/telegram/webhook";

  return (
    <Section
      icon={<Send className="size-5" />}
      title="Telegram"
      hint="Критичные алерты ИИ и заявки клиентов — в одном боте"
    >
      {/* Статус — главное сверху */}
      <div className="flex flex-wrap items-center gap-2">
        {status?.connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tier-green/12 px-3 py-1 text-[12px] font-semibold text-tier-green">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Подключён
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tint px-3 py-1 text-[12px] font-semibold text-ink-soft">
            Не подключён
          </span>
        )}
        {status?.hasToken && (
          <span className="rounded-full bg-tint px-2.5 py-1 font-mono text-[11px] text-ink-soft">
            токен: {status.tokenHint}
          </span>
        )}
        {status?.webhookActive && (
          <span className="rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-semibold text-accent">
            вебхук активен
          </span>
        )}
        {saving && (
          <span className="text-[11.5px] text-ink-soft">сохраняем…</span>
        )}
      </div>

      {/* Поля подключения */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          wide
          label="Bot Token (от @BotFather)"
          type="password"
          value={token}
          onChange={setToken}
          onBlur={async () => {
            if (!token.trim()) return;
            const ok = await save({ botToken: token.trim() });
            if (ok) {
              setToken("");
              toast({
                title: "Токен сохранён",
                description: "Хранится только на сервере — клиент видит маску.",
                duration: 3200,
              });
            }
          }}
          placeholder={status?.hasToken ? "•••••••• сохранён — введите новый, чтобы заменить" : "7123456789:AAHfT8…"}
          hint="Токен уходит на сервер и обратно не возвращается — даже мы его больше не увидим."
        />
        <Field
          label="Chat ID (куда слать алерты)"
          value={chatId}
          onChange={setChatId}
          onBlur={() => save({ chatId: chatId.trim() })}
          placeholder="123456789"
        />
        <div className="flex items-end">
          <button
            type="button"
            onClick={sendTest}
            disabled={busy === "test"}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50"
          >
            <Send className="size-4" />
            {busy === "test" ? "Отправляем…" : "Отправить тестовое сообщение"}
          </button>
        </div>
      </div>
      {testResult &&
        (testResult.ok ? (
          <InlineResult ok>Тест доставлен — проверьте Telegram.</InlineResult>
        ) : (
          <InlineResult ok={false}>{testResult.error}</InlineResult>
        ))}

      {/* Инструкция — чётко и по шагам */}
      <details className="group mt-5 rounded-xl border border-border bg-bg p-4 open:bg-surface">
        <summary className="cursor-pointer list-none text-[13.5px] font-semibold text-ink transition-colors hover:text-accent">
          Как подключить за 4 шага
          <span className="ml-2 text-[12px] font-normal text-ink-soft group-open:hidden">
            (инструкция)
          </span>
        </summary>
        <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-soft">
          <li className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/12 font-mono text-[12px] font-bold text-accent">1</span>
            <span>
              <b className="text-ink">Создайте бота:</b> напишите{" "}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                @BotFather
              </a>{" "}
              → <code className="rounded bg-tint px-1.5 py-0.5 font-mono text-[12px]">/newbot</code> → имя и username. BotFather пришлёт токен вида{" "}
              <code className="rounded bg-tint px-1.5 py-0.5 font-mono text-[12px]">7123456789:AAHf…</code> — вставьте его в поле выше.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/12 font-mono text-[12px] font-bold text-accent">2</span>
            <span>
              <b className="text-ink">Узнайте свой Chat ID:</b> напишите{" "}
              <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                @userinfobot
              </a>{" "}
              — он мгновенно ответит вашим числом (Id). Это и есть Chat ID для алертов.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/12 font-mono text-[12px] font-bold text-accent">3</span>
            <span>
              <b className="text-ink">Нажмите Start у своего бота</b> (иначе Telegram запретит ему писать первым), затем «Отправить тестовое сообщение».
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/12 font-mono text-[12px] font-bold text-accent">4</span>
            <span>
              <b className="text-ink">Business Mode — заявки клиентов:</b> @BotFather →{" "}
              <code className="rounded bg-tint px-1.5 py-0.5 font-mono text-[12px]">/mybots</code> → ваш бот → Settings →{" "}
              <b className="text-ink">Business Mode</b> → подключите личный аккаунт. Тогда клиенты пишут вам в личку, а заявки падают прямо в «Черновики».
              Зарегистрируйте вебхук (одна команда):
              <code className="mt-1.5 block break-all rounded-lg bg-tint px-2.5 py-2 font-mono text-[11.5px] text-ink">
                api.telegram.org/bot&lt;ТОКЕН&gt;/setWebhook?url={webhookUrl}
              </code>
            </span>
          </li>
        </ol>
      </details>

      {/* Симуляция заявки — проверка парсинга без реального бота */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] font-medium text-ink">
            Проверка парсинга заявок
          </p>
          <button
            type="button"
            onClick={simulateRequest}
            disabled={busy === "sim"}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-[13px] font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10 disabled:opacity-50"
          >
            <Zap className="size-4 text-accent" />
            {busy === "sim" ? "Парсим…" : "Смоделировать заявку клиента"}
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-ink-soft">
          ИИ вытащит из сообщения клиента количество коробок и дату доставки,
          создаст черновик в «Заказах» и подготовит автоответ. Реальный бот не нужен.
        </p>
        {simResult &&
          (simResult.ok ? (
            <InlineResult ok>
              Готово: «{simResult.name}» просит {simResult.boxes} уп. — черновик ждёт во вкладке «Черновики» (Заказы).
            </InlineResult>
          ) : (
            <InlineResult ok={false}>{simResult.error}</InlineResult>
          ))}
      </div>

      {/* ── Автопостинг в группы ── */}
      <div className="mt-5 border-t border-border pt-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Megaphone className="size-4 text-accent" />
          Автопостинг в группы
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
          ИИ публикует объявление в группы оптовиков раз в 2, 3 или 7 дней:
          каждый раз переписывает шаблон по-новому (анти-спам) и подставляет
          актуальные остатки склада.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            wide
            label="Chat ID групп (через запятую)"
            value={groupsText}
            onChange={setGroupsText}
            onBlur={() => save({ groupsText })}
            placeholder="-1001234567890, -1009876543210"
            hint="Добавьте бота администратором в группу с правом «Отправлять сообщения»."
          />
          <div>
            <span className="text-[12px] font-medium text-ink-soft">Интервал публикации</span>
            <div className="mt-1.5 flex gap-1 rounded-xl border border-border bg-bg p-1">
              {([2, 3, 7] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setIntervalDays(d);
                    void save({ intervalDays: d });
                  }}
                  className={cn(
                    "h-9 flex-1 rounded-lg font-mono text-[12.5px] font-semibold tabular-nums transition-colors",
                    intervalDays === d
                      ? "bg-accent text-accent-foreground"
                      : "text-ink-soft hover:bg-tint hover:text-ink"
                  )}
                >
                  {d} {d === 2 ? "дня" : "дней"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={publishNow}
              disabled={busy === "post"}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10 disabled:opacity-50"
            >
              <Megaphone className="size-4 text-accent" />
              {busy === "post" ? "Публикуем…" : "Опубликовать сейчас"}
            </button>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-[12px] font-medium text-ink-soft">
            Базовый шаблон поста ({"{stock}"} = остатки склада)
          </span>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value.slice(0, 600))}
            onBlur={() => save({ template })}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-xl border border-border bg-bg p-3.5 text-[14px] leading-relaxed text-ink outline-none transition-colors focus:border-accent/60 focus:bg-surface"
          />
        </label>

        {status?.lastPostAt ? (
          <p className="mt-2 font-mono text-[11.5px] tabular-nums text-ink-soft">
            последний пост: {new Date(status.lastPostAt).toLocaleString("ru-RU")}
          </p>
        ) : null}
        {postResult &&
          (postResult.error ? (
            <InlineResult ok={false}>{postResult.error}</InlineResult>
          ) : (
            <InlineResult ok>
              Опубликовано в {postResult.posted}{" "}
              {postResult.posted === 1 ? "группу" : "группы"}
              {postResult.text ? (
                <span className="mt-1.5 block rounded-lg bg-tint/70 px-3 py-2 text-[12px] text-ink-soft">
                  «{postResult.text}»
                </span>
              ) : null}
            </InlineResult>
          ))}
      </div>
    </Section>
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

  const clients = useCrmStore((s) => s.clients);
  const calls = useCrmStore((s) => s.calls);
  const orders = useOrdersStore((s) => s.orders);
  const partners = useRegionsStore((s) => s.partners);

  const resetCrm = useCrmStore((s) => s.resetDemo);
  const resetOrders = useOrdersStore((s) => s.resetDemo);
  const resetRegions = useRegionsStore((s) => s.resetDemo);
  const resetProducts = useProductsStore((s) => s.resetDemo);
  const resetAdvice = useAdviceStore((s) => s.reset);
  const clearChat = useAiChatStore((s) => s.clear);
  const { toast } = useToast();

  /* Сброс демо-данных — двухшаговое подтверждение (случайный тап не обнулит базу). */
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 5000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const charterLen = ai.charter.length;
  const overLimit = charterLen > CHARTER_MAX;

  const appendCharterChip = (text: string) => {
    const base = ai.charter.trimEnd();
    const next = base ? `${base} ${text}` : text;
    setAi({ charter: next.slice(0, CHARTER_MAX) });
  };

  const intervalHint = useMemo(() => {
    if (!ai.proactive) return "Советы выключены — ИИ ждёт вашего разрешения.";
    return `Каждые ${ai.intervalHours} ч ИИ смотрит на склад, долги и лиды и обновляет совет на Дашборде.`;
  }, [ai.proactive, ai.intervalHours]);

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
          hint="Устав и проактивные советы: ИИ работает в фоне, пока вы звоните"
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

          {/* Проактивные советы: вкл/выкл + интервал */}
          <div className="mt-5 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">
                  Проактивные советы
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">
                  Активны — совет на Дашборде; ушли из приложения — критичные
                  алерты («просрочка», «склад заканчивается») прилетают в Telegram.
                </p>
              </div>
              <Switch
                checked={ai.proactive}
                onCheckedChange={(v) => setAi({ proactive: v })}
                aria-label="Проактивные советы"
              />
            </div>

            {ai.proactive && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className="overflow-hidden"
              >
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft">
                    <Timer className="size-3.5 text-accent" />
                    Как часто советовать
                  </p>
                  <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-bg p-1">
                    {([2, 3, 4] as const).map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setAi({ intervalHours: h })}
                        className={cn(
                          "h-8 rounded-lg px-3 font-mono text-[12.5px] font-semibold tabular-nums transition-colors",
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
                <p className="mt-2 text-[11.5px] leading-snug text-ink-soft">
                  {intervalHint} Неактивность — вкладка свёрнута или 30 минут
                  без касаний.
                </p>
              </motion.div>
            )}

            <Link
              href="/ai-assistant"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98]"
            >
              <Sparkles className="size-4" />
              Открыть чат с ИИ-Директором
            </Link>
          </div>
        </Section>

        {/* ── Telegram ── */}
        <TelegramSection />

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

        {/* ── Данные и резервное копирование ── */}
        <Section
          icon={<Database className="size-5" />}
          title="Данные и резервное копирование"
          hint="Скачать всё одним файлом или вернуть демо-состояние — база в кармане"
        >
          {/* Живая статистика данных */}
          <p className="font-mono text-[12.5px] tabular-nums text-ink-soft">
            Сейчас в базе: {clients.length} клиентов · {calls.length} звонков ·{" "}
            {orders.length} заказов · {partners.length} регионов
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={async () => {
                try {
                  const backup = await downloadBackup();
                  const c = backupCounts(backup.data);
                  toast({
                    title: "Резервная копия скачана",
                    description: `Файл fryflow-backup-${new Date()
                      .toISOString()
                      .slice(0, 10)}.json: ${c.clients} клиентов, ${
                      c.orders
                    } заказов, ${c.calls} звонков. Положите в облако или отправьте себе в Telegram.`,
                    duration: 5200,
                  });
                } catch {
                  toast({
                    title: "Не удалось выгрузить",
                    description: "Проверьте соединение и попробуйте ещё раз.",
                    duration: 3600,
                  });
                }
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98]"
            >
              <Download className="size-4" />
              Скачать резервную копию (JSON)
            </button>

            {/* Сброс — двухшаговое подтверждение: первый тап «взводит», второй обнуляет */}
            <button
              type="button"
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  return;
                }
                setConfirmReset(false);
                resetCrm();
                resetOrders();
                resetRegions();
                resetProducts();
                resetAdvice();
                clearChat();
                toast({
                  title: "Демо-данные восстановлены",
                  description:
                    "Клиенты, звонки, заказы, регионы, каталог товаров, склад, совет ИИ и чат — как при первом запуске. Настройки не тронуты.",
                  duration: 4200,
                });
              }}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all active:scale-[0.98]",
                confirmReset
                  ? "border-tier-red/50 bg-tier-red/10 text-tier-red"
                  : "border-border bg-surface text-ink hover:border-accent/40 hover:bg-accent/10"
              )}
            >
              <RotateCcw className="size-4" />
              {confirmReset
                ? "Точно? Нажмите ещё раз для сброса"
                : "Сбросить демо-данные"}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-ink-soft">
            Резервная копия выгружает всё из текущего режима: локальные данные
            (демо) или таблицы Supabase (когда база подключена). Сброс не
            трогает реквизиты, устав ИИ и настройки Telegram.
          </p>
        </Section>
      </div>
    </div>
  );
}
