"use strict";

const sourceTypes = {
  crm: {name: "CRM", mark: "CRM", title: "CRM и сделки", presets: ["Битрикс24", "amoCRM", "Самописная CRM"],
    receives: "Клиенты, сделки, этапы, суммы и задачи.",
    detail: "Выгрузите карточки и дела из CRM. Дайте каждому клиенту и сделке постоянный ID.",
    docs: ["Документация Битрикс24", "https://apidocs.bitrix24.com/tutorials/crm/how-to-get-lists/index.html"]},
  phone: {name: "Телефония", mark: "ТФ", title: "Телефония", presets: ["АТС / SIP", "Mango Office", "Asterisk"],
    receives: "Завершённые звонки, время и расшифровки.",
    detail: "Передавайте завершённые звонки из АТС. Если есть только запись, подготовьте расшифровку перед отправкой."},
  meeting: {name: "Видеовстречи", mark: "ВК", title: "Видеовстречи", presets: ["Google Meet", "Zoom", "Другой сервис"],
    receives: "Факт встречи и расшифровка, если она доступна.",
    detail: "Адаптер получает сведения о встрече и доступную расшифровку через API сервиса. Доступ зависит от разрешений организатора и настроек записи."},
  chat: {name: "Мессенджеры", mark: "ЧТ", title: "Мессенджеры", presets: ["Telegram", "WhatsApp Business", "Другой мессенджер"],
    receives: "Сообщения из разрешённых рабочих чатов.",
    detail: "Адаптер отправляет сообщения из чатов, к которым ему предоставлен доступ. Объём истории зависит от канала и его разрешений."},
  mail: {name: "Почта", mark: "@", title: "Рабочая почта", presets: ["Gmail", "Outlook", "Корпоративная почта"],
    receives: "Письма и цепочки, связанные со сделкой.",
    detail: "Передавайте сообщения из подключённого рабочего ящика. Сопоставляйте переписку по контакту и ID сделки в CRM."}
};
let sourceFilter = "all";
let setupCategory = "crm";

function renderSettings() {
  const sources = data.sources || [];
  const imported = data.calls.filter(call => !call.source_id).length;
  const explainOpen = $("join-details")?.open ?? matchMedia("(min-width: 51rem)").matches;
  const providerLinks = {
    meeting: [["Google Meet: записи и расшифровки", "https://developers.google.com/workspace/meet/api/guides/artifacts"],
      ["Zoom: записи встреч", "https://developers.zoom.us/docs/api/meetings/#tag/Cloud-Recording"]],
    chat: [["Telegram: доступ бота к сообщениям", "https://core.telegram.org/bots/faq#what-messages-will-my-bot-get"]]
  };
  $("settings").innerHTML = `
    <section aria-labelledby="sources-heading" class="settings-section">
      <div class="settings-heading">
        <div><h2 id="sources-heading">Источники данных</h2>
          <p class="muted">Отсюда Pacto собирает историю и проверяет следующий шаг.</p></div>
        ${!preview ? `<div class="actions">
          ${sources.length ? '<button type="button" id="settings-refresh">Обновить статус</button>' : ""}
          ${canEdit() ? '<button type="button" id="settings-import">Импортировать JSON</button>' : ""}
        </div>` : ""}
      </div>
      <div class="source-grid">
        <section class="connections" aria-label="Состояние источников">
          <h3>Приём данных</h3>
          ${sources.length ? sources.map(source => renderConnection(source)).join("") :
            '<p class="muted">Источники через API пока не настроены.</p>'}
          <div class="connection-row">
            <span class="source-symbol" aria-hidden="true">↓</span>
            <div><strong>Ручной импорт JSON</strong><p class="muted small">${imported ? "Событий в истории: " + imported : "Событий пока нет"}</p></div>
          </div>
        </section>
        <details id="join-details" class="joining"${explainOpen ? " open" : ""}>
          <summary>Как собирается досье</summary>
          <ol>
            <li><strong>CRM задаёт основу.</strong> Клиент, сделка, этап, ответственный и задачи.</li>
            <li><strong>Общение добавляет факты.</strong> Звонки, письма, чаты и встречи попадают в историю по ID клиента и сделки.</li>
            <li><strong>Контекст определяет вывод.</strong> Без текста виден факт общения. Если подтверждающий канал недоступен, шаг требует проверки.</li>
          </ol>
        </details>
      </div>
    </section>
    <section aria-labelledby="catalog-heading" class="settings-section">
      <div class="settings-heading"><div><h2 id="catalog-heading">Каталог источников</h2>
        <p class="muted">Для передачи данных нужен адаптер к API Pacto или выгрузка JSON.</p></div></div>
      <div class="filters settings-filters" aria-label="Категории источников">
        ${[["all", "Все"], ...Object.entries(sourceTypes).map(([id, type]) => [id, type.name])].map(([id, name]) =>
          `<button type="button" data-source-filter="${id}" aria-pressed="${id === sourceFilter}">${name}</button>`).join("")}
      </div>
      <div class="catalog-grid">${Object.entries(sourceTypes).filter(([id]) => sourceFilter === "all" || id === sourceFilter)
        .map(([id, type]) => `<article class="source-card">
          <div class="source-card-title"><span class="source-symbol" aria-hidden="true">${type.mark}</span><h3>${type.title}</h3></div>
          <p>${type.receives}</p>
          <p class="muted small">${type.presets.join(" · ")}</p>
          <div class="actions"><button type="button" data-source-type="${id}">${!preview && canEdit() ? "Настроить приём" : "Как подключить"}</button></div>
          <details><summary class="small">Какие данные доступны</summary>
            <p class="muted small">${type.detail}</p>
            ${[...(type.docs ? [type.docs] : []), ...(providerLinks[id] || [])].map(([label, url]) =>
              `<a class="small" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).join("")}
          </details>
        </article>`).join("")}</div>
    </section>`;
}

function renderConnection(source) {
  const status = !source.enabled ? "Приём приостановлен" : source.last_batch_at ? "Данные получены" : "Ожидает первый пакет";
  return `<div class="connection-row">
    <span aria-hidden="true" class="source-symbol">${sourceTypes[source.category].mark}</span>
    <div><strong>${esc(source.name)}</strong>
      <p class="small ${source.enabled && source.last_batch_at ? "healthy" : "muted"}">${status}</p>
      ${source.last_batch_at ? `<p class="small muted">${esc(date(source.last_batch_at))} · записей: ${source.last_batch_count}</p>` : ""}
    </div>${canEdit() ? `<div class="connection-actions actions">
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
  $("source-mode").textContent = preview ? "В демо можно посмотреть порядок настройки. Ключ выдаёт локальная версия Pacto." :
    "Pacto выдаст адрес и ключ. Укажите их в своём адаптере, который преобразует данные в JSON.";
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
