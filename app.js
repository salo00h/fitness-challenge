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

// Ø¹Ø¯Ù„ Ù‡Ù†Ø§ Ø¹Ø¯Ø¯ Ø£ÙŠØ§Ù… Ø§Ù„ØªØ­Ø¯ÙŠ
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

function weekName(n) { return `Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ ${toArabicOrdinal(n)}`; }
function dayName(n) { return `Ø§Ù„ÙŠÙˆÙ… ${toArabicOrdinal(n)}`; }

function toArabicOrdinal(n) {
  const names = {
    1: "Ø§Ù„Ø£ÙˆÙ„", 2: "Ø§Ù„Ø«Ø§Ù†ÙŠ", 3: "Ø§Ù„Ø«Ø§Ù„Ø«", 4: "Ø§Ù„Ø±Ø§Ø¨Ø¹",
    5: "Ø§Ù„Ø®Ø§Ù…Ø³", 6: "Ø§Ù„Ø³Ø§Ø¯Ø³", 7: "Ø§Ù„Ø³Ø§Ø¨Ø¹", 8: "Ø§Ù„Ø«Ø§Ù…Ù†",
    9: "Ø§Ù„ØªØ§Ø³Ø¹", 10: "Ø§Ù„Ø¹Ø§Ø´Ø±"
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
  return data.filter(x => x.type !== "rest");
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
  } catch (e) {}
}

function confetti() {
  const emojis = ["ðŸŽ‰","âœ¨","ðŸ†","â­","ðŸ”¥","ðŸ’ª"];
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

  const start = challengeStartDate();
  const end = new Date(start);
  end.setDate(start.getDate() + CHALLENGE_DAYS);

  const now = new Date();
  const diff = end - now;
  const daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));

  box.textContent = `Ø¨Ø§Ù‚ÙŠ ${daysLeft} ÙŠÙˆÙ… Ø¹Ù„Ù‰ Ù†Ù‡Ø§ÙŠØ© Ø§Ù„ØªØ­Ø¯ÙŠ`;
}

