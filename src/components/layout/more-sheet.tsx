"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { SECONDARY_NAV, type NavItem } from "@/lib/navigation";
import { useUiStore } from "@/lib/ui-store";

/** Sheet «Ещё»: остальные разделы, поиск (открывает палитру) и тема. */
export function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const { toast } = useToast();

  const openSection = (item: NavItem) => {
    onOpenChange(false);
    if (item.ready) {
      router.push(item.href);
      return;
    }
    toast({
      title: `Раздел «${item.title}» в разработке`,
      description: "Появится в следующих задачах.",
      duration: 3200,
    });
  };

  const openPalette = () => {
    onOpenChange(false);
    // даём Sheet закрыться, затем открываем палитру
    setTimeout(() => setPaletteOpen(true), 180);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-none"
      >
        <SheetHeader className="px-0 pb-0">
          <SheetTitle className="text-left text-base">Ещё</SheetTitle>
          <SheetDescription className="text-left">
            Разделы, поиск и настройки оформления
          </SheetDescription>
        </SheetHeader>

        {/* Поиск -> командная палитра */}
        <button
          type="button"
          onClick={openPalette}
          className="flex h-11 w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Search className="size-4 shrink-0" />
          Поиск
          <span className="ml-auto font-mono text-xs text-ink-soft/70">Ctrl K</span>
        </button>

        {/* Разделы */}
        <div className="grid grid-cols-3 gap-3">
          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openSection(item)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-2 py-4 transition-all hover:border-accent/50 active:scale-95"
              >
                <Icon className="size-5 text-ink-soft" />
                <span className="text-xs font-medium text-ink">{item.title}</span>
              </button>
            );
          })}
        </div>

        {/* Тема */}
        <div className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
          <span className="text-sm text-ink">Тема оформления</span>
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
