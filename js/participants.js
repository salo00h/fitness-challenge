import { collection, db, getDocs } from "./firebase.js";
import { USERS_COLLECTION } from "./constants.js";
import { state } from "./state.js";
import { challengeName, getData } from "./challengeMeta.js";
import { calcCommitmentPercent, calcCommitmentStreak, getExpectedDate } from "./commitment.js";
import {
  calcCompletionPercent,
  countRecordsThatOldSanitizeWouldRemove,
  getEarlyCompletionRecords,
  getCompletedWeeks,
  workoutOnly
} from "./progress.js";
import {
  escapeHtml,
  getCompletedAt,
  getProgressTitle,
  isDone,
  itemProgramDay,
  itemWeek,
  normalizeUserName,
  weekName
} from "./utils.js";
import { getUserAvatar } from "./ui.js";

export function isCurrentUserName(name) {
  return normalizeUserName(name).toLowerCase() === normalizeUserName(state.currentUser).toLowerCase();
}

export function withCurrentUserSnapshot(users = []) {
  if (!normalizeUserName(state.currentUser)) return users;

  const currentName = normalizeUserName(state.currentUser);
  const currentKey = currentName.toLowerCase();
  const profile = state.currentUserProfile || {};
  const snapshot = {
    ...profile,
    name: currentName,
    done: state.currentDone || {}
  };

  let found = false;
  const merged = users.map(user => {
    if (normalizeUserName(user.name).toLowerCase() !== currentKey) return user;
    found = true;
    return {
      ...user,
      ...snapshot,
      avatar: snapshot.avatar || user.avatar,
      done: snapshot.done
    };
  });

  if (!found) merged.push(snapshot);
  return merged;
}

export function getParticipantWeekScope(data) {
  const challengeNumbers = [...new Set(data.map(item => Number(item.challenge || 1)))].sort((a, b) => a - b);
  const fallbackChallenge = challengeNumbers.includes(1) ? 1 : (challengeNumbers[0] || 1);
  const challenge = state.activeChallenge || fallbackChallenge;
  const challengeData = data.filter(x => Number(x.challenge || 1) === Number(challenge));
  const weeks = [...new Set(challengeData.map(x => Number(x.week)))].sort((a, b) => a - b);
  const selectedWeek = state.activeChallenge ? (state.currentWeeksByChallenge[String(challenge)] || 1) : (weeks[0] || 1);
  const week = weeks.includes(Number(selectedWeek)) ? Number(selectedWeek) : (weeks[0] || Number(selectedWeek) || 1);

  return {
    weekData: challengeData.filter(x => Number(x.week) === Number(week)),
    weekLabel: `${challengeName(challenge)} - ${weekName(week)}`
  };
}

export function calcUserStats(data, done) {
  const workouts = workoutOnly(data);
  const completed = workouts.filter(x => isDone(done[x.id]));
  const minutes = completed.reduce((sum, x) => sum + (Number(x.duration) || 0), 0);
  const completedWeeks = getCompletedWeeks(data, done).length;
  const percent = calcCompletionPercent(workouts, done);
  const commitment = calcCommitmentPercent(workouts, done);
  const streak = calcCommitmentStreak(data, done);
  const weekScope = getParticipantWeekScope(data);
  const weekPercent = calcCompletionPercent(weekScope.weekData, done);

  return {
    completed: completed.length,
    total: workouts.length,
    minutes,
    completedWeeks,
    percent,
    commitment,
    streak,
    weekPercent,
    weekLabel: weekScope.weekLabel,
    title: getProgressTitle(percent)
  };
}

export function getUserBadges(stats, rankIndex = 99) {
  const badges = [];
  if (rankIndex === 0) badges.push("🏆 المركز الأول");
  if (stats.commitment >= 90) badges.push("🔥 ملتزمة اليوم");
  if (stats.completedWeeks > 0) badges.push("⭐ أسبوع مكتمل");
  if (stats.percent >= 50 || stats.streak >= 3) badges.push("💪 أقوى تقدم");
  return badges.slice(0, 4);
}

