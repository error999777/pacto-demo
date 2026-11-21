"use strict";

const sourceTypes = {
  crm: {name: "CRM", mark: "CRM", title: "CRM через адаптер", presets: ["Отправка JSON по API"],
    receives: "Сделки, этапы и задачи",
    detail: "Выгрузите карточки и дела из CRM. Дайте каждому клиенту и сделке постоянный ID."},
  phone: {name: "Телефония", mark: "ТФ", title: "Телефония", presets: ["АТС / SIP", "Mango Office", "Asterisk"],
    receives: "Звонки и расшифровки",
    detail: "Передавайте завершённые звонки из АТС. Если есть только запись, подготовьте расшифровку перед отправкой."},
  meeting: {name: "Видеовстречи", mark: "ВК", title: "Видеовстречи", presets: ["Google Meet", "Zoom", "Другой сервис"],
    receives: "Встречи и расшифровки",
    detail: "Адаптер получает сведения о встрече и доступную расшифровку через API сервиса. Доступ зависит от разрешений организатора и настроек записи."},
  chat: {name: "Мессенджеры", mark: "ЧТ", title: "Мессенджеры", presets: ["Telegram", "WhatsApp Business", "Другой мессенджер"],
    receives: "Сообщения из рабочих чатов",
    detail: "Адаптер отправляет сообщения из чатов, к которым ему предоставлен доступ. Объём истории зависит от канала и его разрешений."},
  mail: {name: "Почта", mark: "@", title: "Рабочая почта", presets: ["Gmail", "Outlook", "Корпоративная почта"],
    receives: "Письма по сделкам",
    detail: "Передавайте сообщения из подключённого рабочего ящика. Сопоставляйте переписку по контакту и ID сделки в CRM."}
};
const serviceCards = {
  crm: [
    ["crm", "bitrix24", "Битрикс24", "24", "Клиенты, сделки, задачи и звонки", "#67c8ff"],
    ["crm", "amocrm", "amoCRM", "amo", "Контакты, воронка и история звонков", "#8db4ff"],
    ["crm", "retailcrm", "RetailCRM", "R", "Клиенты, заказы и задачи", "#79e7c0"],
    ["crm", "custom", "Самописная CRM", "{ }", "Загрузка из своей JSON-выгрузки", "#c6a8ff"]
  ],
  phone: [
    ["channel", "zadarma", "Zadarma", "Z", "Звонки АТС и записи разговоров", "#70d6ff"],
    ["channel", "channel_feed", "Другая АТС", "{ }", "Звонки и записи через свой адаптер", "#a1bcff"]
  ],
  meeting: [
    ["channel", "zoom", "Zoom", "zoom", "Облачные записи встреч и расшифровки", "#73a9ff"],
    ["channel", "meet", "Google Meet", "M", "Записи из Google Drive и расшифровки", "#72e9bd"]
  ],
  chat: [
    ["channel", "telegram", "Telegram", "T", "Сообщения и голосовые рабочего бота", "#68ceff"],
    ["channel", "channel_feed", "WhatsApp Business", "WA", "Переписка через JSON-адаптер", "#7be6a5"]
  ],
  mail: [
    ["source", "mail", "Почта через API", "@", "Письма из Gmail, Outlook или своего ящика через адаптер", "#f1ca99"]
  ]
};
const categories = [["all", "Все"], ...Object.entries(sourceTypes).map(([id, type]) => [id, type.name])];
const linkedCategory = location.hash.replace("#settings-", "");
let sourceFilter = location.hash === "#channels" ? "meeting" :
  categories.some(([id]) => id === linkedCategory) ? linkedCategory : "crm";
let setupCategory = "crm";

function renderServiceCard([mode, provider, name, mark, description, accent]) {
  const action = !preview && (mode === "source" ? canEdit() : canManageTeam()) ? "Подключить" : "Как подключить";
  const control = {crm: "data-crm-provider", channel: "data-channel-provider", source: "data-source-type"}[mode];
  const heading = sourceFilter === "all" ? "h4" : "h3";
  return `<article class="service-card" style="--service-accent: ${accent}">
    <span class="service-mark" aria-hidden="true" translate="no">${mark}</span>
    <div class="service-info">
      <${heading} translate="no">${name}</${heading}>
      <p>${description}</p>
    </div>
    <button class="service-action" type="button" ${control}="${provider}" data-service-name="${name}" aria-label="${action} ${name}">
      ${action}<span aria-hidden="true"></span>
    </button>
  </article>`;
}

