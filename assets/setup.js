"use strict";

const setupCatalog = {};
for (const [category, cards] of Object.entries(serviceCards)) {
  for (const [mode, provider, name, mark, , , key = provider] of cards) {
    setupCatalog[key] = {key, category, mode, provider, name, mark};
  }
}
const setupGuides = {
  amocrm: ["В amoМаркет откройте создание интеграции и выберите приватную интеграцию для своего аккаунта.",
    "Выдайте доступ к CRM. В разделе «Ключи и доступы» создайте долгосрочный токен.",
    "Скопируйте токен и адрес аккаунта, например https://komanda.amocrm.ru.", "https://www.amocrm.ru/developers/content/oauth/step-by-step"],
  retailcrm: ["Откройте «Настройки → Интеграция → Ключи доступа к API». Создайте ключ для нужного магазина.",
    "Разрешите чтение клиентов, заказов и задач.", "Подготовьте адрес магазина, ключ и часовой пояс CRM.", "https://docs.retailcrm.ru/Users/Integration"],
  custom: ["Опубликуйте GET-адрес с JSON по примеру ниже. Для локального адаптера подойдёт http://localhost.",
    "Свяжите сделки и звонки с клиентами по постоянным ID. Передавайте дату со смещением часового пояса.",
    "Если выгружаете только звонки, на следующем шаге выберите подключённую CRM и используйте её внешние ID."],
  zadarma: ["В личном кабинете Zadarma откройте настройки API и создайте пару «ключ и секрет».",
    "Включите запись в настройках внутренних номеров АТС, если хотите прослушивать звонки.",
    "Завершите тестовый звонок и проверьте, что он появился в статистике АТС.", providerFields.zadarma.docs],
  mango: ["В кабинете ВАТС откройте «Интеграции → API Коннектор». Включите доступ к статистике и нужным записям.",
    "Передайте код ВАТС и ключ подписи своему адаптеру MANGO OFFICE. Адаптер преобразует историю звонков в формат Pacto.",
    "Подготовьте GET-адрес адаптера с завершённым тестовым звонком и номером клиента.", "https://docs.mango-office.ru/ru/4_integratsii/6_arhiv-integratsii/1_support-integratsiya-api/3_restapivatshelp/1_obshchie_voprosy_po_api_vats_mango_office/index.html"],
  asterisk: ["Попросите администратора АТС открыть адаптеру журнал CDR. Для аудио включите запись через MixMonitor.",
    "Настройте адаптер на выдачу звонков в формате Pacto. Используйте постоянный ID вызова, дату и номер клиента.",
    "Сделайте тестовый звонок и подготовьте GET-адрес выгрузки.", "https://docs.asterisk.org/Latest_API/API_Documentation/Dialplan_Applications/MixMonitor/"],
  phone_api: ["Подготовьте адаптер своей АТС с GET-адресом для завершённых звонков.",
    "Передавайте ID звонка, дату, номер клиента и доступную запись или расшифровку.",
    "Добавьте синтетический звонок в выгрузку и проверьте её по примеру ниже."],
  zoom: ["В Zoom App Marketplace создайте приложение Server-to-Server OAuth для аккаунта организатора.",
    "Разрешите чтение облачных записей организатора и активируйте приложение.",
    "Подготовьте Account ID, Client ID, Client Secret и email организатора. Завершите тестовую встречу с облачной записью.", providerFields.zoom.docs],
  meet: ["В Google Cloud включите Google Meet REST API и Google Drive API. Создайте OAuth-клиент.",
    "Разрешите чтение завершённых встреч и их файлов (meetings.space.readonly и drive.meet.readonly).",
    "Получите refresh token с offline-доступом от организатора. Проверьте, что ему доступны запись или расшифровка тестовой встречи.", providerFields.meet.docs],
  meeting_api: ["Подготовьте GET-адрес адаптера сервиса видеовстреч.",
    "Добавьте завершённую встречу с ID, временем, идентификатором клиента и записью или текстом.",
    "Сверьте ответ с примером. Pacto предложит выбрать клиента, если связь пока неизвестна."],
  telegram: ["Откройте @BotFather, выполните /newbot и сохраните выданный токен.",
    "Используйте отдельного рабочего бота без активного вебхука и другого получателя обновлений.",
    "Отправьте боту тестовое сообщение. Pacto получит доступные новые сообщения и голосовые.", "https://t.me/BotFather"],
  whatsapp: ["В Meta настройте WhatsApp Business Platform для рабочего номера.",
    "Подпишите свой адаптер на уведомления messages. Адаптер сохраняет входящие сообщения и выдаёт их через GET в формате Pacto.",
    "Отправьте тестовое сообщение на номер и подготовьте адрес выгрузки адаптера.", "https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/"],
  chat_api: ["Подключите свой адаптер к рабочему чату и разрешите чтение нужных сообщений.",
    "Выведите события через GET. У каждого сообщения должны быть постоянный ID, время, текст и идентификатор собеседника.",
    "Отправьте тестовое сообщение и сравните выгрузку с примером ниже."],
  gmail: ["В Google Cloud включите Gmail API. Разрешите почтовому адаптеру читать выбранный тестовый ящик через OAuth (gmail.readonly).",
    "В адаптере выберите письма по сделкам и сопоставьте адресата с ID клиента в Pacto.",
    "На следующем шаге получите адрес приёма и ключ. Их нужно указать в вашем адаптере.", "https://developers.google.com/workspace/gmail/api/guides/list-messages"],
  outlook: ["В Microsoft Entra зарегистрируйте приложение для почтового адаптера. Выдайте доступ Microsoft Graph Mail.Read к тестовому ящику.",
    "Настройте чтение писем через Graph и сопоставьте адресата с ID клиента в Pacto.",
    "Получите адрес и ключ приёма на следующем шаге и добавьте их в адаптер.", "https://learn.microsoft.com/en-us/graph/api/user-list-messages"],
  mail_api: ["Подготовьте адаптер, который читает письма из вашей почтовой системы.",
    "Для каждого письма передайте постоянный ID, дату, текст и ID существующего клиента Pacto.",
    "Получите адрес приёма и ключ на следующем шаге. Адаптер отправляет письмо в Pacto методом POST."]
};

