import {
  PRICE_PER_PACK,
  TRIAL_PRICE,
  WORKING_HOURS,
  type Client,
  type RouteStop,
  RouteCrossSell,
} from "@/types/models";

/**
 * Логика маршрута дня FryFlow.
 *
 * ── Алгоритм «Ближайший сосед»:
 *    стартуем со склада, каждый раз едем в ближайшую ещё не посещённую
 *    точку (расстояние — гаверсинус, км). Жадный, но для 5–15 точек
 *    города даёт разумный порядок за миллисекунды.
 *
 * ── Вместимость: 50 коробок по умолчанию (настраивается). Точки,
 *    которые не влезли, уходят в «не вместилось» — на вторую ходку.
 *
 * ── Временные окна: типовые часы работы сегмента. Считаем ETA
 *    (средняя городская скорость 26 км/ч + 12 минут на точку),
 *    и подсвечиваем точки, куда приедем к закрытию.
 */

/** Склад-отправитель. */
export const ROUTE_START = {
  name: "Склад FryFlow",
  address: "ул. Доватора, 150",
  lat: 47.2489,
  lng: 39.637,
};

/** Вместимость машины по умолчанию, коробок. */
export const DEFAULT_CAPACITY = 50;

/** Средняя скорость по городу, км/ч. */
const AVG_SPEED_KMH = 26;
/** Время на точке (разгрузка, документы), минут. */
const SERVICE_MINUTES = 12;
/** Начало дня маршрута. */
const DAY_START_HOUR = 9;

export interface Point {
  lat: number;
  lng: number;
}

/** Расстояние по гаверсинусу, км. */
export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface PlannedStop {
  client: Client;
  boxes: number;
  orderSum: number;
  /** Попутные товары к точке (задача 9) — пробрасываются из RouteStop. */
  crossSell?: RouteCrossSell[];
  /** Порядковый номер точки в маршруте (1-based). */
  index: number;
  /** Расстояние от предыдущей точки, км. */
  distanceFromPrevKm: number;
  /** Накопительный пробег от склада, км. */
  cumulativeKm: number;
  /** Накопительное время от начала дня, минут. */
  etaMinutes: number;
  /** Часы работы точки. */
  window: { from: number; to: number };
  /** Приедем после закрытия. */
  late: boolean;
  cumulativeBoxes: number;
}

export interface RoutePlan {
  ordered: PlannedStop[];
  /** Не вместилось в машину. */
  skipped: Array<{ client: Client; boxes: number; orderSum: number }>;
  totalBoxes: number;
  totalSum: number;
  totalKm: number;
  /** Число минут от выезда со склада до последней точки. */
  totalMinutes: number;
}

/** Минуты с начала дня → «14:35». */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Часы работы в человекочитаемом виде: «10:00–23:00». */
export function formatWindow(w: { from: number; to: number }): string {
  const fmt = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  return `${fmt(w.from)}–${fmt(w.to)}`;
}

/**
 * Планирование маршрута: «ближайший сосед» + ограничение вместимости.
 */
export function planRoute(
  stops: RouteStop[],
  clients: Client[],
  capacity: number = DEFAULT_CAPACITY
): RoutePlan {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const pending = stops
    .map((s) => ({ stop: s, client: byId.get(s.clientId) }))
    .filter((x): x is { stop: RouteStop; client: Client } => Boolean(x.client));

  const ordered: PlannedStop[] = [];
  const skipped: RoutePlan["skipped"] = [];

  let current: Point = ROUTE_START;
  let remaining = [...pending];
  let cumulativeKm = 0;
  let cumulativeMinutes = DAY_START_HOUR * 60;
  let cumulativeBoxes = 0;

  while (remaining.length > 0) {
    // Ближайший сосед: минимальное расстояние от текущей точки.
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((r, i) => {
      const d = haversineKm(current, r.client.coordinates);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });

    const next = remaining[bestIdx];
    remaining = remaining.filter((_, i) => i !== bestIdx);

    // Вместимость: если коробки не влезают — точка на вторую ходку.
    if (cumulativeBoxes + next.stop.boxes > capacity) {
      skipped.push({
        client: next.client,
        boxes: next.stop.boxes,
        orderSum: next.stop.orderSum,
      });
      continue;
    }

    cumulativeKm += bestDist;
    // Перегон + сервисное время на точке.
    cumulativeMinutes += (bestDist / AVG_SPEED_KMH) * 60 + SERVICE_MINUTES;
    cumulativeBoxes += next.stop.boxes;

    const window = WORKING_HOURS[next.client.type];
    const arrivalHour = cumulativeMinutes / 60;

    ordered.push({
      client: next.client,
      boxes: next.stop.boxes,
      orderSum: next.stop.orderSum,
      crossSell: next.stop.crossSell,
      index: ordered.length + 1,
      distanceFromPrevKm: bestDist,
      cumulativeKm,
      etaMinutes: cumulativeMinutes,
      window,
      late: arrivalHour > window.to,
      cumulativeBoxes,
    });

    current = next.client.coordinates;
  }

  const totalBoxes = ordered.reduce((a, s) => a + s.boxes, 0);
  const totalSum = ordered.reduce((a, s) => a + s.orderSum, 0);

  return {
    ordered,
    skipped,
    totalBoxes,
    totalSum,
    totalKm: Math.round(cumulativeKm * 10) / 10,
    totalMinutes: cumulativeMinutes - DAY_START_HOUR * 60,
  };
}

/**
 * Ссылка на Яндекс.Карты с мультимаршрутом (авто).
 * Склад → точки в порядке объезда. Формат rtext: lat,lng через «~».
 */
export function buildYandexRouteUrl(ordered: PlannedStop[]): string {
  const points = [ROUTE_START, ...ordered.map((s) => s.client.coordinates)];
  const rtext = points.map((p) => `${p.lat},${p.lng}`).join("~");
  const params = new URLSearchParams({ rtext, rtt: "auto", z: "12" });
  return `https://yandex.ru/maps/?${params.toString()}`;
}

/** Одна точка в Яндекс.Навигаторе (кнопка «Навигатор» в карточке). */
export function buildYandexNavUrl(client: Client): string {
  const params = new URLSearchParams({
    "whatshere[point]": `${client.coordinates.lng},${client.coordinates.lat}`,
    "whatshere[zoom]": "17",
    text: `${client.name}, ${client.address}, Ростов-на-Дону`,
  });
  return `https://yandex.ru/maps/?${params.toString()}`;
}

/** Стандартные коробки и сумму заказа для автосборки маршрута. */
export function typicalStopFor(client: Client): RouteStop {
  const boxes = client.lastOrderBoxes ?? defaultBoxesFor(client);
  return { clientId: client.id, boxes, orderSum: boxes * PRICE_PER_PACK };
}

/**
 * Точка «проба» после звонка: одна упаковка 2,5 кг за 350 ₽
 * (вычитается из первого оптового заказа). Экран /route подхватывает
 * её в общий план с учётом времени работы и вместимости машины.
 */
export function trialStopFor(client: Client): RouteStop {
  return { clientId: client.id, boxes: 1, orderSum: TRIAL_PRICE };
}

function defaultBoxesFor(client: Client): number {
  if (client.chainName && client.chainSize) {
    // Сеть возим объёмом: ~2 коробки на филиал, минимум 4.
    return Math.max(4, client.chainSize * 2);
  }
  const table: Record<string, number> = {
    shawarma: 6,
    burger: 4,
    canteen: 10,
    bar: 3,
    hookah: 2,
    foodcourt: 5,
    darkkitchen: 5,
  };
  return table[client.type] ?? 5;
}
