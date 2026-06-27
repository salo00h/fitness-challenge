import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  db
} from "./firebase.js";
import {
  CHALLENGE_META_TYPE,
  COLLECTION_NAME,
  DEFAULT_CHALLENGE_START_DATE
} from "./constants.js";
import { state } from "./state.js";
import {
  escapeHtml,
  formatLocalDate,
  getProgramAbsoluteDay,
  normalizeDateInput,
  parseLocalDate,
  startOfLocalDay,
  toArabicOrdinal
} from "./utils.js";

// Challenge Meta
export async function getData() {
  const snap = await getDocs(collection(db, COLLECTION_NAME));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  state.cachedChallengeMeta = docs
    .filter(isChallengeMeta)
    .reduce((meta, item) => {
      meta[String(challengeNumber(item))] = item;
      return meta;
    }, {});
  state.cachedData = docs.filter(item => !isChallengeMeta(item));
  return state.cachedData;
}

export async function saveExercise(item) {
  await setDoc(doc(db, COLLECTION_NAME, item.id), item);
}

export async function deleteExercise(id) {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
}

export function challengeMetaId(challenge) {
  return `challenge_meta_${Number(challenge) || 1}`;
}

export function isChallengeMeta(item) {
  return item && item.type === CHALLENGE_META_TYPE;
}

export function getChallengeMeta(challenge) {
  return state.cachedChallengeMeta[String(Number(challenge) || 1)] || {};
}

export async function saveChallengeMeta(challenge, data) {
  const number = Number(challenge) || 1;
  const item = {
    id: challengeMetaId(number),
    type: CHALLENGE_META_TYPE,
    challenge: number,
    image: String(data.image || "").trim(),
    imageX: clampImageNumber(data.imageX, 0, 100, 50),
    imageY: clampImageNumber(data.imageY, 0, 100, 50),
    imageZoom: clampImageNumber(data.imageZoom, 60, 170, 100),
    startDate: normalizeDateInput(data.startDate) || "",
    description: String(data.description || "").trim(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, COLLECTION_NAME, item.id), item);
  state.cachedChallengeMeta[String(number)] = item;
}

export async function deleteChallengeMeta(challenge) {
  const number = Number(challenge) || 1;
  await deleteDoc(doc(db, COLLECTION_NAME, challengeMetaId(number)));
  delete state.cachedChallengeMeta[String(number)];
}

export function challengeNumber(item) {
  return Number(item.challenge || 1);
}

export function challengeName(n) {
  return `التحدي ${toArabicOrdinal(n)}`;
}

export function getChallengeWeek(challenge) {
  const key = String(challenge);
  if (!state.currentWeeksByChallenge[key]) state.currentWeeksByChallenge[key] = 1;
  return state.currentWeeksByChallenge[key];
}

export function setChallengeWeek(challenge, week) {
  state.currentWeeksByChallenge[String(challenge)] = Math.max(1, Number(week) || 1);
}

export function challengeStartDate(challenge = 1) {
  const number = Number(challenge) || 1;
  const meta = getChallengeMeta(number);
  const savedStartDate = normalizeDateInput(meta.startDate);

  if (savedStartDate) {
    return parseLocalDate(savedStartDate);
  }

  if (!state.warnedDefaultStartDates.has(number)) {
    console.warn("No startDate found for challenge, using default", {
      challenge: number,
      defaultStartDate: DEFAULT_CHALLENGE_START_DATE
    });
    state.warnedDefaultStartDates.add(number);
  }

  return parseLocalDate(DEFAULT_CHALLENGE_START_DATE);
}

export function debugChallengeLock(challenge, week, day) {
  const item = {
    challenge: Number(challenge) || 1,
    week: Number(week) || 1,
    programDay: Number(day) || 1
  };
  const absoluteDay = getProgramAbsoluteDay(item);
  const startDate = challengeStartDate(item.challenge);
  const expectedDate = startOfLocalDay(startDate);
  expectedDate.setDate(expectedDate.getDate() + absoluteDay - 1);
  const today = startOfLocalDay(new Date());
  const isFuture = expectedDate.getTime() > today.getTime();
  const debugInfo = {
    challenge: item.challenge,
    week: item.week,
    day: item.programDay,
    absoluteDay,
    challengeStartDate: startDate ? formatLocalDate(startDate) : null,
    expectedDate: expectedDate ? formatLocalDate(expectedDate) : null,
    today: formatLocalDate(today),
    isFuture
  };

  console.table(debugInfo);
  return debugInfo;
}

export function clampImageNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function getChallengeImageStyle(meta = {}) {
  const x = clampImageNumber(meta.imageX, 0, 100, 50);
  const y = clampImageNumber(meta.imageY, 0, 100, 50);
  const zoom = clampImageNumber(meta.imageZoom, 60, 170, 100) / 100;
  return `object-position:${x}% ${y}%;transform-origin:${x}% ${y}%;transform:scale(${zoom});`;
}

export function challengePlaceholder(challenge) {
  const name = escapeHtml(challengeName(challenge));
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='900' height='360' viewBox='0 0 900 360'>
      <defs>
        <linearGradient id='g' x1='0' x2='1'>
          <stop offset='0' stop-color='#ff2f7d'/>
          <stop offset='1' stop-color='#ff8ab5'/>
        </linearGradient>
      </defs>
      <rect width='900' height='360' rx='40' fill='url(#g)'/>
      <circle cx='120' cy='40' r='105' fill='rgba(255,255,255,.18)'/>
      <circle cx='790' cy='330' r='120' fill='rgba(255,255,255,.18)'/>
      <text x='450' y='170' text-anchor='middle' font-family='Tahoma, Arial' font-size='58' font-weight='700' fill='white'>${name}</text>
      <text x='450' y='220' text-anchor='middle' font-family='Tahoma, Arial' font-size='24' fill='white'>Fitness Challenge</text>
      <rect x='620' y='245' width='210' height='58' rx='29' fill='rgba(17,24,39,.55)'/>
      <text x='725' y='283' text-anchor='middle' font-family='Tahoma, Arial' font-size='30' font-weight='700' fill='white'>${name}</text>
    </svg>
  `);
}
