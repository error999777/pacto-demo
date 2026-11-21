"use strict";

const providerFields = {
  zadarma: {name: "Zadarma", type: "Телефония", fields: [
    ["key", "Ключ API", "password"], ["secret", "Секрет API", "password"],
    ["utc_offset", "Смещение времени АТС", "text", "+03:00"]
  ], help: "Подключите API АТС. Pacto читает историю и забирает записи, доступные в Zadarma.", docs: "https://zadarma.com/ru/support/api/"},
  telegram: {name: "Telegram", type: "Мессенджер", fields: [["key", "Токен бота", "password"]],
    help: "Используйте выделенного бота без вебхука. Появятся новые сообщения, которые получает бот.",
    docs: "https://core.telegram.org/bots/api#getupdates"},
  max: {name: "MAX", type: "Мессенджер", fields: [["identifier", "Имя бота", "text"], ["key", "Токен бота", "password"]],
    help: "Используйте выделенного бота пилота без вебхука. Pacto читает новые события через Long Polling.",
    docs: "https://dev.max.ru/docs-api/methods/GET/updates/"},
  meet: {name: "Google Meet", type: "Встречи", fields: [
    ["identifier", "Аккаунт Google", "email"], ["key", "OAuth Client ID", "text"], ["secret", "OAuth Client Secret", "password"],
    ["account", "OAuth Refresh Token", "password"]
  ], help: "Нужны Meet REST API и Drive API. Используйте OAuth пользователя, у которого есть доступ к записям.",
    docs: "https://developers.google.com/workspace/meet/api/guides/authenticate-authorize"},
  zoom: {name: "Zoom", type: "Встречи", fields: [
    ["identifier", "Email или ID организатора", "text"], ["account", "Account ID", "text"],
    ["key", "Client ID", "text"], ["secret", "Client Secret", "password"]
  ], help: "Используйте Server-to-Server OAuth с правами на чтение облачных записей организатора.",
    docs: "https://developers.zoom.us/docs/internal-apps/s2s-oauth/"},
  channel_feed: {name: "WhatsApp / свой API", type: "Адаптер", fields: [
    ["endpoint", "Адрес JSON-выгрузки", "url"], ["key", "Bearer-токен (если нужен)", "password", "", false]
  ], help: "Укажите GET-адрес адаптера телефонии, WhatsApp Business или другого канала. Формат можно скачать."}
};
const recordStates = {queued: "Запись в очереди", speaking: "Расшифровка готовится", ready: "Расшифровка готова",
  retry: "Повторная обработка", model: "Нужна модель Whisper", silent: "Речь не обнаружена"};
let channelProvider;
let channelPollTimer;
let channelLoading = false;
let channelAnchorOpened = false;
let channelExampleUrl;
let queueRows = [];
let queueNext;
let linkEvent;
let linkWorkspace;

function renderChannelSection() {
  return `<section class="settings-section channel-section" id="channels" aria-labelledby="channels-heading">
    <div class="settings-heading">
      <div><h2 id="channels-heading">Звонки, встречи и переписка</h2>
        <p class="small muted">История из подключённых каналов. Записи расшифровываются локально.</p></div>
      ${preview || canManageTeam() ? '<button type="button" id="open-channel-pending">Без клиента</button>' : ""}
    </div>
    ${preview || canManageTeam() ? `<div class="crm-provider-list" aria-label="Каналы общения">
      ${Object.entries(providerFields).map(([id, provider]) =>
        `<button type="button" data-channel-provider="${id}">${provider.name}</button>`).join("")}
    </div>` : ""}
    <div class="connections" id="channel-connections">${renderChannelRows()}</div>
  </section>`;
}

function renderChannelRows() {
  if (preview) return `<div class="connection-row crm-entry">
    <span class="source-symbol" aria-hidden="true">ВК</span>
    <div class="crm-entry-info"><strong>Пример истории</strong><p class="small muted">Звонки и расшифровки в досье «Альфа Логистика»</p></div>
    <button type="button" data-channel-demo>Открыть историю</button>
  </div>`;
  const rows = data.channel_connections || [];
  if (!rows.length) return `<p class="small muted">${canManageTeam()
    ? "Выберите канал. Если клиент не определится, событие попадёт в «Без клиента»."
    : "Подключениями управляет руководитель."}</p>`;
  return rows.map(row => {
    const status = !row.enabled ? ["Пауза", "neutral"] : row.running ? ["Загрузка", "info"] :
      row.error ? ["Ошибка", "attention"] : !row.next_at ? ["В очереди", "info"] :
      row.succeeded_at ? ["Синхронизировано", "success"] : ["Ожидает загрузки", "neutral"];
    return `<div class="connection-row crm-entry" data-channel-row="${esc(row.id)}">
      <div class="crm-entry-info"><strong>${providerFields[row.provider].name}</strong><span class="tag status-chip small" data-tone="${status[1]}">${status[0]}</span>
      <p class="small muted">${esc(row.host)} · ${providerFields[row.provider].type}</p>
      ${row.counts ? `<p class="small muted">Событий за загрузку ${row.counts.events} · Обновлений в досье ${row.counts.changed} · ${esc(date(row.succeeded_at))}</p>` : ""}
      ${row.error ? `<p class="small crm-error">${esc(row.error)}</p>` : ""}</div>
      ${canManageTeam() ? `<div class="actions connection-actions">
        <button type="button" data-channel-state="sync"${!row.enabled || row.running ? " disabled" : ""}>Обновить сейчас</button>
        <button type="button" data-channel-state="state" data-enable="${!row.enabled}">${row.enabled ? "Приостановить" : "Возобновить"}</button>
      </div>` : ""}
    </div>`;
  }).join("");
}

