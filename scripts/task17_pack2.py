#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Задача 17: Суворовский — второй пакет (25 реальных точек).

Точки — точный список владельца (scripts/fixtures/task17_suvorovsky_pack2.json):
Измайловский бульвар, Сосновая, ЖК Платовский, Петренко, Драгунская,
Юрия Дубинина, пер. Белоусова, Таганрогская (Военвед), Тульская (Каменка),
Немировича-Данченко, Оганова, Мечникова, Добровольского — все Октябрьский.

Конвейер — тот же, что у базового сида (make_import_base.py) и пакета 1
(make_suvorovsky_pack.py):

  валидация (правила parseRow из src/lib/import-clients.ts)
  → дедуп name+address (против существующей базы + внутри пакета)
  → геокодинг адресов без координат: Nominatim, ≤1 запрос/сек —
     ровно как runClientsImport() в рантайме; результаты замораживаются
     в scripts/fixtures/task17_geocoded.json (сид — статические данные)
  → добавление в конец массива public/seed/clients.json.

Сегменты владельца маппятся на коды справочника CLIENT_TYPE (models.ts):
шаурмичная→shawarma, кафе→canteen, пиццерия→burger (фастфуд-профиль:
часы 10–22, заказ раз в 7 дней — как у бургерных), остальные 1:1.
Точки без телефона — phone "" (как в задании). Статус — cold (дефолт
parseRow, реальных статусов в данных нет).

Запуск:
  python3 scripts/task17_pack2.py            # геокодинг + валидация + дедуп, отчёт (без записи)
  python3 scripts/task17_pack2.py --apply    # то же + запись в public/seed/clients.json
