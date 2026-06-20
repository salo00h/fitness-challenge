import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
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
const COLLECTION_NAME = "exercises";
let currentWeek = 1;
let cachedData = [];

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


function getDone() { return JSON.parse(localStorage.getItem(DONE_KEY) || "{}"); }
function saveDone(done) { localStorage.setItem(DONE_KEY, JSON.stringify(done)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

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

  const actualDays = [
    ...new Set(
      cachedData
        .map(x => Number(x.programDay))
        .filter(n => !isNaN(n))
    )
  ];

  const totalDays = actualDays.length || CHALLENGE_DAYS;

  const done = getDone();
  const completedDays = actualDays.filter(day => {
    const dayItems = cachedData.filter(x => Number(x.programDay) === Number(day));
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
  const done = getDone();
  const wasDone = !!done[id];
  done[id] = !done[id];
  saveDone(done);

  if (!wasDone) playDing();

  const allData = await getData();
  const percent = calcPercent(allData, done);
  if (!wasDone && percent === 100 && workoutOnly(allData).length > 0) {
    setTimeout(confetti, 150);
  }

  await renderViewer();
}

async function renderViewer() {
  const daysBox = document.getElementById("days");
  const weekTitle = document.getElementById("weekTitle");
  if (!daysBox || !weekTitle) return;

  const done = getDone();
  weekTitle.textContent = weekName(currentWeek);

  document.getElementById("prevWeek").onclick = async () => {
    if (currentWeek > 1) currentWeek--;
    await renderViewer();
  };

  document.getElementById("nextWeek").onclick = async () => {
    currentWeek++;
    await renderViewer();
  };

  daysBox.innerHTML = `<div class="empty card">جاري تحميل التمارين...</div>`;

  const allData = await getData();
  updateProgressBoard(allData);

  const data = allData
    .filter(x => Number(x.week) === Number(currentWeek))
    .sort((a, b) => Number(a.programDay) - Number(b.programDay));

  if (data.length === 0) {
    daysBox.innerHTML = `<div class="empty card">لا توجد تمارين في ${weekName(currentWeek)}. أضفها من صفحة الإعدادات.</div>`;
    return;
  }

  const grouped = {};
  data.forEach(item => {
    if (!grouped[item.programDay]) grouped[item.programDay] = [];
    grouped[item.programDay].push(item);
  });

  daysBox.innerHTML = Object.keys(grouped)
    .sort((a, b) => a - b)
    .map(day => {
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
            </div>
            <span class="week-label">${weekName(currentWeek)}</span>
          </div>

          ${allRest
          ? `
                <div class="rest">
                  <div>يوم راحة 🌸</div>
                  <button
                    class="done-btn ${done[restItem.id] ? "is-done" : ""}"
                    onclick="toggleDone('${restItem.id}')">
                    ${done[restItem.id] ? "تم الإنجاز ✓" : "تم إنجاز يوم الراحة"}
                  </button>
                </div>
              `
          : ""
        }

          <div class="exercises">
            ${items
          .map(item =>
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

                        <button
                          class="done-btn ${done[item.id] ? "is-done" : ""}"
                          onclick="toggleDone('${item.id}')">
                          ${done[item.id] ? "تم الإنجاز ✓" : "تم إنجاز التمرين"}
                        </button>
                      </div>
                    </div>
                  `
          )
          .join("")}
          </div>
        </article>
      `;
    })
    .join("");

  updateProgressBoard(allData);
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
    Number(a.week) - Number(b.week) || Number(a.programDay) - Number(b.programDay)
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
        <div class="small">${weekName(item.week)} - ${dayName(item.programDay)} - ${item.duration ? item.duration + " دقيقة" : "بدون مدة"}</div>
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
  saveDone(done);

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

if (document.getElementById("days")) {
  renderViewer();
}

if (document.getElementById("exerciseForm")) {
  initAdmin();
}
