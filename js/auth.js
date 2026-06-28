import { collection, db, doc, getDoc, getDocs, setDoc } from "./firebase.js";
import {
  AUTH_KEY,
  DONE_KEY,
  MIGRATION_KEY,
  USERS_COLLECTION,
  USER_KEY,
  AVATARS
} from "./constants.js";
import { state } from "./state.js";
import { escapeHtml, normalizeUserName, userDocId } from "./utils.js";
import { getDefaultAvatar, renderGreetingMessage, showPop } from "./ui.js";
import { upgradeLegacyDoneRecords } from "./progress.js";

// Auth
export function isAuthStoredFor(name) {
  return normalizeUserName(name) && localStorage.getItem(AUTH_KEY) === "true";
}

export function storeUserSession(name) {
  const normalized = normalizeUserName(name);
  localStorage.setItem(USER_KEY, normalized);
  localStorage.setItem(AUTH_KEY, "true");
  state.currentUser = normalized;
}

export function clearUserSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(AUTH_KEY);
}

export async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isStrongEnoughPassword(password) {
  return String(password || "").length >= 4;
}

export async function updateLastLogin(name) {
  const lastLoginAt = new Date().toISOString();
  await setDoc(doc(db, USERS_COLLECTION, userDocId(name)), { lastLoginAt }, { merge: true });
  state.currentUserProfile = { ...(state.currentUserProfile || {}), lastLoginAt };
}

