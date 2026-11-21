"use strict";

const analyticsState = {scope: "all", person: "", days: 7, day: ""};
const analyticsDate = new Intl.DateTimeFormat("ru-RU", {dateStyle: "medium", timeZone: "Europe/Minsk"});
const analyticsDay = new Intl.DateTimeFormat("en-CA", {year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Minsk"});
const analyticsPercent = new Intl.NumberFormat("ru-RU", {style: "percent", maximumFractionDigits: 1});
const analyticsNumber = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 1});
const dayMs = 86_400_000;

const number = value => value == null ? "—" : analyticsNumber.format(value);
const proportion = (part, whole) => whole > 0 ? part / whole : null;
const percent = value => value == null ? "—" : analyticsPercent.format(value);
const minutes = value => value == null ? "—" : number(value) + " мин";
const tally = (rows, test) => rows.filter(test).length;
const auditFieldLabels = {
  summary: "Итог разговора", result: "Результат", opportunity: "Следующий шаг",
  "opportunity.kind": "Тип шага", "opportunity.angle": "Предложение",
  "opportunity.client_line": "Реплика клиента", "opportunity.manager_line": "Реплика менеджера",
  "opportunity.due": "Срок", quality: "Оценка разговора",
  "quality.need_line": "Доказательство потребности", "quality.deadline_line": "Доказательство срока"
};

function summarizeAnalytics(deals, calls, queue, now, activity) {
  const callIds = new Set(calls.map(call => call.id));
  const drafts = (activity.analysis_drafts || []).filter(draft => callIds.has(draft.id));
  const reviews = (activity.analysis_reviews || []).filter(review => callIds.has(review.id));
  const attempts = (activity.analysis_attempts || []).filter(attempt => callIds.has(attempt.call_id));
  const rejected = reviews.filter(review => review.decision === "rejected");
  const rejectedIds = new Set(rejected.map(review => review.id));
  const confirmed = reviews.filter(review => review.decision === "confirmed");
  const acceptedModel = confirmed.filter(review => review.from_model);
  const unchanged = tally(acceptedModel, review => !review.fields.length);
  const candidates = drafts.length + tally(reviews, review => review.from_model);
  const edits = new Map();
  for (const review of reviews) for (const field of review.fields) edits.set(field, (edits.get(field) || 0) + 1);
  const successful = attempts.filter(attempt => attempt.success);
  const processing = latency(successful.map(attempt => attempt.duration_ms));
  const recording = latency(successful.map(attempt => attempt.recording_ms).filter(value => value != null));
  const actions = deals.flatMap(deal => deal.actions);
  const tasks = deals.flatMap(deal => deal.tasks.map(task => ({...task, deal})));
  const promises = tasks.filter(task => task.call_id);
  const done = tasks.filter(task => task.status === "done");
  const open = tasks.filter(task => ["open", "in_progress"].includes(task.status));
  const overdue = open.filter(task => task.due && Date.parse(task.due) < now);
  const timed = done.filter(task => task.due && task.completed_at);
  const onTime = tally(timed, task => Date.parse(task.completed_at) <= Date.parse(task.due));
  const reviewedInvites = reviews.filter(review => review.opportunity_kind === "invite");
  const invites = reviewedInvites.length + tally(drafts, draft => draft.analysis.opportunity?.kind === "invite");
  const closedLoop = tally(reviewedInvites, review => {
    const opportunity = entity(calls, review.id)?.analysis?.opportunity;
    return review.decision === "confirmed" && opportunity?.kind === "invite" &&
      timed.some(task => task.call_id === review.id && task.line_id === opportunity.manager_line &&
        task.side === "manager" && Date.parse(task.completed_at) <= Date.parse(task.due));
  });
  const started = tasks.filter(task => task.assigned_at && task.started_at);
  const meanStart = started.length ? started.reduce((sum, task) =>
    sum + (Date.parse(task.started_at) - Date.parse(task.assigned_at)) / 60_000, 0) / started.length : null;
  const closed = deals.filter(deal => deal.result !== "open");
  const won = deals.filter(deal => deal.result === "won");
  const wonWithAmount = won.filter(deal => deal.amount != null);
  const analyzed = calls.filter(call => call.analysis);
  const quality = analyzed.filter(call => call.analysis.quality);
  const meetings = tally(calls, call => call.channel === "meeting");
  return {
    deals, calls, actions, tasks, promises, overdue, won, closed, meetings, analyzed, done, open,
    pendingReview: tally(calls, call => call.lines.length && !call.analysis && !rejectedIds.has(call.id)),
    review: {
      drafts, reviews, confirmed, rejected, acceptedModel, unchanged, candidates, edits,
      overdueDrafts: tally(drafts, draft => draft.analysis.opportunity?.due &&
        Date.parse(draft.analysis.opportunity.due) < now),
      invites, closedLoop, processing, recording, failed: attempts.length - successful.length,
      systemEvents: attempts.length
    },
    countCalls: tally(calls, call => (call.channel || "call") === "call"),
    inProgress: tally(tasks, task => task.status === "in_progress"),
    notStarted: tally(tasks, task => task.status === "open"),
    cancelled: tally(tasks, task => task.status === "cancelled"),
    withoutDeadline: tally(done, task => !task.due),
    withoutCompletionTime: tally(done, task => task.due && !task.completed_at),
    crm: tally(tasks, task => task.crm_task_id),
    crmDone: tally(done, task => task.crm_task_id),
    onTime, timed: timed.length, onTimeShare: proportion(onTime, timed.length),
    accepted: started.length, meanStart,
    conversion: proportion(won.length, closed.length),
    revenue: wonWithAmount.reduce((totals, deal) => {
      const code = deal.currency || "BYN";
      totals.set(code, (totals.get(code) || 0) + deal.amount);
      return totals;
    }, new Map()),
    wonWithAmount: wonWithAmount.length,
    invited: tally(deals, deal => deal.actions.some(action => action.kind === "invited")),
    held: tally(deals, deal => deal.actions.some(action => action.kind === "meeting_held")),
    signalCount: queue.length,
    nextStepShare: proportion(tally(analyzed, call => call.analysis.result === "agreed"), analyzed.length),
    qualityCount: quality.length,
    needShare: proportion(tally(quality, call => call.analysis.quality.need_line), quality.length),
    deadlineShare: proportion(tally(quality, call => call.analysis.quality.deadline_line), quality.length)
  };
}

