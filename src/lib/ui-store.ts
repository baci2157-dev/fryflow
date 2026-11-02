import { create } from "zustand";

/**
 * Глобальное UI-состояние FryFlow (командная палитра, совет ИИ).
 * Используется только из клиентских компонентов.
 */
/** Фильтр-чипы экрана «Звонки». */
export type CallsFilter =
  | "all"
  | "cold"
  | "no_answer"
  | "callback"
  | "trial"
  | "refused";

export interface UiState {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  /** счётчик обновлений совета ИИ — инкрементится из палитры/карточки */
  adviceTick: number;
  refreshAdvice: () => void;
  /**
   * CRM: запрос на открытие карточки клиента (из палитры и других
   * разделов). ClientsPage открывает Sheet и сбрасывает.
   */
  crmFocusClientId: string | null;
  focusClient: (id: string) => void;
  clearClientFocus: () => void;
  /** CRM: запрос на открытие формы клиента (new | edit). */
  clientFormIntent: ClientFormIntent | null;
  requestClientForm: (intent: ClientFormIntent) => void;
  clearClientFormIntent: () => void;
  /**
   * Звонки: переход на карточку клиента в /calls с предвыбранным
   * фильтром (например, из «Плана на сегодня» на дашборде).
   * CallsPage подставляет фильтр, подсвечивает карточку и сбрасывает.
   */
  callsIntent: { clientId: string; filter?: CallsFilter } | null;
  focusCallClient: (clientId: string, filter?: CallsFilter) => void;
  clearCallsIntent: () => void;
}

export type ClientFormIntent =
  | { mode: "new" }
  | { mode: "edit"; clientId: string };

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  adviceTick: 0,
  refreshAdvice: () => set((s) => ({ adviceTick: s.adviceTick + 1 })),
  crmFocusClientId: null,
  focusClient: (crmFocusClientId) => set({ crmFocusClientId }),
  clearClientFocus: () => set({ crmFocusClientId: null }),
  clientFormIntent: null,
  requestClientForm: (clientFormIntent) => set({ clientFormIntent }),
  clearClientFormIntent: () => set({ clientFormIntent: null }),
  callsIntent: null,
  focusCallClient: (clientId, filter) => set({ callsIntent: { clientId, filter } }),
  clearCallsIntent: () => set({ callsIntent: null }),
}));
