"use strict";

const sourceTypes = {
  crm: {name: "CRM", mark: "CRM", title: "CRM через адаптер", presets: ["Отправка JSON по API"],
    receives: "Сделки, этапы и задачи",
    detail: "Выгрузите карточки и дела из CRM. Дайте каждому клиенту и сделке постоянный ID.",
    docs: ["Документация Битрикс24", "https://apidocs.bitrix24.com/tutorials/crm/how-to-get-lists/index.html"]},
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
let sourceFilter = "all";
let setupCategory = "crm";

function renderSettings() {
  const automatic = new Set((data.crm_connections || []).map(item => item.id));
  const sources = (data.sources || []).filter(item => !automatic.has(item.id));
  const imported = data.calls.filter(call => !call.source_id).length;
  const explainOpen = $("join-details")?.open ?? false;
  const providerLinks = {
    meeting: [["Google Meet: записи и расшифровки", "https://developers.google.com/workspace/meet/api/guides/artifacts"],
      ["Zoom: записи встреч", "https://developers.zoom.us/docs/api/meetings/#tag/Cloud-Recording"]],
    chat: [["Telegram: доступ бота к сообщениям", "https://core.telegram.org/bots/faq#what-messages-will-my-bot-get"]]
  };
  $("settings").innerHTML = `
    ${renderCrmSection()}
    <section aria-labelledby="sources-heading" class="settings-section">
      <div class="settings-heading">
        <h2 id="sources-heading">Приём данных</h2>
        ${!preview ? `<div class="actions">
          ${sources.length ? '<button type="button" id="settings-refresh">Обновить статус</button>' : ""}
          ${canEdit() ? '<button type="button" id="settings-import">Импортировать JSON</button>' : ""}
        </div>` : ""}
      </div>
        <div class="connections">
          <div class="connection-row">
            <span class="source-symbol" aria-hidden="true">↓</span>
            <div><strong>Импорт JSON</strong><p class="muted small">${imported ? "Событий: " + imported : "Событий пока нет"}</p></div>
          </div>
          ${sources.length ? sources.map(renderConnection).join("") :
            '<p class="small muted connection-empty">Ключи для отправки данных ещё не выпущены</p>'}
        </div>
    </section>
    <section aria-labelledby="catalog-heading" class="settings-section">
      <div class="settings-heading"><h2 id="catalog-heading">Добавить источник</h2></div>
      <div class="filters settings-filters" aria-label="Категории источников">
        ${[["all", "Все"], ...Object.entries(sourceTypes).map(([id, type]) => [id, type.name])].map(([id, name]) =>
          `<button type="button" data-source-filter="${id}" aria-pressed="${id === sourceFilter}">${name}</button>`).join("")}
      </div>
      <div class="catalog-grid">${Object.entries(sourceTypes).filter(([id]) => sourceFilter === "all" || id === sourceFilter)
        .map(([id, type]) => `<article class="source-card" data-category="${id}">
          <div class="source-card-title"><span class="source-symbol" aria-hidden="true">${type.mark}</span><h3>${type.title}</h3></div>
          <p class="source-receives">${type.receives}</p>
          <p class="muted small">${type.presets.join(" · ")}</p>
          <div class="actions"><button type="button" data-source-type="${id}">${!preview && canEdit() ? "Настроить приём" : "Как подключить"}</button></div>
          <details><summary class="small">Подробности</summary>
            <p class="muted small">${type.detail}</p>
            ${[...(type.docs ? [type.docs] : []), ...(providerLinks[id] || [])].map(([label, url]) =>
              `<a class="small" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).join("")}
          </details>
        </article>`).join("")}</div>
    </section>
    <details id="join-details" class="joining"${explainOpen ? " open" : ""}>
      <summary>Как собирается досье</summary>
      <ul>
        <li><strong>CRM</strong> передаёт сделку, этап и задачи.</li>
        <li><strong>Каналы общения</strong> дополняют историю по ID клиента или сделки.</li>
        <li><strong>Текст</strong> нужен для разбора. Без него в досье виден только факт общения.</li>
      </ul>
    </details>`;
  pollCrm();
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
      renderSettings();
      $("settings").querySelector('[aria-pressed="true"]').focus();
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
