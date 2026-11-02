"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Настройки FryFlow: реквизиты для PDF-счетов, устав ИИ-Директора
 * и интервалы проактивных советов (заглушка до следующей задачи).
 *
 * Живут в localStorage (fryflow-settings-v1). Реквизиты предзаполнены
 * демо-значениями — владелец меняет на свои один раз в «Настройках»,
 * и каждый счёт становится «серьёзным поставщиком», а не скрином из
 * WhatsApp.
 */

/* ── Реквизиты для счетов ─────────────────────────────────── */

export interface InvoiceRequisites {
  /** Форма: ИП или ООО. */
  legalForm: "ИП" | "ООО";
  /** Полное наименование: «ИП Смирнов Алексей Викторович». */
  companyName: string;
  /** Юридический адрес. */
  address: string;
  inn: string;
  /** Расчётный счёт (20 цифр). */
  account: string;
  bank: string;
  /** БИК банка (9 цифр). */
  bik: string;
  /** Корр. счёт — выводим под банковской строкой. */
  corrAccount: string;
  phone: string;
  /** Ставка НДС: «Без НДС» по умолчанию (упрощёнка). */
  vatRate: "Без НДС" | "20%" | "5%" | "7%";
  /** Кто подписывает счёт: ФИО + должность. */
  signatoryName: string;
  signatoryTitle: string;
}

export const DEFAULT_REQUISITES: InvoiceRequisites = {
  legalForm: "ИП",
  companyName: "Смирнов Алексей Викторович",
  address: "344011, г. Ростов-на-Дону, ул. Садовая, 75, оф. 12",
  inn: "615312345678",
  account: "40802810400000123456",
  bank: "Филиал «Ростовский» АО «Тинькофф Банк»",
  bik: "046030707",
  corrAccount: "30101810100000000707",
  phone: "+7 (918) 500-40-30",
  vatRate: "Без НДС",
  signatoryName: "Смирнов А.В.",
  signatoryTitle: "Индивидуальный предприниматель",
};

/* ── ИИ-Директор ──────────────────────────────────────────── */

export interface AiSettings {
  /** Проактивные советы (интервалы) — заглушка до следующей задачи. */
  proactive: boolean;
  intervalHours: 2 | 3 | 4;
  /** Устав ИИ — добавляется в системный промпт каждого запроса. */
  charter: string;
}

export const CHARTER_MAX = 600;

export const CHARTER_EXAMPLES = [
  "Не предлагать скидку ниже 280 ₽/уп — рубильник маржи.",
  "Долги старше 10 дней — напоминать каждый день, не стесняться.",
  "Говорить коротко и по делу, без воды: цифры → вывод → действие.",
  "Новые клиенты — только предоплата или налик, отсрочка запрещена.",
  "Приоритет дня: шаурмичные (green), потом сети, потом остальные.",
];

export const DEFAULT_CHARTER =
  "Ты — старший партнёр по бизнесу, а не консультант. " +
  "Отвечай коротко и по делу: цифры → вывод → конкретное действие. " +
  "Не предлагай скидку ниже 280 ₽/уп. Новым клиентам — только предоплата. " +
  "Долги старше 10 дней — напоминать ежедневно. " +
  "Всегда опирайся на реальные цифры из контекста, ничего не выдумывай.";

export const DEFAULT_AI: AiSettings = {
  proactive: true,
  intervalHours: 3,
  charter: DEFAULT_CHARTER,
};

/* ── Стор ─────────────────────────────────────────────────── */

interface SettingsState {
  invoice: InvoiceRequisites;
  ai: AiSettings;
  hydrated: boolean;

  setInvoice: (patch: Partial<InvoiceRequisites>) => void;
  setAi: (patch: Partial<AiSettings>) => void;
  resetRequisites: () => void;
  resetCharter: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      invoice: DEFAULT_REQUISITES,
      ai: DEFAULT_AI,
      hydrated: false,

      setInvoice: (patch) =>
        set((s) => ({ invoice: { ...s.invoice, ...patch } })),

      setAi: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),

      resetRequisites: () => set({ invoice: DEFAULT_REQUISITES }),
      resetCharter: () => set((s) => ({ ai: { ...s.ai, charter: DEFAULT_CHARTER } })),
    }),
    {
      name: "fryflow-settings-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ invoice: s.invoice, ai: s.ai }),
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hydrated: true });
      },
    }
  )
);
