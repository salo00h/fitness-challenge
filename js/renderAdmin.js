import { collection, db, doc, getDocs, setDoc } from "./firebase.js";
import { DEFAULT_CHALLENGE_START_DATE, USERS_COLLECTION } from "./constants.js";
import { state } from "./state.js";
import { getDone, saveDone } from "./auth.js";
import {
  challengeName,
  challengeNumber,
  challengePlaceholder,
  deleteChallengeMeta,
  deleteExercise,
  getChallengeImageStyle,
  getChallengeMeta,
  getData,
  saveChallengeMeta,
  saveExercise
} from "./challengeMeta.js";
import {
  dayName,
  escapeHtml,
  formatDateTime,
  getYoutubeId,
  getYoutubeThumb,
  normalizeDateInput,
  normalizeUserName,
  uid,
  userDocId,
  weekName
} from "./utils.js";
import { showPop } from "./ui.js";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function compressImageFile(file) {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.86;
  let result = canvas.toDataURL("image/jpeg", quality);
  while (result.length > 850000 && quality > 0.56) {
    quality -= 0.08;
    result = canvas.toDataURL("image/jpeg", quality);
  }

  return result;
}

function getAdminChallengeNumbers() {
  const numbers = new Set([1, 2, 3, 4, 5]);
  state.cachedData.forEach(item => numbers.add(challengeNumber(item)));
  Object.keys(state.cachedChallengeMeta).forEach(challenge => numbers.add(Number(challenge)));
  return [...numbers].filter(Boolean).sort((a, b) => a - b);
}

function populateChallengeMetaOptions() {
  const select = document.getElementById("metaChallenge");
  if (!select) return;

  const current = Number(select.value) || 1;
  const numbers = getAdminChallengeNumbers();
  select.innerHTML = numbers
    .map(challenge => `<option value="${challenge}">${challengeName(challenge)}</option>`)
    .join("");
  select.value = numbers.includes(current) ? String(current) : String(numbers[0] || 1);
}

function updateChallengeImagePreview() {
  const select = document.getElementById("metaChallenge");
  const input = document.getElementById("challengeImage");
  const xInput = document.getElementById("challengeImageX");
  const yInput = document.getElementById("challengeImageY");
  const zoomInput = document.getElementById("challengeImageZoom");
  const preview = document.getElementById("challengeImagePreview");
  if (!select || !input || !preview) return;

  const challenge = Number(select.value) || 1;
  const image = input.value.trim() || challengePlaceholder(challenge);
  const imageStyle = getChallengeImageStyle({
    imageX: xInput?.value,
    imageY: yInput?.value,
    imageZoom: zoomInput?.value
  });
  preview.innerHTML = `
    <img src="${escapeHtml(image)}" alt="${challengeName(challenge)}" style="${imageStyle}">
    <span>${challengeName(challenge)}</span>
  `;
}

function fillChallengeMetaForm(challenge) {
  const select = document.getElementById("metaChallenge");
  const imageInput = document.getElementById("challengeImage");
  const fileInput = document.getElementById("challengeImageFile");
  const startDateInput = document.getElementById("challengeStartDate");
  const xInput = document.getElementById("challengeImageX");
  const yInput = document.getElementById("challengeImageY");
  const zoomInput = document.getElementById("challengeImageZoom");
  const descriptionInput = document.getElementById("challengeDescription");
  if (!select || !imageInput || !descriptionInput) return;

  const number = Number(challenge) || 1;
  const meta = getChallengeMeta(number);
  select.value = String(number);
  imageInput.value = meta.image || "";
  if (fileInput) fileInput.value = "";
  if (startDateInput) startDateInput.value = normalizeDateInput(meta.startDate) || DEFAULT_CHALLENGE_START_DATE;
  if (xInput) xInput.value = Number.isFinite(Number(meta.imageX)) ? meta.imageX : 50;
  if (yInput) yInput.value = Number.isFinite(Number(meta.imageY)) ? meta.imageY : 50;
  if (zoomInput) zoomInput.value = Number.isFinite(Number(meta.imageZoom)) ? meta.imageZoom : 100;
  descriptionInput.value = meta.description || "";
  updateChallengeImagePreview();
}

