"use strict";

const bitrixDialog = $("bitrix-dialog");
let bitrixSession;
let demoBitrixConnected = false;

// The preview adds a separate synthetic customer to this tab's existing demo snapshot.
function withDemoBitrix(snapshot) {
  if (!demoBitrixConnected) return snapshot;
  const sample = sourceExample("crm");
  const client = {...sample.clients[0], name: "Северная линия"};
  const sourceId = "demo-bitrix";
  const deal = {...sample.deals[0], title: "Обмен заказами с 1С", source_id: sourceId,
    result: "open", actions: [], suggestions: [], tasks: []};
  const call = {id: "demo-bitrix-call", client_id: client.id, deal_id: deal.id, source_id: sourceId,
    channel: "call", title: "Входящий звонок", at: deal.updated_at,
    lines: [{id: "r1", speaker: "client", text: "Нужно передавать заказы из интернет-магазина в 1С."}]};
  deal.tasks.push({id: "demo-bitrix-task", client_id: client.id, deal_id: deal.id, source_id: sourceId,
    crm_task_id: "bitrix-task-1", title: "Уточнить поля заказа", side: "manager", status: "open", updated_at: deal.updated_at});
  const connection = {id: sourceId, provider: "bitrix24", host: "Учебный портал", enabled: true,
    next_at: snapshot.generated_at, succeeded_at: snapshot.generated_at, sample_client_id: client.id,
    counts: {clients: 1, deals: 1, tasks: 1, calls: 1, changed: 4, skipped: 0}};
  return {...snapshot, clients: [...snapshot.clients, client], deals: [...snapshot.deals, deal],
    calls: [call, ...snapshot.calls], crm_connections: [connection],
    sources: [...(snapshot.sources || []), {id: sourceId, name: "Битрикс24 · пример", automatic: true, category: "crm"}]};
}

