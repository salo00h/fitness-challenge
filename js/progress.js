import { state } from "./state.js";
import { CHALLENGE_DAYS } from "./constants.js";
import { challengeName, challengeNumber } from "./challengeMeta.js";
import {
  dayName,
  getCompletedAt,
  getProgramAbsoluteDay,
  getProgressTitle,
  isDone,
  itemProgramDay,
  itemWeek,
  startOfDay,
  weekName
} from "./utils.js";
import { calcCommitmentPercent, calcCommitmentStreak, getExpectedDate } from "./commitment.js";
import { setProgress } from "./ui.js";

let statsRenderers = {
  renderProgramCalendar: null,
  renderPersonalProfile: null
};

export function setStatsRenderers(renderers = {}) {
  statsRenderers = { ...statsRenderers, ...renderers };
}

// Progress Calculations
// حاليًا أيام الراحة محسوبة ضمن الإنجاز، لا تغيّرها إلا إذا تغير منطق التحدي.
export function workoutOnly(data) {
  return data;
}

export function dayKey(item) {
  const challenge = challengeNumber(item);
  const week = itemWeek(item);
  const day = itemProgramDay(item);
  if (!Number.isFinite(challenge) || !Number.isFinite(week) || !Number.isFinite(day)) return "";
  return `${challenge}-${week}-${day}`;
}

export function weekKey(item) {
  const challenge = challengeNumber(item);
  const week = itemWeek(item);
  if (!Number.isFinite(challenge) || !Number.isFinite(week)) return "";
  return `${challenge}-${week}`;
}

