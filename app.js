import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBhIIJTXoyI9ZowslTRGN5IDQ5qTgeuf1M",
  authDomain: "fitness-challenge-6061e.firebaseapp.com",
  projectId: "fitness-challenge-6061e",
  storageBucket: "fitness-challenge-6061e.firebasestorage.app",
  messagingSenderId: "623386176896",
  appId: "1:623386176896:web:e621094ad6359da608a565",
  measurementId: "G-GN16VR5B3B"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const LOCAL_KEY = "fitness_program_v3_weeks_days";
const DONE_KEY = "fitness_program_done_v1";
const USER_KEY = "fitness_current_user_v1";
const MIGRATION_KEY = "fitness_done_migrated_to_firebase_v1";
const COLLECTION_NAME = "exercises";
const USERS_COLLECTION = "participants";
let currentWeek = 1;
let currentWeeksByChallenge = {};
let activeChallenge = null;
let cachedData = [];
let currentUser = null;
let currentDone = {};

// عدل هنا عدد أيام التحدي
const CHALLENGE_DAYS = 30;

async function getData() {
  const snap = await getDocs(collection(db, COLLECTION_NAME));
  cachedData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return cachedData;
}

async function saveExercise(item) {
  await setDoc(doc(db, COLLECTION_NAME, item.id), item);
}

async function deleteExercise(id) {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
}

function normalizeUserName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function userDocId(name) {
  return encodeURIComponent(normalizeUserName(name).toLowerCase());
}

