import { CHALLENGE_DAYS, COMMITMENT_START_WEEK, DAY_MS, DELAY_PENALTY } from "./constants.js";
import { challengeNumber, challengeStartDate } from "./challengeMeta.js";
import {
  getCompletedAt,
  getProgramAbsoluteDay,
  isDone,
  itemWeek,
  startOfDay,
  startOfLocalDay,
  weekName
} from "./utils.js";
import { getProgramDayGroups, isProgramDayComplete, workoutOnly } from "./progress.js";

function groupByChallengeAndKey(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

// عدد التحديات المكتملة بالكامل - يُستخدم لبناء الملخص العام (public-profiles)
// ولصفحة Hall of Fame.
export function countCompletedChallenges(data, done) {
  const groups = groupByChallengeAndKey(data, item => Number(item.challenge || 1));
  return Object.values(groups).filter(items =>
    items.length > 0 && items.every(item => isDone(done[item.id]))
  ).length;
}

// أسرع أسبوع تم إنجازه بالكامل (بالأيام) - نفس الاستخدام أعلاه.
export function getFastestCompletedWeek(data, done) {
  const groups = groupByChallengeAndKey(data, item => `${Number(item.challenge || 1)}-${Number(item.week || 1)}`);

  const completed = Object.values(groups)
    .map(items => {
      if (!items.length || !items.every(item => isDone(done[item.id]))) return null;

      const dates = items.map(item => getCompletedAt(done[item.id])).filter(Boolean);
      if (dates.length !== items.length) return null;

      const expectedDates = items.map(getExpectedDate).filter(Boolean);
      const start = expectedDates.length ? new Date(Math.min(...expectedDates.map(date => date.getTime()))) : dates[0];
      const end = new Date(Math.max(...dates.map(date => date.getTime())));
      const elapsedDays = Math.max(1, Math.ceil((end - start) / DAY_MS) + 1);
      const sample = items[0];

      return {
        elapsedDays,
        label: `${weekName(sample.week)} - التحدي ${Number(sample.challenge || 1)}`
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.elapsedDays - b.elapsedDays);

  return completed[0] || null;
}

export function getExpectedDate(item) {
  const absoluteDay = getProgramAbsoluteDay(item);
  if (absoluteDay <= 0) return null;

  const start = startOfLocalDay(challengeStartDate(challengeNumber(item)));
  start.setDate(start.getDate() + absoluteDay - 1);
  return start;
}

export function isFutureProgramDay(item) {
  const expectedDate = getExpectedDate(item);
  if (!expectedDate) return false;
  return startOfLocalDay(expectedDate).getTime() > startOfLocalDay(new Date()).getTime();
}

export function isFutureProgramDayItems(items) {
  return items.length > 0 && isFutureProgramDay(items[0]);
}

export function getTodayAbsoluteDay(challenge) {
  const start = startOfLocalDay(challengeStartDate(challenge));
  const today = startOfLocalDay(new Date());
  return Math.floor((today - start) / DAY_MS) + 1;
}

export function getMissionItemsForChallenge(data, challenge, done = {}) {
  const todayAbsoluteDay = getTodayAbsoluteDay(challenge);
  const challengeItems = data.filter(item => challengeNumber(item) === Number(challenge));
  const sortItems = items => items
    .slice()
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ar"));

  const todayItems = challengeItems.filter(item => getProgramAbsoluteDay(item) === todayAbsoluteDay);
  if (todayItems.length > 0) return sortItems(todayItems);

  const absoluteDays = [...new Set(challengeItems.map(getProgramAbsoluteDay).filter(Boolean))]
    .sort((a, b) => a - b);

  for (const absoluteDay of absoluteDays) {
    const dayItems = challengeItems.filter(item => getProgramAbsoluteDay(item) === absoluteDay);
    if (isFutureProgramDayItems(dayItems)) continue;
    if (!dayItems.every(item => isDone(done[item.id]))) return sortItems(dayItems);
  }

  return [];
}

export function getChallengeTotalDays(data, challenge) {
  const days = data
    .filter(item => challengeNumber(item) === Number(challenge))
    .map(getProgramAbsoluteDay)
    .filter(Boolean);
  return Math.max(0, ...days);
}

export function getJourneyInfo(data, challenge) {
  const totalDays = getChallengeTotalDays(data, challenge) || CHALLENGE_DAYS;
  const today = Math.max(1, Math.min(totalDays, getTodayAbsoluteDay(challenge)));
  const percent = totalDays ? Math.round((today / totalDays) * 100) : 0;
  return { today, totalDays, percent };
}

export function calcCommitmentPercent(items, done) {
  const completedItems = workoutOnly(items).filter(item => isDone(done[item.id]));
  if (completedItems.length === 0) return 100;

  const scores = completedItems
    .map(item => getCommitmentScore(item, done))
    .filter(score => score !== null);

  if (scores.length === 0) return 100;

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function getCommitmentScore(item, done) {
  const record = done[item.id];
  if (!isDone(record)) return null;

  if (itemWeek(item) < COMMITMENT_START_WEEK) return 100;

  const completedAt = getCompletedAt(record);
  if (!completedAt) return 100;

  const expectedDate = getExpectedDate(item);
  if (!expectedDate) return 100;

  const delayDays = Math.max(0, Math.floor((startOfDay(completedAt) - startOfDay(expectedDate)) / DAY_MS));
  return Math.max(0, 100 - (delayDays * DELAY_PENALTY));
}

export function isProgramDayOnTime(dayGroup, done) {
  return isProgramDayComplete(dayGroup, done) &&
    dayGroup.items.every(item => getCommitmentScore(item, done) === 100);
}

export function calcCommitmentStreak(data, done) {
  const groups = getProgramDayGroups(data);
  const byChallenge = groups.reduce((map, group) => {
    const key = String(group.challenge);
    if (!map[key]) map[key] = [];
    map[key].push(group);
    return map;
  }, {});

  return Object.values(byChallenge).reduce((best, challengeGroups) => {
    let streak = 0;
    let bestForChallenge = 0;
    let previousAbsoluteDay = null;

    challengeGroups.forEach(group => {
      const isConsecutive = previousAbsoluteDay === null || group.absoluteDay === previousAbsoluteDay + 1;

      if (isProgramDayOnTime(group, done)) {
        streak = isConsecutive ? streak + 1 : 1;
        bestForChallenge = Math.max(bestForChallenge, streak);
      } else {
        streak = 0;
      }

      previousAbsoluteDay = group.absoluteDay;
    });

    return Math.max(best, bestForChallenge);
  }, 0);
}
