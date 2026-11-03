#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Задача 18A: замена 50 сгенерированных точек пакета 1 на 67 реальных.

Источник реальных данных — scripts/fixtures/task16_suvorovsky_pack1_real.json
(точный список владельца: Суворовский/Каменка/Военвед, Октябрьский район
+ «Уголёк» на остановке ЖК Платовский, Первомайский).

Шаги:
  1. Из public/seed/clients.json удаляются 50 строк, сгенерированных
     в задаче 16 скриптом make_suvorovsky_pack.py (строки 173..222,
     проверяются по точному списку name+address — никаких случайных
     удалений).
  2. 67 реальных строк проходят тот же конвейер, что и пакет 2:
     валидация (правила parseRow из import-clients.ts) → маппинг
     сегментов на коды справочника → геокодинг Nominatim (≤1 запрос/сек,
     срезка примечаний в скобках, приоритет кандидата с районом OSM,
     совпадающим с районом строки; кэш — scripts/fixtures/task18_geocoded.json)
     → дедуп name+address против оставшихся 198 точек и внутри пакета.
  3. Прошедшие добавляются в конец массива clients.json.

Координаты: точному (домовому) попаданию Nominatim добавляется
детерминированный мини-джиттер ±40 м — иначе 6 точек ТЦ Суворовский
(Петренко, 1 и 3) встают стопкой друг на друге и на карте видна одна.

Запуск:
  python3 scripts/task18_pack1_real.py            # геокодинг + отчёт (без записи)
  python3 scripts/task18_pack1_real.py --apply    # + запись в clients.json
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
FIXTURE = ROOT / "scripts" / "fixtures" / "task16_suvorovsky_pack1_real.json"
GEOCACHE = ROOT / "scripts" / "fixtures" / "task18_geocoded.json"

CITY = "Ростов-на-Дону"
APPLY = "--apply" in sys.argv

# ── 50 сгенерированных строк пакета 1 (make_suvorovsky_pack.py, задача 16) ──
GENERATED = [
    ("Шаурма на Измайловском", "бул. Измайловский, 14"),
    ("Гриль-Пойнт Суворовский", "ул. Уланская, 23"),
    ("Уста-Кебаб 2", "ул. Драгунская, 22"),
    ("Дымный Кебаб 3", "ул. Сосновая, 8"),
    ("Шаурма «Лазоревая»", "2-й Лазоревый пер., 25"),
    ("Восток Дона 2", "5-й Лазоревый пер., 35"),
    ("Король Кебаба 2", "ул. Платона Кляты, 34"),
    ("Халяль-Сити 2", "ул. Петренко, 28"),
    ("Шаурма-Мастер 2", "ул. Висаитова, 12"),
    ("Шаурма Восход 2", "пер. Белоусова, 14"),
    ("Уличный Гриль 22", "пер. Андреева, 19"),
    ("Кебаб Хаус 2", "ул. 1-я Процветания, 4"),
    ("Бургерная «Плот» 2", "ул. 3-я Процветания, 10"),
    ("МясЦех 2", "ул. 5-я Процветания, 6"),
    ("Смэш-Пойнт 2", "ул. 2-я Сувенирная, 5"),
    ("Бургер-Лаб 2", "ул. 4-я Сувенирная, 13"),
    ("Столовая «Суворовская»", "ул. Северная, 22"),
    ("Трапезная «Домашняя» 2", "ул. Соборная, 15"),
    ("Гараж-Бар 2", "ул. Благодатная, 4"),
    ("Шиша-Лаунж 2", "ул. Культурная, 14"),
    ("Сити-Фуд 2", "ул. Тихая, 3"),
    ("Стрит-Фуд Пойнт 2", "пр. Торговый, 1"),
    ("Фудкорт «Торговый»", "ул. Свободы, 26"),
    ("Дарк-Китчен «Бокс» 2", "ул. Веры, 6"),
    ("Кухня-Призрак 2", "ул. Надежды, 22"),
    ("Дарк-Флоу 8", "ул. Семейная, 1"),
    ("Шаурма «Каменка»", "ул. Тульская, 32"),
    ("Кебаб на Таганрогской", "ул. Таганрогская, 115"),
    ("Шаурма на Ташкентской", "ул. Ташкентская, 8"),
    ("Светлана-Гриль 2", "ул. Тюменская, 20"),
    ("Планета Шаурмы 2", "ул. Севастопольская, 75"),
    ("Бараний Рог 2", "ул. Рахманинова, 57"),
    ("Сырный Двор 2", "ул. Тарновского-Терлецкого, 45"),
    ("Мидл-Байт 2", "ул. Борисоглебская, 16"),
    ("Обед-Экспресс 2", "ул. Иловайская, 14"),
    ("Комплекс-Обед 2", "ул. Куликовская, 6"),
    ("Лофт-Бар 2", "ул. Тракторная, 14"),
    ("Мята-Лаундж 2", "ул. 2-й Пятилетки, 14"),
    ("Гастро-Ряд 2", "ул. Монтажная, 2"),
    ("Гост-Китчен 2", "Чалтырский пер., 12"),
    ("Гриль у Ландшафтной", "ул. Ландшафтная, 12"),
    ("Шаурма Военвед", "ул. Тимошко, 29"),
    ("Мясной Двор 2", "ул. Таганрогская, 164"),
    ("Крафт Бургер 12", "ул. Гагринская, 14"),
    ("Бургер Хаус 7", "ул. Дебальцевская, 27"),
    ("Столовая Строитель 2", "ул. Соловьиная, 21"),
    ("Столовая «Военведская»", "ул. Витебская, 39"),
    ("Паб «Донской» 2", "ул. Самаркандская, 26"),
    ("Хаус-оф-Шиша 2", "Железногорский пер., 1"),
    ("Ночной Цех 2", "ул. Мыльникова, 9"),
]

