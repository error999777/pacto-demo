"use strict";

const $ = id => document.getElementById(id);
const preview = document.documentElement.hasAttribute("data-preview");
const stages = {discovery: "Уточнение потребности", technical: "Техническое обсуждение",
  estimate: "Подготовка оценки", proposal: "Предложение", contract: "Договор"};
const dealResults = {open: "В работе", won: "Выиграна", lost: "Проиграна"};
const callResults = {advanced: "Есть продвижение", agreed: "Договорились", no_step: "Без следующего шага",
  blocked: "Есть препятствие", declined: "Отказ"};
const channels = {call: "Звонок", meeting: "Встреча", message: "Мессенджер", email: "Письмо"};
const actionLabels = {contacted: "Связались", invited: "Приглашение отправлено", meeting_held: "Встреча состоялась",
  dismissed: "Сигнал снят"};
const suggestionLabels = {action: "Связаться", verify: "Проверить отправку"};
const taskLabels = {open: "Открыта", in_progress: "В работе", done: "Выполнена", cancelled: "Отменена"};
const dateFormat = new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "short", hour: "2-digit",
  minute: "2-digit", timeZone: "Europe/Minsk"});
const numberFormat = new Intl.NumberFormat("ru-RU");
const pluralFormat = new Intl.PluralRules("ru-RU");
const actors = {client: "Клиент", manager: "Менеджер", unknown: "Собеседник"};
const previewPath = ["contacted", "invited", "meeting_held"];
let snapshots = [];
let snapshotIndex = 0;
let demoRole = "manager";
let data;
let view = entrance();
let customerId;
let dealId;
let focusedCall;
let allCalls = false;
let dossierPane = "overview";
let noticeTimer;

