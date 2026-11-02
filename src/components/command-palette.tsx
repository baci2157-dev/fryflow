"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  MapPin,
  PhoneCall,
  Plus,
  Send,
  ShoppingCart,
  Sparkles,
  SunMoon,
  UserPlus,
  Users,
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
import { useCrmStore } from "@/lib/clients-store";
import {
  clients as clientStubs,
  formatMoney,
  recentOrders,
} from "@/lib/mock-data";
import { NAV_ITEMS } from "@/lib/navigation";
import { useUiStore } from "@/lib/ui-store";
import { calcHealthScore } from "@/lib/health-score";

/**
 * Командная палитра FryFlow (Ctrl+K / Cmd+K).
 * Категории: Клиенты (живая база CRM), Заказы, Разделы, Действия.
 * Выбор клиента открывает его карточку на экране «Клиенты».
 */
export function CommandPalette() {
  const router = useRouter();
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const refreshAdvice = useUiStore((s) => s.refreshAdvice);
  const focusClient = useUiStore((s) => s.focusClient);
  const requestClientForm = useUiStore((s) => s.requestClientForm);
  const crmClients = useCrmStore((s) => s.clients);
  const { setTheme, resolvedTheme } = useTheme();
  const { toast } = useToast();

  const close = () => setOpen(false);

  const goClient = (id: string, name: string) => {
    close();
    focusClient(id);
    router.push("/clients");
    toast({
      title: `Карточка «${name}»`,
      description: "Открываем детали клиента.",
      duration: 2200,
    });
  };

  const notify = (title: string, description?: string) => {
    close();
    toast({ title, description, duration: 3200 });
  };

  // Живые клиенты CRM; пока база пустая — показываем стабы из демо-данных.
  const people =
    crmClients.length > 0
      ? crmClients.slice(0, 8)
      : clientStubs.map((c) => ({
          id: c.id,
          name: c.name,
          address: c.address,
        }));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
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
                {people.map((c) => {
                  const full = crmClients.find((x) => x.id === c.id);
                  const score = full ? calcHealthScore(full).score : null;
                  return (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.address} клиент`}
                      onSelect={() => goClient(c.id, c.name)}
                    >
                      <Users className="size-4" />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-xs text-ink-soft">
                        {score !== null && (
                          <span className="font-mono tabular-nums">{score}</span>
                        )}
                        <span className="hidden sm:inline">{c.address}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandGroup heading="Заказы">
                {recentOrders.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.id} ${o.client} заказ`}
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
                      value={`Раздел ${item.title} ${item.href}`}
                      onSelect={() => {
                        close();
                        if (item.ready) {
                          router.push(item.href);
                        } else {
                          notify(
                            `Раздел «${item.title}» в разработке`,
                            "Появится в следующих задачах."
                          );
                        }
                      }}
                    >
                      <Icon className="size-4" />
                      <span>{item.title}</span>
                      {item.ready ? (
                        <span className="ml-auto pl-3 font-mono text-[10px] text-accent">
                          готово
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandGroup heading="Действия">
                <CommandItem
                  value="Добавить клиента новый создать CRM"
                  onSelect={() => {
                    close();
                    requestClientForm({ mode: "new" });
                    router.push("/clients");
                  }}
                >
                  <UserPlus className="size-4" />
                  Добавить клиента
                  <Plus className="ml-auto size-3 text-ink-soft" />
                </CommandItem>
                <CommandItem
                  value="Открыть карту логистика маркеры маршруты"
                  onSelect={() => {
                    close();
                    router.push("/logistics");
                  }}
                >
                  <MapPin className="size-4" />
                  Открыть карту клиентов
                </CommandItem>
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
                  value="Спросить ИИ-Директора чат ассистент долги склад"
                  onSelect={() => {
                    close();
                    router.push("/ai-assistant");
                  }}
                >
                  <Sparkles className="size-4" />
                  Спросить ИИ-Директора
                  <span className="ml-auto pl-3 font-mono text-[10px] text-accent">чат</span>
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
                  value="Позвонить должнику звонок просрочка долги дебиторка"
                  onSelect={() => {
                    close();
                    router.push("/debts");
                  }}
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
