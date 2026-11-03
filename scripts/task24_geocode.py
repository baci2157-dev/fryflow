#!/usr/bin/env python3
"""Задача 24, блок 1.2 — перегеокодинг точек.

• «Штефан Бургер» (Королёва, 51) — сейчас без координат (фолбэк центра
  города), телефон уточнён владельцем по 2ГИС: +7 (863) 229-54-54.
• 5 старых точек на пр. Соколова (27, 47, 90, 91, 119) — координаты из
  старого генератора, прогоняем через Nominatim (таймаут 6 с, ≤1 req/s).
• Заодно: «ул. Соколова» → «пр. Соколова» (Соколова — проспект,
  поправлено в задаче 22 для № 80), «Советский район» → «Советский».

Только печатает результат (--apply — правит public/seed/clients.json).
"""
import json
import re
import time
import urllib.parse
import urllib.request

CITY = "Ростов-на-Дону"
SEED = "public/seed/clients.json"

# addr_in_seed -> (nominatim-запросы в порядке приоритета)
TARGETS = {
    "ул. Королёва, 51": [
        "проспект Королёва 51",
        "Королёва 51",
    ],
    "ул. Соколова, 27": ["проспект Соколова 27", "Соколова 27"],
    "ул. Соколова, 47": ["проспект Соколова 47", "Соколова 47"],
    "ул. Соколова, 90": ["проспект Соколова 90", "Соколова 90"],
    "ул. Соколова, 91": ["проспект Соколова 91", "Соколова 91"],
    "ул. Соколова, 119": ["проспект Соколова 119", "Соколова 119"],
}

def nominatim(query: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "6", "accept-language": "ru",
        "addressdetails": "1", "q": f"{query}, {CITY}",
    })
    req = urllib.request.Request(
        url, headers={"User-Agent": "FryFlowSeedPrep/1.0 (fryflow seed preparation)"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.load(r)

def main():
    rows = json.load(open(SEED, encoding="utf-8"))
    results = {}
    for addr, queries in TARGETS.items():
        hit = None
        for q in queries:
            try:
                res = nominatim(q)
            except Exception as e:
                print(f"  !! {addr}: запрос «{q}» упал: {e}")
                time.sleep(1.2)
                continue
            for cand in res:
                lat, lng = float(cand["lat"]), float(cand["lon"])
                ad = cand.get("address", {})
                street = (ad.get("road") or ad.get("pedestrian") or "").lower()
                hn = (ad.get("house_number") or "").lower()
                # улица должна зваться Соколова/Королёва (или содержать)
                if street and any(k in street for k in ("соколов", "королёва", "королева")):
                    hit = {"lat": round(lat, 6), "lng": round(lng, 6),
                           "street": ad.get("road"), "hn": ad.get("house_number"),
                           "type": cand.get("type"), "class": cand.get("class"),
                           "display": cand.get("display_name", "")[:90]}
                    break
            if hit:
                break
            time.sleep(1.2)
        results[addr] = hit
        print(f"{addr}: {hit if hit else 'НЕ НАЙДЕНО'}")
        time.sleep(1.2)

    if "--apply" in __import__("sys").argv:
        changed = 0
        for r in rows:
            a = r.get("address")
            if a == "ул. Королёва, 51" and results.get(a):
                r["coordinates"] = {"lat": results[a]["lat"], "lng": results[a]["lng"]}
                r["phone"] = "+7 (863) 229-54-54"
                r["notes"] = "Телефон сети из 2ГИС (задача 24)"
                changed += 1
            elif a in TARGETS and results.get(a):
                r["address"] = a.replace("ул. Соколова", "пр. Соколова")
                r["coordinates"] = {"lat": results[a]["lat"], "lng": results[a]["lng"]}
                changed += 1
            if r.get("district") == "Советский район":
                r["district"] = "Советский"
        json.dump(rows, open(SEED, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        open(SEED, "a", encoding="utf-8").write("\n")
        print(f"APPLIED: {changed} строк обновлено")
    else:
        print("(dry-run; --apply для записи)")

if __name__ == "__main__":
    main()
