const RESERVATION_REQUIRED_FIELDS = [
  "Guest Name",
  "Guest Phone Number",
  "Guest Email Address",
  "Home Address",
  "Start Date",
  "Number of Nights",
  "RV Length in Feet",
  "Are You Towing?",
  "RV Site Type",
  "Amps Needed"
];
const WEB_APP_VERSION = "2026-05-31f";

function doGet(e) {
  const mode = (e && e.parameter && e.parameter.mode) || "";

  if (mode === "health") {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, service: "bsl-reservation-web-app", version: WEB_APP_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService
    .createHtmlOutput(`<p>Bay St. Louis Campground reservation web app ${WEB_APP_VERSION} is running.</p>`)
    .setTitle("Bay St. Louis Campground Reservation Web App")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const requestId = getField_(e, "request_id") || createShortRequestId_();

  try {
    const reservation = normalizeReservation_(e);
    reservation.requestId = reservation.requestId || requestId;
    validateReservation_(reservation);

    const subject = reservation.requestSubject || buildSubject_(reservation);
    sendReservationEmail_(reservation, subject);
    const telegramResult = sendTelegramAlert_(reservation, subject);

    return buildJsonResponse_({
      ok: true,
      requestId: requestId,
      message: buildSuccessMessage_(telegramResult),
      version: WEB_APP_VERSION
    });
  } catch (error) {
    console.error(error);
    return buildJsonResponse_({
      ok: false,
      requestId: requestId,
      message: "We could not send the request right now. Please call Bay St. Louis Campground at (228) 467-2080.",
      version: WEB_APP_VERSION
    });
  }
}

function listTelegramUpdates() {
  const token = getRequiredProperty_("TELEGRAM_BOT_TOKEN");
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    muteHttpExceptions: true
  });

  const payload = response.getContentText();
  console.log(payload);
  return payload;
}

function setTelegramChatIdFromLatestUpdate() {
  const raw = listTelegramUpdates();
  const data = JSON.parse(raw);
  const updates = Array.isArray(data.result) ? data.result : [];

  if (!updates.length) {
    throw new Error("No Telegram updates were found. Send a message to the bot first, then run this function again.");
  }

  const latest = updates[updates.length - 1];
  const chat = getChatFromUpdate_(latest);

  if (!chat || typeof chat.id === "undefined") {
    throw new Error("Could not find a chat id in the latest Telegram update.");
  }

  PropertiesService.getScriptProperties().setProperty("TELEGRAM_CHAT_ID", String(chat.id));
  const message = `Stored Telegram chat id ${chat.id} for ${chat.title || chat.username || chat.first_name || "Telegram chat"}.`;
  console.log(message);
  return message;
}

function sendTestReservationNotification() {
  const reservation = {
    requestId: createShortRequestId_(),
    guestName: "Test Guest",
    guestPhone: "228-000-0000",
    guestEmail: "test@example.com",
    homeAddress: "123 Example St, Bay St. Louis, MS",
    startDate: "2026-06-05",
    nights: "2",
    rvLengthFeet: "40",
    towing: "No",
    rvSiteType: "Pull-Through",
    ampsNeeded: "50 Amps",
    reservationSummary: "Test reservation summary"
  };

  reservation.requestSubject = buildSubject_(reservation);
  const subject = reservation.requestSubject;
  sendReservationEmail_(reservation, subject);
  const telegramResult = sendTelegramAlert_(reservation, subject);
  const message = telegramResult.status === "failed"
    ? `Test reservation email sent, but Telegram failed: ${telegramResult.reason}`
    : "Test reservation email and Telegram notification sent.";
  console.log(message);
  return message;
}

function normalizeReservation_(e) {
  return {
    requestId: getField_(e, "request_id"),
    guestName: getField_(e, "Guest Name"),
    guestPhone: getField_(e, "Guest Phone Number"),
    guestEmail: getField_(e, "Guest Email Address"),
    homeAddress: getField_(e, "Home Address"),
    startDate: getField_(e, "Start Date"),
    nights: getField_(e, "Number of Nights"),
    rvLengthFeet: getField_(e, "RV Length in Feet"),
    towing: getField_(e, "Are You Towing?"),
    rvSiteType: getField_(e, "RV Site Type"),
    ampsNeeded: getField_(e, "Amps Needed"),
    requestSubject: getField_(e, "request_subject"),
    replyToEmail: getField_(e, "reply_to_email"),
    reservationSummary: getField_(e, "reservation_summary")
  };
}

function validateReservation_(reservation) {
  RESERVATION_REQUIRED_FIELDS.forEach((fieldName) => {
    const value = getReservationFieldValue_(reservation, fieldName);
    if (!value) {
      throw new Error(`Missing required field: ${fieldName}`);
    }
  });
}

