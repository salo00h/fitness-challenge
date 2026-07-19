import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "./firebase.js";
import {
  AUTH_EMAIL_DOMAIN,
  DONE_KEY,
  LEGACY_PARTICIPANTS_COLLECTION,
  MIGRATION_KEY,
  PUBLIC_PROFILES_COLLECTION,
  ROLES_COLLECTION,
  USERS_COLLECTION,
  USER_KEY,
  AVATARS
} from "./constants.js";
import { state } from "./state.js";
import { escapeHtml, normalizeUserName, userDocId } from "./utils.js";
import { getDefaultAvatar, renderGreetingMessage, showPop } from "./ui.js";
import { buildRecentDone, mergeDoneRecords, sanitizeDoneRecords } from "./progress.js";
import { countCompletedChallenges, getFastestCompletedWeek } from "./commitment.js";
import { calcUserStats } from "./participants.js";

// ---------------------------------------------------------------------------
// Firebase Authentication (Email/Password)
//
// المشروع لا يملك بريدًا إلكترونيًا حقيقيًا لكل مشاركة (فقط اسم)، لذلك نبني
// بريدًا اصطناعيًا ثابتًا ومشتقًا رياضيًا من الاسم (SHA-256) ليكون معرّف دخول
// صالح الصيغة لـ Firebase Auth. هذا البريد لا يُستخدم للتواصل إطلاقًا.
// ---------------------------------------------------------------------------
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveAuthEmail(name) {
  const normalized = normalizeUserName(name).toLowerCase();
  const hash = await sha256Hex(normalized);
  return `u${hash.slice(0, 32)}@${AUTH_EMAIL_DOMAIN}`;
}

export function isStrongEnoughPassword(password) {
  // 6 أحرف هو الحد الأدنى الافتراضي لكلمات مرور Firebase Authentication.
  return String(password || "").length >= 6;
}

function authErrorMessage(error) {
  const code = error && error.code;
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "الاسم أو كلمة المرور غير صحيحة";
  }
  if (code === "auth/email-already-in-use") {
    return "هذا الاسم مسجّل بالفعل، جرّبي تسجيل الدخول بدلًا من إنشاء حساب جديد";
  }
  if (code === "auth/weak-password") {
    return "كلمة المرور ضعيفة جدًا (6 أحرف على الأقل)";
  }
  if (code === "auth/network-request-failed") {
    return "تعذر الاتصال بالخادم، تحققي من الإنترنت";
  }
  return "حدث خطأ غير متوقع، حاولي مرة أخرى";
}

