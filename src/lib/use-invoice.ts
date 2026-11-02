"use client";

import { useCallback } from "react";

import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { invoiceNumber, openInvoicePdf } from "@/lib/pdf-invoice";
import { useOrdersStore } from "@/lib/orders-store";
import { useSettingsStore } from "@/lib/settings-store";
import type { Order } from "@/types/models";

/**
 * Единое действие «Сформировать счёт» для экранов «Заказы», «Долги»
 * и «Финансы»: собирает заказ + клиента + реквизиты из настроек,
 * рендерит PDF и открывает его в новой вкладке (или скачивает,
 * если браузер заблокировал попап).
 */
export function useInvoiceAction() {
  const invoice = useSettingsStore((s) => s.invoice);
  const payments = useOrdersStore((s) => s.payments);
  const clients = useCrmStore((s) => s.clients);
  const { toast } = useToast();

  return useCallback(
    (order: Order) => {
      const client = clients.find((c) => c.id === order.clientId) ?? null;
      try {
        const result = openInvoicePdf({ order, client, payments, invoice });
        const num = invoiceNumber(order);
        toast({
          title: result === "opened" ? `Счёт ${num} открыт` : `Счёт ${num} скачивается`,
          description:
            result === "opened"
              ? "PDF в новой вкладке: реквизиты, таблица, «К оплате». Можно печатать и отправлять клиенту."
              : "Браузер заблокировал новую вкладку — счёт сохранён в загрузки.",
          duration: 4200,
        });
      } catch (err) {
        toast({
          title: "Не удалось собрать счёт",
          description: err instanceof Error ? err.message : "Проверьте реквизиты в «Настройках».",
          duration: 4200,
        });
      }
    },
    [clients, payments, invoice, toast]
  );
}
