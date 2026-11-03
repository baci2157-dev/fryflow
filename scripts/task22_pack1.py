#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Задача 22, часть A: Ворошиловский район — 35 реальных точек владельца.

Север города: проспект Космонавтов, проспект Королёва, Добровольского,
Волкова, Пацаева, Орбитальная, бульвар Комарова, Ленина, Евдокимова,
Ворошиловский проспект, Соколова, 1-я Ковровая, Мадояна. Существующие
19 точек Ворошиловского — юг района (Соколова/Шолохова/Соборный),
пересечений по name+address нет.

Конвейер тот же, что в задачах 17–21:
  валидация (правила parseRow из import-clients.ts)
  → маппинг сегментов владельца на коды CLIENT_TYPE
  → геокодинг Nominatim (≤1 запрос/сек, таймаут 6 с; из адреса срезается
    шум, улицы раскрываются в полные слова; два этапа — охота за точным
    домом/POI по цепочке запросов, затем уличный фолбэк — медианный
    сегмент улицы; кэш — scripts/fixtures/task22_geocoded.json,
    предсемпл из задачи 21)
  → дедуп name+address против всех 421 точек базы и внутри пакета
  → добавление в конец public/seed/clients.json.

Координаты: домовому/POI-попаданию — мини-джиттер ±40 м, уличному —
±100 м. Промахи Nominatim не выдумываем: строка честно пропускается
и попадает в отчёт (как улицы Ковалёва в задаче 21).

Пробы (scripts/task22_probe.py) — три правки по фактическим данным:
  • «ул. Ленина, 105» → в Ростове есть ПРОСПЕКТ Ленина (мкр Дачный,
    Ворошиловский район) — дом 105 существует, это он и есть;
  • «ул. Соколова, 80» → в OSM улица Соколова не существует, есть
    ПРОСПЕКТ Соколова — дом 80 существует (47.233, 39.718);
  • «ул. 1-я Ковровая» — в городе таких улиц нет, только дачные
    1–6-я Ковровая улицы СНТ «Изумруд» (Каратаево, Советский район,
    39.566 — край города): шаурмичная в СНТ — адрес-фантом из списка
    владельца, строку пропускаем, координаты не выдумываем;
  • «ул. Мадояна, 60» — реальный дом, но улица в Олимпиадовке
    (Железнодорожный район): точка встаёт на реальное место, район
    фактический (прецедент Баррикадных из задачи 21).

Запуск:
  python3 scripts/task22_pack1.py            # геокодинг + валидация + дедуп, отчёт
  python3 scripts/task22_pack1.py --apply    # то же + запись в clients.json
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
FIXTURE = ROOT / "scripts" / "fixtures" / "task22_voroshilovsky_pack1.json"
GEOCACHE = ROOT / "scripts" / "fixtures" / "task22_geocoded.json"
GEOCACHE_PREV = ROOT / "scripts" / "fixtures" / "task21_geocoded.json"

CITY = "Ростов-на-Дону"
APPLY = "--apply" in sys.argv

