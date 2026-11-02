"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  CheckCircle2,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Trash2,
} from "lucide-react";

import { ChainBadge, StatusBadge } from "@/components/crm/badges";
import { SpringSheet } from "@/components/crm/spring-sheet";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { logCall as logCallQ } from "@/lib/queries";
import { buildYandexNavUrl, typicalStopFor } from "@/lib/route-algorithm";
import { calcHealthScore } from "@/lib/health-score";
import {
  CALL_RESULT_LABEL,
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  PRIORITY_COLOR_VAR,
  type CallResult,
  type Client,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Лист деталей клиента: открывается тапом по карточке.
 * Health Score с разбором штрафов, действия, журнал звонков
 * с формой «записать звонок» (результат обновляет статус воронки).
 */
export function ClientSheet({
  client,
  open,
  onClose,
  onEdit,
}: {
  client: Client | null;
  open: boolean;
  onClose: () => void;
  onEdit: (client: Client) => void;
}) {
  const calls = useCrmStore((s) => s.calls);
  const routeStops = useCrmStore((s) => s.routeStops);
  const toggleRouteStop = useCrmStore((s) => s.toggleRouteStop);
  const deleteClient = useCrmStore((s) => s.deleteClient);
  /* Сервисный слой: звонки уходят и в базу (Supabase), офлайн — в очередь. */
  const addCall = logCallQ;
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const clientCalls = useMemo(
    () =>
      calls
        .filter((c) => c.clientId === client?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [calls, client?.id]
  );

  if (!client) return null;
  const health = calcHealthScore(client);
  const inRoute = routeStops.some((r) => r.clientId === client.id);
  const telHref = client.phone
    ? `tel:${client.phone.replace(/[^+\d]/g, "")}`
    : undefined;

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteClient(client.id);
    toast({
      title: `«${client.name}» удалён`,
      description: "Карточка и журнал звонков убраны из базы.",
      duration: 3000,
    });
    setConfirmDelete(false);
    onClose();
  };

  const handleToggleRoute = () => {
    const added = toggleRouteStop(typicalStopFor(client));
    toast({
      title: added ? "Точка в маршруте" : "Точка убрана из маршрута",
      description: added
        ? `«${client.name}» — смотрите экран «Маршрут»`
        : `«${client.name}» больше не в маршруте дня`,
      duration: 2600,
    });
  };

  return (
    <SpringSheet
      open={open}
      onClose={() => {
        setConfirmDelete(false);
        onClose();
      }}
      title={
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1.5 rounded-full"
            style={{ background: PRIORITY_COLOR_VAR[client.priorityTier] }}
          />
          {client.name}
        </span>
      }
    >
      {/* ── Health Score + статус ── */}
      <section className="mt-4 flex items-center gap-4 rounded-2xl border border-border bg-tint/60 p-4">
        <ClientHealthBlock client={client} />
      </section>

      {/* ── Действия ── */}
      <section className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={telHref ?? "#"}
          onClick={(e) => !telHref && e.preventDefault()}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors",
            telHref
              ? "bg-accent text-[#1C1A17] hover:bg-accent/90"
              : "pointer-events-none bg-tint text-ink-soft opacity-60"
          )}
        >
          {telHref ? <Phone className="size-4" /> : <PhoneOff className="size-4" />}
          Позвонить
        </a>
        <button
          type="button"
          onClick={() => window.open(buildYandexNavUrl(client), "_blank", "noopener")}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
        >
          <Navigation className="size-4" />
          Навигатор
        </button>
        <button
          type="button"
          onClick={handleToggleRoute}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors",
            inRoute
              ? "border-accent/50 bg-accent/15 text-ink"
              : "border-border bg-surface text-ink hover:border-accent/40 hover:bg-accent/10"
          )}
        >
          {inRoute ? <CheckCircle2 className="size-4 text-accent" /> : <Plus className="size-4" />}
          {inRoute ? "В маршруте" : "В маршрут"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(client)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
        >
          <Pencil className="size-4" />
          Редактировать
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className={cn(
            "col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-[13px] font-medium transition-colors",
            confirmDelete
              ? "border-transparent bg-[var(--tier-red)] text-white"
              : "border-border bg-surface text-ink-soft hover:border-[color-mix(in_srgb,var(--tier-red)_40%,transparent)] hover:text-[var(--tier-red)]"
          )}
        >
          <Trash2 className="size-3.5" />
          {confirmDelete ? "Точно удалить? Нажмите ещё раз" : "Удалить клиента"}
        </button>
      </section>

      {/* ── Паспорт клиента ── */}
      <section className="mt-5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Паспорт
        </h4>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-2xl border border-border p-4 sm:grid-cols-2">
          <InfoRow label="Сегмент" value={CLIENT_TYPE_LABEL[client.type]} />
          <InfoRow label="Статус" value={<StatusBadge status={client.status} />} />
          <InfoRow label="Район" value={client.district} />
          <InfoRow
            label="Телефон"
            value={
              client.phone ? (
                <span className="font-mono tabular-nums">{client.phone}</span>
              ) : (
                <span className="text-ink-soft">нет — заехать лично</span>
              )
            }
          />
          <div className="sm:col-span-2">
            <InfoRow
              label="Адрес"
              value={
                <span className="inline-flex items-start gap-1">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
                  {client.address}, Ростов-на-Дону
                </span>
              }
            />
          </div>
          {client.chainName ? (
            <InfoRow
              label="Сеть"
              value={<ChainBadge name={client.chainName} size={client.chainSize} />}
            />
          ) : null}
          <InfoRow
            label="В базе с"
            value={format(new Date(client.createdAt), "d MMM y", { locale: ru })}
          />
          {client.notes ? (
            <div className="sm:col-span-2">
              <InfoRow label="Заметки" value={client.notes} />
            </div>
          ) : null}
        </dl>
      </section>

      {/* ── Разбор Health Score ── */}
      <section className="mt-5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Health Score
        </h4>
        <div className="mt-2 rounded-2xl border border-border p-4 text-[13px] text-ink-soft">
          {health.score === null ? (
            <p>
              Оценки пока нет: истории заказов не существует. Позвоните,
              привезите пробу — со следующей отгрузкой появится база 100.
            </p>
          ) : (
            <>
              <p className="text-ink">
                База 100
                {health.overduePenalty > 0 &&
                  ` − просрочка ${health.overdueDays} дн. (−${health.overduePenalty})`}
                {health.noOrdersPenalty > 0 && " − нет заказов >30 дней (−20)"}
                {health.refusedPenalty > 0 && " − отказ (−30)"}
                {" = "}
                <span className="font-mono font-semibold">{health.score}</span>
              </p>
              <p className="mt-1.5">
                {health.summary}. Норма заказов для сегмента — раз в{" "}
                {health.frequencyDays} дн.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── Журнал звонков ── */}
      <section className="mt-5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Звонки ({clientCalls.length})
        </h4>
        <CallLogForm clientId={client.id} />
        <ul className="mt-3 space-y-2">
          {clientCalls.length === 0 ? (
            <li className="rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-ink-soft">
              Звонков пока не было.
            </li>
          ) : (
            clientCalls.map((call) => (
              <li key={call.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={call.result} />
                  <time className="font-mono text-[11px] text-ink-soft">
                    {format(new Date(call.createdAt), "d MMM, HH:mm", { locale: ru })}
                  </time>
                </div>
                {call.comment ? (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                    {call.comment}
                  </p>
                ) : null}
                {call.callbackDate ? (
                  <p className="mt-1 text-[12px] text-accent">
                    Перезвонить: {format(new Date(call.callbackDate), "d MMMM", { locale: ru })}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </SpringSheet>
  );
}

/* ── Вспомогательные блоки ─────────────────────────────────── */

function ClientHealthBlock({ client }: { client: Client }) {
  const health = calcHealthScore(client);
  return (
    <>
      <div
        className="flex size-14 shrink-0 items-center justify-center rounded-full border-[3px] font-mono text-base font-bold"
        style={{
          borderColor:
            health.score === null ? "var(--border)" : healthScoreColor(health.score),
          color: health.score === null ? "var(--ink-soft)" : healthScoreColor(health.score),
        }}
        aria-label={`Health Score ${health.score ?? "нет данных"}`}
      >
        {health.score ?? "—"}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] leading-snug text-ink">
          {health.score === null
            ? "Нет истории заказов"
            : health.summary}
        </p>
        <p className="mt-1 text-[11px] text-ink-soft">
          Статус: {CLIENT_STATUS_LABEL[client.status]} · приоритет{" "}
          <span
            className="font-semibold"
            style={{ color: PRIORITY_COLOR_VAR[client.priorityTier] }}
          >
            {client.priorityTier.toUpperCase()}
          </span>
        </p>
      </div>
    </>
  );
}

function healthScoreColor(score: number): string {
  if (score >= 80) return "var(--tier-green)";
  if (score >= 50) return "var(--tier-yellow)";
  return "var(--tier-red)";
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/* ── Форма «записать звонок» ───────────────────────────────── */

const CALL_RESULTS: CallResult[] = ["trial", "callback", "refused", "no_answer"];

function CallLogForm({ clientId }: { clientId: string }) {
  /* Сервисный слой: журнал звонков — мок/Supabase + офлайн-очередь. */
  const addCall = logCallQ;
  const { toast } = useToast();
  const [result, setResult] = useState<CallResult>("trial");
  const [comment, setComment] = useState("");
  const [callbackDate, setCallbackDate] = useState(
    format(new Date(Date.now() + 86_400_000), "yyyy-MM-dd")
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addCall({
      clientId,
      result,
      comment: comment.trim(),
      callbackDate: result === "callback" ? callbackDate : undefined,
    });
    setComment("");
    toast({
      title: "Звонок записан",
      description: `Статус воронки обновлён: «${CALL_RESULT_LABEL[result]}».`,
      duration: 3000,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-2xl border border-border p-3"
      aria-label="Записать звонок"
    >
      <div className="flex flex-wrap gap-1.5">
        {CALL_RESULTS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setResult(r)}
            className={cn(
              "h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
              result === r
                ? "border-accent bg-accent/15 text-ink"
                : "border-border bg-surface text-ink-soft hover:bg-tint"
            )}
          >
            {CALL_RESULT_LABEL[r]}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий: с кем говорили, о чём договорились…"
        rows={2}
        className="mt-2 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-soft/70 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
      {result === "callback" ? (
        <label className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-soft">
          Перезвонить
          <input
            type="date"
            value={callbackDate}
            onChange={(e) => setCallbackDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[12.5px] text-ink focus:border-accent/50 focus:outline-none"
          />
        </label>
      ) : null}
      <button
        type="submit"
        className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-semibold text-[#1C1A17] transition-colors hover:bg-accent/90"
      >
        <Phone className="size-3.5" />
        Записать звонок
      </button>
    </form>
  );
}
