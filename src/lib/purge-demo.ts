"use client";

import { useCrmStore } from "@/lib/clients-store";
import { useOrdersStore } from "@/lib/orders-store";

/**
 * Точная очистка демо-данных (задача «база владельца»).
 *
 * Демо-записи имеют стабильные id (см. demo-data.ts / demo-orders.ts):
 * клиенты — cl-*, звонки — call-1…call-9, заказы — ord-1042…ord-1047,
 * оплаты — pay-1046/pay-1047, движения склада — mov-1001 и mov-1042…1047.
 * Реальные записи получают crypto.randomUUID() / «mov-<время>-…» и под
 * эти префиксы не попадают — удаление безопасно для реальной базы.
 *
 * Чистит: клиентов, звонки, точки маршрута, заказы, оплаты и движения
 * склада, связанные с демо. Не трогает: каталог, регионы, настройки,
 * Telegram, чат ИИ.
 */
export interface PurgeDemoResult {
  /** Сколько демо-клиентов удалено. */
  clients: number;
  /** Демо-заказов удалено. */
  orders: number;
  /** Демо-звонков удалено. */
  calls: number;
}

export function purgeDemoData(): PurgeDemoResult {
  const crm = useCrmStore.getState();
  const demoIds = new Set(
    crm.clients.filter((c) => c.id.startsWith("cl-")).map((c) => c.id)
  );
  if (demoIds.size === 0) return { clients: 0, orders: 0, calls: 0 };

  const ordersStore = useOrdersStore.getState();
  const keptOrders = ordersStore.orders.filter((o) => !demoIds.has(o.clientId));
  const keptOrderIds = new Set(keptOrders.map((o) => o.id));

  // Демо-движения склада: стартовый запас mov-1001 и списания по
  // демо-заказам mov-1042…mov-1047 (реальные — mov-<base36-время>-…).
  const demoMovementRe = /^mov-(1001|104[2-7])$/;

  const removedCalls = crm.calls.filter((c) => demoIds.has(c.clientId)).length;

  useCrmStore.setState({
    clients: crm.clients.filter((c) => !demoIds.has(c.id)),
    calls: crm.calls.filter((c) => !demoIds.has(c.clientId)),
    routeStops: crm.routeStops.filter((r) => !demoIds.has(r.clientId)),
  });

  useOrdersStore.setState({
    orders: keptOrders,
    payments: ordersStore.payments.filter((p) => keptOrderIds.has(p.orderId)),
    movements: ordersStore.movements.filter((m) => !demoMovementRe.test(m.id)),
  });

  return {
    clients: demoIds.size,
    orders: ordersStore.orders.length - keptOrders.length,
    calls: removedCalls,
  };
}