# ── Сегменты владельца → коды CLIENT_TYPE (как в задаче 17) ──────────────
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
    a = re.sub(r"\([^)]*\)", " ", norm(address))
    tokens = [t for t in re.split(r"[\s,.\-]+", a) if t and t not in STREET_WORDS]
    return f"{norm(name)}|{''.join(tokens)}"

# ── Nominatim (как geocodeAddress из src/lib/geocode.ts) ─────────────────
ROSTOV = (47.19, 47.36, 39.53, 39.82)
VALID_ZONES = {
    "Октябрьский": (47.22, 47.345, 39.63, 39.725),
    "Первомайский": (47.23, 47.345, 39.66, 39.80),
    "Кировский": (47.19, 47.25, 39.69, 39.78),
}

# Ул. Суворова (дома 19–74А) — реальная улица в ЦЕНТРЕ Ростова, Кировский
# район (Яндекс: 47.2253, 39.7269; OSM: Кировский). Заведения с нее
# подтверждаются публичными источниками: The Bebop Burgers «Суворова, 19»
# (телефон из списка владельца +7 (863) 308-48-50 совпадает с публичным),
# Shaurma Bushido «Суворова, 52А» (Яндекс.Карты). Улица «Суворова» — не
# микрорайон «Суворовский»: «Октябрьский» у этих 11 строк — ошибка источника,
# координаты Nominatim верные. Район исправляем, иначе 11 маркеров у центра
# города растянут карту Октябрьского района.
DISTRICT_FIX = {a: "Кировский" for a in [
    "ул. Суворова, 52А",
    "ул. Суворова, 74А",
    "ул. Суворова, 19/21",
    "ул. Суворова, 21",
    "ул. Суворова, 21/28",
    "ул. Суворова, 42, пав. 8",
    "ул. Суворова, 52Б",
    "ул. Суворова, 52а (киоск)",
]}

# Якоря для адресов, которых нет в OSM (новая застройка/остановки).
# Координаты ЖК «Платовский» — из задачи 17 (Nominatim: ул. Тимофеева).
# Белоусова 4/1а — строение при доме 4, Оганова 7/1 — при доме 7
# (Nominatim домов не знает, уличный центроид даёт промах на ~1 км).
ANCHORS = {
    "остановка ЖК Платовский (Платовский)": (47.318412, 39.791415),
    "пер. Белоусова, 4/1а": (47.321799, 39.683923),
    "ул. Оганова, 7/1 (киоск)": (47.266445, 39.665266),
}

