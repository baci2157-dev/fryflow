"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  FlaskConical,
  MapPin,
  Phone,
  Plus,
  Send,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { formatPhoneInput } from "@/components/crm/client-form-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  formatTons,
  pluralRu,
  regionsSummary,
  useRegionsStore,
} from "@/lib/regions-store";
import {
  REGIONAL_STATUS_LABEL,
  type RegionalPartner,
  type RegionalStatus,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Экран «Регионы» (задача 7) — оптовики юга: Краснодар, Волгоград,
 * Ставрополь. Главное сверху: сводка «партнёры · тонны · фуры»,
 * затем чипы городов с количеством, ниже — таблица (десктоп) и
 * карточки (мобильные). Статус меняется прямо в списке.
 */

/* ── Воронка статусов ─────────────────────────────────────── */

const STATUS_ORDER: RegionalStatus[] = ["first", "test", "truck"];

const STATUS_ICON: Record<RegionalStatus, LucideIcon> = {
  first: Phone,
  test: FlaskConical,
  truck: Truck,
};

/** Цвет чипа статуса: первый контакт — нейтральный, тест — янтарь, фура — зелёные деньги. */
const STATUS_CLASS: Record<RegionalStatus, string> = {
  first: "bg-tint text-ink-soft border-border",
  test: "bg-accent/12 text-accent border-accent/35",
  truck: "bg-tier-green/12 text-tier-green border-tier-green/35",
};

/** Компактный дропдаун статуса: тап → меню из трёх шагов воронки. */
function StatusSelect({
  value,
  onChange,
  size = "md",
}: {
  value: RegionalStatus;
  onChange: (s: RegionalStatus) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const Icon = STATUS_ICON[value];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Статус: ${REGIONAL_STATUS_LABEL[value]}. Изменить`}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-all hover:brightness-105 active:scale-[0.97]",
          size === "sm" ? "h-8 px-2.5 text-[11.5px]" : "h-9 px-3 text-[12.5px]",
          STATUS_CLASS[value]
        )}
      >
        <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
        {REGIONAL_STATUS_LABEL[value]}
        <ChevronDown
          className={cn(
            "size-3.5 opacity-60 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* прозрачная подложка — закрывает меню тапом мимо */}
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="absolute right-0 top-[calc(100%+6px)] z-50 w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-[0_12px_32px_rgba(28,26,23,0.16)]"
            >
              {STATUS_ORDER.map((s) => {
                const OptIcon = STATUS_ICON[s];
                const active = s === value;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      onChange(s);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors",
                      active
                        ? "bg-tint text-ink"
                        : "text-ink-soft hover:bg-tint/60 hover:text-ink"
                    )}
                  >
                    <OptIcon
                      className={cn(
                        "size-4",
                        s === "truck" && "text-tier-green",
                        s === "test" && "text-accent"
                      )}
                    />
                    <span className="flex-1">{REGIONAL_STATUS_LABEL[s]}</span>
                    {active && <Check className="size-3.5 text-accent" strokeWidth={3} />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Форма новой карточки оптовика ──────────────────────── */

/** Подсказки городов: существующие в базе + типовые города юга. */
const CITY_SUGGESTIONS = [
  "Краснодар",
  "Волгоград",
  "Ставрополь",
  "Ростов-на-Дону",
  "Таганрог",
  "Сочи",
  "Майкоп",
  "Элиста",
];

const FIELD_CLS =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30";

const LABEL_CLS =
  "mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft";

function PartnerFormDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const addPartner = useRegionsStore((s) => s.addPartner);
  const partners = useRegionsStore((s) => s.partners);
  const { toast } = useToast();

  const [company, setCompany] = useState("");
  const [city, setCity] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [volume, setVolume] = useState("");
  const [status, setStatus] = useState<RegionalStatus>("first");
  const [notes, setNotes] = useState("");

  const cityOptions = useMemo(
    () =>
      Array.from(new Set([...partners.map((p) => p.city), ...CITY_SUGGESTIONS])),
    [partners]
  );

  const valid =
    company.trim().length >= 2 &&
    city.trim().length >= 2 &&
    contact.trim().length >= 2;
  const volumeTons = Math.max(
    0,
    Math.min(2000, Math.round(Number(volume.replace(",", ".")) || 0))
  );

  const close = () => {
    setCompany("");
    setCity("");
    setContact("");
    setPhone("");
    setVolume("");
    setStatus("first");
    setNotes("");
    onClose();
  };

  const submit = () => {
    if (!valid) return;
    const partner = addPartner({
      company: company.trim(),
      city: city.trim(),
      contactPerson: contact.trim(),
      phone: phone.trim(),
      volumeTons,
      status,
      notes: notes.trim(),
    });
    toast({
      title: "Оптовик добавлен",
      description: `${partner.company} — ${partner.city}. Карточка встала первой в списке.`,
      duration: 3800,
    });
    close();
  };

  return (
    <SpringSheet
      open={open}
      onClose={close}
      title="Новый оптовик"
      variant="dialog"
      desktopWidth={480}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className={LABEL_CLS} htmlFor="partner-company">
            Компания *
          </label>
          <input
            id="partner-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="ООО «Юг Опт»"
            className={FIELD_CLS}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLS} htmlFor="partner-city">
              Город *
            </label>
            <input
              id="partner-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Краснодар"
              list="partner-city-options"
              className={FIELD_CLS}
            />
            <datalist id="partner-city-options">
              {cityOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={LABEL_CLS} htmlFor="partner-volume">
              Объём, т/мес
            </label>
            <input
              id="partner-volume"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              inputMode="decimal"
              placeholder="20"
              className={cn(FIELD_CLS, "font-mono tabular-nums")}
            />
          </div>
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="partner-contact">
            Контактное лицо *
          </label>
          <input
            id="partner-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Сергей Кравцов"
            className={FIELD_CLS}
          />
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="partner-phone">
            Телефон
          </label>
          <input
            id="partner-phone"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            inputMode="tel"
            placeholder="+7 (918) 000-00-00"
            className={cn(FIELD_CLS, "font-mono tabular-nums")}
          />
        </div>

        <div>
          <span className={LABEL_CLS}>Статус воронки</span>
          <StatusSelect value={status} onChange={setStatus} />
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="partner-notes">
            Заметка
          </label>
          <textarea
            id="partner-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Как договорились, объёмы, условия оплаты…"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="inline-flex h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-tint hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={submit}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50"
          >
            <Plus className="size-4" />
            Добавить оптовика
          </button>
        </div>
      </div>
    </SpringSheet>
  );
}

/* ── Строка таблицы (десктоп) ────────────────────────────── */

function PartnerRow({
  partner,
  onStatus,
}: {
  partner: RegionalPartner;
  onStatus: (id: string, s: RegionalStatus) => void;
}) {
  return (
    <tr className="border-b border-border/60 last:border-b-0 hover:bg-tint/40">
      <td className="max-w-[240px] py-3 pl-5 pr-3">
        <p className="truncate text-[13.5px] font-semibold text-ink">
          {partner.company}
        </p>
        <p
          className="mt-0.5 max-w-[220px] truncate text-[11.5px] text-ink-soft"
          title={partner.notes}
        >
          {partner.notes}
        </p>
      </td>
      <td className="py-3 pr-3 text-[12.5px] text-ink-soft">{partner.city}</td>
      <td className="py-3 pr-3">
        <p className="text-[12.5px] font-medium text-ink">{partner.contactPerson}</p>
        <a
          href={`tel:${partner.phone.replace(/[^\d+]/g, "")}`}
          className="font-mono text-[12px] tabular-nums text-ink-soft transition-colors hover:text-accent"
        >
          {partner.phone}
        </a>
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[13.5px] font-semibold tabular-nums text-ink">
        {partner.volumeTons.toLocaleString("ru-RU")}
        <span className="ml-0.5 text-[11px] font-normal text-ink-soft">т</span>
      </td>
      <td className="py-3 pr-5">
        <StatusSelect
          value={partner.status}
          size="sm"
          onChange={(s) => onStatus(partner.id, s)}
        />
      </td>
    </tr>
  );
}

/* ── Карточка (мобильные) ────────────────────────────────── */

function PartnerCard({
  partner,
  onStatus,
}: {
  partner: RegionalPartner;
  onStatus: (id: string, s: RegionalStatus) => void;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(28,26,23,0.04)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-semibold leading-tight text-ink">
            {partner.company}
          </h3>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-ink-soft">
            <MapPin className="size-3 text-accent" />
            {partner.city}
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-tint px-2.5 py-1.5 font-mono text-[14px] font-semibold tabular-nums text-ink">
          {partner.volumeTons.toLocaleString("ru-RU")}
          <span className="ml-0.5 text-[11px] font-normal text-ink-soft">т</span>
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-medium text-ink">
          {partner.contactPerson}
        </span>
        <a
          href={`tel:${partner.phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex items-center gap-1 font-mono text-[12.5px] tabular-nums text-ink-soft transition-colors hover:text-accent"
        >
          <Phone className="size-3" />
          {partner.phone}
        </a>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-ink-soft">{partner.notes}</p>

      <div className="mt-3 flex justify-end">
        <StatusSelect
          value={partner.status}
          onChange={(s) => onStatus(partner.id, s)}
        />
      </div>
    </motion.article>
  );
}

/* ── Страница ────────────────────────────────────────────── */

const STATUS_RANK: Record<RegionalStatus, number> = { truck: 0, test: 1, first: 2 };

export default function RegionsPage() {
  const partners = useRegionsStore((s) => s.partners);
  const setStatus = useRegionsStore((s) => s.setStatus);

  const [city, setCity] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);

  const summary = useMemo(() => regionsSummary(partners), [partners]);

  const visible = useMemo(() => {
    const list = city === "all" ? partners : partners.filter((p) => p.city === city);
    return [...list].sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.volumeTons - a.volumeTons
    );
  }, [partners, city]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <MapPin className="size-6 text-accent" />
            Регионы
            <span className="rounded-full bg-tint px-2.5 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
              {summary.partners}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Оптовики юга — второй канал после Ростова: фурами берут то, что
            шаурмичным возим коробками
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
          >
            <Plus className="size-4" />
            Добавить оптовика
          </button>
          <a
            href="https://t.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
          >
            <Send className="size-4 text-accent" />
            Написать в Telegram
          </a>
        </div>
      </header>

      {/* ── Сводка: главное сверху ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-4 sm:gap-4 sm:p-5"
      >
        <div>
          <p className="font-mono text-xl font-semibold tabular-nums text-ink sm:text-2xl">
            {summary.partners}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-soft sm:text-[12.5px]">
            {pluralRu(summary.partners, "партнёр", "партнёра", "партнёров")}
          </p>
        </div>
        <div className="border-x border-border px-2 text-center sm:px-4">
          <p className="font-mono text-xl font-semibold tabular-nums text-accent sm:text-2xl">
            {formatTons(summary.tons)}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-soft sm:text-[12.5px]">
            суммарный объём
          </p>
        </div>
        <div className="text-right sm:text-left">
          <p className="font-mono text-xl font-semibold tabular-nums text-tier-green sm:text-2xl">
            {summary.trucks}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-soft sm:text-[12.5px]">
            {pluralRu(summary.trucks, "фура", "фуры", "фур")} ·{" "}
            {summary.tests} в тесте
          </p>
        </div>
      </motion.div>

      {/* Чипы городов с количеством */}
      <div
        className="fryflow-scroll -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Фильтр по городам"
      >
        <button
          type="button"
          role="tab"
          aria-selected={city === "all"}
          onClick={() => setCity("all")}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
            city === "all"
              ? "border-transparent bg-ink text-bg"
              : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
          )}
        >
          Все
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              city === "all" ? "opacity-70" : "text-ink-soft"
            )}
          >
            {summary.partners}
          </span>
        </button>
        {summary.byCity.map((c) => (
          <button
            key={c.city}
            type="button"
            role="tab"
            aria-selected={city === c.city}
            onClick={() => setCity(c.city)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              city === c.city
                ? "border-transparent bg-ink text-bg"
                : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
            )}
          >
            {c.city}
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                city === c.city ? "opacity-70" : "text-ink-soft"
              )}
            >
              {c.partners}
            </span>
          </button>
        ))}
      </div>

      {/* ── Список ── */}
      {visible.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <MapPin className="size-8 text-ink-soft/50" />
          <p className="text-sm font-medium text-ink">В этом городе пока пусто</p>
          <p className="max-w-xs text-[13px] leading-snug text-ink-soft">
            Добавьте оптовика после первого созвона — и наблюдайте, как он
            идёт по воронке к фуре.
          </p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="text-sm font-medium text-accent hover:underline"
          >
            + Добавить оптовика
          </button>
        </div>
      ) : (
        <>
          {/* Десктоп: таблица */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-tint/50 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="py-2.5 pl-5 pr-3">Компания</th>
                  <th className="py-2.5 pr-3">Город</th>
                  <th className="py-2.5 pr-3">Контакт</th>
                  <th className="py-2.5 pr-3 text-right">Объём</th>
                  <th className="py-2.5 pr-5">Статус</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <PartnerRow key={p.id} partner={p} onStatus={setStatus} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильные: карточки */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((p) => (
                <PartnerCard key={p.id} partner={p} onStatus={setStatus} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Диалог новой карточки оптовика */}
      <PartnerFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