function latency(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = !sorted.length ? null : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {count: sorted.length, median, max: sorted.at(-1)};
}

function duration(milliseconds) {
  if (milliseconds == null) return "—";
  if (milliseconds < 1000) return number(milliseconds) + " мс";
  return milliseconds < 60_000 ? number(milliseconds / 1000) + " с" : minutes(milliseconds / 60_000);
}

function latencyNote(sample, empty) {
  return sample.count ? `Замеров: ${sample.count} · максимум: ${duration(sample.max)}` : empty;
}

function activityDays(calls, actions, days, now) {
  const endingDay = Date.parse(analyticsDay.format(now) + "T00:00:00Z");
  const buckets = Array.from({length: days}, (_, index) => {
    const time = endingDay - (days - 1 - index) * dayMs;
    const iso = new Date(time).toISOString().slice(0, 10);
    return {iso, time, calls: 0, actions: 0};
  });
  const index = new Map(buckets.map(bucket => [bucket.iso, bucket]));
  for (const [group, events] of [["calls", calls], ["actions", actions]]) {
    for (const event of events) {
      const bucket = index.get(analyticsDay.format(new Date(event.at)));
      if (bucket) bucket[group]++;
    }
  }
  return buckets;
}

function analyticsButton(label, attribute, value, selected) {
  return `<button type="button" ${attribute}="${value}" aria-pressed="${selected}">${label}</button>`;
}

function card(title, body, className = "") {
  return `<section class="analytics-card ${className}"><h2>${title}</h2>${body}</section>`;
}

function keyMetric(label, value, note, tone, href = "") {
  const body = `<span>${label}</span><strong class="numeric" data-value>${value}</strong><small>${note}</small>`;
  return href
    ? `<a class="analytics-kpi" data-tone="${tone}" href="#${href}">${body}</a>`
    : `<div class="analytics-kpi" data-tone="${tone}">${body}</div>`;
}