export function getLatestCompletionMs(done = {}) {
  const times = Object.values(done || {})
    .map(record => getCompletedAt(record))
    .filter(Boolean)
    .map(date => date.getTime());

  return times.length ? Math.max(...times) : Number.MAX_SAFE_INTEGER;
}

export function compareParticipantRank(a, b) {
  return b.stats.commitment - a.stats.commitment ||
    b.stats.percent - a.stats.percent ||
    b.stats.streak - a.stats.streak ||
    b.stats.minutes - a.stats.minutes ||
    getLatestCompletionMs(a.user.done || {}) - getLatestCompletionMs(b.user.done || {}) ||
    String(a.user.name).localeCompare(String(b.user.name), "ar");
}

function debugEarlyRecordRow(entry) {
  const completedAt = getCompletedAt(entry.record);
  const expectedDate = getExpectedDate(entry.item);

  return {
    id: entry.id,
    title: entry.item.title || "بدون عنوان",
    week: itemWeek(entry.item),
    day: itemProgramDay(entry.item),
    completedAt: completedAt ? completedAt.toISOString() : "",
    expectedDate: expectedDate ? expectedDate.toISOString() : ""
  };
}

export async function debugUserDone(name = state.currentUser) {
  const wantedName = normalizeUserName(name);
  if (!wantedName) {
    console.warn("debugUserDone: اكتب اسم المشاركة، مثال: debugUserDone('صفاء')");
    return null;
  }

  const data = state.cachedData.length ? state.cachedData : await getData();

  if (!state.cachedParticipants) {
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    state.cachedParticipants = snap.docs.map(d => d.data());
  }

  const users = withCurrentUserSnapshot(state.cachedParticipants || []);
  const user = users.find(item =>
    normalizeUserName(item.name).toLowerCase() === wantedName.toLowerCase()
  );

  if (!user) {
    console.warn(`debugUserDone: لم أجد مشاركة باسم ${wantedName}`);
    return null;
  }

  const done = user.done || {};
  const stats = calcUserStats(data, done);
  const earlyRecords = getEarlyCompletionRecords(done, data);
  const oldBugRemovedCount = countRecordsThatOldSanitizeWouldRemove(done, data);
  const report = {
    name: normalizeUserName(user.name),
    totalDone: Object.values(done).filter(isDone).length,
    completedExercises: `${stats.completed} / ${stats.total}`,
    removedEarlyRecords: 0,
    earlyRecordsAfterWeekOneException: earlyRecords.length,
    wouldHaveBeenRemovedByOldBug: oldBugRemovedCount,
    completedWeeks: stats.completedWeeks,
    completionPercent: `${stats.percent}%`,
    commitmentPercent: `${stats.commitment}%`,
    streak: stats.streak,
    minutes: stats.minutes
  };
  const earlyRows = earlyRecords.map(debugEarlyRecordRow);

  console.table(report);
  if (earlyRows.length) console.table(earlyRows);

  return {
    report,
    earlyRecords: earlyRows
  };
}

export function participantRankLabel(index) {
  if (index === 0) return "🥇 المركز الأول";
  if (index === 1) return "🥈 المركز الثاني";
  if (index === 2) return "🥉 المركز الثالث";
  return `المركز ${index + 1}`;
}

