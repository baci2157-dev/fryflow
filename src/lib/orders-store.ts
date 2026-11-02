"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { demoMovements, demoOrders, demoPayments } from "@/lib/demo-orders";
import { useProductsStore } from "@/lib/products-store";
import {
  PACK_KG,
  crossSellSum,
  daysSince,
  type InventoryMovement,
  type Order,
  type OrderItem,
  type Payment,
} from "@/types/models";

/**
 * Стор сделок FryFlow: заказы, движение склада, оплаты.
 *
 * Склад — вычисляемая величина: остаток = сумма движений (приход −
 * списания − заказы). Создание заказа автоматически пишет движение
 * type='order' — владелец ничего не считает руками.
 *
 * Живёт в localStorage (fryflow-orders-v1), гидратация — как в CRM:
 * skipHydration + rehydrate() в AppShell.
 */

export interface NewOrderInput {
  clientId: string;
  clientName: string;
  boxesCount: number;
  pricePerBox: number;
  deliveryDate: string;
  isPaid: boolean;
  comment?: string;
  isDraft?: boolean;
  /** Заявка из Telegram-бота — для бейджа в карточке черновика. */
  source?: "manual" | "telegram";
  /** id заявки на сервере — дедуп при синхронизации. */
  externalId?: string;
  /** Попутные товары (задача 9): масло, соус — к основному заказу. */
  items?: OrderItem[];
}

interface OrdersState {
  orders: Order[];
  movements: InventoryMovement[];
  payments: Payment[];
  /** Следующий человекочитаемый номер заказа (#1048, #1049…). */
  nextOrderNumber: number;
  hydrated: boolean;

  /** Создаёт заказ; не-черновик сразу списывает склад. */
  createOrder: (input: NewOrderInput) => Order;
  /** Полная оплата: isPaid=true + запись в журнале платежей. */
  markOrderPaid: (id: string) => void;
  /** Отметить доставленным (движение склада уже есть). */
  markOrderDelivered: (id: string) => void;
  /** Черновик → настоящий заказ (списывает склад). */
  confirmDraft: (id: string) => Order | null;
  /** Черновик → удалить. */
  rejectDraft: (id: string) => void;

  /** Ручное движение: приход ('in') или списание ('out'). */
  addMovement: (
    type: "in" | "out",
    quantityPacks: number,
    description: string
  ) => void;

  /** Сброс демо-данных (настройки → позже). */
  resetDemo: () => void;
}

