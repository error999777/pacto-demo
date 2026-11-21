"use strict";

const crmProviders = {
  bitrix24: {name: "Битрикс24", placeholder: "https://portal.bitrix24.ru/rest/…",
    help: "Создайте входящий вебхук с правами на чтение CRM и задач. Вставьте полный адрес вебхука.",
    docs: "https://apidocs.bitrix24.ru/local-integrations/local-webhooks.html"},
  amocrm: {name: "amoCRM", placeholder: "https://account.amocrm.ru",
    help: "В настройках приватной или внешней интеграции выпустите долгосрочный токен. Скопируйте адрес аккаунта и токен.",
    docs: "https://www.amocrm.ru/developers/content/oauth/step-by-step"},
  retailcrm: {name: "RetailCRM", placeholder: "https://shop.retailcrm.ru",
    help: "Выпустите ключ с доступом на чтение клиентов, заказов и задач. Звонки можно добавить отдельной выгрузкой телефонии.",
    docs: "https://pkg.go.dev/github.com/retailcrm/api-client-go/v5"},
  custom: {name: "Самописная CRM", placeholder: "https://crm.example.com/pacto/export",
    help: "Укажите GET-адрес JSON-выгрузки. Поддерживаются полный набор CRM или отдельные звонки к уже подключённой CRM."}
};

const crmDialog = $("crm-dialog");
let crmPollTimer;
let crmPollPending = false;
let crmExampleUrl;

function renderCrmSection() {
  const manage = !preview && canManageTeam();
  return `<section aria-labelledby="crm-heading" class="settings-section crm-section">
    <div class="settings-heading"><div><h2 id="crm-heading">Синхронизация с CRM</h2>
      <p class="small muted">Pacto собирает досье из клиентов, сделок, задач и доступных звонков. Обновление каждые 15 минут.</p></div></div>
    ${manage || preview ? `<div class="crm-provider-list" aria-label="Системы CRM">
      ${Object.entries(crmProviders).map(([id, provider]) =>
        `<button type="button" data-crm-provider="${id}">${provider.name}</button>`).join("")}
    </div>` : ""}
    <div class="connections" id="crm-connections">${crmConnectionRows()}</div>
  </section>`;
}

function crmConnectionRows() {
  if (preview) return `<div class="connection-row crm-entry">
    <span class="source-symbol" aria-hidden="true">CRM</span>
    <div class="crm-entry-info"><strong>Пример досье из CRM</strong>
      <p class="small muted">Альфа Логистика · сделки, задачи и история общения</p></div>
    <button type="button" data-crm-example>Открыть досье</button>
  </div>`;
  const connections = data.crm_connections || [];
  if (!connections.length) return `<p class="small muted">${canManageTeam()
    ? "Выберите CRM, чтобы начать загрузку." : "CRM может подключить руководитель."}</p>`;
  return connections.map(item => {
    const waiting = !item.next_at;
    const status = !item.enabled ? ["Пауза", "neutral"] : item.running ? ["Загрузка", "info"] :
      waiting ? ["В очереди", "info"] : item.error ? ["Ошибка", "attention"] :
      item.succeeded_at ? ["Синхронизировано", "success"] : ["Ожидает загрузки", "neutral"];
    const count = item.counts;
    const source = item.link_to && entity(connections, item.link_to);
    return `<div class="connection-row crm-entry" data-crm-row="${esc(item.id)}">
      <span class="source-symbol" aria-hidden="true">CRM</span>
      <div class="crm-entry-info">
        <strong>${crmProviders[item.provider].name}</strong><span class="tag status-chip small" data-tone="${status[1]}">${status[0]}</span>
        <p class="small muted">${esc(item.host)}${source ? " · Звонки для " + esc(source.host) : ""}</p>
        ${count ? `<p class="small muted">Клиенты ${count.clients} · Сделки ${count.deals} · Задачи ${count.tasks} · Звонки ${count.calls}</p>
          <p class="small muted">Последняя загрузка ${esc(date(item.succeeded_at))} · Изменений ${count.changed}
          ${count.skipped ? " · Без связи или даты " + count.skipped : ""}</p>` : ""}
        ${item.error ? `<p class="small crm-error">${esc(item.error)}</p>` : ""}
      </div>
      ${canManageTeam() ? `<div class="connection-actions actions">
        <button type="button" data-crm-action="sync"${!item.enabled || waiting || item.running ? " disabled" : ""}>Обновить сейчас</button>
        <button type="button" data-crm-action="state" data-enable="${!item.enabled}">${item.enabled ? "Приостановить" : "Возобновить"}</button>
      </div>` : ""}
    </div>`;
  }).join("");
}

async function refreshCrmRows() {
  const member = data?.member_id;
  const next = await api("/api/crm/connections");
  if (data?.member_id !== member || view !== "settings") return;
  if (JSON.stringify(next) === JSON.stringify(data.crm_connections || [])) return;
  data.crm_connections = next;
  const section = $("crm-connections");
  const focused = document.activeElement;
  const row = focused?.closest("[data-crm-row]");
  section.innerHTML = crmConnectionRows();
  if (row) section.querySelector(`[data-crm-row="${CSS.escape(row.dataset.crmRow)}"] [data-crm-action="${focused.dataset.crmAction}"]:enabled`)?.focus();
}

