import {
  CalendarClock,
  Landmark,
  LayoutDashboard,
  Map,
  MapPin,
  Megaphone,
  Phone,
  Radar,
  Route,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  /** primary — четыре основных раздела (BottomNav + верх Sidebar) */
  primary: boolean;
  /** true — раздел уже реализован, переход выполняется; false — заглушка «в разработке» */
  ready: boolean;
}

/**
 * Единый реестр разделов FryFlow.
 * Реализованы: Дашборд, Клиенты, Карта (логистика), Маршрут на день,
 * Звонки (воронка холодных продаж), Заказы, Склад, Финансы, Долги
 * (полный цикл сделки — задача 5), Мозг, PDF-счета и Настройки
 * (задача 6), Регионы и Telegram-интеграция (задача 7), Маркетинг
 * с календарём автопостинга, PWA и офлайн-очередь (задача 8),
 * массовый импорт клиентов и каталог попутных товаров (задача 9),
 * раздел «Найдено ИИ» — веб-разведка новых точек (задача 11).
 */
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", title: "Дашборд", href: "/", icon: LayoutDashboard, primary: true, ready: true },
  { id: "clients", title: "Клиенты", href: "/clients", icon: Users, primary: true, ready: true },
  { id: "discovery", title: "Найдено ИИ", href: "/ai-discovery", icon: Radar, primary: false, ready: true },
  { id: "calls", title: "Звонки", href: "/calls", icon: Phone, primary: true, ready: true },
  { id: "callbacks", title: "Перезвоны", href: "/callbacks", icon: CalendarClock, primary: false, ready: true },
  { id: "logistics", title: "Карта", href: "/logistics", icon: Map, primary: true, ready: true },
  { id: "route", title: "Маршрут", href: "/route", icon: Route, primary: false, ready: true },
  { id: "orders", title: "Заказы", href: "/orders", icon: ShoppingCart, primary: false, ready: true },
  { id: "catalog", title: "Каталог", href: "/catalog", icon: ShoppingBasket, primary: false, ready: true },
  { id: "regions", title: "Регионы", href: "/regions", icon: MapPin, primary: false, ready: true },
  { id: "ai", title: "Мозг", href: "/ai-assistant", icon: Sparkles, primary: true, ready: true },
  { id: "finance", title: "Финансы", href: "/finance", icon: Landmark, primary: false, ready: true },
  { id: "debts", title: "Долги", href: "/debts", icon: Wallet, primary: false, ready: true },
  { id: "warehouse", title: "Склад", href: "/warehouse", icon: Warehouse, primary: false, ready: true },
  { id: "marketing", title: "Маркетинг", href: "/marketing", icon: Megaphone, primary: false, ready: true },
  { id: "settings", title: "Настройки", href: "/settings", icon: Settings, primary: false, ready: true },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.primary);
export const SECONDARY_NAV = NAV_ITEMS.filter((i) => !i.primary);