const newMovementId = () =>
  `mov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function seed() {
  const orders = demoOrders();
  return {
    orders,
    movements: demoMovements(orders),
    payments: demoPayments(),
    nextOrderNumber: 1048,
  };
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      ...seed(),
      hydrated: false,

      createOrder: (input) => {
        const num = get().nextOrderNumber;
        const items = input.items && input.items.length > 0 ? input.items : undefined;
        const order: Order = {
          id: `ord-${num}`,
          clientId: input.clientId,
          clientName: input.clientName,
          boxesCount: input.boxesCount,
          pricePerBox: input.pricePerBox,
          // Итог = картофель + попутные товары (масло, соус…).
          totalAmount: input.boxesCount * input.pricePerBox + crossSellSum(items),
          deliveryDate: input.deliveryDate,
          isPaid: input.isPaid,
          createdAt: new Date().toISOString(),
          comment: input.comment?.trim() || undefined,
          isDraft: input.isDraft ?? false,
          source: input.source,
          externalId: input.externalId,
          items,
        };

        set((s) => {
          const patch: Partial<OrdersState> = {
            orders: [order, ...s.orders],
            nextOrderNumber: num + 1,
          };
          // Черновик склад не списывает — только подтверждённый заказ.
          if (!order.isDraft) {
            patch.movements = [
              {
                id: newMovementId(),
                type: "order",
                quantityKg: order.boxesCount * PACK_KG,
                quantityPacks: order.boxesCount,
                description: `Заказ #${num} · ${order.clientName}`,
                createdAt: order.createdAt,
              },
              ...s.movements,
            ];
          }
          if (order.isPaid) {
            patch.payments = [
              {
                id: `pay-${num}`,
                orderId: order.id,
                amount: order.totalAmount,
                createdAt: order.createdAt,
              },
              ...s.payments,
            ];
          }
          // Попутные товары списываются со склада каталога сразу
          // (черновик — только при подтверждении, см. confirmDraft).
          if (!order.isDraft && items) {
            useProductsStore
              .getState()
              .decrementStock(items.map((i) => ({ productId: i.productId, qty: i.qty })));
          }
          return patch;
        });
        return order;
      },

      markOrderPaid: (id) =>
        set((s) => {
          const order = s.orders.find((o) => o.id === id);
          if (!order || order.isPaid) return s;
          return {
            orders: s.orders.map((o) => (o.id === id ? { ...o, isPaid: true } : o)),
            payments: [
              {
                id: `pay-${id.replace("ord-", "")}-${Date.now().toString(36)}`,
                orderId: id,
                amount: order.totalAmount,
                createdAt: new Date().toISOString(),
              },
              ...s.payments,
            ],
          };
        }),

      markOrderDelivered: (id) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id && !o.deliveredAt
              ? { ...o, deliveredAt: new Date().toISOString() }
              : o
          ),
        })),

      confirmDraft: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order || !order.isDraft) return null;
        const num = Number(order.id.replace(/\D/g, "")) || get().nextOrderNumber;
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, isDraft: false, createdAt: new Date().toISOString() } : o
          ),
          movements: [
            {
              id: newMovementId(),
              type: "order",
              quantityKg: order.boxesCount * PACK_KG,
              quantityPacks: order.boxesCount,
              description: `Заказ #${num} · ${order.clientName}`,
              createdAt: new Date().toISOString(),
            },
            ...s.movements,
          ],
        }));
        // Попутные товары черновика списываются в момент подтверждения.
        if (order.items && order.items.length > 0) {
          useProductsStore
            .getState()
            .decrementStock(
              order.items.map((i) => ({ productId: i.productId, qty: i.qty }))
            );
        }
        return { ...order, isDraft: false };
      },

      rejectDraft: (id) =>
        set((s) => ({
          orders: s.orders.filter((o) => o.id !== id),
        })),

      addMovement: (type, quantityPacks, description) =>
        set((s) => ({
          movements: [
            {
              id: newMovementId(),
              type,
              quantityKg: quantityPacks * PACK_KG,
              quantityPacks,
              description: description.trim() || (type === "in" ? "Приход" : "Списание"),
              createdAt: new Date().toISOString(),
            },
            ...s.movements,
          ],
        })),

      resetDemo: () => set({ ...seed() }),
    }),
    {
      name: "fryflow-orders-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        orders: s.orders,
        movements: s.movements,
        payments: s.payments,
        nextOrderNumber: s.nextOrderNumber,
      }),
      onRehydrateStorage: () => () => {
        useOrdersStore.setState({ hydrated: true });
      },
    }
  )
);

/* ── Селекторы (чистые функции поверх стора) ───────────────── */

/** Остаток склада в упаковках. */
export function stockPacks(movements: InventoryMovement[]): number {
  return movements.reduce(
    (sum, m) => sum + (m.type === "in" ? m.quantityPacks : -m.quantityPacks),
    0
  );
}

/** Остаток склада в килограммах. */
export function stockKg(movements: InventoryMovement[]): number {
  return Math.round(stockPacks(movements) * PACK_KG * 10) / 10;
}

/** Человекочитаемый номер заказа: ord-1047 → 1047. */
export function orderNumber(order: Order): number {
  const n = Number(order.id.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Долги: не-черновики без оплаты. */
export function debtOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => !o.isDraft && !o.isPaid)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // старые сверху
}

/** Возраст долга в днях (с даты создания заказа). */
export function debtDays(order: Order): number {
  return daysSince(order.createdAt);
}

/** Сумма по списку заказов, ₽. */
export function ordersTotal(orders: Order[]): number {
  return orders.reduce((sum, o) => sum + o.totalAmount, 0);
}

/** Попутные продажи за последние 30 дней: сумма и число заказов. */
export function crossSellStats(
  orders: Order[],
  windowDays = 30
): { sum: number; ordersWithItems: number } {
  const since = Date.now() - windowDays * 86_400_000;
  let sum = 0;
  let ordersWithItems = 0;
  for (const o of orders) {
    if (o.isDraft || !o.items || o.items.length === 0) continue;
    if (new Date(o.createdAt).getTime() < since) continue;
    sum += crossSellSum(o.items);
    ordersWithItems++;
  }
  return { sum, ordersWithItems };
}
