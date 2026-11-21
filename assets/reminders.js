"use strict";

const reminderHour = 60 * 60 * 1000;
const demoReminderCache = new Map();
const reminderDialog = $("reminder-dialog");
const reminderDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Minsk"
});
let reminderTimer;
let reminderOwner;
let dueVersions = new Set();
let reminderDraft;
let reminderSaving = false;

function reminderKey(target) {
  return [target.deal_id, target.kind, target.target_id].join("/");
}

function reminderTaskKind(task) {
  return task.deal_id ? "task" : "promise";
}

function reminderTarget(target) {
  const deal = entity(data.deals, target.deal_id);
  if (!deal) return;
  if (target.kind === "step") {
    const step = deal.suggestions.find(item => item.call_id === target.target_id);
    if (step) return {deal, title: step.angle};
  } else {
    const task = deal.tasks.find(item => reminderTaskKind(item) === target.kind && item.id === target.target_id);
    if (task) return {deal, title: task.title};
  }
}

function getReminder(target) {
  return data.reminders.find(item => reminderKey(item) === reminderKey(target));
}

function reminderButton(deal, kind, id, allowed) {
  const target = {deal_id: deal, kind, target_id: id};
  const item = getReminder(target);
  return `<button type="button" class="reminder-trigger quiet small" data-reminder="${esc(reminderKey(target))}"
    ${allowed ? 'data-can-remind' : ''} ${allowed || item ? "" : "hidden"}>${reminderButtonText(item)}</button>`;
}

function reminderButtonText(item) {
  return item ? `Напоминание · ${date(item.remind_at)}` : "Напомнить";
}

function unpackReminder(key) {
  const [deal_id, kind, target_id] = key.split("/");
  return {deal_id, kind, target_id};
}

function demoReminders(member) {
  if (demoReminderCache.has(member)) return demoReminderCache.get(member);
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(`pacto-reminders-${member}`)); } catch {}
  const now = Date.now();
  const items = member === "local-manager" ? [
    {deal_id: "alpha-sync", kind: "step", target_id: "alpha-2", title: "Договориться о технической встрече",
      remind_at: new Date(now - 10 * 60_000).toISOString(), version: "demo-step"},
    {deal_id: "north-warehouse", kind: "task", target_id: "north-list", title: "Получить список сканеров на складе",
      remind_at: new Date(now + 2 * reminderHour).toISOString(), version: "demo-task"}
  ] : [];
  const rows = Array.isArray(saved) ? saved : items;
  demoReminderCache.set(member, rows);
  return rows;
}

function updateReminderClock(announce = false) {
  clearTimeout(reminderTimer);
  const items = data?.reminders || [];
  const now = Date.now();
  const due = items.filter(item => Date.parse(item.remind_at) <= now);
  const sameMember = reminderOwner === data?.member_id;
  const newlyDue = due.filter(item => !dueVersions.has(item.version));
  if (announce && sameMember && newlyDue.length) {
    notify(newlyDue.length === 1 ? "Сработало напоминание." : `Сработали напоминания (${newlyDue.length}).`);
  }
  const changed = !sameMember || newlyDue.length > 0 || due.length !== dueVersions.size;
  reminderOwner = data?.member_id;
  dueVersions = new Set(due.map(item => item.version));
  const count = $("reminder-count");
  count.textContent = items.length || "";
  count.dataset.due = String(due.length > 0);
  const label = $("open-reminders");
  if (items.length) label.setAttribute("aria-label", `Напоминания, всего ${items.length}${due.length ? `, пора выполнить ${due.length}` : ""}`);
  else label.removeAttribute("aria-label");
  const next = items.reduce((earliest, item) => {
    const at = Date.parse(item.remind_at);
    return at > now ? Math.min(earliest, at) : earliest;
  }, Infinity);
  if (Number.isFinite(next)) {
    reminderTimer = setTimeout(checkReminderTime, Math.min(next - now, 2_147_483_647));
  }
  return changed;
}

function checkReminderTime() {
  if (updateReminderClock(true) && data && view === "reminders") renderReminders();
}

function renderReminders(focused = document.activeElement) {
  const section = $("reminders");
  const focusRow = section.contains(focused) && focused.closest("[data-reminder-row]");
  const items = [...data.reminders].sort((a, b) => Date.parse(a.remind_at) - Date.parse(b.remind_at));
  const now = Date.now();
  const groups = [
    ["due", "Срок наступил", items.filter(item => Date.parse(item.remind_at) <= now)],
    ["planned", "Запланированы", items.filter(item => Date.parse(item.remind_at) > now)]
  ];
  section.innerHTML = groups.map(([id, label, rows]) => rows.length ? `<section class="reminder-group work-panel"
    data-tone="${id === "due" ? "attention" : "info"}" aria-labelledby="reminders-${id}">
    <div class="work-section-head"><h2 id="reminders-${id}">${label}</h2><span class="work-count">${rows.length}</span></div>
    <ul class="reminder-list" role="list">${rows.map(item => {
      const context = reminderTarget(item);
      const deal = context?.deal || entity(data.deals, item.deal_id);
      const client = deal && entity(data.clients, deal.client_id);
      return `<li class="reminder-row" data-reminder-row="${esc(reminderKey(item))}" data-tone="${id === "due" ? "attention" : "info"}">
        <div class="reminder-summary">
          <time class="reminder-time small numeric" datetime="${esc(item.remind_at)}">${esc(reminderDate.format(new Date(item.remind_at)))}</time>
          ${context ? `<button type="button" class="reminder-open" data-reminder-action="open">${esc(context.title)}</button>`
            : `<strong>${esc(item.title)}</strong>`}
          <p class="muted small">${esc(deal ? [client?.name, deal.title].filter(Boolean).join(" · ") : "Карточка недоступна")}</p>
        </div>
        <div class="reminder-actions">
          <button type="button" data-reminder-action="snooze" aria-label="Отложить на час">+1 час</button>
          <button type="button" data-reminder-action="schedule">Перенести</button>
          <button type="button" class="quiet" data-reminder-action="dismiss" aria-label="Снять напоминание">Снять</button>
        </div>
      </li>`;
    }).join("")}</ul>
  </section>` : "").join("") || '<p class="empty work-panel">Напоминаний пока нет. Их можно поставить в карточке задачи или следующего шага.</p>';
  if (focusRow) {
    const row = section.querySelector(`[data-reminder-row="${CSS.escape(focusRow.dataset.reminderRow)}"]`);
    const button = row?.querySelector(`[data-reminder-action="${focused.dataset.reminderAction}"]`);
    (button || $("title")).focus();
  }
}