export function getLocalDone() {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

export function getDone() {
  return state.currentDone || {};
}

export async function saveDone(done) {
  state.currentDone = upgradeLegacyDoneRecords(done);
  localStorage.setItem(DONE_KEY, JSON.stringify(state.currentDone));

  if (!state.currentUser) return;

  await setDoc(doc(db, USERS_COLLECTION, userDocId(state.currentUser)), {
    name: state.currentUser,
    done: state.currentDone,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export function showUserLogin(prefillName = "") {
  return new Promise(resolve => {
    const old = document.getElementById("userLoginOverlay");
    if (old) old.remove();

    let mode = "name";
    let selectedName = "";
    let selectedRef = null;
    let selectedUser = null;

    const overlay = document.createElement("div");
    overlay.id = "userLoginOverlay";
    overlay.className = "login-overlay";
    overlay.innerHTML = `
      <form class="login-card account-login-card">
        <div class="login-icon">🔐</div>
        <h2 id="loginTitle">دخول المتسابقة</h2>
        <p id="loginMessage">اكتبي اسمك لنبحث عن حسابك أو ننشئ حسابًا جديدًا.</p>

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

        <div id="passwordFields" class="password-fields hidden">
          <label for="loginPassword">كلمة المرور</label>
          <input id="loginPassword" type="password" autocomplete="current-password" placeholder="كلمة المرور">

          <div id="confirmPasswordWrap">
            <label for="loginPasswordConfirm">تأكيد كلمة المرور</label>
            <input id="loginPasswordConfirm" type="password" autocomplete="new-password" placeholder="أعيدي كتابة كلمة المرور">
          </div>
        </div>

        <div id="loginError" class="login-error"></div>

        <div class="login-actions">
          <button type="submit" id="loginSubmit">متابعة</button>
          <button type="button" id="loginBack" class="ghost hidden">رجوع للاسم</button>
        </div>
      </form>
    `;

    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const nameInput = document.getElementById("loginName");
    const avatarFields = document.getElementById("avatarFields");
    const passwordFields = document.getElementById("passwordFields");
    const passwordInput = document.getElementById("loginPassword");
    const confirmWrap = document.getElementById("confirmPasswordWrap");
    const confirmInput = document.getElementById("loginPasswordConfirm");
    const title = document.getElementById("loginTitle");
    const message = document.getElementById("loginMessage");
    const errorBox = document.getElementById("loginError");
    const submit = document.getElementById("loginSubmit");
    const back = document.getElementById("loginBack");

    function setError(text) {
      errorBox.textContent = text || "";
    }

    function setMode(nextMode) {
      mode = nextMode;
      setError("");
      passwordFields.classList.remove("hidden");
      back.classList.remove("hidden");
      nameInput.readOnly = true;
      passwordInput.value = "";
      confirmInput.value = "";

      if (mode === "login") {
        title.textContent = "تسجيل الدخول";
        message.textContent = "اكتبي كلمة المرور للدخول";
        avatarFields.classList.add("hidden");
        confirmWrap.classList.add("hidden");
        passwordInput.autocomplete = "current-password";
        submit.textContent = "دخول";
      } else {
        title.textContent = "إنشاء كلمة مرور";
        message.textContent = "أنشئي كلمة مرور لحفظ حسابك";
        avatarFields.classList.remove("hidden");
        confirmWrap.classList.remove("hidden");
        passwordInput.autocomplete = "new-password";
        submit.textContent = "حفظ كلمة المرور";
      }

      setTimeout(() => passwordInput.focus(), 50);
    }

    function resetToName() {
      mode = "name";
      selectedName = "";
      selectedRef = null;
      selectedUser = null;
      setError("");
      title.textContent = "دخول المتسابقة";
      message.textContent = "اكتبي اسمك لنبحث عن حسابك أو ننشئ حسابًا جديدًا.";
      submit.textContent = "متابعة";
      nameInput.readOnly = false;
      passwordFields.classList.add("hidden");
      avatarFields.classList.add("hidden");
      back.classList.add("hidden");
      confirmWrap.classList.remove("hidden");
      passwordInput.value = "";
      confirmInput.value = "";
      setTimeout(() => nameInput.focus(), 50);
    }

    back.onclick = resetToName;

    form.addEventListener("submit", async e => {
      e.preventDefault();
      setError("");

      if (mode === "name") {
        selectedName = normalizeUserName(nameInput.value);
        if (!selectedName) {
          setError("اكتبي الاسم أولاً");
          return;
        }

        selectedRef = doc(db, USERS_COLLECTION, userDocId(selectedName));
        const snap = await getDoc(selectedRef);
        selectedUser = snap.exists() ? snap.data() : null;

        if (selectedUser && selectedUser.passwordHash) {
          setMode("login");
        } else {
          setMode("create");
          if (selectedUser && !selectedUser.passwordHash) {
            message.textContent = "يرجى إنشاء كلمة مرور لحماية تقدمك";
          }
        }
        return;
      }

      const password = passwordInput.value;
      if (!isStrongEnoughPassword(password)) {
        setError("كلمة المرور يجب ألا تقل عن 4 أحرف");
        passwordInput.select();
        return;
      }

      if (mode === "login") {
        const passwordHash = await hashPassword(password);
        if (passwordHash === selectedUser.passwordHash) {
          storeUserSession(selectedName);
          await updateLastLogin(selectedName);
          state.currentUserProfile = { ...selectedUser, lastLoginAt: new Date().toISOString() };
          overlay.remove();
          showPop("تم تسجيل الدخول بنجاح");
          resolve({ name: selectedName });
          return;
        }

        setError("كلمة المرور غير صحيحة");
        showPop("كلمة المرور غير صحيحة", "error");
        passwordInput.select();
        return;
      }

      if (password !== confirmInput.value) {
        setError("كلمتا المرور غير متطابقتين");
        confirmInput.select();
        return;
      }

      try {
        const passwordHash = await hashPassword(password);
        const passwordCreatedAt = new Date().toISOString();
        const lastLoginAt = passwordCreatedAt;
        const avatar = document.querySelector("input[name='loginAvatar']:checked")?.value || getDefaultAvatar(selectedName);

        await setDoc(selectedRef, {
          name: selectedName,
          avatar,
          passwordHash,
          passwordCreatedAt,
          lastLoginAt
        }, { merge: true });

        storeUserSession(selectedName);
        state.currentUserProfile = {
          ...(selectedUser || {}),
          name: selectedName,
          avatar,
          passwordHash,
          passwordCreatedAt,
          lastLoginAt
        };
        overlay.remove();
        showPop("تم حفظ كلمة المرور بنجاح");
        resolve({ name: selectedName });
      } catch (e) {
        setError("تعذر تسجيل الدخول الآن. حاولي مرة أخرى.");
        showPop("تعذر تسجيل الدخول الآن", "error");
      }
    });

    setTimeout(() => nameInput.focus(), 50);
  });
}

export async function ensureCurrentUser() {
  const savedUser = normalizeUserName(localStorage.getItem(USER_KEY));
  const hasAuth = isAuthStoredFor(savedUser);

  state.currentUser = hasAuth ? savedUser : "";

  if (!state.currentUser) {
    const login = await showUserLogin(savedUser);
    state.currentUser = login.name;
  }

  let ref = doc(db, USERS_COLLECTION, userDocId(state.currentUser));
  let snap = await getDoc(ref);

  if (hasAuth && (!snap.exists() || !snap.data().passwordHash)) {
    clearUserSession();
    const login = await showUserLogin(state.currentUser);
    state.currentUser = login.name;
    ref = doc(db, USERS_COLLECTION, userDocId(state.currentUser));
    snap = await getDoc(ref);
  }

  state.currentUserProfile = snap.exists() ? snap.data() : { name: state.currentUser };

  const firebaseDone = snap.exists() ? (snap.data().done || {}) : {};
  const localDone = getLocalDone();
  const migrationKey = `${MIGRATION_KEY}_${userDocId(state.currentUser)}`;

  state.currentDone = localStorage.getItem(migrationKey)
    ? firebaseDone
    : { ...firebaseDone, ...localDone };

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

export function logout() {
  clearUserSession();
  location.reload();
}
