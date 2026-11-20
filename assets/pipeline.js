"use strict";

const $ = id => document.getElementById(id);
const preview = document.documentElement.hasAttribute("data-preview");
const stages = {discovery: "Уточнение потребности", technical: "Техническое обсуждение",
  estimate: "Подготовка оценки", proposal: "Предложение", contract: "Договор"};
const dealResults = {open: "В работе", won: "Выиграна", lost: "Проиграна"};
const callResults = {advanced: "Есть продвижение", agreed: "Договорились", no_step: "Без следующего шага",
  blocked: "Есть препятствие", declined: "Отказ"};
const actionLabels = {contacted: "Связались", invited: "Приглашение отправлено", meeting_held: "Встреча состоялась",
  dismissed: "Сигнал снят"};
const suggestionLabels = {action: "Нужен контакт", verify: "Нужно проверить"};
const taskLabels = {open: "Открыта", done: "Выполнена", cancelled: "Отменена"};
const dateFormat = new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "short", hour: "2-digit",
  minute: "2-digit", timeZone: "Europe/Minsk"});
const numberFormat = new Intl.NumberFormat("ru-RU");
const actors = {client: "Клиент", manager: "Менеджер", unknown: "Собеседник"};
const previewPath = ["contacted", "invited", "meeting_held"];
let snapshots = [];
let snapshotIndex = 0;
let data;
let view = "queue";
let customerId;
let dealId;
let focusedCall;
let allCalls = true;
let suggestionDraft;
let noticeTimer;

