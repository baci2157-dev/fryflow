#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 19: калибровочный анализ перед пайплайном.

1) Bbox существующих точек по районам Советский/Железнодорожный/Кировский —
   чтобы задать VALID_ZONES для новых точек.
2) Кандидаты на дедуп: пересечение фикстуры task19 с базой по dedup-ключу
   и по именам (сети Kikchak / Штефан Бургер / Воккер могли уже быть в базе).
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "public" / "seed" / "clients.json"
FIXTURE = ROOT / "scripts" / "fixtures" / "task19_levencovsky_zapadny_pack1.json"

STREET_WORDS = {"ул","улица","просп","проспект","пр","пр-т","пр-кт","пл","площадь",
                "пер","переулок","б-р","бульвар","ш","шоссе","наб","набережная","проезд","пр-д"}

def norm(s):
    out = s.lower().replace("ё","е")
    for ch in "«»\"'":
        out = out.replace(ch,"")
    return " ".join(out.split()).strip()

def dedup_key(name, address):
    a = norm(address)
    a = re.sub(r"\([^)]*\)"," ",a)
    tokens = [t for t in re.split(r"[\s,.\-]+",a) if t and t not in STREET_WORDS]
    return f"{norm(name)}|{''.join(tokens)}"

base = json.loads(SEED.read_text(encoding="utf-8"))
pack = json.loads(FIXTURE.read_text(encoding="utf-8"))
print(f"база: {len(base)}, пакет: {len(pack)}\n")

print("── Bbox существующих точек по районам ──")
for d in ("Советский","Железнодорожный","Кировский"):
    pts = [c["coordinates"] for c in base if c["district"]==d and c.get("coordinates")]
    if not pts: continue
    lats=[p["lat"] for p in pts]; lngs=[p["lng"] for p in pts]
    print(f"{d} ({len(pts)} тчк): lat {min(lats):.4f}–{max(lats):.4f}, lng {min(lngs):.4f}–{max(lngs):.4f}")

print("\n── Существующие точки в этих районах (улицы) ──")
for d in ("Советский","Железнодорожный","Кировский"):
    print(f"[{d}]")
    for c in base:
        if c["district"]==d:
            print(f"   {c['name']} — {c['address']}")

print("\n── Дедуп-ключи пакета против базы ──")
base_keys = {dedup_key(c["name"],c["address"]) for c in base}
hits = 0
for r in pack:
    k = dedup_key(r["name"], r["address"])
    if k in base_keys:
        hits += 1
        print(f"  ДУБЛЬ: {r['name']} — {r['address']}")
print(f"итого дублей против базы: {hits}")

print("\n── Дубли внутри пакета ──")
seen, inner = {}, 0
for r in pack:
    k = dedup_key(r["name"], r["address"])
    if k in seen:
        inner += 1
        print(f"  ВНУТР.: {r['name']} — {r['address']} = {seen[k]}")
    seen[k] = r["address"]
print(f"итого внутренних: {inner}")

print("\n── Совпадения имён с базой (сети) ──")
base_names = {norm(c["name"]) for c in base}
for r in pack:
    n = norm(r["name"])
    if n in base_names:
        same = [c for c in base if norm(c["name"])==n]
        for c in same:
            print(f"  имя: {r['name']} | пакет: {r['address']} || база: {c['address']} [{c['district']}]")
