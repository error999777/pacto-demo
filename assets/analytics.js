"use strict";

const analyticsSections = [["overview", "Обзор"], ["sales", "Продажи"], ["workload", "Команда и каналы"],
  ["skills", "Навыки менеджера"], ["reviews", "Разборы"], ["metrics", "Все метрики"]];
const analyticsState = {scope: "all", person: "", days: 7, category: "all", query: "",
  section: analyticsSections.find(([key]) => location.hash === "#analytics-" + key)?.[0] || "overview"};
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
    ["Не начаты", m.notStarted, "blue"], ["В работе", m.inProgress, "amber"],
    ["Выполнены", m.done.length, "mint"], ["Отменены", m.cancelled, "rose"],
  ];
}

// IDs only connect controls to hints within the current report.
let chartPointId = 0;

function chartPoint(label, value, dateLabel, tone, content, className, id = "chart-point-" + ++chartPointId) {
  const hint = id + "-hint";
  return `<button type="button" class="chart-point ${className}" id="${id}" data-color="${tone}"
    interestfor="${hint}" popovertarget="${hint}" popovertargetaction="show" aria-expanded="false"
    aria-label="${esc(label + ', ' + value + ', ' + dateLabel)}">${content}</button>
    <span class="chart-hint" data-color="${tone}" id="${hint}" role="tooltip" popover="hint">
      <small>${esc(dateLabel)}</small><strong>${esc(label)} <b>${esc(value)}</b></strong>
    </span>`;
}

function positionChartHint(hint) {
  const trigger = $(hint.id.slice(0, -5));
  if (!trigger) return;
  const anchorElement = trigger.querySelector(".daily-bar") || trigger;
  const anchor = anchorElement.getBoundingClientRect();
  const width = hint.offsetWidth;
  const height = hint.offsetHeight;
  const left = Math.max(6, Math.min(innerWidth - width - 6, anchor.left + (anchor.width - width) / 2));
  hint.style.left = left + "px";
  const top = anchor.top >= height + 6 ? anchor.top - height : anchor.bottom;
  hint.style.top = Math.max(6, Math.min(innerHeight - height - 6, top)) + "px";
}

const nativeChartInterest = "interestForElement" in HTMLButtonElement.prototype;

function showChartHint(button) {
  const hint = $(button.getAttribute("interestfor"));
  if (hint.showPopover) hint.showPopover();
  else {
    closeFallbackHints();
    hint.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
  }
  positionChartHint(hint);
}

function closeFallbackHints() {
  for (const hint of $("results").querySelectorAll(".chart-hint.is-open")) {
    hint.classList.remove("is-open");
    $(hint.id.slice(0, -5))?.setAttribute("aria-expanded", "false");
  }
}

$("results").addEventListener("toggle", event => {
  const hint = event.target;
  if (!hint.matches(".chart-hint")) return;
  const open = event.newState === "open";
  $(hint.id.slice(0, -5))?.setAttribute("aria-expanded", String(open));
  if (open) positionChartHint(hint);
}, true);

function chartTrigger(target) {
  const arc = target.closest("[data-legend]");
  return arc ? $(arc.dataset.legend) : target.closest(".chart-point");
}

for (const type of ["pointerover", "focusin", "click"]) {
  $("results").addEventListener(type, event => {
    const trigger = chartTrigger(event.target);
    if (!trigger) return;
    const nativeTrigger = type === "click" ? trigger.popoverTargetElement : nativeChartInterest;
    if (!nativeTrigger || event.target.closest("[data-legend]")) showChartHint(trigger);
  });
}

for (const type of ["pointerout", "focusout"]) {
  $("results").addEventListener(type, event => {
    const trigger = chartTrigger(event.target);
    const hint = trigger ? $(trigger.getAttribute("interestfor")) : event.target.closest(".chart-hint");
    if (!hint || nativeChartInterest && !event.target.closest("[data-legend]")) return;
    const next = event.relatedTarget;
    if (next instanceof Element && (hint.contains(next) || chartTrigger(next) === $(hint.id.slice(0, -5)))) return;
    hint.hidePopover?.();
    closeFallbackHints();
  });
}

document.addEventListener("pointerdown", event => {
  if (!event.target.closest(".chart-point, .chart-hint, [data-legend]")) closeFallbackHints();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeFallbackHints();
});