function statusRows(m) {
  return [
    ["Не начаты", m.notStarted, "blue"], ["В работе", m.inProgress, "cyan"],
    ["Выполнены", m.done.length, "mint"], ["Отменены", m.cancelled, "muted"],
  ];
}

function barRows(rows, label) {
  const maximum = Math.max(0, ...rows.map(row => row[1] || 0));
  return `<ul class="analytics-bar-list" aria-label="${label}">${rows.map(([name, count, color], index) =>
    `<li class="analytics-bar-row" style="--sequence:${index}">
      <span>${esc(name)}</span><strong class="numeric">${number(count)}</strong>
      <span class="analytics-track" aria-hidden="true"><span class="chart-fill" data-color="${color}" style="--length:${maximum ? count / maximum * 100 : 0}%"></span></span>
    </li>`).join("")}</ul>`;
}

function chartDayLabel(bucket) {
  return analyticsDate.format(new Date(bucket.time + 12 * 3_600_000));
}

function dayLine(bucket) {
  return `${chartDayLabel(bucket)} · общение: ${number(bucket.calls)}, действия: ${number(bucket.actions)}`;
}

function activityChart(m, now) {
  const taskEvents = m.tasks.flatMap(task =>
    [task.assigned_at, task.started_at, task.completed_at].filter(Boolean).map(at => ({at})));
  const buckets = activityDays(m.calls, [...m.actions, ...taskEvents], analyticsState.days, now);
  const selected = buckets.find(bucket => bucket.iso === analyticsState.day) ||
    buckets.findLast(bucket => bucket.calls || bucket.actions) || buckets.at(-1);
  analyticsState.day = selected.iso;
  const peak = Math.max(1, ...buckets.map(bucket => Math.max(bucket.calls, bucket.actions)));
  const step = Math.ceil(peak / 3);
  const limit = step * 3;
  return `<section class="analytics-card analytics-activity" aria-labelledby="activity-title">
    <div class="analytics-card-head">
      <div><h2 id="activity-title">Динамика работы</h2><p class="small muted">По полученным событиям</p></div>
      <div class="analytics-segment" role="group" aria-label="Период графика">
        ${[7, 14].map(days => analyticsButton(days + " дней", "data-days", days, days === analyticsState.days)).join("")}
      </div>
    </div>
    <div class="activity-legend"><span data-color="blue">Общение</span><span data-color="mint">Действия</span></div>
    <figure class="daily-figure">
      <div class="daily-frame">
        <div class="axis-y numeric" aria-hidden="true">${[limit, step*2, step, 0].map(value => `<span>${number(value)}</span>`).join("")}</div>
        <div class="daily-chart" data-bucket-count="${buckets.length}" style="--days:${buckets.length}">
          ${buckets.map((bucket, index) => `<button type="button" class="daily-column" data-day="${bucket.iso}"
            aria-label="${esc(dayLine(bucket))}" aria-pressed="${bucket.iso === selected.iso}"
            style="--sequence:${index}">
            <span class="daily-bars" aria-hidden="true"><span class="daily-bar" data-color="blue" style="--length:${bucket.calls / limit * 100}%"></span>
            <span class="daily-bar" data-color="mint" style="--length:${bucket.actions / limit * 100}%"></span></span>
            <span class="daily-tick" aria-hidden="true">${Number(bucket.iso.slice(-2))}</span>
          </button>`).join("")}
        </div>
      </div>
      <figcaption id="activity-selection" class="small muted" aria-live="polite">${esc(dayLine(selected))}</figcaption>
    </figure>
  </section>`;
}

function taskChart(m) {
  const rows = statusRows(m);
  const total = m.tasks.length;
  let offset = 0;
  const stops = total ? rows.filter(([, count]) => count).map(([, count, tone]) => {
    const start = offset;
    offset += count / total * 100;
    return `var(--chart-${tone}) ${start}% ${offset}%`;
  }).join(",") : "var(--border) 0% 100%";
  return card("Состояния задач", `
    <div class="task-chart">
      <div class="analytics-ring" style="--ring:conic-gradient(${stops})" aria-hidden="true">
        <div><strong class="numeric">${number(total)}</strong><span>задач</span></div>
      </div>
      <ul class="chart-legend" aria-label="Задачи по статусам">${rows.map(([name, count, tone]) =>
        `<li data-color="${tone}"><span>${name}</span><strong class="numeric">${number(count)}</strong></li>`).join("")}</ul>
    </div>`, "analytics-task-chart");
}