function bitrixStep(step) {
  bitrixSession.step = step;
  const panels = ["bitrix-guide", "bitrix-access", "bitrix-result"];
  panels.forEach((id, index) => { $(id).hidden = index !== step; });
  bitrixDialog.querySelectorAll(".bitrix-steps li").forEach((li, index) => {
    if (step === index) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
  $("bitrix-status").textContent = "";
  $("bitrix-status").classList.remove("crm-error");
  $("bitrix-back").hidden = step !== 1;
  $("bitrix-next").hidden = false;
  $("bitrix-next").disabled = false;
  $("bitrix-back").disabled = false;
  $(panels[step]).querySelector("h3").focus();
}

function openBitrixWizard(connection = null) {
  bitrixSession = {step: 0, verified: false, connection, busy: false, timer: null};
  $("bitrix-access").reset();
  $("bitrix-hook").removeAttribute("aria-invalid");
  $("bitrix-hook").readOnly = preview;
  if (preview) $("bitrix-hook").value = "example-webhook";
  $("bitrix-hook-hint").textContent = preview ? "Учебный вебхук уже подставлен." : "Формат: https://портал/rest/ID/ключ/";
  $("bitrix-portal-help").open = false;
  $("bitrix-portal-help").hidden = preview;
  $("bitrix-portal").value = "";
  updatePortalLink();
  $("bitrix-demo-note").hidden = !preview;
  $("bitrix-verified").hidden = true;
  bitrixDialog.showModal();
  bitrixStep(connection ? 2 : 0);
  if (connection) showBitrixResult(connection);
  else {
    $("bitrix-next").textContent = "Перейти к проверке";
    if (!preview && !canManageTeam()) {
      $("bitrix-status").textContent = "Подключение в Pacto настраивает руководитель.";
      $("bitrix-next").hidden = true;
    }
  }
}

function updatePortalLink() {
  const raw = $("bitrix-portal").value.trim();
  const link = $("bitrix-portal-link");
  let href = "";
  try {
    const url = new URL(raw.includes("://") ? raw : "https://" + raw);
    if (url.protocol === "https:" && url.hostname.includes(".") && url.pathname === "/" &&
        !url.username && !url.password && !url.search && !url.hash) href = url.origin + "/devops/";
  } catch { /* The user may still be typing the domain. */ }
  link.hidden = !href;
  if (href) link.href = href;
  else link.removeAttribute("href");
  $("bitrix-portal-note").textContent = raw && !href ? "Укажите только домен или HTTPS-адрес портала без пути." : "Введите домен вашего Битрикс24.";
}

function setAccessStatus(message, error = false) {
  $("bitrix-status").textContent = message;
  $("bitrix-status").classList.toggle("crm-error", error);
}

function resetBitrixCheck() {
  bitrixSession.verified = false;
  $("bitrix-hook").removeAttribute("aria-invalid");
  $("bitrix-verified").hidden = true;
  setAccessStatus("");
  $("bitrix-next").textContent = "Проверить доступ";
}

function showBitrixResult(item) {
  const state = bitrixSession;
  state.connection = item;
  clearTimeout(state.timer);
  const waiting = item.enabled && (item.running || !item.next_at || (!item.succeeded_at && !item.error));
  const summary = $("bitrix-summary");
  const next = $("bitrix-next");
  next.disabled = false;
  next.hidden = false;
  $("bitrix-back").hidden = true;
  if (waiting) {
    summary.textContent = item.running ? "Pacto загружает клиентов, сделки, задачи и звонки." : "Загрузка в очереди. Результат появится здесь.";
    next.textContent = "Закрыть";
    state.action = "close";
    state.timer = setTimeout(() => pollBitrixResult(state), 1600);
  } else if (item.error || !item.enabled) {
    summary.textContent = item.error || "Синхронизация приостановлена.";
    next.textContent = item.enabled && canManageTeam() ? "Повторить загрузку" : "Закрыть";
    state.action = item.enabled && canManageTeam() ? "retry" : "close";
    if (canManageTeam() && !preview) {
      $("bitrix-back").hidden = false;
      $("bitrix-back").textContent = "Изменить вебхук";
    }
  } else {
    const counts = item.counts || {};
    summary.innerHTML = `<p class="bitrix-success">${preview ? "Учебные данные загружены" : "Данные загружены"} · ${esc(date(item.succeeded_at))}</p>
      <dl class="bitrix-counts">${[["clients", "Клиенты"], ["deals", "Сделки"], ["tasks", "Задачи"], ["calls", "Звонки"]].map(([key, label]) =>
        `<div><dt>${label}</dt><dd>${esc(counts[key] ?? 0)}</dd></div>`).join("")}</dl>
      ${counts.skipped ? `<p class="small muted">Пропущено записей без связи или даты: ${esc(counts.skipped)}.</p>` : ""}
      <p class="small muted">${counts.clients ? "Досье объединяет сделку, задачи и историю общения клиента." : "Клиенты пока не найдены. Проверьте данные портала и видимость CRM для владельца вебхука."}</p>`;
    state.action = item.sample_client_id ? "dossier" : "close";
    next.textContent = item.sample_client_id ? "Открыть досье клиента" : "Закрыть";
  }
}

async function pollBitrixResult(state) {
  if (state !== bitrixSession) return;
  try {
    const rows = await api("/api/crm/connections");
    if (state !== bitrixSession) return;
    const item = entity(rows, state.connection.id);
    if (!item) throw new Error("Подключение не найдено.");
    setAccessStatus("");
    showBitrixResult(item);
  } catch (error) {
    if (state !== bitrixSession) return;
    if (error.status === 401) { showLogin(); return; }
    setAccessStatus(error.message, true);
    state.action = "poll";
    $("bitrix-next").textContent = "Обновить статус";
  }
}

async function advanceBitrix() {
  const state = bitrixSession;
  if (!state || state.busy) return;
  if (state.step === 0) {
    if (!preview && !canManageTeam()) return;
    bitrixStep(1);
    resetBitrixCheck();
    $("bitrix-back").textContent = "Назад";
    $("bitrix-hook").focus();
    return;
  }
  if (state.step === 1 && !$("bitrix-access").reportValidity()) return;
  state.busy = true;
  $("bitrix-next").disabled = $("bitrix-back").disabled = true;
  $("bitrix-hook").readOnly = true;
  try {
    if (state.step === 1) {
      if (!preview && !canManageTeam()) return;
      const fields = {provider: "bitrix24", endpoint: $("bitrix-hook").value.trim()};
      if (!state.verified) {
        setAccessStatus("Проверяем права на чтение…");
        const checked = preview ? {host: "Учебный портал"} : await api("/api/crm/bitrix24/check", fields);
        if (state !== bitrixSession) return;
        state.verified = true;
        $("bitrix-hook").removeAttribute("aria-invalid");
        $("bitrix-verified").hidden = false;
        $("bitrix-verified").textContent = checked.host + " · CRM и задачи доступны для чтения.";
        const reconnect = !preview && data.crm_connections?.some(c => c.provider === "bitrix24" && c.host === checked.host);
        setAccessStatus(reconnect ? "Вебхук этого портала будет обновлён при загрузке." : "Можно начать первую загрузку.");
        $("bitrix-next").textContent = "Загрузить данные";
      } else {
        setAccessStatus("Подключаем источник…");
        let item;
        if (preview) {
          demoBitrixConnected = true;
          await refresh();
          item = data.crm_connections[0];
        } else {
          const saved = await api("/api/crm/connections", fields);
          if (view === "settings" && data) run(null, async () => { await refreshCrmRows(); pollCrm(); });
          item = {id: saved.id, enabled: true};
        }
        if (state !== bitrixSession) return;
        $("bitrix-hook").value = "";
        bitrixStep(2);
        showBitrixResult(item);
      }
    } else if (state.action === "close") bitrixDialog.close();
    else if (state.action === "poll") await pollBitrixResult(state);
    else if (state.action === "retry") {
      await api("/api/crm/connections/" + state.connection.id + "/sync", {});
      if (state === bitrixSession) showBitrixResult({...state.connection, next_at: null});
    } else if (state.action === "dossier") {
      await refresh();
      if (state !== bitrixSession) return;
      const client = entity(data.clients, state.connection.sample_client_id);
      if (!client) throw new Error("Клиент больше не доступен. Обновите результат загрузки.");
      bitrixDialog.close();
      $("search").value = "";
      view = "clients";
      history.replaceState(null, "", "#clients");
      select(client.id);
    }
  } catch (error) {
    if (state !== bitrixSession) return;
    if (error.status === 401) { showLogin(); return; }
    if (state.step === 1 && !state.verified) $("bitrix-hook").setAttribute("aria-invalid", "true");
    setAccessStatus(error.message, true);
  } finally {
    if (state === bitrixSession) {
      state.busy = false;
      $("bitrix-hook").readOnly = preview;
      $("bitrix-next").disabled = $("bitrix-back").disabled = false;
    }
  }
}

$("bitrix-next").addEventListener("click", advanceBitrix);
$("bitrix-access").addEventListener("submit", event => { event.preventDefault(); advanceBitrix(); });
$("bitrix-hook").addEventListener("input", resetBitrixCheck);
$("bitrix-portal").addEventListener("input", updatePortalLink);
$("bitrix-close").addEventListener("click", () => bitrixDialog.close());
$("bitrix-back").addEventListener("click", () => {
  const previous = bitrixSession.step;
  bitrixStep(previous === 2 ? 1 : 0);
  $("bitrix-back").textContent = "Назад";
  if (previous === 2) { resetBitrixCheck(); $("bitrix-hook").focus(); }
  else $("bitrix-next").textContent = "Перейти к проверке";
});
bitrixDialog.addEventListener("close", () => {
  clearTimeout(bitrixSession?.timer);
  bitrixSession = null;
  $("bitrix-hook").value = "";
});
$("settings").addEventListener("click", event => {
  const link = event.target.closest("[data-bitrix-result]");
  if (link) openBitrixWizard(entity(data.crm_connections, link.dataset.bitrixResult));
});
