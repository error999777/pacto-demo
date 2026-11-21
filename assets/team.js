"use strict";

const teamRoles = {manager: "Менеджер", lead: "Руководитель"};
const teamStates = {
  active: ["Активен", "success"], invited: ["Ждёт входа", "attention"],
  needs_code: ["Нужен код", "attention"], blocked: ["Доступ закрыт", "neutral"],
  ready: ["Готов к входу", "info"]
};
const teamFilters = [
  ["all", "Все"], ["active", "Активные"], ["invited", "Ждут входа"], ["blocked", "Без доступа"],
];
let teamStatus = "all";
let teamQuery = "";
let teamRole = "all";
let selectedMember;
let teamPending = false;
const demoTeam = [
  {id: "local-manager", name: "Мария Волкова", role: "manager", department: "Продажи",
   position: "Менеджер проектов", status: "active", enabled: true, builtin: true, version: 1,
   last_login_at: "2026-11-20T09:00:00+03:00"},
  {id: "demo-denis", name: "Денис Орлов", role: "manager", department: "Продажи",
   status: "invited", enabled: true, version: 1},
  {id: "local-lead", name: "Анна Соколова", role: "lead", department: "Руководство",
   status: "active", enabled: true, builtin: true, version: 1, last_login_at: "2026-11-20T09:30:00+03:00"}
];

const teamRows = () => preview ? demoTeam : data.team;

function statusMatches(member, filter) {
  if (filter === "all") return true;
  if (filter === "invited") return ["invited", "needs_code", "ready"].includes(member.status);
  return member.status === filter;
}

function memberBadge(member) {
  const [label, tone] = teamStates[member.status];
  return `<span class="status-chip team-badge" data-tone="${tone}">${label}</span>`;
}

function memberInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase("ru");
}