const serviceSettingsLinks = {
  meet: ["Открыть учётные данные Google Cloud", "https://console.cloud.google.com/apis/credentials"],
  gmail: ["Открыть Gmail API в Google Cloud", "https://console.cloud.google.com/apis/library/gmail.googleapis.com"],
  outlook: ["Открыть Microsoft Entra", "https://entra.microsoft.com/"],
  zoom: ["Открыть Zoom App Marketplace", "https://marketplace.zoom.us/develop/create"],
  whatsapp: ["Открыть приложения Meta", "https://developers.facebook.com/apps/"]
};
const setupDialog = $("setup-dialog");
const demoServices = new Set();
let setupSession;

function withDemoServices(snapshot) {
  if (!demoServices.size) return snapshot;
  const next = {...snapshot};
  for (const field of ["clients", "deals", "calls", "sources", "crm_connections", "channel_connections"]) {
    next[field] = [...(snapshot[field] || [])];
  }
  for (const key of demoServices) {
    const svc = setupCatalog[key];
    const id = "demo-setup-" + key;
    const crm = svc.mode === "crm";
    const clientId = crm ? id + "-client" : "alpha";
    const dealId = crm ? id + "-deal" : "alpha-sync";
    const at = snapshot.generated_at;
    const channel = {phone: "call", meeting: "meeting", chat: "message", mail: "email", crm: "call"}[svc.category];
    const title = {call: "Звонок по доставке", meeting: "Встреча по доставке", message: "Сообщение о доставке", email: "Письмо о доставке"}[channel];
    if (crm) {
      next.clients.push({id: clientId, name: "Тестовый клиент · " + svc.name});
      next.deals.push({...sourceExample("crm").deals[0], id: dealId, client_id: clientId, title: "Поставка оборудования",
        result: "open", source_id: id, actions: [], suggestions: [], tasks: [{id: id + "-task", client_id: clientId,
          deal_id: dealId, source_id: id, title: "Согласовать дату доставки", side: "manager", status: "open", updated_at: at}]});
    }
    if (key !== "retailcrm") next.calls.unshift({id: id + "-event", client_id: clientId, deal_id: dealId, source_id: id,
      title: title + " · " + svc.name, channel, at, lines: [{id: "r1", speaker: "client", text: "Подтвердите дату доставки тестового заказа."}]});
    next.sources.push({id, name: svc.name, category: svc.category, service: svc.key, automatic: svc.mode !== "source",
      enabled: true, last_batch_at: at, last_batch_count: 1});
    if (svc.mode !== "source") next[crm ? "crm_connections" : "channel_connections"].push({id, provider: svc.provider,
      service: svc.key, host: "Учебный источник", next_at: at, succeeded_at: at, enabled: true, sample_client_id: clientId,
      counts: crm ? {clients: 1, deals: 1, tasks: 1, calls: Number(key !== "retailcrm"), changed: key === "retailcrm" ? 3 : 4} :
        {events: 1, changed: 1, pending: 0}});
  }
  return next;
}