function openReminderTarget(target) {
  const context = reminderTarget(target);
  if (!context) return;
  view = "clients";
  select(context.deal.client_id, context.deal.id, target.kind === "step" ? target.target_id : undefined);
  if (target.kind !== "step") {
    dossierPane = "tasks";
    allCalls = false;
    renderDossier();
  }
  const card = $("detail").querySelector(`[data-reminder="${CSS.escape(reminderKey(target))}"]`)?.closest(".task, .priority");
  card?.focus();
  card?.scrollIntoView({block: "nearest"});
}

function editReminder(target) {
  const item = getReminder(target);
  const context = reminderTarget(target);
  reminderDraft = {target, version: item?.version, member: data.member_id};
  $("reminder-context").textContent = context?.title || item.title;
  $("reminder-title").textContent = item ? "Перенести напоминание" : "Поставить напоминание";
  $("reminder-status").textContent = "";
  const input = $("remind-at");
  input.min = minskInput(Math.floor(Date.now() / 60_000) * 60_000 + 60_000);
  input.value = item && Date.parse(item.remind_at) > Date.now() ? minskInput(item.remind_at)
    : minskInput(Math.ceil((Date.now() + reminderHour) / 60_000) * 60_000);
  reminderDialog.showModal();
}

async function saveReminder(target, operation, version, remind_at, member) {
  if (reminderSaving) throw new Error("Дождитесь сохранения напоминания.");
  reminderSaving = true;
  try {
    if (!preview) {
      return await api(`/api/reminders/${reminderKey(target)}`, {operation, version, remind_at, expected_member: member});
    }
    const previous = demoReminders(member);
    const item = previous.find(row => reminderKey(row) === reminderKey(target));
    const items = previous.filter(row => row !== item);
    if (operation !== "dismiss") {
      const at = operation === "snooze" ? new Date(Math.max(Date.now(), Date.parse(item.remind_at)) + reminderHour).toISOString()
        : remind_at;
      items.push({...target, title: item?.title || reminderTarget(target).title, remind_at: at, version: crypto.randomUUID()});
    }
    demoReminderCache.set(member, items);
    try { sessionStorage.setItem(`pacto-reminders-${member}`, JSON.stringify(items)); } catch {}
    return items;
  } finally { reminderSaving = false; }
}

function applyReminders(items, member, focused) {
  if (data?.member_id !== member) return false;
  data.reminders = items;
  updateReminderClock();
  for (const trigger of $("detail").querySelectorAll("[data-reminder]")) {
    const item = getReminder(unpackReminder(trigger.dataset.reminder));
    trigger.textContent = reminderButtonText(item);
    trigger.hidden = !item && !trigger.hasAttribute("data-can-remind");
  }
  if (view === "reminders") renderReminders(focused);
  return true;
}

$("detail").addEventListener("click", event => {
  const trigger = event.target.closest("[data-reminder]");
  if (trigger) editReminder(unpackReminder(trigger.dataset.reminder));
});

$("reminders").addEventListener("click", event => {
  const button = event.target.closest("[data-reminder-action]");
  if (!button) return;
  const target = unpackReminder(button.closest("[data-reminder-row]").dataset.reminderRow);
  const operation = button.dataset.reminderAction;
  if (operation === "open") return openReminderTarget(target);
  if (operation === "schedule") return editReminder(target);
  const member = data.member_id;
  run(button, async () => {
    const items = await saveReminder(target, operation, getReminder(target).version, undefined, member);
    if (applyReminders(items, member, button)) {
      notify(operation === "snooze" ? "Напоминание отложено на час." : "Напоминание снято.");
    }
  });
});

$("cancel-reminder").addEventListener("click", () => reminderDialog.close());
$("reminder-form").addEventListener("submit", event => {
  event.preventDefault();
  const {target, version, member} = reminderDraft;
  const at = $("remind-at").value + ":00+03:00";
  const status = $("reminder-status");
  status.textContent = "";
  if (Date.parse(at) <= Date.now()) return notify("Выберите время в будущем.", status);
  run(event.submitter, async () => {
    const items = await saveReminder(target, "schedule", version, at, member);
    if (reminderDraft?.target === target) reminderDialog.close();
    if (applyReminders(items, member)) notify("Напоминание сохранено.");
  }, status);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkReminderTime();
});
