import { getData, challengeName } from "./challengeMeta.js";
import { getExpectedDate } from "./commitment.js";
import { buildLeaderboardRows, fetchParticipantUsers } from "./leaderboard.js";
import { getProgramDayGroups } from "./progress.js";
import { dayName, isDone, normalizeUserName, startOfDay, weekName } from "./utils.js";
import { showPop } from "./ui.js";

function formatReportDate(date = new Date()) {
  return date.toLocaleDateString("ar", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function dayGroupLabel(group) {
  return `${challengeName(group.challenge)} - ${weekName(group.week)} - ${dayName(group.programDay)}`;
}

function isBeforeToday(date) {
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

function isToday(date) {
  return startOfDay(date).getTime() === startOfDay(new Date()).getTime();
}

function isGroupCompleteForUser(group, done) {
  return group.items.length > 0 && group.items.every(item => isDone(done[item.id]));
}

function getLateRows(data, users) {
  const groups = getProgramDayGroups(data)
    .filter(group => {
      const expectedDate = getExpectedDate(group.items[0]);
      return expectedDate && isBeforeToday(expectedDate);
    });

  return users
    .map(user => {
      const done = user.done || {};
      const lateGroups = groups.filter(group => !isGroupCompleteForUser(group, done));

      return {
        user,
        lateGroups
      };
    })
    .filter(row => row.lateGroups.length > 0)
    .sort((a, b) =>
      b.lateGroups.length - a.lateGroups.length ||
      normalizeUserName(a.user.name).localeCompare(normalizeUserName(b.user.name), "ar")
    );
}

function getTodayPendingUsers(data, users) {
  const todayGroups = getProgramDayGroups(data)
    .filter(group => {
      const expectedDate = getExpectedDate(group.items[0]);
      return expectedDate && isToday(expectedDate);
    });

  if (todayGroups.length === 0) return { todayGroups, users: [] };

  return {
    todayGroups,
    users: users.filter(user => {
      const done = user.done || {};
      return todayGroups.some(group => !isGroupCompleteForUser(group, done));
    })
  };
}

function pickBest(rows, metric) {
  return rows.slice().sort((a, b) =>
    b.stats[metric] - a.stats[metric] ||
    b.stats.commitment - a.stats.commitment ||
    b.stats.percent - a.stats.percent ||
    normalizeUserName(a.user.name).localeCompare(normalizeUserName(b.user.name), "ar")
  )[0];
}

function metricLine(label, row, metric, suffix = "") {
  if (!row) return `${label}: لا يوجد`;
  return `${label}: ${normalizeUserName(row.user.name)} (${row.stats[metric]}${suffix})`;
}

function buildRankingLines(rows) {
  if (rows.length === 0) return ["لا توجد مشاركات حتى الآن."];

  return rows.map((row, index) => {
    const stats = row.stats;
    return `${index + 1}. ${normalizeUserName(row.user.name)} - التزام ${stats.commitment}% | إنجاز ${stats.percent}% | Streak ${stats.streak} | دقائق ${stats.minutes} | أسابيع ${stats.completedWeeks}`;
  });
}

function buildLateLines(lateRows) {
  if (lateRows.length === 0) return ["لا توجد متأخرات واضحة حتى الآن."];

  return lateRows.map(row => {
    const labels = row.lateGroups.slice(0, 3).map(dayGroupLabel).join("، ");
    const extra = row.lateGroups.length > 3 ? ` +${row.lateGroups.length - 3}` : "";
    return `- ${normalizeUserName(row.user.name)}: ${row.lateGroups.length} يوم (${labels}${extra})`;
  });
}

function buildTodayPendingLines(todayInfo) {
  if (todayInfo.todayGroups.length === 0) return ["لا توجد مهمة مجدولة اليوم."];
  if (todayInfo.users.length === 0) return ["كل المشاركات أنجزن مهمة اليوم."];

  return todayInfo.users.map(user => `- ${normalizeUserName(user.name)}`);
}

export function buildAdminReport(kind, data, users) {
  const rows = buildLeaderboardRows(data, users);
  const lateRows = getLateRows(data, users);
  const todayInfo = getTodayPendingUsers(data, users);
  const title = kind === "week" ? "تقرير الأسبوع الإداري" : "تقرير اليوم الإداري";
  const bestCommitment = pickBest(rows, "commitment");
  const bestCompletion = pickBest(rows, "percent");
  const bestStreak = pickBest(rows, "streak");
  const bestMinutes = pickBest(rows, "minutes");

  return [
    `📋 ${title}`,
    formatReportDate(),
    "",
    `عدد المشاركات: ${users.length}`,
    "",
    "الترتيب:",
    ...buildRankingLines(rows),
    "",
    "الأفضل:",
    metricLine("أعلى التزام", bestCommitment, "commitment", "%"),
    metricLine("أعلى إنجاز", bestCompletion, "percent", "%"),
    metricLine("أطول Streak", bestStreak, "streak", " أيام"),
    metricLine("أكثر دقائق", bestMinutes, "minutes", " دقيقة"),
    "",
    "المتأخرات:",
    ...buildLateLines(lateRows),
    "",
    "من لم تنجز مهمة اليوم:",
    ...buildTodayPendingLines(todayInfo)
  ].join("\n");
}

async function copyAdminReport(kind) {
  const data = await getData();
  const users = await fetchParticipantUsers();
  const report = buildAdminReport(kind, data, users);

  await navigator.clipboard.writeText(report);
}

export function initAdminReports() {
  const box = document.getElementById("adminReportsPanel");
  if (!box) return;

  const todayBtn = document.getElementById("copyDailyAdminReport");
  const weekBtn = document.getElementById("copyWeeklyAdminReport");

  async function handleCopy(kind, button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "جاري النسخ...";

    try {
      await copyAdminReport(kind);
      showPop("تم نسخ التقرير الإداري");
    } catch (e) {
      showPop("تعذر نسخ التقرير الإداري", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  if (todayBtn) todayBtn.onclick = () => handleCopy("today", todayBtn);
  if (weekBtn) weekBtn.onclick = () => handleCopy("week", weekBtn);

  const note = box.querySelector(".admin-tool-note");
  if (note) note.textContent = "التقارير تُبنى من بيانات Firebase الحالية عند الضغط.";
}
