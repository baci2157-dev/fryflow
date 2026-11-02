"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Package,
  Upload,
  X,
} from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { cn } from "@/lib/utils";

/**
 * Универсальный диалог JSON-импорта (задача 9): файл → валидация →
 * прогресс-бар «Импортировано 45 из 120» → сводка с ошибками.
 *
 * Используется и для клиентов (с геокодингом), и для каталога
 * попутных товаров — логика валидации приходит в props.
 */

export interface ImportIssue {
  name: string;
  reason: string;
}

export interface ImportOutcome {
  imported: number;
  duplicates: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export type ImportRun = (
  text: string,
  onProgress: (done: number, total: number, label: string) => void
) => Promise<ImportOutcome>;

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** «клиентов» / «товаров» — для текстов. */
  what: string;
  /** JSON-пример для кнопки «Скачать шаблон». */
  sample: string;
  sampleName: string;
  /** Парсинг + импорт (бросает Error с причиной при битом файле). */
  run: ImportRun;
  /** Что делать после успешного импорта (тост родителя). */
  onDone?: (outcome: ImportOutcome) => void;
}

export function ImportDialog({
  open,
  onClose,
  title,
  what,
  sample,
  sampleName,
  run,
  onDone,
}: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState("");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const reset = () => {
    setPhase("idle");
    setDone(0);
    setTotal(0);
    setLabel("");
    setOutcome(null);
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    onClose();
    // сброс — после анимации закрытия, чтобы не мигало
    setTimeout(reset, 250);
  };

  const pickFile = async (file: File | null | undefined) => {
    if (!file) return;
    setFileError(null);

    if (!file.name.toLowerCase().endsWith(".json")) {
      setFileError("Нужен файл .json — экспорт из другой CRM или наш шаблон");
      return;
    }

    const text = await file.text();
    setPhase("running");
    setDone(0);
    setTotal(0);
    setLabel("Разбираем файл…");

    try {
      const result = await run(text, (d, t, l) => {
        setDone(d);
        setTotal(t);
        setLabel(l);
      });
      setOutcome(result);
      setPhase("done");
      onDone?.(result);
    } catch (e) {
      setFileError((e as Error).message || "Не удалось прочитать файл");
      setPhase("idle");
    }
  };

  const downloadSample = () => {
    const blob = new Blob([sample], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sampleName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  /* warnings — те же импортированные записи (с оговоркой), не считаем дважды. */
  const totalRecords =
    outcome === null
      ? 0
      : outcome.imported + outcome.duplicates + outcome.errors.length;
  /* Весь файл оказался дублями — это не ошибка, но пользователь должен
   * понять, почему «точки не добавились»: они и так уже в базе. */
  const nothingNew =
    outcome !== null &&
    outcome.imported === 0 &&
    outcome.duplicates > 0 &&
    outcome.errors.length === 0;

  return (
    <SpringSheet open={open} onClose={close} variant="dialog" title={title}>
      <div className="mt-4 pb-2">
        {/* ── Зона загрузки ── */}
        {phase === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed border-border bg-tint/40 px-6 py-10 text-center transition-colors hover:border-accent/50 hover:bg-accent/5"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-surface text-accent shadow-sm">
                <Upload className="size-6" />
              </span>
              <span className="text-[15px] font-semibold text-ink">
                Выбрать JSON-файл
              </span>
              <span className="max-w-[38ch] text-[12.5px] leading-snug text-ink-soft">
                Массив {what}: name и остальные поля. Дубли пропустим,
                ошибки покажем построчно с причинами.
              </span>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={downloadSample}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
              >
                <Download className="size-4" />
                Скачать шаблон с примером
              </button>
              <span className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                <FileJson className="size-3.5" />
                .json, UTF-8
              </span>
            </div>

            <AnimatePresence>
              {fileError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 flex items-start gap-2 overflow-hidden rounded-xl bg-tier-red/10 px-3.5 py-2.5 text-[13px] leading-snug text-tier-red"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {fileError}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Прогресс ── */}
        {phase === "running" && (
          <div className="rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <Package className="size-4 animate-pulse text-accent" />
                Импортируем {what}…
              </span>
              <span className="font-mono text-[14px] font-semibold text-accent tabular-nums">
                {done} / {total}
              </span>
            </div>

            {/* Прогресс-бар — янтарный, spring */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-tint">
              <motion.div
                className="h-full rounded-full bg-accent"
                animate={{ width: total > 0 ? `${pct}%` : "8%" }}
                transition={{ type: "spring", stiffness: 160, damping: 26 }}
              />
            </div>

            <p className="mt-2.5 truncate text-[12.5px] text-ink-soft">
              {total > 0 ? `Импортировано ${done} из ${total} — сейчас: ${label}` : label}
            </p>
            {total > 0 && done < total && (
              <p className="mt-1 text-[11.5px] text-ink-soft/80">
                Адреса без координат геокодируем через Nominatim — не чаще
                одного в секунду, это небыстро
              </p>
            )}
          </div>
        )}

        {/* ── Сводка ── */}
        {phase === "done" && outcome && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
          >
            {nothingNew ? (
              <div className="flex items-start gap-3 rounded-2xl border border-tier-yellow/40 bg-tier-yellow/10 p-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-tier-yellow" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    Новых записей нет — все уже в базе
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
                    Все {outcome.duplicates} записей файла совпали по названию
                    и адресу с существующими клиентами (дубликаты пропущены).
                    Добавьте в файл новые точки и загрузите снова — старые
                    не задвоятся.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl border border-tier-green/30 bg-tier-green/8 p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-tier-green" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    Импортировано {outcome.imported} из {totalRecords}{" "}
                    {what}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
                    {outcome.duplicates > 0 &&
                      `${outcome.duplicates} дублей пропущено (такие уже есть). `}
                    {outcome.errors.length > 0
                      ? `${outcome.errors.length} записей с ошибками — список ниже.`
                      : "Ошибок нет — чистая загрузка."}
                  </p>
                </div>
              </div>
            )}

            {/* Ошибки построчно */}
            {outcome.errors.length > 0 && (
              <div className="mt-3">
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  <AlertTriangle className="size-3.5 text-tier-red" />
                  Не импортировано · {outcome.errors.length}
                </h4>
                <ul className="fryflow-scroll mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {outcome.errors.map((e, i) => (
                    <li
                      key={`${e.name}-${i}`}
                      className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5"
                    >
                      <X className="mt-0.5 size-3.5 shrink-0 text-tier-red" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-ink">
                          {e.name}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">
                          {e.reason}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Предупреждения (геокодинг и т.п.) */}
            {outcome.warnings.length > 0 && (
              <div className="mt-3">
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  <AlertTriangle className="size-3.5 text-accent" />
                  Добавлено с оговоркой · {outcome.warnings.length}
                </h4>
                <ul className="fryflow-scroll mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {outcome.warnings.map((w, i) => (
                    <li
                      key={`${w.name}-${i}`}
                      className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5"
                    >
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-ink">
                          {w.name}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">
                          {w.reason}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={reset}
                className="h-11 flex-1 rounded-xl border border-border bg-surface text-[14px] font-medium text-ink transition-colors hover:bg-tint"
              >
                Загрузить ещё файл
              </button>
              <button
                type="button"
                onClick={close}
                className={cn(
                  "h-11 flex-[1.4] rounded-xl bg-accent text-[14px] font-semibold text-[#1C1A17]",
                  "transition-colors hover:bg-accent/90"
                )}
              >
                Готово
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </SpringSheet>
  );
}