export function groupByKey(items, keyFn) {
  return workoutOnly(items).reduce((groups, item) => {
    const key = keyFn(item);
    if (!key) return groups;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

export function getProgramDayGroups(data) {
  const groups = groupByKey(data, dayKey);
  return Object.keys(groups)
    .map(key => {
      const items = groups[key];
      const sample = items[0] || {};
      return {
        key,
        challenge: challengeNumber(sample),
        week: itemWeek(sample),
        programDay: itemProgramDay(sample),
        absoluteDay: getProgramAbsoluteDay(sample),
        items
      };
    })
    .sort((a, b) =>
      a.challenge - b.challenge ||
      a.absoluteDay - b.absoluteDay ||
      a.week - b.week ||
      a.programDay - b.programDay
    );
}

export function isProgramDayComplete(dayGroup, done) {
  return dayGroup.items.length > 0 && dayGroup.items.every(item => isDone(done[item.id]));
}

export function makeDoneRecord() {
  return {
    completed: true,
    completedAt: new Date().toISOString()
  };
}

export function upgradeLegacyDoneRecords(done) {
  const upgraded = { ...(done || {}) };
  if (!state.cachedData.length) return upgraded;

  state.cachedData.forEach(item => {
    if (upgraded[item.id] !== true) return;

    const expectedDate = getExpectedDate(item);
    if (!expectedDate) return;

    upgraded[item.id] = {
      completed: true,
      completedAt: expectedDate.toISOString(),
      migratedFromLegacy: true
    };
  });

  return upgraded;
}

function getItemsById(data = state.cachedData) {
  return (data || []).reduce((map, item) => {
    if (item?.id) map[item.id] = item;
    return map;
  }, {});
}

function isEarlyCompletionRecordStrict(item, record) {
  if (!item || !isDone(record)) return false;

  const completedAt = getCompletedAt(record);
  const expectedDate = getExpectedDate(item);
  if (!completedAt || !expectedDate) return false;

  return startOfDay(completedAt).getTime() < startOfDay(expectedDate).getTime();
}

export function isEarlyCompletionRecord(item, record) {
  if (!item || !isDone(record)) return false;
  if (itemWeek(item) === 1) return false;

  return isEarlyCompletionRecordStrict(item, record);
}

export function getEarlyCompletionRecords(done, data = state.cachedData) {
  const upgraded = upgradeLegacyDoneRecords(done || {});
  if (!data?.length) return [];

  const itemsById = getItemsById(data);

  return Object.entries(upgraded)
    .filter(([id, record]) => {
      const item = itemsById[id];
      return item && isEarlyCompletionRecord(item, record);
    })
    .map(([id, record]) => ({
      id,
      item: itemsById[id],
      record
    }));
}

export function sanitizeDoneRecords(done) {
  return upgradeLegacyDoneRecords(done || {});
}

export function countRecordsThatOldSanitizeWouldRemove(done, data = state.cachedData) {
  const upgraded = upgradeLegacyDoneRecords(done || {});
  if (!data?.length) return 0;

  const itemsById = getItemsById(data);

  return Object.entries(upgraded).reduce((count, [id, record]) => {
    const item = itemsById[id];
    return item && isEarlyCompletionRecordStrict(item, record) ? count + 1 : count;
  }, 0);
}

// نسخة عامة مختصرة من آخر إنجازات المستخدمة - تُستخدم لملف public-profiles
// حتى لا نضطر لكشف خريطة done{} الكاملة (بكل تواريخها) لبقية المشاركات.
export function buildRecentDone(data, done, limit = 5) {
  const itemsById = getItemsById(data);

  return Object.entries(done || {})
    .map(([id, record]) => ({ id, record, item: itemsById[id] }))
    .filter(entry => entry.item && isDone(entry.record))
    .map(entry => {
      const completedAt = getCompletedAt(entry.record);
      return {
        id: entry.id,
        title: entry.item.title || "",
        type: entry.item.type || "workout",
        completedAt: (completedAt || new Date(0)).toISOString()
      };
    })
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, limit);
}

export function mergeDoneRecords(data, firebaseDone = {}, localDone = {}) {
  const merged = sanitizeDoneRecords(firebaseDone, data);
  const safeLocal = sanitizeDoneRecords(localDone, data);

  Object.entries(safeLocal).forEach(([id, record]) => {
    if (!isDone(merged[id]) && isDone(record)) {
      merged[id] = record;
    }
  });

  return merged;
}

// Progress Calculations
export function calcCompletionPercent(items, done) {
  const workouts = workoutOnly(items);
  if (workouts.length === 0) return 0;
  const complete = workouts.filter(x => isDone(done[x.id])).length;
  return Math.round((complete / workouts.length) * 100);
}

export function calcPercent(items, done) {
  return calcCompletionPercent(items, done);
}

export function getCompletedWeeks(data, done) {
  const weekGroups = groupByKey(data, weekKey);
  return Object.keys(weekGroups)
    .filter(key => weekGroups[key].length > 0 && weekGroups[key].every(x => isDone(done[x.id])))
    .map(key => {
      const [challenge, week] = key.split("-").map(Number);
      return { key, challenge, week };
    })
    .sort((a, b) => a.challenge - b.challenge || a.week - b.week);
}

export function updateCountdown(data = state.cachedData) {
  const box = document.getElementById("countdownText");
  if (!box) return;

  const done = state.currentDone || {};
  const dayGroups = groupByKey(data, dayKey);
  const dayKeys = Object.keys(dayGroups);
  const totalDays = dayKeys.length || CHALLENGE_DAYS;

  const completedDays = dayKeys.filter(key =>
    dayGroups[key].length > 0 && dayGroups[key].every(x => isDone(done[x.id]))
  ).length;

  const daysLeft = Math.max(0, totalDays - completedDays);

  box.textContent = `باقي ${daysLeft} يوم على نهاية التحدي`;
}

export function updateStats(data) {
  const done = state.currentDone || {};
  const workouts = workoutOnly(data);
  const completed = workouts.filter(x => isDone(done[x.id]));
  const minutes = completed.reduce((sum, x) => sum + (Number(x.duration) || 0), 0);
  const completedWeeks = getCompletedWeeks(data, done);
  const completionPercent = calcCompletionPercent(workouts, done);
  const streak = calcCommitmentStreak(data, done);

  const doneCount = document.getElementById("doneCount");
  const doneMinutes = document.getElementById("doneMinutes");
  const doneWeeks = document.getElementById("doneWeeks");
  const commitmentStreak = document.getElementById("commitmentStreak");
  const achievementTitle = document.getElementById("achievementTitle");

  if (doneCount) doneCount.textContent = `${completed.length} من ${workouts.length}`;
  if (doneMinutes) doneMinutes.textContent = minutes;
  if (doneWeeks) doneWeeks.textContent = completedWeeks.length;
  if (commitmentStreak) commitmentStreak.textContent = `${streak} أيام متتالية`;
  if (achievementTitle) achievementTitle.textContent = getProgressTitle(completionPercent);

  const weekStars = document.getElementById("weekStars");
  if (weekStars) {
    weekStars.innerHTML = completedWeeks.length
      ? completedWeeks.map(w => `<span>🏆 بطلة ${weekName(w.week)} - ${challengeName(w.challenge)}</span>`).join("")
      : `<span class="muted-star">أكمل أسبوع كامل لتحصل على نجمة ⭐</span>`;
  }

  if (statsRenderers.renderProgramCalendar) statsRenderers.renderProgramCalendar(data);
  if (statsRenderers.renderPersonalProfile) statsRenderers.renderPersonalProfile(data);
}

export function updateProgressBoard(data) {
  const done = state.currentDone || {};
  const workouts = workoutOnly(data);

  const weekItems = workouts.filter(x => itemWeek(x) === Number(state.currentWeek));
  const monthItems = workouts.filter(x => itemWeek(x) >= 1 && itemWeek(x) <= 4);
  const challengeItems = workouts;
  const challengePercent = calcCompletionPercent(challengeItems, done);
  const commitmentPercent = calcCommitmentPercent(challengeItems, done);

  setProgress("weekPercent", "weekBar", calcCompletionPercent(weekItems, done));
  setProgress("monthPercent", "monthBar", calcCompletionPercent(monthItems, done));
  setProgress("challengePercent", "challengeBar", challengePercent);
  setProgress("commitmentPercent", "commitmentBar", commitmentPercent);

  const trophy = document.getElementById("trophyBox");
  if (trophy) {
    if (challengePercent === 100 && workoutOnly(challengeItems).length > 0) {
      trophy.classList.remove("hidden");
    } else {
      trophy.classList.add("hidden");
    }
  }

  updateCountdown(data);
  updateStats(data);
}

export { isDone } from "./utils.js";
