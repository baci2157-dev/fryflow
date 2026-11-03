#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 19: проба проблемных адресов в Nominatim с разными написаниями."""
import json, time, urllib.parse, urllib.request

def nominatim(query):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "6", "accept-language": "ru",
        "addressdetails": "1", "q": query,
    })
    req = urllib.request.Request(url, headers={"User-Agent": "FryFlowSeedPrep/1.0 (fryflow seed preparation)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

PROBES = [
    "проспект Стачки, 13, Ростов-на-Дону",
    "проспект Стачки, 25, Ростов-на-Дону",
    "Стачки, 25, Ростов-на-Дону",
    "проспект Стачки, 183, Ростов-на-Дону",
    "проспект Стачки, 312, Ростов-на-Дону",
    "проспект Стачки, 312/1, Ростов-на-Дону",
    "улица Доватора, 154, Ростов-на-Дону",
    "улица Ерёменко, 87, Ростов-на-Дону",
    "Коммунистический проспект, 46, Ростов-на-Дону",
    "Коммунистический проспект, 46А, Ростов-на-Дону",
    "проспект Солженицына, 15, Ростов-на-Дону",
    "улица Зорге, 64, Ростов-на-Дону",
    "улица Малиновского, 39, Ростов-на-Дону",
    "проспект Стачки, Ростов-на-Дону",
]

for q in PROBES:
    time.sleep(1.1)
    print(f"\n=== {q} ===")
    try:
        res = nominatim(q)
    except Exception as e:
        print(f"  ERROR {e}")
        continue
    if not res:
        print("  (пусто)")
    for c in res[:6]:
        d = (c.get("address") or {}).get("city_district", "")
        print(f"  {float(c['lat']):.6f},{float(c['lon']):.6f} [{c.get('category')}/{c.get('type')}] "
              f"{c['display_name'][:80]} | {d}")
