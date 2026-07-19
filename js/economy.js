import { db, doc, getDoc, setDoc } from "./firebase.js";
import { state } from "./state.js";
import { formatLocalDate } from "./utils.js";

export const GAME_STATE_COLLECTION = "game-state";
const GAME_STATE_KEY = "fitness_game_state_v2";

export const SHOP_ITEMS = [
  { id: "avatar-star", type: "avatar", icon: "🌟", title: "أفاتار النجمة", description: "أفاتار جديد يظهر في المتجر.", cost: 2 },
  { id: "theme-aurora", type: "theme", icon: "🎨", title: "ثيم الشفق", description: "ثيم خاص يضاف لمجموعتك.", cost: 3 },
  { id: "celebration-gold", type: "effect", icon: "🎊", title: "احتفال ذهبي", description: "مؤثر احتفال فاخر للإنجازات.", cost: 4 },
  { id: "frame-gold", type: "frame", icon: "🟡", title: "إطار ذهبي", description: "إطار مميز للاسم في قاعة الشرف.", cost: 5 },
  { id: "title-queen", type: "title", icon: "👑", title: "لقب الملكة", description: "لقب حصري يظهر ضمن مكافآتك.", cost: 6 }
];

export const WHEEL_REWARDS = [
  { id: "xp-10", icon: "⚡", title: "+10 XP", type: "xp", amount: 10 },
  { id: "xp-20", icon: "🔥", title: "+20 XP", type: "xp", amount: 20 },
  { id: "gem-1", icon: "💎", title: "جوهرة واحدة", type: "gems", amount: 1 },
  { id: "boost-day", icon: "🚀", title: "مضاعفة اليوم", type: "xp", amount: 40 },
  { id: "theme-free", icon: "🎨", title: "ثيم مجاني", type: "unlock", itemId: "theme-aurora" }
];

function currentUserKey() {
  return state.currentUserUid || "guest";
}

function localKey() {
  return `${GAME_STATE_KEY}_${currentUserKey()}`;
}

function defaultGameState() {
  return {
    userId: currentUserKey(),
    userName: state.currentUser || "",
    gems: 0,
    bonusXp: 0,
    unlockedItems: [],
    spins: {},
    updatedAt: new Date().toISOString()
  };
}

function normalizeGameState(value = {}) {
  const base = defaultGameState();
  return {
    ...base,
    ...value,
    gems: Math.max(0, Number(value.gems ?? base.gems) || 0),
    bonusXp: Math.max(0, Number(value.bonusXp ?? base.bonusXp) || 0),
    unlockedItems: Array.isArray(value.unlockedItems) ? value.unlockedItems : [],
    spins: value.spins && typeof value.spins === "object" ? value.spins : {}
  };
}

export function getCachedGameState() {
  try {
    return normalizeGameState(JSON.parse(localStorage.getItem(localKey()) || "{}"));
  } catch (e) {
    return defaultGameState();
  }
}

function saveLocalGameState(value) {
  localStorage.setItem(localKey(), JSON.stringify(normalizeGameState(value)));
}

export async function loadGameState() {
  if (!state.currentUserUid) return defaultGameState();

  const cached = getCachedGameState();
  const snap = await getDoc(doc(db, GAME_STATE_COLLECTION, currentUserKey()));
  const remote = snap.exists() ? snap.data() : {};
  const merged = normalizeGameState({ ...cached, ...remote });
  saveLocalGameState(merged);
  return merged;
}

export async function saveGameState(nextState) {
  const normalized = normalizeGameState({
    ...nextState,
    userId: currentUserKey(),
    userName: state.currentUser || "",
    updatedAt: new Date().toISOString()
  });

  saveLocalGameState(normalized);

  if (state.currentUserUid) {
    await setDoc(doc(db, GAME_STATE_COLLECTION, currentUserKey()), normalized, { merge: true });
  }

  return normalized;
}

export function hasSpunToday(gameState = getCachedGameState()) {
  return !!gameState.spins?.[formatLocalDate(new Date())];
}

function pickWheelReward() {
  return WHEEL_REWARDS[Math.floor(Math.random() * WHEEL_REWARDS.length)] || WHEEL_REWARDS[0];
}

export async function spinDailyWheel() {
  const gameState = await loadGameState();
  const day = formatLocalDate(new Date());

  if (gameState.spins[day]) {
    return { alreadySpun: true, reward: gameState.spins[day], gameState };
  }

  const reward = pickWheelReward();
  const next = normalizeGameState(gameState);
  next.spins = { ...next.spins, [day]: reward };

  if (reward.type === "xp") {
    next.bonusXp += Number(reward.amount) || 0;
  }

  if (reward.type === "gems") {
    next.gems += Number(reward.amount) || 0;
  }

  if (reward.type === "unlock" && reward.itemId && !next.unlockedItems.includes(reward.itemId)) {
    next.unlockedItems = [...next.unlockedItems, reward.itemId];
  }

  return { alreadySpun: false, reward, gameState: await saveGameState(next) };
}

export async function unlockShopItem(itemId) {
  const item = SHOP_ITEMS.find(entry => entry.id === itemId);
  if (!item) return { ok: false, reason: "missing" };

  const gameState = await loadGameState();
  if (gameState.unlockedItems.includes(item.id)) {
    return { ok: false, reason: "unlocked", item, gameState };
  }

  if (gameState.gems < item.cost) {
    return { ok: false, reason: "gems", item, gameState };
  }

  const next = normalizeGameState({
    ...gameState,
    gems: gameState.gems - item.cost,
    unlockedItems: [...gameState.unlockedItems, item.id]
  });

  return { ok: true, item, gameState: await saveGameState(next) };
}
