#!/usr/bin/env python3
"""Задача 24: интерполяция домов пр. Соколова без дом-точек + reverse-проверка."""
import json, time, urllib.parse, urllib.request

A27 = (47.225267, 39.720146)  # дом-точка Nominatim
A42 = (47.225213, 39.720447)  # дом-точка
A47 = (47.227989, 39.718985)  # дом-точка
A80 = (47.232973, 39.717661)  # дом-точка
D = tuple((a - b) / 33 for a, b in zip(A80, A47))  # на один номер дома

def pos(n):
    if n <= 27: return A27
    if n <= 42:
        t = (n - 27) / 15; return tuple(A27[i] + t * (A42[i] - A27[i]) for i in range(2))
    if n <= 47:
        t = (n - 42) / 5; return tuple(A42[i] + t * (A47[i] - A42[i]) for i in range(2))
    if n <= 80:
        t = (n - 47) / 33; return tuple(A47[i] + t * (A80[i] - A47[i]) for i in range(2))
    return tuple(A80[i] + (n - 80) * D[i] for i in range(2))

def rev(lat, lng):
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({
        "format": "jsonv2", "accept-language": "ru", "lat": lat, "lon": lng, "zoom": "17"})
    req = urllib.request.Request(url, headers={"User-Agent": "FryFlowSeedPrep/1.0"})
    with urllib.request.urlopen(req, timeout=6) as r:
        d = json.load(r)
    ad = d.get("address", {})
    return (ad.get("road") or "?"), (ad.get("city_district") or "?")

print("Проверка экстраполяции (номер -> координаты -> что там по reverse):")
for n in [90, 104, 112, 119, 144, 152, 165]:
    p = pos(n)
    try:
        road, district = rev(*p)
        print(f"  {n}: ({p[0]:.6f},{p[1]:.6f}) -> {road} | {district}")
    except Exception as e:
        print(f"  {n}: ERR {e}")
    time.sleep(1.2)

print("Reverse-проверка Королёва 51:")
try:
    road, district = rev(47.2955283, 39.7140256)
    print(f"  (47.2955283,39.7140256) -> {road} | {district}")
except Exception as e:
    print(f"  ERR {e}")
time.sleep(1.2)

print("Итоговые координаты для всех домов:")
for n in [27, 42, 47, 80, 90, 91, 104, 112, 119, 144, 152, 165]:
    p = pos(n)
    print(f"  {n}: ({p[0]:.6f}, {p[1]:.6f})")
