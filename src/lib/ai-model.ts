/**
 * Единая точка выбора модели ИИ (задача 11).
 *
 * По умолчанию — glm-5.2-fast-preview: быстрая версия флагмана
 * с контекстом 1M токенов и нативным веб-поиском. Если модель
 * недоступна — каскад фолбэков вниз (glm-5.3 → glm-4.5), чтобы
 * ИИ-Директор и «Разведчик» не замолкали.
 *
 * Переопределить извне: FRYFLOW_AI_MODEL=glm-5.3 (см. .env.example).
 */

/** Порядок попыток: env → быстрый флагман → флагман → проверенный GLM-4.5. */
export const AI_MODEL_CHAIN: string[] = [
  ...new Set(
    [
      process.env.FRYFLOW_AI_MODEL,
      "glm-5.2-fast-preview",
      "glm-5.3",
      "glm-4.5",
    ].filter((m): m is string => Boolean(m))
  ),
];

/** Модель по умолчанию — первая из каскада. */
export const AI_MODEL = AI_MODEL_CHAIN[0];

export interface AiChatMessage {
  role: "assistant" | "user";
  content: string;
}

/**
 * Минимальная структурная форма ZAI-клиента, нужная для чата.
 * Реальный инстанс SDK назначаемо совместим с ней.
 */
export interface ChatCompletionsClient {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: AiChatMessage[];
        thinking?: { type: "disabled" };
      }) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

/**
 * Чат с каскадом моделей: пробуем по очереди, пока одна не ответит.
 * Возвращает текст ответа и модель, которая справилась.
 */
export async function chatWithFallback(
  zai: ChatCompletionsClient,
  messages: AiChatMessage[]
): Promise<{ reply: string | null; model: string; lastError?: unknown }> {
  let lastError: unknown = null;
  for (const model of AI_MODEL_CHAIN) {
    try {
      const completion = await zai.chat.completions.create({
        model,
        messages,
        thinking: { type: "disabled" },
      });
      const reply = completion.choices?.[0]?.message?.content?.trim();
      if (reply) return { reply, model };
      lastError = new Error(`Пустой ответ от ${model}`);
    } catch (err) {
      lastError = err;
    }
  }
  return { reply: null, model: AI_MODEL, lastError };
}