function repositionChartHints() {
  for (const trigger of $("results").querySelectorAll('.chart-point[aria-expanded="true"]')) {
    positionChartHint($(trigger.getAttribute("interestfor")));
  }
}
window.addEventListener("resize", repositionChartHints);
document.addEventListener("scroll", repositionChartHints, true);

function snapshotDate() {
  return "На " + analyticsDate.format(new Date(data.generated_at || Date.now()));
}

function barRows(rows, label) {
  const maximum = Math.max(0, ...rows.map(row => row[1] || 0));
  return `<ul class="analytics-bar-list" aria-label="${label}">${rows.map(([name, count, color], index) =>
    `<li style="--sequence:${index}">${chartPoint(name, number(count), snapshotDate(), color,
      `<span>${esc(name)}</span><strong class="numeric">${number(count)}</strong>
      <span class="analytics-track" aria-hidden="true"><span class="chart-fill" style="--length:${maximum ? count / maximum * 100 : 0}%"></span></span>`,
      "analytics-bar-row")}</li>`).join("")}</ul>`;
}

function activityChart(m, now) {
  const taskEvents = m.tasks.flatMap(task =>
    [task.assigned_at, task.started_at, task.completed_at].filter(Boolean).map(at => ({at})));
  const buckets = activityDays(m.calls, [...m.actions, ...taskEvents], analyticsState.days, now);
  const peak = Math.max(1, ...buckets.map(bucket => Math.max(bucket.calls, bucket.actions)));
  const step = Math.ceil(peak / 3);
  const limit = step * 3;
  return `<section class="analytics-card analytics-activity" aria-labelledby="activity-title">
    <div class="analytics-card-head">
      <h2 id="activity-title">Активность по дням</h2>
      <div class="analytics-segment" role="group" aria-label="Период графика">
        ${[7, 14].map(days => analyticsButton(days + " дней", "data-days", days, days === analyticsState.days)).join("")}
      </div>
    </div>
    <div class="activity-legend"><span data-color="blue">Общение</span><span data-color="amber">Действия</span></div>
    <figure class="daily-figure">
      <div class="daily-frame">
        <div class="axis-y numeric" aria-hidden="true">${[limit, step*2, step, 0].map(value => `<span>${number(value)}</span>`).join("")}</div>
        <div class="daily-chart" data-bucket-count="${buckets.length}" style="--days:${buckets.length}">
          ${buckets.map((bucket, index) => {
            const dateLabel = analyticsDate.format(new Date(bucket.time + 12 * 3_600_000));
            return `<div class="daily-column" style="--sequence:${index}">
              ${[["Общение", bucket.calls, "blue"], ["Действия", bucket.actions, "amber"]].map(([label, count, tone]) =>
                chartPoint(label, number(count), dateLabel, tone,
                  `<span class="daily-bar" style="--length:${count / limit * 100}%"></span>`, "daily-point")).join("")}
              <span class="daily-tick" aria-hidden="true">${Number(bucket.iso.slice(-2))}</span>
            </div>`;
          }).join("")}
        </div>
      </div>
    </figure>
  </section>`;
}

function taskChart(m) {
  const rows = statusRows(m);
  const total = m.tasks.length;
  let offset = -Math.PI / 2;
  const point = (angle, radius = 49) => [60 + radius * Math.cos(angle), 60 + radius * Math.sin(angle)].join(" ");
  const arcs = rows.map(([, count, tone], index) => {
    if (!count) return "";
    const start = offset;
    offset += count / total * 2 * Math.PI;
    // Two half-arcs also describe a full circle when only one status is present.
    return `<path data-color="${tone}" data-legend="task-status-${index}"
      d="M ${point(start)} A 49 49 0 0 1 ${point((start + offset) / 2)} A 49 49 0 0 1 ${point(offset)}"/>`;
  }).join("");
  let boundary = -Math.PI / 2;
  const separators = rows.filter(([, count]) => count > 0 && count < total).map(([, count]) => {
    const line = `<path class="ring-divider" d="M ${point(boundary, 39)} L ${point(boundary, 59)}"/>`;
    boundary += count / total * 2 * Math.PI;
    return line;
  }).join("");
  return card("Задачи по статусам", `
    <div class="task-chart">
      <div class="analytics-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="49"/>${arcs}${separators}</svg>
        <div><strong class="numeric">${number(total)}</strong><span>${countWithNoun(total, "задача", "задачи", "задач").split(" ").at(-1)}</span></div>
      </div>
      <ul class="chart-legend" aria-label="Задачи по статусам">${rows.map(([name, count, tone], index) =>
        `<li>${chartPoint(name, number(count), snapshotDate(), tone,
          `<span>${name}</span><strong class="numeric">${number(count)}</strong>`, "legend-point", "task-status-" + index)}</li>`).join("")}</ul>
    </div>`, "analytics-task-chart");
}