function renderServicePanel() {
  const selected = sourceFilter === "all" ? categories.slice(1) : categories.filter(([id]) => id === sourceFilter);
  return selected.map(([id, label]) => `<section class="service-group" aria-label="${label}">
    ${sourceFilter === "all" ? `<h3>${label}</h3>` : ""}
    <div class="service-grid">${serviceCards[id].map(renderServiceCard).join("")}</div>
  </section>`).join("");
}

function syncConnectedVisibility() {
  const crm = !!data.crm_connections?.length;
  const channels = !!data.channel_connections?.length;
  const manual = (data.sources || []).some(item => !item.automatic);
  $("crm-connections").hidden = !crm;
  $("channel-connections").hidden = !channels;
  $("manual-connections").hidden = !manual;
  $("active-connections").hidden = !crm && !channels && !manual;
}

function renderSettings() {
  const sources = (data.sources || []).filter(item => !item.automatic);
  const advancedOpen = $("manual-setup")?.open ?? false;
  $("settings").innerHTML = `
    <section class="connection-catalog" aria-labelledby="catalog-heading">
      <header class="catalog-header">
        <h2 id="catalog-heading">Подключения</h2>
        ${preview || canManageTeam() ? '<button type="button" class="catalog-quiet" id="open-channel-pending">Без клиента</button>' : ""}
      </header>
      <div class="catalog-filters" role="group" aria-label="Категории подключений">
        ${categories.map(([id, label]) => `<button type="button" data-source-filter="${id}" aria-pressed="${id === sourceFilter}"
          aria-controls="services-panel">${label}</button>`).join("")}
      </div>
      <div class="service-panel" id="services-panel">${renderServicePanel()}</div>
      ${preview ? '<button type="button" class="catalog-quiet catalog-example" data-channel-demo>Открыть пример досье</button>' : ""}
    </section>
    <section class="active-connections" id="active-connections" aria-labelledby="active-heading" hidden>
      <header class="catalog-header"><h2 id="active-heading">Подключённые источники</h2>
        ${sources.length ? '<button type="button" class="catalog-quiet" id="settings-refresh">Обновить статус</button>' : ""}
      </header>
      <div class="connections active-list">
        <div id="crm-connections">${crmConnectionRows()}</div>
        <div id="channel-connections">${renderChannelRows()}</div>
        <div id="manual-connections">${sources.map(renderConnection).join("")}</div>
      </div>
    </section>
    <details class="manual-setup" id="manual-setup"${advancedOpen ? " open" : ""}>
      <summary>Ручной импорт и API</summary>
      <div class="actions manual-actions">
        ${!preview && canEdit() ? '<button type="button" id="settings-import">Импортировать JSON</button>' : ""}
        ${Object.entries(sourceTypes).map(([id, type]) => `<button type="button" data-source-type="${id}">${type.name} через API</button>`).join("")}
      </div>
    </details>`;
  syncConnectedVisibility();
  pollCrm();
  pollChannels();
}

function renderConnection(source) {
  const status = !source.enabled ? "Приём приостановлен" : source.last_batch_at ? "Данные получены" : "Ожидает первый пакет";
  const tone = !source.enabled ? "neutral" : source.last_batch_at ? "success" : "attention";
  return `<div class="connection-row" data-category="${source.category}">
    <span aria-hidden="true" class="source-symbol">${sourceTypes[source.category].mark}</span>
    <div><strong>${esc(source.name)}</strong>
      ${source.last_batch_at ? `<p class="small muted">${esc(date(source.last_batch_at))} · записей: ${source.last_batch_count}</p>` : ""}
    </div><span class="tag status-chip" data-tone="${tone}">${status}</span>
    ${canEdit() ? `<div class="connection-actions actions">
      <button type="button" data-source-toggle="${esc(source.id)}" data-enable="${!source.enabled}">${source.enabled ? "Приостановить" : "Возобновить"}</button>
      <button type="button" data-source-rotate="${esc(source.id)}">Новый ключ</button>
    </div>` : ""}
  </div>`;
}

function showSourceSetup(category) {
  setupCategory = category;
  const type = sourceTypes[category];
  $("source-title").textContent = type.title;
  $("source-description").textContent = type.detail;
  $("source-scope").textContent = type.receives;
  $("source-mode").textContent = preview ? "Ключ для адаптера выдаёт локальная версия Pacto." :
    "Укажите адрес и ключ Pacto в адаптере сервиса.";
  $("source-description").closest("details").open = false;
  $("source-form").hidden = preview || !canEdit();
  $("source-presets").innerHTML = type.presets.map(name =>
    `<button type="button" data-preset="${name}">${name}</button>`).join("");
  $("source-name").value = "";
  $("source-error").textContent = "";
  $("source-dialog").showModal();
}