function metricRows(rows) {
  return `<dl class="analytics-values">${rows.map(([label, value, hint]) => `<div>
    <dt>${label}${hint ? `<small>${hint}</small>` : ""}</dt><dd class="numeric" data-value>${value}</dd>
  </div>`).join("")}</dl>`;
}

function metricsCatalog(m) {
  const r = m.review;
  const editCount = [...r.edits.values()].reduce((sum, count) => sum + count, 0);
  return [
    ["Распознано обязательств", number(m.promises.length), "Задачи с цитатой"],
    ["Подтверждено человеком", number(r.confirmed.length), `Из черновиков модели: ${r.acceptedModel.length}`],
    ["Черновики ждут проверки", number(r.drafts.length)],
    ["Отклонено", number(r.rejected.length), "Решения менеджера по черновикам"],
    ["Сторона определена", number(m.promises.length), "Менеджер или клиент"],
    ["Создано задач", number(m.tasks.length)],
    ["Задачи не начаты", number(m.notStarted)],
    ["Задачи в работе", number(m.inProgress)],
    ["Задачи отменены", number(m.cancelled)],
    ["События с текстом без разбора", number(m.pendingReview)],
    ["Задачи с ID в CRM", number(m.crm)],
    ["Выполнено в CRM", number(m.crmDone), "Статус задач с ID в CRM"],
    ["Закрыто", number(m.done.length)],
    ["Закрыто в срок", number(m.timed ? m.onTime : null)],
    ["Закрыто без срока", number(m.withoutDeadline)],
    ["Выполнено без времени закрытия", number(m.withoutCompletionTime)],
    ["Доля закрытых в срок", percent(m.onTimeShare), `Замеров: ${number(m.timed)}`],
    ["Обязательства с истёкшим сроком", number(m.overdue.length)],
    ["Черновики с истёкшим сроком", number(r.overdueDrafts)],
    ["Доля подтверждённых", percent(proportion(r.acceptedModel.length, r.candidates)), `Черновиков модели: ${r.candidates}`],
    ["Доля отклонённых", percent(proportion(r.rejected.length, r.candidates)), `Черновиков модели: ${r.candidates}`],
    ["Доля замкнутого контура", percent(proportion(r.closedLoop, r.invites)), `${r.closedLoop} подтверждено и выполнено вовремя из ${r.invites} приглашений в журнале`],
    ["Подтверждено без правок", percent(proportion(r.unchanged, r.acceptedModel.length)), `Из ${r.acceptedModel.length} подтверждённых черновиков модели`],
    ["Разборы в один клик", percent(proportion(r.unchanged, r.candidates)), "Из всех черновиков модели"],
    ["Ручные правки по полям", number(editCount)],
    ...[...r.edits].map(([field, count]) => [auditFieldLabels[field] || "Другое поле", number(count)]),
    ["Текст → карточка", duration(r.processing.median), latencyNote(r.processing, "Нет успешных запусков модели")],
    ["Запись → карточка", duration(r.recording.median), latencyNote(r.recording, "Источник ещё не передал время приёма записи")],
    ["Ошибки обработки", number(r.failed)],
    ["События с автором", number(r.reviews.length), "Подтверждения и отклонения"],
    ["События системы", number(r.systemEvents), "Запуски модели"]
  ];
}

function salesMetrics(m) {
  return [
    ["Звонки", number(m.countCalls)], ["Встречи из источников", number(m.meetings)],
    ["Выиграно", number(m.won.length)], ["Закрыто сделок", number(m.closed.length)],
    ["Конверсия в победу", percent(m.conversion), `${m.won.length} выиграно из ${m.closed.length} закрытых`],
    ["Сумма выигранных сделок", [...m.revenue].map(([code, value]) => money(value, code)).join(" · ") || "—",
      `Сумма известна для ${m.wonWithAmount} из ${m.won.length}`],
    ["Начало работы над задачей", minutes(m.meanStart), `Среднее от назначения до старта · замеров: ${m.accepted}`],
    ["Отправили приглашение", number(m.invited)], ["Провели встречу по сигналу", number(m.held)],
    ["Согласован следующий шаг", percent(m.nextStepShare), `Разобрано событий: ${m.analyzed.length}`],
    ["Уточнена потребность клиента", percent(m.needShare), `Оценено разговоров: ${m.qualityCount}`],
    ["Проговорён срок", percent(m.deadlineShare), `Оценено разговоров: ${m.qualityCount}`],
  ];
}

