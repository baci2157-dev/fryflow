#!/usr/bin/env python3
"""Задача 24: проба дом-уровня для оставшихся адресов."""
import json, time, urllib.parse, urllib.request

def fwd(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": "4", "accept-language": "ru",
        "addressdetails": "1", "q": q})
    req = urllib.request.Request(url, headers={"User-Agent": "FryFlowSeedPrep/1.0"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.load(r)

print("== Соколова: оставшиеся дома ==")
for n in [90, 91, 104, 112, 119, 144, 152, 165]:
    q = f"проспект Соколова {n} Ростов-на-Дону"
    try:
        found = False
        for c in fwd(q):
            ad = c.get("address", {})
            if "соколов" in (ad.get("road") or "").lower():
                print(f"  {n}: {c['lat']},{c['lon']} hn={ad.get('house_number')} type={c.get('type')} {ad.get('city_district','')}")
                found = True
                break
        if not found:
            print(f"  {n}: — (нет дом-точки)")
    except Exception as e:
        print(f"  {n}: ERR {e}")
    time.sleep(1.2)

print("== Королёва: соседи дома 51 ==")
for n in [45, 49, 51, 53, 55, 47]:
    q = f"проспект Королёва {n} Ростов-на-Дону"
    try:
        found = False
        for c in fwd(q):
            ad = c.get("address", {})
            if "королёв" in (ad.get("road") or "").lower() or "королев" in (ad.get("road") or "").lower():
                print(f"  {n}: {c['lat']},{c['lon']} hn={ad.get('house_number')} type={c.get('type')} {ad.get('city_district','')}")
                found = True
                break
        if not found:
            print(f"  {n}: — (нет дом-точки)")
    except Exception as e:
        print(f"  {n}: ERR {e}")
    time.sleep(1.2)
