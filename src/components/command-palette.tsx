"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTheme } from "next-themes";
import {
  PhoneCall,
  Send,
  ShoppingCart,
  Sparkles,
  SunMoon,
  User,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  clients,
  formatMoney,
  recentOrders,
} from "@/lib/mock-data";
import { NAV_ITEMS } from "@/lib/navigation";
import { useUiStore } from "@/lib/ui-store";

/**
 * Командная палитра FryFlow (Ctrl+K / Cmd+K).
 * Категории: Клиенты, Заказы, Разделы, Действия.
 * Навигация ↑/↓ и Enter — внутри cmdk, Esc — Radix.
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const refreshAdvice = useUiStore((s) => s.refreshAdvice);
  const { setTheme, resolvedTheme } = useTheme();
  const { toast } = useToast();

  const close = () => setOpen(false);

  const notify = (title: string, description?: string) => {
    close();
    toast({ title, description, duration: 3200 });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-20 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 sm:max-w-[640px]"
        >
          <DialogPrimitive.Title className="sr-only">
            Командная палитра FryFlow
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Поиск по клиентам, заказам, разделам и действиям
          </DialogPrimitive.Description>

          <Command>
            <CommandInput placeholder="Поиск: клиент, адрес, заказ, раздел, действие…" />
            <CommandList className="fryflow-scroll max-h-[min(60vh,380px)]">
              <CommandEmpty>Ничего не найдено.</CommandEmpty>

              <CommandGroup heading="Клиенты">
                {clients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.address}`}
                    onSelect={() =>
                      notify(`Карточка «${c.name}»`, "Откроется в разделе «Клиенты».")
                    }
                  >
                    <User className="size-4" />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto shrink-0 pl-3 text-xs text-ink-soft">
                      {c.address}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandGroup heading="Заказы">
                {recentOrders.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.id} ${o.client}`}
                    onSelect={() =>
                      notify(`Заказ ${o.id}`, "Карточка заказа — в разделе «Заказы».")
                    }
                  >
                    <ShoppingCart className="size-4" />
                    <span className="font-mono text-ink">{o.id}</span>
                    <span className="truncate text-ink-soft">{o.client}</span>
                    <span className="ml-auto shrink-0 pl-3 font-mono text-xs tabular-nums">
                      {formatMoney(o.amount)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandGroup heading="Разделы">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`Раздел ${item.title}`}
                      onSelect={() =>
                        notify(`Раздел «${item.title}»`, "Появится в следующих задачах.")
                      }
                    >
                      <Icon className="size-4" />
                      <span>{item.title}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandGroup heading="Действия">
                <CommandItem
                  value="Переключить тему светлая тёмная оформление"
                  onSelect={() => {
                    close();
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  }}
                >
                  <SunMoon className="size-4" />
                  Переключить тему
                </CommandItem>
                <CommandItem
                  value="Обновить совет ИИ искра подсказка"
                  onSelect={() => {
                    close();
                    refreshAdvice();
                  }}
                >
                  <Sparkles className="size-4" />
                  Обновить совет ИИ
                </CommandItem>
                <CommandItem
                  value="Позвонить должнику звонок просрочка"
                  onSelect={() =>
                    notify("Звонок должнику", "Набор номера — в разделе «Долги».")
                  }
                >
                  <PhoneCall className="size-4" />
                  Позвонить должнику
                </CommandItem>
                <CommandItem
                  value="Открыть Telegram телеграм уведомления"
                  onSelect={() =>
                    notify("Telegram подключён", "Уведомления приходят в чат-бот.")
                  }
                >
                  <Send className="size-4" />
                  Открыть Telegram
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
