"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ClientType } from "@/types/models";

/**
 * «Найдено ИИ» (задача 11) — база кандидатов из веб-разведки.
 *
 * Кандидатов находит серверный роут /api/ai-discovery: веб-поиск
 * по Ростову-на-Дону + извлечение точек моделью. Здесь они ждут
 * решения владельца: «Добавить в CRM» (создаётся холодный клиент)
 * или «Отклонить». Дубликаты (name+address) не попадают в стор
 * дважды — даже отклонённые, чтобы один и тот же кандидат не
 * возвращался после каждого поиска.
 *
 * Живёт в localStorage (fryflow-discovery-v1), гидратация — как у
 * остальных сторов: skipHydration + rehydrate() в AppShell.
 */

/** Кандидат, найденный ИИ через веб-поиск. */
export interface DiscoveredLead {
  id: string;
  name: string;
  address: string;
  /** Район Ростова-на-Дону («Советский»); пустая строка — не определился. */
  district: string;
  /** Пустая строка — источник не дал телефон (найдём при звонке через 2ГИС). */
  phone: string;
  type: ClientType;
  /** URL источника, из которого ИИ взял точку. */
  source: string;
  status: "pending" | "approved" | "rejected";
  /** ISO-дата находки. */
  createdAt: string;
  /** id созданного клиента в CRM (только для approved). */
  clientId?: string;
}

export type DiscoveredLeadStatus = DiscoveredLead["status"];

export const DISCOVERY_STATUS_LABEL: Record<DiscoveredLeadStatus, string> = {
  pending: "Кандидат",
  approved: "Добавлен",
  rejected: "Отклонён",
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Ключ дедупликации: имя + адрес, без регистра и лишних пробелов. */
export function leadKey(name: string, address: string): string {
  return `${name}||${address}`.toLowerCase().replace(/\s+/g, " ").trim();
}

interface DiscoveryState {
  leads: DiscoveredLead[];
  /** Последний запуск веб-поиска (ISO) — чтобы не спамить «Найти новые точки». */
  lastSearchAt: string | null;
  hydrated: boolean;

  /** Добавляет кандидатов со статусом pending, пропуская дубли. Возвращает число новых. */
  addLeads: (
    leads: Array<Omit<DiscoveredLead, "id" | "status" | "createdAt">>
  ) => number;
  /** Кандидат стал клиентом CRM. */
  approve: (id: string, clientId: string) => void;
  /** Кандидат не интересен. */
  reject: (id: string) => void;
  /** Чистит архив (approved/rejected), кандидаты остаются. */
  clearHistory: () => void;
  setLastSearchAt: (iso: string) => void;
}

export const useDiscoveryStore = create<DiscoveryState>()(
  persist(
    (set, get) => ({
      leads: [],
      lastSearchAt: null,
      hydrated: false,

      addLeads: (incoming) => {
        const seen = new Set(get().leads.map((l) => leadKey(l.name, l.address)));
        const fresh = incoming
          .filter((l) => {
            const key = leadKey(l.name, l.address);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((l) => ({
            ...l,
            id: newId(),
            status: "pending" as const,
            createdAt: new Date().toISOString(),
          }));
        if (fresh.length > 0) {
          set((s) => ({ leads: [...fresh, ...s.leads] }));
        }
        return fresh.length;
      },

      approve: (id, clientId) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id ? { ...l, status: "approved", clientId } : l
          ),
        })),

      reject: (id) =>
        set((s) => ({
          leads: s.leads.map((l) => (l.id === id ? { ...l, status: "rejected" } : l)),
        })),

      clearHistory: () =>
        set((s) => ({ leads: s.leads.filter((l) => l.status === "pending") })),

      setLastSearchAt: (lastSearchAt) => set({ lastSearchAt }),
    }),
    {
      name: "fryflow-discovery-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ leads: s.leads, lastSearchAt: s.lastSearchAt }),
      onRehydrateStorage: () => () => {
        useDiscoveryStore.setState({ hydrated: true });
      },
    }
  )
);
