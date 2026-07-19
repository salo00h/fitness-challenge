export const state = {
  currentWeek: 1,
  currentWeeksByChallenge: {},
  activeChallenge: null,
  cachedData: [],
  cachedChallengeMeta: {},
  cachedParticipants: null,
  currentUser: null,
  currentUserUid: null,
  currentUserProfile: null,
  currentDone: {},
  isAdminUser: false,
  warnedDefaultStartDates: new Set()
};