function esc(value) {
  const entities = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"};
  return String(value ?? "").replace(/[&<>"']/g, char => entities[char]);
}
const date = value => value ? dateFormat.format(new Date(value)) : "";
const money = value => numberFormat.format(value) + " BYN";
const entity = (items, id) => items.find(item => item.id === id);
const canEdit = () => data.role === "manager";
const clientDeals = id => data.deals.filter(deal => deal.client_id === id);
const clientCalls = id => data.calls.filter(call => call.client_id === id);

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
  data = undefined;
  customerId = dealId = focusedCall = suggestionDraft = undefined;
  view = "queue";
  $("search").value = "";
  $("main").dataset.open = "false";
  if ($("import-dialog").open) $("import-dialog").close();
  $("workspace").hidden = true;
  $("login").hidden = false;
  $("access-code").focus();
}

async function refresh() {
  data = preview ? snapshots[snapshotIndex] : await api("/api/pipeline");
  $("login").hidden = true;
  $("workspace").hidden = false;
  $("open-import").hidden = preview || !canEdit();
  $("logout").hidden = preview;
  $("actor").textContent = preview ? "Демо · менеджер" : data.name;
  $("preview-bar").hidden = !preview;
  $("reset-preview").hidden = snapshotIndex === 0;
  render();
}

function setView(next) {
  view = next;
  customerId = dealId = focusedCall = suggestionDraft = undefined;
  allCalls = true;
  $("main").dataset.open = "false";
  render();
  $("title").focus();
}

function select(client, deal, call) {
  customerId = client;
  dealId = deal;
  focusedCall = call;
  allCalls = view === "clients";
  suggestionDraft = undefined;
  $("main").dataset.open = "true";
  render();
  const heading = $("client-heading");
  heading?.focus();
  heading?.scrollIntoView({block: "nearest"});
}

function finance(deal) {
  if (deal.contribution != null) return "Вклад " + money(deal.contribution);
  if (deal.amount != null) return "Сумма " + money(deal.amount);
  return "Сумма неизвестна";
}

function render() {
  const labels = {
    queue: ["Нужны действия", "Сделки, где имеет смысл сделать следующий шаг"],
    clients: ["Все клиенты", "Сделки, задачи и история общения"],
    results: ["Результаты", "Исходы сделок и действия после звонка"]
  };
  [$("title").textContent, $("subtitle").textContent] = labels[view];
  for (const button of $("nav").querySelectorAll("[data-view]")) {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  $("queue-count").textContent = data.queue.length || "";
  $("inbox").hidden = view === "results";
  $("results").hidden = view !== "results";
  if (view === "results") {
    renderResults();
    return;
  }
  $("list-tools").hidden = view !== "clients";
  renderList();
  if (!customerId && !$("items").querySelector("[data-client]")) $("main").dataset.open = "false";
  renderDossier();
}

function renderList() {
  if (view === "queue") {
    $("items").innerHTML = data.queue.map((item, index) => {
      const deal = entity(data.deals, item.deal_id);
      const client = entity(data.clients, deal.client_id);
      return `<button type="button" class="deal" data-state="${item.state === "verify" ? "review" : "action"}"
        data-client="${esc(client.id)}" data-deal="${esc(deal.id)}" data-call="${esc(item.call_id)}"
        aria-pressed="${focusedCall === item.call_id}">
        <strong>${index + 1}. ${esc(client.name)}</strong>
        <span>${esc(deal.title)}</span>
        <span class="small muted">${stages[deal.stage]}</span>
        <span class="small muted row-meta">${esc(item.angle)}</span>
        <span class="statusline"><span class="tag">${suggestionLabels[item.state]}</span>
        <span class="small muted">${esc(finance(deal))}</span></span></button>`;
    }).join("") || '<p class="empty">Сейчас нет сделок, требующих контакта или проверки.</p>';
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
    const overview = deals.map(deal => deal.title + " · " +
      (deal.result === "open" ? stages[deal.stage] : dealResults[deal.result]));
    return `<button type="button" class="deal" data-client="${esc(client.id)}" aria-pressed="${customerId === client.id}">
      <strong>${esc(client.name)}</strong>
      ${overview.map(line => `<span class="small row-meta">${esc(line)}</span>`).join("")}
      ${last ? `<span class="small muted row-meta">${esc(date(last.at))} · ${callResults[last.analysis?.result] || "Без разбора"}</span>` : ""}
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
    $("detail").innerHTML = `<p class="empty">${text}</p>${!preview && canEdit() && !data.clients.length
      ? '<button type="button" data-load-demo>Загрузить пример</button>' : ""}`;
    return;
  }
  const deals = clientDeals(client.id).sort((a, b) => (a.result !== "open") - (b.result !== "open"));
  const deal = entity(deals, dealId) || deals.find(item => item.result === "open") || deals[0];
  dealId = deal?.id;
  const calls = clientCalls(client.id);
  const displayedCalls = allCalls || !deal ? calls : calls.filter(call => call.deal_id === deal.id);
  const next = deal?.suggestions.find(item => item.call_id === focusedCall) ||
    data.queue.find(item => item.deal_id === dealId) ||
    deal?.suggestions.find(item => ["contacted", "invited", "pending"].includes(item.state));
  $("detail").innerHTML = `
    <button type="button" class="back quiet" data-back>← К списку</button>
    <header class="client-header"><h2 tabindex="-1" id="client-heading">${esc(client.name)}</h2></header>
    ${deals.length ? `<div class="client-deals" aria-label="Сделки клиента">
      ${deals.map(item => `<button type="button" class="project" data-project="${esc(item.id)}" aria-pressed="${item.id === dealId}">
        <strong>${esc(item.title)}</strong><span class="small muted">${esc(stages[item.stage])} · ${esc(dealResults[item.result])}</span></button>`).join("")}
    </div>` : '<p class="muted">Сделки ещё не привязаны.</p>'}
    ${deal ? renderDeal(deal, next, displayedCalls, allCalls ? deals : [deal]) : ""}
    <section class="dossier-section" aria-labelledby="call-heading">
      <h3 id="call-heading">Звонки <span class="small muted">${displayedCalls.length}</span></h3>
      ${deal ? `<div class="filters" aria-label="Какие звонки показать">
        <button type="button" data-scope="client" aria-pressed="${allCalls}">Все звонки клиента</button>
        <button type="button" data-scope="deal" aria-pressed="${!allCalls}">По этой сделке</button>
      </div>` : ""}
      <div class="call-list">${displayedCalls.map(renderCall).join("") || '<p class="empty">Звонков пока нет.</p>'}</div>
    </section>`;
}

function renderDeal(deal, next, calls, taskDeals) {
  const last = calls.find(call => call.deal_id === deal.id);
  const actions = [...deal.actions].reverse();
  const tasks = taskDeals.flatMap(owner => owner.tasks.map(task => ({...task, deal_title: owner.title})));
  tasks.sort((a, b) => (a.status !== "open") - (b.status !== "open"));
  return `
    ${next ? renderNext(next, deal) : ""}
    <section class="deal-header dossier-section" aria-labelledby="context-heading">
      <h3 id="context-heading">Контекст сделки</h3><p>${esc(deal.scope)}</p>
      <dl class="deal-facts">
        <div><dt>Менеджер</dt><dd>${esc(deal.manager)}</dd></div>
        ${deal.amount == null ? "" : `<div><dt>Сумма сделки</dt><dd>${money(deal.amount)}</dd></div>`}
        ${deal.contribution == null ? "" : `<div><dt>Вклад после прямых затрат</dt><dd>${money(deal.contribution)}</dd></div>`}
      </dl>
      ${last ? `<p class="small muted">Последний звонок · ${esc(date(last.at))} · ${callResults[last.analysis?.result] || "Без разбора"}</p>` : ""}
    </section>
    ${actions.length ? `<section class="dossier-section" aria-labelledby="action-heading">
      <h3 id="action-heading">Результаты действий</h3><div class="task-list">
      ${actions.map(action => `<div class="task"><strong>${actionLabels[action.kind]}</strong>
        <p class="small muted">${esc(date(action.at))} · ${esc(action.note)}</p></div>`).join("")}</div></section>` : ""}
    <section class="dossier-section" aria-labelledby="task-heading">
      <h3 id="task-heading">Задачи и обещания <span class="small muted">${tasks.length}</span></h3>
      <div class="filters" aria-label="Какие задачи показать">
        <button type="button" data-scope="client" aria-pressed="${allCalls}">По всем сделкам клиента</button>
        <button type="button" data-scope="deal" aria-pressed="${!allCalls}">По выбранной сделке</button>
      </div>
      <div class="task-list">${tasks.map(task => `<div class="task">
        <strong>${esc(task.title)}</strong>
        ${allCalls && taskDeals.length > 1 ? `<p class="small muted">${esc(task.deal_title)}</p>` : ""}
        <p class="small"><span data-state="${task.status === "done" ? "completed" : ""}">${taskLabels[task.status]}</span>
        <span class="muted"> · ${actors[task.side]}${task.due ? " · до " + esc(date(task.due)) : ""}</span></p>
        ${task.result ? `<p class="small muted">${esc(task.result)}</p>` : ""}
        ${sourceButton(task.call_id, "Обещание в звонке", task.line_id)}</div>`).join("") ||
        '<p class="empty">Зафиксированных задач пока нет.</p>'}</div>
    </section>`;
}

function renderNext(item, deal) {
  const call = entity(data.calls, item.call_id);
  const labels = {...suggestionLabels, ...actionLabels, pending: "Ждём срока", resolved: "Шаг закрыт"};
  const facts = item.kind === "invite"
    ? item.state === "verify" ? "Срок отправки прошёл. Проверьте, было ли отправлено приглашение."
      : item.state === "action" ? "Срок отправки прошёл. В загруженной истории подтверждения нет."
      : item.state === "pending" ? "Срок отправки ещё не наступил." : ""
    : item.state === "action" ? "В разговоре остался вопрос, с которым можно вернуться к клиенту." : "";
  const quotes = call.lines.filter(line => item.source_ids.includes(line.id));
  const priority = item.state === "verify" ? "В очереди проверок" :
    item.fresh && item.due ? "Свежий звонок с просроченным обещанием" :
    item.fresh ? "Свежий разговор с поводом для контакта" : "Давний контакт с открытым вопросом";
  const allowed = preview
    ? item.call_id === "alpha-2" ? item.allowed.filter(kind => kind === previewPath[snapshotIndex]) : []
    : item.allowed;
  return `<section class="priority" data-state="${esc(item.state)}" aria-labelledby="next-heading">
    <h3 id="next-heading">${labels[item.state]}</h3><p><strong>${esc(item.angle)}</strong></p>
    ${facts ? `<p>${facts}</p>` : ""}
    ${item.due ? `<p class="small muted">Обещанный срок · ${esc(date(item.due))}</p>` : ""}
    ${["action", "verify"].includes(item.state) ? `<p class="small muted">${priority} · ${esc(finance(deal))}</p>` : ""}
    ${canEdit() && allowed.length ? renderRecord(item.call_id, allowed) : ""}
    <blockquote class="evidence">${renderLines(quotes)}</blockquote>
    ${sourceButton(call.id, "Открыть звонок и расшифровку")}
    ${item.state === "action" ? `<details class="draft"><summary>Черновик для контакта</summary>
      <p>${esc(item.kind === "invite"
        ? "Добрый день! Возвращаюсь к договорённости по проекту «" + deal.title +
          "». Предлагаю следующую повестку: " + item.angle + ". Когда вам удобно созвониться?"
        : "Добрый день! Возвращаюсь к обсуждению проекта «" + deal.title +
          "». Можно коротко созвониться, чтобы обсудить вопрос, который остался открытым?")}</p></details>` : ""}
    </section>`;
}

function renderRecord(callId, allowed) {
  if (preview) {
    const kind = allowed[0];
    const labels = {contacted: "Имитировать контакт", invited: "Имитировать отправку",
      meeting_held: "Имитировать встречу"};
    return `<div class="actions"><button type="button" class="primary" data-preview-step="${kind}"
      data-preview-call="${esc(callId)}">${labels[kind]}</button></div>`;
  }
  return `<details class="record-form"><summary>Зафиксировать результат</summary>
    <form class="editor" data-outcome="${esc(callId)}">
      <label>Результат<select name="kind">${allowed.map(kind => `<option value="${kind}">${actionLabels[kind]}</option>`).join("")}</select></label>
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
  return `<article class="call-card">
    <p><span class="call-result">${callResults[call.analysis?.result] || "Без разбора"}</span> · ${esc(date(call.at))}</p>
    <p class="small muted">${esc(deal?.title || "Звонок без привязки к сделке")}</p>
    ${call.analysis ? `<p class="call-summary">${esc(call.analysis.summary)}</p>` : ""}
    <details id="call-${esc(call.id)}">
      <summary class="small">${!preview && canEdit() && !call.analysis ? "Расшифровка и разбор" : "Расшифровка"}</summary>
      <blockquote class="evidence">${renderLines(call.lines)}</blockquote>
      ${!preview && canEdit() && !call.analysis ? renderAnalysisForm(call) : ""}
    </details></article>`;
}

function renderAnalysisForm(call) {
  const draft = suggestionDraft?.id === call.id ? suggestionDraft.analysis : undefined;
  const options = (values, selected) => values.map(([key, label]) =>
    `<option value="${esc(key)}"${selected === key ? " selected" : ""}>${esc(label)}</option>`).join("");
  const lines = side => [["", "Выберите реплику"], ...call.lines.filter(line => line.speaker === side)
    .map(line => [line.id, line.text])];
  const opportunity = draft?.opportunity;
  return `<form class="editor" data-analysis="${esc(call.id)}">
    ${data.ai_available ? '<div><button type="button" data-suggest>Предложить разбор с DeepSeek</button></div>' : ""}
    <label>Итог разговора<textarea name="summary" rows="2" maxlength="1000" required>${esc(draft?.summary)}</textarea></label>
    <label>Результат<select name="result">${options(Object.entries(callResults), draft?.result || "no_step")}</select></label>
    <label>Следующий шаг<select name="opportunity">${options([["", "Без предложения"], ["invite", "Отправить приглашение"],
      ["reopen", "Вернуться с предложением"]], opportunity?.kind)}</select></label>
    <div class="editor" data-opportunity ${opportunity ? "" : "hidden"}>
      <label>Предложение<input name="angle" maxlength="160" value="${esc(opportunity?.angle)}"></label>
      <label>Реплика клиента<select name="client_line">${options(lines("client"), opportunity?.client_line)}</select></label>
      <div class="editor" data-invite ${opportunity?.kind === "invite" ? "" : "hidden"}>
        <label>Реплика менеджера<select name="manager_line">${options(lines("manager"), opportunity?.manager_line)}</select></label>
        <label>Срок отправки по Минску<input name="due" type="datetime-local" value="${esc(minskInput(opportunity?.due))}"></label>
      </div>
    </div>
    <div><button type="submit">Сохранить разбор</button></div></form>`;
}

function minskInput(value) {
  if (!value) return "";
  const format = new Intl.DateTimeFormat("sv-SE", {year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", timeZone:"Europe/Minsk"});
  return format.format(new Date(value)).replace(" ", "T");
}

function renderResults() {
  const counts = [
    [data.deals.filter(deal => deal.result === "won").length, "Выиграно"],
    [data.deals.filter(deal => deal.actions.some(action => action.kind === "invited")).length, "Сделок с отправленным приглашением"],
    [data.deals.filter(deal => deal.actions.some(action => action.kind === "meeting_held")).length, "Сделок с отмеченной встречей"]
  ];
  $("results").innerHTML = `<div class="metrics">${counts.map(([count, label]) =>
    `<div class="metric"><strong>${count}</strong><span class="muted">${label}</span></div>`).join("")}</div>
    <h2>Исход и этап сделки</h2>
    ${data.deals.map(deal => `<div class="report-row">
      <div><button type="button" class="source-link" data-report-deal="${esc(deal.id)}">${esc(deal.title)}</button>
      <p class="small muted">${esc(entity(data.clients, deal.client_id).name)} · ${esc(stages[deal.stage])}</p></div>
      <div><strong>${dealResults[deal.result]}</strong>${deal.actions.length ?
        `<p class="small muted">${actionLabels[deal.actions.at(-1).kind]}</p>` : ""}</div>
      </div>`).join("") || '<p class="empty">Сделок пока нет.</p>'}`;
}

function openCall(id, lineId) {
  let call = $("call-" + id);
  if (!call) {
    allCalls = true;
    renderDossier();
    call = $("call-" + id);
  }
  if (call) {
    call.open = true;
    const quote = lineId && call.querySelector('[data-quote="' + CSS.escape(lineId) + '"]');
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
$("results").addEventListener("click", event => {
  const button = event.target.closest("[data-report-deal]");
  if (!button) return;
  const deal = entity(data.deals, button.dataset.reportDeal);
  view = "clients";
  select(deal.client_id, deal.id);
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
    renderDossier();
    $("detail").querySelector('.project[aria-pressed="true"]').focus();
  } else if (button.dataset.scope) {
    allCalls = button.dataset.scope === "client";
    const fromCalls = Boolean(button.closest("#call-heading + .filters"));
    renderDossier();
    const group = fromCalls ? "#call-heading" : "#task-heading";
    $("detail").querySelector(group + ' + .filters [aria-pressed="true"]').focus();
  } else if (button.dataset.source) {
    openCall(button.dataset.source, button.dataset.line);
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
      const analysis = await api(`/api/pipeline/calls/${id}/suggest?revision=${data.revision}`, {});
      if (!button.isConnected) return;
      suggestionDraft = {id, analysis};
      renderDossier();
      openCall(id);
      notify("Проверьте итог и цитаты перед сохранением.");
    });
  }
});

$("detail").addEventListener("change", event => {
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
    run(event.submitter, async () => {
      await api(`/api/pipeline/calls/${id}/outcome`, {revision: data.revision, kind, note: values.get("note")});
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
      opportunity.due = due ? due + ":00+03:00" : null;
    }
    run(event.submitter, async () => {
      await api(`/api/pipeline/calls/${id}/analysis`, {revision: data.revision,
        analysis: {summary: values.get("summary"), result: values.get("result"), opportunity}});
      suggestionDraft = undefined;
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
  setView("queue");
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
  data = snapshots[0];
  $("reset-preview").hidden = true;
  setView("queue");
  notify("Демо возвращено к началу.");
});

async function start() {
  if (preview) snapshots = await api("assets/demo-snapshots.json");
  await refresh();
}
start().catch(error => {
  if (!preview) showLogin();
  if (error.status !== 401) notify(error.message);
});
