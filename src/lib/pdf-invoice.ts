"use client";

import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { jsPDF } from "jspdf";

import { LIBERATION_SANS_BOLD_B64 } from "@/lib/pdf/liberation-sans-bold";
import { LIBERATION_SANS_REGULAR_B64 } from "@/lib/pdf/liberation-sans-regular";
import type { InvoiceRequisites } from "@/lib/settings-store";
import { PACK_KG, type Client, type Order, type Payment } from "@/types/models";

/**
 * Генератор PDF-счёта FryFlow — уровень «серьёзного поставщика».
 *
 * A4, Liberation Sans (подмножество с кириллицей и ₽, см. src/lib/pdf/).
 * Открывается в новой вкладке как blob; если браузер заблокировал
 * попап — скачивается файлом.
 */

/* ── Палитра Warm Precision (совпадает с globals.css) ─────── */
const INK: [number, number, number] = [28, 26, 23]; // #1C1A17
const SOFT: [number, number, number] = [110, 100, 85]; // #6E6455
const BORDER: [number, number, number] = [232, 226, 217]; // #E8E2D9
const AMBER: [number, number, number] = [198, 138, 27]; // #C68A1B
const AMBER_SOFT: [number, number, number] = [247, 240, 226]; // тёплая подложка

const FONT = "LiberationSans";
const PAGE_W = 210;
const MARGIN = 16;

const money = (n: number) =>
  new Intl.NumberFormat("ru-RU").format(Math.round(n * 100) / 100);

/* ── Сумма прописью (рубли и копейки) ─────────────────────── */

const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
  "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят",
  "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот",
  "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function plural(n: number, forms: [string, string, string]): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d100 >= 11 && d100 <= 14) return forms[2];
  if (d10 === 1) return forms[0];
  if (d10 >= 2 && d10 <= 4) return forms[1];
  return forms[2];
}

function tripletToWords(n: number, female: boolean): string {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) words.push(HUNDREDS[h]);
  if (rest >= 10 && rest <= 19) {
    words.push(TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) words.push(TENS[t]);
    if (o) words.push(female ? ONES_F[o] : ONES_M[o]);
  }
  return words.join(" ");
}

/** 3247.5 → «Три тысячи двести сорок семь рублей 50 копеек». */
export function amountToWords(total: number): string {
  const rub = Math.floor(total);
  const kop = Math.round((total - rub) * 100);
  const parts: string[] = [];
  const millions = Math.floor(rub / 1_000_000);
  const thousands = Math.floor(rub / 1000) % 1000;
  const units = rub % 1000;
  if (millions) {
    parts.push(tripletToWords(millions, false), plural(millions, ["миллион", "миллиона", "миллионов"]));
  }
  if (thousands) {
    parts.push(tripletToWords(thousands, true), plural(thousands, ["тысяча", "тысячи", "тысяч"]));
  }
  if (units) parts.push(tripletToWords(units, false));
  let words = parts.join(" ").trim();
  if (!words) words = "ноль";
  words = words[0].toUpperCase() + words.slice(1);
  return `${words} ${plural(rub, ["рубль", "рубля", "рублей"])} ${String(kop).padStart(2, "0")} ${plural(kop, ["копейка", "копейки", "копеек"])}`;
}

/* ── Номер счёта ──────────────────────────────────────────── */

/** ord-1045 → «СЧ-20261102-1045» (дата счёта = дата создания заказа). */
export function invoiceNumber(order: Order): string {
  const d = new Date(order.createdAt);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `СЧ-${stamp}-${order.id.replace(/\D/g, "") || "000"}`;
}

export function invoiceFileName(order: Order): string {
  return `fryflow-schet-${order.id.replace(/\D/g, "") || "order"}.pdf`;
}

/* ── Входные данные ───────────────────────────────────────── */

export interface InvoiceInput {
  order: Order;
  client?: Client | null;
  /** Все платежи по этому заказу (для строки «Оплачено»). */
  payments: Payment[];
  invoice: InvoiceRequisites;
}

/** Сколько уже заплачено по заказу, ₽ (не больше суммы заказа). */
function paidAmount({ order, payments }: InvoiceInput): number {
  const sum = payments
    .filter((p) => p.orderId === order.id)
    .reduce((s, p) => s + p.amount, 0);
  if (order.isPaid) return Math.max(sum, order.totalAmount);
  return Math.min(sum, order.totalAmount);
}

/* ── Генератор ────────────────────────────────────────────── */

