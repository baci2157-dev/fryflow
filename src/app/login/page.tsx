"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogIn, TriangleAlert } from "lucide-react";

import {
  DEFAULT_LOGIN_NAME,
  isLoggedIn,
  login,
} from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Экран входа FryFlow (задача 10).
 *
 * Локальная авторизация: имя (по умолчанию Taleh) + PIN-код
 * (по умолчанию 1234). Сессия пишется в localStorage fryflow-auth,
 * дальше AppShell сам пускает на остальные экраны. Уже вошедшего
 * здесь не держим — редирект на Дашборд.
 */

export default function LoginPage() {
  const router = useRouter();

  const [name, setName] = useState(DEFAULT_LOGIN_NAME);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [checked, setChecked] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  /* Уже есть сессия — на Дашборд, логин не показываем.
   *  setState через rAF — без каскадных рендеров (паттерн Дашборда). */
  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/");
      return;
    }
    const id = requestAnimationFrame(() => setChecked(true));
    return () => cancelAnimationFrame(id);
  }, [router]);

  /* Проверка сессии мгновенная (localStorage) — рисуем экран только после неё,
   * чтобы не мигал логин у уже вошедшего владельца. */
  if (!checked) {
    return <div className="flex min-h-dvh items-center justify-center bg-bg" />;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setError("PIN — ровно 4 цифры");
      setShake((s) => s + 1);
      return;
    }
    if (login(name, pin)) {
      router.replace("/");
      return;
    }
    setError("Неверный PIN-код");
    setShake((s) => s + 1);
    setPin("");
    pinRef.current?.focus();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="w-full max-w-sm"
      >
        {/* Логотип */}
        <div className="flex flex-col items-center gap-3">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-surface shadow-sm ring-1 ring-border">
            <Image
              src="/fryflow.svg"
              alt="FryFlow"
              width={36}
              height={36}
              priority
            />
          </span>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              FryFlow
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              CRM оптовых продаж картофеля фри
            </p>
          </div>
        </div>

        {/* Форма входа */}
        <motion.form
          key={shake}
          animate={shake > 0 ? { x: [0, -9, 8, -5, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          onSubmit={submit}
          className="mt-7 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
        >
          {/* Имя */}
          <div>
            <label
              htmlFor="login-name"
              className="mb-1.5 block text-[12.5px] font-medium text-ink-soft"
            >
              Имя
            </label>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              placeholder="Taleh"
              className="h-11 w-full rounded-xl border border-border bg-bg px-3.5 text-[14px] text-ink placeholder:text-ink-soft/60 transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          {/* PIN */}
          <div>
            <label
              htmlFor="login-pin"
              className="mb-1.5 block text-[12.5px] font-medium text-ink-soft"
            >
              PIN-код
            </label>
            <input
              id="login-pin"
              ref={pinRef}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(digits);
                if (error) setError(null);
              }}
              placeholder="••••"
              className={cn(
                "h-13 w-full rounded-xl border bg-bg py-3.5 text-center font-mono text-2xl tracking-[0.55em] text-ink transition-colors placeholder:tracking-[0.55em] placeholder:text-ink-soft/40 focus:outline-none focus:ring-2 focus:ring-ring/30",
                error
                  ? "border-tier-red/60"
                  : "border-border focus:border-accent/50"
              )}
            />
            {error ? (
              <p className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-tier-red">
                <TriangleAlert className="size-3.5" />
                {error}
              </p>
            ) : (
              <p className="mt-1.5 text-[11.5px] text-ink-soft">
                По умолчанию: Taleh · 1234
              </p>
            )}
          </div>

          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <LogIn className="size-4" />
            Войти
          </motion.button>
        </motion.form>

        <p className="mt-5 text-center text-[11.5px] leading-relaxed text-ink-soft">
          PIN меняется в «Настройках» после входа — раздел «Безопасность».
          <br />
          Сброс забытого PIN — через имя владельца (Taleh).
        </p>
      </motion.div>
    </div>
  );
}
