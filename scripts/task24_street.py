#!/usr/bin/env python3
"""Задача 24: карта сегментов пр. Соколова — где улица на самом деле."""
import json, time, urllib.parse, urllib.request

def fwd(q, limit=10):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "format": "jsonv2", "limit": str(limit), "accept-language": "ru",
        "addressdetails": "1", "q": q})
    req = urllib.request.Request(url, headers={"User-Agent": "FryFlowSeedPrep/1.0"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.load(r)

print("== все сегменты «проспект Соколова» ==")
seen = set()
for c in fwd("проспект Соколова, Ростов-на-Дону", 10):
    ad = c.get("address", {})
    road = ad.get("road") or "?"
    if "соколов" in road.lower():
        key = (round(float(c["lat"]), 4), round(float(c["lon"]), 4))
        if key not in seen:
            seen.add(key)
            print(f"  {c['lat']},{c['lon']} type={c.get('type')} {ad.get('suburb','')} {ad.get('city_district','')}")
time.sleep(1.2)

print("== пересечение с Туполева (северный конец) ==")
for c in fwd("проспект Соколова Туполева, Ростов-на-Дону", 5):
    ad = c.get("address", {})
    print(f"  {c['lat']},{c['lon']} {ad.get('road')} / {ad.get('neighbourhood','')}{ad.get('suburb','')} {ad.get('city_district','')}")
time.sleep(1.2)

print("== дома 90..165 — у кого есть дом-точки (пробуем ещё раз с иными формулировками) ==")
for q in ["Соколова 90", "Соколова проспект 90", "пр. Соколова 144", "Соколова 165",
          "Соколова 152", "Соколова 112", "Соколова 104", "Соколова 119"]:
    try:
        hits = []
        for c in fwd(q + ", Ростов-на-Дону", 5):
            ad = c.get("address", {})
            if "соколов" in (ad.get("road") or "").lower():
                hits.append(f"{c['lat']},{c['lon']} hn={ad.get('house_number','-')}")
        print(f"  «{q}»: {'; '.join(hits[:2]) if hits else '—'}")
    except Exception as e:
        print(f"  «{q}»: ERR {e}")
    time.sleep(1.2)