function buildSubject_(reservation) {
  const guestName = String(reservation.guestName || "").trim() || "Unknown guest";
  const formattedDate = formatDateForSubject_(reservation.startDate);
  const nightLabel = String(reservation.nights) === "1" ? "night" : "nights";
  const nights = String(reservation.nights || "").trim();
  const reference = buildRequestReference_(reservation.requestId);
  const referenceSegment = reference ? ` | Ref ${reference}` : "";

  if (nights) {
    return `New RV reservation request | ${guestName} | ${formattedDate} | ${nights} ${nightLabel}${referenceSegment}`;
  }

  return `New RV reservation request | ${guestName} | ${formattedDate}${referenceSegment}`;
}

function sendReservationEmail_(reservation, subject) {
  const recipientEmail = getRequiredProperty_("RESERVATION_TO_EMAIL");
  const body = buildPlainTextBody_(reservation, subject);
  const htmlBody = buildHtmlBody_(reservation, subject);

  MailApp.sendEmail({
    to: recipientEmail,
    subject: subject,
    body: body,
    htmlBody: htmlBody,
    name: getOptionalProperty_("MAIL_FROM_NAME") || "Bay St. Louis Campground Website",
    replyTo: reservation.replyToEmail || reservation.guestEmail
  });
}

function sendTelegramAlert_(reservation, subject) {
  const token = getOptionalProperty_("TELEGRAM_BOT_TOKEN");
  const chatId = getOptionalProperty_("TELEGRAM_CHAT_ID");

  if (!token || !chatId) {
    return { status: "skipped" };
  }

  const message = [
    subject,
    `Request ID: ${reservation.requestId || "Not provided"}`,
    `Guest: ${reservation.guestName}`,
    `Phone: ${reservation.guestPhone}`,
    `Email: ${reservation.guestEmail}`,
    `Address: ${reservation.homeAddress}`,
    `Arrival: ${formatDateForSubject_(reservation.startDate)}`,
    `Nights: ${reservation.nights}`,
    `RV: ${reservation.rvLengthFeet} ft`,
    `Towing: ${reservation.towing}`,
    `Site Type: ${reservation.rvSiteType}`,
    `Amps: ${reservation.ampsNeeded}`
  ].join("\n");

  try {
    callTelegramApi_("sendMessage", {
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true
    }, token);
    return { status: "sent" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Telegram notification failed: ${reason}`);
    return { status: "failed", reason: reason };
  }
}

function buildPlainTextBody_(reservation, subject) {
  return [
    subject,
    "",
    `Request ID: ${reservation.requestId || "Not provided"}`,
    `Guest Name: ${reservation.guestName}`,
    `Guest Phone Number: ${reservation.guestPhone}`,
    `Guest Email Address: ${reservation.guestEmail}`,
    `Home Address: ${reservation.homeAddress}`,
    `Start Date: ${formatDateForSubject_(reservation.startDate)}`,
    `Number of Nights: ${reservation.nights}`,
    `RV Length in Feet: ${reservation.rvLengthFeet}`,
    `Are You Towing?: ${reservation.towing}`,
    `RV Site Type: ${reservation.rvSiteType}`,
    `Amps Needed: ${reservation.ampsNeeded}`,
    "",
    `Reservation Summary: ${reservation.reservationSummary || buildReservationSummary_(reservation)}`
  ].join("\n");
}

function buildHtmlBody_(reservation, subject) {
  const rows = [
    ["Request ID", reservation.requestId || "Not provided"],
    ["Guest Name", reservation.guestName],
    ["Guest Phone Number", reservation.guestPhone],
    ["Guest Email Address", reservation.guestEmail],
    ["Home Address", reservation.homeAddress],
    ["Start Date", formatDateForSubject_(reservation.startDate)],
    ["Number of Nights", reservation.nights],
    ["RV Length in Feet", reservation.rvLengthFeet],
    ["Are You Towing?", reservation.towing],
    ["RV Site Type", reservation.rvSiteType],
    ["Amps Needed", reservation.ampsNeeded],
    ["Reservation Summary", reservation.reservationSummary || buildReservationSummary_(reservation)]
  ]
    .map(([label, value]) => `<tr><th align="left" style="padding:8px 12px;border-bottom:1px solid #d6dfdf;">${escapeHtml_(label)}</th><td style="padding:8px 12px;border-bottom:1px solid #d6dfdf;">${escapeHtml_(String(value || ""))}</td></tr>`)
    .join("");

  return [
    `<h2 style="font-family:Arial,sans-serif;color:#102a35;">${escapeHtml_(subject)}</h2>`,
    '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;color:#102a35;background:#fffdf9;border:1px solid #d6dfdf;border-radius:12px;overflow:hidden;">',
    rows,
    "</table>"
  ].join("");
}

function buildReservationSummary_(reservation) {
  return [
    `Request ID: ${reservation.requestId || "Not provided"}`,
    `Guest: ${reservation.guestName}`,
    `Phone: ${reservation.guestPhone}`,
    `Email: ${reservation.guestEmail}`,
    `Address: ${reservation.homeAddress}`,
    `Arrival: ${formatDateForSubject_(reservation.startDate)}`,
    `Nights: ${reservation.nights}`,
    `RV Length: ${reservation.rvLengthFeet} ft`,
    `Towing: ${reservation.towing}`,
    `RV Site Type: ${reservation.rvSiteType}`,
    `Amps Needed: ${reservation.ampsNeeded}`
  ].join(" | ");
}

function buildJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: Boolean(payload.ok),
      requestId: String(payload.requestId || ""),
      message: String(payload.message || ""),
      version: String(payload.version || WEB_APP_VERSION)
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildSuccessMessage_(telegramResult) {
  const baseMessage = "Your booking request was sent to Bay St. Louis Campground. The team will review availability and contact you soon.";

  if (!telegramResult || telegramResult.status === "sent" || telegramResult.status === "skipped") {
    return baseMessage;
  }

  const reason = String(telegramResult.reason || "").trim();
  if (reason) {
    return `${baseMessage} Email was sent, but the Telegram staff alert failed: ${reason}`;
  }

  return `${baseMessage} Email was sent, but the Telegram staff alert failed. Please check the Apps Script Telegram settings.`;
}

function buildRequestReference_(requestId) {
  const rawValue = String(requestId || "").trim();
  if (!rawValue) {
    return "";
  }

  return rawValue.slice(-5);
}

function createShortRequestId_() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function runTelegramDiagnostics() {
  const token = getRequiredProperty_("TELEGRAM_BOT_TOKEN");
  const chatId = getRequiredProperty_("TELEGRAM_CHAT_ID");
  const botPayload = callTelegramApi_("getMe", {}, token);
  const chatPayload = callTelegramApi_("getChat", { chat_id: chatId }, token);
  const bot = botPayload && botPayload.result ? botPayload.result : {};
  const chat = chatPayload && chatPayload.result ? chatPayload.result : {};
  const chatName = chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.id || "Unknown chat";
  const isBotChat = String(chat.id || "") === String(bot.id || "")
    || (String(chat.type || "") === "private" && String(chat.username || "") === String(bot.username || ""));

  const lines = [
    `Telegram bot is reachable for ${WEB_APP_VERSION}.`,
    `Bot: ${bot.username || bot.first_name || bot.id || "Unknown bot"}`,
    `Chat ID: ${chatId}`,
    `Chat: ${chatName}`
  ];

  if (isBotChat) {
    lines.push("Problem: TELEGRAM_CHAT_ID currently points to the bot itself. Send a message to the bot from the real recipient account or target group, then run setTelegramChatIdFromLatestUpdate() again.");
  }

  const report = lines.join("\n");
  console.log(report);
  return report;
}

function callTelegramApi_(method, payload, token) {
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "post",
    payload: payload || {},
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  let data = null;

  try {
    data = JSON.parse(responseText);
  } catch (error) {
    data = null;
  }

  if (statusCode < 200 || statusCode >= 300 || !data || data.ok !== true) {
    const reason = data && data.description
      ? data.description
      : responseText || `Telegram ${method} failed with HTTP ${statusCode}.`;
    throw new Error(reason);
  }

  return data;
}

function getField_(e, fieldName) {
  if (!e || !e.parameter) {
    return "";
  }

  return String(e.parameter[fieldName] || "").trim();
}

function getReservationFieldValue_(reservation, fieldName) {
  const fieldMap = {
    "Guest Name": reservation.guestName,
    "Guest Phone Number": reservation.guestPhone,
    "Guest Email Address": reservation.guestEmail,
    "Home Address": reservation.homeAddress,
    "Start Date": reservation.startDate,
    "Number of Nights": reservation.nights,
    "RV Length in Feet": reservation.rvLengthFeet,
    "Are You Towing?": reservation.towing,
    "RV Site Type": reservation.rvSiteType,
    "Amps Needed": reservation.ampsNeeded
  };

  return String(fieldMap[fieldName] || "").trim();
}

function formatDateForSubject_(value) {
  if (!value) {
    return "an unspecified date";
  }

  const parts = String(value).split("-");
  if (parts.length !== 3) {
    return String(value);
  }

  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "MMM d, yyyy");
}

function getRequiredProperty_(key) {
  const value = getOptionalProperty_(key);
  if (!value) {
    throw new Error(`Missing required script property: ${key}`);
  }
  return value;
}

function getOptionalProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || "").trim();
}

function getChatFromUpdate_(update) {
  return update.message && update.message.chat
    || update.edited_message && update.edited_message.chat
    || update.channel_post && update.channel_post.chat
    || update.callback_query && update.callback_query.message && update.callback_query.message.chat
    || null;
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}