#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Задача 22: драг карты на север к новым точкам (пр. Космонавтов) + попап.

От текущего центра (z15) тащим карту двумя шагами к кластеру новых точек
Ворошиловского (lat 47.29, lng 39.714), кликаем ближайший к центру маркер,
читаем попап — доказательство новой точки на карте.
"""
import json
import subprocess
import time

OUT = "/home/z/my-project/download/task22_map_kosmonavtov.png"


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


def drag(mouse_dx, mouse_dy):
    """Мыcь из центра в центр+(dx,dy): контент идёт с мышью —
    мышь ВНИЗ (dy>0) тянет контент вниз → центр вью уходит на СЕВЕР."""
    r = eval_js("""(() => {
      const rect = document.querySelector('.leaflet-container').getBoundingClientRect();
      return JSON.stringify({cx: rect.x+rect.width/2, cy: rect.y+rect.height/2});
    })()""")
    cx, cy = round(r["cx"]), round(r["cy"])
    for cmd in (["mouse", "move", str(cx), str(cy)],
                ["mouse", "down", "left"],
                ["mouse", "move", str(cx + mouse_dx), str(cy + mouse_dy)],
                ["mouse", "up", "left"]):
        subprocess.run(["agent-browser", *cmd], capture_output=True, text=True, timeout=30)


def view_center():
    import math
    tiles = eval_js("""(() => {
      const m = [...document.querySelectorAll('.leaflet-tile')]
        .map(t => (t.src.match(/\\/(\\d+)\\/(\\d+)\\/(\\d+)/)||[]));
      return JSON.stringify(m.filter(Boolean));
    })()""")
    zs = sorted({int(t[1]) for t in tiles})
    z = zs[-1]
    same = [t for t in tiles if int(t[1]) == z]
    xs = sorted(int(t[2]) for t in same)
    ys = sorted(int(t[3]) for t in same)
    mx, my = xs[len(xs)//2], ys[len(ys)//2]
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * my / 2**z))))
    lng = mx / 2**z * 360 - 180
    return z, lat, lng


def click_center_marker():
    return eval_js("""(() => {
      const cl = document.querySelector('.leaflet-popup-close-button');
      if (cl) cl.click();
      const rect = document.querySelector('.leaflet-container').getBoundingClientRect();
      const cx = rect.x + rect.width/2, cy = rect.y + rect.height/2;
      const ms = [...document.querySelectorAll('.leaflet-marker-icon')]
        .map(m => ({m, b: m.getBoundingClientRect()}))
        .filter(p => p.b.x >= rect.x && p.b.x <= rect.x+rect.width &&
                     p.b.y >= rect.y && p.b.y <= rect.y+rect.height);
      if (!ms.length) return 'нет маркеров в кадре';
      ms.sort((a,b) => (Math.hypot(a.b.x+a.b.width/2-cx, a.b.y+a.b.height/2-cy) -
                        Math.hypot(b.b.x+b.b.width/2-cx, b.b.y+b.b.height/2-cy)));
      ms[0].m.click();
      return 'кликнули маркер ' + Math.round(ms[0].b.x) + ',' + Math.round(ms[0].b.y) +
             ' (в кадре маркеров: ' + ms.length + ')';
    })()""")


def main():
    z, lat, lng = view_center()
    print(f"старт: z{z}, центр {lat:.4f}, {lng:.4f}")
    # Цель: 47.292, 39.714. Карта всего 417px высотой (y 143..560, центр ~351):
    # драги не дальше ~190px вниз, 6 шагов. Мышь вниз = вид на север.
    for step in range(6):
        drag(-35, 185)
        time.sleep(2.0)
        z, lat, lng = view_center()
        print(f"шаг {step}: z{z}, центр {lat:.4f}, {lng:.4f}")
        if lat > 47.284:
            break
    res = click_center_marker()
    print(res)
    time.sleep(2)
    content = eval_js("(document.querySelector('.leaflet-popup-content')||{}).textContent || 'нет попапа'")
    print("попап:", json.dumps(content, ensure_ascii=False))
    subprocess.run(["agent-browser", "screenshot", OUT],
                   capture_output=True, text=True, timeout=60)
    print("скриншот:", OUT)


if __name__ == "__main__":
    main()