function metricRows(rows) {
  return `<dl class="analytics-values">${rows.map(([label, value, hint]) => `<div>
    <dt>${label}${hint ? `<small>${hint}</small>` : ""}</dt><dd class="numeric" data-value>${value}</dd>
  </div>`).join("")}</dl>`;
}

function metricGroups(m) {
  const r = m.review;
  const editCount = [...r.edits.values()].reduce((sum, count) => sum + count, 0);
  return [
    {id: "sales", title: "Продажи", rows: [
      ["Выигранные сделки", number(m.won.length)],
      ["Закрытые сделки", number(m.closed.length)],
      ["Доля выигранных", percent(m.conversion), `${m.won.length} из ${m.closed.length} закрытых`],
      ["Сумма выигранных сделок", [...m.revenue].map(([code, value]) => money(value, code)).join(" · ") || "—", `Сумма известна для ${m.wonWithAmount} из ${m.won.length}`],
    ]},
    {id: "communication", title: "Общение", rows: [
      ["Звонки", number(m.countCalls)],
      ["Встречи из источников", number(m.meetings)],
      ["Отправили приглашение", number(m.invited)],
      ["Провели встречу по сигналу", number(m.held)],
      ["Согласован следующий шаг", percent(m.nextStepShare), `Разобрано событий: ${m.analyzed.length}`],
      ["Уточнена потребность клиента", percent(m.needShare), `Оценено разговоров: ${m.qualityCount}`],
      ["Проговорён срок", percent(m.deadlineShare), `Оценено разговоров: ${m.qualityCount}`],
      ["Приглашения подтверждены и отправлены в срок", percent(proportion(r.closedLoop, r.invites)), `${r.closedLoop} из ${r.invites} приглашений в журнале`],
    ]},
    {id: "tasks", title: "Задачи и сроки", rows: [
      ["Просроченные задачи", number(m.overdue.length), "Открытые задачи с истёкшим сроком"],
      ["Всего задач", number(m.tasks.length)],
      ["Задачи не начаты", number(m.notStarted)],
      ["Задачи в работе", number(m.inProgress)],
      ["Задачи отменены", number(m.cancelled)],
      ["Задачи в CRM", number(m.crm)],
      ["Выполнено в CRM", number(m.crmDone), "Статус задач с ID в CRM"],
      ["Выполнено задач", number(m.done.length)],
      ["Выполнено в срок", number(m.timed ? m.onTime : null)],
      ["Выполнено без срока", number(m.withoutDeadline)],
      ["Выполнено без времени закрытия", number(m.withoutCompletionTime)],
      ["Доля закрытых в срок", percent(m.onTimeShare), `Замеров: ${number(m.timed)}`],
      ["От назначения задачи до старта", minutes(m.meanStart), `Среднее по замерам: ${m.accepted}`],
      ["Договорённости с цитатой", number(m.promises.length)],
      ["Известен ответственный", number(m.promises.length), "Менеджер или клиент"],
    ]},
    {id: "quality", title: "Качество разбора", rows: [
      ["Подтвердил менеджер", number(r.confirmed.length), `Из черновиков модели: ${r.acceptedModel.length}`],
      ["Черновики ждут проверки", number(r.drafts.length)],
      ["Отклонено", number(r.rejected.length), "Решения менеджера по черновикам"],
      ["Черновики с истёкшим сроком", number(r.overdueDrafts)],
      ["Доля подтверждённых", percent(proportion(r.acceptedModel.length, r.candidates)), `Черновиков модели: ${r.candidates}`],
      ["Доля отклонённых", percent(proportion(r.rejected.length, r.candidates)), `Черновиков модели: ${r.candidates}`],
      ["Подтверждено без правок", percent(proportion(r.unchanged, r.acceptedModel.length)), `Из ${r.acceptedModel.length} подтверждённых черновиков модели`],
      ["Принято без правок из всех черновиков", percent(proportion(r.unchanged, r.candidates))],
      ["Всего правок", number(editCount)],
      ...[...r.edits].map(([field, count]) => ["Правки · " + (auditFieldLabels[field] || "Другое поле"), number(count)]),
      ["События с автором", number(r.reviews.length), "Подтверждения и отклонения"],
    ]},
    {id: "processing", title: "Обработка записей", rows: [
      ["Записи с текстом без разбора", number(m.pendingReview)],
      ["От текста до черновика", duration(r.processing.median), latencyNote(r.processing, "Нет успешных запусков модели")],
      ["От приёма записи до черновика", duration(r.recording.median), latencyNote(r.recording, "Источник ещё не передал время приёма записи")],
      ["Ошибки обработки", number(r.failed)],
      ["События системы", number(r.systemEvents), "Запуски модели"],
    ]},
  ];
}

