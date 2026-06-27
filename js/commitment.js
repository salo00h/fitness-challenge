import { CHALLENGE_DAYS, COMMITMENT_START_WEEK, DAY_MS, DELAY_PENALTY } from "./constants.js";
import { challengeNumber, challengeStartDate } from "./challengeMeta.js";
import {
  getCompletedAt,
  getProgramAbsoluteDay,
  isDone,
  itemWeek,
  startOfDay,
  startOfLocalDay
} from "./utils.js";
import { getProgramDayGroups, isProgramDayComplete, workoutOnly } from "./progress.js";

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
