"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { trialStopFor } from "@/lib/route-algorithm";
import {
  PRICE_PER_PACK,
  type Call,
  type CallResult,
  type Client,
  type RouteCrossSell,
  type RouteStop,
} from "@/types/models";

/**
 * CRM-стор FryFlow: клиенты, журнал звонков и маршрут дня.
 *
 * Данные живут в localStorage (ключ fryflow-crm-v1). При первом
 * запуске база НЕ сеится демо-карточками: AppShell после rehydrate
 * вызывает ensureBaseSeeded() (lib/seed-base.ts), которая асинхронно
 * грузит базу владельца — 421 точек Ростова-на-Дону из
 * public/seed/clients.json через тот же конвейер, что и ручный
 * импорт (валидация → дедуп → геокодинг).
 *
 * Гидратация: skipHydration + ручной rehydrate() в AppShell, чтобы
 * серверный рендер и гидратация клиента совпали (пустой старт),
 * а уже затем стор подхватил сохранённые данные пользователя.
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
  /** Идёт авто-загрузка базы из сида (скелетон на «Клиентах»). */
  seeding: boolean;

  addClient: (input: NewClientInput) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;

  /** Логирует звонок и синхронизирует статус воронки клиента.
   *  «Согласился на пробу» автоматически добавляет точку в маршрут дня
   *  (флаг, который подхватывает экран /route). Возвращает запись и признак
   *  добавления в маршрут. */
  addCall: (input: {
    clientId: string;
    result: CallResult;
    comment: string;
    callbackDate?: string;
  }) => { call: Call; addedToRoute: boolean };

  setRouteStops: (stops: RouteStop[]) => void;
  toggleRouteStop: (stop: RouteStop) => boolean;
  removeRouteStop: (clientId: string) => void;
  /** Попутные товары к точке маршрута (задача 9): «заодно захватить масло». */
  addRouteCrossSell: (clientId: string, item: RouteCrossSell) => void;
  removeRouteCrossSell: (clientId: string, productId: string) => void;
  setStopBoxes: (clientId: string, boxes: number) => void;
  setCapacity: (capacity: number) => void;
  clearRoute: () => void;

  /** Отметка «доставлено»: обновляет историю заказов и Health Score. */
  markDelivered: (clientId: string, boxes: number) => void;

  /** Сброс базы (Настройки): клиенты/звонки/маршрут — пустые.
   * Базу владельца вернёт авто-сид (ensureBaseSeeded) или кнопка
   * «Восстановить базу (421 точек)». */
  resetDemo: () => void;
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

/* Первый запуск — пустой: реальную базу (421 точек) подложит
 * авто-сид из lib/seed-base.ts. Демо-карточки больше не сеятся. */
function seedState() {
  return { clients: [], calls: [] };
}

export const useCrmStore = create<CrmState>()(
  persist(
    (set, get) => ({
      ...seedState(),
      routeStops: [],
      capacity: 50,
      hydrated: false,
      seeding: false,

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
        // Счётчик попыток: сколько звонков этому клиенту уже было + 1.
        const attemptNumber =
          get().calls.filter((c) => c.clientId === clientId).length + 1;
        const call: Call = {
          id: newId(),
          clientId,
          result,
          comment,
          attemptNumber,
          callbackDate: result === "callback" ? callbackDate : undefined,
          createdAt: new Date().toISOString(),
        };
        let addedToRoute = false;
        set((s) => {
          // «Согласился на пробу» → упаковка 2,5 кг за 350 ₽ в маршрут
          // на завтра (если клиент ещё не в маршруте).
          const client = s.clients.find((c) => c.id === clientId);
          const alreadyInRoute = s.routeStops.some(
            (r) => r.clientId === clientId
          );
          const addTrialStop =
            result === "trial" &&
            Boolean(client) &&
            !alreadyInRoute;
          addedToRoute = addTrialStop;
          return {
            calls: [call, ...s.calls],
            // Статус воронки клиента синхронизируется с результатом звонка:
            // проба ставит «Проба», перезвонить — «Перезвонить» и т.д.
            clients: s.clients.map((c) =>
              c.id === clientId ? { ...c, status: statusFromResult[result] } : c
            ),
            routeStops: addTrialStop && client
              ? [...s.routeStops, trialStopFor(client)]
              : s.routeStops,
          };
        });
        return { call, addedToRoute };
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

      addRouteCrossSell: (clientId, item) =>
        set((s) => ({
          routeStops: s.routeStops.map((r) => {
            if (r.clientId !== clientId) return r;
            const exists = r.crossSell?.find((c) => c.productId === item.productId);
            return {
              ...r,
              crossSell: exists
                ? (r.crossSell ?? []).map((c) =>
                    c.productId === item.productId
                      ? { ...c, qty: c.qty + item.qty }
                      : c
                  )
                : [...(r.crossSell ?? []), item],
            };
          }),
        })),

      removeRouteCrossSell: (clientId, productId) =>
        set((s) => ({
          routeStops: s.routeStops.map((r) =>
            r.clientId === clientId
              ? {
                  ...r,
                  crossSell: (r.crossSell ?? []).filter(
                    (c) => c.productId !== productId
                  ),
                }
              : r
          ),
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

      resetDemo: () =>
        set((s) => ({
          clients: [],
          calls: [],
          routeStops: [],
          capacity: s.capacity,
          hydrated: true,
        })),
    }),
    {
      name: "fryflow-crm-v1",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        clients: s.clients,
        calls: s.calls,
        routeStops: s.routeStops,
        capacity: s.capacity,
      }),
      // v1 → v2: звонкам проставляем attemptNumber (порядок попыток
      // внутри клиента по дате — старые записи жили без счётчика).
      migrate: (persisted, version) => {
        const state = persisted as
          | { calls?: Call[]; clients?: Client[]; routeStops?: RouteStop[]; capacity?: number }
          | null;
        if (version < 2 && state && Array.isArray(state.calls)) {
          const counters = new Map<string, number>();
          const calls = [...state.calls]
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
            .map((c, i) => {
              const n = (counters.get(c.clientId) ?? 0) + 1;
              counters.set(c.clientId, n);
              return { ...c, attemptNumber: n, id: c.id ?? `migrated-${i}` };
            }) as Call[];
          return { ...state, calls } as unknown as CrmState;
        }
        return (state ?? {}) as unknown as CrmState;
      },
      onRehydrateStorage: () => () => {
        useCrmStore.setState({ hydrated: true });
      },
    }
  )
);
