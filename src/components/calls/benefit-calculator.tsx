"use client";

import { useState } from "react";
import { Calculator, TrendingDown } from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { Slider } from "@/components/ui/slider";
import { formatMoney } from "@/lib/mock-data";
import { MIN_WHOLESALE_BOXES, PRICE_PER_KG } from "@/types/models";

/**
 * Калькулятор выгоды для разговора с клиентом: два ползунка
 * (расход и текущая цена закупки) → экономия в месяц и в год
 * против оптовой цены FryFlow 120 ₽/кг (от 10 коробок).
 * Открывается из панели «Скрипты и возражения».
 */
export function BenefitCalculator({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [volumeKg, setVolumeKg] = useState(100);
  const [currentPrice, setCurrentPrice] = useState(150);

  const diffPerKg = currentPrice - PRICE_PER_KG;
  const savingPerMonth = Math.max(0, diffPerKg * volumeKg);
  const savingPerYear = savingPerMonth * 12;
  // Сколько упаковок 2,5 кг в месяц и влезает ли в опт (от 10 коробок).
  const packsPerMonth = volumeKg / 2.5;

  return (
    <SpringSheet
      open={open}
      onClose={onClose}
      variant="dialog"
      title={
        <span className="flex items-center gap-2">
          <Calculator className="size-4 text-accent" />
          Калькулятор выгоды
        </span>
      }
    >
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        Посчитайте экономию клиента вместе с ним на телефоне: два ползунка —
        и вот уже не «дорого», а «{" "}
        <span className="font-semibold text-ink">{formatMoney(Math.max(0, savingPerYear))}</span>{" "}
        в год».
      </p>

      {/* Ползунок 1: расход */}
      <div className="mt-5 rounded-2xl border border-border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="calc-volume" className="text-[13px] font-medium text-ink">
            Расход картофеля фри
          </label>
          <span className="font-mono text-[17px] font-semibold tabular-nums text-ink">
            {volumeKg} кг/мес
          </span>
        </div>
        <Slider
          id="calc-volume"
          value={[volumeKg]}
          onValueChange={([v]) => setVolumeKg(v)}
          min={20}
          max={600}
          step={10}
          className="mt-3"
        />
        <div className="mt-1.5 flex justify-between font-mono text-[10.5px] tabular-nums text-ink-soft">
          <span>20</span>
          <span>≈ {packsPerMonth.toFixed(0)} уп × 2,5 кг</span>
          <span>600</span>
        </div>
      </div>

      {/* Ползунок 2: текущая цена */}
      <div className="mt-3 rounded-2xl border border-border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="calc-price" className="text-[13px] font-medium text-ink">
            Текущая цена закупки
          </label>
          <span className="font-mono text-[17px] font-semibold tabular-nums text-ink">
            {currentPrice} ₽/кг
          </span>
        </div>
        <Slider
          id="calc-price"
          value={[currentPrice]}
          onValueChange={([v]) => setCurrentPrice(v)}
          min={80}
          max={220}
          step={5}
          className="mt-3"
        />
        <div className="mt-1.5 flex justify-between font-mono text-[10.5px] tabular-nums text-ink-soft">
          <span>80 ₽</span>
          <span>FryFlow от {MIN_WHOLESALE_BOXES} коробок — {PRICE_PER_KG} ₽/кг</span>
          <span>220 ₽</span>
        </div>
      </div>

      {/* Результат */}
      <div
        className="mt-4 rounded-2xl border p-4"
        style={{
          borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
          background: "color-mix(in srgb, var(--accent) 8%, transparent)",
        }}
      >
        {diffPerKg > 0 ? (
          <>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-accent">
              <TrendingDown className="size-3.5" />
              Экономия с FryFlow
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="font-mono text-[26px] font-bold leading-none tracking-tight text-ink">
                {formatMoney(savingPerMonth)}
                <span className="text-[13px] font-medium text-ink-soft">/мес</span>
              </p>
              <p className="font-mono text-[16px] font-semibold leading-none text-ink-soft">
                {formatMoney(savingPerYear)}
                <span className="text-[12px]"> /год</span>
              </p>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft">
              По {diffPerKg} ₽ с килограмма. Для клиента это новая фритюрница
              или два оклада повара — считайте в годовых, это убеждает.
            </p>
          </>
        ) : (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">
              Цена клиента {currentPrice} ₽/кг — не выше нашей
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink">
              Тогда аргумент не цена, а стабильность: одинаковый калибр от
              партии к партии, меньше отхода во фритюре и локальный склад
              без московских сроков. Предлагайте пробу — она покажет разницу.
            </p>
          </>
        )}
      </div>

      <p className="mt-3 text-center text-[11.5px] text-ink-soft">
        Опт {PRICE_PER_KG} ₽/кг — от {MIN_WHOLESALE_BOXES} коробок · мелкий опт 140 ₽/кг
      </p>
    </SpringSheet>
  );
}
