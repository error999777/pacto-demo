"use strict";

const profileState = {owner: "", call: ""};
const checkLabels = {met: "Выполнено", missed: "Упущено", na: "Не требовалось", unknown: "Мало данных"};
const checkTones = {met: "success", missed: "attention", na: "neutral", unknown: "neutral"};

function skillStats(steps, calls) {
  return steps.map(step => {
    let met = 0, rated = 0, success, miss;
    for (const call of calls) {
      const check = call.checks?.find(item => item.step === step.id);
      if (check?.status === "met") {
        met++;
        success ??= call;
      } else if (check?.status === "missed") {
        miss ??= call;
      } else continue;
      rated++;
    }
    return {...step, met, rated, ratio: rated ? met / rated : null, success, miss};
  });
}

function skillRadar(stats) {
  const point = (index, radius) => {
    const angle = Math.PI * (2 * index / 5 - .5);
    return [125 + radius * Math.cos(angle), 123 + radius * Math.sin(angle)];
  };
  const ring = fraction => stats.map((_, i) => point(i, 88 * fraction).join(",")).join(" ");
  const outline = stats.every(s => s.rated) ? `<polygon class="skill-area" points="${stats.map((s, i) =>
    point(i, s.ratio * 88).join(",")).join(" ")}"/>` : "";
  return `<figure class="skill-figure"><svg viewBox="0 0 250 236" role="img" aria-label="Пятиугольник навыков" aria-describedby="skill-table">
    ${[.25, .5, .75, 1].map(f => `<polygon class="skill-grid" points="${ring(f)}"/>`).join("")}
    ${stats.map((s, i) => {
      const [x, y] = point(i, 88);
      return `<path class="skill-grid" d="M125 123 L${x} ${y}"/>`;
    }).join("")}${outline}
    ${stats.map((s, i) => {
      const [x, y] = point(i, 106);
      const [cx, cy] = point(i, s.ratio * 88);
      return `<text x="${x}" y="${y}" dy=".35em">${i + 1}</text>${s.rated ? `<circle cx="${cx}" cy="${cy}" r="4"/>` : ""}`;
    }).join("")}</svg><figcaption>От центра к краю · 0–100 %</figcaption></figure>`;
}

function coachingExample(call, step) {
  return `<button type="button" class="source-link" data-skill-example="${esc(call.id)}" data-skill="${esc(step)}">Пример из звонка</button>`;
}

function skillInsights(stats, strong) {
  const candidates = stats.filter(s => s.rated && (strong ? s.ratio >= .7 : s.ratio <= .5))
    .sort((a, b) => (strong ? b.ratio - a.ratio : a.ratio - b.ratio) || b.rated - a.rated).slice(0, 2);
  const rows = candidates.map(s => {
    const call = strong ? s.success : s.miss;
    return `<li><strong>${esc(s.name)}</strong><p>${esc(call.checks.find(c => c.step === s.id).note)}</p>
      ${coachingExample(call, s.id)}</li>`;
  }).join("");
  return `<section class="analytics-card skill-insights ${strong ? "positive" : "improve"}"><h3>${strong ? "Сильные стороны" : "Зоны роста"}</h3>
    ${rows ? `<ul>${rows}</ul>` : '<p class="small muted">В этой выборке пока нет подходящих примеров.</p>'}</section>`;
}

function callComparison(calls, steps) {
  if (!calls.length) return "";
  const ratedSteps = call => call.checks?.filter(c => c.status === "met" || c.status === "missed").length ?? -1;
  const selected = calls.find(call => call.id === profileState.call) ||
    calls.reduce((best, call) => ratedSteps(call) > ratedSteps(best) ? call : best);
  profileState.call = selected.id;
  const label = c => [date(c.at), c.title || entity(data.clients, c.client_id)?.name || "Звонок"].join(" · ");
  const checks = steps.map(step => {
    const check = selected.checks?.find(c => c.step === step.id);
    if (!check) return "";
    return `<li tabindex="-1" data-check-step="${esc(step.id)}"><div class="skill-check-title"><strong>${esc(step.name)}</strong>
      <span class="status-chip" data-tone="${checkTones[check.status]}">${checkLabels[check.status]}</span></div>
      <small>${esc(step.criterion)}</small><p>${esc(check.note)}</p>
      ${check.line_ids.map(id => {
        const line = selected.lines.find(l => l.id === id);
        return line ? `<blockquote><b>${actors[line.speaker]}</b> «${esc(line.text)}»</blockquote>` : "";
      }).join("")}</li>`;
  }).join("");
  let body;
  if (selected.checks) body = `<p class="small muted">${preview ? "Пример разбора на вымышленных данных" : "Оценка DeepSeek"} · ${esc(data.coaching.script.name)}</p><ol class="script-checks">${checks}</ol>`;
  else if (!selected.lines.length) body = '<p class="empty">Для сравнения нужна расшифровка звонка.</p>';
  else if (preview) body = '<p class="empty">Для этого звонка в демо нет разбора. Выберите звонок с отметкой «Разобран».</p>';
  else if (data.script_ai_available) body = `<button type="button" class="primary" data-compare-script="${esc(selected.id)}">Сравнить со скриптом</button>`;
  else body = '<p class="empty">Для сравнения подключите DeepSeek на сервере Pacto через LLM_API_KEY_FILE.</p>';
  return `<section class="analytics-card call-comparison"><h2>Звонок и скрипт</h2>
    <label class="profile-select">Выберите звонок<select id="coaching-call">${calls.map(c =>
      `<option value="${esc(c.id)}"${selected.id === c.id ? " selected" : ""}>${esc(label(c))} · ${c.checks ? "Разобран" : "Без разбора"}</option>`).join("")}</select></label>
    ${selected.deal_id ? `<button class="source-link" type="button" data-report-deal="${esc(selected.deal_id)}" data-report-call="${esc(selected.id)}">Открыть звонок в досье</button>` : ""}
    ${body}</section>`;
}

