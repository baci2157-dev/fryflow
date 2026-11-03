#!/usr/bin/env python3
"""Задача 24, блок 1.2 — финал: правка public/seed/clients.json + печать
таблицы для миграции src/lib/data-migrations.ts.

Правки:
  • 14 точек пр. Соколова: «ул.» → «пр.», район → Кировский (по Nominatim),
    координаты: дом-точки Nominatim (27/42/47/80), остальные — интерполяция
    вдоль северного участка улицы (между домом 80 и северным концом).
  • «Штефан Бургер (ул. Королёва, 51)» → пр. Королёва, 51: телефон сети
    +7 (863) 229-54-54 (2ГИС, подтверждено Яндекс.Картами/zoon), координаты
    сегмента проспекта (reverse-проверка: проспект Королёва, Ворошиловский).
  • «Советский район» → «Советский» (2 строки).
Jitter — детерминированный, как в задаче 22 (md5(name|address)).
"""
import hashlib, json, re, sys

SEED = "public/seed/clients.json"

A27 = (47.225267, 39.720146)
A42 = (47.225213, 39.720447)
A47 = (47.227989, 39.718985)
A80 = (47.232973, 39.717661)
END = (47.2355, 39.7161)  # северный конец пр. Соколова (сегмент Nominatim)

def interp(n: int):
    """Позиция дома n вдоль улицы (анкеры — дом-точки, 90+ — северный участок)."""
    if n <= 27: return A27
    if n <= 42: t = (n-27)/15; return tuple(A27[i]+t*(A42[i]-A27[i]) for i in range(2))
    if n <= 47: t = (n-42)/5;  return tuple(A42[i]+t*(A47[i]-A42[i]) for i in range(2))
    if n <= 80: t = (n-47)/33; return tuple(A47[i]+t*(A80[i]-A47[i]) for i in range(2))
    t = min((n-80)/85.0, 1.0); return tuple(A80[i]+t*(END[i]-A80[i]) for i in range(2))

def jitter(name: str, address: str, lat: float, lng: float, amp: float):
    h = hashlib.md5(f"{name}|{address}".encode("utf-8")).digest()
    f1 = (h[0] + h[1]*256)/65535*2 - 1
    f2 = (h[2] + h[3]*256)/65535*2 - 1
    return round(lat + f1*amp, 6), round(lng + f2*amp*1.4, 6)

HOUSE_EXACT = {27, 42, 47, 80}
KOROLEVA51 = (47.2955283, 39.7140256)

def sokolova_new(n: int):
    return f"пр. Соколова, {n}"

rows = json.load(open(SEED, encoding="utf-8"))
changes = []
for r in rows:
    addr = r.get("address") or ""
    name = r.get("name") or ""
    m = re.match(r"^(?:ул|пр)\. Соколова, (\d+)$", addr)
    if m:
        n = int(m.group(1))
        amp = 0.00035 if n in HOUSE_EXACT else 0.0009
        lat, lng = jitter(name, sokolova_new(n), *interp(n), amp=amp)
        old = (addr, r.get("district"), r.get("coordinates"))
        r["address"] = sokolova_new(n)
        r["district"] = "Кировский"
        r["coordinates"] = {"lat": lat, "lng": lng}
        changes.append((name, addr, r["address"], "Кировский", lat, lng,
                        "дом-точка" if n in HOUSE_EXACT else "интерполяция"))
    elif addr == "ул. Королёва, 51" and "Штефан" in name:
        lat, lng = jitter(name, "пр. Королёва, 51", *KOROLEVA51, amp=0.0009)
        r["address"] = "пр. Королёва, 51"
        r["phone"] = "+7 (863) 229-54-54"
        r["coordinates"] = {"lat": lat, "lng": lng}
        r["notes"] = "Телефон сети уточнён по 2ГИС (задача 24)"
        changes.append((name, addr, r["address"], r["district"], lat, lng,
                        "сегмент проспекта"))
    if r.get("district") == "Советский район":
        r["district"] = "Советский"

print(f"Изменено строк: {len(changes)}")
for c in changes:
    print(f"  {c[0][:34]:36s} {c[1]:20s} -> {c[2]:20s} ({c[3]}) "
          f"{c[4]},{c[5]} [{c[6]}]")

from collections import Counter
print("Районы после правки:", dict(Counter(r["district"] for r in rows)))
print("Всего:", len(rows))

print("\n=== Таблица для data-migrations.ts (name|oldAddr -> patch) ===")
for name, old, new, district, lat, lng, src in changes:
    phone = ', phone: "+7 (863) 229-54-54"' if "Штефан" in name and "51" in old else ""
    print(f'  {{ name: {json.dumps(name, ensure_ascii=False)}, oldAddress: {json.dumps(old, ensure_ascii=False)},')
    print(f'    patch: {{ address: {json.dumps(new, ensure_ascii=False)}, district: {json.dumps(district, ensure_ascii=False)},')
    print(f'      coordinates: {{ lat: {lat}, lng: {lng} }}{phone} }} }},')

if "--apply" in sys.argv:
    json.dump(rows, open(SEED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(SEED, "a", encoding="utf-8").write("\n")
    print("APPLIED")
else:
    print("(dry-run)")