export async function renderParticipantsBoard(data, options = {}) {
  const { refreshParticipants = true } = options;
  const main = document.querySelector("main.container");
  if (!main || (!document.getElementById("days") && !document.getElementById("doneCount"))) return;

  let board = document.getElementById("participantsBoard");
  if (!board) {
    board = document.createElement("section");
    board.id = "participantsBoard";
    board.className = "participants-board";

    const after = document.getElementById("currentUserBar") || main.querySelector(".hero, .stats-hero");
    if (after) after.insertAdjacentElement("afterend", board);
    else main.prepend(board);
  }

  if (!refreshParticipants && !state.cachedParticipants) return;

  if (refreshParticipants || !state.cachedParticipants) {
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    state.cachedParticipants = snap.docs.map(d => d.data());
  }

  const users = withCurrentUserSnapshot(state.cachedParticipants)
    .filter(u => u.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));

  const visibleUsers = users
    .map(user => {
      const stats = calcUserStats(data, user.done || {});
      const isMe = isCurrentUserName(user.name);
      return { user, stats, isMe };
    })
    .filter(item => item.isMe || item.stats.percent > 0)
    .sort(compareParticipantRank);

  if (visibleUsers.length === 0) {
    board.innerHTML = "";
    renderHallOfFame(data);
    return;
  }

  const currentRankIndex = visibleUsers.findIndex(item => item.isMe);
  const currentRankSummary = document.body.classList.contains("stats-page") && currentRankIndex >= 0
    ? `
        <div class="current-rank-summary">
          <span>ترتيبك الحالي</span>
          <strong>${participantRankLabel(currentRankIndex)}</strong>
          <small>حسب الالتزام ثم الإنجاز ثم السلسلة ثم الدقائق</small>
        </div>
      `
    : "";

  board.innerHTML = `
    <h2>👭 تحدي البنات</h2>
    ${currentRankSummary}
    <div class="participants-grid">
      ${visibleUsers.map(({ user, stats, isMe }, index) => {
    const badges = getUserBadges(stats, index);
    return `
          <article class="participant-card ${isMe ? "is-me" : ""}">
            <div class="participant-rank">${participantRankLabel(index)}</div>
            <div class="participant-head">
              <div class="participant-name">
                <span class="participant-avatar">${escapeHtml(getUserAvatar(user))}</span>
                <strong>${escapeHtml(user.name)}</strong>
              </div>
              <span>${isMe ? "أنتِ" : "المنافسة"}</span>
            </div>
            <div class="participant-title">${escapeHtml(stats.title)}</div>
            ${badges.length ? `<div class="participant-badges">${badges.map(badge => `<span>${escapeHtml(badge)}</span>`).join("")}</div>` : ""}

            <div class="participant-percent">${stats.percent}%</div>

            <div class="bar">
              <div style="width:${stats.percent}%"></div>
            </div>

            <div class="participant-meta">
              <span>✅ ${stats.completed} / ${stats.total} تمرين</span>
              <span>🎯 ${stats.commitment}% التزام</span>
              <span>🔥 ${stats.streak} أيام سلسلة</span>
              <span>⏱ ${stats.minutes} دقيقة</span>
              <span>⭐ ${stats.completedWeeks} أسبوع</span>
              <span>📅 ${stats.weekLabel} ${stats.weekPercent}%</span>
            </div>
          </article>
        `;
  }).join("")}
    </div>
  `;

  renderHallOfFame(data);
}

export function renderHallOfFame(data) {
  const box = document.getElementById("hallOfFame");
  if (!box || !state.cachedParticipants) return;

  const rows = withCurrentUserSnapshot(state.cachedParticipants)
    .filter(user => user.name)
    .map(user => ({
      user,
      stats: calcUserStats(data, user.done || {})
    }))
    .filter(row => row.stats.percent > 0 || isCurrentUserName(row.user.name));

  if (rows.length === 0) {
    box.innerHTML = "";
    return;
  }

  const pick = metric => [...rows].sort((a, b) =>
    b.stats[metric] - a.stats[metric] ||
    compareParticipantRank(a, b)
  )[0];

  const winners = [
    { label: "أعلى التزام", metric: "commitment", suffix: "%", icon: "🎯" },
    { label: "أعلى إنجاز", metric: "percent", suffix: "%", icon: "🏆" },
    { label: "أطول سلسلة", metric: "streak", suffix: " أيام", icon: "🔥" },
    { label: "أكثر دقائق", metric: "minutes", suffix: " دقيقة", icon: "⏱" }
  ].map(item => ({ ...item, winner: pick(item.metric) }));

  box.innerHTML = `
    <div class="section-title">
      <h2>Hall of Fame</h2>
      <span>أفضل المشاركات حتى الآن</span>
    </div>
    <div class="hall-grid">
      ${winners.map(item => `
        <article class="hall-item">
          <span>${item.icon}</span>
          <div>
            <small>${item.label}</small>
            <strong>${escapeHtml(item.winner?.user.name || "لا يوجد")}</strong>
            <em>${item.winner ? item.winner.stats[item.metric] + item.suffix : "0"}</em>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}
