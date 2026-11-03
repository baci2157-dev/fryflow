#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 22: карта — Ворошиловский (52), зум на новые точки севера, попап.

Цепочка: JS-клик чипа «Ворошиловский 52» → маркеры 52 → зум-драйв к плотному
кластеру (Северный массив: Космонавтов/Королёва/Добровольского) → клик маркера
ближе к центру → попап с реальной новой точкой → скриншот.
Карта инициализирована на http://localhost:3000/logistics (или прод).
"""
import json
import subprocess
import sys
import time

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/task22_map_voroshilovsky.png"
TARGET_ZOOM = 15


def eval_js(js):
    out = subprocess.run(["agent-browser", "eval", js],
                         capture_output=True, text=True, timeout=60)
    s = out.stdout.strip()
    try:
        s = json.loads(s)
        if isinstance(s, str):
            s = json.loads(s)
        return s
    except Exception:
        return s


def marker_data():
    return eval_js("""(() => {
      const rect = document.querySelector('.leaflet-container').getBoundingClientRect();
      const pts = [...document.querySelectorAll('.leaflet-marker-icon')].map(m => {
        const b = m.getBoundingClientRect();
        return {x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2)};
      });
      const r = rect;
      const vis = pts.filter(p => p.x >= r.x && p.x <= r.x+r.width && p.y >= r.y && p.y <= r.y+r.height).length;
      const tiles = [...document.querySelectorAll('.leaflet-tile')]
        .map(t => (t.src.match(/\\/(\\d+)\\/\\d+\\/\\d+/)||[])[1]).filter(Boolean);
      return JSON.stringify({pts, rect: {x: r.x, y: r.y, w: r.width, h: r.height},
                             vis, zoom: Math.max(...tiles.map(Number))});
    })()""")


def cluster_center(pts, rect, r=70):
    cx, cy = rect["x"] + rect["w"] / 2, rect["y"] + rect["h"] / 2
    best_i, best_n = 0, -1
    for i, p in enumerate(pts):
        n = sum(1 for q in pts
                if abs(q["x"] - p["x"]) <= r and abs(q["y"] - p["y"]) <= r)
        if n > best_n:
            best_i, best_n = i, n
    core = pts[best_i]
    hood = [q for q in pts
            if abs(q["x"] - core["x"]) <= r and abs(q["y"] - core["y"]) <= r]
    px = sum(q["x"] for q in hood) / len(hood)
    py = sum(q["y"] for q in hood) / len(hood)
    return round(px), round(py), round(cx), round(cy), len(hood)


def drag_to_center(px, py, cx, cy):
    for cmd in (["mouse", "move", str(int(cx)), str(int(cy))],
                ["mouse", "down", "left"],
                ["mouse", "move", str(int(2 * cx - px)), str(int(2 * cy - py))],
                ["mouse", "up", "left"]):
        subprocess.run(["agent-browser", *cmd], capture_output=True, text=True, timeout=30)


def main():
    # 1. JS-клик чипа района (обычный click по chip не срабатывает).
    r = eval_js("""(() => {
      const chips = [...document.querySelectorAll('button,[role=tab]')]
        .filter(b => b.textContent.includes('Ворошиловский'));
      if (!chips.length) return 'chip not found';
      chips[0].click();
      return 'clicked: ' + chips[0].textContent.trim().replace(/\\s+/g,' ');
    })()""")
    print("чип:", r)
    time.sleep(3)

    d = marker_data()
    print(f"после фильтра: {len(d['pts'])} маркеров (в кадре {d.get('vis')}), зум {d.get('zoom')}")
    assert len(d["pts"]) == 52, f"ожидалось 52 маркера Ворошиловского, вышло {len(d['pts'])}"

    # 2. Зум-драйв к плотному кластеру.
    for step in range(7):
        d = marker_data()
        pts, rect, z = d["pts"], d["rect"], d.get("zoom", 0)
        px, py, cx, cy, n = cluster_center(pts, rect)
        print(f"шаг {step}: маркеров {len(pts)} (в кадре {d.get('vis')}), зум {z}, "
              f"кластер {n} т. в ({px},{py})")
        drag_to_center(px, py, cx, cy)
        time.sleep(1.2)
        if z >= TARGET_ZOOM:
            break
        eval_js("document.querySelector('.leaflet-control-zoom-in').click(); 'ok'")
        time.sleep(2.2)

    # 3. Центр вью по математике тайлов.
    d = marker_data()
    tiles = eval_js("""(() => {
      const m = [...document.querySelectorAll('.leaflet-tile')]
        .map(t => (t.src.match(/\\/(\\d+)\\/(\\d+)\\/(\\d+)/)||[]));
      return JSON.stringify(m.filter(Boolean));
    })()""")
    if tiles:
        zs = sorted({int(t[1]) for t in tiles})
        z = zs[-1]
        same = [t for t in tiles if int(t[1]) == z]
        xs = sorted(int(t[2]) for t in same)
        ys = sorted(int(t[3]) for t in same)
        mx, my = xs[len(xs)//2], ys[len(ys)//2]
        import math
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * my / 2**z))))
        lng = mx / 2**z * 360 - 180
        print(f"центр вью (тайлы, z{z}): lat={lat:.4f}, lng={lng:.4f}")

    # 4. Клик маркера ближе к центру → попап.
    popup = eval_js("""(() => {
      const rect = document.querySelector('.leaflet-container').getBoundingClientRect();
      const cx = rect.x + rect.width/2, cy = rect.y + rect.height/2;
      const ms = [...document.querySelectorAll('.leaflet-marker-icon')]
        .map(m => ({m, b: m.getBoundingClientRect()}))
        .filter(p => p.b.x >= rect.x && p.b.x <= rect.x+rect.width &&
                     p.b.y >= rect.y && p.b.y <= rect.y+rect.height);
      if (!ms.length) return 'no markers in view';
      ms.sort((a,b) => (Math.hypot(a.b.x+a.b.width/2-cx, a.b.y+a.b.height/2-cy) -
                        Math.hypot(b.b.x+b.b.width/2-cx, b.b.y+b.b.height/2-cy)));
      ms[0].m.click();
      return 'clicked marker at ' + Math.round(ms[0].b.x) + ',' + Math.round(ms[0].b.y);
    })()""")
    print(popup)
    time.sleep(2)
    content = eval_js("(document.querySelector('.leaflet-popup-content')||{}).textContent || 'no popup'")
    print("попап:", json.dumps(content, ensure_ascii=False))
    subprocess.run(["agent-browser", "screenshot", OUT],
                   capture_output=True, text=True, timeout=60)
    print("скриншот:", OUT)


if __name__ == "__main__":
    main()
