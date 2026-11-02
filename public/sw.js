/**
 * Service Worker FryFlow (задача 8 — PWA и офлайн-режим).
 *
 * Задача: приложение живёт на телефоне как нативное — открывается
 * из подвала склада без сети, интерфейс кэшируется целиком.
 *
 * Стратегии:
 *  • навигация (переход по страницам) — сеть первым, при обрыве
 *    отдаём кэшированную оболочку «/» (offline-first fallback);
 *  • статика Next.js (хэшированные чанки) и иконки — cache-first:
 *    имя файла меняется при изменении содержимого;
 *  • GET API-запросы и прочее — stale-while-revalidate: сразу из
 *    кэша, в фоне обновляем.
 *
 * Записи (POST) не перехватываем: их в офлайне забирает
 * IndexedDB-очередь (lib/offline-queue.ts) и отправляет при
 * восстановлении сети.
 */

const VERSION = "v1.0.0";
const SHELL_CACHE = `fryflow-shell-${VERSION}`;
const RUNTIME_CACHE = `fryflow-runtime-${VERSION}`;

/** Оболочка приложения: ставится один раз при установке. */
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/fryflow.svg",
  "/logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/* ── Стратегии кэширования ─────────────────────────────────── */

/** Навигация: сеть → кэш оболочки (страница открывается без сети). */
async function networkFirstNavigation(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put("/", fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match("/");
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset='utf-8'><title>FryFlow — офлайн</title>" +
        "<body style='background:#14120F;color:#F0EDE8;font-family:system-ui;" +
        "display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>" +
        "<p style='text-align:center'>FryFlow ещё не закэширован.<br>" +
        "Откройте приложение один раз при сети — и оно будет работать офлайн.</p></body>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

/** Статика: кэш первым (имена файлов хэшированы — протухнуть не могут). */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

/** stale-while-revalidate: сразу кэш (пусть и вчерашний), в фоне свежий. */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then((fresh) => {
      if (fresh.ok) {
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, fresh.clone()));
      }
      return fresh;
    })
    .catch(() => null);
  if (cached) {
    void refresh; // обновляем молча, клиенту уже ответили из кэша
    return cached;
  }
  const fresh = await refresh;
  if (fresh) return fresh;
  /* Ни кэша, ни сети — честный офлайн-ответ для API. */
  return new Response(JSON.stringify({ offline: true }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

/* ── Перехват запросов ─────────────────────────────────────── */

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Только GET: POST/PUT в офлайне уходит в IndexedDB-очередь. */
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  /* Чужие домены (тайлы карты, Telegram) — не кэшируем. */
  if (url.origin !== self.location.origin) return;
  /* HMR-канал Next.js (dev-режим) — мимо. */
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  /* Навигация: без сети приложение всё равно открывается. */
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  /* Хэшированная статика и иконки: cache-first. */
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* Остальной GET (API-роуты, манифест, svg): SWR. */
  event.respondWith(staleWhileRevalidate(request));
});
