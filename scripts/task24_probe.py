#!/usr/bin/env python3
"""Задача 24: проверка — где реально лежат старые координаты точек Соколова."""
import json, time, urllib.parse, urllib.request

def rev(lat, lng):
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({
        "format": "jsonv2", "accept-language": "ru", "lat": lat, "lon": lng,
        "zoom": "17"})
    req = urllib.request.Request(url, headers={"User-Agent": "FryFlowSeedPrep/1.0"})
    with urllib.request.urlopen(req, timeout=6) as r:
        d = json.load(r)
    ad = d.get("address", {})
    return f"{ad.get('road','?')} {ad.get('house_number','')} | {ad.get('suburb','')} {ad.get('city_district','')}"

def fwd(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "3", "accept-language": "ru",
        "addressdetails": "1", "q": q})
    req = urllib.request.Request(url, headers={"User-Agent": "FryFlowSeedPrep/1.0"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.load(r)

print("== reverse: старые координаты из сида ==")
for label, lat, lng in [
    ("пр.Соколова,80 ЛЕНИН (47.2329,39.6953)", 47.232919, 39.695274),
    ("пр.Соколова,144 ЛЕНИН (47.2324,39.6953)", 47.232398, 39.695308),
    ("пр.Соколова,42 ЛЕНИН (47.2299,39.6934)", 47.229873, 39.693379),
    ("ул.Соколова,27 ВОРШ (47.2358,39.7135)", 47.235787, 39.713528),
    ("ул.Соколова,91 ВОРШ (47.2363,39.7083)", 47.236296, 39.708283),
    ("ул.Соколова,80 ВОРШ (47.2327,39.7179)", 47.232692, 39.717931),
]:
    try:
        print(f"  {label}: {rev(lat, lng)}")
    except Exception as e:
        print(f"  {label}: ERR {e}")
    time.sleep(1.2)

print("== forward: где реальные дома пр. Соколова ==")
for q in ["проспект Соколова 80 Ростов-на-Дону",
          "проспект Соколова 144 Ростов-на-Дону",
          "проспект Соколова 42 Ростов-на-Дону"]:
    try:
        for c in fwd(q)[:2]:
            ad = c.get("address", {})
            print(f"  «{q}» -> {c['lat']},{c['lon']} {ad.get('road')} {ad.get('house_number','')} {ad.get('city_district','')}")
    except Exception as e:
        print(f"  «{q}» ERR {e}")
    time.sleep(1.2)
