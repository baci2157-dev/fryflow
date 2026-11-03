"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  PhoneOff,
  Radar,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { formatPhoneInput } from "@/components/crm/client-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import {
  leadKey,
  useDiscoveryStore,
  type DiscoveredLead,
} from "@/lib/discovery-store";
import { geocodeAddress } from "@/lib/geocode";
import {
  CLIENT_TYPE_LABEL,
  DISTRICTS,
  PRIORITY_COLOR_VAR,
  PRIORITY_LABEL,
  type ClientType,
  type PriorityTier,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * «Найдено ИИ» (задача 11) — раздел веб-разведки новых точек.
 *
 * Задача 13 (Go-Live): веб-поиск временно отключён — публичный API
 * Z.AI пока не исполняет инструмент поиска. Кнопка «Найти новые точки»
 * неактивна, сверху — баннер-заглушка. Найденные раньше кандидаты
 * остаются: «Добавить в CRM» (геокодинг + холодный лид с приоритетом
 * по сегменту) и «Отклонить» работают как раньше. Дубликаты по
 * name+address отсеиваются при добавлении.
 */

/** fallback-координаты: центр Ростова — как в импорте клиентов. */
const ROSTOV_CENTER = { lat: 47.2225, lng: 39.7188 };

/** Текст от модели → тип клиента CRM. */
function normalizeType(raw: string): ClientType {
  const s = raw.toLowerCase();
  if (s.includes("шаурм") || s.includes("shawarma")) return "shawarma";
  if (s.includes("бургер") || s.includes("burger")) return "burger";
  if (s.includes("столов") || s.includes("canteen")) return "canteen";
  if (s.includes("паб") || s.includes("бар") || s === "bar") return "bar";
  if (s.includes("кальян") || s.includes("hookah")) return "hookah";
  if (s.includes("фудкорт") || s.includes("foodcourt")) return "foodcourt";
  if (s.includes("дарк") || s.includes("dark")) return "darkkitchen";
  return "shawarma";
}

/** Тип → приоритет: шаурмичные green, бургерные/столовые yellow, пабы red. */
function tierForType(type: ClientType): PriorityTier {
  if (type === "shawarma") return "green";
  if (type === "bar" || type === "hookah") return "red";
  return "yellow";
}

/** Район из ответа модели → справочник Ростова (регистр и «район» не важны). */
function normalizeDistrict(raw: string): string {
  const s = raw.replace(/\s*район$/i, "").trim().toLowerCase();
  if (!s) return "";
  const hit = DISTRICTS.find((d) => d.toLowerCase() === s);
  return hit ?? raw.trim();
}

/** Красивый хост источника: https://2gis.ru/rostov/… → 2gis.ru */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

/* ── Карточка кандидата ──────────────────────────────────── */

function LeadCard({
  lead,
  adding,
  onAdd,
  onReject,
}: {
  lead: DiscoveredLead;
  adding: boolean;
  onAdd: () => void;
  onReject: () => void;
}) {
  const tier = tierForType(lead.type);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 pl-[22px]"
    >
      {/* Полоска приоритета — как у карточек в «Клиентах» */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: PRIORITY_COLOR_VAR[tier] }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold leading-snug tracking-tight text-ink">
            {lead.name}
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {lead.district || "Район уточним"} · {CLIENT_TYPE_LABEL[lead.type]}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide"
          style={{
            color: PRIORITY_COLOR_VAR[tier],
            background: `color-mix(in srgb, ${PRIORITY_COLOR_VAR[tier]} 12%, transparent)`,
          }}
        >
          {PRIORITY_LABEL[tier]}
        </span>
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-soft">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        {lead.address}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {lead.phone ? (
          <span className="font-mono text-[13px] tabular-nums text-ink">
            {lead.phone}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-[11px] text-ink-soft">
            <PhoneOff className="size-3" />
            Нет телефона
          </span>
        )}
        {lead.source ? (
          <a
            href={lead.source}
            target="_blank"
            rel="noopener noreferrer"
            title={lead.source}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-tint px-2 py-0.5 text-[11px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
          >
            <ExternalLink className="size-3" />
            {hostOf(lead.source)}
          </a>
        ) : null}
        <span className="rounded-full bg-tint px-2 py-0.5 font-mono text-[11px] tabular-nums text-ink-soft">
          {fmtDay(lead.createdAt)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.98] disabled:opacity-60"
        >
          {adding ? (
            <Loader2 className="size-[18px] animate-spin" strokeWidth={2.4} />
          ) : (
            <UserPlus className="size-[18px]" strokeWidth={2.4} />
          )}
          {adding ? "Добавляем…" : "Добавить в CRM"}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={adding}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-[14px] font-semibold text-ink transition-all hover:border-tier-red/40 hover:bg-tier-red/5 hover:text-tier-red active:scale-[0.98] disabled:opacity-60"
        >
          <X className="size-[18px]" />
          Отклонить
        </button>
      </div>
    </motion.article>
  );
}

/* ── Экран ───────────────────────────────────────────────── */

