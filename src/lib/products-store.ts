"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Product } from "@/types/models";

/**
 * Каталог попутных товаров FryFlow (задача 9 — cross-sell).
 *
 * Картофель фри — основной товар, но клиенту у точки удобно докупить
 * масло для фритюра, соус и зелень: та же машина, тот же рейс.
 * Каталог живёт в localStorage (fryflow-products-v1), остатки
 * списываются при добавлении товара в заказ (orders-store).
 *
 * Гидратация — как у всех сторов FryFlow: skipHydration + ручной
 * rehydrate() в AppShell (совпадение SSR и первого клиента).
 */

/** Демо-ассортимент: то, что реально берут шаурмичные и бургерные. */
export function demoProducts(): Product[] {
  return [
    {
      id: "prd-oil",
      name: "Масло фритюрное",
      category: "oil",
      unit: "л",
      price: 1200,
      cost: 950,
      stock: 18,
      description: "Канистра 5 л — выработку меняют раз в неделю",
    },
    {
      id: "prd-sauce-garlic",
      name: "Соус чесночный",
      category: "sauce",
      unit: "кг",
      price: 350,
      cost: 260,
      stock: 12,
      description: "Ведро 1 кг, фирменный рецепт — гости возвращаются",
    },
    {
      id: "prd-sauce-cheese",
      name: "Соус сырный",
      category: "sauce",
      unit: "кг",
      price: 400,
      cost: 295,
      stock: 9,
      description: "Ведро 1 кг, к фри и наггетсам — берут охотно",
    },
    {
      id: "prd-greens",
      name: "Зелень свежая",
      category: "greens",
      unit: "кг",
      price: 250,
      cost: 175,
      stock: 7,
      description: "Укроп, петрушка — привозим вместе с картошкой",
    },
    {
      id: "prd-lavash",
      name: "Лаваш",
      category: "semis",
      unit: "шт",
      price: 150,
      cost: 100,
      stock: 25,
      description: "Пачка 10 шт — тонкий, не рвётся на роллы",
    },
  ];
}

export interface NewProductInput {
  name: string;
  category: Product["category"];
  unit: Product["unit"];
  price: number;
  cost: number;
  stock: number;
  description: string;
}

interface ProductsState {
  products: Product[];
  hydrated: boolean;

  addProduct: (input: NewProductInput) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  /** Уменьшить остатки при продаже «попутно» (qty ≤ 0 игнорируется). */
  decrementStock: (items: Array<{ productId: string; qty: number }>) => void;
  /** Приход попутного товара (новая фасовка на склад). */
  restock: (id: string, qty: number) => void;

  resetDemo: () => void;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `prd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useProductsStore = create<ProductsState>()(
  persist(
    (set) => ({
      products: demoProducts(),
      hydrated: false,

      addProduct: (input) => {
        const product: Product = { ...input, id: newId() };
        set((s) => ({ products: [...s.products, product] }));
        return product;
      },

      updateProduct: (id, patch) =>
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      deleteProduct: (id) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

      decrementStock: (items) => {
        if (items.length === 0) return;
        set((s) => ({
          products: s.products.map((p) => {
            const sold = items
              .filter((i) => i.productId === p.id)
              .reduce((sum, i) => sum + Math.max(0, i.qty), 0);
            return sold > 0 ? { ...p, stock: Math.max(0, p.stock - sold) } : p;
          }),
        }));
      },

      restock: (id, qty) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === id ? { ...p, stock: Math.max(0, p.stock + qty) } : p
          ),
        })),

      resetDemo: () => set({ products: demoProducts() }),
    }),
    {
      name: "fryflow-products-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ products: s.products }),
      onRehydrateStorage: () => () => {
        useProductsStore.setState({ hydrated: true });
      },
    }
  )
);
