import {
  answerCallbackQuery,
  editMessageReplyMarkup,
  findAlertByClient,
  findAlertByOrder,
  findDraft,
  markAlertPaid,
  markAlertReminded,
  sendTgMessage,
  setDraftStatus,
  type TelegramConfig,
} from "@/lib/telegram-server";
import {
  buildClientAutoReply,
  buildDebtReminder,
  buildNewOrderNotification,
  cleanPhone,
  fmtDate,
  navUrl,
  SEPARATOR,
  type TgMessage,
} from "@/lib/telegram-templates";

/**
 * Обработка нажатий inline-кнопок (задача 25).
 *
 * Telegram присылает callback_query в вебхук. Формат данных кнопки —
 * «action:entityId»: confirm:tg-abc123, reject:tg-abc123, call:<clientId>,
 * remind:<orderId>, paid:<orderId>, nav:callbacks / nav:draft:<draftId>.
 *
 * Правила:
 *  • answerCallbackQuery вызывается ВСЕГДА — иначе в Telegram у кнопки
 *    бесконечно крутятся «часики»;
 *  • после действия кнопки убираются editMessageReplyMarkup с пустой
 *    клавиатурой (сообщение остаётся, история не теряется);
 *  • повторное нажатие (заявку уже обработали) — «Заявка уже обработана»,
 *    кнопки не трогаем;
 *  • nav:-кнопки не убираем: нажатая кнопка превращается в прямую
 *    ссылку на раздел FryFlow (второй тап открывает приложение).
 */

/** Строка inline-клавиатуры (callback или url-кнопка). */
export interface TgKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

/** callback_query от Telegram (поля, которые нам нужны). */
export interface TgCallbackQuery {
  id: string;
  from?: { id?: number; first_name?: string; username?: string };
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
    reply_markup?: { inline_keyboard?: TgKeyboardButton[][] };
  };
  data?: string;
}

/** Прямая ссылка на сообщение, где нажата кнопка. */
interface CallbackOrigin {
  chatId?: string;
  messageId?: number;
}

function originOf(cq: TgCallbackQuery): CallbackOrigin {
  const chat = cq.message?.chat?.id;
  return {
    chatId: chat !== undefined ? String(chat) : undefined,
    messageId: cq.message?.message_id,
  };
}

/** Убирает кнопки под сообщением (пустая клавиатура). */
async function removeButtons(
  token: string,
  origin: CallbackOrigin
): Promise<void> {
  if (!origin.chatId || !origin.messageId) return;
  await editMessageReplyMarkup(token, origin.chatId, origin.messageId, {
    inline_keyboard: [],
  });
}

/* ── Заявки: confirm / reject ────────────────────────────── */

async function handleDraftAction(
  cfg: TelegramConfig,
  action: "confirm" | "reject",
  draftId: string,
  origin: CallbackOrigin
): Promise<{ answer: string }> {
  const draft = await findDraft(draftId);
  if (!draft) {
    return { answer: "Заявка не найдена — возможно, уже обработана в приложении." };
  }
  const status = draft.status ?? "pending";
  if (status !== "pending") {
    /* Кто-то нажал кнопку раньше (или заявку закрыли в приложении). */
    return { answer: "Заявка уже обработана." };
  }
  const ok = await setDraftStatus(draftId, action === "confirm" ? "confirmed" : "rejected");
  if (!ok) return { answer: "Не удалось обновить заявку — попробуйте в приложении." };
  /* Кнопки убираем только при успешном действии. */
  await removeButtons(cfg.botToken, origin);
  return {
    answer:
      action === "confirm"
        ? "✅ Заказ создан — появится в приложении при открытии «Заказов»."
        : "❌ Заявка отклонена.",
  };
}

/* ── Кнопка «Позвонить»: tel: через answerCallbackQuery ──── */

async function handleCall(
  cfg: TelegramConfig,
  cq: TgCallbackQuery,
  clientId: string
): Promise<void> {
  const alert = await findAlertByClient(clientId);
  const tel = alert?.phone ? cleanPhone(alert.phone) : null;
  if (!tel) {
    await answerCallbackQuery(cfg.botToken, cq.id, {
      text: alert ? "Телефон клиента не указан." : "Клиент не найден — кнопка из старого сообщения.",
    });
    return;
  }
  /* tel: в url открывает звонилку на мобильном Telegram; если клиент
   * Telegram не умеет — показываем номер плашкой (номер кликабелен
   * в тексте самого сообщения). */
  const r = await answerCallbackQuery(cfg.botToken, cq.id, { url: tel });
  if (r.ok) return;
  await answerCallbackQuery(cfg.botToken, cq.id, {
    text: `📞 ${alert?.phone ?? tel}`,
    showAlert: true,
  });
}

/* ── Кнопка «Напомнить»: напоминание об оплате ───────────── */

async function handleRemind(
  cfg: TelegramConfig,
  orderId: string
): Promise<{ answer: string }> {
  const alert = await findAlertByOrder(orderId);
  if (!alert) {
    return { answer: "Заказ не найден — напоминание доступно в приложении." };
  }
  const reminder = buildDebtReminder(
    { name: alert.clientName, phone: alert.phone },
    { amount: alert.amount, days: alert.days }
  );
  let sentWhere = "";
  if (alert.clientChatId) {
    /* Заказ пришёл из Telegram — клиенту можно написать напрямую. */
    const r = await sendTgMessage(cfg.botToken, alert.clientChatId, reminder);
    if (r.ok) sentWhere = "клиенту в Telegram";
  }
  if (!sentWhere) {
    /* Прямого чата нет — владельцу, готовое к пересылке клиенту. */
    const forwardable: TgMessage = {
      text:
        `💬 <b>Напоминание — перешлите клиенту</b>\n\n` +
        `${SEPARATOR}\n\n` +
        reminder.text.replace(
          /^💰 <b>Напоминание об оплате<\/b>\n\n━━━━━━━━━━━━━━━━━━\n\n/,
          ""
        ),
    };
    const r = await sendTgMessage(cfg.botToken, cfg.chatId, forwardable);
    if (!r.ok) return { answer: "Не удалось отправить — проверьте Telegram." };
    sentWhere = "вам — перешлите клиенту";
  }
  await markAlertReminded(orderId);
  return { answer: `✅ Напоминание отправлено (${sentWhere}).` };
}

