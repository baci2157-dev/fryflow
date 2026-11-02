-- ══════════════════════════════════════════════════════════════════════════
-- FryFlow · схема Supabase (задача 8 — подготовка к Go-Live)
--
-- Как применить (новичку, 5 минут):
--   1. Зайдите на https://supabase.com → New project (регион поближе: EU-Central).
--   2. Откройте SQL Editor → New query.
--   3. Скопируйте ВЕСЬ этот файл → Run. Готово — все таблицы на месте.
--   4. Ключи для .env.local: Project Settings → API → URL и anon public key.
--
-- Модель данных синхронизирована с lib/queries.ts (мапперы → snake_case).
-- Идентификаторы — text: приложение генерирует их само (ord-1048, uuid).
--
-- Безопасность: на каждой таблице включён RLS, доступ — ТОЛЬКО
-- authenticated (аноним с anon-ключом не читает и не пишет ничего).
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1. Клиенты — главный объект CRM (карточка за один тап)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id                   text primary key,
  name                 text not null,
  address              text not null default '',
  district             text not null,                    -- район Ростова-на-Дону
  phone                text not null default '',
  type                 text not null check (type in ('shawarma','burger','canteen','bar','hookah','foodcourt','darkkitchen')),
  status               text not null check (status in ('cold','no_answer','callback','trial','regular','refused')),
  priority_tier        text not null check (priority_tier in ('green','yellow','red')),
  chain_name           text,                             -- сеть («золото» бизнеса)
  chain_size           integer,
  lat                  double precision,
  lng                  double precision,
  notes                text not null default '',
  created_at           timestamptz not null default now(),
  last_order_at        timestamptz,
  order_frequency_days integer,                          -- ожидаемая частота заказов
  last_order_boxes     integer
);

-- ─────────────────────────────────────────────────────────────
-- 2. Звонки — журнал воронки холодных продаж
-- ─────────────────────────────────────────────────────────────
create table if not exists public.calls (
  id             text primary key,
  client_id      text not null references public.clients(id) on delete cascade,
  result         text not null check (result in ('trial','callback','refused','no_answer')),
  comment        text not null default '',
  callback_date  date,                                   -- только для result = 'callback'
  attempt_number integer not null default 1,             -- 1 — первый звонок, 2 — второй…
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. Заказы — сделки полного цикла (создание → склад → оплата)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id            text primary key,                        -- ord-1048…
  client_id     text,                                    -- tg-… для Telegram-заявок
  client_name   text not null,                           -- копия имени на момент заказа
  boxes_count   integer not null check (boxes_count > 0),-- упаковок по 2,5 кг
  price_per_box numeric not null,                        -- 300 ₽ опт / 350 ₽ мелкий опт
  total_amount  numeric not null,                        -- boxes_count × price_per_box
  delivery_date date not null,
  is_paid       boolean not null default false,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  comment       text,
  is_draft      boolean not null default false,          -- черновик: склад не списывается
  source        text not null default 'manual' check (source in ('manual','telegram')),
  external_id   text                                    -- id заявки на сервере Telegram (дедуп),
  items         jsonb default '[]'::jsonb                -- попутные товары (задача 9): [{productId, name, qty, price}]
);

