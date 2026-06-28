import { calcCommitmentPercent, isProgramDayOnTime } from "./commitment.js";
import { calcCompletionPercent, getProgramDayGroups, isProgramDayComplete } from "./progress.js";
import { state } from "./state.js";
import { escapeHtml, isDone, weekName } from "./utils.js";

function weekKey(item) {
  return `${Number(item.challenge || 1)}-${Number(item.week || 1)}`;
}

function groupWeeks(data) {
  return data.reduce((groups, item) => {
    const key = weekKey(item);
    if (!groups[key]) {
      groups[key] = {
        key,
        challenge: Number(item.challenge || 1),
        week: Number(item.week || 1),
        items: []
      };
    }
    groups[key].items.push(item);
    return groups;
  }, {});
}

function renderBars(rows, valueKey, suffix = "") {
  const max = Math.max(1, ...rows.map(row => Number(row[valueKey]) || 0));

  return rows.map(row => {
    const value = Number(row[valueKey]) || 0;
    const width = valueKey.includes("percent") ? value : Math.round((value / max) * 100);
    return `
      <div class="chart-row">
        <span>${escapeHtml(row.label)}</span>
        <div><i style="width:${Math.max(3, width)}%"></i></div>
        <strong>${value}${suffix}</strong>
      </div>
    `;
  }).join("");
}

function buildWeekRows(data, done) {
  return Object.values(groupWeeks(data))
    .sort((a, b) => a.challenge - b.challenge || a.week - b.week)
    .map(group => {
      const completed = group.items.filter(item => isDone(done[item.id]));
      const minutes = completed.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);

      return {
        label: `ت${group.challenge} · ${weekName(group.week)}`,
        percent: calcCompletionPercent(group.items, done),
        commitment: calcCommitmentPercent(group.items, done),
        minutes
      };
    });
}

function buildDayRows(data, done) {
  return getProgramDayGroups(data).map(group => ({
    label: `ت${group.challenge} · يوم ${group.absoluteDay}`,
    complete: isProgramDayComplete(group, done) ? 100 : 0,
    onTime: isProgramDayOnTime(group, done) ? 100 : 0
  }));
}

export function renderAdvancedStats(data = state.cachedData) {
  const main = document.querySelector("main.container");
  if (!main || !document.getElementById("doneCount")) return;

  const done = state.currentDone || {};
  const weekRows = buildWeekRows(data, done);
  const dayRows = buildDayRows(data, done);

  let box = document.getElementById("advancedCharts");
  if (!box) {
    box = document.createElement("section");
    box.id = "advancedCharts";
    box.className = "advanced-charts";
    const anchor = document.querySelector(".progress-board") || document.getElementById("personalProfile") || main.querySelector(".stats-hero");
    anchor?.insertAdjacentElement("afterend", box);
  }

  box.innerHTML = `
    <div class="section-title">
      <h2>الرسوم البيانية</h2>
      <span>قراءة سريعة للتطور</span>
    </div>
    <div class="charts-grid">
      <article class="chart-card">
        <h3>📈 الإنجاز خلال الأسابيع</h3>
        ${renderBars(weekRows, "percent", "%")}
      </article>
      <article class="chart-card">
        <h3>📊 الالتزام الأسبوعي</h3>
        ${renderBars(weekRows, "commitment", "%")}
      </article>
      <article class="chart-card">
        <h3>⏱ الدقائق لكل أسبوع</h3>
        ${renderBars(weekRows, "minutes", " د")}
      </article>
      <article class="chart-card">
        <h3>🔥 تطور الـ Streak</h3>
        ${renderBars(dayRows.slice(-14), "onTime", "%")}
      </article>
    </div>
  `;
}
