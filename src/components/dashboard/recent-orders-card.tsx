"use client";

import { ArrowRight } from "lucide-react";

import { BentoCard, Sk } from "@/components/dashboard/bento-card";
import { useToast } from "@/hooks/use-toast";
import {
  formatMoney,
  ORDER_STATUS_LABEL,
  recentOrders,
  type OrderStatus,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<OrderStatus, string> = {
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  transit: "bg-accent/10 text-accent",
  packing: "bg-tint text-ink-soft",
};

/** «Последние заказы»: компактная таблица + ссылка «Все заказы →». */
export function RecentOrdersCard({ loading }: { loading: boolean }) {
  const { toast } = useToast();

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

  return (
    <BentoCard className="sm:col-span-2 lg:col-span-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Последние заказы</h3>
        <button
          type="button"
          onClick={() =>
            toast({
              title: "Заказы",
              description: "Полный список — в разделе «Заказы» (скоро).",
              duration: 3200,
            })
          }
          className="relative z-20 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Все заказы
          <ArrowRight className="size-4" />
        </button>
      </div>

      <div className="mt-2">
        {recentOrders.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between gap-3 border-t border-border/70 py-2.5 first:border-t-0"
          >
            <div className="flex min-w-0 items-baseline gap-3">
              <span className="shrink-0 font-mono text-xs text-ink-soft tabular-nums">
                {o.id}
              </span>
              <span className="truncate text-sm text-ink">{o.client}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden font-mono text-xs text-ink-soft tabular-nums sm:inline">
                {o.date}
              </span>
              <span className="font-mono text-sm font-medium text-ink tabular-nums">
                {formatMoney(o.amount)}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  STATUS_STYLES[o.status]
                )}
              >
                {ORDER_STATUS_LABEL[o.status]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}