function pollCrm() {
  clearTimeout(crmPollTimer);
  if (preview || !(data.crm_connections || []).length) return;
  crmPollTimer = setTimeout(async () => {
    if (!data || view !== "settings" || crmPollPending) return;
    crmPollPending = true;
    try { await refreshCrmRows(); }
    catch (error) { if (error.status === 401) showLogin(); }
    finally {
      crmPollPending = false;
      if (data && view === "settings") pollCrm();
    }
  }, 4000);
}

function crmFormFields() {
  const id = $("crm-provider").value;
  const provider = crmProviders[id];
  const bitrix = id === "bitrix24";
  const custom = id === "custom";
  $("crm-help").textContent = provider.help + (preview ? " Реальное подключение доступно в локальном Pacto." : "");
  $("crm-address-label").textContent = bitrix ? "Адрес вебхука" : custom ? "Адрес JSON-выгрузки" : "Адрес аккаунта";
  $("crm-endpoint").type = bitrix ? "password" : "url";
  $("crm-endpoint").autocomplete = bitrix ? "new-password" : "url";
  $("crm-endpoint").placeholder = provider.placeholder;
  $("crm-token-field").hidden = bitrix;
  $("crm-token").required = !preview && !bitrix && !custom;
  $("crm-token-label").textContent = id === "amocrm" ? "Долгосрочный токен" : custom ? "Bearer-токен (если нужен)" : "Ключ API";
  $("crm-offset-field").hidden = id !== "retailcrm";
  $("crm-currency-field").hidden = bitrix || custom;
  const connections = (data.crm_connections || []).filter(item => item.provider !== "custom");
  $("crm-link-field").hidden = !custom || !connections.length;
  $("crm-link").innerHTML = '<option value="">Клиенты, сделки, задачи и звонки</option>' + connections.map(item =>
    `<option value="${esc(item.id)}">Только звонки для ${esc(crmProviders[item.provider].name + " · " + item.host)}</option>`).join("");
  const docs = $("crm-doc");
  docs.textContent = custom ? "Скачать синтетический пример JSON" : "Как получить доступ";
  docs.href = custom ? crmExampleUrl : provider.docs;
  if (custom) docs.setAttribute("download", "pacto-crm-example.json");
  else docs.removeAttribute("download");
}

function showCrmForm(provider) {
  $("crm-form").reset();
  $("crm-form-status").textContent = "";
  $("crm-provider").value = provider;
  $("crm-fields").hidden = preview;
  $("crm-submit").hidden = preview;
  if (!crmExampleUrl) {
    const example = sourceExample("crm");
    const deal = example.deals[0];
    example.tasks = [{id: "task-1", deal_id: deal.id, title: "Подготовить оценку", side: "manager", updated_at: deal.updated_at}];
    example.calls = [{id: "call-1", client_id: deal.client_id, deal_id: deal.id, at: deal.updated_at,
      title: "Входящий звонок", duration_seconds: 428, lines: [{id: "r1", speaker: "client", text: "Нужна оценка интеграции."}]}];
    crmExampleUrl = URL.createObjectURL(new Blob([JSON.stringify(example, null, 2)], {type: "application/json"}));
  }
  crmFormFields();
  crmDialog.showModal();
}

$("settings").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-crm-example")) {
    view = "clients";
    select("alpha", "alpha-sync");
  } else if (button.dataset.crmProvider) {
    showCrmForm(button.dataset.crmProvider);
  } else if (button.dataset.crmAction) {
    const id = button.closest("[data-crm-row]").dataset.crmRow;
    const action = button.dataset.crmAction;
    run(button, async () => {
      await api(`/api/crm/connections/${id}/${action}`, action === "state" ? {enabled: button.dataset.enable === "true"} : {});
      await refreshCrmRows();
      notify(action === "sync" ? "Загрузка поставлена в очередь." : "Настройки синхронизации сохранены.");
    });
  }
});

$("crm-provider").addEventListener("change", () => {
  $("crm-endpoint").value = $("crm-token").value = "";
  $("crm-form-status").textContent = "";
  crmFormFields();
});
$("crm-close").addEventListener("click", () => crmDialog.close());
crmDialog.addEventListener("close", () => {
  $("crm-endpoint").value = $("crm-token").value = "";
});
$("crm-form").addEventListener("submit", event => {
  event.preventDefault();
  if (preview || !canManageTeam()) return;
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  fields.link_to = fields.provider === "custom" && fields.link_to ? fields.link_to : null;
  const status = $("crm-form-status");
  status.textContent = "";
  run(event.submitter, async () => {
    await api("/api/crm/connections", fields);
    crmDialog.close();
    await refreshCrmRows();
    pollCrm();
    notify("Подключение сохранено. Pacto начнёт загрузку.");
  }, status);
});