function renderRecording(id, recording) {
  if (!recording) return "";
  const status = recordStates[recording.state];
  const tag = recording.mime?.startsWith("video/") ? "video" : "audio";
  const url = "/api/channels/events/" + encodeURIComponent(id) + "/recording";
  return `<div class="recording-playback">
    ${status ? `<p class="small ${recording.error ? "crm-error" : "muted"}" aria-live="polite">${status}${recording.error ? " · " + esc(recording.error) : ""}</p>` : ""}
    ${recording.recording ? `<details><summary class="small">Открыть запись</summary><${tag} controls preload="none" src="${url}" aria-label="Запись разговора"></${tag}></details>` : ""}
  </div>`;
}

async function refreshChannelRows() {
  const member = data?.member_id;
  const rows = await api("/api/channels/connections");
  if (data?.member_id !== member || view !== "settings") return;
  if (JSON.stringify(data.channel_connections || []) === JSON.stringify(rows)) return;
  data.channel_connections = rows;
  const focused = document.activeElement;
  const row = focused?.closest("[data-channel-row]");
  $("channel-connections").innerHTML = renderChannelRows();
  if (row) $("channel-connections").querySelector(`[data-channel-row="${CSS.escape(row.dataset.channelRow)}"] [data-channel-state="${focused.dataset.channelState}"]:enabled`)?.focus();
}

function pollChannels() {
  clearTimeout(channelPollTimer);
  if (location.hash === "#channels" && !channelAnchorOpened) {
    channelAnchorOpened = true;
    requestAnimationFrame(() => $("channels")?.scrollIntoView({block: "start"}));
  }
  if (preview || !data.channel_connections?.length) return;
  channelPollTimer = setTimeout(async () => {
    if (!data || view !== "settings" || channelLoading) return;
    channelLoading = true;
    try { await refreshChannelRows(); }
    catch (error) { if (error.status === 401) showLogin(); }
    finally {
      channelLoading = false;
      if (data && view === "settings") pollChannels();
    }
  }, 4000);
}

function channelForm(id) {
  channelProvider = id;
  const provider = providerFields[id];
  $("channel-dialog-title").textContent = provider.name;
  $("channel-help").textContent = provider.help + (preview ? " Подключение работает в локальном Pacto." : "");
  $("channel-form-status").textContent = "";
  $("channel-submit").hidden = preview;
  $("channel-fields").innerHTML = preview ? "" : provider.fields.map(([name, label, type, initial, required = true], index) =>
    `<label for="channel-${name}">${label}</label><input id="channel-${name}" name="${name}" type="${type}" maxlength="8192"
      value="${esc(initial || "")}" autocomplete="${type === "password" ? "new-password" : "off"}" spellcheck="false"
      ${index ? "" : "autofocus aria-describedby=\"channel-help\""} ${required ? "required" : ""}>`).join("");
  const doc = $("channel-doc");
  if (provider.docs) {
    doc.href = provider.docs;
    doc.textContent = "Документация подключения";
    doc.removeAttribute("download");
  } else {
    if (!channelExampleUrl) {
      const example = {events: [{external_id: "sample-1", at: "2026-11-21T09:00:00+03:00", channel: "message",
        title: "Переписка по заявке", identities: ["chat:sample-client"],
        lines: [{id: "r1", speaker: "client", text: "Можно уточнить сроки поставки?"}]}]};
      channelExampleUrl = URL.createObjectURL(new Blob([JSON.stringify(example, null, 2)], {type: "application/json"}));
    }
    doc.href = channelExampleUrl;
    doc.textContent = "Скачать пример JSON";
    doc.download = "pacto-channel-example.json";
  }
  $("channel-dialog").showModal();
}

function openDemoHistory() {
  if ($("channel-pending").open) $("channel-pending").close();
  view = "clients";
  select("alpha", "alpha-sync");
  dossierPane = "history";
  renderDossier();
}

