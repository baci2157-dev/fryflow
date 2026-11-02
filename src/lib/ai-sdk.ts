/**
 * Двухрежимный слой ИИ FryFlow (задача 12–13: Go-Live).
 *
 * ПУБЛИЧНЫЙ РЕЖИМ (задана ZAI_API_KEY) — продакшен:
 *   POST https://api.z.ai/api/paas/v4/chat/completions
 *   • модель по умолчанию glm-4.7-flash — бесплатная;
 *   • thinking отключён: отвечает сразу, без «размышлений»;
 *   • ретраи с нарастающей паузой: бесплатная модель бывает
 *     перегружена (ошибка 1305 «temporarily overloaded»).
 *
 * РЕЖИМ ПЕСОЧНИЦЫ (ключа нет) — локальная разработка:
 *   • z-ai-web-dev-sdk с каскадом моделей (lib/ai-model.ts);
 *   • SDK подгружается лениво: в проде с ключом он не попадает
 *     в рантайм вообще — деплой не зависит от внутреннего API.
 *
 * ВЕБ-ПОИСК ВРЕМЕННО ОТКЛЮЧЁН (задача 13, Go-Live): публичный API
 * не исполняет инструмент web_search (модель отвечает «нет доступа
 * к интернету»), а оплата поиска не подтверждена. ИИ-Директор работает
 * на внутреннем контексте базы — этого достаточно для старта.
 * Вернём поиск в задаче 14, когда разберёмся с тарифами и форматом.
 */

import { chatWithFallback } from "@/lib/ai-model";

/* ── Публичный API ─────────────────────────────────────────── */

const PUBLIC_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";

/** Модель публичного режима по умолчанию — бесплатная. */
const PUBLIC_DEFAULT_MODEL = "glm-4.7-flash";

/** Есть ли ключ публичного API → работает ли прод-режим. */
export function hasPublicApiKey(): boolean {
  return Boolean(process.env.ZAI_API_KEY?.trim());
}

/** Модель публичного режима: FRYFLOW_AI_MODEL переопределяет glm-4.7-flash. */
export function publicModel(): string {
  return process.env.FRYFLOW_AI_MODEL?.trim() || PUBLIC_DEFAULT_MODEL;
}

export type AiSdkRole = "system" | "user" | "assistant";

export interface AiSdkMessage {
  role: AiSdkRole;
  content: string;
}

export interface AiSdkResult {
  /** Ответ модели или null (тогда см. error / используйте офлайн-фолбэк). */
  reply: string | null;
  /** Каким режимом отвечено: публичный API или SDK песочницы. */
  mode: "public" | "sdk";
  /** Модель, которая реально ответила. */
  model: string;
  /** Причина сбоя, если ответа нет. */
  error?: string;
}

export interface AiSdkOptions {
  messages: AiSdkMessage[];
  maxTokens?: number;
  temperature?: number;
}

/** Ошибка публичного API в формате {"error":{"code","message"}}. */
interface PublicApiError {
  error?: { code?: string | number; message?: string };
}

/** Паузы между ретраями перегруженной бесплатной модели. Пяти попыток
 *  (до ~47 сек) обычно хватает, чтобы вечерний пик 1305 разгрузился —
 *  иначе офлайн-мозг ответит на тех же цифрах, чат не «умирает». */
const RETRY_DELAYS_MS = [2000, 6000, 14000, 25000];

/** Повторяемая ошибка? (1305 — перегрузка, 429 — лимит, 5xx — сервер) */
function isRetryable(httpStatus: number, errCode: string | undefined): boolean {
  if (httpStatus === 429 || httpStatus >= 500) return true;
  return errCode === "1305" || errCode === "429" || errCode === "1301";
}

async function publicChat(opts: AiSdkOptions): Promise<AiSdkResult> {
  const model = publicModel();

  const body = {
    model,
    messages: opts.messages,
    thinking: { type: "disabled" },
    max_tokens: opts.maxTokens ?? 2048,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  };

  let lastError = "неизвестная ошибка";

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      const res = await fetch(PUBLIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          /* Ключ никогда не логируем и не возвращаем клиенту. */
          Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => null)) as
        | (PublicApiError & {
            choices?: Array<{ message?: { content?: string | null } }>;
          })
        | null;

      if (data?.error) {
        const code = data.error.code !== undefined ? String(data.error.code) : undefined;
        lastError = `${code ?? res.status}: ${data.error.message ?? "ошибка публичного API"}`;
        if (isRetryable(res.status, code)) continue;
        return { reply: null, mode: "public", model, error: lastError };
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        if (isRetryable(res.status, undefined)) continue;
        return { reply: null, mode: "public", model, error: lastError };
      }

      const reply = data?.choices?.[0]?.message?.content?.trim() ?? "";
      if (reply) return { reply, mode: "public", model };
      lastError = "пустой ответ модели";
    } catch (err) {
      /* Сетевая ошибка — тоже кандидат на ретрай. */
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { reply: null, mode: "public", model, error: lastError };
}

/* ── Режим песочницы (SDK) ─────────────────────────────────── */

async function sdkChat(opts: AiSdkOptions): Promise<AiSdkResult> {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();

    /* Внутренний API SDK не принимает роль system — системный промпт
     * едет как assistant (так же, как в задачах 10–11). */
    const sdkMessages = opts.messages.map((m) => ({
      role: m.role === "system" ? ("assistant" as const) : m.role,
      content: m.content,
    }));

    const { reply, model, lastError } = await chatWithFallback(zai, sdkMessages);
    return {
      reply,
      mode: "sdk",
      model,
      ...(reply
        ? {}
        : {
            error:
              lastError instanceof Error
                ? lastError.message
                : String(lastError ?? "нет ответа"),
          }),
    };
  } catch (err) {
    return {
      reply: null,
      mode: "sdk",
      model: publicModel(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ── Единая точка входа ────────────────────────────────────── */

/**
 * Чат с ИИ в любом режиме: с ключом ZAI_API_KEY — публичный API
 * (glm-4.7-flash), без ключа — SDK песочницы. Офлайн-фолбэк —
 * на совести вызывающего (роуты подставят офлайн-мозг сами).
 */
export async function chatCompletion(opts: AiSdkOptions): Promise<AiSdkResult> {
  return hasPublicApiKey() ? publicChat(opts) : sdkChat(opts);
}
