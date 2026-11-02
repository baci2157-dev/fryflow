/**
 * Геокодинг адресов через Nominatim (OpenStreetMap).
 *
 * Правила использования Nominatim: максимум 1 запрос в секунду,
 * поэтому вызовы всегда с debounce ≥ 1,5 с (см. ClientFormDialog).
 * Все адреса FryFlow — Ростов-на-Дону, город подставляется автоматически.
 */

export interface GeoSuggestion {
  label: string; // «ул. Зорге, 19»
  detail: string; // «Ростов-на-Дону, Ростовская область»
  lat: number;
  lng: number;
  /** Район, если Nominatim его распознал («Советский район» → «Советский»). */
  district?: string;
}

const CITY = "Ростов-на-Дону";

/** Извлекаем район из ответа Nominatim. */
function extractDistrict(address: Record<string, string> | undefined): string | undefined {
  if (!address) return undefined;
  // Для Ростова административный район лежит в city_district
  // («Советский район»), suburb — это микрорайон («ЗЖМ»), он нам не нужен.
  const raw =
    address.city_district ??
    address.district ??
    address.borough ??
    address.suburb ??
    address.quarter;
  if (!raw) return undefined;
  // «Советский район» → «Советский», «Ленинский» остаётся «Ленинский».
  return raw.replace(/\s*район$/i, "").trim();
}

export async function geocodeAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeoSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "ru");
  url.searchParams.set("q", `${q}, ${CITY}`);

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Nominatim вернул ${res.status}`);

  const json = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    address?: Record<string, string>;
  }>;

  return json.map((item) => {
    const parts = item.display_name.split(",").map((s) => s.trim());
    // display_name: «19, ул. Зорге, Западный…, Ростов-на-Дону…» — берём
    // первые 2 значимые части до города.
    const cityIdx = parts.findIndex((p) => p.startsWith(CITY));
    const labelParts = cityIdx > 0 ? parts.slice(0, cityIdx) : parts.slice(0, 2);
    return {
      label: labelParts.join(", ") || item.display_name,
      detail: parts.slice(cityIdx > 0 ? cityIdx : 1).join(", ") || item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      district: extractDistrict(item.address),
    };
  });
}

/** «47.2448, 39.7025» — короткая подпись координат. */
export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