function esc(value) {
  const entities = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"};
  return String(value ?? "").replace(/[&<>"']/g, char => entities[char]);
}
function entrance() {
  if (location.hash === "#settings" || location.hash === "#channels" || location.hash.startsWith("#settings-")) return "settings";
  if (location.hash === "#team") return "team";
  if (location.hash === "#reminders") return "reminders";
  if (location.hash === "#analytics" || location.hash.startsWith("#analytics-")) return "results";
  return "queue";
}
const date = value => value ? dateFormat.format(new Date(value)) : "";
const money = (value, currency = "BYN") => numberFormat.format(value) + " " + currency;
const dealStage = deal => deal.stage_label || stages[deal.stage];
const entity = (items, id) => items.find(item => item.id === id);
const canEdit = () => data.role === "manager";
const canManageTeam = () => data.role === "lead";
const clientDeals = id => data.deals.filter(deal => deal.client_id === id);
const clientCalls = id => data.calls.filter(call => call.client_id === id);
const countWithNoun = (count, one, few, many) =>
  `${numberFormat.format(count)} ${{one, few, many}[pluralFormat.select(count)] || many}`;

async function api(path, payload) {
  const response = await fetch(path, payload === undefined ? {} : {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.detail || "Не удалось загрузить данные.");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function notify(message, target = $("notice")) {
  target.textContent = message;
  if (target === $("notice")) {
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { target.textContent = ""; }, 6500);
  }
}

async function run(button, work, target) {
  if (button) button.disabled = true;
  try { await work(); }
  catch (error) {
    if (error.status === 401 && data) showLogin();
    if (error.status === 409 && data) await refresh().catch(() => {});
    notify(error.message, target);
  } finally { if (button) button.disabled = false; }
}

function showLogin() {
  allCalls = false;
  data = undefined;
  updateReminderClock();
  customerId = dealId = focusedCall = undefined;
  view = entrance();
  dossierPane = "overview";
  $("search").value = "";
  $("main").dataset.open = "false";
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  $("workspace").hidden = true;
  $("login").hidden = false;
  $("access-code").focus();
}

function demoSnapshot() {
  const member = demoRole === "lead" ? "local-lead" : "local-manager";
  return {...snapshots[snapshotIndex], role: demoRole, member_id: member,
    name: demoRole === "lead" ? "Анна Соколова" : "Мария Волкова",
    reminders: demoReminders(member)};
}

async function refresh() {
  data = preview ? demoSnapshot() : await api("/api/pipeline");
  $("login").hidden = true;
  $("workspace").hidden = false;
  $("logout").hidden = preview;
  $("actor").textContent = data.name;
  $("preview-bar").hidden = !preview;
  $("reset-preview").hidden = snapshotIndex === 0;
  render();
}

function setView(next) {
  if (next === "team" && !canManageTeam()) return;
  view = next;
  customerId = dealId = focusedCall = undefined;
  allCalls = false;
  dossierPane = "overview";
  $("main").dataset.open = "false";
  render();
  $("title").focus();
  if (!preview && ["queue", "clients", "results"].includes(next) &&
      (data.crm_connections?.length || data.channel_connections?.length)) run(null, refresh);
}

function select(client, deal, call) {
  customerId = client;
  dealId = deal;
  focusedCall = call;
  allCalls = false;
  dossierPane = "overview";
  $("main").dataset.open = "true";
  render();
  const heading = $("client-heading");
  heading?.focus();
  heading?.scrollIntoView({block: "nearest"});
}

function finance(deal) {
  if (deal.contribution != null) return "Вклад " + money(deal.contribution, deal.currency);
  if (deal.amount != null) return "Сумма " + money(deal.amount, deal.currency);
  return "Сумма неизвестна";
}

function render() {
  if (view === "team" && !canManageTeam()) view = "queue";
  $("nav").querySelector('[data-view="team"]').hidden = !canManageTeam();
  const labels = {queue: "Нужны действия", clients: "Клиенты", reminders: "Напоминания",
    results: "Аналитика", team: "Команда", settings: "Настройки"};
  $("title").textContent = labels[view];
  for (const button of $("nav").querySelectorAll("[data-view]")) {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  $("queue-count").textContent = data.queue.length || "";
  updateReminderClock();
  $("open-import").hidden = preview || !canEdit() || ["settings", "team", "reminders"].includes(view);
  $("inbox").hidden = !["queue", "clients"].includes(view);
  $("results").hidden = view !== "results";
  $("settings").hidden = view !== "settings";
  $("team").hidden = view !== "team";
  $("reminders").hidden = view !== "reminders";
  if (view === "reminders") {
    renderReminders();
    return;
  }
  if (view === "team") {
    renderTeam();
    return;
  }
  if (view === "settings") {
    renderSettings();
    return;
  }
  if (view === "results") {
    renderResults();
    return;
  }
  $("list-tools").hidden = view !== "clients";
  $("worklist-title").textContent = view === "queue" ? "Очередь сделок" : "Список клиентов";
  renderList();
  if (!customerId && !$("items").querySelector("[data-client]")) $("main").dataset.open = "false";
  renderDossier();
}

function renderList() {
  if (view === "queue") {
    $("items").innerHTML = data.queue.map((item, index) => {
      const deal = entity(data.deals, item.deal_id);
      const client = entity(data.clients, deal.client_id);
      return `<button type="button" class="deal work-item" data-state="${item.state === "verify" ? "review" : "action"}"
        data-client="${esc(client.id)}" data-deal="${esc(deal.id)}" data-call="${esc(item.call_id)}"
        aria-pressed="${focusedCall === item.call_id}">
        <span class="work-item-title"><span class="work-position" aria-label="Приоритет ${index + 1}">${index + 1}</span>
          <strong>${esc(client.name)}</strong></span>
        <span class="work-item-label">${esc(deal.title)}</span>
        <span class="statusline"><span class="tag status-chip" data-tone="${item.state === "verify" ? "attention" : "info"}">${suggestionLabels[item.state]}</span>
        <span class="small muted">${esc(finance(deal))}</span></span></button>`;
    }).join("") || '<p class="empty work-empty">Сейчас не нужно ни с кем связываться или проверять отправку.</p>';
    return;
  }
  const query = $("search").value.trim().toLocaleLowerCase("ru");
  const clients = [...data.clients].sort((a, b) => a.name.localeCompare(b.name, "ru")).filter(client =>
    [client.name, ...clientDeals(client.id).map(deal => deal.title)]
      .some(value => value.toLocaleLowerCase("ru").includes(query))
  );
  $("items").innerHTML = clients.map(client => {
    const deals = clientDeals(client.id);
    const last = clientCalls(client.id)[0];
    const shown = (query && deals.find(deal => deal.title.toLocaleLowerCase("ru").includes(query))) ||
      deals.find(deal => deal.result === "open") || deals[0];
    return `<button type="button" class="deal work-item client-list-item" data-client="${esc(client.id)}" ${shown ? `data-deal="${esc(shown.id)}"` : ""}
      aria-pressed="${customerId === client.id}">
      <span class="work-item-title"><strong>${esc(client.name)}</strong>
        ${deals.length > 1 ? `<span class="small muted">${countWithNoun(deals.length, "сделка", "сделки", "сделок")}</span>` : ""}</span>
      ${shown ? `<span class="work-item-label">${esc(shown.title)}</span>
        <span class="small muted">${esc(shown.result === "open" ? dealStage(shown) : dealResults[shown.result])}</span>` : ""}
      ${last ? `<span class="small muted work-last">Контакт ${esc(date(last.at))} · ${callResults[last.analysis?.result] || "Без разбора"}</span>` : ""}
      </button>`;
  }).join("") || `<p class="empty">${query ? "Клиенты не найдены." : "Клиенты ещё не загружены."}</p>`;
}

function sourceButton(callId, label, lineId = "") {
  return `<button type="button" class="source-link small" data-source="${esc(callId)}"
    data-line="${esc(lineId)}">${label}</button>`;
}

function renderDossier() {
  if (!customerId && view === "queue" && data.queue.length) {
    const first = data.queue[0];
    const deal = entity(data.deals, first.deal_id);
    customerId = deal.client_id;
    dealId = deal.id;
    focusedCall = first.call_id;
    allCalls = false;
    renderList();
  }
  if (!customerId && view === "clients") {
    const first = $("items").querySelector("[data-client]");
    if (first) {
      customerId = first.dataset.client;
      renderList();
    }
  }
  const client = entity(data.clients, customerId);
  if (!client) {
    const text = canEdit() && !data.clients.length ? "Загрузите пример или свой синтетический JSON." :
      "Откройте список клиентов, чтобы посмотреть историю.";
    $("detail").innerHTML = `<div class="work-panel work-empty"><p class="muted">${text}</p>${!preview && canEdit() && !data.clients.length
      ? '<button type="button" data-load-demo>Загрузить пример</button>' : ""}</div>`;
    return;
  }
  const deals = clientDeals(client.id).sort((a, b) => (a.result !== "open") - (b.result !== "open"));
  const deal = entity(deals, dealId) || deals.find(item => item.result === "open") || deals[0];
  dealId = deal?.id;
  const calls = clientCalls(client.id);
  const displayedCalls = allCalls || !deal ? calls : calls.filter(call => call.deal_id === deal.id);
  const inside = allCalls ? deals : deal ? [deal] : [];
  const tasks = inside.flatMap(owner => owner.tasks.map(task => ({...task, deal_title: owner.title,
    reminder_deal: owner.id})));
  if (allCalls || !deal) tasks.push(...(data.client_tasks || []).filter(task => task.client_id === client.id));
  tasks.sort((a, b) => (["done", "cancelled"].includes(a.status)) - (["done", "cancelled"].includes(b.status)));
  const next = deal?.suggestions.find(item => item.call_id === focusedCall) ||
    data.queue.find(item => item.deal_id === dealId) ||
    deal?.suggestions.find(item => ["contacted", "invited", "pending"].includes(item.state));
  $("detail").innerHTML = `
    <section class="dossier-head work-panel" aria-labelledby="client-heading">
    <header class="client-header">
      <button type="button" class="back quiet" data-back>← ${view === "queue" ? "К очереди" : "К клиентам"}</button>
      <h2 tabindex="-1" id="client-heading">${esc(client.name)}</h2>
    </header>
    ${deals.length ? `<div class="client-deals" aria-label="Сделки клиента">
      ${deals.map(item => `<button type="button" class="project" data-project="${esc(item.id)}" aria-pressed="${item.id === dealId}">
        <span><strong>${esc(item.title)}</strong><span class="small muted project-stage">${esc(dealStage(item))}</span></span>
        <span class="tag status-chip" data-tone="${item.result === "won" ? "success" : "neutral"}">${dealResults[item.result]}</span></button>`).join("")}
    </div>` : '<p class="small muted">У клиента пока нет сделок.</p>'}
    ${deal ? `<div class="mobile-project">
      <label for="project-select">Сделка</label>
      <select id="project-select" name="project">${deals.map(item =>
        `<option value="${esc(item.id)}"${item.id === dealId ? " selected" : ""}>${esc(item.title)}</option>`).join("")}</select>
      <div class="row-head"><span class="small muted">${esc(dealStage(deal))}</span>
        <span class="tag status-chip" data-tone="${deal.result === "won" ? "success" : "neutral"}">${dealResults[deal.result]}</span></div>
    </div>` : ""}
    ${deal || tasks.length ? `<div class="dossier-nav work-filters" role="group" aria-label="Раздел досье">
      ${[...(deal ? [["overview", "Сделка"]] : []), ["tasks", "Задачи", tasks.length], ["history", "Общение", displayedCalls.length]]
        .map(([id, label, count]) => `<button type="button" data-pane="${id}" aria-pressed="${(dossierPane === "overview" && !deal ? "history" : dossierPane) === id}">
          ${label}${count == null ? "" : ` <span class="item-count">${count}</span>`}</button>`).join("")}
      </div>` : ""}
    </section>
    ${deal && dossierPane === "overview" ? renderDeal(deal, next, displayedCalls) :
      `${deal ? `<div class="scope" role="group" aria-label="Какие данные показать">
        <button type="button" data-scope="deal" aria-pressed="${!allCalls}">Выбранная сделка</button>
        <button type="button" data-scope="client" aria-pressed="${allCalls}">Все сделки клиента</button>
      </div>` : ""}
      ${dossierPane === "tasks" ? renderTasks(tasks, allCalls) : renderHistory(displayedCalls)}`}`;
}

function renderDeal(deal, next, calls) {
  const client = entity(data.clients, deal.client_id);
  const related = calls.filter(call => call.deal_id === deal.id);
  const last = related[0];
  const reviewed = related.find(call => call.analysis);
  const openTasks = deal.tasks.filter(task => ["open", "in_progress"].includes(task.status));
  const pending = openTasks.slice().sort(byTaskDue)[0];
  const agreements = deal.tasks.filter(task => task.call_id && task.line_id);
  const dealSource = entity(data.sources || [], deal.source_id);
  const actions = [...deal.actions].reverse();
  return `
    ${next && view === "queue" ? renderNext(next, deal) : ""}
    <section class="dossier-block work-panel" aria-labelledby="deal-facts-title">
      <header class="work-section-head"><h3 id="deal-facts-title">Обзор сделки</h3><span class="tag status-chip">${esc(dealStage(deal))}</span></header>
      <p class="brief-scope">${esc(deal.scope || "Потребность клиента пока не указана.")}</p>
      <dl class="deal-facts">
        <div><dt>Ответственный</dt><dd>${esc(deal.manager)}</dd></div>
        <div><dt>Сумма сделки</dt><dd>${deal.amount == null ? "Не указана" : money(deal.amount, deal.currency)}</dd></div>
        ${deal.contribution == null ? "" : `<div><dt>За вычетом прямых затрат</dt><dd>${money(deal.contribution, deal.currency)}</dd></div>`}
        <div><dt>Источник</dt><dd>${esc(dealSource?.name || "Импорт JSON")}</dd></div>
      </dl>
      <dl class="brief-grid">
        <div><dt>Предложение</dt><dd>${esc(deal.title)}</dd></div>
        <div><dt>О компании</dt><dd>${esc(client.description || "Описание компании пока не добавлено.")}</dd></div>
        <div><dt>Контакты и участники сделки</dt><dd>${deal.stakeholders?.length ? deal.stakeholders.map(esc).join("<br>") : "Пока не указаны"}</dd></div>
        <div><dt>Последний итог разговора</dt><dd>${reviewed ? esc(reviewed.analysis.summary) + " " + sourceButton(reviewed.id, esc(date(reviewed.at))) : "Подтверждённого разбора пока нет."}</dd></div>
        <div><dt>Препятствия</dt><dd>${["blocked", "declined"].includes(reviewed?.analysis.result) ? esc(reviewed.analysis.summary) + " " + sourceButton(reviewed.id, "Основание") : "Нет подтверждённых сведений."}</dd></div>
      </dl>
      <h4>Договорённости</h4>
      ${agreements.length ? `<ul class="brief-agreements">${agreements.map(task => `<li>${sourceButton(task.call_id, esc(task.title), task.line_id)}
        <span class="small muted">${actors[task.side]} · ${taskLabels[task.status]}</span></li>`).join("")}</ul>` : '<p class="small muted">Подтверждённых договорённостей пока нет.</p>'}
      ${last && last !== reviewed ? sourceButton(last.id, "Последний контакт · " + esc(date(last.at))) : ""}
    </section>
    ${next ? (view === "queue" ? "" : renderNext(next, deal)) : `<section class="work-panel dossier-block"><h3>Следующий шаг</h3><p>${pending ? esc(pending.title) : deal.result === "open" ? "Следующий шаг пока не согласован." : "Сделка закрыта."}</p>
      ${pending ? `<p class="small muted">${pending.side === "manager" ? esc(deal.manager) : "Клиент"} · ${pending.due ? esc(date(pending.due)) : "Срок не согласован"}</p>` : ""}</section>`}
    ${actions.length ? `<details class="dossier-block work-panel" open>
      <summary>Действия по сделке <span class="item-count">${actions.length}</span></summary><div class="task-list">
      ${actions.map(action => `<div class="task"><strong>${actionLabels[action.kind]}</strong>
        <p class="small muted">${esc(date(action.at))} · ${esc(action.note)}</p></div>`).join("")}</div></details>` : ""}`;
}

function byTaskDue(a, b) {
  if (!a.due || !b.due) return Number(!a.due) - Number(!b.due);
  return Date.parse(a.due) - Date.parse(b.due);
}

function renderTasks(tasks, showProject) {
  if (!tasks.length) return '<p class="empty work-panel">Задач пока нет.</p>';
  const closed = task => ["done", "cancelled"].includes(task.status);
  const active = tasks.filter(task => !closed(task)).sort(byTaskDue);
  return [["Сделать нам", active.filter(task => task.side === "manager"), "info"],
    ["Ждём от клиента", active.filter(task => task.side === "client"), "attention"],
    ["Завершены", tasks.filter(closed), "neutral"]]
    .filter(([, rows]) => rows.length).map(([label, rows, tone]) => `<section class="task-group work-panel" data-tone="${tone}">
    <div class="work-section-head"><h3>${label}</h3><span class="work-count">${rows.length}</span></div>
    <div class="task-list">${rows.map(task => {
      const quote = task.call_id && entity(data.calls, task.call_id)?.lines.find(line => line.id === task.line_id);
      return `<article class="task" tabindex="-1">
      <div class="row-head">
        <strong>${esc(task.title)}</strong>
        <span class="tag status-chip" data-tone="${task.status === "done" ? "success" : task.status === "open" ? "attention" : "neutral"}">${taskLabels[task.status]}</span>
      </div>
      ${showProject ? `<p class="small muted">${esc(task.deal_title || "Без привязки к сделке")}</p>` : ""}
      <p class="small muted">${actors[task.side]} · ${task.due ? "до " + esc(date(task.due)) : "Срок не указан"}</p>
      ${quote || task.result ? `<details>
        <summary class="small">${task.result ? "Результат задачи" : "Цитата из разговора"}</summary>
        ${task.result ? `<p>${esc(task.result)}</p>` : ""}
        ${quote ? `<blockquote class="evidence">«${esc(quote.text)}»</blockquote>` : ""}
      </details>` : ""}
      ${task.call_id ? sourceButton(task.call_id, "К реплике в разговоре", task.line_id) :
        `<small class="muted">${esc(entity(data.sources || [], task.source_id)?.name || "Импорт JSON")}</small>`}
      ${task.reminder_deal ? reminderButton(task.reminder_deal, reminderTaskKind(task), task.id,
        ["open", "in_progress"].includes(task.status)) : ""}
    </article>`;
    }).join("")}</div></section>`).join("");
}

function renderHistory(calls) {
  const withText = calls.filter(call => call.lines.length).length;
  const channelRefresh = !preview && data.channel_connections?.length;
  return `<section class="call-list" aria-label="История общения">
    ${calls.length || channelRefresh ? `<div class="row-head">
      <p class="small muted history-coverage">${calls.length ? `С текстом ${withText} из ${calls.length}` : ""}</p>
      ${channelRefresh ? '<button class="quiet small" type="button" data-refresh-history>Обновить общение</button>' : ""}
    </div>` : ""}
    ${calls.map(renderCall).join("") || '<p class="empty work-panel">Записей общения пока нет.</p>'}</section>`;
}

function renderNext(item, deal) {
  const call = entity(data.calls, item.call_id);
  const labels = {...suggestionLabels, ...actionLabels, pending: "Ждём срока", resolved: "Шаг закрыт"};
  const facts = item.kind === "invite"
    ? item.state === "verify" ? "Проверьте отправку приглашения."
      : item.state === "action" ? "Срок прошёл, подтверждения отправки нет."
      : ""
    : "";
  const quotes = call.lines.filter(line => item.source_ids.includes(line.id));
  const priority = item.state === "verify" ? "В очереди проверок" :
    item.fresh && item.due ? "Свежий звонок с просроченным обещанием" :
    item.fresh ? "Свежий разговор с поводом для контакта" : "Давний контакт с открытым вопросом";
  const allowed = preview
    ? item.call_id === "alpha-2" ? item.allowed.filter(kind => kind === previewPath[snapshotIndex]) : []
    : item.allowed;
  const tone = item.state === "verify" || item.state === "pending" ? "attention" :
    ["meeting_held", "invited"].includes(item.state) ? "success" : "info";
  return `<section class="priority" data-tone="${tone}" aria-labelledby="next-heading" tabindex="-1">
    <div class="work-section-head"><p class="action-caption">Следующий шаг</p><span class="tag status-chip">${labels[item.state]}</span></div>
    <h3 id="next-heading">${esc(item.angle)}</h3>
    ${facts ? `<p class="priority-reason">${facts}</p>` : ""}
    <p class="small muted">${esc(deal.manager)} · ${item.due ? "Обещанный срок " + esc(date(item.due)) : "Срок не согласован"}</p>
    <div class="priority-actions">
      ${canEdit() && allowed.length ? renderRecord(item.call_id, allowed) : ""}
      ${reminderButton(deal.id, "step", call.id, !["resolved", "dismissed", "meeting_held"].includes(item.state))}
    </div>
    <div class="priority-details">
    <details class="draft">
      <summary>Из разговора</summary>
      ${item.due ? `<p class="small muted">Обещанный срок · ${esc(date(item.due))}</p>` : ""}
      ${["action", "verify"].includes(item.state) ? `<p class="small muted">${priority} · ${esc(finance(deal))}</p>` : ""}
      <blockquote class="evidence">${renderLines(quotes)}</blockquote>
      ${sourceButton(call.id, "Читать разговор")}
    </details>
    ${item.state === "action" ? `<details class="draft"><summary>Черновик сообщения</summary>
      <p>${esc(item.kind === "invite"
        ? "Добрый день! Возвращаюсь к договорённости по проекту «" + deal.title +
          "». Предлагаю следующую повестку: " + item.angle + ". Когда вам удобно созвониться?"
        : "Добрый день! Возвращаюсь к обсуждению проекта «" + deal.title +
          "». Можно коротко созвониться, чтобы обсудить вопрос, который остался открытым?")}</p></details>` : ""}
    </div></section>`;
}

function renderRecord(callId, allowed) {
  if (preview) {
    const kind = allowed[0];
    const labels = {contacted: "Имитировать контакт", invited: "Имитировать отправку",
      meeting_held: "Имитировать встречу"};
    return `<div class="actions"><button type="button" class="primary" data-preview-step="${kind}"
      data-preview-call="${esc(callId)}">${labels[kind]}</button></div>`;
  }
  return `<details class="record-form"><summary>Записать результат</summary>
    <form class="editor" data-outcome="${esc(callId)}">
      <label>Результат<select name="kind">${allowed.map(kind => `<option value="${kind}">${actionLabels[kind]}</option>`).join("")}</select></label>
      <label data-action-date ${allowed[0] === "invited" ? "" : "hidden"}>Когда отправили (по Минску)
        <input name="occurred_at" type="datetime-local" aria-describedby="action-date-hint">
        <small class="muted" id="action-date-hint">Укажите фактическое время, если оно известно.</small>
      </label>
      <label>Что произошло<textarea name="note" rows="2" maxlength="1000" required></textarea></label>
      <div class="actions"><button type="submit" class="primary">Сохранить результат</button></div>
    </form></details>`;
}

function renderLines(lines) {
  return lines.map(line => `<p data-quote="${esc(line.id)}" tabindex="-1">
    <strong class="small">${actors[line.speaker]}</strong><br>${esc(line.text)}</p>`).join("");
}

function renderCall(call) {
  const deal = entity(data.deals, call.deal_id);
  const source = entity(data.sources || [], call.source_id);
  const channel = channels[call.channel || "call"];
  const content = call.channel === "message" || call.channel === "email" ? "Текст сообщения" : "Расшифровка";
  const result = call.analysis?.result;
  const review = entity(data.analysis_reviews || [], call.id);
  const draft = entity(data.analysis_drafts || [], call.id);
  const editable = !preview && canEdit() && !call.analysis && !review;
  const decision = review?.decision === "rejected" ? "Черновик отклонён" : draft ? "Ждёт подтверждения" : null;
  const media = data.channel_media?.[call.id];
  const assessment = data.coaching?.calls[call.id];
  const showScript = assessment && (canManageTeam() || assessment.owner === data.member_id) &&
    (assessment.checks || data.script_ai_available && call.lines.length);
  const promises = [...(deal?.tasks || []), ...(data.client_tasks || [])].filter(task => task.call_id === call.id);
  const opportunity = call.analysis?.opportunity;
  if (opportunity?.manager_line && !promises.some(task => task.line_id === opportunity.manager_line)) {
    promises.push({side: "manager", title: "Отправить приглашение на встречу", line_id: opportunity.manager_line, due: opportunity.due});
  }
  const hasAudio = ["call", "meeting"].includes(call.channel || "call");
  const excerpt = call.lines.find(line => line.speaker === "client") || call.lines[0];
  const outcomeLine = call.lines.find(line => line.id === opportunity?.client_line) || (result && call.lines.at(-1));
  return `<details class="call-card contact-entry" id="call-${esc(call.id)}">
    <summary><span class="contact-heading"><strong>${esc(call.title || channel)}</strong><time class="small muted numeric" datetime="${esc(call.at)}">${esc(date(call.at))}</time></span>
    <span class="contact-meta small muted">${call.title ? channel + " · " : ""}${esc(deal?.title || "Без привязки к сделке")}</span>
    <span class="tag status-chip" data-tone="${result === "advanced" ? "success" : draft || ["blocked", "no_step"].includes(result) ? "attention" : "neutral"}">${decision || callResults[result] || (call.lines.length ? "Без разбора" : "Текст не получен")}</span>
    </summary><div class="contact-body">
    ${renderRecording(call.id, media)}
    ${hasAudio && !media?.recording && (!media?.state || media.state === "ready") ? `<p class="small muted">${call.lines.length ? "Есть только расшифровка" : "Запись разговора не получена"}</p>` : ""}
    <section><h4>Что обсуждали</h4><p>${esc(call.analysis?.summary || draft?.analysis?.summary || (excerpt ? "Из разговора: «" + excerpt.text + "»" : "Текст разговора не получен."))}</p>
      ${!call.analysis && draft ? '<small class="muted">Черновик · ожидает проверки</small>' : ""}</section>
    <section><h4>Обещания</h4>${promises.length ? promises.map(task => {
      const quote = call.lines.find(line => line.id === task.line_id);
      return `<div class="promise"><strong>${esc(task.title)}</strong>
        <p class="small muted">${actors[task.side]} · ${task.due ? "до " + esc(date(task.due)) : "Без согласованного срока"}</p>
        ${quote ? `<blockquote>«${esc(quote.text)}»</blockquote>` : ""}</div>`;
    }).join("") : '<p class="muted">Подтверждённых обещаний пока нет.</p>'}</section>
    <section><h4>Итог</h4><p>${callResults[result] || "Итог пока не подтверждён."}</p>
      ${outcomeLine ? `<blockquote><small class="muted">${actors[outcomeLine.speaker]}</small><br>«${esc(outcomeLine.text)}»</blockquote>` : ""}</section>
    ${showScript ? `<button type="button" class="source-link" data-open-script="${esc(call.id)}">Сравнение со скриптом продаж</button>` : ""}
    <p class="small muted">${esc(source?.name || "Импорт JSON")}${call.duration_seconds == null ? "" : " · " + numberFormat.format(call.duration_seconds) + " с"}${review ? " · Проверил(а) " + esc(review.author) : ""}</p>
    ${call.lines.length ? `<details class="call-transcript">
      <summary class="small">${content}</summary>
      <blockquote class="evidence">${renderLines(call.lines)}</blockquote>
    </details>` : ""}${editable ? `<details class="analysis-editor"><summary>${draft ? "Проверить черновик" : "Подготовить разбор"}</summary>
      ${renderAnalysisForm(call, draft?.analysis)}</details>` : ""}</div></details>`;
}

function renderAnalysisForm(call, draft) {
  const options = (values, selected) => values.map(([key, label]) =>
    `<option value="${esc(key)}"${selected === key ? " selected" : ""}>${esc(label)}</option>`).join("");
  const lines = side => [["", "Выберите реплику"], ...call.lines.filter(line => line.speaker === side)
    .map(line => [line.id, line.text])];
  const opportunity = draft?.opportunity;
  return `<form class="editor" data-analysis="${esc(call.id)}" aria-label="Проверка разбора">
    ${data.ai_available && !draft ? '<div><button type="button" data-suggest>Предложить разбор с DeepSeek</button></div>' : ""}
    <label>Итог разговора<textarea name="summary" rows="2" maxlength="1000" required>${esc(draft?.summary)}</textarea></label>
    <label>Результат<select name="result">${options(Object.entries(callResults), draft?.result || "no_step")}</select></label>
    <label>Следующий шаг<select name="opportunity">${options([["", "Без предложения"], ["invite", "Отправить приглашение"],
      ["reopen", "Вернуться с предложением"]], opportunity?.kind)}</select></label>
    <div class="editor" data-opportunity ${opportunity ? "" : "hidden"}>
      <label>Предложение<input name="angle" maxlength="160" value="${esc(opportunity?.angle)}"></label>
      <label>Реплика клиента<select name="client_line">${options(lines("client"), opportunity?.client_line)}</select></label>
      <div class="editor" data-invite ${opportunity?.kind === "invite" ? "" : "hidden"}>
        <label>Реплика менеджера<select name="manager_line">${options(lines("manager"), opportunity?.manager_line)}</select></label>
        <label>Срок отправки по Минску<input name="due" type="datetime-local" value="${esc(minskInput(opportunity?.due))}"
          data-original="${esc(opportunity?.due)}"></label>
      </div>
    </div>
    <details class="dossier-block">
      <summary>Качество разговора</summary>
      <label class="quality-toggle"><input type="checkbox" name="quality" ${draft?.quality ? "checked" : ""}> Учитывать в оценке</label>
      <div class="editor" data-quality ${draft?.quality ? "" : "hidden"}>
        <label>Уточнённая потребность<select name="need_line">${options(lines("client"), draft?.quality?.need_line)}</select></label>
        <label>Обсуждённый срок<select name="deadline_line">${options([["", "Выберите реплику"], ...call.lines
          .filter(line => line.speaker !== "unknown").map(line => [line.id, line.text])], draft?.quality?.deadline_line)}</select></label>
      </div>
    </details>
    <div class="actions"><button class="primary" type="submit">${draft ? "Подтвердить разбор" : "Сохранить разбор"}</button></div>
    ${draft ? '<details><summary class="small">Отклонить черновик</summary><p class="small muted">Разбор не попадёт в работу.</p><button type="button" data-reject-analysis>Отклонить</button></details>' : ""}
    </form>`;
}

function minskInput(value) {
  if (!value) return "";
  const format = new Intl.DateTimeFormat("sv-SE", {year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", timeZone:"Europe/Minsk"});
  return format.format(new Date(value)).replace(" ", "T");
}

function openCall(id, lineId) {
  if (dossierPane !== "history") {
    dossierPane = "history";
    renderDossier();
  }
  let call = $("call-" + id);
  if (!call) {
    allCalls = true;
    renderDossier();
    call = $("call-" + id);
  }
  if (call) {
    call.open = true;
    const quote = lineId && call.querySelector('[data-quote="' + CSS.escape(lineId) + '"]');
    if (quote) quote.closest("details").open = true;
    const target = quote || call.querySelector("summary");
    target.focus();
    target.scrollIntoView({block: "nearest"});
  }
}

function showSaved(deal, callId, message) {
  if (view === "queue") view = "clients";
  select(deal.client_id, deal.id, callId);
  notify(message);
}

$("nav").addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (button) setView(button.dataset.view);
});
$("items").addEventListener("click", event => {
  const row = event.target.closest("[data-client]");
  if (row) select(row.dataset.client, row.dataset.deal, row.dataset.call);
});
$("search").addEventListener("input", renderList);
$("detail").addEventListener("play", event => {
  for (const player of $("detail").querySelectorAll("audio, video")) {
    if (player !== event.target && !player.paused) player.pause();
  }
}, true);
$("detail").addEventListener("toggle", event => {
  if (event.target.matches(".contact-entry") && !event.target.open) {
    event.target.querySelector("audio, video")?.pause();
  }
}, true);
$("results").addEventListener("click", event => {
  const button = event.target.closest("[data-report-deal]");
  if (!button) return;
  const deal = entity(data.deals, button.dataset.reportDeal);
  view = "clients";
  select(deal.client_id, deal.id);
  if (button.dataset.reportCall) openCall(button.dataset.reportCall);
});
$("detail").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-back")) {
    $("main").dataset.open = "false";
    ($("items").querySelector('[aria-pressed="true"]') || $("items").querySelector("button") || $("title")).focus();
  } else if (button.dataset.project) {
    dealId = button.dataset.project;
    focusedCall = undefined;
    allCalls = false;
    renderDossier();
    $("detail").querySelector('.project[aria-pressed="true"]').focus();
  } else if (button.dataset.pane) {
    dossierPane = button.dataset.pane;
    renderDossier();
    $("detail").querySelector('.dossier-nav [aria-pressed="true"]').focus();
  } else if (button.dataset.scope) {
    allCalls = button.dataset.scope === "client";
    renderDossier();
    $("detail").querySelector('.scope [aria-pressed="true"]').focus();
  } else if (button.dataset.source) {
    openCall(button.dataset.source, button.dataset.line);
  } else if (button.hasAttribute("data-refresh-history")) {
    run(button, async () => {
      await refresh();
      $("detail").querySelector("[data-refresh-history]")?.focus();
    });
  } else if (button.hasAttribute("data-load-demo")) {
    run(button, loadDemo);
  } else if (button.dataset.previewStep && preview) {
    const deal = entity(data.deals, dealId);
    const callId = button.dataset.previewCall;
    run(button, async () => {
      snapshotIndex++;
      await refresh();
      showSaved(deal, callId, actionLabels[button.dataset.previewStep] + " в демо.");
    });
  } else if (button.hasAttribute("data-suggest")) {
    const id = button.closest("form").dataset.analysis;
    run(button, async () => {
      await api(`/api/pipeline/calls/${id}/suggest?revision=${data.revision}`, {});
      const stayed = button.isConnected;
      await refresh();
      if (stayed) {
        openCall(id);
        const editor = $("call-" + id)?.querySelector(".analysis-editor");
        if (editor) editor.open = true;
      }
      notify("Проверьте итог и цитаты перед сохранением.");
    });
  } else if (button.hasAttribute("data-reject-analysis")) {
    const id = button.closest("form").dataset.analysis;
    run(button, async () => {
      await api(`/api/pipeline/calls/${id}/reject-analysis`, {revision: data.revision});
      await refresh();
      openCall(id);
      notify("Черновик отклонён.");
    });
  }
});

$("detail").addEventListener("change", event => {
  if (event.target.form?.dataset.outcome && event.target.name === "kind") {
    event.target.form.querySelector("[data-action-date]").hidden = event.target.value !== "invited";
    return;
  }
  if (event.target.id === "project-select") {
    dealId = event.target.value;
    focusedCall = undefined;
    allCalls = false;
    renderDossier();
    $("project-select").focus();
    return;
  }
  if (event.target.name === "quality") {
    event.target.form.querySelector("[data-quality]").hidden = !event.target.checked;
    return;
  }
  if (event.target.name !== "opportunity") return;
  const form = event.target.form;
  form.querySelector("[data-opportunity]").hidden = !event.target.value;
  form.querySelector("[data-invite]").hidden = event.target.value !== "invite";
});

$("detail").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  if (form.dataset.outcome) {
    const id = form.dataset.outcome;
    const deal = entity(data.deals, dealId);
    const kind = values.get("kind");
    const occurred = kind === "invited" && values.get("occurred_at");
    run(event.submitter, async () => {
      await api(`/api/pipeline/calls/${id}/outcome`, {revision: data.revision, kind, note: values.get("note"),
        occurred_at: occurred ? occurred + ":00+03:00" : null});
      await refresh();
      showSaved(deal, id, actionLabels[kind] + ".");
    });
  } else if (form.dataset.analysis) {
    const id = form.dataset.analysis;
    const kind = values.get("opportunity");
    const opportunity = kind ? {kind, angle: values.get("angle"), client_line: values.get("client_line")} : null;
    if (kind === "invite") {
      opportunity.manager_line = values.get("manager_line");
      const due = values.get("due");
      const original = form.elements.due.dataset.original;
      opportunity.due = due ? (original && due === minskInput(original) ? original : due + ":00+03:00") : null;
    }
    const quality = values.has("quality") ? {
      need_line: values.get("need_line") || null, deadline_line: values.get("deadline_line") || null
    } : null;
    run(event.submitter, async () => {
      await api(`/api/pipeline/calls/${id}/analysis`, {revision: data.revision,
        analysis: {summary: values.get("summary"), result: values.get("result"), opportunity, quality}});
      await refresh();
      openCall(id);
      notify("Разбор сохранён.");
    });
  }
});