const metricAliases = {
  "Просроченные задачи": "просрочка просрочено задержки обязательства",
  "Черновики с истёкшим сроком": "просрочка черновиков",
  "Доля выигранных": "конверсия win rate",
  "Сумма выигранных сделок": "выручка оборот",
  "Договорённости с цитатой": "обещания",
  "Всего правок": "редактирование исправления",
  "От текста до черновика": "скорость время обработки звонка анализ",
  "От приёма записи до черновика": "скорость время обработки звонка записи",
};

function searchText(value) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
}

function metricsDirectory(groups) {
  return `<section class="analytics-card metric-directory" aria-labelledby="directory-title">
    <div class="analytics-card-head"><h2 id="directory-title">Каталог метрик</h2><span class="small muted">По загруженным данным</span></div>
    <div class="metric-controls">
      <label>Поиск по метрикам<input type="search" id="metric-search" placeholder="Например, просрочка" value="${esc(analyticsState.query)}"></label>
      <label>Категория<select id="metric-category"><option value="all">Все категории</option>${groups.map(group =>
        `<option value="${group.id}"${analyticsState.category === group.id ? " selected" : ""}>${group.title}</option>`).join("")}</select></label>
    </div>
    <p class="small muted" id="metric-count" role="status"></p>
    <div class="metric-groups">${groups.map(group => `<section data-metric-group="${group.id}">
      <h3>${group.title}</h3>${metricRows(group.rows)}</section>`).join("")}</div>
    <button type="button" data-reset-metrics hidden>Сбросить фильтры</button>
  </section>`;
}

function filterMetrics() {
  const directory = $("results").querySelector(".metric-directory");
  if (!directory) return;
  const words = searchText(analyticsState.query).split(/\s+/).filter(Boolean);
  let count = 0;
  for (const group of directory.querySelectorAll("[data-metric-group]")) {
    const title = group.querySelector("h3").textContent;
    const included = analyticsState.category === "all" || analyticsState.category === group.dataset.metricGroup;
    let matches = 0;
    for (const row of group.querySelectorAll(".analytics-values > div")) {
      const term = row.querySelector("dt");
      const alias = metricAliases[term.firstChild.textContent] || "";
      const text = searchText([title, term.firstChild.textContent, term.querySelector("small")?.textContent || "", alias].join(" "));
      row.hidden = !(included && words.every(word => text.includes(word)));
      if (!row.hidden) matches++;
    }
    group.hidden = matches === 0;
    count += matches;
  }
  $("metric-count").textContent = count ? countWithNoun(count, "показатель", "показателя", "показателей") : "По вашему запросу ничего не найдено.";
  directory.querySelector("[data-reset-metrics]").hidden = count > 0;
}

function detailsBlock(title, body, id = "") {
  return `<details class="analytics-card analytics-detail"${id ? ` id="${id}"` : ""}>
    <summary>${title}</summary><div>${body}</div></details>`;
}

