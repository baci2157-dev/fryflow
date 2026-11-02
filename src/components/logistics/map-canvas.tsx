"use client";

import { useEffect } from "react";
import L from "leaflet";
import { CheckCircle2, MapPin, Phone, Plus } from "lucide-react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import {
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  PRIORITY_COLOR_VAR,
  STATUS_COLOR_VAR,
  type Client,
} from "@/types/models";

/**
 * Интерактивная карта FryFlow (react-leaflet + OpenStreetMap).
 * Загружается только на клиенте (dynamic import, ssr: false).
 *
 * Режимы маркеров:
 *  — funnel: цвет по статусу воронки;
 *  — tier: цвет по приоритету базы;
 *  — chain: сети выделены, остальные приглушены.
 * Сети во всех режимах получают белый бейдж с числом филиалов.
 */

export type MapMode = "funnel" | "tier" | "chain";

interface MapCanvasProps {
  clients: Client[];
  mode: MapMode;
  routeIds: Set<string>;
  onToggleRoute: (client: Client) => void;
  /** Куда лететь: координаты точек выбранного района (nonce меняется на каждый клик). */
  flyTarget: { coords: Array<{ lat: number; lng: number }>; nonce: number } | null;
}

const CITY_CENTER: L.LatLngExpression = [47.2225, 39.7188];

export default function MapCanvas({
  clients,
  mode,
  routeIds,
  onToggleRoute,
  flyTarget,
}: MapCanvasProps) {
  return (
    <MapContainer
      center={CITY_CENTER}
      zoom={12}
      zoomControl={false}
      className="size-full"
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <ZoomControl position="bottomright" />
      <FlyController flyTarget={flyTarget} />

      {clients.map((client) => (
        <Marker
          key={client.id}
          position={[client.coordinates.lat, client.coordinates.lng]}
          icon={markerIcon(client, mode)}
        >
          <Popup>
            <div className="min-w-[210px]">
              <p className="text-[13.5px] font-semibold text-ink">
                {client.name}
                {client.chainName ? (
                  <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1C1A17] shadow-sm ring-1 ring-black/10">
                    ×{client.chainSize}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-soft">
                <MapPin className="size-3" />
                {client.address} · {client.district}
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-soft">
                {CLIENT_TYPE_LABEL[client.type]} ·{" "}
                <span
                  style={{
                    color: STATUS_COLOR_VAR[client.status],
                    fontWeight: 600,
                  }}
                >
                  {CLIENT_STATUS_LABEL[client.status]}
                </span>
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {client.phone ? (
                  <a
                    href={`tel:${client.phone.replace(/[^+\d]/g, "")}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold"
                    style={{
                      color: "var(--tier-green)",
                      background:
                        "color-mix(in srgb, var(--tier-green) 12%, transparent)",
                    }}
                  >
                    <Phone className="size-3" />
                    Позвонить
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => onToggleRoute(client)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition-colors"
                  style={
                    routeIds.has(client.id)
                      ? {
                          color: "var(--ink)",
                          background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                        }
                      : {
                          color: "var(--ink)",
                          background: "var(--tint)",
                        }
                  }
                >
                  {routeIds.has(client.id) ? (
                    <>
                      <CheckCircle2 className="size-3 text-[var(--accent)]" />
                      В маршруте
                    </>
                  ) : (
                    <>
                      <Plus className="size-3" />
                      В маршрут
                    </>
                  )}
                </button>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

/* ── Полёт к району ────────────────────────────────────────── */

function FlyController({
  flyTarget,
}: {
  flyTarget: MapCanvasProps["flyTarget"];
}) {
  const map = useMap();

  useEffect(() => {
    if (!flyTarget) return;
    if (flyTarget.coords.length === 0) {
      map.flyTo(CITY_CENTER, 12, { duration: 0.9 });
      return;
    }
    const bounds = L.latLngBounds(
      flyTarget.coords.map((c) => [c.lat, c.lng] as [number, number])
    );
    map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 14, duration: 0.9 });
  }, [flyTarget?.nonce, flyTarget, map]);

  return null;
}

/* ── Иконка маркера (divIcon, цвета — CSS-переменные Warm Precision) ── */

function markerIcon(client: Client, mode: MapMode): L.DivIcon {
  const isChain = Boolean(client.chainName);
  const dimmed = mode === "chain" && !isChain;

  let color: string;
  if (mode === "funnel") color = STATUS_COLOR_VAR[client.status];
  else if (mode === "tier") color = PRIORITY_COLOR_VAR[client.priorityTier];
  else color = isChain ? "var(--tier-green)" : "var(--status-no-answer)";

  const size = isChain ? 28 : 24;
  const badge = isChain
    ? `<span style="position:absolute;top:-7px;right:-12px;min-width:19px;height:19px;padding:0 4px;border-radius:999px;background:#FFFFFF;color:#1C1A17;font-family:var(--font-jetbrains-mono),ui-monospace,monospace;font-size:10.5px;font-weight:700;line-height:19px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35);border:1px solid rgba(0,0,0,.08)">${client.chainSize ?? "•"}</span>`
    : "";

  return L.divIcon({
    className: "fryflow-pin",
    html: `<div style="position:relative;width:100%;height:100%;opacity:${dimmed ? 0.35 : 1}">
      <div style="width:100%;height:100%;border-radius:999px;background:${color};border:2.5px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>${badge}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}