# ── Сегменты владельца → коды CLIENT_TYPE (src/types/models.ts) ──────────
TYPE_MAP = {
    "шаурмичная": "shawarma",
    "бургерная": "burger",
    "пиццерия": "burger",   # фастфуд: часы 10–22, частота 7 дней — профиль бургерной
    "кафе": "canteen",
    "кулинария": "canteen",
    "столовая": "canteen",
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
ROSTOV = (47.18, 47.37, 39.49, 39.83)

# Санити-зона Ворошиловского: юг района — Соколова/Шолохова/Соборный
# (bbox существующих 19 точек: lat 47.22–47.255, lng 39.708–39.724),
# север — Северный массив (Космонавтов/Комарова/Добровольского/Евдокимова,
# lat 47.27–47.30, lng 39.69–39.72). Зона щедрая: южный край проспекта
# Ворошиловского и пр. Соколова (дома 45/67/80) OSM относит к Кировскому
# району — это граница, у владельца и существующих точек базы — Ворошиловский.
VALID_ZONES = {
    "Ворошиловский": (47.205, 47.325, 39.585, 39.745),
    # для Мадояна, 60 — точка уходит в Олимпиадовку, зона из задачи 21
    "Железнодорожный": (47.19, 47.28, 39.62, 39.78),
}

# Пробы task22_probe: владелец пишет «ул.», в OSM это проспекты —
# без разворота сокращения дома не находятся.
QUERY_ALIASES = {
    "ул. Ленина, 105": "проспект Ленина, 105",
    "ул. Соколова, 80": "проспект Соколова, 80",
}

# Улица Мадояна фактически в Олимпиадовке — Железнодорожный район
# (владелец записал в Ворошиловский по ошибке). Прецедент — 1-я/2-я
# Баррикадная из задачи 21: точка на реальное место, район фактический.
OVERRIDE_DISTRICT = {
    "ул. Мадояна, 60": "Железнодорожный",
}

# Адрес-фантом: в городе нет улицы 1-я Ковровая — только дачные улицы
# СНТ «Изумруд» (Каратаево, 39.566 — край города). Шаурмичная в СНТ —
# ошибка списка владельца; строку пропускаем, координаты не выдумываем.
SKIP_ADDRESSES = {"ул. 1-я Ковровая, 65/1"}

ANCHORS = {}

def in_zone(lat, lng, z) -> bool:
    return z[0] <= lat <= z[1] and z[2] <= lng <= z[3]

def nominatim(query: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "6", "accept-language": "ru",
        "addressdetails": "1", "q": f"{query}, {CITY}",
    })
    req = urllib.request.Request(
        url, headers={"User-Agent": "FryFlowSeedPrep/1.0 (fryflow seed preparation)"})
    # Таймаут 6 с — как AbortController в рантайм-геокодинге задачи 19.5.
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.load(r)

def strip_parens(s: str) -> str:
    return " ".join(re.sub(r"\([^)]*\)", " ", s).replace(",", " , ").split()).replace(" , ", ", ")

STREET_START = re.compile(
    r"^(ул|улица|пр-кт|пр-т|просп|проспект|пр|пер|переулок|б-р|бул|бульвар|"
    r"ш|шоссе|наб|набережная|пл|площадь)[\.\s]", re.IGNORECASE)
STREET_END = re.compile(
    r"(ул|улица|пр-кт|пр-т|просп|проспект|пр|пер|переулок|б-р|бул|бульвар|"
    r"ш|шоссе|наб|набережная|пл|площадь)[\.\s]?$", re.IGNORECASE)

STREET_WORD_FULL = {
    "ул": "улица", "улица": "улица", "просп": "проспект", "проспект": "проспект",
    "пр": "проспект", "пр-т": "проспект", "пр-кт": "проспект",
    "пер": "переулок", "переулок": "переулок", "б-р": "бульвар", "бул": "бульвар",
    "бульвар": "бульвар", "ш": "шоссе", "шоссе": "шоссе",
    "наб": "набережная", "набережная": "набережная",
    "пл": "площадь", "площадь": "площадь", "проезд": "проезд", "пр-д": "проезд",
}

def expand_street(part: str) -> str:
    out = []
    for w in part.split():
        key = w.strip(".,").lower()
        out.append(STREET_WORD_FULL.get(key, w) if not any(c.isdigit() for c in w) else w)
    return " ".join(out)

def clean_query(addr: str):
    s = strip_parens(addr)
    parts = [p.strip() for p in s.split(",") if p.strip()]
    for i, p in enumerate(parts):
        if STREET_START.match(p) or STREET_END.search(p):
            street = expand_street(p)
            keep, house = [street], ""
            if i + 1 < len(parts) and re.search(r"\d", parts[i + 1]):
                house = parts[i + 1]
                keep.append(house)
            return ", ".join(keep), house
    return expand_street(s), ""

def house_fallbacks(house: str):
    outs, h = [], house
    for pat in (r"\s*ст\d+\s*$", r"\s*с\d+\s*$", r"\s*к\s*\d+$", r"/\d+$", r"(?<=\d)[а-яёА-ЯЁ]+$"):
        h2 = re.sub(pat, "", h).strip()
        if h2 and h2 != h:
            outs.append(h2)
            h = h2
    return outs

def query_chain(addr: str):
    q, house = clean_query(addr)
    chain = [q]
    for fb in house_fallbacks(house):
        cand = q[: -(len(house))] + fb if q.endswith(house) else q
        if cand not in chain:
            chain.append(cand)
    street = re.sub(r"[^,]+$", "", q).strip().rstrip(",").strip()
    return chain, house, street

