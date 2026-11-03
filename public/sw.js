/**
 * Service Worker FryFlow (задача 8 — PWA и офлайн-режим).
 *
 * Задача: приложение живёт на телефоне как нативное — открывается
 * из подвала склада без сети, интерфейс кэшируется целиком.
 *
 * ВАЖНО (fix «импорт не сработал»): раньше чанки /_next/static/ кэшировались
 * по стратегии cache-first — «имена файлов хэшированы, протухнуть не могут».
 * Это верно для production-сборки, но НЕ верно для dev-сервера (превью
 * платформы): там имена чанков стабильны, а содержимое меняется после каждой
 * правки кода. Браузер вечно получал из кэша СТАРУЮ версию приложения
 * (со старым справочником районов и старой логикой импорта) — сколько бы
 * мы ни фиксили код. Теперь все same-origin GET — network-first с фолбэком
 * в кэш: онлайн всегда свежий код, офлайн — последний закэшированный.
 *
 * Задача 19.5: версия поднята до v1.2.0 — кэши прошлых версий
 * (fryflow-shell и fryflow-runtime) сносятся при активации, телефон
 * гарантированно уходит со старой копии приложения и старого сида.
 *
 * Задача 20: версия поднята до v1.3.0 — сид вырос до 360 точек
 * (+30 Чкаловский, Первомайский район). RUNTIME_CACHE держал старый
 * /seed/clients.json; снос кэшей при активации гарантирует, что даже
 * офлайн-телефон после обновления прочитает свежий сид.
 *
 * Задача 21: версия поднята до v1.4.0 — сид вырос до 421 точки
 * (Ленинский +35, Пролетарский +26, Баррикадные +2 в Железнодорожный).
 * Снос кэшей при активации — телефон читает свежий /seed/clients.json.
 *
 * Задача 24: v1.6.0 — правки данных сида (Соколова ×14 → Кировский с
 * координатами Nominatim, Штефан Бургер пр. Королёва 51: телефон+координаты).
 * Задача 22: версия поднята до v1.5.0 — сид вырос до 455 точек
 * (Ворошиловский +33, Мадояна +1 в Железнодорожный; 1 адрес-фантом
 * 1-я Ковровая пропущен). Снос кэшей при активации — свежий сид.
 *
 * Задача 23: v1.5.1 — мобильная оптимизация (список адресов в форме
 * клиента, тач-таргеты 44px, safe-area, overscroll, пагинация списков).
 * Задача 24: версия поднята до v1.6.0 — правки данных сида + миграция.
 *
 * Стратегии (v1.6.0):
 *  • навигация — сеть, при обрыве кэш оболочки «/»;
 *  • статика Next.js и иконки — сеть, при обрыве кэш (см. выше);
 *  • GET API-запросы — сеть, при обрыве кэш.
 *
 * Записи (POST) не перехватываем: их в офлайне забирает
 * IndexedDB-очередь (lib/offline-queue.ts) и отправляет при
 * восстановлении сети.
 */

const VERSION = "v1.6.0";
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
            /* Подчищаем кэши прошлых версий — в том числе «залипшую»
             * v1.0.0 со старыми dev-чанками. */
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

/** Сеть первым, кэш — фолбэк. Свежие данные всегда, офлайн — из кэша. */
async function networkFirst(request, cacheName) {
  try {
    const fresh = await fetch(request);
    /* Кэшируем только здоровые ответы: 403/502 от прокси-серверов
     * не должны вытеснять рабочий кэш. */
    if (fresh && fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("offline-no-cache");
  }
}

/** Навигация: сеть → кэш оболочки (страница открывается без сети). */
async function navigationHandler(request) {
  try {
    return await networkFirst(request, SHELL_CACHE);
  } catch {
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

/** API GET: сеть → кэш → честный офлайн-ответ. */
async function apiHandler(request) {
  try {
    return await networkFirst(request, RUNTIME_CACHE);
  } catch {
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/* ── Перехват запросов ─────────────────────────────────────── */

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Только GET: POST/PUT в офлайне уходит в IndexedDB-очередь. */
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  /* Чужие домены (тайлы карты, Nominatim, Telegram) — не кэшируем. */
  if (url.origin !== self.location.origin) return;
  /* HMR-канал Next.js (dev-режим) — мимо. */
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  /* Навигация: без сети приложение всё равно открывается. */
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  /* Хэшированная статика и иконки: сеть → кэш (см. шапку файла —
   * cache-first в dev-режиме кормил браузер протухшим кодом). */
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(
        () => new Response("offline", { status: 503 })
      )
    );
    return;
  }

  /* Остальной GET (API-роуты, манифест, svg): сеть → кэш. */
  event.respondWith(apiHandler(request));
});
