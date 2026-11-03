#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 20: счётчики базы 330 → 360 в пользовательских строках и комментариях.

import-clients.ts НЕ трогаем — там «18–21 точка из 330» это историческая
ссылка на инцидент задачи 19.5 (тогда база была 330).
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
    n = text.count("330")
    if n == 0:
        print(f"  ? {rel}: вхождений «330» нет — пропускаем")
        continue
    p.write_text(text.replace("330", "360"), encoding="utf-8")
    print(f"  ✓ {rel}: заменено {n}")
