"use strict";

const crmProviders = {bitrix24: {name: "Битрикс24"}, amocrm: {name: "amoCRM"}, retailcrm: {name: "RetailCRM"}, custom: {name: "Самописная CRM"}};
let crmPollTimer;
let crmPollPending = false;


function crmConnectionRows() {
  const connections = data.crm_connections || [];
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
        ${item.provider === "bitrix24" ? `<button type="button" class="source-link" data-bitrix-result="${esc(item.id)}">Результат загрузки</button>` : setupResultLink(item.id)}
      </div>
      ${!preview && canManageTeam() ? `<div class="connection-actions actions">
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
  syncConnectedVisibility();
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

$("settings").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.crmProvider) {
    openBitrixWizard();
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
