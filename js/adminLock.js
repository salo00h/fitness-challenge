import { ADMIN_PASSWORD, ADMIN_SESSION_KEY } from "./constants.js";
import { state } from "./state.js";
import { ensureCurrentUser } from "./auth.js";
import { showPop } from "./ui.js";

// طبقة UI فقط لإخفاء شاشة الإدارة عن العين - ليست حدود الأمان الحقيقية.
// الحماية الفعلية هي Firestore rules + roles/{uid} (state.isAdminUser أدناه
// يُقرأ من وثيقة roles/{uid} بعد تسجيل الدخول عبر Firebase Authentication،
// وأي كتابة إدارية سترفضها القواعد على الخادم حتى لو تجاوزت هذه الشاشة).
export function isAdminUnlocked() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "yes";
  } catch (e) {
    return false;
  }
}

export function setAdminUnlocked() {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "yes");
  } catch (e) { }
}

function showNotAdminMessage() {
  const main = document.querySelector("main.container");
  if (!main) return;

  main.innerHTML = `
    <section class="card" style="text-align:center; padding:40px 20px;">
      <h2>🚫 هذا الحساب لا يملك صلاحية Admin</h2>
      <p>سجّلي الدخول بحساب يملك صلاحية Admin (يُضاف يدويًا في Firestore من طرف مالك المشروع)، أو ارجعي لصفحة العرض.</p>
      <a href="index.html">العودة للصفحة الرئيسية</a>
    </section>
  `;
}

export async function ensureAdminAccess() {
  if (!document.getElementById("exerciseForm")) return true;

  // تسجيل الدخول عبر Firebase Auth أولًا - هذا ما تعتمد عليه Firestore rules فعليًا،
  // شاشة كلمة المرور أدناه واجهة إضافية فقط.
  await ensureCurrentUser();

  if (!state.isAdminUser) {
    showNotAdminMessage();
    return false;
  }

  return new Promise(resolve => {
    if (isAdminUnlocked()) {
      document.body.classList.remove("admin-locked");
      resolve(true);
      return;
    }

    document.body.classList.add("admin-locked");

    const overlay = document.createElement("div");
    overlay.id = "adminLoginOverlay";
    overlay.className = "admin-login-overlay";
    overlay.innerHTML = `
      <form class="admin-login-card">
        <div class="login-icon">🔐</div>
        <h2>دخول الإعدادات</h2>
        <p>اكتبي كلمة المرور لفتح صفحة الإعدادات.</p>
        <input id="adminPasswordInput" type="password" autocomplete="current-password" placeholder="كلمة المرور" required>
        <div id="adminPasswordError" class="admin-login-error"></div>
        <button type="submit">فتح الإعدادات</button>
      </form>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("form").addEventListener("submit", e => {
      e.preventDefault();
      const input = document.getElementById("adminPasswordInput");
      const error = document.getElementById("adminPasswordError");

      if (input.value === ADMIN_PASSWORD) {
        setAdminUnlocked();
        document.body.classList.remove("admin-locked");
        overlay.remove();
        showPop("تم فتح صفحة الإعدادات بنجاح");
        resolve(true);
        return;
      }

      if (error) error.textContent = "كلمة المرور غير صحيحة";
      showPop("كلمة المرور غير صحيحة", "error");
      input.select();
    });

    setTimeout(() => document.getElementById("adminPasswordInput")?.focus(), 50);
  });
}