export function generateInvoicePdf(input: InvoiceInput): jsPDF {
  const { order, client, invoice } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.addFileToVFS("LiberationSans.ttf", LIBERATION_SANS_REGULAR_B64);
  doc.addFont("LiberationSans.ttf", FONT, "normal");
  doc.addFileToVFS("LiberationSans-Bold.ttf", LIBERATION_SANS_BOLD_B64);
  doc.addFont("LiberationSans-Bold.ttf", FONT, "bold");

  const bold = (size: number) => {
    doc.setFont(FONT, "bold");
    doc.setFontSize(size);
  };
  const normal = (size: number) => {
    doc.setFont(FONT, "normal");
    doc.setFontSize(size);
  };
  const right = (text: string, x: number, y: number) =>
    doc.text(text, x, y, { align: "right" });

  const num = invoiceNumber(order);
  const total = order.totalAmount;
  const paid = paidAmount(input);
  const due = Math.max(0, total - paid);

  /* ── Шапка ── */
  let y = 22;
  normal(8.5);
  doc.setTextColor(...SOFT);
  doc.text("FryFlow · оптовые поставки картофеля фри", MARGIN, y);

  bold(16);
  doc.setTextColor(...INK);
  doc.text(`СЧЁТ № ${num}`, MARGIN, y + 11);
  normal(10.5);
  doc.setTextColor(...SOFT);
  doc.text(
    `от ${format(new Date(order.createdAt), "d MMMM yyyy 'г.'", { locale: ru })}`,
    MARGIN,
    y + 18
  );
  // Правый верх: сумма к оплате мелко + доставка
  bold(11);
  doc.setTextColor(...AMBER);
  right(`${money(due)} ₽ к оплате`, PAGE_W - MARGIN, y + 11);
  normal(9);
  doc.setTextColor(...SOFT);
  right(
    `Доставка: ${format(new Date(`${order.deliveryDate}T00:00:00`), "d MMMM yyyy", { locale: ru })}`,
    PAGE_W - MARGIN,
    y + 18
  );

  /* ── Поставщик / Плательщик ── */
  y = 56;
  const colW = (PAGE_W - MARGIN * 2 - 8) / 2;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y - 5, PAGE_W - MARGIN, y - 5);

  const supplier = [
    `Поставщик: ${invoice.legalForm} ${invoice.companyName}`,
    `Адрес: ${invoice.address}`,
    `ИНН: ${invoice.inn}`,
    `Телефон: ${invoice.phone}`,
    `Р/с: ${invoice.account}`,
    `Банк: ${invoice.bank}`,
    `БИК: ${invoice.bik} · К/с: ${invoice.corrAccount}`,
  ];
  const payer = [
    `Плательщик: ${order.clientName}`,
    `Адрес: ${client?.address || "—"}`,
    `Телефон: ${client?.phone || "—"}`,
    `Основание: заказ № ${order.id.replace(/\D/g, "")} от ${format(new Date(order.createdAt), "dd.MM.yyyy", { locale: undefined })}`,
  ];

  const drawBlock = (lines: string[], x: number) => {
    let by = y;
    lines.forEach((line, i) => {
      const isTitle = i === 0;
      if (isTitle) bold(9.5); else normal(9);
      doc.setTextColor(...(isTitle ? INK : SOFT));
      const wrapped = doc.splitTextToSize(line, colW);
      doc.text(wrapped, x, by);
      by += wrapped.length * 4.4;
    });
    return by;
  };
  const y1 = drawBlock(supplier, MARGIN);
  const y2 = drawBlock(payer, MARGIN + colW + 8);
  y = Math.max(y1, y2) + 8;

  /* ── Таблица ── */
  const colR = { qty: 132, price: 162, sum: PAGE_W - MARGIN - 2 };
  doc.setFillColor(...AMBER_SOFT);
  doc.setDrawColor(...BORDER);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 9, "FD");
  bold(8.5);
  doc.setTextColor(...SOFT);
  doc.text("№", MARGIN + 3, y + 6);
  doc.text("НАИМЕНОВАНИЕ", MARGIN + 11, y + 6);
  right("КОЛ-ВО, УП.", colR.qty, y + 6);
  right("ЦЕНА, ₽", colR.price, y + 6);
  right("СУММА, ₽", colR.sum, y + 6);
  y += 9;

  const rows: Array<[string, string, string, string]> = [
    [
      "Картофель фри замороженный, уп. 2,5 кг",
      `${order.boxesCount}`,
      money(order.pricePerBox),
      money(order.boxesCount * order.pricePerBox),
    ],
  ];
  let rowY = y;
  rows.forEach(([name, qty, price, sum], i) => {
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, rowY + 8.5, PAGE_W - MARGIN, rowY + 8.5);
    normal(10);
    doc.setTextColor(...INK);
    doc.text(String(i + 1), MARGIN + 3, rowY + 6);
    doc.text(name, MARGIN + 11, rowY + 6);
    right(qty, colR.qty, rowY + 6);
    right(price, colR.price, rowY + 6);
    bold(10);
    right(sum, colR.sum, rowY + 6);
    rowY += 8.5;
  });
  y = rowY + 2;
  normal(8.5);
  doc.setTextColor(...SOFT);
  doc.text(
    `Всего: ${order.boxesCount} уп. × ${money(order.boxesCount * PACK_KG)} кг · цена ${order.pricePerBox >= 300 ? "оптовая" : "мелкий опт"} ${order.pricePerBox} ₽/уп (${Math.round((order.pricePerBox / PACK_KG) * 10) / 10} ₽/кг)`,
    MARGIN,
    y
  );
  y += 9;

  /* ── Итоги ── */
  const totalX = PAGE_W - MARGIN;
  normal(10.5);
  doc.setTextColor(...INK);
  doc.text("Итого:", totalX - 42, y);
  right(`${money(total)} ₽`, totalX, y);

  if (paid > 0) {
    y += 6.5;
    normal(10.5);
    doc.setTextColor(...SOFT);
    doc.text("Оплачено:", totalX - 42, y);
    right(`${money(paid)} ₽`, totalX, y);
  }

  y += 11;
  // К оплате — крупно, на янтарной подложке
  doc.setFillColor(...AMBER_SOFT);
  doc.roundedRect(totalX - 92, y - 7, 92, 13, 2.2, 2.2, "F");
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.35);
  doc.roundedRect(totalX - 92, y - 7, 92, 13, 2.2, 2.2, "S");
  bold(13);
  doc.setTextColor(...AMBER);
  doc.text("К ОПЛАТЕ:", totalX - 86, y + 2.2);
  right(`${money(due)} ₽`, totalX - 5, y + 2.2);

  /* ── НДС и прописью ── */
  y += 14;
  normal(9);
  if (invoice.vatRate === "Без НДС") {
    doc.setTextColor(...SOFT);
    doc.text("НДС не облагается (упрощённая система налогообложения).", MARGIN, y);
  } else {
    const rate = Number(invoice.vatRate.replace("%", "")) / 100;
    const vat = Math.round(total * rate * 100) / 100 / (1 + rate); // НДС в том числе
    doc.setTextColor(...INK);
    doc.text(`В том числе НДС (${invoice.vatRate}):`, MARGIN, y);
    right(`${money(vat)} ₽`, PAGE_W - 110, y);
  }
  y += 6;
  normal(9.5);
  doc.setTextColor(...INK);
  const wordsLine = doc.splitTextToSize(
    `Всего к оплате: ${amountToWords(total)}.`,
    PAGE_W - MARGIN * 2
  );
  doc.text(wordsLine, MARGIN, y);
  y += wordsLine.length * 4.6 + 4;

  if (order.comment) {
    normal(9);
    doc.setTextColor(...SOFT);
    const comment = doc.splitTextToSize(`Комментарий: ${order.comment}`, PAGE_W - MARGIN * 2);
    doc.text(comment, MARGIN, y);
    y += comment.length * 4.4 + 4;
  }

  /* ── Подпись ── */
  y = Math.max(y + 10, 240);
  const lineX2 = PAGE_W - MARGIN - 55;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(lineX2 - 34, y, lineX2, y);
  normal(7.5);
  doc.setTextColor(...SOFT);
  right("подпись", lineX2 - 17, y + 4);
  bold(10.5);
  doc.setTextColor(...INK);
  right(invoice.signatoryName, PAGE_W - MARGIN, y - 1.5);
  normal(8);
  doc.setTextColor(...SOFT);
  right(invoice.signatoryTitle, PAGE_W - MARGIN, y + 3.5);

  /* ── Подвал ── */
  doc.setDrawColor(...BORDER);
  doc.line(MARGIN, 278, PAGE_W - MARGIN, 278);
  normal(8);
  doc.setTextColor(...SOFT);
  doc.text(
    `Счёт сформирован в FryFlow · ${format(new Date(), "d MMMM yyyy, HH:mm", { locale: ru })}`,
    MARGIN,
    283
  );
  right("Оплата по счёту в течение 3 рабочих дней", PAGE_W - MARGIN, 283);

  return doc;
}

/* ── Открытие в браузере ──────────────────────────────────── */

/** Открывает счёт в новой вкладке; при блокировке попапа — скачивает. */
export function openInvoicePdf(input: InvoiceInput): "opened" | "downloaded" {
  const doc = generateInvoicePdf(input);
  const fileName = invoiceFileName(input.order);
  try {
    const url = URL.createObjectURL(doc.output("blob"));
    const win = window.open(url, "_blank", "noopener");
    if (win) {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return "opened";
    }
    URL.revokeObjectURL(url);
  } catch {
    // у некоторых окружений blob-URL недоступен — скачиваем
  }
  doc.save(fileName);
  return "downloaded";
}
