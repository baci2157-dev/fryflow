"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * История чата с Мозгом. Живёт в localStorage
 * (fryflow-ai-chat-v1): владелец закрывает вкладку, открывает завтра —
 * разговор на месте. Приветствие не хранится: оно пересобирается
 * из живых цифр при каждом запуске и всегда актуально.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Откуда ответ: живая модель или офлайн-мозг (для плашки под пузырём). */
  source?: "zai" | "offline";
  /** ISO-время отправки. */
  createdAt: string;
}

interface AiChatState {
  messages: ChatMessage[];
  hydrated: boolean;
  addMessage: (
    role: ChatMessage["role"],
    content: string,
    source?: ChatMessage["source"]
  ) => ChatMessage;
  clear: () => void;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useAiChatStore = create<AiChatState>()(
  persist(
    (set) => ({
      messages: [],
      hydrated: false,

      addMessage: (role, content, source) => {
        const message: ChatMessage = {
          id: newId(),
          role,
          content,
          source,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, message] }));
        return message;
      },

      clear: () => set({ messages: [] }),
    }),
    {
      name: "fryflow-ai-chat-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ messages: s.messages }),
      onRehydrateStorage: () => () => {
        useAiChatStore.setState({ hydrated: true });
      },
    }
  )
);