function setupResultLink(id) {
  return `<button type="button" class="source-link" data-setup-result="${esc(id)}">Результат загрузки</button>`;
}

function setupExample(state) {
  const svc = state.svc;
  if (svc.provider === "channel_feed") {
    const event = {...channelFeeds[svc.category].event};
    delete event.recording;
    if (!event.lines) event.lines = [{id: "r1", speaker: "client", text: "Обсудим тестовый заказ."}];
    return {events: [{external_id: "example-1", at: "2026-01-10T09:00:00+03:00", ...event}]};
  }
  if (svc.key === "custom") {
    const example = sourceExample("crm");
    const deal = example.deals[0];
    const linked = $("setup-form").elements.link_to?.value;
    const call = {id: "call-1", client_id: linked ? "C_7" : deal.client_id, deal_id: linked ? "2" : deal.id,
      title: "Тестовый звонок", at: deal.updated_at, lines: [{id: "r1", speaker: "client", text: "Согласуем доставку."}]};
    return linked ? {calls: [call]} : {...example, calls: [call], tasks: [{id: "task-1", deal_id: deal.id, side: "manager", title: "Уточнить дату", updated_at: deal.updated_at}]};
  }
  const clientId = $("setup-form").elements.client_id?.value;
  if (!clientId) return null;
  return {calls: [{id: "mail-" + state.id + "-1", channel: "email", client_id: clientId, title: "Тестовое письмо",
    at: "2026-01-10T09:00:00+03:00", lines: [{id: "r1", speaker: "client", text: "Прошу подтвердить доставку."}]}]};
}

function setupField([name, label, type, value = "", required = true]) {
  return `<label for="setup-${name}">${esc(label)}</label><input id="setup-${name}" name="${name}" type="${type}" value="${esc(value)}"
    aria-describedby="setup-hint setup-status" autocomplete="${type === "password" ? "new-password" : "off"}" spellcheck="false" ${required ? "required" : ""}>`;
}

function accessFields(svc) {
  if (preview) return '<p id="setup-hint">Учебный источник готов к проверке.</p>';
  if (svc.mode === "source") return setupField(["name", "Название ящика в Pacto", "text", svc.name]) +
    '<small id="setup-hint">Можно добавить название отдела или адрес рабочего ящика.</small>';
  const isCrm = svc.mode === "crm";
  const fields = isCrm ? [["endpoint", svc.key === "custom" ? "GET-адрес выгрузки" : "Адрес аккаунта", "url"],
    ["token", {amocrm: "Долгосрочный токен", retailcrm: "Ключ API", custom: "Bearer-токен (если нужен)"}[svc.key],
      "password", "", svc.key !== "custom"]] : providerFields[svc.provider].fields;
  let html = fields.map(setupField).join("");
  if (svc.key === "retailcrm") html += setupField(["utc_offset", "Смещение времени CRM", "text", "+03:00"]);
  if (isCrm && svc.key !== "custom") html += '<label>Валюта по умолчанию<select name="currency">' +
    "RUB BYN KZT USD EUR UZS AMD KGS AZN MDL".split(" ").map(c => "<option>" + c + "</option>").join("") + "</select></label>";
  if (svc.key === "custom" && data.crm_connections?.some(c => c.provider !== "custom")) {
    html += '<label>Что загружать<select name="link_to"><option value="">Все данные CRM</option>' +
      data.crm_connections.filter(c => c.provider !== "custom").map(c => `<option value="${esc(c.id)}">Только звонки для ${esc(c.host)}</option>`).join("") +
      '</select></label><small>Для отдельных звонков замените ID клиента и сделки в примере на внешние ID выбранной CRM.</small>';
  }
  return html + '<small class="muted" id="setup-hint">Проверка читает доступные данные источника. Загрузку вы запустите следующим шагом.</small>';
}