function renderChallengeMetaList() {
  const list = document.getElementById("challengeMetaList");
  if (!list) return;

  populateChallengeMetaOptions();

  list.innerHTML = getAdminChallengeNumbers().map(challenge => {
    const meta = getChallengeMeta(challenge);
    const image = meta.image || challengePlaceholder(challenge);
    const description = meta.description || "لم يتم إضافة وصف بعد";
    const startDate = normalizeDateInput(meta.startDate) || DEFAULT_CHALLENGE_START_DATE;
    const imageStyle = getChallengeImageStyle(meta);

    return `
      <article class="challenge-meta-card">
        <img src="${escapeHtml(image)}" alt="${challengeName(challenge)}" style="${imageStyle}">
        <div>
          <strong>${challengeName(challenge)}</strong>
          <small>بداية التحدي: ${escapeHtml(startDate)}</small>
          <p>${escapeHtml(description)}</p>
        </div>
        <button type="button" onclick="editChallengeMeta(${challenge})">تعديل</button>
      </article>
    `;
  }).join("");
}

export function editChallengeMeta(challenge) {
  populateChallengeMetaOptions();
  fillChallengeMetaForm(challenge);

  const box = document.querySelector(".challenge-settings");
  if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Admin
function initChallengeMetaAdmin() {
  const form = document.getElementById("challengeMetaForm");
  if (!form) return;

  const select = document.getElementById("metaChallenge");
  const imageInput = document.getElementById("challengeImage");
  const fileInput = document.getElementById("challengeImageFile");
  const startDateInput = document.getElementById("challengeStartDate");
  const xInput = document.getElementById("challengeImageX");
  const yInput = document.getElementById("challengeImageY");
  const zoomInput = document.getElementById("challengeImageZoom");
  const clearBtn = document.getElementById("clearChallengeMeta");

  select.addEventListener("change", () => fillChallengeMetaForm(select.value));
  imageInput.addEventListener("input", updateChallengeImagePreview);
  [xInput, yInput, zoomInput].forEach(input => {
    if (input) input.addEventListener("input", updateChallengeImagePreview);
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const oldPlaceholder = imageInput.placeholder;
    imageInput.placeholder = "جاري تجهيز الصورة...";
    try {
      imageInput.value = await compressImageFile(file);
      updateChallengeImagePreview();
      showPop("تم تجهيز الصورة بنجاح");
    } catch (e) {
      imageInput.value = "";
      showPop("تعذر رفع الصورة. جرّبي صورة أخرى.", "error");
      updateChallengeImagePreview();
    } finally {
      imageInput.placeholder = oldPlaceholder;
    }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const challenge = Number(select.value) || 1;
    await saveChallengeMeta(challenge, {
      image: imageInput.value,
      imageX: xInput?.value,
      imageY: yInput?.value,
      imageZoom: zoomInput?.value,
      startDate: startDateInput?.value,
      description: document.getElementById("challengeDescription").value
    });

    renderChallengeMetaList();
    fillChallengeMetaForm(challenge);
    showPop("تم حفظ بيانات التحدي بنجاح");
  });

  clearBtn.addEventListener("click", async () => {
    const challenge = Number(select.value) || 1;
    if (!confirm(`مسح صورة ووصف ${challengeName(challenge)}؟`)) return;

    await deleteChallengeMeta(challenge);
    renderChallengeMetaList();
    fillChallengeMetaForm(challenge);
    showPop("تم مسح بيانات التحدي");
  });

  renderChallengeMetaList();
  fillChallengeMetaForm(select.value || 1);
}

// Admin
export async function initAdmin() {
  const form = document.getElementById("exerciseForm");
  if (!form) return;

  initChallengeMetaAdmin();

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
    showPop(editId ? "تم تعديل التمرين بنجاح" : "تم حفظ التمرين بنجاح");

    form.reset();
    previewBox.innerHTML = "";
    document.getElementById("editId").value = "";

    await renderAdminList();
  });

  document.getElementById("cancelEdit").onclick = () => {
    form.reset();
    previewBox.innerHTML = "";
    document.getElementById("editId").value = "";
    showPop("تم إلغاء التعديل");
  };

  document.getElementById("clearAll").onclick = async () => {
    if (confirm("هل تريد حذف كل التمارين من Firebase؟")) {
      const data = await getData();

      for (const item of data) {
        await deleteExercise(item.id);
      }

      await renderAdminList();
      showPop("تم حذف كل التمارين");
    }
  };

  await renderAdminList();
  await renderAdminParticipants();
}

