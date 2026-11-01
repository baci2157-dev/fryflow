import {
  Landmark,
  LayoutDashboard,
  Map,
  MapPin,
  Megaphone,
  Phone,
  Settings,
  ShoppingCart,
  Sparkles,
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
}

/**
 * Единый реестр разделов FryFlow.
 * Порядок secondary-разделов: Регионы, ИИ, Финансы, Долги, Склад, Маркетинг, Настройки.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", title: "Дашборд", href: "/", icon: LayoutDashboard, primary: true },
  { id: "calls", title: "Звонки", href: "/calls", icon: Phone, primary: true },
  { id: "map", title: "Карта", href: "/map", icon: Map, primary: true },
  { id: "orders", title: "Заказы", href: "/orders", icon: ShoppingCart, primary: true },
  { id: "regions", title: "Регионы", href: "/regions", icon: MapPin, primary: false },
  { id: "ai", title: "ИИ", href: "/ai", icon: Sparkles, primary: false },
  { id: "finance", title: "Финансы", href: "/finance", icon: Landmark, primary: false },
  { id: "debts", title: "Долги", href: "/debts", icon: Wallet, primary: false },
  { id: "inventory", title: "Склад", href: "/inventory", icon: Warehouse, primary: false },
  { id: "marketing", title: "Маркетинг", href: "/marketing", icon: Megaphone, primary: false },
  { id: "settings", title: "Настройки", href: "/settings", icon: Settings, primary: false },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.primary);
export const SECONDARY_NAV = NAV_ITEMS.filter((i) => !i.primary);
