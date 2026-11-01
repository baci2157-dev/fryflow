"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronDown, MapPin, RefreshCw, Search } from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { formatCoords, geocodeAddress, type GeoSuggestion } from "@/lib/geocode";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  DISTRICTS,
  PRIORITY_COLOR_VAR,
  type Client,
  type ClientStatus,
  type ClientType,
  type PriorityTier,
} from "@/types/models";
import { cn } from "@/lib/utils";

/* ── Маска телефона: любое «918…» → «+7 (918) 123-45-67» ────── */

export function formatPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7")) d = "7" + d; // «918…» → «+7 (918)…»
  d = d.slice(0, 11);
  if (d.length <= 1) return ""; // «+7» стирается до пустоты
  const p1 = d.slice(1, 4);
  const p2 = d.slice(4, 7);
  const p3 = d.slice(7, 9);
  const p4 = d.slice(9, 11);
  let out = "+7";
  if (p1) out += ` (${p1}`;
  if (p1.length === 3) out += ")";
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

/* ── Схема zod ──────────────────────────────────────────────── */

const PHONE_RE = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;

const clientSchema = z
  .object({
    name: z.string().trim().min(2, "Название — минимум 2 символа"),
    phone: z
      .string()
      .refine((v) => v === "" || PHONE_RE.test(v), "Формат: +7 (999) 123-45-67"),
    type: z.enum(["shawarma", "burger", "canteen", "bar", "hookah", "foodcourt", "darkkitchen"]),
    priorityTier: z.enum(["green", "yellow", "red"]),
    status: z.enum(["cold", "no_answer", "callback", "trial", "regular", "refused"]),
    district: z.string().refine((v) => (DISTRICTS as readonly string[]).includes(v), "Выберите район"),
    address: z.string().trim().min(3, "Адрес — минимум 3 символа"),
    notes: z.string(),
    isChain: z.boolean(),
    chainName: z.string().trim(),
    chainSize: z.number().int().min(1, "Минимум 1 филиал").max(500).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .refine((d) => !d.isChain || (d.chainName.length >= 2 && !!d.chainSize), {
    message: "Укажите название сети и число филиалов",
    path: ["chainName"],
  });

type ClientFormValues = z.infer<typeof clientSchema>;

const TYPE_KEYS = Object.keys(CLIENT_TYPE_LABEL) as ClientType[];
const STATUS_KEYS = Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[];
const TIERS: PriorityTier[] = ["green", "yellow", "red"];

/** Ростов-на-Дону, центр — стартовые координаты нового клиента. */
const ROSTOV_CENTER = { lat: 47.2225, lng: 39.7188 };

const DEFAULTS: ClientFormValues = {
  name: "",
  phone: "",
  type: "shawarma",
  priorityTier: "green",
  status: "cold",
  district: "",
  address: "",
  notes: "",
  isChain: false,
  chainName: "",
  chainSize: undefined,
  lat: ROSTOV_CENTER.lat,
  lng: ROSTOV_CENTER.lng,
};

/* ── Диалог ─────────────────────────────────────────────────── */

export function ClientFormDialog({
  open,
  onClose,
  editClient,
}: {
  open: boolean;
  onClose: () => void;
  /** Клиент для редактирования или null — новый клиент. */
  editClient: Client | null;
}) {
  const addClient = useCrmStore((s) => s.addClient);
  const updateClient = useCrmStore((s) => s.updateClient);
  const { toast } = useToast();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: DEFAULTS,
  });

  // useWatch вместо watch: безопасно для React Compiler.
  const isChain = useWatch({ control, name: "isChain" });
  const latValue = useWatch({ control, name: "lat" });
  const lngValue = useWatch({ control, name: "lng" });

  // При открытии — заливаем поля (новый → дефолты, редактирование → клиент).
  useEffect(() => {
    if (!open) return;
    if (editClient) {
      reset({
        name: editClient.name,
        phone: editClient.phone,
        type: editClient.type,
        priorityTier: editClient.priorityTier,
        status: editClient.status,
        district: editClient.district,
        address: editClient.address,
        notes: editClient.notes,
        isChain: Boolean(editClient.chainName),
        chainName: editClient.chainName ?? "",
        chainSize: editClient.chainSize,
        lat: editClient.coordinates.lat,
        lng: editClient.coordinates.lng,
      });
    } else {
      reset(DEFAULTS);
    }
  }, [open, editClient, reset]);

  const submit = (values: ClientFormValues) => {
    const payload = {
      name: values.name.trim(),
      phone: values.phone,
      type: values.type,
      status: values.status,
      priorityTier: values.priorityTier,
      district: values.district,
      address: values.address.trim(),
      notes: values.notes.trim(),
      chainName: values.isChain ? values.chainName.trim() : undefined,
      chainSize: values.isChain ? values.chainSize : undefined,
      coordinates: { lat: values.lat, lng: values.lng },
    };

    if (editClient) {
      updateClient(editClient.id, payload);
      toast({
        title: "Карточка обновлена",
        description: `«${payload.name}» — изменения сохранены.`,
        duration: 3000,
      });
    } else {
      // Optimistic UI: стор обновляется синхронно, карточка появляется мгновенно.
      addClient(payload);
      toast({
        title: "Клиент добавлен",
        description: `«${payload.name}» — карточка уже в списке.`,
        duration: 3200,
      });
    }
    onClose();
  };

  return (
    <SpringSheet
      open={open}
      onClose={onClose}
      variant="dialog"
      desktopWidth={560}
      title={
        <span className="flex items-center gap-2">
          {editClient ? "Редактировать клиента" : "Новый клиент"}
          <span className="text-[12px] font-normal text-ink-soft">
            {editClient ? editClient.name : "CRM · база Ростова-на-Дону"}
          </span>
        </span>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="mt-4 space-y-4 pb-2">
        {/* Название */}
        <Field label="Название" required error={errors.name?.message}>
          <input
            {...register("name")}
            placeholder="Шаурма на Зорге"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </Field>

        {/* Телефон с маской */}
        <Field label="Телефон" error={errors.phone?.message} hint="Маска +7, можно вводить без восьмёрки">
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <input
                value={field.value}
                onChange={(e) => field.onChange(formatPhoneInput(e.target.value))}
                placeholder="+7 (999) 123-45-67"
                inputMode="tel"
                className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 font-mono text-[14px] tabular-nums text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            )}
          />
        </Field>

        {/* Тип — сегмент-контрол */}
        <Field label="Тип заведения" error={errors.type?.message}>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {TYPE_KEYS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => field.onChange(t)}
                    className={cn(
                      "h-10 rounded-xl border text-[12.5px] font-medium transition-colors",
                      field.value === t
                        ? "border-accent bg-accent/15 text-ink"
                        : "border-border bg-surface text-ink-soft hover:bg-tint"
                    )}
                  >
                    {CLIENT_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
          />
        </Field>

        {/* Приоритет — 3 кнопки */}
        <Field label="Приоритет базы" error={errors.priorityTier?.message}>
          <Controller
            control={control}
            name="priorityTier"
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-1.5">
                {TIERS.map((tier) => {
                  const active = field.value === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => field.onChange(tier)}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-colors"
                      style={{
                        color: active ? PRIORITY_COLOR_VAR[tier] : "var(--ink-soft)",
                        borderColor: active
                          ? `color-mix(in srgb, ${PRIORITY_COLOR_VAR[tier]} 55%, transparent)`
                          : "var(--border)",
                        background: active
                          ? `color-mix(in srgb, ${PRIORITY_COLOR_VAR[tier]} 12%, transparent)`
                          : "var(--surface)",
                      }}
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: PRIORITY_COLOR_VAR[tier] }}
                      />
                      {tier.toUpperCase()}
                      {active && <Check className="size-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </Field>

        {/* Статус + район */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Статус воронки" error={errors.status?.message}>
            <SelectLike>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value as ClientStatus)}
                    className="h-11 w-full appearance-none rounded-xl border border-border bg-surface px-3 text-[14px] text-ink focus:border-accent/50 focus:outline-none"
                  >
                    {STATUS_KEYS.map((s) => (
                      <option key={s} value={s}>
                        {CLIENT_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                )}
              />
            </SelectLike>
          </Field>
          <Field label="Район" required error={errors.district?.message}>
            <SelectLike>
              <Controller
                control={control}
                name="district"
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className={cn(
                      "h-11 w-full appearance-none rounded-xl border bg-surface px-3 text-[14px] focus:border-accent/50 focus:outline-none",
                      field.value ? "text-ink" : "text-ink-soft/70",
                      errors.district ? "border-[var(--tier-red)]" : "border-border"
                    )}
                  >
                    <option value="">Выберите район…</option>
                    {DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}
              />
            </SelectLike>
          </Field>
        </div>

        {/* Адрес + геокодинг Nominatim (debounce 1,5 с) */}
        <AddressFieldWithGeocode register={register} setValue={setValue} control={control} error={errors.address?.message} />

        {/* Сеть */}
        <Field label="Сеть точек">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
            <Controller
              control={control}
              name="isChain"
              render={({ field }) => (
                <button
                  type="button"
                  role="switch"
                  aria-checked={field.value}
                  onClick={() => field.onChange(!field.value)}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    field.value ? "bg-accent" : "bg-border"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                      field.value ? "left-[22px]" : "left-0.5"
                    )}
                  />
                </button>
              )}
            />
            Это сеть (несколько филиалов)
          </label>
          {isChain && (
            <div className="mt-2 grid grid-cols-[1fr_112px] gap-2">
              <input
                {...register("chainName")}
                placeholder="Название сети, напр. Kikchak"
                className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <input
                type="number"
                min={1}
                placeholder="Филиалов"
                {...register("chainSize", { valueAsNumber: true })}
                className={cn(
                  "h-11 w-full rounded-xl border bg-surface px-3.5 font-mono text-[14px] text-ink placeholder:font-sans placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none",
                  errors.chainName ? "border-[var(--tier-red)]" : "border-border"
                )}
              />
              {errors.chainName ? (
                <p className="col-span-2 text-[12px] text-[var(--tier-red)]">
                  {errors.chainName.message as string}
                </p>
              ) : null}
            </div>
          )}
        </Field>

        {/* Заметки */}
        <Field label="Заметки">
          <textarea
            {...register("notes")}
            rows={2}
            placeholder="Кто решает, когда звонить, что важно…"
            className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </Field>

        {/* Координаты (автозаполняются геокодингом; ручная правка — тут) */}
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12.5px] text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              Координаты для карты:{" "}
              <span className="font-mono text-ink">
                {formatCoords(latValue, lngValue)}
              </span>
            </span>
          </summary>
          <div className="grid grid-cols-2 gap-2 px-3.5 pb-3">
            <input
              type="number"
              step="any"
              {...register("lat", { valueAsNumber: true })}
              className="h-10 rounded-lg border border-border bg-surface px-3 font-mono text-[13px] text-ink focus:border-accent/50 focus:outline-none"
              aria-label="Широта"
            />
            <input
              type="number"
              step="any"
              {...register("lng", { valueAsNumber: true })}
              className="h-10 rounded-lg border border-border bg-surface px-3 font-mono text-[13px] text-ink focus:border-accent/50 focus:outline-none"
              aria-label="Долгота"
            />
          </div>
        </details>

        {/* Кнопки */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-border bg-surface text-[14px] font-semibold text-ink transition-colors hover:bg-tint"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 flex-[2] rounded-xl bg-accent text-[14px] font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90 disabled:opacity-60"
          >
            {editClient ? "Сохранить" : "Добавить клиента"}
          </button>
        </div>
      </form>
    </SpringSheet>
  );
}

