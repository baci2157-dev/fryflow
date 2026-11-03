"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Spring Sheet FryFlow:
 *  — mobile: нижний лист с drag-to-close (свайп вниз);
 *  — desktop: правый дровер (variant="drawer") или центрированный
 *    диалог (variant="dialog") — по контексту.
 *
 * Анимация — spring-физика framer-motion (не тайм-интервалы).
 */

const SPRING = { type: "spring", stiffness: 380, damping: 38 } as const;

/**
 * Синхронное определение мобильного на первом рендере.
 *
 * Фикс (задача 24): useIsMobile() возвращает false на первом рендере
 * (state undefined). Модалки монтируются по требованию — первый кадр
 * рендерил desktop-диалог, его entry-анимация (opacity 0→1) стартовала,
 * затем тот же motion.div переиспользовался под мобильный лист, который
 * анимирует только y — и opacity навсегда замирал на ~0.05: лист был
 * прозрачным на телефоне. Пока эффект не сошёлся, ширина окна известна
 * синхронно — гонки больше нет.
 */
function useSyncedIsMobile() {
  const isMobile = useIsMobile();
  const synced =
    isMobile ??
    (typeof window !== "undefined" ? window.innerWidth < 768 : false);
  return synced;
}

interface SpringSheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  variant?: "drawer" | "dialog";
  desktopWidth?: number;
  /** На мобильных — полноэкранный лист вместо нижнего (панель скриптов). */
  mobileFullscreen?: boolean;
}

export function SpringSheet({
  open,
  onClose,
  title,
  children,
  variant = "drawer",
  desktopWidth = 460,
  mobileFullscreen = false,
}: SpringSheetProps) {
  const isMobile = useSyncedIsMobile();

  // Esc — закрыть; блокируем прокрутку фона, пока лист открыт.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const isDrawer = variant === "drawer";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
          {/* затемнение */}
          <motion.button
            aria-label="Закрыть"
            className="absolute inset-0 h-full w-full cursor-default bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            tabIndex={-1}
          />

          {isMobile ? (
            /* ── Mobile: нижний лист (или полноэкранный) со свайпом вниз ──
             * animate включает opacity/scale/x — если вариант сменился
             * (ресайз через брейкпоинт), «заносные» motion-значения
             * сходятся к плотному листу, а не замирают прозрачными. */
            <motion.div
              className={cn(
                "absolute inset-x-0 bottom-0 flex flex-col border border-border bg-surface shadow-2xl",
                mobileFullscreen
                  ? "inset-0 rounded-none"
                  : "max-h-[90dvh] rounded-t-3xl"
              )}
              initial={{ y: "102%" }}
              animate={{ y: 0, x: 0, opacity: 1, scale: 1 }}
              exit={{ y: "102%" }}
              transition={SPRING}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              dragListener={!mobileFullscreen}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 700) onClose();
              }}
            >
              <div className="flex justify-center pb-1 pt-2.5" aria-hidden="true">
                <span className="h-1.5 w-10 rounded-full bg-border" />
              </div>
              <SheetHeader title={title} onClose={onClose} />
              <div className="fryflow-scroll flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-1">
                {children}
              </div>
            </motion.div>
          ) : isDrawer ? (
            /* ── Desktop: правый дровер ── */
            <motion.aside
              className="absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-surface shadow-2xl"
              style={{ maxWidth: desktopWidth }}
              initial={{ x: "104%" }}
              animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              exit={{ x: "104%" }}
              transition={SPRING}
            >
              <SheetHeader title={title} onClose={onClose} />
              <div className="fryflow-scroll flex-1 overflow-y-auto px-6 pb-8 pt-1">
                {children}
              </div>
            </motion.aside>
          ) : (
            /* ── Desktop: центрированный диалог ── */
            <motion.div
              className="absolute left-1/2 top-1/2 flex max-h-[86dvh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface shadow-2xl"
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            >
              <SheetHeader title={title} onClose={onClose} />
              <div className="fryflow-scroll flex-1 overflow-y-auto px-6 pb-6">
                {children}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}

function SheetHeader({
  title,
  onClose,
}: {
  title: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5 md:px-6">
      <div className="min-w-0 text-[15px] font-semibold tracking-tight text-ink">
        {title}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tint text-ink-soft transition-colors hover:bg-accent/15 hover:text-ink"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
