"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowRight, Check } from "lucide-react";

import { BentoCard, Sk } from "@/components/dashboard/bento-card";
import {
  orderNumber,
  useOrdersStore,
} from "@/lib/orders-store";
import { formatMoney } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** «Последние заказы»: живой список из стора + ссылка «Все заказы →». */
export function RecentOrdersCard({ loading }: { loading: boolean }) {
  const router = useRouter();
  const orders = useOrdersStore((s) => s.orders);

  if (loading) {
    return (
      <BentoCard
        loading
        className="sm:col-span-2 lg:col-span-4"
        skeleton={
          <div className="space-y-2.5">
            <Sk className="h-3.5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Sk key={i} className="h-10 w-full" />
            ))}
          </div>
        }
      />
    );
  }

  const recent = [...orders]
    .sort((a, b) => orderNumber(b) - orderNumber(a))
    .slice(0, 5);

  return (
    <BentoCard className="sm:col-span-2 lg:col-span-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Последние заказы</h3>
        <button
          type="button"
          onClick={() => router.push("/orders")}
          className="relative z-20 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Все заказы
          <ArrowRight className="size-4" />
        </button>
      </div>

      <div className="mt-2">
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">
            Заказов пока нет — создайте первый в разделе «Заказы».
          </p>
        ) : (
          recent.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => router.push("/orders")}
              className="flex w-full items-center justify-between gap-3 border-t border-border/70 py-2.5 text-left transition-colors first:border-t-0 hover:bg-tint/50"
            >
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="shrink-0 font-mono text-xs text-ink-soft tabular-nums">
                  #{orderNumber(o)}
                </span>
                <span className="truncate text-sm text-ink">{o.clientName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden font-mono text-xs text-ink-soft tabular-nums sm:inline">
                  {format(new Date(`${o.deliveryDate}T00:00:00`), "d MMM", {
                    locale: ru,
                  })}
                  {" · "}
                  {o.boxesCount} уп.
                </span>
                <span className="font-mono text-sm font-medium text-ink tabular-nums">
                  {formatMoney(o.totalAmount)}
                </span>
                {o.isDraft ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-tint px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                    Черновик
                  </span>
                ) : o.isPaid ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-tier-green/10 px-2 py-0.5 text-[11px] font-medium text-tier-green">
                    <Check className="size-3" strokeWidth={3} />
                    Оплачен
                  </span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      "bg-accent/10 text-accent"
                    )}
                  >
                    Долг
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </BentoCard>
  );
}
