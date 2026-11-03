#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 22: счётчики базы 421 → 455 + Service Worker v1.4.0 → v1.5.0.

Заменяется только «421 точек» — легитимные числа 421 (массив mock-data.ts,
координаты в client-form-dialog.tsx) не трогаем. В sw.js: версия, шапка
истории версий и строка «Стратегии (v…:)».
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
    n = text.count("421 точек")
    if n == 0:
        print(f"  ? {rel}: «421 точек» не найдено — пропускаем")
        continue
    p.write_text(text.replace("421 точек", "455 точек"), encoding="utf-8")
    print(f"  ✓ {rel}: заменено {n}")

# ── Service Worker: v1.4.0 → v1.5.0 ──────────────────────────────────────
sw = ROOT / "public" / "sw.js"
text = sw.read_text(encoding="utf-8")
assert 'const VERSION = "v1.4.0";' in text, "не найдена версия v1.4.0 в sw.js"

hist = """ * Задача 21: версия поднята до v1.4.0 — сид вырос до 421 точки
 * (Ленинский +35, Пролетарский +26, Баррикадные +2 в Железнодорожный).
 * Снос кэшей при активации — телефон читает свежий /seed/clients.json.
"""
hist_new = """ * Задача 21: версия поднята до v1.4.0 — сид вырос до 421 точки
 * (Ленинский +35, Пролетарский +26, Баррикадные +2 в Железнодорожный).
 * Снос кэшей при активации — телефон читает свежий /seed/clients.json.
 *
 * Задача 22: версия поднята до v1.5.0 — сид вырос до 455 точек
 * (Ворошиловский +33, Мадояна +1 в Железнодорожный; 1 адрес-фантом
 * 1-я Ковровая пропущен). Снос кэшей при активации — свежий сид.
"""
assert hist in text, "не найден блок истории задачи 21 в sw.js"
text = text.replace(hist, hist_new)
text = text.replace('const VERSION = "v1.4.0";', 'const VERSION = "v1.5.0";')
text = text.replace("Стратегии (v1.4.0):", "Стратегии (v1.5.0):")
sw.write_text(text, encoding="utf-8")
print(f"  ✓ public/sw.js: v1.4.0 → v1.5.0 (+история задач)")