function getLocalDone() {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function getDone() { return currentDone || {}; }

async function saveDone(done) {
  currentDone = { ...done };
  localStorage.setItem(DONE_KEY, JSON.stringify(currentDone));

  if (!currentUser) return;

  await setDoc(doc(db, USERS_COLLECTION, userDocId(currentUser)), {
    name: currentUser,
    done: currentDone,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

function showUserLogin() {
  return new Promise(resolve => {
    const old = document.getElementById("userLoginOverlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "userLoginOverlay";
    overlay.className = "login-overlay";
    overlay.innerHTML = `
      <form class="login-card">
        <div class="login-icon">🔥</div>
        <h2>اختاري اسمك</h2>
        <p>سيتم حفظ تقدمك في Firebase، وستشاهدين تقدم المنافسة الأخرى.</p>
        <input id="loginName" required placeholder="مثال: سارة" autocomplete="name">
        <button type="submit">دخول للتحدي</button>
      </form>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("form").addEventListener("submit", e => {
      e.preventDefault();
      const name = normalizeUserName(document.getElementById("loginName").value);
      if (!name) return;
      overlay.remove();
      resolve(name);
    });
  });
}

async function ensureCurrentUser() {
  currentUser = normalizeUserName(localStorage.getItem(USER_KEY));

  if (!currentUser) {
    currentUser = await showUserLogin();
    localStorage.setItem(USER_KEY, currentUser);
  }

  const ref = doc(db, USERS_COLLECTION, userDocId(currentUser));
  const snap = await getDoc(ref);
  const firebaseDone = snap.exists() ? (snap.data().done || {}) : {};
  const localDone = getLocalDone();
  const migrationKey = `${MIGRATION_KEY}_${userDocId(currentUser)}`;

  // أول دخول بعد التحديث: ندمج إنجاز المتصفح القديم مع إنجاز Firebase حتى لا يضيع التقدم السابق.
  currentDone = localStorage.getItem(migrationKey)
    ? firebaseDone
    : { ...firebaseDone, ...localDone };

  await saveDone(currentDone);
  localStorage.setItem(migrationKey, "yes");

  renderUserBar();
}

function renderUserBar() {
  if (!currentUser || document.getElementById("currentUserBar")) return;

  const main = document.querySelector("main.container");
  if (!main) return;

  const box = document.createElement("section");
  box.id = "currentUserBar";
  box.className = "user-bar card";
  box.innerHTML = `
    <div>
      <span>المتسابقة الحالية</span>
      <strong>${escapeHtml(currentUser)}</strong>
    </div>
    <button type="button" class="ghost" id="switchUserBtn">تغيير الاسم</button>
  `;

  const hero = main.querySelector(".hero, .stats-hero");
  if (hero) hero.insertAdjacentElement("afterend", box);
  else main.prepend(box);

  document.getElementById("switchUserBtn").onclick = () => {
    localStorage.removeItem(USER_KEY);
    location.reload();
  };
}

function isCurrentUserName(name) {
  return normalizeUserName(name).toLowerCase() === normalizeUserName(currentUser).toLowerCase();
}

function getParticipantWeekScope(data) {
  const challengeNumbers = [...new Set(data.map(challengeNumber))].sort((a, b) => a - b);
  const fallbackChallenge = challengeNumbers.includes(1) ? 1 : (challengeNumbers[0] || 1);
  const challenge = activeChallenge || fallbackChallenge;
  const challengeData = data.filter(x => challengeNumber(x) === Number(challenge));
  const weeks = [...new Set(challengeData.map(x => Number(x.week)))].sort((a, b) => a - b);
  const selectedWeek = activeChallenge ? getChallengeWeek(challenge) : (weeks[0] || 1);
  const week = weeks.includes(Number(selectedWeek)) ? Number(selectedWeek) : (weeks[0] || Number(selectedWeek) || 1);

  return {
    weekData: challengeData.filter(x => Number(x.week) === Number(week)),
    weekLabel: `${challengeName(challenge)} - ${weekName(week)}`
  };
}

function calcUserStats(data, done) {
  const workouts = workoutOnly(data);
  const completed = workouts.filter(x => done[x.id]);
  const weekScope = getParticipantWeekScope(data);

  return {
    percent: calcPercent(workouts, done),
    completed: completed.length,
    total: workouts.length,
    minutes: completed.reduce((sum, x) => sum + (Number(x.duration) || 0), 0),
    weekPercent: calcPercent(weekScope.weekData, done),
    weekLabel: weekScope.weekLabel,
    completedWeeks: getCompletedWeeks(data, done).length
  };
}

async function renderParticipantsBoard(data) {
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

  const snap = await getDocs(collection(db, USERS_COLLECTION));
  const users = snap.docs
    .map(d => d.data())
    .filter(u => u.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));

  const visibleUsers = users
    .map(user => {
      const stats = calcUserStats(data, user.done || {});
      const isMe = isCurrentUserName(user.name);
      return { user, stats, isMe };
    })
    .filter(item => item.isMe || item.stats.percent > 0);

  if (visibleUsers.length === 0) {
    board.innerHTML = "";
    return;
  }

  board.innerHTML = `
    <h2>👭 تحدي البنات</h2>
    <div class="participants-grid">
      ${visibleUsers.map(({ user, stats, isMe }) => {
    return `
          <article class="participant-card ${isMe ? "is-me" : ""}">
            <div class="participant-head">
              <strong>${escapeHtml(user.name)}</strong>
              <span>${isMe ? "أنتِ" : "المنافسة"}</span>
            </div>

            <div class="participant-percent">${stats.percent}%</div>

            <div class="bar">
              <div style="width:${stats.percent}%"></div>
            </div>

            <div class="participant-meta">
              <span>✅ ${stats.completed} / ${stats.total} تمرين</span>
              <span>⏱ ${stats.minutes} دقيقة</span>
              <span>⭐ ${stats.completedWeeks} أسبوع</span>
              <span>📅 ${stats.weekLabel} ${stats.weekPercent}%</span>
            </div>
          </article>
        `;
  }).join("")}
    </div>
  `;
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function challengeNumber(item) {
  return Number(item.challenge || 1);
}

function challengeName(n) {
  return `التحدي ${toArabicOrdinal(n)}`;
}

function getChallengeWeek(challenge) {
  const key = String(challenge);
  if (!currentWeeksByChallenge[key]) currentWeeksByChallenge[key] = 1;
  return currentWeeksByChallenge[key];
}

function setChallengeWeek(challenge, week) {
  currentWeeksByChallenge[String(challenge)] = Math.max(1, Number(week) || 1);
}

async function openChallenge(challenge) {
  activeChallenge = Number(challenge) || 1;
  await renderViewer();

  const opened = document.querySelector(`[data-challenge="${activeChallenge}"]`);
  if (opened) {
    opened.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function closeChallenge() {
  activeChallenge = null;
  await renderViewer();
}


function weekName(n) { return `الأسبوع ${toArabicOrdinal(n)}`; }
function dayName(n) { return `اليوم ${toArabicOrdinal(n)}`; }

function toArabicOrdinal(n) {
  const names = {
    1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع",
    5: "الخامس", 6: "السادس", 7: "السابع", 8: "الثامن",
    9: "التاسع", 10: "العاشر"
  };
  return names[Number(n)] || n;
}

function getYoutubeId(url) {
  if (!url) return "";
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

function getYoutubeThumb(url) {
  const id = getYoutubeId(url);
  if (!id) return placeholder();
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

function workoutOnly(data) {
  return data;
}

function calcPercent(items, done) {
  const workouts = workoutOnly(items);
  if (workouts.length === 0) return 0;
  const complete = workouts.filter(x => done[x.id]).length;
  return Math.round((complete / workouts.length) * 100);
}

function setProgress(idPercent, idBar, percent) {
  const p = document.getElementById(idPercent);
  const b = document.getElementById(idBar);

  if (p) p.textContent = percent + "%";
  if (b) b.style.width = percent + "%";

  if (idPercent === "challengePercent") {
    const text = document.getElementById("challengePercentText");
    if (text) text.textContent = percent + "%";
  }
}

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) { }
}

function confetti() {
  const emojis = ["🎉", "✨", "🏆", "⭐", "🔥", "💪"];
  for (let i = 0; i < 35; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    piece.style.fontSize = (18 + Math.random() * 18) + "px";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2300);
  }
}

function challengeStartDate() {
  let start = localStorage.getItem("challenge_start_date");
  if (!start) {
    start = new Date().toISOString();
    localStorage.setItem("challenge_start_date", start);
  }
  return new Date(start);
}

function updateCountdown() {
  const box = document.getElementById("countdownText");
  if (!box) return;

  const dayKeys = [
    ...new Set(
      cachedData
        .map(x => `${Number(x.week)}-${Number(x.programDay)}`)
        .filter(key => !key.includes("NaN"))
    )
  ];

  const totalDays = dayKeys.length || CHALLENGE_DAYS;

  const done = getDone();

  const completedDays = dayKeys.filter(key => {
    const [week, day] = key.split("-").map(Number);

    const dayItems = cachedData.filter(x =>
      Number(x.week) === week &&
      Number(x.programDay) === day
    );

    return dayItems.length > 0 && dayItems.every(x => done[x.id]);
  }).length;

  const daysLeft = Math.max(0, totalDays - completedDays);

  box.textContent = `باقي ${daysLeft} يوم على نهاية التحدي`;
}

function getCompletedWeeks(data, done) {
  const weeks = [...new Set(data.map(x => Number(x.week)))].sort((a, b) => a - b);
  return weeks.filter(week => {
    const weekItems = workoutOnly(data.filter(x => Number(x.week) === week));
    return weekItems.length > 0 && weekItems.every(x => done[x.id]);
  });
}

function updateStats(data) {
  const done = getDone();
  const workouts = workoutOnly(data);
  const completed = workouts.filter(x => done[x.id]);
  const minutes = completed.reduce((sum, x) => sum + (Number(x.duration) || 0), 0);
  const completedWeeks = getCompletedWeeks(data, done);

  const doneCount = document.getElementById("doneCount");
  const doneMinutes = document.getElementById("doneMinutes");
  const doneWeeks = document.getElementById("doneWeeks");

  if (doneCount) doneCount.textContent = completed.length;
  if (doneMinutes) doneMinutes.textContent = minutes;
  if (doneWeeks) doneWeeks.textContent = completedWeeks.length;

  const weekStars = document.getElementById("weekStars");
  if (weekStars) {
    weekStars.innerHTML = completedWeeks.length
      ? completedWeeks.map(w => `<span>⭐ ${weekName(w)} مكتمل</span>`).join("")
      : `<span class="muted-star">أكمل أسبوع كامل لتحصل على نجمة ⭐</span>`;
  }
}

function updateProgressBoard(data) {
  const done = getDone();

  const weekItems = data.filter(x => Number(x.week) === Number(currentWeek));
  const monthItems = data.filter(x => Number(x.week) >= 1 && Number(x.week) <= 4);
  const challengeItems = data;
  const challengePercent = calcPercent(challengeItems, done);

  setProgress("weekPercent", "weekBar", calcPercent(weekItems, done));
  setProgress("monthPercent", "monthBar", calcPercent(monthItems, done));
  setProgress("challengePercent", "challengeBar", challengePercent);

  const trophy = document.getElementById("trophyBox");
  if (trophy) {
    if (challengePercent === 100 && workoutOnly(challengeItems).length > 0) {
      trophy.classList.remove("hidden");
    } else {
      trophy.classList.add("hidden");
    }
  }

  updateCountdown();
  updateStats(data);
}

async function toggleDone(id) {
  const scrollY = window.scrollY;

  const done = getDone();
  const wasDone = !!done[id];

  done[id] = !done[id];
  await saveDone(done);

  if (!wasDone) {
    playDing();
  }

  const allData = await getData();
  const currentItem = allData.find(x => x.id === id);

  if (!wasDone && currentItem) {
    const dayItems = allData.filter(x =>
      Number(x.week) === Number(currentItem.week) &&
      Number(x.programDay) === Number(currentItem.programDay)
    );

    const dayPercent = calcPercent(dayItems, done);

    if (dayPercent === 100) {
      setTimeout(confetti, 150);
    }
  }

  await renderViewer();

  window.scrollTo({
    top: scrollY,
    behavior: "instant"
  });

  if (document.getElementById("doneCount")) {
    updateProgressBoard(allData);
  }
}

async function renderViewer() {
  const daysBox = document.getElementById("days");
  if (!daysBox) return;

  const done = getDone();
  daysBox.innerHTML = `<div class="empty card">جاري تحميل التمارين...</div>`;

  const allData = await getData();
  updateProgressBoard(allData);

  if (allData.length === 0) {
    daysBox.innerHTML = `
      <div class="empty card">
        لا توجد تمارين حتى الآن. أضفها من صفحة الإعدادات.
      </div>
    `;
    return;
  }

  const challenges = [...new Set(allData.map(challengeNumber))].sort((a, b) => a - b);
  if (activeChallenge !== null && !challenges.includes(Number(activeChallenge))) {
    activeChallenge = null;
  }

  daysBox.innerHTML = challenges.map(challenge => {
    const challengeData = allData.filter(x => challengeNumber(x) === challenge);
    const savedWeek = getChallengeWeek(challenge);
    const weeks = [...new Set(challengeData.map(x => Number(x.week)))].sort((a, b) => a - b);
    const selectedWeek = weeks.includes(Number(savedWeek)) ? Number(savedWeek) : (weeks[0] || Number(savedWeek) || 1);
    if (Number(selectedWeek) !== Number(savedWeek)) {
      setChallengeWeek(challenge, selectedWeek);
    }

    const weekData = challengeData
      .filter(x => Number(x.week) === Number(selectedWeek))
      .sort((a, b) => Number(a.programDay) - Number(b.programDay));

    const challengePercent = calcPercent(challengeData, done);
    const challengeWorkouts = workoutOnly(challengeData);
    const completedCount = challengeWorkouts.filter(x => done[x.id]).length;
    const totalCount = challengeWorkouts.length;
    const weekPercent = calcPercent(weekData, done);
    const isOpen = Number(activeChallenge) === Number(challenge);

    const grouped = {};
    if (isOpen) {
      weekData.forEach(item => {
        if (!grouped[item.programDay]) grouped[item.programDay] = [];
        grouped[item.programDay].push(item);
      });
    }

    return `
      <section class="challenge-box card ${isOpen ? "is-open" : "is-closed"}" data-challenge="${challenge}">
        <div class="challenge-head">
          <div>
            <span class="challenge-kicker">🔥 برنامج مستقل</span>
            <h2>${challengeName(challenge)}</h2>
            <p>${completedCount} من ${totalCount} تمرين مكتمل</p>
          </div>

          <div class="challenge-progress">
            <strong>${challengePercent}%</strong>
            <span>إنجاز التحدي</span>
            <div class="bar"><div style="width:${challengePercent}%"></div></div>
          </div>
        </div>

        ${isOpen
        ? `
            <div class="challenge-actions">
              <button type="button" class="challenge-back-btn" onclick="closeChallenge()">رجوع للتحديات</button>
            </div>

            <div class="week-nav challenge-week-nav">
              <button type="button" onclick="changeChallengeWeek(${challenge}, -1)">الأسبوع السابق</button>
              <strong>${weekName(selectedWeek)} <small>(${weekPercent}%)</small></strong>
              <button type="button" onclick="changeChallengeWeek(${challenge}, 1)">الأسبوع التالي</button>
            </div>

            ${weekData.length === 0
          ? `<div class="empty card">لا توجد تمارين في ${weekName(selectedWeek)} داخل ${challengeName(challenge)}.</div>`
          : `<div class="challenge-days">
                  ${Object.keys(grouped).sort((a, b) => a - b).map(day => {
            const items = grouped[day];
            const allRest = items.every(i => i.type === "rest");
            const dayPercent = calcPercent(items, done);
            const restItem = items[0];

            return `
                      <article class="day-card">
                        <div class="day-head">
                          <div>
                            <h2>${dayName(day)}</h2>
                            <span class="day-progress">إنجاز اليوم: ${dayPercent}%</span>
                            <div class="day-progress-bar">
                              <div class="day-progress-fill" style="width:${dayPercent}%"></div>
                            </div>
                          </div>
                          <span class="week-label">${weekName(selectedWeek)}</span>
                        </div>

                        ${allRest
                ? `
                            <div class="rest">
                              <div>يوم راحة 🌸</div>
                              <button class="done-btn ${done[restItem.id] ? "is-done" : ""}" onclick="toggleDone('${restItem.id}')">
                                ${done[restItem.id] ? "تم الإنجاز ✓" : "تم إنجاز يوم الراحة"}
                              </button>
                            </div>
                          `
                : ""
              }

                        <div class="exercises">
                          ${items.map(item =>
                item.type === "rest"
                  ? ""
                  : `
                                <div class="exercise ${done[item.id] ? "completed" : ""}">
                                  <a href="${item.youtube || "#"}" target="_blank" rel="noopener">
                                    <div class="image-wrap">
                                      <img src="${getYoutubeThumb(item.youtube)}" alt="${escapeHtml(item.title)}">
                                      ${done[item.id] ? `<span class="done-ribbon">مكتمل ✓</span>` : ""}
                                    </div>
                                  </a>
                                  <div class="body">
                                    <span class="badge">${item.duration ? item.duration + " دقيقة" : "بدون مدة"}</span>
                                    <h3>${escapeHtml(item.title)}</h3>
                                    ${item.notes ? `<div class="notes">${escapeHtml(item.notes)}</div>` : ""}
                                    <button class="done-btn ${done[item.id] ? "is-done" : ""}" onclick="toggleDone('${item.id}')">
                                      ${done[item.id] ? "تم الإنجاز ✓" : "تم إنجاز التمرين"}
                                    </button>
                                  </div>
                                </div>
                              `
              ).join("")}
                        </div>
                      </article>
                    `;
          }).join("")}
                </div>`
        }
          `
        : `
            <button type="button" class="challenge-enter-btn" onclick="openChallenge(${challenge})">دخول التحدي</button>
          `
      }
      </section>
    `;
  }).join("");

  updateProgressBoard(allData);
  await renderParticipantsBoard(allData);
}

async function changeChallengeWeek(challenge, step) {
  const allData = cachedData.length ? cachedData : await getData();
  const challengeData = allData.filter(x => challengeNumber(x) === Number(challenge));
  const weeks = [...new Set(challengeData.map(x => Number(x.week)))].sort((a, b) => a - b);
  const minWeek = weeks.length ? Math.min(...weeks) : 1;
  const maxWeek = weeks.length ? Math.max(...weeks) : 1;
  const nextWeek = Math.min(maxWeek, Math.max(minWeek, getChallengeWeek(challenge) + Number(step)));
  setChallengeWeek(challenge, nextWeek);
  await renderViewer();
}

async function initAdmin() {
  const form = document.getElementById("exerciseForm");
  if (!form) return;

  const youtubeInput = document.getElementById("youtube");
  const previewBox = document.getElementById("previewBox");

  youtubeInput.addEventListener("input", () => {
    const url = youtubeInput.value.trim();
    const id = getYoutubeId(url);

    previewBox.innerHTML = id
      ? `<img src="${getYoutubeThumb(url)}" alt="معاينة صورة اليوتيوب">`
      : "";
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const editId = document.getElementById("editId").value;

    const item = {
      id: editId || uid(),
      title: document.getElementById("title").value.trim(),
      challenge: document.getElementById("challenge").value,
      week: document.getElementById("week").value,
      programDay: document.getElementById("programDay").value,
      duration: document.getElementById("duration").value.trim(),
      type: document.getElementById("type").value,
      youtube: youtubeInput.value.trim(),
      notes: document.getElementById("notes").value.trim()
    };

    await saveExercise(item);

    form.reset();
    previewBox.innerHTML = "";
    document.getElementById("editId").value = "";

    await renderAdminList();
  });

  document.getElementById("cancelEdit").onclick = () => {
    form.reset();
    previewBox.innerHTML = "";
    document.getElementById("editId").value = "";
  };

  document.getElementById("clearAll").onclick = async () => {
    if (confirm("هل تريد حذف كل التمارين من Firebase؟")) {
      const data = await getData();

      for (const item of data) {
        await deleteExercise(item.id);
      }

      await renderAdminList();
    }
  };

  await renderAdminList();
}


async function renderAdminList() {
  const list = document.getElementById("adminList");
  if (!list) return;

  list.innerHTML = `<div class="empty card">جاري تحميل التمارين...</div>`;

  const data = (await getData()).sort((a, b) =>
    challengeNumber(a) - challengeNumber(b) ||
    Number(a.week) - Number(b.week) ||
    Number(a.programDay) - Number(b.programDay)
  );

  if (data.length === 0) {
    list.innerHTML = `<div class="empty card">لا توجد بيانات حتى الآن.</div>`;
    return;
  }

  list.innerHTML = data.map(item => `
    <div class="admin-item">
      <img src="${getYoutubeThumb(item.youtube)}" alt="">
      <div class="admin-info">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="small">${challengeName(challengeNumber(item))} - ${weekName(item.week)} - ${dayName(item.programDay)} - ${item.duration ? item.duration + " دقيقة" : "بدون مدة"}</div>
        <div class="small">${item.type === "rest" ? "راحة" : "تمرين"} ${item.youtube ? " - يوجد رابط يوتيوب" : ""}</div>
      </div>
      <div class="actions">
        <button onclick="editItem('${item.id}')">تعديل</button>
        <button class="danger" onclick="deleteItemFromAdmin('${item.id}')">حذف</button>
      </div>
    </div>
  `).join("");
}

function editItem(id) {
  const item = cachedData.find(x => x.id === id);
  if (!item) return;

  document.getElementById("editId").value = item.id;
  document.getElementById("title").value = item.title;
  document.getElementById("challenge").value = item.challenge || 1;
  document.getElementById("week").value = item.week;
  document.getElementById("programDay").value = item.programDay;
  document.getElementById("duration").value = item.duration;
  document.getElementById("type").value = item.type;
  document.getElementById("youtube").value = item.youtube;
  document.getElementById("notes").value = item.notes;
  document.getElementById("previewBox").innerHTML = getYoutubeId(item.youtube) ? `<img src="${getYoutubeThumb(item.youtube)}" alt="معاينة">` : "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteItemFromAdmin(id) {
  if (!confirm("حذف هذا التمرين؟")) return;
  await deleteExercise(id);

  const done = getDone();
  delete done[id];
  await saveDone(done);

  await renderAdminList();
}

function placeholder() {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'>
      <rect width='100%' height='100%' fill='#ffe2ec'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
        font-family='Arial' font-size='32' fill='#ff0b5f'>رابط يوتيوب</text>
    </svg>
  `);
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

window.toggleDone = toggleDone;
window.editItem = editItem;
window.deleteItemFromAdmin = deleteItemFromAdmin;
window.changeChallengeWeek = changeChallengeWeek;
window.openChallenge = openChallenge;
window.closeChallenge = closeChallenge;

async function bootstrap() {
  if (document.getElementById("exerciseForm")) {
    initAdmin();
    return;
  }

  if (document.getElementById("days") || document.getElementById("doneCount")) {
    await ensureCurrentUser();
  }

  if (document.getElementById("days")) {
    await renderViewer();
  }

  if (document.getElementById("doneCount")) {
    const data = await getData();
    updateProgressBoard(data);
    await renderParticipantsBoard(data);
  }
}

bootstrap();