function waitForAuthState() {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

// نقل بيانات حساب قديم (قبل التفعيل الأمني) إلى حساب Firebase Auth الجديد.
// لا تُحذف الوثيقة القديمة أبدًا - تبقى كنسخة احتياطية دائمة.
async function claimLegacyProgress(uid, name) {
  try {
    const legacyId = userDocId(name);
    const legacyRef = doc(db, LEGACY_PARTICIPANTS_COLLECTION, legacyId);
    const legacySnap = await getDoc(legacyRef);
    if (!legacySnap.exists()) return null;

    const legacy = legacySnap.data();
    if (legacy.claimedBy) return null;

    const claimed = {
      name: normalizeUserName(legacy.name || name),
      avatar: legacy.avatar || "",
      done: legacy.done || {},
      lastLoginAt: new Date().toISOString(),
      claimedFromLegacyId: legacyId,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, USERS_COLLECTION, uid), claimed, { merge: true });

    try {
      await setDoc(legacyRef, { claimedBy: uid, claimedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn("تعذر تعليم الوثيقة القديمة كمُطالَب بها (قد تكون طولبت بالفعل)", e);
    }

    return claimed;
  } catch (e) {
    console.warn("لا توجد بيانات قديمة بهذا الاسم، سيبدأ حساب جديد فارغ", e);
    return null;
  }
}

export async function refreshAdminRole() {
  state.isAdminUser = false;
  if (!state.currentUserUid) return false;

  try {
    const snap = await getDoc(doc(db, ROLES_COLLECTION, state.currentUserUid));
    state.isAdminUser = !!(snap.exists() && snap.data().admin === true);
  } catch (e) {
    state.isAdminUser = false;
  }

  return state.isAdminUser;
}

export function clearUserSession() {
  localStorage.removeItem(USER_KEY);
}

export async function updateLastLogin() {
  if (!state.currentUserUid) return;
  const lastLoginAt = new Date().toISOString();
  await setDoc(doc(db, USERS_COLLECTION, state.currentUserUid), { lastLoginAt }, { merge: true });
  state.currentUserProfile = { ...(state.currentUserProfile || {}), lastLoginAt };
}

function doneStorageKey() {
  return `${DONE_KEY}_${state.currentUserUid || "anon"}`;
}

// ترحيل لطيف من المفتاح القديم المشترك (قبل ربط التخزين المحلي بكل UID) - مرة واحدة فقط.
function migrateLegacyLocalDone() {
  const scopedKey = doneStorageKey();
  if (!state.currentUserUid || localStorage.getItem(scopedKey)) return;

  const legacyRaw = localStorage.getItem(DONE_KEY);
  if (!legacyRaw) return;

  localStorage.setItem(scopedKey, legacyRaw);
  localStorage.removeItem(DONE_KEY);
}

export function getLocalDone() {
  migrateLegacyLocalDone();
  try {
    return JSON.parse(localStorage.getItem(doneStorageKey()) || "{}");
  } catch (e) {
    return {};
  }
}

export function getDone() {
  return state.currentDone || {};
}

async function ensureProgramDataForDoneSync() {
  if (state.cachedData.length) return;

  try {
    const { getData } = await import("./challengeMeta.js");
    await getData();
  } catch (e) {
    console.warn("Could not preload challenge data for done sync", e);
  }
}

export async function mirrorPublicProfile() {
  if (!state.currentUserUid) return;

  try {
    const done = state.currentDone || {};
    const stats = state.cachedData.length ? calcUserStats(state.cachedData, done) : null;

    const payload = {
      uid: state.currentUserUid,
      name: normalizeUserName(state.currentUser),
      avatar: (state.currentUserProfile && state.currentUserProfile.avatar) || getDefaultAvatar(state.currentUser),
      updatedAt: new Date().toISOString()
    };

    if (stats) {
      payload.publicStats = {
        ...stats,
        completedChallenges: countCompletedChallenges(state.cachedData, done),
        fastestWeek: getFastestCompletedWeek(state.cachedData, done)
      };
      payload.recentDone = buildRecentDone(state.cachedData, done);
    }

    await setDoc(doc(db, PUBLIC_PROFILES_COLLECTION, state.currentUserUid), payload, { merge: true });
  } catch (e) {
    console.warn("تعذر تحديث الملف العام (public-profiles)", e);
  }
}

export async function saveDone(done) {
  state.currentDone = sanitizeDoneRecords(done);
  localStorage.setItem(doneStorageKey(), JSON.stringify(state.currentDone));

  if (!state.currentUserUid) return;

  await setDoc(doc(db, USERS_COLLECTION, state.currentUserUid), {
    name: normalizeUserName(state.currentUser),
    done: state.currentDone,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  await mirrorPublicProfile();
}

function setLoginMode(refs, mode) {
  refs.mode.value = mode;
  refs.tabLogin.classList.toggle("is-active", mode === "login");
  refs.tabCreate.classList.toggle("is-active", mode === "create");
  refs.avatarFields.classList.toggle("hidden", mode !== "create");
  refs.confirmWrap.classList.toggle("hidden", mode !== "create");
  refs.setError("");

  if (mode === "login") {
    refs.title.textContent = "تسجيل الدخول";
    refs.message.textContent = "اكتبي اسمك وكلمة المرور للدخول.";
    refs.passwordInput.autocomplete = "current-password";
    refs.submit.textContent = "دخول";
  } else {
    refs.title.textContent = "حساب جديد";
    refs.message.textContent = "اكتبي اسمك وأنشئي كلمة مرور جديدة. إن كان لديك تقدم سابق بنفس الاسم سنعيده لك تلقائيًا.";
    refs.passwordInput.autocomplete = "new-password";
    refs.submit.textContent = "إنشاء الحساب";
  }
}

export function showUserLogin(prefillName = "") {
  return new Promise(resolve => {
    const old = document.getElementById("userLoginOverlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "userLoginOverlay";
    overlay.className = "login-overlay";
    overlay.innerHTML = `
      <form class="login-card account-login-card">
        <div class="login-icon">🔐</div>
        <h2 id="loginTitle">دخول المتسابقة</h2>
        <p id="loginMessage">اكتبي اسمك وكلمة المرور للدخول.</p>

        <div class="login-mode-tabs">
          <button type="button" id="loginTabLogin" class="is-active">تسجيل الدخول</button>
          <button type="button" id="loginTabCreate">حساب جديد</button>
        </div>
        <input type="hidden" id="loginMode" value="login">

        <label for="loginName">الاسم</label>
        <input id="loginName" required placeholder="مثال: سارة" autocomplete="name" value="${escapeHtml(prefillName)}">

        <div id="avatarFields" class="avatar-fields hidden">
          <label>اختاري صورتك الرمزية</label>
          <div class="avatar-options">
            ${AVATARS.map((avatar, index) => `
              <label class="avatar-option">
                <input type="radio" name="loginAvatar" value="${avatar}" ${index === 0 ? "checked" : ""}>
                <span>${avatar}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <div id="passwordFields" class="password-fields">
          <label for="loginPassword">كلمة المرور</label>
          <input id="loginPassword" type="password" autocomplete="current-password" placeholder="كلمة المرور" required>

          <div id="confirmPasswordWrap" class="hidden">
            <label for="loginPasswordConfirm">تأكيد كلمة المرور</label>
            <input id="loginPasswordConfirm" type="password" autocomplete="new-password" placeholder="أعيدي كتابة كلمة المرور">
          </div>
        </div>

        <div id="loginError" class="login-error"></div>

        <div class="login-actions">
          <button type="submit" id="loginSubmit">دخول</button>
        </div>
      </form>
    `;

    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const refs = {
      mode: document.getElementById("loginMode"),
      tabLogin: document.getElementById("loginTabLogin"),
      tabCreate: document.getElementById("loginTabCreate"),
      avatarFields: document.getElementById("avatarFields"),
      confirmWrap: document.getElementById("confirmPasswordWrap"),
      passwordInput: document.getElementById("loginPassword"),
      title: document.getElementById("loginTitle"),
      message: document.getElementById("loginMessage"),
      submit: document.getElementById("loginSubmit"),
      setError(text) {
        document.getElementById("loginError").textContent = text || "";
      }
    };
    const nameInput = document.getElementById("loginName");
    const confirmInput = document.getElementById("loginPasswordConfirm");

    refs.tabLogin.onclick = () => setLoginMode(refs, "login");
    refs.tabCreate.onclick = () => setLoginMode(refs, "create");

    form.addEventListener("submit", async e => {
      e.preventDefault();
      refs.setError("");

      const name = normalizeUserName(nameInput.value);
      if (!name) {
        refs.setError("اكتبي الاسم أولاً");
        return;
      }

      const password = refs.passwordInput.value;
      const mode = refs.mode.value;

      if (!isStrongEnoughPassword(password)) {
        refs.setError("كلمة المرور يجب ألا تقل عن 6 أحرف");
        refs.passwordInput.select();
        return;
      }

      refs.submit.disabled = true;
      const originalLabel = refs.submit.textContent;
      refs.submit.textContent = "جاري التحقق...";

      try {
        const email = await deriveAuthEmail(name);

        if (mode === "login") {
          const credential = await signInWithEmailAndPassword(auth, email, password);
          overlay.remove();
          showPop("تم تسجيل الدخول بنجاح");
          resolve({ name, uid: credential.user.uid });
          return;
        }

        if (password !== confirmInput.value) {
          refs.setError("كلمتا المرور غير متطابقتين");
          confirmInput.select();
          return;
        }

        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = credential.user.uid;
        const avatar = document.querySelector("input[name='loginAvatar']:checked")?.value || getDefaultAvatar(name);
        const now = new Date().toISOString();

        await setDoc(doc(db, USERS_COLLECTION, uid), {
          name,
          avatar,
          done: {},
          lastLoginAt: now,
          updatedAt: now
        }, { merge: true });

        const claimed = await claimLegacyProgress(uid, name);
        if (claimed) showPop("تم استعادة تقدمك السابق بنفس الاسم 🎉");

        overlay.remove();
        showPop("تم إنشاء الحساب بنجاح");
        resolve({ name, uid });
      } catch (err) {
        console.warn("Auth error", err);
        refs.setError(authErrorMessage(err));
        showPop(authErrorMessage(err), "error");
      } finally {
        refs.submit.disabled = false;
        refs.submit.textContent = originalLabel;
      }
    });

    setTimeout(() => nameInput.focus(), 50);
  });
}

export async function ensureCurrentUser() {
  const firebaseUser = await waitForAuthState();
  let uid;
  let name;

  if (firebaseUser) {
    uid = firebaseUser.uid;
    const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
    name = snap.exists() ? normalizeUserName(snap.data().name) : normalizeUserName(localStorage.getItem(USER_KEY));
    state.currentUserProfile = snap.exists() ? snap.data() : { name };
  } else {
    const login = await showUserLogin(normalizeUserName(localStorage.getItem(USER_KEY)) || "");
    uid = login.uid;
    name = login.name;
    const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
    state.currentUserProfile = snap.exists() ? snap.data() : { name };
  }

  state.currentUser = name;
  state.currentUserUid = uid;
  localStorage.setItem(USER_KEY, name);

  await updateLastLogin();
  await refreshAdminRole();

  const firebaseDone = state.currentUserProfile.done || {};
  const localDone = getLocalDone();
  const migrationKey = `${MIGRATION_KEY}_${uid}`;

  await ensureProgramDataForDoneSync();

  state.currentDone = state.cachedData.length
    ? mergeDoneRecords(state.cachedData, firebaseDone, localDone)
    : (localStorage.getItem(migrationKey) ? firebaseDone : { ...firebaseDone, ...localDone });

  await saveDone(state.currentDone);
  localStorage.setItem(migrationKey, "yes");

  renderUserBar();
}

export function renderUserBar() {
  if (!state.currentUser || document.getElementById("currentUserBar")) return;

  const main = document.querySelector("main.container");
  if (!main) return;

  const box = document.createElement("section");
  box.id = "currentUserBar";
  box.className = "user-bar card";
  box.innerHTML = `
    <div>
      <span>المتسابقة الحالية</span>
      <strong>${escapeHtml(state.currentUser)}</strong>
    </div>
    <button type="button" class="ghost" id="logoutUserBtn">تسجيل خروج</button>
  `;

  const dashboardSlot = document.getElementById("dashboardUserSlot");
  const hero = main.querySelector(".hero, .stats-hero");
  if (dashboardSlot) dashboardSlot.appendChild(box);
  else if (hero) hero.insertAdjacentElement("afterend", box);
  else main.prepend(box);

  document.getElementById("logoutUserBtn").onclick = logout;
  renderGreetingMessage();
}

export async function logout() {
  clearUserSession();
  try {
    await signOut(auth);
  } catch (e) { }
  location.reload();
}
