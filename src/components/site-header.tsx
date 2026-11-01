import { Flame } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2.5" aria-label="FryFlow — на главную">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Flame className="size-[18px]" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink">
            Fry<span className="text-accent">Flow</span>
          </span>
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
