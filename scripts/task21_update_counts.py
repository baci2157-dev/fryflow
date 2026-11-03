#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 21: счётчики базы 360 → 421.

Заменяется только строка «360 точек» — в тех же файлах есть легитимные
числа 360 (stiffness: 360, duration: 3600), их не трогаем.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    "src/app/clients/page.tsx",
    "src/app/settings/page.tsx",
    "src/lib/seed-base.ts",
    "src/lib/clients-store.ts",
    "src/components/crm/seed-fallback-banner.tsx",
    "src/components/layout/app-shell.tsx",
]

for rel in FILES:
    p = ROOT / rel
    text = p.read_text(encoding="utf-8")
    n = text.count("360 точек")
    if n == 0:
        print(f"  ? {rel}: «360 точек» не найдено — пропускаем")
        continue
    p.write_text(text.replace("360 точек", "421 точек"), encoding="utf-8")
    print(f"  ✓ {rel}: заменено {n}")
