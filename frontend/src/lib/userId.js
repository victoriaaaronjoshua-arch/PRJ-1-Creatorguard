// Stable per-browser user ID used to key Gmail tokens & scans in Mongo.
// Persisted in localStorage — no backend accounts needed for this demo.

const KEY = 'cg_user_id';

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getUserId() {
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = makeId();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
