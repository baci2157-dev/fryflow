"use client";

import { getSupabase, TABLES } from "@/lib/supabase";
import { syncSupabaseAction } from "@/lib/offline-queue";
import { useCrmStore, type NewClientInput } from "@/lib/clients-store";
import {
  useOrdersStore,
  type NewOrderInput,
} from "@/lib/orders-store";
import { useRegionsStore } from "@/lib/regions-store";
import { useSettingsStore } from "@/lib/settings-store";
import type {
  Call,
  CallResult,
  Client,
  InventoryMovement,
  Order,
  Payment,
  RegionalStatus,
} from "@/types/models";

/**
 * Сервисный слой FryFlow (задача 8 — подготовка к Supabase).
 *
 * Каждая функция имеет две ветки:
 *
 *   if (supabase) { … }   — реальная база: локальный стор обновляется
 *                           сразу (оптимистично, работает офлайн), запись
 *                           уходит в Supabase; сети нет — операция встанет
 *                           в IndexedDB-очередь и догонит при подключении
 *                           (lib/offline-queue.ts);
 *   else { mock }         — демо-режим: стор localStorage и есть база,
 *                           всё работает офлайн из коробки.
 *
 * Режим определяется переменными окружения (.env.local → .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Функции синхронны по внешнему контракту (UI не ждёт сеть) — серверная
 * часть уходит в фоне и никогда не блокирует экран продавца.
 */

/* ── Мапперы модель → строка таблицы (schema.sql) ─────────── */

const iso = (d: string | undefined) => d ?? null;

function clientToRow(c: Client) {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    district: c.district,
    phone: c.phone,
    type: c.type,
    status: c.status,
    priority_tier: c.priorityTier,
    chain_name: c.chainName ?? null,
    chain_size: c.chainSize ?? null,
    lat: c.coordinates?.lat ?? null,
    lng: c.coordinates?.lng ?? null,
    notes: c.notes,
    created_at: c.createdAt,
    last_order_at: iso(c.lastOrderAt),
    order_frequency_days: c.orderFrequencyDays ?? null,
    last_order_boxes: c.lastOrderBoxes ?? null,
  };
}

function callToRow(c: Call) {
  return {
    id: c.id,
    client_id: c.clientId,
    result: c.result,
    comment: c.comment,
    callback_date: c.callbackDate ?? null,
    attempt_number: c.attemptNumber,
    created_at: c.createdAt,
  };
}

function orderToRow(o: Order) {
  return {
    id: o.id,
    client_id: o.clientId,
    client_name: o.clientName,
    boxes_count: o.boxesCount,
    price_per_box: o.pricePerBox,
    total_amount: o.totalAmount,
    delivery_date: o.deliveryDate,
    is_paid: o.isPaid,
    created_at: o.createdAt,
    delivered_at: iso(o.deliveredAt),
    comment: o.comment ?? null,
    is_draft: o.isDraft,
    source: o.source ?? "manual",
    external_id: o.externalId ?? null,
  };
}

function movementToRow(m: InventoryMovement) {
  return {
    id: m.id,
    type: m.type,
    quantity_kg: m.quantityKg,
    quantity_packs: m.quantityPacks,
    description: m.description,
    created_at: m.createdAt,
  };
}

function paymentToRow(p: Payment) {
  return {
    id: p.id,
    order_id: p.orderId,
    amount: p.amount,
    created_at: p.createdAt,
  };
}

function partnerToRow(p: {
  id: string;
  company: string;
  city: string;
  contactPerson: string;
  phone: string;
  volumeTons: number;
  status: RegionalStatus;
  notes: string;
  createdAt: string;
}) {
  return {
    id: p.id,
    company: p.company,
    city: p.city,
    contact_person: p.contactPerson,
    phone: p.phone,
    volume_tons: p.volumeTons,
    status: p.status,
    notes: p.notes,
    created_at: p.createdAt,
  };
}

/* ── Клиенты ─────────────────────────────────────────────── */

/** Создать клиента. */
export function createClient(input: NewClientInput): Client {
  const sb = getSupabase();
  if (sb) {
    const client = useCrmStore.getState().addClient(input);
    void syncSupabaseAction({
      kind: "client",
      label: `Клиент · ${client.name}`,
      table: TABLES.clients,
      op: "insert",
      row: clientToRow(client),
    });
    return client;
  }
  return useCrmStore.getState().addClient(input); // mock
}

