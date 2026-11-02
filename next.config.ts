import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Пин корня Turbopack (fix деплоя): без него при сборке из вложенного
     каталога (окружение сборки видит чужой lockfile уровнем выше — как на
     платформе) Next неверно определяет workspace root и вкладывает
     standalone-выход в .next/standalone/<dirname>/ — server.js не на
     месте, старт деплоя падает. Корень = каталог запуска next (проект). */
  turbopack: {
    root: process.cwd(),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "https://preview-chat-7c3d43ce-af1f-43a2-a8d7-b878a0612e8f.space-z.ai",
    "https://*.space-z.ai",
  ],
  /* Service Worker всегда проверяется заново: браузер должен видеть
   * свежую версию sw.js сразу после деплоя, а не жить со старой
   * стратегией кэширования до истечения HTTP-кэша. */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