export async function renderAdminList() {
  const list = document.getElementById("adminList");
  if (!list) return;

  list.innerHTML = `<div class="empty card">جاري تحميل التمارين...</div>`;

  const data = (await getData()).sort((a, b) =>
    challengeNumber(a) - challengeNumber(b) ||
    Number(a.week) - Number(b.week) ||
    Number(a.programDay) - Number(b.programDay)
  );
  renderChallengeMetaList();
  fillChallengeMetaForm(document.getElementById("metaChallenge")?.value || 1);

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

export async function renderAdminParticipants() {
  const box = document.getElementById("adminParticipantsBoard");
  if (!box) return;

  box.innerHTML = `<div class="empty card">جاري تحميل المشاركات...</div>`;

  const snap = await getDocs(collection(db, USERS_COLLECTION));
  const users = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(user => user.name)
    .sort((a, b) => normalizeUserName(a.name).localeCompare(normalizeUserName(b.name), "ar"));

  if (users.length === 0) {
    box.innerHTML = `<div class="empty card">لا توجد مشاركات حتى الآن.</div>`;
    return;
  }

  box.innerHTML = users.map(user => {
    const name = normalizeUserName(user.name);
    const protectedText = user.passwordHash ? "محمي" : "يحتاج كلمة مرور";
    const protectedClass = user.passwordHash ? "is-safe" : "is-warning";

    return `
      <article class="admin-participant-item">
        <div>
          <strong>${escapeHtml(name)}</strong>
          <span class="${protectedClass}">${protectedText}</span>
        </div>
        <div class="admin-participant-meta">
          <span>آخر دخول: ${formatDateTime(user.lastLoginAt)}</span>
        </div>
        <button type="button" class="ghost" onclick="resetParticipantPassword('${encodeURIComponent(name)}')">إعادة تعيين كلمة المرور</button>
      </article>
    `;
  }).join("");
}

export async function resetParticipantPassword(name) {
  const normalized = normalizeUserName(decodeURIComponent(name || ""));
  if (!normalized) return;
  if (!confirm(`إعادة تعيين كلمة مرور ${normalized}؟`)) return;

  await setDoc(doc(db, USERS_COLLECTION, userDocId(normalized)), {
    name: normalized,
    passwordHash: "",
    passwordCreatedAt: "",
    passwordChangedAt: "",
    passwordResetAt: new Date().toISOString()
  }, { merge: true });

  state.cachedParticipants = null;
  await renderAdminParticipants();
  showPop("تمت إعادة تعيين كلمة المرور. ستنشئ المشاركة كلمة مرور جديدة عند الدخول القادم.");
}

export function editItem(id) {
  const item = state.cachedData.find(x => x.id === id);
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

export async function deleteItemFromAdmin(id) {
  if (!confirm("حذف هذا التمرين؟")) return;
  await deleteExercise(id);

  const done = getDone();
  delete done[id];
  await saveDone(done);

  await renderAdminList();
  showPop("تم حذف التمرين");
}
