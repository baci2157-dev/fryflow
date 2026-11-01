import {
  Landmark,
  LayoutDashboard,
  Map,
  MapPin,
  Megaphone,
  Phone,
  Route,
  Settings,
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
 * Реализованы: Дашборд, Клиенты, Карта (логистика), Маршрут на день.
 * Остальные — будущие разделы (Звонки, Заказы, Регионы, ИИ, Финансы,
 * Долги, Склад, Маркетинг, Настройки).
 */
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", title: "Дашборд", href: "/", icon: LayoutDashboard, primary: true, ready: true },
  { id: "clients", title: "Клиенты", href: "/clients", icon: Users, primary: true, ready: true },
  { id: "logistics", title: "Карта", href: "/logistics", icon: Map, primary: true, ready: true },
  { id: "route", title: "Маршрут", href: "/route", icon: Route, primary: true, ready: true },
  { id: "calls", title: "Звонки", href: "/calls", icon: Phone, primary: false, ready: false },
  { id: "orders", title: "Заказы", href: "/orders", icon: ShoppingCart, primary: false, ready: false },
  { id: "regions", title: "Регионы", href: "/regions", icon: MapPin, primary: false, ready: false },
  { id: "ai", title: "ИИ", href: "/ai", icon: Sparkles, primary: false, ready: false },
  { id: "finance", title: "Финансы", href: "/finance", icon: Landmark, primary: false, ready: false },
  { id: "debts", title: "Долги", href: "/debts", icon: Wallet, primary: false, ready: false },
  { id: "inventory", title: "Склад", href: "/inventory", icon: Warehouse, primary: false, ready: false },
  { id: "marketing", title: "Маркетинг", href: "/marketing", icon: Megaphone, primary: false, ready: false },
  { id: "settings", title: "Настройки", href: "/settings", icon: Settings, primary: false, ready: false },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.primary);
export const SECONDARY_NAV = NAV_ITEMS.filter((i) => !i.primary);