-- ─────────────────────────────────────────────────────────────
-- 4. Движения по складу — остаток = сумма движений
--    (приход − списания − заказы; 3 400 кг = 1 360 уп. на старте)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.inventory_movements (
  id            text primary key,
  type          text not null check (type in ('in','out','order')),
  quantity_kg   numeric not null,                        -- упаковки × 2,5
  quantity_packs integer not null check (quantity_packs > 0),
  description   text not null default '',
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. Оплаты — частичные суммы копятся, пока не закроют весь долг
-- ─────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id         text primary key,
  order_id   text not null references public.orders(id) on delete cascade,
  amount     numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. Региональные партнёры — оптовики Краснодара, Волгограда,
--    Ставрополя (воронка: Первый контакт → Тест → Фура)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.regional_partners (
  id             text primary key,
  company        text not null,
  city           text not null,
  contact_person text not null default '',
  phone          text not null default '',
  volume_tons    numeric not null default 0,             -- месячный объём (фура ≈ 20 т)
  status         text not null default 'first' check (status in ('first','test','truck')),
  notes          text not null default '',
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 7. Настройки — одна строка-синглтон (реквизиты + ИИ-устав)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.settings (
  id         text primary key default 'singleton' check (id = 'singleton'),
  invoice    jsonb not null default '{}'::jsonb,         -- реквизиты для PDF-счёта
  ai         jsonb not null default '{}'::jsonb,         -- устав ИИ, интервалы советов
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 8. Черновики заявок — Telegram-бот разбирает сообщения клиентов
--    и кладёт сюда (pending → resolved после решения менеджера)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.order_drafts (
  id            text primary key,
  client_name   text not null,
  boxes         integer not null default 10,             -- минимальный опт — безопасный дефолт
  delivery_date date not null,
  message       text not null default '',                -- исходное сообщение клиента
  from_name     text not null default '',
  received_at   timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending','resolved'))
);

-- ════════════════════════════════════════════════════════════
-- ИНДЕКСЫ — по district, status, created_at (и рабочим связям)
-- ════════════════════════════════════════════════════════════

-- ── Попутные товары (задача 9) ──────────────────────────────────
create table if not exists public.products (
  id          text primary key,
  name        text not null,
  category    text not null check (category in ('oil','sauce','greens','vegetables','semis','packaging')),
  unit        text not null check (unit in ('л','кг','шт')),
  price       integer not null check (price >= 0),
  cost        integer not null default 0 check (cost >= 0),
  stock       integer not null default 0 check (stock >= 0),
  description text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_clients_district     on public.clients (district);
create index if not exists idx_clients_status       on public.clients (status);
create index if not exists idx_clients_priority     on public.clients (priority_tier);
create index if not exists idx_clients_created_at   on public.clients (created_at desc);

create index if not exists idx_calls_client_id      on public.calls (client_id);
create index if not exists idx_calls_created_at     on public.calls (created_at desc);

create index if not exists idx_orders_client_id     on public.orders (client_id);
create index if not exists idx_orders_is_paid       on public.orders (is_paid) where not is_draft;
create index if not exists idx_orders_is_draft      on public.orders (is_draft);
create index if not exists idx_orders_created_at    on public.orders (created_at desc);
create unique index if not exists uq_orders_external_id on public.orders (external_id) where external_id is not null;

create index if not exists idx_movements_created_at on public.inventory_movements (created_at desc);
create index if not exists idx_movements_type       on public.inventory_movements (type);

create index if not exists idx_payments_order_id    on public.payments (order_id);
create index if not exists idx_payments_created_at  on public.payments (created_at desc);

create index if not exists idx_partners_city        on public.regional_partners (city);
create index if not exists idx_partners_status      on public.regional_partners (status);
create index if not exists idx_partners_created_at  on public.regional_partners (created_at desc);

create index if not exists idx_drafts_status        on public.order_drafts (status);
create index if not exists idx_products_category    on public.products (category);
create index if not exists idx_drafts_received_at   on public.order_drafts (received_at desc);

-- ════════════════════════════════════════════════════════════
-- RLS — доступ только аутентифицированным пользователям.
-- Аноним (anon-ключ из браузера) не видит НИ-ЧЕ-ГО.
--
-- Включите вход в Supabase: Authentication → Providers → Email
-- (или magic link), после чего lib/supabase.ts начнёт писать
-- в базу от имени вошедшего пользователя.
-- ════════════════════════════════════════════════════════════

alter table public.clients             enable row level security;
alter table public.calls               enable row level security;
alter table public.orders              enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.payments            enable row level security;
alter table public.regional_partners   enable row level security;
alter table public.settings            enable row level security;
alter table public.order_drafts        enable row level security;
alter table public.products            enable row level security;

drop policy if exists "clients_authenticated" on public.clients;
create policy "clients_authenticated" on public.clients
  for all to authenticated using (true) with check (true);

drop policy if exists "calls_authenticated" on public.calls;
create policy "calls_authenticated" on public.calls
  for all to authenticated using (true) with check (true);

drop policy if exists "orders_authenticated" on public.orders;
create policy "orders_authenticated" on public.orders
  for all to authenticated using (true) with check (true);

drop policy if exists "movements_authenticated" on public.inventory_movements;
create policy "movements_authenticated" on public.inventory_movements
  for all to authenticated using (true) with check (true);

drop policy if exists "payments_authenticated" on public.payments;
create policy "payments_authenticated" on public.payments
  for all to authenticated using (true) with check (true);

drop policy if exists "partners_authenticated" on public.regional_partners;
create policy "partners_authenticated" on public.regional_partners
  for all to authenticated using (true) with check (true);

drop policy if exists "settings_authenticated" on public.settings;
create policy "settings_authenticated" on public.settings
  for all to authenticated using (true) with check (true);

drop policy if exists "drafts_authenticated" on public.order_drafts;
create policy "drafts_authenticated" on public.order_drafts
  for all to authenticated using (true) with check (true);

drop policy if exists "products_authenticated" on public.products;
create policy "products_authenticated" on public.products
  for all to authenticated using (true) with check (true);

-- Вебхук Telegram (server-side, сервисный доступ при наличии
-- service_role-ключа в переменных окружения сервера) обходит RLS
-- по умолчанию — дополнительных политик не требуется.
