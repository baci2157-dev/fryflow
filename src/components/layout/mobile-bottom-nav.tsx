"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";

import { MoreSheet } from "@/components/layout/more-sheet";
import { useToast } from "@/hooks/use-toast";
import { PRIMARY_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Нижняя навигация мобильных: 4 раздела + «Ещё», blur + Safe Area. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { toast } = useToast();

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="Нижняя навигация"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-6">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={(e) => {
                    if (!item.ready) {
                      e.preventDefault();
                      toast({
                        title: `Раздел «${item.title}» в разработке`,
                        description: "Появится в следующих задачах.",
                        duration: 3200,
                      });
                    }
                  }}
                  className="flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5"
                >
                  <span className="relative flex items-center justify-center">
                    {active && (
                      <motion.span
                        layoutId="bn-pill"
                        className="absolute inset-0 -m-2 rounded-full bg-accent/10"
                        transition={{ type: "spring", stiffness: 450, damping: 28 }}
                      />
                    )}
                    <motion.span
                      animate={{ scale: active ? 1.15 : 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15, mass: 0.6 }}
                      className="relative"
                    >
                      <Icon
                        className={cn("size-[22px]", active ? "text-accent" : "text-ink-soft")}
                        strokeWidth={active ? 2.4 : 2}
                      />
                    </motion.span>
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      active ? "text-accent" : "text-ink-soft"
                    )}
                  >
                    {item.title}
                  </span>
                </Link>
              </li>
            );
          })}

          {/* «Ещё» */}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5"
              aria-label="Ещё — остальные разделы"
            >
              <span className="relative flex items-center justify-center">
                {moreOpen && (
                  <motion.span
                    layoutId="bn-pill"
                    className="absolute inset-0 -m-2 rounded-full bg-accent/10"
                    transition={{ type: "spring", stiffness: 450, damping: 28 }}
                  />
                )}
                <MoreHorizontal
                  className={cn("size-[22px]", moreOpen ? "text-accent" : "text-ink-soft")}
                  strokeWidth={moreOpen ? 2.4 : 2}
                />
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  moreOpen ? "text-accent" : "text-ink-soft"
                )}
              >
                Ещё
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