function setupStep(state, step, title, html, action) {
  state.step = step;
  $("setup-content").innerHTML = `<h3 tabindex="-1">${esc(title)}</h3>` + html;
  setupDialog.querySelectorAll(".bitrix-steps li").forEach((item, i) => {
    if (step === i) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  $("setup-status").textContent = "";
  $("setup-next").textContent = action;
  $("setup-next").hidden = !action;
  $("setup-back").hidden = step !== 1 || !!state.id;
  $("setup-content").querySelector("h3").focus();
}
const exampleButton = '<button type="button" class="source-link" data-setup-example>Скачать пример JSON</button>';

function setupGuide(state) {
  const svc = state.svc;
  const [a, b, c, url] = setupGuides[svc.key];
  const canContinue = preview || canManageTeam();
  const settings = serviceSettingsLinks[svc.key];
  setupStep(state, 0, svc.mode === "source" ? "Подготовьте почтовый адаптер" :
    svc.provider === "channel_feed" ? "Подготовьте адаптер" : "Подготовьте источник",
    `<ol class="bitrix-instructions">${[a,b,c].map(t => "<li>" + esc(t) + "</li>").join("")}</ol>` +
    (settings ? `<p><a href="${settings[1]}" target="_blank" rel="noopener noreferrer">${settings[0]} ↗</a></p>` : "") +
    (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Инструкция сервиса ↗</a>` : "") +
    (svc.provider === "channel_feed" || svc.key === "custom" ? exampleButton : ""), canContinue ? "Продолжить" : "");
  if (!canContinue) $("setup-status").textContent = "Подключение настраивает руководитель.";
}
function setupAccess(state) {
  state.verified = false;
  const mail = state.svc.mode === "source";
  setupStep(state, 1, mail ? "Создайте адрес приёма писем" : "Проверьте доступ",
    accessFields(state.svc) + (state.svc.key === "custom" ? exampleButton : ""),
    mail ? "Получить адрес и ключ" : "Проверить доступ");
}

function setupMailDelivery(state) {
  const clients = data.clients || [];
  const options = clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  const endpoint = preview ? "https://pacto.example/api/pipeline/sources/demo/events" :
    location.origin + "/api/pipeline/sources/" + state.id + "/events";
  setupStep(state, 1, "Отправьте первое письмо",
    `<p id="setup-hint">В адаптере выберите POST, тип application/json и заголовок Authorization: Bearer &lt;ключ&gt;.</p>
    <label>Адрес приёма<input readonly value="${esc(endpoint)}"></label>
    <label>Ключ · скопируйте сейчас<input type="password" readonly id="setup-mail-key" autocomplete="off"></label>
    <button type="button" class="source-link" data-copy-key>Скопировать ключ</button>` +
    (clients.length ? '<label>Клиент для тестового письма<select name="client_id">' + options + "</select></label>" + exampleButton :
      "<p>Сначала загрузите клиента из CRM, чтобы адаптер мог передать его ID.</p>"), preview ? "Загрузить пример письма" : "Проверить первое письмо");
  $("setup-mail-key").value = state.token;
}

function openSetup(svc, id) {
  const state = {svc, id, busy: false};
  setupSession = state;
  $("setup-title").textContent = svc.name;
  $("setup-logo").innerHTML = svc.mark.endsWith(".png") ? `<img src="assets/brands/${svc.mark}" width="40" height="40" alt="">` : esc(svc.mark);
  $("setup-demo").hidden = !preview;
  setupDialog.showModal();
  if (id) { setupResult(state); if (!preview) updateSetupResult(state); }
  else setupGuide(state);
}

function setupRow(state) {
  const key = {source: "sources", channel: "channel_connections", crm: "crm_connections"}[state.svc.mode];
  return entity(data[key] || [], state.id);
}

function setupResult(state) {
  clearTimeout(state.timer);
  const svc = state.svc;
  const row = setupRow(state);
  const mail = svc.mode === "source";
  const waiting = !row || (!mail && row.enabled && (row.running || !row.next_at));
  const calls = data.calls.filter(c => c.source_id === state.id).sort((a,b) => b.at.localeCompare(a.at));
  const call = calls[0];
  state.client = svc.mode === "crm" ? row?.sample_client_id || call?.client_id : call?.client_id;
  state.call = svc.mode !== "crm" ? call : null;
  const pending = (state.unmatched ?? row?.counts?.pending) && (preview || canManageTeam());
  let title, body, action;
  if (row?.enabled === false) {
    title = "Приём приостановлен"; body = "Возобновите источник в разделе подключений."; action = "Закрыть";
  } else if (waiting) {
    title = "Идёт первая загрузка"; body = "Pacto ожидает ответ источника."; action = "Обновить статус";
  } else if (row.error) {
    title = "Загрузка прервалась"; body = row.error; action = canManageTeam() ? "Повторить загрузку" : "Обновить статус";
  } else if (mail && !call) {
    title = "Ожидаем первое письмо"; body = "Отправьте тестовое письмо через адаптер, затем обновите статус."; action = "Обновить статус";
  } else {
    title = state.client || pending ? "Данные получены" : "Загрузка завершена";
    body = row.succeeded_at || row.last_batch_at ? "Последняя загрузка · " + date(row.succeeded_at || row.last_batch_at) : "";
    action = state.client ? (state.call ? "Открыть событие в досье" : "Открыть досье клиента") :
      pending ? "Выбрать клиента" : canManageTeam() && !preview ? "Повторить загрузку" : "Закрыть";
  }
  state.action = action;
  const counts = row?.counts || {};
  const stats = Object.entries({clients: "Клиенты", deals: "Сделки", tasks: "Задачи", calls: "Звонки", events: "События", pending: "Без клиента"})
    .filter(([key]) => counts[key] !== undefined).map(([key,label]) => `<div><dt>${label}</dt><dd>${esc(key === "pending" ? (state.unmatched ?? counts[key]) : counts[key])}</dd></div>`).join("");
  const empty = !waiting && !row?.error && !mail && !state.client && !pending && row?.enabled;
  setupStep(state, 2, title, `<p>${esc(body)}</p>` + (stats ? `<dl class="bitrix-counts">${stats}</dl>` : "") +
    (empty ? "<p>Подходящих данных пока нет. Добавьте тестовую запись в источник и повторите загрузку.</p>" : "") +
    (pending && state.client ? '<button type="button" data-pending-source>Разобрать события без клиента</button>' : ""), action);
  if (waiting && !preview) state.timer = setTimeout(() => updateSetupResult(state), 2000);
}

async function updateSetupResult(state) {
  if (state !== setupSession) return;
  try {
    await refresh();
    if (state !== setupSession) return;
    if (!preview && state.svc.mode === "channel" && canManageTeam() && setupRow(state)?.counts?.pending) {
      const queue = await api("/api/channels/pending?source_id=" + encodeURIComponent(state.id));
      // Large queues are paginated. Keep the last import count until the final page is visible.
      state.unmatched = queue.next ? undefined : queue.events.length;
    } else state.unmatched = undefined;
    if (state === setupSession) setupResult(state);
  } catch (error) {
    if (state !== setupSession) return;
    if (error.status === 401) return showLogin();
    $("setup-status").textContent = error.message;
  }
}

function navigateSetupResult(client, deal, call) {
  $("search").value = "";
  view = "clients";
  history.replaceState(null, "", "#clients");
  select(client, deal);
  if (call) openCall(call);
}

function openSetupPending(state) {
  setupDialog.close();
  pendingSource = state.id;
  $("channel-pending-content").replaceChildren();
  $("channel-pending").showModal();
  run(null, loadPending, $("channel-pending-status"));
}

async function submitSetup(state) {
  const svc = state.svc;
  const base = "/api/" + (svc.mode === "crm" ? "crm" : "channels");
  if (state.step === 2) {
    if (state.action === "Закрыть") return setupDialog.close();
    if (state.action === "Выбрать клиента") return openSetupPending(state);
    if (state.action.startsWith("Открыть")) {
      setupDialog.close();
      return navigateSetupResult(state.client, state.call?.deal_id, state.call?.id);
    }
    if (state.action === "Повторить загрузку") await api(base + "/connections/" + state.id + "/sync", {});
    return updateSetupResult(state);
  }
  if (!preview && !canManageTeam()) return;
  if (state.step === 0) return setupAccess(state);
  if (svc.mode === "source") {
    if (!state.id) {
      const saved = preview ? {id: "demo-setup-" + svc.key, token: "demo-example"} :
        await api("/api/pipeline/sources", {category: "mail", service: svc.key, name: $("setup-form").elements.name.value.trim()});
      if (state !== setupSession) {
        if (!preview && data && view === "settings") await refresh();
        return;
      }
      Object.assign(state, saved);
      setupMailDelivery(state);
      if (!preview) await refresh();
      return;
    }
    state.token = null;
  } else {
    const fields = {provider: svc.provider, ...Object.fromEntries(new FormData($("setup-form")))};
    if (svc.provider === "channel_feed") fields.service = svc.key;
    if (!fields.link_to) delete fields.link_to;
    if (!state.verified) {
      const checked = preview ? {host: "Учебный источник"} : await api(base + "/check", fields);
      if (state !== setupSession) return;
      state.verified = true;
      $("setup-status").textContent = checked.host + " · Проверка пройдена." +
        (checked.records === undefined ? "" : " Записей в ответе: " + checked.records + ".");
      $("setup-next").textContent = "Загрузить данные";
      return;
    }
    const saved = preview ? {id: "demo-setup-" + svc.key} : await api(base + "/connections", fields);
    if (state !== setupSession) {
      if (!preview && data && view === "settings") await refresh();
      return;
    }
    state.id = saved.id;
  }
  if (preview) demoServices.add(svc.key);
  setupResult(state);
  await updateSetupResult(state);
}

$("settings").addEventListener("click", event => {
  const card = event.target.closest("[data-setup-service]");
  if (card) return openSetup(setupCatalog[card.dataset.setupService]);
  const result = event.target.closest("[data-setup-result]");
  if (!result) return;
  const id = result.dataset.setupResult;
  const row = [...(data.crm_connections || []), ...(data.channel_connections || [])].find(c => c.id === id);
  const source = entity(data.sources || [], id);
  const svc = row ? setupCatalog[row.service || row.provider] ||
    {mode: "channel", name: "JSON-адаптер", mark: "{ }"} :
    {...(setupCatalog[source?.service] || setupCatalog.mail_api), name: source?.name || "Почта"};
  openSetup(svc, id);
});
$("setup-form").addEventListener("submit", async event => {
  event.preventDefault();
  const state = setupSession;
  if (!state || state.busy) return;
  state.busy = true;
  $("setup-next").disabled = true;
  const previousHeading = $("setup-content").firstElementChild;
  $("setup-form").inert = true;
  $("setup-status").textContent = "Подождите…";
  try { await submitSetup(state); }
  catch (error) {
    if (state !== setupSession) return;
    if (error.status === 401) return showLogin();
    $("setup-status").textContent = error.message;
  } finally {
    if (state === setupSession) {
      state.busy = false;
      $("setup-form").inert = false;
      $("setup-next").disabled = false;
      if (previousHeading !== $("setup-content").firstElementChild) $("setup-content").querySelector("h3")?.focus();
      else $("setup-next").focus();
    }
  }
});
$("setup-form").addEventListener("input", () => {
  if (setupSession?.verified) {
    setupSession.verified = false;
    $("setup-status").textContent = "";
    $("setup-next").textContent = "Проверить доступ";
  }
});
$("setup-form").addEventListener("click", async event => {
  const state = setupSession;
  if (event.target.closest("[data-pending-source]")) return openSetupPending(state);
  if (event.target.closest("[data-copy-key]")) {
    try { await navigator.clipboard.writeText(state.token); $("setup-status").textContent = "Ключ скопирован."; }
    catch { const input = $("setup-mail-key"); input.type = "text"; input.select(); $("setup-status").textContent = "Скопируйте выделенный ключ."; }
  }
  if (event.target.closest("[data-setup-example]")) {
    const sample = setupExample(state);
    if (!sample) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2)], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pacto-" + state.svc.key + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
$("setup-back").addEventListener("click", () => setupGuide(setupSession));
$("setup-close").addEventListener("click", () => setupDialog.close());
setupDialog.addEventListener("close", () => {
  clearTimeout(setupSession?.timer);
  setupSession = null;
  $("setup-content").replaceChildren();
  $("setup-form").inert = false;
  $("setup-next").disabled = false;
});