/** Обновить клиента (в том числе заметку — saveClientNote). */
export function updateClient(id: string, patch: Partial<Client>): void {
  const sb = getSupabase();
  useCrmStore.getState().updateClient(id, patch);
  if (sb) {
    const client = useCrmStore
      .getState()
      .clients.find((c) => c.id === id);
    if (client) {
      void syncSupabaseAction({
        kind: "client",
        label: `Клиент · ${client.name}`,
        table: TABLES.clients,
        op: "update",
        row: clientToRow(client),
      });
    }
  }
}

/** Заметка по клиенту (частный случай обновления — но с человеческим ярлыком). */
export function saveClientNote(id: string, notes: string): void {
  const sb = getSupabase();
  useCrmStore.getState().updateClient(id, { notes });
  if (sb) {
    const client = useCrmStore.getState().clients.find((c) => c.id === id);
    if (client) {
      void syncSupabaseAction({
        kind: "note",
        label: `Заметка · ${client.name}`,
        table: TABLES.clients,
        op: "update",
        row: { id: client.id, notes: client.notes },
      });
    }
  }
}

/** Удалить клиента (каскадом уйдут звонки — FK в schema.sql). */
export function deleteClient(id: string): void {
  const sb = getSupabase();
  const name =
    useCrmStore.getState().clients.find((c) => c.id === id)?.name ?? id;
  useCrmStore.getState().deleteClient(id);
  if (sb) {
    void syncSupabaseAction({
      kind: "client",
      label: `Удаление · ${name}`,
      table: TABLES.clients,
      op: "delete",
      row: { id },
    });
  }
}

/* ── Звонки ──────────────────────────────────────────────── */

/** Записать звонок в журнал (и синхронизировать статус воронки). */
export function logCall(input: {
  clientId: string;
  result: CallResult;
  comment: string;
  callbackDate?: string;
}): { call: Call; addedToRoute: boolean } {
  const sb = getSupabase();
  const { call, addedToRoute } = useCrmStore.getState().addCall(input);
  if (sb) {
    const client = useCrmStore
      .getState()
      .clients.find((c) => c.id === input.clientId);
    void syncSupabaseAction({
      kind: "call",
      label: `Звонок · ${client?.name ?? input.clientId}`,
      table: TABLES.calls,
      op: "insert",
      row: callToRow(call),
    });
    if (client) {
      void syncSupabaseAction({
        kind: "client",
        label: `Статус · ${client.name}`,
        table: TABLES.clients,
        op: "update",
        row: { id: client.id, status: client.status },
      });
    }
  }
  return { call, addedToRoute };
}

/* ── Заказы ──────────────────────────────────────────────── */

/** Создать заказ (не-черновик сразу пишет движение склада). */
export function createOrder(input: NewOrderInput): Order {
  const sb = getSupabase();
  const order = useOrdersStore.getState().createOrder(input);
  if (sb) {
    void syncSupabaseAction({
      kind: "order",
      label: `Заказ · ${order.clientName}`,
      table: TABLES.orders,
      op: "insert",
      row: orderToRow(order),
    });
    if (!order.isDraft) {
      const mov = useOrdersStore
        .getState()
        .movements.find((m) => m.description.includes(order.id));
      if (mov) {
        void syncSupabaseAction({
          kind: "movement",
          label: `Склад · заказ ${order.clientName}`,
          table: TABLES.movements,
          op: "insert",
          row: movementToRow(mov),
        });
      }
    }
    if (order.isPaid) {
      const pay = useOrdersStore
        .getState()
        .payments.find((p) => p.orderId === order.id);
      if (pay) {
        void syncSupabaseAction({
          kind: "payment",
          label: `Оплата · ${order.clientName}`,
          table: TABLES.payments,
          op: "insert",
          row: paymentToRow(pay),
        });
      }
    }
  }
  return order;
}

/** Отметить заказ оплаченным (заказ + строка в журнале платежей). */
export function markOrderPaid(id: string): void {
  const sb = getSupabase();
  useOrdersStore.getState().markOrderPaid(id);
  if (sb) {
    const order = useOrdersStore.getState().orders.find((o) => o.id === id);
    if (order) {
      void syncSupabaseAction({
        kind: "payment",
        label: `Оплата · ${order.clientName}`,
        table: TABLES.orders,
        op: "update",
        row: { id: order.id, is_paid: true },
      });
      const payment = useOrdersStore
        .getState()
        .payments.find((p) => p.orderId === id);
      if (payment) {
        void syncSupabaseAction({
          kind: "payment",
          label: `Платёж · ${order.clientName}`,
          table: TABLES.payments,
          op: "insert",
          row: paymentToRow(payment),
        });
      }
    }
  }
}

