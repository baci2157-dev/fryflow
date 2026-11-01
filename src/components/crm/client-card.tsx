"use client";

import { Navigation, Pencil, Phone } from "lucide-react";

import { ChainBadge, CallbackBadge, StatusBadge } from "@/components/crm/badges";
import { HealthRing } from "@/components/crm/health-ring";
import { useCrmStore } from "@/lib/clients-store";
import { calcHealthScore } from "@/lib/health-score";
import { buildYandexNavUrl } from "@/lib/route-algorithm";
import {
  CLIENT_TYPE_LABEL,
  PRIORITY_COLOR_VAR,
  type Client,
} from "@/types/models";

/**
 * Карточка клиента в стиле Apple Wallet: слева цветная полоска
 * приоритета, крупное название, телефон моноширинным, Health Score
 * кольцом справа. Тап по карточке открывает лист с деталями.
 */
export function ClientCard({
  client,
  onOpen,
  onEdit,
}: {
  client: Client;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const calls = useCrmStore((s) => s.calls);
  const health = calcHealthScore(client);

  // Ближайший незакрытый перезвон по этому клиенту.
  const callback = calls
    .filter((c) => c.clientId === client.id && c.result === "callback" && c.callbackDate)
    .map((c) => ({ ...c, at: new Date(c.callbackDate as string).getTime() }))
    .sort((a, b) => a.at - b.at)[0];

  const telHref = client.phone
    ? `tel:${client.phone.replace(/[^+\d]/g, "")}`
    : undefined;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface p-4 pl-5 transition-all hover:-translate-y-px hover:shadow-[0_8px_24px_color-mix(in_srgb,var(--ink)_8%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* Полоска приоритета — первое, что видит глаз */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: PRIORITY_COLOR_VAR[client.priorityTier] }}
      />

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[16px] font-semibold leading-snug tracking-tight text-ink">
              {client.name}
            </h3>
            {client.chainName ? (
              <ChainBadge name={client.chainName} size={client.chainSize} />
            ) : null}
          </div>

          <p className="mt-1 text-[13px] text-ink-soft">
            {client.district} · {CLIENT_TYPE_LABEL[client.type]}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {client.phone ? (
              <span className="font-mono text-[13px] tabular-nums text-ink">
                {client.phone}
              </span>
            ) : (
              <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] text-ink-soft">
                Нет телефона
              </span>
            )}
            <StatusBadge status={client.status} />
            {callback ? <CallbackBadge date={callback.callbackDate as string} /> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={telHref ?? "#"}
              onClick={(e) => {
                e.stopPropagation();
                if (!telHref) e.preventDefault();
              }}
              aria-disabled={!telHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors"
              style={
                telHref
                  ? {
                      color: "var(--tier-green)",
                      borderColor: "color-mix(in srgb, var(--tier-green) 35%, transparent)",
                      background: "color-mix(in srgb, var(--tier-green) 10%, transparent)",
                    }
                  : { color: "var(--ink-soft)", borderColor: "var(--border)", background: "var(--tint)", opacity: 0.6 }
              }
            >
              <Phone className="size-3.5" />
              Позвонить
            </a>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(buildYandexNavUrl(client), "_blank", "noopener");
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-tint px-3 text-[13px] font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
            >
              <Navigation className="size-3.5" />
              Навигатор
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-tint px-3 text-[13px] font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
            >
              <Pencil className="size-3.5" />
              Редактировать
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 self-start pt-0.5">
          <HealthRing score={health.score} size={44} />
          <span className="text-[9px] font-medium uppercase tracking-wide text-ink-soft">
            Health
          </span>
        </div>
      </div>
    </article>
  );
}