function teamOptions(values, selected) {
  return values.map(([key, label]) =>
    `<option value="${esc(key)}"${key === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
}

function renderTeam() {
  const total = teamRows().length;
  $("team").innerHTML = `
    <section class="team-panel" aria-labelledby="roster-title">
      <div class="team-heading work-panel">
        <div class="work-section-head"><h2 id="roster-title">Сотрудники</h2><span class="work-count">${numberFormat.format(total)}</span></div>
        ${canManageTeam() ? '<button class="primary" type="button" data-team-add>Добавить сотрудника</button>' : ""}
      </div>
      <div class="team-filters">
        <div class="team-statuses work-filters" role="group" aria-label="Фильтр по доступу">
          ${teamFilters.map(([key, label]) => `<button type="button" data-team-status="${key}"
            aria-pressed="${key === teamStatus}">${label}
            <span class="item-count">${teamRows().filter(row => statusMatches(row, key)).length}</span></button>`).join("")}
        </div>
        <div class="team-criteria">
          <label>Сотрудник или отдел<input id="team-search" type="search" name="member_search" autocomplete="off"
            placeholder="Имя или отдел…" value="${esc(teamQuery)}"></label>
          <label>Роль в Pacto<select id="team-role" name="role_filter">
            ${teamOptions([["all", "Все роли"], ...Object.entries(teamRoles)], teamRole)}
          </select></label>
          ${!preview ? '<button type="button" data-team-refresh>Обновить</button>' : ""}
        </div>
      </div>
      <div class="team-table-wrap" id="team-table"></div>
    </section>`;
  renderTeamTable();
}

function renderTeamTable() {
  const query = teamQuery.trim().toLocaleLowerCase("ru");
  const people = teamRows().filter(member => statusMatches(member, teamStatus) &&
    (teamRole === "all" || member.role === teamRole) &&
    [member.name, member.department, member.position || ""].some(value => value.toLocaleLowerCase("ru").includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  $("team-table").innerHTML = people.length ? `<table class="team-table" role="table" aria-label="Сотрудники и доступ">
    <thead role="rowgroup"><tr role="row"><th scope="col">Сотрудник</th><th scope="col">Роль и отдел</th>
     <th scope="col">Доступ</th><th scope="col">Последний вход</th><th scope="col">Действия</th></tr></thead>
    <tbody role="rowgroup">${people.map(member => `<tr role="row">
      <th scope="row" role="rowheader"><div class="team-person">
        <span class="team-avatar" data-role="${member.role}" aria-hidden="true">${esc(memberInitials(member.name))}</span>
        <span><strong>${esc(member.name)}</strong>${member.id === data.member_id ? ' <span class="muted small">вы</span>' : ""}
        ${member.position ? `<small>${esc(member.position)}</small>` : ""}</span>
      </div></th>
      <td role="cell"><span class="team-cell-label">Роль и отдел</span><strong>${teamRoles[member.role]}</strong><small>${esc(member.department)}</small></td>
      <td role="cell"><span class="team-cell-label">Доступ</span>${memberBadge(member)}</td>
      <td role="cell"><span class="team-cell-label">Последний вход</span><span class="small muted">${member.last_login_at ? esc(date(member.last_login_at)) : "Ещё не входил"}</span></td>
      <td role="cell"><button type="button" data-team-member="${esc(member.id)}" aria-label="Профиль сотрудника ${esc(member.name)}">Профиль</button></td>
    </tr>`).join("")}</tbody></table>` : '<div class="team-empty"><p>Сотрудники не найдены.</p><button type="button" data-team-reset>Сбросить фильтры</button></div>';
}

function teamChangeSet(profile) {
  const person = selectedMember;
  return person ? [`/api/team/${person.id}`, {...profile, version: person.version}] : ["/api/team", profile];
}

function renderMemberDialog(member = null) {
  selectedMember = member;
  const readOnly = !canManageTeam();
  const self = member?.id === data.member_id;
  const fixedRole = Boolean(member?.builtin || self);
  const departments = [...new Set(teamRows().map(entry => entry.department))];
  $("team-dialog-message").textContent = "";
  $("team-dialog-body").innerHTML = `
    <form id="team-form" method="post" action="/api/team" aria-labelledby="team-dialog-title">
      <div class="team-dialog-head"><h2 id="team-dialog-title">${member ? esc(member.name) : "Новый сотрудник"}</h2>
        ${member ? memberBadge(member) : ""}</div>
      ${preview ? '<p class="small muted">Используйте вымышленное имя.</p>' : ""}
      <fieldset ${readOnly ? "disabled" : ""}>
        <legend>Профиль</legend>
        <label for="team-name">Имя и фамилия</label>
        <input id="team-name" name="name" maxlength="160" value="${esc(member?.name)}" required
          autocomplete="off" ${readOnly ? "" : "autofocus"}>
        <label for="team-department">Отдел</label>
        <input id="team-department" name="department" list="team-department-options" maxlength="160"
          value="${esc(member?.department)}" placeholder="Например, Продажи…" required autocomplete="off">
        <datalist id="team-department-options">${departments.map(name => `<option value="${esc(name)}"></option>`).join("")}</datalist>
        <label for="team-position">Должность <span class="muted">(необязательно)</span></label>
        <input id="team-position" name="position" maxlength="160" value="${esc(member?.position)}" autocomplete="off">
        <label for="team-access-role">Роль в Pacto</label>
        <select id="team-access-role" name="role" ${fixedRole ? "disabled" : ""} aria-describedby="team-role-description">
          ${teamOptions(Object.entries(teamRoles), member?.role || "manager")}
        </select>
        <p id="team-role-description" class="small muted"></p>
      </fieldset>
      <div class="actions team-dialog-actions">
        ${!readOnly ? `<button class="primary" type="submit">${member ? "Сохранить профиль" : "Добавить и выдать код"}</button>` : ""}
        <button type="button" data-team-close ${readOnly ? "autofocus" : ""}>Закрыть</button>
      </div>
    </form>
    ${member && !readOnly && !member.builtin ? `<details class="team-access"><summary>Управление доступом</summary>
      <div class="actions">
        ${member.enabled ? '<button type="button" data-team-code>Выдать новый код</button>' : ""}
        ${!self ? `<button type="button" data-team-toggle>${member.enabled ? "Закрыть доступ" : "Разрешить вход"}</button>` : ""}
      </div>
    </details>` : ""}`;
  describeTeamRole();
}

function describeTeamRole() {
  const descriptions = {
    manager: "Работает со сделками и проверяет разборы.",
    lead: "Просматривает аналитику и управляет командой."
  };
  const role = $("team-access-role");
  const note = selectedMember && role.value !== selectedMember.role ? " После смены роли понадобится новый код." : "";
  $("team-role-description").textContent = descriptions[role.value] + note;
}

function demoCode(id) {
  return {id, code: "DEMO-" + crypto.randomUUID().slice(0, 8), expires_at: new Date(Date.now() + 86_400_000).toISOString()};
}

function showMemberCode(invitation) {
  $("team-dialog-message").textContent = "";
  $("team-dialog-body").innerHTML = `
    <h2 id="team-dialog-title">${preview ? "Пример кода входа" : "Одноразовый код входа"}</h2>
    <p class="small muted">${preview ? "Это пример. Код для входа выдаёт локальная версия." : "Передайте код сотруднику. Он показывается один раз и действует 24 часа."}</p>
    <label for="team-code-value">Код входа</label>
    <div class="credential-field">
      <input id="team-code-value" value="${esc(invitation.code)}" readonly spellcheck="false" autocomplete="off">
      <button type="button" data-team-copy>Копировать</button>
    </div>
    <p class="small muted">До ${esc(date(invitation.expires_at))}</p>
    <div class="actions team-dialog-actions"><button type="button" class="primary" data-team-close>Готово</button></div>`;
  $("team-code-value").focus();
}

function confirmTeamChange(operation) {
  const member = selectedMember;
  const copy = operation === "code"
    ? ["Выдать новый код?", "Предыдущий неиспользованный код перестанет действовать.", "Выдать код"]
    : member.enabled
      ? ["Закрыть доступ?", "Текущие сессии и неиспользованные коды сотрудника будут закрыты.", "Закрыть доступ"]
      : ["Разрешить вход?", "После этого выдайте новый код входа.", "Разрешить вход"];
  $("team-dialog-message").textContent = "";
  $("team-dialog-body").innerHTML = `
    <h2 id="team-dialog-title">${copy[0]}</h2><p class="muted">${copy[1]}</p>
    <div class="actions team-dialog-actions">
      <button class="primary" type="button" data-team-confirm="${operation}">${copy[2]}</button>
      <button type="button" data-team-back>Отмена</button>
    </div>`;
  $("team-dialog-body").querySelector("[data-team-back]").focus();
}

async function updateTeamView() {
  if (preview) renderTeam();
  else await refresh();
}

async function teamMutation(button, work) {
  if (teamPending) return;
  teamPending = true;
  const exits = [...$("team-dialog").querySelectorAll("[data-team-close], [data-team-back]")];
  for (const exit of exits) exit.disabled = true;
  try { await run(button, work, $("team-dialog-message")); }
  finally {
    teamPending = false;
    for (const exit of exits) exit.disabled = false;
  }
}

$("team").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.teamStatus) {
    teamStatus = button.dataset.teamStatus;
    for (const filter of $("team").querySelectorAll("[data-team-status]")) {
      filter.setAttribute("aria-pressed", String(filter === button));
    }
    renderTeamTable();
  } else if (button.hasAttribute("data-team-refresh")) {
    run(button, async () => {
      await updateTeamView();
      $("team").querySelector("[data-team-refresh]").focus();
      notify("Список обновлён.");
    });
  } else if (button.hasAttribute("data-team-reset")) {
    teamQuery = "";
    teamRole = teamStatus = "all";
    renderTeam();
    $("team-search").focus();
  } else if (button.hasAttribute("data-team-add") || button.dataset.teamMember) {
    const member = button.dataset.teamMember ? entity(teamRows(), button.dataset.teamMember) : null;
    renderMemberDialog(member);
    $("team-dialog").showModal();
  }
});

$("team").addEventListener("input", event => {
  if (event.target.id !== "team-search") return;
  teamQuery = event.target.value;
  renderTeamTable();
});
$("team").addEventListener("change", event => {
  if (event.target.id !== "team-role") return;
  teamRole = event.target.value;
  renderTeamTable();
});

$("team-dialog").addEventListener("change", event => {
  if (event.target.id === "team-access-role") describeTeamRole();
});
$("team-dialog").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  const person = selectedMember;
  const profile = {
    name: values.get("name").trim(), department: values.get("department").trim(),
    position: values.get("position").trim() || null, role: values.get("role") || person?.role
  };
  for (const field of ["name", "department"]) {
    if (!profile[field]) {
      notify("Заполните имя и отдел.", $("team-dialog-message"));
      form.elements[field].focus();
      return;
    }
  }
  const [path, payload] = teamChangeSet(profile);
  teamMutation(event.submitter, async () => {
    let result;
    if (!preview) result = await api(path, payload);
    else if (person) Object.assign(person, profile, {version: person.version + 1});
    else {
      result = demoCode(crypto.randomUUID());
      demoTeam.push({...profile, id: result.id, enabled: true, version: 1,
        status: "invited", invite_until: result.expires_at});
    }
    await updateTeamView();
    if (person) {
      renderMemberDialog(entity(teamRows(), person.id));
      notify("Профиль сохранён.", $("team-dialog-message"));
    } else showMemberCode(result);
  });
});

$("team-dialog").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const person = selectedMember;
  if (button.hasAttribute("data-team-close")) $("team-dialog").close();
  else if (button.hasAttribute("data-team-back")) {
    renderMemberDialog(person);
    $("team-name").focus();
  } else if (button.hasAttribute("data-team-copy")) {
    const input = $("team-code-value");
    input.select();
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(
      () => notify("Код скопирован.", $("team-dialog-message")),
      () => notify("Скопируйте выделенный код вручную.", $("team-dialog-message"))
    );
    else notify("Скопируйте выделенный код вручную.", $("team-dialog-message"));
  } else if (button.hasAttribute("data-team-code")) confirmTeamChange("code");
  else if (button.hasAttribute("data-team-toggle")) confirmTeamChange("state");
  else if (button.dataset.teamConfirm) {
    const operation = button.dataset.teamConfirm;
    teamMutation(button, async () => {
      const payload = {version: person.version};
      if (operation === "state") payload.enabled = !person.enabled;
      let result;
      if (!preview) result = await api(`/api/team/${person.id}/${operation}`, payload);
      else if (operation === "code") {
        result = demoCode(person.id);
        if (person.status !== "active") person.status = "invited";
      } else {
        person.enabled = payload.enabled;
        person.status = person.enabled ? "needs_code" : "blocked";
      }
      await updateTeamView();
      if (operation === "code") showMemberCode(result);
      else {
        renderMemberDialog(entity(teamRows(), person.id));
        notify(payload.enabled ? "Вход разрешён. Выдайте код." : "Доступ закрыт.", $("team-dialog-message"));
      }
    });
  }
});

$("team-dialog").addEventListener("cancel", event => {
  if (teamPending) event.preventDefault();
});

$("team-dialog").addEventListener("close", () => {
  const id = selectedMember?.id;
  selectedMember = null;
  $("team-dialog-body").replaceChildren();
  $("team-dialog-message").textContent = "";
  // A refresh replaces the opening row; use the fresh element as the focus target.
  if (view === "team" && data && document.activeElement === document.body) {
    const opener = id ? $("team").querySelector(`[data-team-member="${CSS.escape(id)}"]`) : null;
    (opener || $("team").querySelector("[data-team-add]") || $("team-search"))?.focus();
  }
});