def house_match(token: str, house: str) -> bool:
    t = token.lower().replace(" ", "")
    h = house.lower().replace(" ", "")
    if not h or not any(c.isdigit() for c in h):
        return False
    if t == h:
        return True
    return t.startswith(h) and not t[len(h):len(h) + 1].isdigit()

def is_precise(cand, q: str) -> bool:
    qhouse = q.split(",")[-1].strip()
    tokens = [t.strip() for t in cand["display_name"].split(",")[:2]]
    return any(house_match(t, qhouse) for t in tokens)

def osm_district_of(cand) -> str:
    d = (cand.get("address") or {}).get("city_district", "") or ""
    return re.sub(r"\s*район$", "", d).strip()

def in_rostov_of(cands):
    return [c for c in cands if in_zone(float(c["lat"]), float(c["lon"]), ROSTOV)]

def pick_from(cands, want_district):
    in_rostov = in_rostov_of(cands)
    if not in_rostov:
        return None, []
    pref = [c for c in in_rostov if osm_district_of(c) == want_district] or in_rostov
    return pref[0], pref

def median_street_pick(cands, want_district):
    pick, pref = pick_from(cands, want_district)
    if not pick or len(pref) < 2:
        return pick
    lats = sorted(float(c["lat"]) for c in pref)
    lngs = sorted(float(c["lon"]) for c in pref)
    med = (lats[len(lats) // 2], lngs[len(lngs) // 2])
    def dist(c):
        return abs(float(c["lat"]) - med[0]) + abs(float(c["lon"]) - med[1]) * 0.68
    return min(pref, key=dist)

def fetch_coords(rows):
    """Два этапа: охота за домом/POI по цепочке запросов, затем уличный фолбэк."""
    cache = json.loads(GEOCACHE.read_text(encoding="utf-8")) if GEOCACHE.exists() else {}
    if GEOCACHE_PREV.exists():  # Соколова/Ворошиловский пр. могли геокодиться раньше
        cache.update({k: v for k, v in json.loads(GEOCACHE_PREV.read_text(encoding="utf-8")).items()
                      if k in {r["address"] for r in rows}})
    for i, r in enumerate(rows):
        addr = r["address"]
        if addr in cache:
            continue
        want = r["district"]
        chain, house0, street_q = query_chain(QUERY_ALIASES.get(addr, addr))
        found = None
        # ── Этап 1: точный дом/POI (полный адрес, затем упрощённые дома).
        # Точность важнее района: настоящий дом берём, район владельца не трогаем.
        for q in chain:
            time.sleep(1.1)  # политика Nominatim: максимум 1 запрос/сек
            try:
                res = nominatim(q)
            except Exception as e:
                print(f"  ! Nominatim ошибка ({e})")
                res = []
            in_rostov = in_rostov_of(res)
            precise = [c for c in in_rostov if is_precise(c, q)]
            if precise:
                pick = next((c for c in precise if osm_district_of(c) == want), precise[0])
                found = {
                    "lat": round(float(pick["lat"]), 6), "lng": round(float(pick["lon"]), 6),
                    "level": "house",
                    "display": pick["display_name"][:90],
                    "district_osm": osm_district_of(pick),
                    "q": q,
                }
                break
        # ── Этап 2: уличный фолбэк — медианный сегмент. ──
        if found is None and (street_q or not house0):
            sq = street_q or chain[-1]
            time.sleep(1.1)
            try:
                res = nominatim(sq)
            except Exception as e:
                print(f"  ! Nominatim ошибка ({e})")
                res = []
            pick = median_street_pick(res, want)
            if pick:
                found = {
                    "lat": round(float(pick["lat"]), 6), "lng": round(float(pick["lon"]), 6),
                    "level": "street",
                    "display": pick["display_name"][:90],
                    "district_osm": osm_district_of(pick),
                    "q": sq,
                }
        cache[addr] = found
        mark = (f"OK {found['lat']},{found['lng']} [{found['level']}] {found['district_osm']} ←«{found['q']}»"
                if found else "НЕ НАЙДЕНО")
        print(f"[{i+1}/{len(rows)}] {r['name']} — {addr}: {mark}")
    GEOCACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    return cache

def jitter(name: str, address: str, lat: float, lng: float, amp: float):
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
        district = OVERRIDE_DISTRICT.get(addr, r["district"])
        geo = cache.get(addr)
        if geo and geo.get("district_osm") and geo["district_osm"] != district:
            mism.append(f"{r['name']} — {addr}: у владельца «{district}», по OSM «{geo['district_osm']}»")
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
    existing = json.loads(SEED.read_text(encoding="utf-8"))
    assert len(existing) == 421, f"в сиде {len(existing)} строк, ожидается 421"

    rows = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert len(rows) == 35, f"в фикстуре {len(rows)} строк, ожидается 35"
    skipped = [r for r in rows if r["address"] in SKIP_ADDRESSES]
    rows = [r for r in rows if r["address"] not in SKIP_ADDRESSES]
    print(f"Задача 22, часть A: Ворошиловский — 35 точек владельца; "
          f"сид сейчас: {len(existing)} точек (Ворошиловский: "
          f"{sum(1 for c in existing if c['district'] == 'Ворошиловский')})")
    for r in skipped:
        print(f"  ПРОПУСК (адрес-фантом): {r['name']} — {r['address']} — в городе только дачные улицы СНТ, координаты не выдумываем")
    print(f"Геокодим {len(rows)} из 35; ожидание: дублей по name+address нет, добавится до {len(rows)}\n")

    print("── Геокодинг (Nominatim, ≤1 запрос/сек, таймаут 6 с; дом → уличный фолбэк) ──")
    cache = fetch_coords(rows)
    missed = [a for a, v in cache.items() if not v]
    if missed:
        print(f"\nБез координат: {len(missed)}")
        for a in missed:
            print(f"  • {a}")
    n_house = sum(1 for a, v in cache.items() if v and v.get("level") == "house")
    n_street = sum(1 for a, v in cache.items() if v and v.get("level") == "street")
    print(f"Точность: {n_house} домов/POI, {n_street} уличных фолбэков, {len(missed)} промахов")

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

    print("\n── Дедуп name+address (против 421 базы + внутри пакета) ──")
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
        print("Дубликатов нет")

    total = len(existing) + len(final)
    before = sum(1 for c in existing if c["district"] == "Ворошиловский")
    after = before + sum(1 for r in final if r["district"] == "Ворошиловский")
    n_zhd = sum(1 for r in final if r["district"] == "Железнодорожный")
    print(f"\nИтог: +{len(final)} из 34 геокодируемых (1 пропуск); сид: {len(existing)} → {total}")
    print(f"Ворошиловский район: {before} → {after} точек"
          + (f"; +{n_zhd} в Железнодорожный (Мадояна — район фактический)" if n_zhd else ""))

    print("\n── Покрытие улиц (новые точки) ──")
    streets = ["Космонавтов", "Королёва", "Добровольского", "Волкова", "Пацаева",
               "Орбитальная", "Комарова", "Ленина", "Евдокимова", "Ворошиловский",
               "Соколова", "Мадояна"]
    for st in streets:
        pts = [r for r in final if st.lower() in r["address"].lower()]
        print(f"  {st}: {len(pts)} точек")

    print("\n── Bbox новых точек (сверка санити-зоны) ──")
    if final:
        pts = [r["coordinates"] for r in final]
        lats = [p["lat"] for p in pts]; lngs = [p["lng"] for p in pts]
        print(f"Ворошиловский (новые): lat {min(lats):.4f}–{max(lats):.4f}, lng {min(lngs):.4f}–{max(lngs):.4f}")
    for r in final:
        print(f"  + {r['name']} — {r['address']} [{r['priority_tier']}] "
              f"{r['coordinates']['lat']},{r['coordinates']['lng']} ({r['_src']})")

    if not APPLY:
        print("\n(режим отчёта; для записи запустите с --apply)")
        return
    if problems:
        print(f"\nВНИМАНИЕ: {len(problems)} строк без координат — в базу не попадут:")
        for p in problems:
            print(f"  ! {p}")
    if errors:
        print("\nЗАПИСЬ ОТМЕНЕНА — есть ошибки валидации")
        sys.exit(1)
    if not final:
        print("\nДобавлять нечего — сид не меняем")
        return
    for r in final:
        r.pop("_src")
    merged = existing + final
    assert len(merged) == 421 + len(final)
    SEED.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nЗАПИСАНО: {len(existing)} + {len(final)} = {len(merged)} точек в public/seed/clients.json")

if __name__ == "__main__":
    main()