$("login-form").addEventListener("submit", event => {
  event.preventDefault();
  run(event.submitter, async () => {
    await api("/api/login", {code: $("access-code").value});
    $("access-code").value = "";
    await refresh();
  });
});
$("logout").addEventListener("click", event => run(event.currentTarget, async () => {
  await api("/api/logout", {});
  showLogin();
}));
$("open-import").addEventListener("click", () => {
  $("import-notice").textContent = "";
  $("import-dialog").showModal();
});
$("close-import").addEventListener("click", () => $("import-dialog").close());

async function importBatch(batch) {
  const {inserted} = await api("/api/pipeline/import", batch);
  $("import-dialog").close();
  await refresh();
  if (view !== "settings") setView("queue");
  notify(inserted ? `Новых или обновлённых записей: ${inserted}.` : "Данные уже загружены.");
}
async function loadDemo() { await importBatch(await api("/api/pipeline/demo")); }
$("demo").addEventListener("click", event => run(event.currentTarget, loadDemo, $("import-notice")));
$("import-form").addEventListener("submit", event => {
  event.preventDefault();
  run(event.submitter, async () => {
    const file = $("import-file").files[0];
    if (file.size > 2_000_000) throw new Error("Выберите файл размером до 2 МБ.");
    let batch;
    try { batch = JSON.parse(await file.text()); }
    catch { throw new Error("Проверьте синтаксис JSON."); }
    await importBatch(batch);
    event.target.reset();
  }, $("import-notice"));
});
$("reset-preview").addEventListener("click", () => {
  snapshotIndex = 0;
  data = demoSnapshot();
  $("reset-preview").hidden = true;
  setView("queue");
  notify("Демо возвращено к началу.");
});
$("demo-role").addEventListener("change", event => {
  if (!preview) return;
  demoRole = event.target.value;
  if (demoRole === "lead" && entrance() === "team") view = "team";
  run(null, refresh);
});

async function start() {
  if (preview) snapshots = await api("assets/demo-snapshots.json");
  await refresh();
}
document.addEventListener("DOMContentLoaded", () => start().catch(error => {
  if (!preview) showLogin();
  if (error.status !== 401) notify(error.message);
}));