function sourceRows(calls) {
  const sourceChannels = {call: "blue", meeting: "rose", message: "mint", email: "amber"};
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
  const stageCounts = new Map();
  for (const deal of m.deals) {
    const label = dealStage(deal);
    stageCounts.set(label, (stageCounts.get(label) || 0) + 1);
  }
  const stagesRows = [...stageCounts].map(([label, count]) => [label, count, "blue"]);
  const promiseRows = [
    ["Найдено по репликам", m.promises.length, "blue"], ["Связано с CRM", m.crm, "amber"],
    ["Выполнено", m.done.length, "mint"]
  ];
  const groups = metricGroups(m);
  const rows = Object.fromEntries(groups.map(group => [group.id, group.rows]));
  const coaching = analyticsState.section === "skills";
  $("results").innerHTML = `<div class="analytics-toolbar work-panel"${coaching ? " hidden" : ""}>
    <div class="analytics-toolbar-left">
      <div class="analytics-segment" role="group" aria-label="Разрез аналитики">
        ${analyticsButton("Вся команда", "data-analytics-scope", "all", analyticsState.scope === "all")}
        ${people.length ? analyticsButton("По сотруднику", "data-analytics-scope", "person", Boolean(person)) : ""}
      </div>
      ${person ? `<label class="analytics-person" for="analytics-person">Ответственный
        <select id="analytics-person" name="employee">${people.map(name =>
          `<option${name === person ? " selected" : ""}>${esc(name)}</option>`).join("")}</select></label>` : ""}
    </div>
    <div class="analytics-toolbar-right">
      <span class="small muted">Данные на ${esc(date(now))}</span>
      ${!preview ? '<button type="button" data-analytics-refresh>Обновить</button>' : ""}
      ${hasData ? '<button type="button" data-analytics-download>Скачать CSV</button>' : ""}
    </div>
  </div>
    <div class="analytics-tabs work-filters" role="group" aria-label="Отчёты">
      ${analyticsSections.map(([key, label]) => analyticsButton(label, "data-analytics-section", key, key === analyticsState.section)).join("")}
    </div>
    ${coaching ? renderCoaching() : !hasData ? '<p class="analytics-card empty">Загрузите сделки или историю общения, чтобы увидеть отчёты.</p>' : `
    ${analyticsState.section === "overview" ? `
    <section class="analytics-section analytics-entry" aria-labelledby="overview-metrics">
      <h2 id="overview-metrics">Задачи и сроки</h2>
      <div class="analytics-kpis">
        ${keyMetric("Просрочено", number(overdue), "Открытые задачи", "attention", "analytics-attention")}
        ${keyMetric("Черновики на проверке", number(m.review.drafts.length), `Записей без черновика: ${m.pendingReview - m.review.drafts.length}`, "info")}
        ${keyMetric("В работе", number(m.inProgress), `Не начаты: ${number(m.notStarted)}`, "neutral")}
        ${keyMetric("Выполнено", number(m.done.length), `В CRM: ${number(m.crmDone)}`, "success")}
        ${keyMetric("Выполнено в срок", percent(m.onTimeShare), m.timed ? `${m.onTime} из ${m.timed} с известным сроком` : "Нет задач с замером", "success")}
      </div>
    </section>
    <div class="analytics-graph-grid analytics-entry">
      ${activityChart(m, now)}
      ${taskChart(m)}
    </div>
    <section class="analytics-card analytics-entry" id="analytics-attention" aria-labelledby="attention-title">
      <div class="analytics-card-head"><h2 id="attention-title">Просроченные задачи</h2>
        ${m.signalCount ? `<span class="tag status-chip" data-tone="attention">${countWithNoun(m.signalCount, "сделка в очереди", "сделки в очереди", "сделок в очереди")}</span>` : ""}</div>
      ${overdue ? `<div class="analytics-drill">${m.overdue.map(task => `<div class="report-row">
        <button type="button" class="source-link" data-report-deal="${esc(task.deal.id)}" data-report-call="${esc(task.call_id || "")}">${esc(task.title)}</button>
        <span class="small muted">До ${esc(date(task.due))}</span>
      </div>`).join("")}</div>` : '<p class="empty">Просроченных задач нет.</p>'}
      <details class="analytics-fold"><summary>Причины задержек</summary>
        ${reasons.size ? metricRows([...reasons].map(([label, count]) => [esc(label), number(count)])) : '<p class="small muted">Причины ещё не указаны.</p>'}
        ${overdue > delayed.length ? `<p class="small muted">Без причины: ${number(overdue - delayed.length)}</p>` : ""}
      </details>
    </section>
    ` : ""}
    ${analyticsState.section === "sales" ? `
      <div class="analytics-equal-grid analytics-entry">
        ${card("Результаты продаж", metricRows(rows.sales))}
        ${card("Сделки по этапам", stagesRows.length ? barRows(stagesRows, "Текущие этапы сделок") : '<p class="small muted">Сделок пока нет.</p>')}
        ${card("Звонки и встречи", metricRows(rows.communication.slice(0, 4)))}
        ${card("Качество общения", metricRows(rows.communication.slice(4, 7)))}
      </div>
      ${detailsBlock("Договорённости и сделки", drillRows(m.deals, m.promises))}
    ` : ""}
    ${analyticsState.section === "workload" ? `
      <div class="analytics-equal-grid analytics-entry">
        ${card("Нагрузка сотрудников", workloadRows(person ? [person] : people, data, now))}
        ${card("Каналы общения", barRows(sourceRows(m.calls), "События по каналам") +
          (m.calls.length ? '<details class="analytics-fold"><summary class="small">По источникам</summary>' + sourceDetails(m.calls) + '</details>' : ""))}
        ${card("От договорённости до задачи", barRows(promiseRows, "Состояние задач") + metricRows(rows.tasks.filter(([label]) => label === "От назначения задачи до старта")))}
      </div>
    ` : ""}
    ${analyticsState.section === "reviews" ? `
      <div class="analytics-equal-grid analytics-entry">
        ${card("Решения менеджеров", metricRows([
          ["Подтверждено", number(m.review.confirmed.length)], ["Отклонено", number(m.review.rejected.length)],
          ["Подтверждено без правок", percent(proportion(m.review.unchanged, m.review.acceptedModel.length))],
        ]) + (m.review.edits.size ? '<details class="analytics-fold"><summary>Что исправляли</summary>' +
          barRows([...m.review.edits].map(([field, count]) => [auditFieldLabels[field] || "Другое поле", count, "purple"]), "Изменённые поля") + '</details>' : ""))}
        ${card("Скорость подготовки", metricRows([
          ["От текста до черновика", duration(m.review.processing.median), latencyNote(m.review.processing, "Нет успешных запусков модели")],
          ["От приёма записи до черновика", duration(m.review.recording.median), latencyNote(m.review.recording, "Нет времени приёма записи от источника")],
          ["Ошибки", number(m.review.failed)]
        ]))}
      </div>
    ` : ""}
    ${analyticsState.section === "metrics" ? metricsDirectory(groups) : ""}
  `}`;
  filterMetrics();
}

