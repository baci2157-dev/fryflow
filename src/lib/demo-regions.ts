import type { RegionalPartner } from "@/types/models";

/**
 * Демо-база региональных оптовиков (задача 7).
 *
 * 14 партнёров юга: Краснодар (6), Волгоград (5), Ставрополь (3).
 * Суммарный объём — ровно 112,5 т, из них 4 фуры по ~20 т.
 * Воронка: Первый контакт (5) → Тест (5) → Фура (4).
 *
 * Цифры живые и правдоподобные: у каждой базы — контакт, телефон
 * и заметка менеджера, как в реальной таблице продаж.
 */

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export function demoRegions(): RegionalPartner[] {
  return [
    /* ── Фуры: работают объёмом ─────────────────────────────── */
    {
      id: "rg-kuban-food",
      company: "ООО «Кубань Фуд Опт»",
      city: "Краснодар",
      contactPerson: "Сергей Кравцов",
      phone: "+7 (861) 298-45-12",
      volumeTons: 24,
      status: "truck",
      notes: "Фуры каждую неделю. Своя логистика, оплата по факту выгрузки.",
      createdAt: iso(120),
    },
    {
      id: "rg-yug-produkt",
      company: "ТД «Юг-Продукт 24»",
      city: "Краснодар",
      contactPerson: "Марина Бабенко",
      phone: "+7 (918) 344-12-08",
      volumeTons: 22,
      status: "truck",
      notes: "Сеть из 6 оптовых баз, берут паллетами. Оплата по графику, без задержек.",
      createdAt: iso(95),
    },
    {
      id: "rg-vlg-opt",
      company: "«Волгоград Опт-Трейд»",
      city: "Волгоград",
      contactPerson: "Игорь Пшеничный",
      phone: "+7 (844) 263-77-40",
      volumeTons: 18,
      status: "truck",
      notes: "Фура раз в две недели. Важна стабильность калибра 9х9.",
      createdAt: iso(140),
    },
    {
      id: "rg-stav-food",
      company: "«Ставрополь Фуд Сервис»",
      city: "Ставрополь",
      contactPerson: "Тимур Асланов",
      phone: "+7 (8652) 94-15-32",
      volumeTons: 16,
      status: "truck",
      notes: "Отсрочка 7 дней по договору. Дружат с сетями Кавминвод.",
      createdAt: iso(88),
    },

    /* ── Тест: пробные отгрузки ─────────────────────────────── */
    {
      id: "rg-kuban-pf",
      company: "База «Кубанские полуфабрикаты»",
      city: "Краснодар",
      contactPerson: "Ольга Ткачёва",
      phone: "+7 (928) 220-14-05",
      volumeTons: 6,
      status: "test",
      notes: "Тест 6 т прошёл ровно, ждут прайс на следующий месяц.",
      createdAt: iso(34),
    },
    {
      id: "rg-sytny-dvor",
      company: "«Сытный двор»",
      city: "Волгоград",
      contactPerson: "Дмитрий Ерёмин",
      phone: "+7 (904) 410-66-12",
      volumeTons: 5,
      status: "test",
      notes: "Проба на 5 т, брака нет. Смотрят на цену доставки.",
      createdAt: iso(21),
    },
    {
      id: "rg-gastronom",
      company: "«ГастрономЪ Ставрополь»",
      city: "Ставрополь",
      contactPerson: "Анна Волошина",
      phone: "+7 (962) 448-90-27",
      volumeTons: 4,
      status: "test",
      notes: "Просят сертификат качества и HACCP до второго теста.",
      createdAt: iso(18),
    },
    {
      id: "rg-myasnoy",
      company: "«Мясной двор „Кубань»",
      city: "Краснодар",
      contactPerson: "Павел Куличенко",
      phone: "+7 (961) 505-77-89",
      volumeTons: 3.5,
      status: "test",
      notes: "Тест идёт вместе с фритюром — комплектом продаём выгоднее.",
      createdAt: iso(12),
    },
    {
      id: "rg-volzhanin",
      company: "Оптовик «Волжанин»",
      city: "Волгоград",
      contactPerson: "Егор Лапин",
      phone: "+7 (937) 737-01-45",
      volumeTons: 3,
      status: "test",
      notes: "Мелкая база, но растёт. Проба пришла 5 дней назад — позвонить.",
      createdAt: iso(5),
    },

    /* ── Первый контакт: переговоры ────────────────────────── */
    {
      id: "rg-food-line",
      company: "«Фуд-Лайн Юг»",
      city: "Краснодар",
      contactPerson: "Артём Гончар",
      phone: "+7 (930) 086-43-71",
      volumeTons: 3,
      status: "first",
      notes: "Запросили прайс. Звонить после 15:00 — до обеда на складе.",
      createdAt: iso(3),
    },
    {
      id: "rg-garant",
      company: "«Гарант-Продукт»",
      city: "Волгоград",
      contactPerson: "Лилия Медведева",
      phone: "+7 (953) 512-30-84",
      volumeTons: 2.5,
      status: "first",
      notes: "Ждут коммерческое на почту, ценят отсрочку.",
      createdAt: iso(2),
    },
    {
      id: "rg-stavopt",
      company: "«СтавропольОпт»",
      city: "Ставрополь",
      contactPerson: "Руслан Керимов",
      phone: "+7 (905) 445-38-20",
      volumeTons: 2,
      status: "first",
      notes: "Первый созвон прошёл хорошо, интересен калибр 7х7.",
      createdAt: iso(1),
    },
    {
      id: "rg-aisberri",
      company: "«Айсберри Юг»",
      city: "Краснодар",
      contactPerson: "Виктория Стрельцова",
      phone: "+7 (999) 610-25-63",
      volumeTons: 2,
      status: "first",
      notes: "Работают с заморозкой, нужен логистический прайс по краю.",
      createdAt: iso(1),
    },
    {
      id: "rg-vektor",
      company: "«Вектор Трейд»",
      city: "Волгоград",
      contactPerson: "Максим Жданов",
      phone: "+7 (902) 364-88-51",
      volumeTons: 1.5,
      status: "first",
      notes: "Небольшая база, планируют вторую точку к лету.",
      createdAt: iso(0),
    },
  ];
}
