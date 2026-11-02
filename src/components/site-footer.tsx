export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1.5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">
          FryFlow — тёплая точность для быстрых интерфейсов.
        </p>
        <p className="font-mono text-xs text-ink-soft tabular-nums">
          v0.1.0 · Light/Dark · Inter + JetBrains Mono
        </p>
      </div>
    </footer>
  );
}