async function loadPending(append = false) {
  $("channel-pending-status").textContent = "Загрузка…";
  const content = $("channel-pending-content");
  if (preview) {
    content.innerHTML = `<p class="small muted">Пример очереди. Неопознанные события ждут выбора клиента.</p>
    <div class="pending-events"><article class="surface pending-event"><strong>Встреча Zoom</strong>
      <p class="small muted">Синтетическое событие · meeting:540030</p>
      <p>Обсудили состав работ и сроки оценки.</p></article></div>
    <button type="button" data-channel-demo>Открыть пример истории</button>`;
    $("channel-pending-status").textContent = "";
    return;
  }
  const [result, workspace] = await Promise.all([
    api("/api/channels/pending" + (append && queueNext ? "?before=" + queueNext : "")),
    append ? linkWorkspace : api("/api/pipeline")
  ]);
  linkWorkspace = workspace;
  queueRows = append ? [...queueRows, ...result.events] : result.events;
  queueNext = result.next;
  if (!$("channel-pending").open) return;
  content.innerHTML = queueRows.length ? `<div class="pending-events">${queueRows.map(row =>
    `<article class="surface pending-event"><div class="row-head"><strong>${esc(row.title)}</strong>
      <button type="button" data-link-event="${esc(row.id)}">Выбрать клиента</button></div>
      <p class="small muted">${esc(row.source)} · ${esc(date(row.at))}</p>
      ${row.identities.length ? `<p class="small muted">${row.identities.map(esc).join(" · ")}</p>` : ""}
      ${row.excerpt ? `<p>${esc(row.excerpt)}</p>` : ""}
      ${renderRecording(row.id, row)}</article>`).join("")}</div>
    ${queueNext ? '<button type="button" id="channel-pending-next">Показать ещё</button>' : ""}`
    : '<p class="small muted">Событий без клиента пока нет.</p>';
  $("channel-pending-status").textContent = "";
}

function linkForm(row) {
  linkEvent = row;
  $("channel-pending-content").innerHTML = `<form id="channel-link-form">
    <p>${esc(row.title)}</p>
    <label for="channel-customer">Клиент</label>
    <select id="channel-customer" name="client_id" required><option value="">Выберите клиента</option>
      ${[...linkWorkspace.clients].sort((a, b) => a.name.localeCompare(b.name, "ru")).map(item =>
        `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select>
    <label for="channel-deal">Сделка</label>
    <select id="channel-deal" name="deal_id"><option value="">Только досье клиента</option></select>
    ${row.identities.length ? `<label for="channel-rule">Применить к событиям</label>
      <select id="channel-rule" name="identity"><option value="">Только к этому событию</option>
      ${row.identities.map(identity => `<option value="${esc(identity)}">Всегда для ${esc(identity)}</option>`).join("")}</select>` : ""}
    <div class="actions"><button type="button" id="channel-pending-back">К списку</button>
      <button type="submit" class="primary">Добавить в досье</button></div>
  </form>`;
  $("channel-customer").focus();
}

$("settings").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-channel-demo")) openDemoHistory();
  else if (button.dataset.channelProvider) channelForm(button.dataset.channelProvider);
  else if (button.id === "open-channel-pending") {
    $("channel-pending-content").innerHTML = "";
    $("channel-pending").showModal();
    run(null, loadPending, $("channel-pending-status"));
  } else if (button.dataset.channelState) {
    const id = button.closest("[data-channel-row]").dataset.channelRow;
    const action = button.dataset.channelState;
    run(button, async () => {
      await api(`/api/channels/connections/${id}/${action}`, action === "state" ? {enabled: button.dataset.enable === "true"} : {});
      await refreshChannelRows();
    });
  }
});
$("channel-dialog").addEventListener("close", () => { $("channel-fields").innerHTML = ""; });
$("channel-close").addEventListener("click", () => $("channel-dialog").close());
$("channel-pending-close").addEventListener("click", () => $("channel-pending").close());
$("channel-form").addEventListener("submit", event => {
  event.preventDefault();
  if (preview || !canManageTeam()) return;
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  run(event.submitter, async () => {
    await api("/api/channels/connections", {provider: channelProvider, ...fields});
    $("channel-dialog").close();
    await refreshChannelRows();
    pollChannels();
    notify("Канал подключён. Pacto начнёт загрузку.");
  }, $("channel-form-status"));
});
$("channel-pending").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (button?.dataset.linkEvent) linkForm(entity(queueRows, button.dataset.linkEvent));
  if (button?.hasAttribute("data-channel-demo")) openDemoHistory();
  if (button?.id === "channel-pending-next" || button?.id === "channel-pending-back") {
    run(button, () => loadPending(button.id === "channel-pending-next"), $("channel-pending-status"));
  }
});
$("channel-pending").addEventListener("change", event => {
  if (event.target.id !== "channel-customer") return;
  const deals = linkWorkspace.deals.filter(deal => deal.client_id === event.target.value);
  $("channel-deal").innerHTML = '<option value="">Только досье клиента</option>' + deals.map(deal =>
    `<option value="${esc(deal.id)}">${esc(deal.title)}</option>`).join("");
});
$("channel-pending").addEventListener("submit", event => {
  if (event.target.id !== "channel-link-form") return;
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.target));
  run(event.submitter, async () => {
    const result = await api(`/api/channels/events/${linkEvent.id}/link`,
      {client_id: fields.client_id, deal_id: fields.deal_id || null, identity: fields.identity || null});
    await loadPending();
    notify(`Событий добавлено в досье: ${result.linked}.`);
  }, $("channel-pending-status"));
});