/** Отметить доставленным. */
export function markOrderDelivered(id: string): void {
  const sb = getSupabase();
  useOrdersStore.getState().markOrderDelivered(id);
  if (sb) {
    void syncSupabaseAction({
      kind: "order",
      label: "Доставка отмечена",
      table: TABLES.orders,
      op: "update",
      row: { id, delivered_at: new Date().toISOString() },
    });
  }
}

/** Черновик Telegram-заявки → настоящий заказ (списывает склад). */
export function confirmDraft(id: string): Order | null {
  const sb = getSupabase();
  const order = useOrdersStore.getState().confirmDraft(id);
  if (order && sb) {
    void syncSupabaseAction({
      kind: "order",
      label: `Заявка подтверждена · ${order.clientName}`,
      table: TABLES.orders,
      op: "update",
      row: { id, is_draft: false, created_at: new Date().toISOString() },
    });
    const mov = useOrdersStore.getState().movements.find((m) =>
      m.description.includes(order.id)
    );
    if (mov) {
      void syncSupabaseAction({
        kind: "movement",
        label: `Склад · заявка ${order.clientName}`,
        table: TABLES.movements,
        op: "insert",
        row: movementToRow(mov),
      });
    }
  }
  return order;
}

/** Отклонить черновик. */
export function rejectDraft(id: string): void {
  const sb = getSupabase();
  useOrdersStore.getState().rejectDraft(id);
  if (sb) {
    void syncSupabaseAction({
      kind: "order",
      label: "Заявка отклонена",
      table: TABLES.orders,
      op: "delete",
      row: { id },
    });
  }
}

/* ── Склад ───────────────────────────────────────────────── */

/** Ручное движение: приход или списание. */
export function addMovement(
  type: "in" | "out",
  quantityPacks: number,
  description: string
): void {
  const sb = getSupabase();
  useOrdersStore.getState().addMovement(type, quantityPacks, description);
  if (sb) {
    const mov = useOrdersStore.getState().movements[0];
    if (mov) {
      void syncSupabaseAction({
        kind: "movement",
        label: mov.description,
        table: TABLES.movements,
        op: "insert",
        row: movementToRow(mov),
      });
    }
  }
}

/* ── Регионы ─────────────────────────────────────────────── */

/** Смена статуса регионального оптовика (Первый контакт → Тест → Фура). */
export function setRegionalStatus(id: string, status: RegionalStatus): void {
  const sb = getSupabase();
  useRegionsStore.getState().setStatus(id, status);
  if (sb) {
    void syncSupabaseAction({
      kind: "partner",
      label: "Статус регионального партнёра",
      table: TABLES.partners,
      op: "update",
      row: { id, status },
    });
  }
}

/** Заметка по региональному партнёру. */
export function setRegionalNotes(id: string, notes: string): void {
  const sb = getSupabase();
  useRegionsStore.getState().setNotes(id, notes);
  if (sb) {
    void syncSupabaseAction({
      kind: "partner",
      label: "Заметка по партнёру",
      table: TABLES.partners,
      op: "update",
      row: { id, notes },
    });
  }
}

/* ── Настройки ───────────────────────────────────────────── */

/** Сохранить настройки (реквизиты + ИИ-устав) — одна строка-синглтон. */
export function saveSettings(): void {
  const sb = getSupabase();
  if (!sb) return; // mock: localStorage уже сохранил (zustand persist)
  const s = useSettingsStore.getState();
  void syncSupabaseAction({
    kind: "settings",
    label: "Настройки",
    table: TABLES.settings,
    op: "update",
    row: {
      id: "singleton",
      invoice: s.invoice,
      ai: s.ai,
      updated_at: new Date().toISOString(),
    },
  });
}

/* ── Для резервной копии: выгрузка всех таблиц ───────────── */

/** Полная выгрузка из Supabase (кнопка «Скачать резервную копию»). */
export async function fetchAllFromSupabase() {
  const sb = getSupabase();
  if (!sb) return null;
  const select = async (table: string) =>
    (await sb.from(table).select("*")).data ?? [];
  const [clients, calls, orders, movements, payments, partners, settings, drafts] =
    await Promise.all([
      select(TABLES.clients),
      select(TABLES.calls),
      select(TABLES.orders),
      select(TABLES.movements),
      select(TABLES.payments),
      select(TABLES.partners),
      select(TABLES.settings),
      select(TABLES.drafts),
    ]);
  return { clients, calls, orders, movements, payments, partners, settings, drafts };
}