function detailsBlock(title, body, id = "") {
  return `<details class="analytics-card analytics-detail"${id ? ` id="${id}"` : ""}>
    <summary>${title}</summary><div>${body}</div></details>`;
}

function sourceRows(calls) {
  const sourceChannels = {call: "blue", meeting: "purple", message: "mint", email: "cyan"};
  return Object.entries(channels).map(([id, label]) => [
    label, tally(calls, call => (call.channel || "call") === id), sourceChannels[id]
  ]);
}

function sourceDetails(calls) {
  const counts = new Map();
  for (const call of calls) {
    const name = entity(data.sources || [], call.source_id)?.name || "Импорт JSON";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return metricRows([...counts].map(([name, count]) => [esc(name), number(count)]));
}

function workloadRows(people, snapshot, now) {
  return `<div class="team-list">${people.map(name => {
    const owned = snapshot.deals.filter(deal => deal.manager === name);
    const tasks = owned.flatMap(deal => deal.tasks).filter(task => task.side === "manager");
    const active = tasks.filter(task => ["open", "in_progress"].includes(task.status));
    const late = tally(active, task => task.due && Date.parse(task.due) < now);
    return `<div class="team-row">
      <button class="source-link" type="button" data-employee="${esc(name)}">${esc(name)}</button>
      <span><strong class="numeric">${number(active.length)}</strong> открыто</span>
      <span><strong class="numeric">${number(late)}</strong> просрочено</span>
      <span><strong class="numeric">${number(tally(tasks, task => task.status === "done"))}</strong> выполнено</span>
    </div>`;
  }).join("") || '<p class="empty">Сотрудники появятся после импорта сделок.</p>'}</div>`;
}

function drillRows(deals, tasks = []) {
  const taskList = tasks.length ? `<div class="analytics-drill">${tasks.map(task =>
    `<div class="report-row"><button type="button" class="source-link" data-report-deal="${esc(task.deal.id)}"
      data-report-call="${esc(task.call_id || "")}">${esc(task.title)}</button>
      <span class="small muted">${taskLabels[task.status]}</span></div>`).join("")}</div>` : "";
  return taskList + `<div class="analytics-drill">${deals.map(deal => `<div class="report-row">
    <div><button type="button" class="source-link" data-report-deal="${esc(deal.id)}">${esc(deal.title)}</button>
      <p class="small muted">${esc(entity(data.clients, deal.client_id)?.name)} · ${esc(dealStage(deal))}</p></div>
    <span class="tag status-chip" data-tone="${deal.result === "won" ? "success" : "neutral"}">${dealResults[deal.result]}</span>
  </div>`).join("") || '<p class="empty">Сделок пока нет.</p>'}</div>`;
}

function analyticsScope() {
  const people = [...new Set(data.deals.map(deal => deal.manager))].sort((a, b) => a.localeCompare(b, "ru"));
  if (!people.includes(analyticsState.person)) analyticsState.person = people[0] || "";
  if (!people.length) analyticsState.scope = "all";
  const person = analyticsState.scope === "person" ? analyticsState.person : "";
  const deals = person ? data.deals.filter(deal => deal.manager === person) : data.deals;
  const dealIds = new Set(deals.map(deal => deal.id));
  const calls = person ? data.calls.filter(call => dealIds.has(call.deal_id)) : data.calls;
  const queue = data.queue.filter(item => dealIds.has(item.deal_id));
  const now = new Date(data.generated_at || Date.now());
  return {people, person, now, m: summarizeAnalytics(deals, calls, queue, now, data)};
}

function renderResults() {
  const {people, person, now, m} = analyticsScope();
  const hasData = m.deals.length || m.calls.length;
  const overdue = m.overdue.length;
  const delayed = m.overdue.filter(task => task.delay_reason);
  const reasons = new Map();
  for (const task of delayed) reasons.set(task.delay_reason, (reasons.get(task.delay_reason) || 0) + 1);
  const stagesRows = Object.entries(stages).map(([stage, title]) => [title, tally(m.deals, deal => deal.stage === stage), "blue"]);
  const promiseRows = [
    ["Найдено по репликам", m.promises.length, "blue"], ["Связано с CRM", m.crm, "cyan"],
    ["Выполнено", m.done.length, "mint"]
  ];
  $("results").innerHTML = `<div class="analytics-toolbar">
    <div class="analytics-toolbar-left">
      <div class="analytics-segment" role="group" aria-label="Разрез аналитики">
        ${analyticsButton("Общая", "data-analytics-scope", "all", analyticsState.scope === "all")}
        ${people.length ? analyticsButton("По сотрудникам", "data-analytics-scope", "person", Boolean(person)) : ""}
      </div>
      ${person ? `<label class="analytics-person" for="analytics-person">Ответственный
        <select id="analytics-person" name="employee">${people.map(name =>
          `<option${name === person ? " selected" : ""}>${esc(name)}</option>`).join("")}</select></label>` : ""}
    </div>
    <div class="analytics-toolbar-right">
      <span class="small muted">Срез ${esc(date(now))}</span>
      ${!preview ? '<button type="button" data-analytics-refresh>Обновить</button>' : ""}
      ${hasData ? '<button type="button" data-analytics-download>Скачать CSV</button>' : ""}
    </div>
  </div>
  ${!hasData ? '<p class="analytics-card empty">Пока нет данных. Загрузите сделки или историю общения.</p>' : `
    <section class="analytics-section analytics-entry" aria-labelledby="overview-metrics">
      <h2 id="overview-metrics">Обещания и сроки</h2>
      <div class="analytics-kpis">
        ${keyMetric("Просрочено", number(overdue), "Открытые задачи", "attention", "analytics-attention")}
        ${keyMetric("Ждут проверки", number(m.review.drafts.length), `Без черновика: ${m.pendingReview - m.review.drafts.length}`, "info")}
        ${keyMetric("В работе", number(m.inProgress), `Не начаты: ${number(m.notStarted)}`, "neutral")}
        ${keyMetric("Выполнено", number(m.done.length), `В CRM: ${number(m.crmDone)}`, "success")}
        ${keyMetric("Выполнено в срок", percent(m.onTimeShare), m.timed ? `${m.onTime} из ${m.timed} с замером` : "Нет замеров", "success")}
      </div>
    </section>
    <div class="analytics-graph-grid analytics-entry">
      ${activityChart(m, now)}
      ${taskChart(m)}
    </div>
    <div class="analytics-equal-grid analytics-entry">
      ${card("Продажи и качество", metricRows(salesMetrics(m).slice(0, 8)) +
        '<details class="analytics-fold"><summary class="small">Качество общения и встречи</summary>' + metricRows(salesMetrics(m).slice(8)) + '</details>')}
      ${card("Сделки по этапам", barRows(stagesRows, "Текущие этапы сделок") +
        '<details class="analytics-fold"><summary class="small">Как продвигаются задачи</summary>' + barRows(promiseRows, "Текущие показатели задач") + '</details>')}
    </div>
    <div class="analytics-equal-grid analytics-entry">
      ${card("Нагрузка по сотрудникам", workloadRows(person ? [person] : people, data, now))}
      ${card("Источники общения", barRows(sourceRows(m.calls), "Полученные события по каналам") +
        (m.calls.length ? '<details class="analytics-fold"><summary class="small">По подключённым источникам</summary>' + sourceDetails(m.calls) + '</details>' : ""))}
    </div>
    <div class="analytics-equal-grid analytics-entry">
      ${card("Проверка разборов", metricRows([
        ["Подтверждено", number(m.review.confirmed.length)], ["Отклонено", number(m.review.rejected.length)],
        ["Подтверждено без правок", percent(proportion(m.review.unchanged, m.review.acceptedModel.length))],
      ]) + (m.review.edits.size ? '<details class="analytics-fold"><summary>Что исправляли</summary>' +
        barRows([...m.review.edits].map(([field, count]) => [auditFieldLabels[field] || "Другое поле", count, "purple"]), "Изменённые поля") + '</details>' : ""))}
      ${card("Скорость обработки", metricRows([
        ["Текст → карточка", duration(m.review.processing.median), latencyNote(m.review.processing, "Нет успешных запусков модели")],
        ["Запись → карточка", duration(m.review.recording.median), latencyNote(m.review.recording, "Нет времени приёма записи от источника")],
        ["Ошибки", number(m.review.failed)]
      ]))}
    </div>
    <section class="analytics-card analytics-entry" id="analytics-attention" aria-labelledby="attention-title">
      <div class="analytics-card-head"><h2 id="attention-title">Требуют внимания</h2>
        <span class="tag status-chip" data-tone="attention">${number(m.signalCount)} сделок с сигналом</span></div>
      ${overdue ? `<div class="analytics-drill">${m.overdue.map(task => `<div class="report-row">
        <button type="button" class="source-link" data-report-deal="${esc(task.deal.id)}" data-report-call="${esc(task.call_id || "")}">${esc(task.title)}</button>
        <span class="small muted">До ${esc(date(task.due))}</span>
      </div>`).join("")}</div>` : '<p class="empty">Просроченных задач нет.</p>'}
      <details class="analytics-fold"><summary>Причины задержек</summary>
        ${reasons.size ? metricRows([...reasons].map(([label, count]) => [esc(label), number(count)])) : '<p class="small muted">Причины ещё не указаны.</p>'}
        ${overdue > delayed.length ? `<p class="small muted">Без причины: ${number(overdue - delayed.length)}</p>` : ""}
      </details>
    </section>
    ${detailsBlock("Договорённости и сделки", drillRows(m.deals, m.promises))}
    ${detailsBlock("Все показатели и методика", '<p class="small muted">Срез по загруженным данным. Разрез по сотруднику учитывает сделки, за которые он сейчас отвечает. Период меняет только график. Действия на графике включают отметки по сделкам и датированные события задач.</p>' + metricRows(metricsCatalog(m)))}
  `}`;
}

function exportAnalytics() {
  const {m, person, now} = analyticsScope();
  const rows = [
    ["Источник", preview ? "Синтетические данные" : "Загруженные данные"],
    ["Срез", now.toISOString()], ["Ответственный", person || "Вся команда"],
    ["Показатель", "Значение", "Уточнение"], ...salesMetrics(m), ...metricsCatalog(m)
  ];
  const cell = value => {
    const text = String(value ?? "");
    const safe = /^\s*[=+@-]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv = "\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
  link.download = "pacto-analytics.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$("results").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.days) {
    analyticsState.days = Number(button.dataset.days);
    analyticsState.day = "";
    renderResults();
    $("results").querySelector("[data-days][aria-pressed=true]").focus();
  } else if (button.dataset.day) {
    analyticsState.day = button.dataset.day;
    $("results").querySelector(".daily-column[aria-pressed=true]").setAttribute("aria-pressed", "false");
    button.setAttribute("aria-pressed", "true");
    $("activity-selection").textContent = button.getAttribute("aria-label");
  } else if (button.dataset.analyticsScope) {
    analyticsState.scope = button.dataset.analyticsScope;
    analyticsState.day = "";
    renderResults();
    $("results").querySelector("[data-analytics-scope][aria-pressed=true]").focus();
  } else if (button.dataset.employee) {
    analyticsState.person = button.dataset.employee;
    analyticsState.scope = "person";
    renderResults();
    $("analytics-person")?.focus();
  } else if (button.hasAttribute("data-analytics-refresh")) {
    run(button, async () => {
      await refresh();
      $("results").querySelector("[data-analytics-refresh]")?.focus();
    });
  } else if (button.hasAttribute("data-analytics-download")) {
    exportAnalytics();
  }
});
$("results").addEventListener("change", event => {
  if (event.target.id !== "analytics-person") return;
  analyticsState.person = event.target.value;
  renderResults();
  $("analytics-person").focus();
});
