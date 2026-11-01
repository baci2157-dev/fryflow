import { create } from "zustand";

/**
 * Глобальное UI-состояние FryFlow (командная палитра, совет ИИ).
 * Используется только из клиентских компонентов.
 */
interface UiState {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  /** счётчик обновлений совета ИИ — инкрементится из палитры/карточки */
  adviceTick: number;
  refreshAdvice: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  adviceTick: 0,
  refreshAdvice: () => set((s) => ({ adviceTick: s.adviceTick + 1 })),
}));
