import type { Call, Client } from "@/types/models";

/**
 * Демо-база FryFlow: 10 клиентов Ростова-на-Дону.
 * Массовое добавление реальных клиентов будет позже — эти данные
 * нужны, чтобы проверить фильтры, карту, маршрут и Health Score.
 *
 * Даты заказов заданы относительно «сейчас» (днями назад), чтобы
 * Health Score был детерминированным: в демо присутствуют оценки
 * 100, 90, 85, 75, 70, 45 и две карточки без истории заказов.
 */

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function demoClients(): Client[] {
  return [
    {
      id: "cl-zorge",
      name: "Шаурма на Зорге",
      address: "ул. Зорге, 19",
      district: "Советский",
      phone: "+7 (918) 558-34-12",
      type: "shawarma",
      status: "regular",
      priorityTier: "green",
      coordinates: { lat: 47.2448, lng: 39.7025 },
      notes: "Лучшая выручка в ЗЖМ. Забирают по 8 коробок, платят на месте.",
      createdAt: daysAgo(64),
      lastOrderAt: daysAgo(2),
      lastOrderBoxes: 8,
    },
    {
      id: "cl-shef",
      name: "Шеф-шаурма",
      address: "пр. Стачки, 220",
      district: "Кировский",
      phone: "+7 (928) 615-07-89",
      type: "shawarma",
      status: "trial",
      priorityTier: "green",
      coordinates: { lat: 47.2393, lng: 39.6341 },
      notes: "Пробуют после ухода «Мирторга». Хвалят прожарку.",
      createdAt: daysAgo(41),
      lastOrderAt: daysAgo(7),
      lastOrderBoxes: 5,
    },
    {
      id: "cl-shop",
      name: "Шаурма Shop",
      address: "ул. Красноармейская, 126",
      district: "Кировский",
      phone: "+7 (903) 472-18-55",
      type: "shawarma",
      status: "regular",
      priorityTier: "green",
      coordinates: { lat: 47.2175, lng: 39.7162 },
      notes: "Работают круглосуточно, выручка стабильно растёт третий месяц.",
      createdAt: daysAgo(89),
      lastOrderAt: daysAgo(4),
      lastOrderBoxes: 6,
    },
    {
      id: "cl-bebop",
      name: "The Bebop Burgers",
      address: "ул. Суворова, 19/21",
      district: "Ворошиловский",
      phone: "+7 (918) 340-26-74",
      type: "burger",
      status: "trial",
      priorityTier: "yellow",
      coordinates: { lat: 47.2304, lng: 39.7139 },
      notes: "Проба затянулась: согласуют бюджет. Держим на контроле.",
      createdAt: daysAgo(52),
      lastOrderAt: daysAgo(16),
      lastOrderBoxes: 4,
    },
    {
      id: "cl-cowboy",
      name: "Ковбой Бургер",
      address: "ул. Социалистическая, 46а",
      district: "Кировский",
      phone: "+7 (961) 289-45-30",
      type: "burger",
      status: "callback",
      priorityTier: "yellow",
      coordinates: { lat: 47.2227, lng: 39.7158 },
      notes: "Владелец на объектах до обеда — звонить после 14:00.",
      createdAt: daysAgo(37),
      lastOrderAt: daysAgo(12),
      lastOrderBoxes: 4,
    },
    {
      id: "cl-canteen55",
      name: "Столовая №55",
      address: "Привокзальная пл., 1/2",
      district: "Первомайский",
      phone: "+7 (863) 223-55-66",
      type: "canteen",
      status: "trial",
      priorityTier: "yellow",
      coordinates: { lat: 47.2169, lng: 39.7351 },
      notes: "При вокзале, обеденный трафик огромный. Ждут счёт на март.",
      createdAt: daysAgo(28),
      lastOrderAt: daysAgo(13),
      lastOrderBoxes: 10,
    },
    {
      id: "cl-manchester",
      name: "Манчестер Паб",
      address: "ул. Темерницкая, 57",
      district: "Кировский",
      phone: "+7 (929) 817-63-94",
      type: "bar",
      status: "refused",
      priorityTier: "red",
      coordinates: { lat: 47.2181, lng: 39.7129 },
      notes: "Ушли к «КубаньКарто» по цене. Вернуться к ним через квартал.",
      createdAt: daysAgo(75),
      lastOrderAt: daysAgo(10),
      lastOrderBoxes: 3,
    },
    {
      id: "cl-kikchak",
      name: "Kikchak",
      address: "ул. Большая Садовая, 114",
      district: "Октябрьский",
      phone: "+7 (928) 901-77-05",
      type: "shawarma",
      status: "regular",
      priorityTier: "green",
      chainName: "Kikchak",
      chainSize: 10,
      coordinates: { lat: 47.2252, lng: 39.7272 },
      notes: "Сеть из 10 точек — золото базы. Один звонок = 10 клиентов.",
      createdAt: daysAgo(96),
      lastOrderAt: daysAgo(3),
      lastOrderBoxes: 20,
    },
    {
      id: "cl-oganova",
      name: "Шаурма на Оганова",
      address: "ул. Оганова, 7",
      district: "Ленинский",
      phone: "",
      type: "shawarma",
      status: "cold",
      priorityTier: "green",
      coordinates: { lat: 47.2471, lng: 39.7153 },
      notes: "Телефона нет — точка новая, заехать лично по пути.",
      createdAt: daysAgo(6),
    },
    {
      id: "cl-pelmeni",
      name: "Пельменная",
      address: "ул. Еременко, 92",
      district: "Советский",
      phone: "",
      type: "canteen",
      status: "no_answer",
      priorityTier: "yellow",
      coordinates: { lat: 47.2537, lng: 39.6692 },
      notes: "Номер со 2ГИС не отвечает. Попробовать в инстаграме.",
      createdAt: daysAgo(12),
    },
  ];
}

/** Журнал звонков по демо-клиентам (свежие сверху по смыслу). */
export function demoCalls(clients: Client[]): Call[] {
  const byName = new Map(clients.map((c) => [c.name, c.id]));
  const id = (name: string) => byName.get(name) ?? "";
  return [
    {
      id: "call-1",
      clientId: id("Ковбой Бургер"),
      result: "callback",
      comment: "Владелец на объекте до обеда, секретарь просила перезвонить.",
      callbackDate: daysAhead(1),
      createdAt: daysAgo(1),
    },
    {
      id: "call-2",
      clientId: id("The Bebop Burgers"),
      result: "callback",
      comment: "Согласуют бюджет на март, обсуждать поставку после 15-го.",
      callbackDate: daysAhead(3),
      createdAt: daysAgo(3),
    },
    {
      id: "call-3",
      clientId: id("Шеф-шаурма"),
      result: "trial",
      comment: "Взяли 5 коробок на пробу после ухода «Мирторга».",
      createdAt: daysAgo(7),
    },
    {
      id: "call-4",
      clientId: id("Манчестер Паб"),
      result: "refused",
      comment: "Сменили поставщика на «КубаньКарто» — цена ниже на 8%. Вернуться через квартал.",
      createdAt: daysAgo(10),
    },
    {
      id: "call-5",
      clientId: id("Kikchak"),
      result: "trial",
      comment: "Согласовали пробную партию 20 коробок на все 10 точек.",
      createdAt: daysAgo(14),
    },
    {
      id: "call-6",
      clientId: id("Kikchak"),
      result: "callback",
      comment: "Ищут нового поставщика фри, назначили встречу с управляющим сети.",
      createdAt: daysAgo(21),
    },
  ];
}