/* ── Поле адреса с геокодингом ─────────────────────────────── */

type AddressGeocodeProps = {
  register: ReturnType<typeof useForm<ClientFormValues>>["register"];
  setValue: ReturnType<typeof useForm<ClientFormValues>>["setValue"];
  control: ReturnType<typeof useForm<ClientFormValues>>["control"];
  error?: string;
};

function AddressFieldWithGeocode({ register, setValue, control, error }: AddressGeocodeProps) {
  const address = useWatch({ control, name: "address" });
  const lat = useWatch({ control, name: "lat" });
  const lng = useWatch({ control, name: "lng" });

  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "none" | "error" | "applied">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const appliedRef = useRef<string>("");

  // Debounce 1,5 с: тишина в наборе → один запрос к Nominatim.
  // Все обновления состояния — внутри колбэка таймера (не в теле эффекта).
  useEffect(() => {
    const q = (address ?? "").trim();
    if (q.length < 5 || appliedRef.current === q) {
      const t = setTimeout(() => {
        setSuggestions([]);
        setState((s) => (s === "applied" || s === "none" ? s : "idle"));
      }, 0);
      return () => clearTimeout(t);
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState("searching");
      try {
        const res = await geocodeAddress(q, ctrl.signal);
        setSuggestions(res);
        setState(res.length === 0 ? "none" : "idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState("error");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [address]);

  const apply = (s: GeoSuggestion) => {
    appliedRef.current = s.label;
    setValue("address", s.label, { shouldValidate: true });
    // Округляем до 6 знаков — иначе нативный step-валидатор ругается
    // на «сырые» координаты Nominatim (47.22753421…).
    setValue("lat", Math.round(s.lat * 1e6) / 1e6, { shouldValidate: true });
    setValue("lng", Math.round(s.lng * 1e6) / 1e6, { shouldValidate: true });
    if (s.district && (DISTRICTS as readonly string[]).includes(s.district)) {
      setValue("district", s.district, { shouldValidate: true });
    }
    setSuggestions([]);
    setState("applied");
  };

  return (
    <div>
      <Field label="Адрес" required error={error}>
        <div className="relative">
          <input
            {...register("address")}
            placeholder="ул. Зорге, 19"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 pr-10 text-[14px] text-ink placeholder:text-ink-soft/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">
            {state === "searching" ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : state === "applied" ? (
              <Check className="size-4 text-[var(--tier-green)]" />
            ) : (
              <Search className="size-4" />
            )}
          </span>

          {/* Подсказки Nominatim */}
          {suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
              {suggestions.map((s) => (
                <li key={`${s.lat}-${s.lng}`}>
                  <button
                    type="button"
                    onClick={() => apply(s)}
                    className="flex w-full flex-col gap-0.5 border-b border-border px-3.5 py-2 text-left last:border-b-0 hover:bg-tint"
                  >
                    <span className="text-[13.5px] font-medium text-ink">{s.label}</span>
                    <span className="flex items-center justify-between gap-2 text-[11.5px] text-ink-soft">
                      <span className="truncate">{s.detail}</span>
                      <span className="shrink-0 font-mono">{formatCoords(s.lat, s.lng)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      <p className="mt-1.5 text-[12px] text-ink-soft">
        {state === "searching"
          ? "Ищем координаты в OpenStreetMap…"
          : state === "applied"
            ? `Координаты найдены: ${formatCoords(lat, lng)}`
            : state === "none"
              ? "Nominatim ничего не нашёл — уточните адрес (улица, дом) или задайте координаты вручную."
              : state === "error"
                ? "Nominatim недоступен — задайте координаты вручную ниже."
                : "Автопоиск по OpenStreetMap: введите улицу и дом, подождите 1,5 с."}
      </p>
    </div>
  );
}

/* ── Мелкие обёртки ─────────────────────────────────────────── */

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-ink-soft">
        {label}
        {required && <span className="text-accent">*</span>}
        {hint && <span className="ml-auto text-[11px] font-normal">{hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[12px] text-[var(--tier-red)]">{error}</p>}
    </div>
  );
}

function SelectLike({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
    </div>
  );
}