"""

import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "public" / "seed" / "clients.json"
FIXTURE = ROOT / "scripts" / "fixtures" / "task17_suvorovsky_pack2.json"
GEOCACHE = ROOT / "scripts" / "fixtures" / "task17_geocoded.json"

CITY = "Ростов-на-Дону"
APPLY = "--apply" in sys.argv

# ── Сегменты владельца → коды CLIENT_TYPE (src/types/models.ts) ──────────
TYPE_MAP = {
    "шаурмичная": "shawarma",
    "бургерная": "burger",
    "пиццерия": "burger",   # фастфуд: часы 10–22, частота 7 дней — профиль бургерной
    "кафе": "canteen",
    "кулинария": "canteen",
    "бар": "bar",
    "фудкорт": "foodcourt",
}

DISTRICTS = ["Кировский", "Ворошиловский", "Ленинский", "Октябрьский",
             "Первомайский", "Пролетарский", "Советский", "Железнодорожный"]
CLIENT_TYPES = ["shawarma", "burger", "canteen", "bar", "hookah", "foodcourt", "darkkitchen"]
TIERS = ["green", "yellow", "red"]
STATUSES = ["cold", "no_answer", "callback", "trial", "regular", "refused"]

# ── Дедуп-ключ: точная копия key() из src/lib/import-clients.ts ──────────
STREET_WORDS = {
    "ул", "улица", "просп", "проспект", "пр", "пр-т", "пр-кт",
    "пл", "площадь", "пер", "переулок", "б-р", "бульвар",
    "ш", "шоссе", "наб", "набережная", "проезд", "пр-д",
}

def norm(s: str) -> str:
    out = s.lower().replace("ё", "е")
    for ch in "«»\"'":
        out = out.replace(ch, "")
    return " ".join(out.split()).strip()

def dedup_key(name: str, address: str) -> str:
    a = norm(address)
    a = re.sub(r"\([^)]*\)", " ", a)
    tokens = [t for t in re.split(r"[\s,.\-]+", a) if t and t not in STREET_WORDS]
    return f"{norm(name)}|{''.join(tokens)}"

# ── Nominatim: как geocodeAddress() из src/lib/geocode.ts ────────────────
def nominatim(query: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "5", "accept-language": "ru",
        "addressdetails": "1", "q": f"{query}, {CITY}",
    })
    req = urllib.request.Request(
        url, headers={"User-Agent": "FryFlowSeedPrep/1.0 (fryflow seed preparation)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def street_only(address: str) -> str:
    parts = [p.strip() for p in address.split(",")]
    if len(parts) > 1 and re.search(r"\d", parts[-1]):
        return ", ".join(parts[:-1])
    return address

# широкая зона Ростова (приёмка Nominatim)
ROSTOV = (47.19, 47.36, 39.53, 39.82)

# Санити-зоны валидации по районам (расширены к северу: ул. Юрия Дубинина
# в ЖК Суворовский стоит на 47.3324; Мечникова, 140 — Рабочий городок, 47.237).
VALID_ZONES = {
    "Октябрьский": (47.22, 47.345, 39.63, 39.725),
    "Первомайский": (47.23, 47.345, 39.66, 39.80),
}

# ЖК «Платовский» реально стоит на ул. Тимофеева, Первомайский район,
# берег Ростовского моря (OSM, 2ГИС, Домклик) — «ул. Платовский» не существует.
# Сам владелец в пакете 1 помечал остановку ЖК Платовский как Первомайский
# (точка «Уголёк»), «Октябрьский» у этих трёх строк — ошибка копипаста шаблона.
DISTRICT_FIX = {
    "ЖК Платовский, ул. Платовский, 2": "Первомайский",
    "ЖК Платовский, ул. Платовский, 4": "Первомайский",
    "ЖК Платовский, ул. Платовский, 6": "Первомайский",
}

def in_zone(lat, lng, z) -> bool:
    return z[0] <= lat <= z[1] and z[2] <= lng <= z[3]

def fetch_coords(rows):
    """Геокодинг всех адресов пакета; результат замораживается в кэш."""
    cache = json.loads(GEOCACHE.read_text(encoding="utf-8")) if GEOCACHE.exists() else {}
    for i, r in enumerate(rows):
        addr = r["address"]
        if addr in cache:
            continue
        house = addr.split(",")[-1].strip()
        time.sleep(1.1)  # политика Nominatim: максимум 1 запрос/сек
        found = None
        for q in (addr, street_only(addr)):
            try:
                res = nominatim(q)
            except Exception as e:  # сеть моргнула — попробуем улицу
                print(f"  ! Nominatim ошибка ({e}), пробуем дальше")
                res = []
            for cand in res:
                lat, lng = float(cand["lat"]), float(cand["lon"])
                if in_zone(lat, lng, ROSTOV):
                    first = cand["display_name"].split(",")[0].strip()
                    level = "house" if first == house else "street"
                    found = {
                        "lat": round(lat, 6), "lng": round(lng, 6),
                        "level": level,
                        "display": cand["display_name"][:90],
                        "district_osm": (cand.get("address") or {}).get("city_district", ""),
                    }
                    break
            if found:
                break
        cache[addr] = found
        mark = f"OK {found['lat']},{found['lng']} [{found['level']}]" if found else "НЕ НАЙДЕНО"
        print(f"[{i+1}/{len(rows)}] {r['name']} — {addr}: {mark}")
    GEOCACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    return cache

# ── Якоря-фолбэк для адресов, которых нет в OSM (новая застройка) ────────
# Координаты кластера Суворовского массива сняты с OSM в пакете 1.
ANCHORS = {
    # "ЖК Платовский, ул. Платовский, 2": (47.3170, 39.6740),
}

def jitter(name: str, address: str, lat: float, lng: float, amp=0.0009):
    """Детерминированный разброс точек уличного уровня (~±100 м)."""
    h = hashlib.md5(f"{name}|{address}".encode("utf-8")).digest()
    f1 = (h[0] + h[1] * 256) / 65535 * 2 - 1
    f2 = (h[2] + h[3] * 256) / 65535 * 2 - 1
    return round(lat + f1 * amp, 6), round(lng + f2 * amp * 1.4, 6)

# ── Сборка строк сида ─────────────────────────────────────────────────────
def build_rows(rows, cache):
    out, problems = [], []
    for r in rows:
        ctype = TYPE_MAP.get(r["type"])
        if ctype is None:
            problems.append(f"{r['name']}: неизвестный сегмент «{r['type']}»")
            continue
        addr = r["address"]
        district = DISTRICT_FIX.get(addr, r["district"])
        if district != r["district"]:
            print(f"  ↑ район «{r['district']}» → «{district}» (ЖК Платовский — ул. Тимофеева, берег Ростовского моря)")
        geo = cache.get(addr)
        src = ""
        if geo and in_zone(geo["lat"], geo["lng"], ROSTOV):
            lat, lng = geo["lat"], geo["lng"]
            src = f"nominatim:{geo['level']}"
            if geo["level"] != "house":
                lat, lng = jitter(r["name"], addr, lat, lng)
                src += "+jitter"
        elif addr in ANCHORS:
            lat, lng = ANCHORS[addr]
            lat, lng = jitter(r["name"], addr, lat, lng)
            src = "anchor+jitter"
        else:
            problems.append(f"{r['name']} — {addr}: нет координат (Nominatim молчит, якоря нет)")
            continue
        out.append({
            "name": r["name"],
            "address": addr,
            "district": district,
            "phone": r.get("phone", ""),
            "type": ctype,
            "status": "cold",
            "priority_tier": r["priority_tier"],
            "coordinates": {"lat": lat, "lng": lng},
            "notes": "",
            "_src": src,
        })
    return out, problems

# ── Валидация (правила parseRow из import-clients.ts) ────────────────────
def validate(row):
    errs = []
    if not (2 <= len(row["name"]) <= 120):
        errs.append(f"имя {len(row['name'])} симв.")
    if len(row["address"]) < 3:
        errs.append("адрес короткий")
    if row["district"] not in DISTRICTS:
        errs.append(f"район {row['district']}")
    if row["type"] not in CLIENT_TYPES:
        errs.append(f"тип {row['type']}")
    if row["status"] not in STATUSES:
        errs.append(f"статус {row['status']}")
    if row["priority_tier"] not in TIERS:
        errs.append(f"приоритет {row['priority_tier']}")
    la, ln = row["coordinates"]["lat"], row["coordinates"]["lng"]
    zone = VALID_ZONES.get(row["district"])
    if zone and not in_zone(la, ln, zone):
        errs.append(f"координаты вне зоны {row['district']}: {la},{ln}")
    return errs

# ── main ──────────────────────────────────────────────────────────────────
def main():
    rows = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert len(rows) == 25, f"в фикстуре {len(rows)} строк, ожидается 25"
    existing = json.loads(SEED.read_text(encoding="utf-8"))
    print(f"Фикстура: {len(rows)} точек; сид сейчас: {len(existing)} точек\n")

    print("── Геокодинг (Nominatim, ≤1 запрос/сек) ──")
    cache = fetch_coords(rows)
    missed = [a for a, v in cache.items() if not v]
    if missed:
        print(f"Без координат после геокодинга: {len(missed)}")
        for a in missed:
            print(f"  • {a}")

    new_rows, problems = build_rows(rows, cache)
    if problems:
        print("\nПроблемы сборки:")
        for p in problems:
            print(f"  ! {p}")

    print("\n── Валидация ──")
    errors = []
    for i, r in enumerate(new_rows):
        for e in validate(r):
            errors.append(f"строка {i+1} ({r['name']}): {e}")
    if errors:
        print("ОШИБКИ ВАЛИДАЦИИ:")
        for e in errors:
            print(f"  × {e}")
    else:
        print("Все строки прошли правила parseRow — ошибок нет")

    print("\n── Дедуп name+address ──")
    existing_keys = {dedup_key(c["name"], c["address"]) for c in existing}
    pack_keys, dups, final = set(), [], []
    for r in new_rows:
        k = dedup_key(r["name"], r["address"])
        if k in pack_keys or k in existing_keys:
            dups.append(f"{r['name']} — {r['address']}")
        else:
            pack_keys.add(k)
            final.append(r)
    if dups:
        print(f"Дубликатов: {len(dups)} (пропускаем):")
        for d in dups:
            print(f"  = {d}")
    else:
        print("Дубликатов нет — ни против базы, ни внутри пакета")

    print(f"\nИтог: добавится {len(final)} из 25; сид: {len(existing)} → {len(existing) + len(final)}")
    okt_before = sum(1 for c in existing if c["district"] == "Октябрьский")
    okt_after = okt_before + len(final)
    print(f"Октябрьский район: {okt_before} → {okt_after} точек")
    for r in final:
        print(f"  + {r['name']} — {r['address']} [{r['priority_tier']}] "
              f"{r['coordinates']['lat']},{r['coordinates']['lng']} ({r['_src']})")

    if not APPLY:
        print("\n(режим отчёта; для записи запустите с --apply)")
        return
    if errors or problems:
        print("\nЗАПИСЬ ОТМЕНЕНА — есть ошибки сборки/валидации")
        sys.exit(1)
    if not final:
        print("\nДобавлять нечего — сид не меняем")
        return
    for r in final:
        r.pop("_src")
    merged = existing + final
    SEED.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nЗАПИСАНО: {len(existing)} + {len(final)} = {len(merged)} точек в public/seed/clients.json")

if __name__ == "__main__":
    main()
