/**
 * Авторизация FryFlow: имя + PIN-код (задача 10).
 *
 * Приложение работает на моках в localStorage, поэтому вход — локальный:
 * сессия живёт в ключе `fryflow-auth` рядом с CRM-данными. PIN хранится
 * как btoa-хэш (не открытым текстом), пары по умолчанию — Taleh / 1234.
 *
 * Структура ключа:
 *   { name, pinHash, loginAt }
 *   • loginAt !== null — сессия активна (владелец вошёл);
 *   • «Выйти» обнуляет loginAt, но НЕ pinHash — сменённый PIN
 *     переживает выход, иначе после каждого входа он откатывался
 *     бы к 1234.
 *
 * Guard стоит в AppShell: без активной сессии любой экран
 * перебрасывает на /login. При подключении Supabase этот модуль
 * заменяется на supabase.auth с тем же контрактом.
 */

export interface AuthState {
  /** Логин владельца (по умолчанию Taleh). */
  name: string;
  /** btoa(PIN) — 4 цифры. */
  pinHash: string;
  /** Timestamp входа; null — сессии нет. */
  loginAt: number | null;
}

export const AUTH_KEY = "fryflow-auth";
export const DEFAULT_LOGIN_NAME = "Taleh";
export const DEFAULT_PIN = "1234";

/** btoa-хэш PIN (простое запутывание, не криптография — данные локальные). */
export function hashPin(pin: string): string {
  return btoa(pin);
}

function defaultAuth(): AuthState {
  return { name: DEFAULT_LOGIN_NAME, pinHash: hashPin(DEFAULT_PIN), loginAt: null };
}

/** Читает состояние из localStorage, толерантно к мусору и первому запуску. */
export function readAuth(): AuthState {
  if (typeof window === "undefined") return defaultAuth();
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return defaultAuth();
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    return {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : DEFAULT_LOGIN_NAME,
      pinHash:
        typeof parsed.pinHash === "string" && parsed.pinHash
          ? parsed.pinHash
          : hashPin(DEFAULT_PIN),
      loginAt: typeof parsed.loginAt === "number" ? parsed.loginAt : null,
    };
  } catch {
    return defaultAuth();
  }
}

function writeAuth(state: AuthState): void {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(state));
  } catch {
    /* localStorage переполнен/заблокирован — вход просто не запомнится */
  }
}

/** Активна ли сессия (вызывается только на клиенте). */
export function isLoggedIn(): boolean {
  return readAuth().loginAt !== null;
}

/** Имя из последнего входа (для шапки и настроек). */
export function currentLoginName(): string {
  return readAuth().name;
}

/**
 * Вход: сверяет PIN с сохранённым хэшем, запоминает имя и открывает
 * сессию. false — неверный PIN.
 */
export function login(name: string, pin: string): boolean {
  const state = readAuth();
  if (hashPin(pin) !== state.pinHash) return false;
  const cleanName = name.trim() || DEFAULT_LOGIN_NAME;
  writeAuth({ ...state, name: cleanName, loginAt: Date.now() });
  return true;
}

/** Выход: сессия закрывается, PIN и имя остаются для следующего входа. */
export function logout(): void {
  const state = readAuth();
  writeAuth({ ...state, loginAt: null });
}

/**
 * Смена PIN: старый должен совпадать, новый — ровно 4 цифры.
 * false — старый неверный или новый некорректен.
 */
export function changePin(oldPin: string, newPin: string): boolean {
  const state = readAuth();
  if (hashPin(oldPin) !== state.pinHash) return false;
  if (!/^\d{4}$/.test(newPin)) return false;
  writeAuth({ ...state, pinHash: hashPin(newPin) });
  return true;
}

/**
 * Сброс забытого PIN на 1234 — страховка владельца. Доступен только
 * после ввода служебного имени Taleh (подтверждение, что это хозяин,
 * а не любопытный сотрудник у чужого телефона).
 */
export function resetPin(name: string): boolean {
  if (name.trim().toLowerCase() !== DEFAULT_LOGIN_NAME.toLowerCase()) return false;
  const state = readAuth();
  writeAuth({ ...state, pinHash: hashPin(DEFAULT_PIN) });
  return true;
}
