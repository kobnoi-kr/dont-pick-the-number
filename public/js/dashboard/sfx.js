const ADMIN_MUTE_KEY = "nv-admin-notif-mute";
const ADMIN_PING = "/audio/correct-ping.mp3";
const ANN_BELL = "/audio/mixkit-alert-bells-echo-765.wav";
// Short beep — long countdown clips stack and keep playing after the timer ends.
const MAINT_TICK = "/audio/beep.mp3";
let maintTickAudio = null;

export function stopMaintenanceTick() {
  if (!maintTickAudio) return;
  try {
    maintTickAudio.pause();
    maintTickAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
  maintTickAudio = null;
}

export function isAdminNotifMuted() {
  try {
    return localStorage.getItem(ADMIN_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdminNotifMuted(muted) {
  try {
    localStorage.setItem(ADMIN_MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function toggleAdminNotifMuted() {
  const next = !isAdminNotifMuted();
  setAdminNotifMuted(next);
  return next;
}

export function playSfx(src, volume = 0.45) {
  if (!src) return;
  try {
    const a = new Audio(src);
    a.volume = Math.min(1, Math.max(0, volume));
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore autoplay / missing file */
  }
}

/** Ping for admin reply inbox messages (respects mute toggle). */
export function playAdminNotifPing() {
  if (isAdminNotifMuted()) return;
  playSfx(ADMIN_PING, 0.55);
}

/** Sound when a dashboard announcement toast appears. */
export function playAnnouncementBell() {
  playSfx(ANN_BELL, 0.38);
}

/** One short tick per countdown second (stops previous clip first). */
export function playMaintenanceTick() {
  stopMaintenanceTick();
  try {
    const a = new Audio(MAINT_TICK);
    a.volume = 0.35;
    maintTickAudio = a;
    a.onended = () => {
      if (maintTickAudio === a) maintTickAudio = null;
    };
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
}
