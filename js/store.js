import {
  hasSpunToday,
  loadGameState,
  SHOP_ITEMS,
  spinDailyWheel,
  unlockShopItem,
  WHEEL_REWARDS
} from "./economy.js";
import { pushUserNotification, renderInboxBadge } from "./gamification.js";
import { escapeHtml, formatLocalDate } from "./utils.js";
import { playSuccessSound, showMomentPop, showPop, strongConfetti } from "./ui.js";

function renderWheel(gameState) {
  const spun = hasSpunToday(gameState);
  const todayReward = gameState.spins?.[formatLocalDate(new Date())];

  return `
    <section class="wheel-panel">
      <div class="section-title">
        <h2>عجلة الحظ اليومية</h2>
        <span>${spun ? "تمت اليوم" : "مرة واحدة يوميًا"}</span>
      </div>
      <div class="wheel-layout">
        <div class="wheel-disc ${spun ? "is-spun" : ""}">
          ${WHEEL_REWARDS.map((reward, index) => `
            <span style="--i:${index}">${reward.icon}</span>
          `).join("")}
          <strong>🎡</strong>
        </div>
        <div class="wheel-info">
          <h2>${spun ? `جائزة اليوم: ${escapeHtml(todayReward?.title || "")}` : "لفّي العجلة"}</h2>
          <p>جوائز محتملة: XP، جواهر، مضاعفة يومية، أو ثيم مجاني.</p>
          <button type="button" id="spinWheelBtn" ${spun ? "disabled" : ""}>${spun ? "تم استخدام العجلة اليوم" : "لف العجلة"}</button>
        </div>
      </div>
    </section>
  `;
}

function renderShop(gameState) {
  return `
    <section class="shop-panel">
      <div class="section-title">
        <h2>المتجر</h2>
        <span>💎 ${gameState.gems} جوهرة</span>
      </div>
      <div class="shop-grid">
        ${SHOP_ITEMS.map(item => {
    const unlocked = gameState.unlockedItems.includes(item.id);
    return `
          <article class="shop-item ${unlocked ? "is-unlocked" : ""}">
            <span>${item.icon}</span>
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.description)}</p>
            <strong>${unlocked ? "مفتوح" : `💎 ${item.cost}`}</strong>
            <button type="button" data-unlock="${item.id}" ${unlocked ? "disabled" : ""}>
              ${unlocked ? "تم الفتح" : "فتح"}
            </button>
          </article>
        `;
  }).join("")}
      </div>
    </section>
  `;
}

async function refreshStore() {
  const box = document.getElementById("storeBoard");
  if (!box) return;

  const gameState = await loadGameState();
  box.innerHTML = `
    <section class="store-summary">
      <article>
        <span>الجواهر</span>
        <strong>💎 ${gameState.gems}</strong>
      </article>
      <article>
        <span>XP إضافية</span>
        <strong>+${gameState.bonusXp}</strong>
      </article>
      <article>
        <span>العناصر المفتوحة</span>
        <strong>${gameState.unlockedItems.length}</strong>
      </article>
    </section>
    ${renderWheel(gameState)}
    ${renderShop(gameState)}
  `;

  document.getElementById("spinWheelBtn")?.addEventListener("click", async () => {
    try {
      const result = await spinDailyWheel();
      if (result.alreadySpun) {
        showPop("تم استخدام عجلة اليوم بالفعل", "info");
        return;
      }

      strongConfetti();
      playSuccessSound();
      showMomentPop("جائزة العجلة", result.reward.title);
      await pushUserNotification({
        id: `wheel-${formatLocalDate(new Date())}`,
        type: "reward",
        title: "جائزة عجلة الحظ",
        body: result.reward.title,
        priority: 9,
        createdAt: new Date().toISOString()
      });
      await renderInboxBadge();
      await refreshStore();
    } catch (e) {
      showPop("تعذر لف العجلة", "error");
    }
  });

  box.querySelectorAll("[data-unlock]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        const result = await unlockShopItem(button.dataset.unlock);
        if (!result.ok && result.reason === "gems") {
          showPop("الجواهر غير كافية", "error");
          return;
        }
        if (!result.ok && result.reason === "unlocked") {
          showPop("العنصر مفتوح مسبقًا", "info");
          return;
        }
        if (!result.ok) {
          showPop("تعذر فتح العنصر", "error");
          return;
        }

        showMomentPop("تم فتح عنصر جديد", result.item.title);
        await pushUserNotification({
          id: `shop-unlock-${result.item.id}`,
          type: "reward",
          title: "عنصر جديد في المتجر",
          body: result.item.title,
          priority: 8,
          createdAt: new Date().toISOString()
        });
        await renderInboxBadge();
        await refreshStore();
      } catch (e) {
        showPop("تعذر فتح العنصر", "error");
      }
    });
  });
}

export async function initStorePage() {
  const box = document.getElementById("storeBoard");
  if (!box) return;

  box.innerHTML = `<div class="empty-state card">جاري تحميل المتجر...</div>`;
  try {
    await refreshStore();
  } catch (e) {
    box.innerHTML = `<div class="empty-state card">تعذر تحميل المتجر الآن.</div>`;
    showPop("تعذر تحميل المتجر", "error");
  }
}