/* ── Кнопка «Оплачено»: отметить заказ ───────────────────── */

async function handlePaid(
  cfg: TelegramConfig,
  orderId: string,
  origin: CallbackOrigin
): Promise<{ answer: string }> {
  const alert = await findAlertByOrder(orderId);
  if (!alert) {
    return { answer: "Заказ не найден — отметьте оплату в приложении." };
  }
  if (alert.paidAt && !alert.appliedAt) {
    return { answer: "Уже отмечено — применится при открытии приложения." };
  }
  const ok = await markAlertPaid(orderId);
  if (!ok) return { answer: "Не удалось отметить — попробуйте в приложении." };
  await removeButtons(cfg.botToken, origin);
  return {
    answer: "✅ Отмечено как оплачено — применится при открытии приложения.",
  };
}

/* ── Навигация: nav:clients, nav:draft:<id>… ─────────────── */

async function handleNav(
  cfg: TelegramConfig,
  cq: TgCallbackQuery,
  nav: string,
  origin: CallbackOrigin
): Promise<{ answer: string }> {
  const url = navUrl(nav);
  if (!url) return { answer: "Раздел не найден." };

  /* Нажатая кнопка становится прямой ссылкой на раздел — второй
   * тап открывает FryFlow. Остальные кнопки не трогаем. */
  if (origin.chatId && origin.messageId && cq.message?.reply_markup?.inline_keyboard) {
    const rows = cq.message.reply_markup.inline_keyboard.map((row) =>
      row.map((btn) =>
        btn.callback_data === cq.data
          ? { text: `${btn.text} ↗`, url }
          : { text: btn.text, ...(btn.callback_data ? { callback_data: btn.callback_data } : {}) }
      )
    );
    await editMessageReplyMarkup(cfg.botToken, origin.chatId, origin.messageId, {
      inline_keyboard: rows,
    });
  }
  const path = url.replace("https://fryflow.vercel.app", "") || "/";
  return { answer: `Кнопка «↗» открывает: fryflow.vercel.app${path}` };
}

/* ── Единая точка входа ──────────────────────────────────── */

export async function handleCallbackQuery(
  cfg: TelegramConfig,
  cq: TgCallbackQuery
): Promise<{ ok: boolean; action: string; answer: string }> {
  const origin = originOf(cq);
  const data = cq.data ?? "";
  const [action, ...rest] = data.split(":");
  const entityId = rest.join(":");

  let result: { answer: string } = { answer: "" };

  try {
    if (action === "confirm" || action === "reject") {
      result = await handleDraftAction(cfg, action, entityId, origin);
    } else if (action === "call") {
      await handleCall(cfg, cq, entityId);
      result = { answer: "" };
    } else if (action === "remind") {
      result = await handleRemind(cfg, entityId);
    } else if (action === "paid") {
      result = await handlePaid(cfg, entityId, origin);
    } else if (action === "nav") {
      result = await handleNav(cfg, cq, entityId, origin);
    } else {
      result = { answer: "Неизвестная команда." };
    }
  } catch {
    result = { answer: "Ошибка обработки — попробуйте ещё раз." };
  }

  /* Снимаем «часики» всегда, даже если действие не удалось. */
  await answerCallbackQuery(cfg.botToken, cq.id, {
    ...(result.answer ? { text: result.answer } : {}),
  });

  return { ok: true, action: data, answer: result.answer };
}

/* ── Новая заявка: уведомление владельцу + автоответ клиенту ── */

/**
 * Заявка из вебхука: владельцу — 🆕 с кнопками «Подтвердить/Отклонить»,
 * клиенту — ✅ автоответ без кнопок (шаблоны telegram-templates).
 */
export async function notifyNewDraft(
  cfg: TelegramConfig,
  draft: {
    id: string;
    clientName: string;
    boxes: number;
    total: number;
    deliveryDate: string;
    message: string;
  },
  clientChatId?: string
): Promise<{
  ownerSent: boolean;
  clientSent: boolean;
  ownerMessageIds: number[];
  ownerError?: string;
}> {
  const kg = Math.round(draft.boxes * 25) / 10;
  const when = fmtDate(draft.deliveryDate);

  const owner = await sendTgMessage(
    cfg.botToken,
    cfg.chatId,
    buildNewOrderNotification({
      draftId: draft.id,
      clientName: draft.clientName,
      boxes: draft.boxes,
      kg,
      total: draft.total,
      deliveryDate: when,
      originalText: draft.message,
    })
  );

  let clientSent = false;
  if (clientChatId) {
    const r = await sendTgMessage(
      cfg.botToken,
      clientChatId,
      buildClientAutoReply({
        boxes: draft.boxes,
        deliveryDate: when,
        total: draft.total,
      })
    );
    clientSent = r.ok;
  }

  return {
    ownerSent: owner.ok,
    clientSent,
    ownerMessageIds: owner.messageIds,
    ...(owner.ok ? {} : { ownerError: owner.error }),
  };
}
