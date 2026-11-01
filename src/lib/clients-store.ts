"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { demoCalls, demoClients } from "@/lib/demo-data";
import {
  PRICE_PER_PACK,
  type Call,
  type CallResult,
  type Client,
  type RouteStop,
} from "@/types/models";

/**
 * CRM-стор FryFlow: клиенты, журнал звонков и маршрут дня.
 *
 * Данные живут в localStorage (ключ fryflow-crm-v1) — массовое
 * добавление реальных клиентов будет позже. Пока при первом запуске
 * база засеивается 10 демо-клиентами Ростова-на-Дону.
 *
 * Гидратация: skipHydration + ручной rehydrate() в AppShell, чтобы
 * серверный рендер и гидратация клиента совпали (демо-данные),
 * а уже затем стор подхватил сохранённые правки пользователя.
 */

export type NewClientInput = Omit<Client, "id" | "createdAt">;

interface CrmState {
  clients: Client[];
  calls: Call[];
  routeStops: RouteStop[];
  /** Вместимость машины, коробок. */
  capacity: number;
  /** true после восстановления из localStorage (для скелетонов). */
  hydrated: boolean;

  addClient: (input: NewClientInput) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;

  /** Логирует звонок и синхронизирует статус воронки клиента. */
  addCall: (input: {
    clientId: string;
    result: CallResult;
    comment: string;
    callbackDate?: string;
  }) => Call;

  setRouteStops: (stops: RouteStop[]) => void;
  toggleRouteStop: (stop: RouteStop) => boolean;
  removeRouteStop: (clientId: string) => void;
  setStopBoxes: (clientId: string, boxes: number) => void;
  setCapacity: (capacity: number) => void;
  clearRoute: () => void;

  /** Отметка «доставлено»: обновляет историю заказов и Health Score. */
  markDelivered: (clientId: string, boxes: number) => void;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Результат звонка → статус воронки. */
const statusFromResult: Record<CallResult, Client["status"]> = {
  trial: "trial",
  callback: "callback",
  refused: "refused",
  no_answer: "no_answer",
};

function seedState() {
  const clients = demoClients();
  return { clients, calls: demoCalls(clients) };
}

export const useCrmStore = create<CrmState>()(
  persist(
    (set, get) => ({
      ...seedState(),
      routeStops: [],
      capacity: 50,
      hydrated: false,

      addClient: (input) => {
        const client: Client = {
          ...input,
          id: newId(),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ clients: [client, ...s.clients] }));
        return client;
      },

      updateClient: (id, patch) =>
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      deleteClient: (id) =>
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          calls: s.calls.filter((c) => c.clientId !== id),
          routeStops: s.routeStops.filter((r) => r.clientId !== id),
        })),

      addCall: ({ clientId, result, comment, callbackDate }) => {
        const call: Call = {
          id: newId(),
          clientId,
          result,
          comment,
          callbackDate: result === "callback" ? callbackDate : undefined,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          calls: [call, ...s.calls],
          // Статус воронки клиента синхронизируется с результатом звонка:
          // проба ставит «Проба», перезвонить — «Перезвонить» и т.д.
          clients: s.clients.map((c) =>
            c.id === clientId ? { ...c, status: statusFromResult[result] } : c
          ),
        }));
        return call;
      },

      setRouteStops: (routeStops) => set({ routeStops }),

      toggleRouteStop: (stop) => {
        const exists = get().routeStops.some((r) => r.clientId === stop.clientId);
        set((s) => ({
          routeStops: exists
            ? s.routeStops.filter((r) => r.clientId !== stop.clientId)
            : [...s.routeStops, stop],
        }));
        return !exists;
      },

      removeRouteStop: (clientId) =>
        set((s) => ({
          routeStops: s.routeStops.filter((r) => r.clientId !== clientId),
        })),

      setStopBoxes: (clientId, boxes) =>
        set((s) => ({
          routeStops: s.routeStops.map((r) =>
            r.clientId === clientId
              ? { ...r, boxes, orderSum: boxes * PRICE_PER_PACK }
              : r
          ),
        })),

      setCapacity: (capacity) => set({ capacity }),

      clearRoute: () => set({ routeStops: [] }),

      markDelivered: (clientId, boxes) =>
        set((s) => ({
          clients: s.clients.map((c) =>
            c.id === clientId
              ? {
                  ...c,
                  lastOrderAt: new Date().toISOString(),
                  lastOrderBoxes: boxes,
                  status: c.status === "trial" ? "trial" : "regular",
                }
              : c
          ),
        })),
    }),
    {
      name: "fryflow-crm-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        clients: s.clients,
        calls: s.calls,
        routeStops: s.routeStops,
        capacity: s.capacity,
      }),
      onRehydrateStorage: () => () => {
        useCrmStore.setState({ hydrated: true });
      },
    }
  )
);