function sourceExample(category) {
  const at = "2026-11-20T09:15:00+03:00";
  if (category === "crm") return {
    clients: [{id: "sample-crm-client", name: "ООО «Пример»"}],
    deals: [{id: "sample-crm-deal", client_id: "sample-crm-client", title: "Интеграция систем",
      manager: "Мария Волкова", stage: "discovery", scope: "Уточняем список систем.", updated_at: at}]
  };
  const kinds = {phone: "call", meeting: "meeting", chat: "message", mail: "email"};
  return {calls: [{id: "sample-" + category + "-1", client_id: "alpha", deal_id: "alpha-sync", at,
    channel: kinds[category], title: "Синтетический пример",
    lines: [{id: "r1", speaker: "client", text: "Для теста подготовили обезличенный пример заказа."}]}]};
}

function showSourceCredentials(result, category) {
  $("credential-url").value = location.origin + "/api/pipeline/sources/" + result.id + "/events";
  $("credential-key").value = result.token;
  $("credential-note").textContent = "";
  $("credential-example-hint").textContent = category === "crm"
    ? "Пример создаст одного вымышленного клиента и сделку. Адрес доступен на этом компьютере."
    : "Пример добавит событие к сделке «Альфа Логистика». Сначала загрузите демоданные в Pacto. Адрес доступен на этом компьютере.";
  const example = JSON.stringify(sourceExample(category), null, 2);
  $("credential-example").href = URL.createObjectURL(new Blob([example], {type: "application/json"}));
  $("credential-dialog").showModal();
}

function bindSettings() {
  $("settings").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.sourceFilter) {
      sourceFilter = button.dataset.sourceFilter;
      for (const filter of document.querySelectorAll("[data-source-filter]")) {
        filter.setAttribute("aria-pressed", filter === button);
      }
      $("services-panel").innerHTML = renderServicePanel();
      history.replaceState(null, "", "#settings-" + sourceFilter);
    } else if (button.dataset.sourceType) {
      showSourceSetup(button.dataset.sourceType);
    } else if (button.id === "settings-import") {
      $("open-import").click();
    } else if (button.id === "settings-refresh") {
      run(button, async () => {
        await refresh();
        $("settings-refresh")?.focus();
        notify("Статусы обновлены.");
      });
    } else if (button.dataset.sourceToggle) {
      const id = button.dataset.sourceToggle;
      const enabled = button.dataset.enable === "true";
      run(button, async () => {
        await api(`/api/pipeline/sources/${id}/state`, {enabled});
        await refresh();
        $("settings").querySelector(`[data-source-toggle="${id}"]`).focus();
        notify(enabled ? "Приём возобновлён." : "Приём приостановлен.");
      });
    } else if (button.dataset.sourceRotate) {
      $("rotate-id").value = button.dataset.sourceRotate;
      $("rotate-error").textContent = "";
      $("rotate-dialog").showModal();
    }
  });
  $("source-presets").addEventListener("click", event => {
    if (!event.target.dataset.preset) return;
    $("source-name").value = event.target.dataset.preset;
    $("source-name").focus();
  });
  $("source-form").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("source-name").value.trim();
    if (!name) {
      $("source-error").textContent = "Введите название источника.";
      $("source-name").focus();
      return;
    }
    run(event.submitter, async () => {
      const result = await api("/api/pipeline/sources", {name, category: setupCategory});
      $("source-dialog").close();
      await refresh();
      $("settings").querySelector(`[data-source-rotate="${result.id}"]`)?.focus();
      showSourceCredentials(result, setupCategory);
    }, $("source-error"));
  });
  $("rotate-form").addEventListener("submit", event => {
    event.preventDefault();
    const id = $("rotate-id").value;
    run(event.submitter, async () => {
      const result = await api(`/api/pipeline/sources/${id}/key`, {});
      $("rotate-dialog").close();
      showSourceCredentials(result, entity(data.sources, id).category);
    }, $("rotate-error"));
  });
  $("credential-dialog").addEventListener("close", () => {
    $("credential-url").value = "";
    $("credential-key").value = "";
    URL.revokeObjectURL($("credential-example").href);
    $("credential-example").removeAttribute("href");
  });
  $("credential-dialog").addEventListener("click", event => {
    const target = event.target.closest("[data-copy-field]");
    if (!target) return;
    const field = $(target.dataset.copyField);
    field.select();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(field.value).then(
        () => { $("credential-note").textContent = "Скопировано."; },
        () => { $("credential-note").textContent = "Выделенный текст можно скопировать вручную."; }
      );
    } else $("credential-note").textContent = "Выделенный текст можно скопировать вручную.";
  });
  for (const button of document.querySelectorAll("[data-close-dialog]")) {
    button.addEventListener("click", () => $(button.dataset.closeDialog).close());
  }
}

bindSettings();
