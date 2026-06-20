const KEY = "fitness_program_v3_weeks_days";
const DONE_KEY = "fitness_program_done_v1";
let currentWeek = 1;

function getData() { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
function saveData(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
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

function updateProgressBoard() {
  const data = getData();
  const done = getDone();

  const weekItems = data.filter(x => Number(x.week) === Number(currentWeek));
  const monthItems = data.filter(x => Number(x.week) >= 1 && Number(x.week) <= 4);
  const challengeItems = data;

  setProgress("weekPercent", "weekBar", calcPercent(weekItems, done));
  setProgress("monthPercent", "monthBar", calcPercent(monthItems, done));
  setProgress("challengePercent", "challengeBar", calcPercent(challengeItems, done));
}

function toggleDone(id) {
  const done = getDone();
  done[id] = !done[id];
  saveDone(done);
  renderViewer();
}

function renderViewer() {
  const daysBox = document.getElementById("days");
  const weekTitle = document.getElementById("weekTitle");
  const done = getDone();

  weekTitle.textContent = weekName(currentWeek);

  document.getElementById("prevWeek").onclick = () => {
    if (currentWeek > 1) currentWeek--;
    renderViewer();
  };

  document.getElementById("nextWeek").onclick = () => {
    currentWeek++;
    renderViewer();
  };

  const data = getData()
    .filter(x => Number(x.week) === Number(currentWeek))
    .sort((a, b) => (Number(a.programDay) - Number(b.programDay)));

  updateProgressBoard();

  if (data.length === 0) {
    daysBox.innerHTML = `<div class="empty card">لا توجد تمارين في ${weekName(currentWeek)}. أضفها من صفحة الإعدادات.</div>`;
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
            <span class="day-progress">إنجاز اليوم: ${dayPercent}%</span>
          </div>
          <span class="week-label">${weekName(currentWeek)}</span>
        </div>

        ${allRest ? `<div class="rest">يوم راحة 🌸</div>` : ""}

        <div class="exercises">
          ${items.map(item => item.type === "rest" ? "" : `
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
          `).join("")}
        </div>
      </article>
    `;
  }).join("");

  updateProgressBoard();
}

function initAdmin() {
  const form = document.getElementById("exerciseForm");
  const youtubeInput = document.getElementById("youtube");
  const previewBox = document.getElementById("previewBox");

  youtubeInput.addEventListener("input", () => {
    const url = youtubeInput.value.trim();
    const id = getYoutubeId(url);
    previewBox.innerHTML = id ? `<img src="${getYoutubeThumb(url)}" alt="معاينة صورة اليوتيوب">` : "";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const editId = document.getElementById("editId").value;
    let data = getData();

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

    if (editId) data = data.map(x => x.id === editId ? item : x);
    else data.push(item);

    saveData(data);
    form.reset();
    previewBox.innerHTML = "";
    document.getElementById("editId").value = "";
    renderAdminList();
  });

  document.getElementById("cancelEdit").onclick = () => {
    form.reset();
    previewBox.innerHTML = "";
    document.getElementById("editId").value = "";
  };

  document.getElementById("clearAll").onclick = () => {
    if (confirm("هل تريد حذف كل البيانات؟")) {
      localStorage.removeItem(KEY);
      localStorage.removeItem(DONE_KEY);
      renderAdminList();
    }
  };

  renderAdminList();
}

function renderAdminList() {
  const list = document.getElementById("adminList");
  const data = getData().sort((a, b) =>
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
        <button class="danger" onclick="deleteItem('${item.id}')">حذف</button>
      </div>
    </div>
  `).join("");
}

function editItem(id) {
  const item = getData().find(x => x.id === id);
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

function deleteItem(id) {
  if (!confirm("حذف هذا التمرين؟")) return;
  saveData(getData().filter(x => x.id !== id));

  const done = getDone();
  delete done[id];
  saveDone(done);

  renderAdminList();
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
