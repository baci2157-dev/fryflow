import { NextResponse } from "next/server";

import { chatWithFallback, type AiChatMessage } from "@/lib/ai-model";

/**
 * POST /api/ai-discovery — «Разведчик» новых точек (задача 11).
 *
 * Конвейер:
 *   1. веб-поиск (functions.invoke web_search) по 4 запросам про
 *      новые точки общепита Ростова-на-Дону;
 *   2. модель glm-5.2-fast-preview (с каскадом фолбэков) извлекает
 *      из результатов ТОЛЬКО реальные точки — адрес должен быть
 *      виден в тексте результата, source_url сверяется с реальным
 *      списком URL, выдуманное отсекается;
 *   3. клиент фильтрует дубли (в базе / уже в «Найдено ИИ») и
 *      складывает кандидатов со статусом pending.
 *
 * Работает на сервере: SDK и поиск не утекают в клиентский бандл.
 */

export const runtime = "nodejs";

/** Запрос: текущая база клиентов — чтобы ИИ не предлагал известные точки. */
interface DiscoveryRequest {
  existing?: Array<{ name?: string; address?: string }>;
}

/** Кандидат от модели — «сырой», нормализацией занимается клиент. */
interface CandidateRow {
  name: string;
  address: string;
  district: string;
  phone: string;
  type: string;
  source_url: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_QUERIES = [
  "новые шаурмичные Ростов-на-Дону адреса",
  "шаурма Ростов-на-Дону открылась новая точка адрес",
  "новые бургерные Ростов-на-Дону адрес",
  "стрит-фуд Ростов-на-Дону новые точки адреса",
];

/** Свежие публикации по одному запросу. */
async function searchWeb(
  zai: Awaited<ReturnType<(typeof import("z-ai-web-dev-sdk"))["default"]["create"]>>,
  query: string
): Promise<SearchResult[]> {
  const results = await zai.functions.invoke("web_search", { query, num: 8 });
  if (!Array.isArray(results)) return [];
  return results
    .map((r) => ({
      title: String((r as { name?: string }).name ?? ""),
      url: String((r as { url?: string }).url ?? ""),
      snippet: String((r as { snippet?: string }).snippet ?? ""),
    }))
    .filter((r) => r.url && r.snippet);
}

/** Достаёт JSON-массив из ответа модели (модель любит оборачивать в ```…```). */
function parseCandidates(raw: string): unknown[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  let body: DiscoveryRequest;
  try {
    body = (await request.json()) as DiscoveryRequest;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const existing = Array.isArray(body.existing) ? body.existing : [];
  const knownNames = existing
    .map((c) => String(c?.name ?? "").trim())
    .filter(Boolean)
    .slice(0, 150);

  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();

    /* 1. Веб-поиск по всем запросам, дедуп по URL. */
    const byUrl = new Map<string, SearchResult>();
    for (const query of SEARCH_QUERIES) {
      try {
        for (const item of await searchWeb(zai, query)) {
          if (!byUrl.has(item.url)) byUrl.set(item.url, item);
        }
      } catch (err) {
        console.warn(
          "[ai-discovery] поиск недоступен:",
          err instanceof Error ? err.message : err
        );
      }
    }
    const results = [...byUrl.values()];

    if (results.length === 0) {
      return NextResponse.json(
        { error: "Веб-поиск недоступен — попробуйте позже" },
        { status: 502 }
      );
    }

    /* 2. Извлечение точек моделью — строго из текста результатов. */
    const listing = results
      .slice(0, 40)
      .map((r, i) => `${i + 1}. «${r.title}» — ${r.snippet} [${r.url}]`)
      .join("\n");

    const messages: AiChatMessage[] = [
      {
        role: "assistant",
        content: [
          "Ты — скаут базы клиентов FryFlow: оптовая продажа картофеля фри в Ростове-на-Дону.",
          "Из результатов веб-поиска ниже выбери реальные точки общепита Ростова-на-Дону: шаурмичные, бургерные, стрит-фуд, столовые, пабы.",
          "ЖЁСТКИЕ ПРАВИЛА:",
          "— Не выдумывай ничего: название и адрес должны быть видны в тексте результата поиска. Нет адреса — пропусти точку.",
          "— Телефон указывай только если он есть в тексте результата; иначе пустая строка.",
          "— source_url — только URL из квадратных скобок результата, откуда взята точка.",
          "— Исключи точки, которые уже есть в базе (список ниже), и федеральные сети (Вкусно и точка, Rostic's, Burger King и подобные).",
          "— district — район Ростова-на-Дону одним словом: Кировский, Ворошиловский, Ленинский, Октябрьский, Первомайский, Пролетарский, Советский.",
          "Верни СТРОГО JSON-массив без markdown и пояснений:",
          '[{"name":"...","address":"...","district":"...","phone":"","type":"shawarma","source_url":"..."}]',
          "type — один из: shawarma, burger, canteen, bar, hookah, foodcourt, darkkitchen.",
          "",
          "УЖЕ В БАЗЕ (не повторять):",
          knownNames.length > 0 ? knownNames.join("; ") : "—",
          "",
          "РЕЗУЛЬТАТЫ ПОИСКА:",
          listing,
        ].join("\n"),
      },
      {
        role: "user",
        content:
          "Найди в Ростове-на-Дону новые шаурмичные, бургерные и стрит-фуд точки, которых нет в моей базе. Верни JSON-массив: name, address, district, phone, type, source_url. Не выдумывай адреса — только реальные из поиска.",
      },
    ];

    const { reply, model, lastError } = await chatWithFallback(zai, messages);
    if (!reply) {
      console.warn(
        "[ai-discovery] модель не ответила:",
        lastError instanceof Error ? lastError.message : lastError
      );
      return NextResponse.json(
        { error: "ИИ не смог обработать результаты поиска" },
        { status: 502 }
      );
    }

    /* 3. Валидация: реальные URL, живые адреса, дедуп. */
    const realUrls = new Set(results.map((r) => r.url));
    const seen = new Set(
      existing.map((c) =>
        `${String(c?.name ?? "")}||${String(c?.address ?? "")}`
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim()
      )
    );

    const candidates: CandidateRow[] = [];
    for (const row of parseCandidates(reply)) {
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? "").trim().slice(0, 120);
      const address = String(r.address ?? "").trim().slice(0, 200);
      if (name.length < 2 || address.length < 3) continue;

      const key = `${name}||${address}`.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);

      let sourceUrl = String(r.source_url ?? "").trim();
      if (!realUrls.has(sourceUrl)) sourceUrl = "";

      candidates.push({
        name,
        address,
        district: String(r.district ?? "").trim().slice(0, 60),
        phone: String(r.phone ?? "")
          .replace(/[^\d+()\-\s]/g, "")
          .trim()
          .slice(0, 30),
        type: String(r.type ?? "shawarma").trim().slice(0, 30) || "shawarma",
        source_url: sourceUrl,
      });
    }

    return NextResponse.json({
      candidates,
      searchResults: results.length,
      model,
      source: "zai",
    });
  } catch (err) {
    console.warn(
      "[ai-discovery] ZAI недоступен:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Разведка недоступна — ИИ не отвечает" },
      { status: 502 }
    );
  }
}