def in_zone(lat, lng, z) -> bool:
    return z[0] <= lat <= z[1] and z[2] <= lng <= z[3]

def nominatim(query: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "5", "accept-language": "ru",
        "addressdetails": "1", "q": f"{query}, {CITY}",
    })
    req = urllib.request.Request(
        url, headers={"User-Agent": "FryFlowSeedPrep/1.0 (fryflow seed preparation)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def strip_parens(s: str) -> str:
    """Примечания в скобках не мешают поиску: «Петренко, 3 (ТЦ Суворовский)» → «Петренко, 3»."""
    return " ".join(re.sub(r"\([^)]*\)", " ", s).replace(",", " , ").split()).replace(" , ", ", ")

def street_only(address: str) -> str:
    parts = [p.strip() for p in address.split(",")]
    if len(parts) > 1 and re.search(r"\d", parts[-1]):
        return ", ".join(parts[:-1])
    return address

def osm_district_of(cand) -> str:
    d = (cand.get("address") or {}).get("city_district", "") or ""
    return re.sub(r"\s*район$", "", d).strip()

def fetch_coords(rows):
    """Геокодинг с приоритетом кандидата из района строки; кэш на диск."""
    cache = json.loads(GEOCACHE.read_text(encoding="utf-8")) if GEOCACHE.exists() else {}
    for i, r in enumerate(rows):
        addr = r["address"]
        if addr in cache:
            continue
        want_district = r["district"]
        time.sleep(1.1)  # политика Nominatim: максимум 1 запрос/сек
        base = strip_parens(addr)
        queries = [base]
        so = strip_parens(street_only(addr))
        if so != base:
            queries.append(so)
        found = None
        for q in queries:
            try:
                res = nominatim(q)
            except Exception as e:
                print(f"  ! Nominatim ошибка ({e})")
                res = []
            in_rostov = [c for c in res if in_zone(float(c["lat"]), float(c["lon"]), ROSTOV)]
            # сначала кандидат из нужного района, потом любой ростовский
            pick = next((c for c in in_rostov if osm_district_of(c) == want_district), None) \
                or (in_rostov[0] if in_rostov else None)
            if pick:
                first = pick["display_name"].split(",")[0].strip()
                house = addr.split(",")[-1].strip()
                level = "house" if first == house else "street"
                found = {
                    "lat": round(float(pick["lat"]), 6), "lng": round(float(pick["lon"]), 6),
                    "level": level,
                    "display": pick["display_name"][:90],
                    "district_osm": osm_district_of(pick),
                }
                break
        cache[addr] = found
        mark = f"OK {found['lat']},{found['lng']} [{found['level']}] {found['district_osm']}" if found else "НЕ НАЙДЕНО"
        print(f"[{i+1}/{len(rows)}] {r['name']} — {addr}: {mark}")
    GEOCACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    return cache

def jitter(name: str, address: str, lat: float, lng: float, amp: float):
    """Детерминированный разброс: домовому уровню ±40 м (не стопкой у ТЦ),
    уличному ±100 м — точка всё равно стоит на своей улице."""
    h = hashlib.md5(f"{name}|{address}".encode("utf-8")).digest()
    f1 = (h[0] + h[1] * 256) / 65535 * 2 - 1
    f2 = (h[2] + h[3] * 256) / 65535 * 2 - 1
    return round(lat + f1 * amp, 6), round(lng + f2 * amp * 1.4, 6)

def build_rows(rows, cache):
    out, problems, mism = [], [], []
    for r in rows:
        ctype = TYPE_MAP.get(r["type"])
        if ctype is None:
            problems.append(f"{r['name']}: неизвестный сегмент «{r['type']}»")
            continue
        addr = r["address"]
        district = DISTRICT_FIX.get(addr, r["district"])
        if district != r["district"]:
            print(f"  ↑ район «{r['district']}» → «{district}» (ул. Суворова — центр города, Кировский)")
        geo = cache.get(addr)
        if geo and geo.get("district_osm") and geo["district_osm"] != r["district"]:
            mism.append(f"{r['name']} — {addr}: у владельца «{r['district']}», по OSM «{geo['district_osm']}»")
        src = ""
        if geo and in_zone(geo["lat"], geo["lng"], ROSTOV):
            amp = 0.00035 if geo["level"] == "house" else 0.0009
            lat, lng = jitter(r["name"], addr, geo["lat"], geo["lng"], amp)
            src = f"nominatim:{geo['level']}" + ("+mini" if geo["level"] == "house" else "+jitter")
        elif addr in ANCHORS:
            lat, lng = jitter(r["name"], addr, *ANCHORS[addr], amp=0.00035)
            src = "anchor"
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
    return out, problems, mism

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
    zone = VALID_ZONES.get(row["district"])
    la, ln = row["coordinates"]["lat"], row["coordinates"]["lng"]
    if zone and not in_zone(la, ln, zone):
        errs.append(f"координаты вне зоны {row['district']}: {la},{ln}")
    return errs

def main():
    rows = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert len(rows) == 67, f"в фикстуре {len(rows)} строк, ожидается 67"
    data = json.loads(SEED.read_text(encoding="utf-8"))
    assert len(data) == 248, f"в сиде {len(data)} строк, ожидается 248"

    # ── Шаг 1: вырезать сгенерированные 50 (строки 173..222) с проверкой ──
    segment = data[173:223]
    assert len(segment) == 50
    for i, (row, (gname, gaddr)) in enumerate(zip(segment, GENERATED)):
        assert row["name"] == gname and row["address"] == gaddr, \
            f"строка {173+i} не совпала с генерированной: {row['name']} | {row['address']} ≠ {gname} | {gaddr}"
    remaining = data[:173] + data[223:]
    print(f"Проверка: строки 173..222 — ровно 50 сгенерированных точек пакета 1, удаляем")
    print(f"Остаётся: {len(remaining)} точек (база 173 + пакет 2 × 25)")

    # ── Шаг 2: геокодинг 67 реальных ──
    print("\n── Геокодинг (Nominatim, ≤1 запрос/сек, приоритет району строки) ──")
    cache = fetch_coords(rows)
    missed = [a for a, v in cache.items() if not v]
    if missed:
        print(f"\nБез координат: {len(missed)}")
        for a in missed:
            print(f"  • {a}")

    new_rows, problems, mism = build_rows(rows, cache)
    if problems:
        print("\nПроблемы сборки:")
        for p in problems:
            print(f"  ! {p}")
    if mism:
        print("\nРасхождения района с OSM (оставляем как у владельца):")
        for m in mism:
            print(f"  ≈ {m}")

    print("\n── Валидация ──")
    errors = []
    for i, r in enumerate(new_rows):
        for e in validate(r):
            errors.append(f"строка {i+1} ({r['name']}): {e}")
    print("Ошибок нет" if not errors else "ОШИБКИ ВАЛИДАЦИИ:\n" + "\n".join(errors))

    print("\n── Дедуп name+address (против оставшихся 198 + внутри пакета) ──")
    existing_keys = {dedup_key(c["name"], c["address"]) for c in remaining}
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
        print("Дубликатов нет")

    total = len(remaining) + len(final)
    print(f"\nИтог: −50 сгенерированных, +{len(final)} реальных; сид: 248 → {total}")
    okt = sum(1 for c in remaining if c["district"] == "Октябрьский") + \
          sum(1 for c in final if c["district"] == "Октябрьский")
    print(f"Октябрьский район: {sum(1 for c in data if c['district'] == 'Октябрьский')} → {okt}")
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
    merged = remaining + final
    SEED.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nЗАПИСАНО: {len(remaining)} + {len(final)} = {len(merged)} точек в public/seed/clients.json")

if __name__ == "__main__":
    main()
