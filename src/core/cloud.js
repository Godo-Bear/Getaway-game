// Online accounts: sign up / sign in with an email and password, and keep a
// copy of your save in the cloud so you never lose progress (and can carry
// on from another device).
//
// Uses Firebase (Authentication + Cloud Firestore) through their plain web
// (REST) APIs, so no extra library is loaded. Set up the project in
// src/core/cloudConfig.js (see README.md). If it isn't set up, `cloud.ready`
// is false and the game just saves in this browser like before.
//
// Your save is stored as one document, saves/{your user id}, holding the
// save as a JSON string plus the time it was saved.

import { FIREBASE_CONFIG } from './cloudConfig.js';
import { save } from './save.js';

const SESSION_KEY = 'getaway.account.v1';
const AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:';
const TOKEN = 'https://securetoken.googleapis.com/v1/token';
const SYNC_DELAY = 4000; // ms after a save before uploading it

const cfg = FIREBASE_CONFIG;
const ready = !!(cfg.apiKey && cfg.projectId);

// { uid, email, idToken, refreshToken, expiresAt }
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { /* ignore */ }

let syncTimer = 0;
let dirty = false;
let lastSynced = 0; // Date.now() of the last successful upload / download
// Automatic uploads only start once we've seen what's online (so a failed
// download can never lead to an older/empty save overwriting the online one).
let verified = false;
const listeners = [];

function storeSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
  for (const fn of listeners) fn();
}

// Firebase error codes -> something a player can act on.
const MESSAGES = {
  EMAIL_EXISTS: 'That email already has an account. Sign in instead.',
  EMAIL_NOT_FOUND: 'Wrong email or password.',
  INVALID_PASSWORD: 'Wrong email or password.',
  INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
  INVALID_EMAIL: 'That doesn\'t look like an email address.',
  MISSING_PASSWORD: 'Type a password.',
  MISSING_EMAIL: 'Type your email.',
  WEAK_PASSWORD: 'Password must be at least 6 characters.',
  USER_DISABLED: 'This account has been switched off.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes and try again.',
  OPERATION_NOT_ALLOWED: 'Email sign-in isn\'t switched on in the Firebase project yet.',
  PERMISSION_DENIED: 'The online save was blocked (check the Firestore rules in README.md).',
};

class CloudError extends Error {}

async function call(url, body, { form = false, token = null, method = 'POST' } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body == null ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body),
    });
  } catch {
    throw new CloudError('Can\'t reach the save server. Check your internet connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) return null;
    const code = String(json.error?.message || json.error?.status || res.status);
    throw new CloudError(MESSAGES[code.split(' ')[0].split(':')[0]] || `Something went wrong (${code}).`);
  }
  return json;
}

function fromAuthReply(r) {
  return {
    uid: r.localId,
    email: r.email,
    idToken: r.idToken,
    refreshToken: r.refreshToken,
    expiresAt: Date.now() + (Number(r.expiresIn) || 3600) * 1000,
  };
}

/** A valid ID token for the signed-in player (refreshed when it's about to run out). */
async function idToken() {
  if (!session) throw new CloudError('Not signed in.');
  if (Date.now() < session.expiresAt - 60_000) return session.idToken;
  const r = await call(`${TOKEN}?key=${cfg.apiKey}`,
    { grant_type: 'refresh_token', refresh_token: session.refreshToken }, { form: true });
  storeSession({ ...session, idToken: r.id_token, refreshToken: r.refresh_token,
    expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
  return session.idToken;
}

const docUrl = () =>
  `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/saves/${session.uid}`;

export const cloud = {
  /** Is the online save set up (cloudConfig.js filled in)? */
  ready,
  /** The signed-in player ({ email }) or null. */
  get user() {
    return ready && session ? { email: session.email } : null;
  },
  get lastSynced() {
    return lastSynced;
  },
  /** Call fn() whenever the player signs in or out. */
  onChange(fn) {
    listeners.push(fn);
  },

  async signUp(email, password) {
    const r = await call(`${AUTH}signUp?key=${cfg.apiKey}`, { email: email.trim(), password, returnSecureToken: true });
    storeSession(fromAuthReply(r));
  },
  async signIn(email, password) {
    const r = await call(`${AUTH}signInWithPassword?key=${cfg.apiKey}`, { email: email.trim(), password, returnSecureToken: true });
    storeSession(fromAuthReply(r));
  },
  async resetPassword(email) {
    await call(`${AUTH}sendOobCode?key=${cfg.apiKey}`, { requestType: 'PASSWORD_RESET', email: email.trim() });
  },
  /** Sign out. The save stays on this device too. */
  async signOut() {
    if (dirty && verified) await this.push().catch(() => {});
    verified = false;
    storeSession(null);
  },

  /** Download the online save: { data, savedAt } or null if there isn't one yet. */
  async pull() {
    const token = await idToken();
    const doc = await call(docUrl(), null, { token, method: 'GET' });
    verified = true;
    if (!doc?.fields?.json?.stringValue) return null;
    let data;
    try { data = JSON.parse(doc.fields.json.stringValue); } catch { return null; }
    return { data, savedAt: Number(doc.fields.savedAt?.integerValue) || data.savedAt || 0 };
  },

  /** Upload this device's save (settings stay on the device). */
  async push() {
    const token = await idToken();
    const { settings, ...progress } = save.data;
    dirty = false;
    try {
      await call(docUrl(), {
        fields: {
          json: { stringValue: JSON.stringify(progress) },
          savedAt: { integerValue: String(save.data.savedAt || Date.now()) },
        },
      }, { token, method: 'PATCH' });
    } catch (e) {
      dirty = true;
      throw e;
    }
    verified = true;
    lastSynced = Date.now();
  },

  /** Replace this device's progress with the online copy. */
  useCloud(remote) {
    save.replaceAll({ ...remote.data, savedAt: remote.savedAt });
    dirty = false;
    lastSynced = Date.now();
  },
};

// Upload a few seconds after every save (batched), and straight away when
// the page is hidden or closed.
function flush() {
  clearTimeout(syncTimer);
  if (cloud.user && dirty && verified) cloud.push().catch(() => {});
}
if (ready) {
  save.onWrite(() => {
    if (!cloud.user) return;
    dirty = true;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flush, SYNC_DELAY);
  });
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
}

/**
 * When the game starts: if you're signed in and your online save is newer
 * than this device's (you played somewhere else), load it. If this device's
 * is newer, upload it. `onLoaded()` is called if progress changed.
 */
export async function syncOnStart(onLoaded) {
  if (!cloud.user) return;
  try {
    const remote = await cloud.pull();
    const local = save.data.savedAt || 0;
    if (remote && (remote.savedAt > local || (save.isFresh() && !save.isFresh(remote.data)))) {
      cloud.useCloud(remote);
      onLoaded?.();
    } else if (!remote || local > remote.savedAt) {
      await cloud.push();
    } else {
      lastSynced = Date.now();
    }
  } catch {
    // offline or signed out elsewhere - play on, it'll sync on the next save
  }
}