export default function AiDiscoveryPage() {
  const leads = useDiscoveryStore((s) => s.leads);
  const approve = useDiscoveryStore((s) => s.approve);
  const reject = useDiscoveryStore((s) => s.reject);
  const clearHistory = useDiscoveryStore((s) => s.clearHistory);
  const lastSearchAt = useDiscoveryStore((s) => s.lastSearchAt);

  const clients = useCrmStore((s) => s.clients);
  const addClient = useCrmStore((s) => s.addClient);
  const { toast } = useToast();

  const [addingId, setAddingId] = useState<string | null>(null);

  const pending = useMemo(
    () => leads.filter((l) => l.status === "pending"),
    [leads]
  );
  const history = useMemo(
    () =>
      leads
        .filter((l) => l.status !== "pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [leads]
  );
  const approvedCount = leads.filter((l) => l.status === "approved").length;
  const rejectedCount = leads.filter((l) => l.status === "rejected").length;

  /* ── Разведка отключена (задача 13, Go-Live): веб-поиск вернётся
   * в следующем обновлении — кнопка выше неактивна, роут-заглушка
   * отвечает «появится в следующем обновлении». ── */

  /* ── Кандидат → клиент CRM: дедуп, геокодинг, холодный лид ── */
  const addToCrm = async (lead: DiscoveredLead) => {
    if (addingId) return;

    /* В базе уже есть такая точка (могли добавить руками после поиска). */
    const dupe = clients.find(
      (c) => leadKey(c.name, c.address) === leadKey(lead.name, lead.address)
    );
    if (dupe) {
      reject(lead.id);
      toast({
        title: "Точка уже в базе",
        description: `«${lead.name}» есть в CRM — кандидат убран из списка.`,
        duration: 4000,
      });
      return;
    }

    setAddingId(lead.id);
    try {
      /* Геокодинг через Nominatim: координаты + район, если ИИ не уверен. */
      let coordinates = { ...ROSTOV_CENTER };
      let district = lead.district;
      try {
        const suggestions = await geocodeAddress(lead.address);
        const first = suggestions[0];
        if (first) {
          coordinates = {
            lat: Math.round(first.lat * 1e6) / 1e6,
            lng: Math.round(first.lng * 1e6) / 1e6,
          };
          if (!district) district = normalizeDistrict(first.district ?? "");
        }
      } catch {
        /* адрес не геокодировался — центр города, уточним позже */
      }

      const tier = tierForType(lead.type);
      const client = addClient({
        name: lead.name,
        address: lead.address,
        district,
        phone: lead.phone ? formatPhoneInput(lead.phone) : "",
        type: lead.type,
        status: "cold",
        priorityTier: tier,
        notes: `Найдено ИИ через веб-поиск${
          lead.source ? ` · источник: ${hostOf(lead.source)}` : ""
        }`,
        coordinates,
      });
      approve(lead.id, client.id);

      toast({
        title: `Добавлен в CRM: ${lead.name}`,
        description: `Холодный лид · ${PRIORITY_LABEL[tier]} · загляните в «Звонки»`,
        duration: 4000,
      });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <Radar className="size-6 text-accent" />
            Найдено ИИ
            <span className="rounded-full bg-tint px-2.5 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
              {pending.length}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Разведка новых точек Ростова-на-Дону
            {lastSearchAt
              ? ` · последний поиск ${fmtDay(lastSearchAt)}`
              : ""}
          </p>
        </div>

        {/* TODO: интеграция с Perplexity/Tavily — когда API будет готов,
         * здесь будет кнопка "Найти новые точки", которая получает JSON
         * в нужном формате и одной кнопкой добавляет в базу
         * (задача 24: раздел не трогаем, заглушка «Функция появится позже»). */}
        <button
          type="button"
          disabled
          title="Функция появится позже"
          className="inline-flex h-10 cursor-not-allowed items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-[#1C1A17] opacity-50"
        >
          <Radar className="size-4" />
          Найти новые точки
        </button>
      </header>

      {/* ── Заглушка: поиск временно отключён (задача 13, Go-Live;
       * задача 24 — текст «Функция появится позже», раздел сохранён) ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-accent/40 bg-accent/5 px-4 py-3.5">
        <Radar className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">
            Функция появится позже
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
            Мозг уже работает на данных вашей базы — спрашивайте
            его в чате, кому позвонить первым. Ранее найденные кандидаты
            остались ниже: их можно добавить в CRM или отклонить.
          </p>
        </div>
      </div>

      {/* ── Сводка ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span>
          Кандидаты:{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">
            {pending.length}
          </span>
        </span>
        <span>
          Добавлено:{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">
            {approvedCount}
          </span>
        </span>
        <span>
          Отклонено:{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">
            {rejectedCount}
          </span>
        </span>
      </div>

      {/* ── Кандидаты ── */}
      {pending.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Radar className="size-8 text-ink-soft/50" />
          <p className="max-w-sm text-sm text-ink-soft">
            Кандидатов пока нет. Разведка новых точек вернётся в следующем
            обновлении — а пока добавляйте точки руками или спрашивайте
            Мозга по вашей базе.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {pending.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                adding={addingId === lead.id}
                onAdd={() => void addToCrm(lead)}
                onReject={() => reject(lead.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── История решений ── */}
      {history.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              <Check className="size-4 text-accent" />
              История решений
            </h2>
            <button
              type="button"
              onClick={clearHistory}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-tier-red/40 hover:text-tier-red"
            >
              <Trash2 className="size-3.5" />
              Очистить архив
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {history.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/60 px-3.5 py-2.5"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    lead.status === "approved"
                      ? "bg-tier-green/12 text-tier-green"
                      : "bg-tint text-ink-soft"
                  )}
                >
                  {lead.status === "approved" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {lead.name}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-soft">
                    {lead.status === "approved" ? "Добавлен в CRM" : "Отклонён"}{" "}
                    · {fmtDay(lead.createdAt)}
                    {lead.source ? ` · ${hostOf(lead.source)}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