function exportAnalytics() {
  const {m, person, now} = analyticsScope();
  const rows = [
    ["Источник", preview ? "Синтетические данные" : "Загруженные данные"],
    ["Срез", now.toISOString()], ["Ответственный", person || "Вся команда"],
    ["Показатель", "Значение", "Уточнение"], ...metricGroups(m).flatMap(group => group.rows)
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
  if (button.hasAttribute("data-reset-metrics")) {
    analyticsState.query = $("metric-search").value = "";
    analyticsState.category = $("metric-category").value = "all";
    filterMetrics();
    $("metric-search").focus();
  } else if (button.dataset.analyticsSection) {
    analyticsState.section = button.dataset.analyticsSection;
    if (analyticsState.section === "skills" && canManageTeam() && analyticsState.scope === "person") {
      const owners = Object.entries(data.coaching?.owners || {}).filter(([, name]) => name === analyticsState.person);
      if (owners.length === 1) profileState.owner = owners[0][0];
    }
    history.replaceState(null, "", "#analytics-" + analyticsState.section);
    renderResults();
    $("results").querySelector("[data-analytics-section][aria-pressed=true]").focus();
  } else if (button.dataset.days) {
    analyticsState.days = Number(button.dataset.days);
    renderResults();
    $("results").querySelector("[data-days][aria-pressed=true]").focus();
  } else if (button.dataset.analyticsScope) {
    analyticsState.scope = button.dataset.analyticsScope;
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
  if (event.target.id === "metric-category") {
    analyticsState.category = event.target.value;
    filterMetrics();
    return;
  }
  if (event.target.id !== "analytics-person") return;
  analyticsState.person = event.target.value;
  renderResults();
  $("analytics-person").focus();
});

$("results").addEventListener("input", event => {
  if (event.target.id !== "metric-search") return;
  analyticsState.query = event.target.value;
  filterMetrics();
});