function getCompletedWeeks(data, done) {
  const weeks = [...new Set(data.map(x => Number(x.week)))].sort((a,b)=>a-b);
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
      ? completedWeeks.map(w => `<span>â­ ${weekName(w)} Ù…ÙƒØªÙ…Ù„</span>`).join("")
      : `<span class="muted-star">Ø£ÙƒÙ…Ù„ Ø£Ø³Ø¨ÙˆØ¹ ÙƒØ§Ù…Ù„ Ù„ØªØ­ØµÙ„ Ø¹Ù„Ù‰ Ù†Ø¬Ù…Ø© â­</span>`;
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

  daysBox.innerHTML = `<div class="empty card">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªÙ…Ø§Ø±ÙŠÙ†...</div>`;

  const allData = await getData();
  updateProgressBoard(allData);

  const data = allData
    .filter(x => Number(x.week) === Number(currentWeek))
    .sort((a, b) => (Number(a.programDay) - Number(b.programDay)));

  if (data.length === 0) {
    daysBox.innerHTML = `<div class="empty card">Ù„Ø§ ØªÙˆØ¬Ø¯ ØªÙ…Ø§Ø±ÙŠÙ† ÙÙŠ ${weekName(currentWeek)}. Ø£Ø¶ÙÙ‡Ø§ Ù…Ù† ØµÙØ­Ø© Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª.</div>`;
    return;
  }

  const grouped = {};
  data.forEach(item => {
    if (!grouped[item.programDay]) grouped[item.programDay] = [];
    grouped[item.programDay].push(item);
  });

  daysBox.innerHTML = Object.keys(grouped).sort((a, b) => a - b).map(day => {
    const items = grouped[day];
    const allRest = items.every(i => i.type === "rest");
    const dayPercent = calcPercent(items, done);

    return `
      <article class="day-card">
        <div class="day-head">
          <div>
            <h2>${dayName(day)}</h2>
            <span class="day-progress">Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„ÙŠÙˆÙ…: ${dayPercent}%</span>
          </div>
          <span class="week-label">${weekName(currentWeek)}</span>
        </div>

        ${allRest ? `<div class="rest">ÙŠÙˆÙ… Ø±Ø§Ø­Ø© ðŸŒ¸</div>` : ""}

        <div class="exercises">
          ${items.map(item => item.type === "rest" ? "" : `
            <div class="exercise ${done[item.id] ? "completed" : ""}">
              <a href="${item.youtube || "#"}" target="_blank" rel="noopener">
                <div class="image-wrap">
                  <img src="${getYoutubeThumb(item.youtube)}" alt="${escapeHtml(item.title)}">
                  ${done[item.id] ? `<span class="done-ribbon">Ù…ÙƒØªÙ…Ù„ âœ“</span>` : ""}
                </div>
              </a>

              <div class="body">
                <span class="badge">${item.duration ? item.duration + " Ø¯Ù‚ÙŠÙ‚Ø©" : "Ø¨Ø¯ÙˆÙ† Ù…Ø¯Ø©"}</span>
                <h3>${escapeHtml(item.title)}</h3>
                ${item.notes ? `<div class="notes">${escapeHtml(item.notes)}</div>` : ""}
                <button class="done-btn ${done[item.id] ? "is-done" : ""}" onclick="toggleDone('${item.id}')">
                  ${done[item.id] ? "ØªÙ… Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² âœ“" : "ØªÙ… Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„ØªÙ…Ø±ÙŠÙ†"}
                </button>
              </div>
            </div>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");

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
    previewBox.innerHTML = id ? `<img src="${getYoutubeThumb(url)}" alt="Ù…Ø¹Ø§ÙŠÙ†Ø© ØµÙˆØ±Ø© Ø§Ù„ÙŠÙˆØªÙŠÙˆØ¨">` : "";
  });

  form.addEventListener("submit", async (e) => {
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
    if (confirm("Ù‡Ù„ ØªØ±ÙŠØ¯ Ø­Ø°Ù ÙƒÙ„ Ø§Ù„ØªÙ…Ø§Ø±ÙŠÙ† Ù…Ù† FirebaseØŸ")) {
      const data = await getData();
      for (const item of data) await deleteExercise(item.id);
      await renderAdminList();
    }
  };
await renderAdminList();
}


async function renderAdminList() {
  const list = document.getElementById("adminList");
  if (!list) return;

  list.innerHTML = `<div class="empty card">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªÙ…Ø§Ø±ÙŠÙ†...</div>`;

  const data = (await getData()).sort((a, b) =>
    Number(a.week) - Number(b.week) || Number(a.programDay) - Number(b.programDay)
  );

  if (data.length === 0) {
    list.innerHTML = `<div class="empty card">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ø­ØªÙ‰ Ø§Ù„Ø¢Ù†.</div>`;
    return;
  }

  list.innerHTML = data.map(item => `
    <div class="admin-item">
      <img src="${getYoutubeThumb(item.youtube)}" alt="">
      <div class="admin-info">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="small">${weekName(item.week)} - ${dayName(item.programDay)} - ${item.duration ? item.duration + " Ø¯Ù‚ÙŠÙ‚Ø©" : "Ø¨Ø¯ÙˆÙ† Ù…Ø¯Ø©"}</div>
        <div class="small">${item.type === "rest" ? "Ø±Ø§Ø­Ø©" : "ØªÙ…Ø±ÙŠÙ†"} ${item.youtube ? " - ÙŠÙˆØ¬Ø¯ Ø±Ø§Ø¨Ø· ÙŠÙˆØªÙŠÙˆØ¨" : ""}</div>
      </div>
      <div class="actions">
        <button onclick="editItem('${item.id}')">ØªØ¹Ø¯ÙŠÙ„</button>
        <button class="danger" onclick="deleteItemFromAdmin('${item.id}')">Ø­Ø°Ù</button>
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
  document.getElementById("previewBox").innerHTML = getYoutubeId(item.youtube) ? `<img src="${getYoutubeThumb(item.youtube)}" alt="Ù…Ø¹Ø§ÙŠÙ†Ø©">` : "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteItemFromAdmin(id) {
  if (!confirm("Ø­Ø°Ù Ù‡Ø°Ø§ Ø§Ù„ØªÙ…Ø±ÙŠÙ†ØŸ")) return;
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
        font-family='Arial' font-size='32' fill='#ff0b5f'>Ø±Ø§Ø¨Ø· ÙŠÙˆØªÙŠÙˆØ¨</text>
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

