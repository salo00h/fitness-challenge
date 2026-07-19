export const LOCAL_KEY = "fitness_program_v3_weeks_days";
export const DONE_KEY = "fitness_program_done_v1";
export const USER_KEY = "fitness_current_user_v1";
export const AUTH_KEY = "fitness_current_user_auth_v1";
export const MIGRATION_KEY = "fitness_done_migrated_to_firebase_v1";
export const COLLECTION_NAME = "exercises";
export const USERS_COLLECTION = "participants";
export const PUBLIC_PROFILES_COLLECTION = "public-profiles";
export const LEGACY_PARTICIPANTS_COLLECTION = "legacy-participants";
export const ROLES_COLLECTION = "roles";
// المستخدم لبناء بريد إلكتروني اصطناعي وحيد لكل اسم من أجل Firebase Authentication
// (لا يُستخدم للتواصل، فقط ليكون معرّف دخول صالح الصيغة لـ signIn/createUser).
export const AUTH_EMAIL_DOMAIN = "fitness-challenge-6061e.internal";
export const CHALLENGE_META_TYPE = "challenge-meta";
// طبقة UI إضافية فقط لإخفاء أزرار الإدارة عن العين - الحماية الحقيقية هي Firestore rules + roles/{uid}.
export const ADMIN_PASSWORD = "1234";
export const ADMIN_SESSION_KEY = "fitness_admin_unlocked_v1";
export const THEME_KEY = "fitness_theme_v1";
export const DEFAULT_CHALLENGE_START_DATE = "2026-06-21";
export const COMMITMENT_START_WEEK = 2;
export const DELAY_PENALTY = 10;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const CHALLENGE_DAYS = 30;

export const AVATARS = ["🌸", "🔥", "💪", "🏆", "⭐", "🌷", "💖", "🦋", "👑", "✨"];

export const DAILY_QUOTES = [
  "الاستمرارية أهم من الكمال 💪",
  "خطوة صغيرة اليوم تصنع فرقًا كبيرًا غدًا 🌷",
  "كل تمرين يقربك من هدفك 🔥",
  "أنتِ أقوى مما تظنين 💖",
  "لا تنتظري الحماس، اصنعيه 🏆"
];