function renderCoaching() {
  const report = data.coaching;
  if (!report) return '<p class="analytics-card empty">Обновите данные, чтобы загрузить профиль.</p>';
  const names = report.owners;
  const roster = canManageTeam() ? Object.keys(names).sort((a, b) => names[a].localeCompare(names[b], "ru")) : [data.member_id];
  if (!roster.includes(profileState.owner)) profileState.owner = roster[0];
  const owner = profileState.owner;
  const displayName = key => roster.some(other => other !== key && names[other] === names[key])
    ? names[key] + " · " + key : names[key];
  const calls = data.calls.filter(call => owner && report.calls[call.id]?.owner === owner)
    .map(call => ({...call, ...report.calls[call.id]}));
  const stats = skillStats(report.script.steps, calls);
  const assessed = calls.filter(c => c.checks).length;
  return `<section class="analytics-card skill-profile"><div class="analytics-card-head"><div><h2>${esc(displayName(owner) || "Профиль менеджера")}</h2>
    <p class="small muted">Разобрано звонков: ${assessed} из ${calls.length}</p></div>
    ${canManageTeam() && roster.length ? `<label class="profile-select">Менеджер<select id="coaching-owner">${roster.map(key =>
      `<option value="${esc(key)}"${key === owner ? " selected" : ""}>${esc(displayName(key))}</option>`).join("")}</select></label>` : ""}</div>
    <div class="skill-overview">${skillRadar(stats)}
      <table id="skill-table"><caption>Выполнение шагов скрипта</caption><thead><tr><th scope="col">Навык</th><th scope="col">Звонки</th><th scope="col">Доля</th></tr></thead>
        <tbody>${stats.map((s, i) => `<tr><th scope="row"><span>${i + 1}</span>${esc(s.name)}</th>
          <td>${s.rated ? s.met + " из " + s.rated : "—"}</td><td>${s.rated ? percent(s.ratio) : "—"}</td></tr>`).join("")}</tbody></table></div>
    <details class="analytics-fold"><summary>Скрипт и расчёт оценок</summary><strong>${esc(report.script.name)}</strong>
      <ol>${stats.map(s => `<li>${esc(s.criterion)}</li>`).join("")}</ol>
      <p>Доля показывает, в скольких оценённых звонках выполнен шаг. «Мало данных» и «Не требовалось» исключены из расчёта. Сильные стороны — от 70 %, зоны роста — до 50 % включительно.</p>
      ${calls.some(c => c.by_deal) ? "<p>Для звонков без имени участника использован ответственный за сделку на момент разбора.</p>" : ""}</details></section>
    ${assessed ? `<div class="analytics-equal-grid">${skillInsights(stats, true)}${skillInsights(stats, false)}</div>` :
      '<p class="analytics-card empty">Оценки появятся после первого сравнения звонка со скриптом.</p>'}
    ${callComparison(calls, report.script.steps)}`;
}

$("detail").addEventListener("click", event => {
  const link = event.target.closest("[data-open-script]");
  if (!link) return;
  profileState.call = link.dataset.openScript;
  profileState.owner = data.coaching.calls[profileState.call].owner;
  analyticsState.section = "skills";
  history.replaceState(null, "", "#analytics-skills");
  setView("results");
  $("coaching-call")?.focus();
});

$("results").addEventListener("change", event => {
  if (event.target.id === "coaching-owner") {
    profileState.owner = event.target.value;
    profileState.call = "";
  } else if (event.target.id === "coaching-call") profileState.call = event.target.value;
  else return;
  const id = event.target.id;
  renderResults();
  $(id)?.focus();
});

$("results").addEventListener("click", event => {
  const example = event.target.closest("[data-skill-example]");
  if (example) {
    profileState.call = example.dataset.skillExample;
    renderResults();
    const step = $("results").querySelector('[data-check-step="' + CSS.escape(example.dataset.skill) + '"]');
    step?.focus();
    step?.scrollIntoView({block: "center"});
  }
  const button = event.target.closest("[data-compare-script]");
  if (button) run(button, async () => {
    button.textContent = "Сравниваем звонок…";
    try {
      await api("/api/pipeline/calls/" + encodeURIComponent(button.dataset.compareScript) + "/compare-script", {});
      await refresh();
      $("coaching-call")?.focus();
    } finally { button.textContent = "Сравнить со скриптом"; }
  });
});
