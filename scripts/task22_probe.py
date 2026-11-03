#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 22, проба проблемных адресов: Ленина, Соколова, Ковровая."""
import json, time, urllib.parse, urllib.request

ROSTOV = (47.18, 47.37, 39.49, 39.83)

def nominatim(query):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "8", "accept-language": "ru",
        "addressdetails": "1", "q": query,
    })
    req = urllib.request.Request(url, headers={"User-Agent": "FryFlowSeedPrep/1.0 (fryflow seed preparation)"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.load(r)

QUERIES = [
    "проспект Соколова, 80, Ростов-на-Дону",
    "Соколова, 80, Ростов-на-Дону",
    "улица Ленина, Ростов-на-Дону",
    "Ленина, 105, Ростов-на-Дону",
    "1-я Ковровая улица, Ростов-на-Дону",
    "Ковровая, Ростов-на-Дону",
]

for q in QUERIES:
    time.sleep(1.1)
    try:
        res = nominatim(q)
    except Exception as e:
        print(f"«{q}» → ошибка {e}")
        continue
    in_city = [c for c in res if ROSTOV[0] <= float(c["lat"]) <= ROSTOV[1]
               and ROSTOV[2] <= float(c["lon"]) <= ROSTOV[3]]
    print(f"«{q}» → {len(res)} рез., в городе {len(in_city)}")
    for c in in_city[:6]:
        d = (c.get("address") or {}).get("city_district", "?")
        print(f"   {float(c['lat']):.5f},{float(c['lon']):.5f} [{c.get('type')}] "
              f"{d} | {c['display_name'][:95]}")
    if not in_city:
        for c in res[:3]:
            print(f"   (вне bbox) {c['display_name'][:80]}")
    print()
