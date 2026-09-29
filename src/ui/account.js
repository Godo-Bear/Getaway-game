// Account screen (title screen): sign up / sign in so your progress is
// saved online, and choose which save to keep if this device and your
// account both have one.

import { showCard } from './menus.js';
import { cloud } from '../core/cloud.js';
import { save } from '../core/save.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One line for the title-screen button. */
export function accountSub() {
  if (!cloud.ready) return 'Online saves are not set up yet';
  return cloud.user ? `Signed in as ${esc(cloud.user.email)} · progress saved online`
    : 'Sign in or sign up so you never lose your progress';
}

export function showAccount(onBack) {
  if (!cloud.ready) {
    showCard(`<h2>Account</h2>
      <p class="sub">Online saves aren't switched on for this copy of the game yet, so your progress is saved in this browser only.</p>
      <p class="sub" style="font-size:14px">(For the game's owner: see "Online accounts" in README.md.)</p>`,
    [{ label: 'Back', primary: true, onClick: onBack }]);
    return;
  }
  if (cloud.user) showSignedIn(onBack);
  else showForm(onBack);
}

function showSignedIn(onBack, note = '') {
  const when = cloud.lastSynced ? `Last synced ${new Date(cloud.lastSynced).toLocaleTimeString()}.` : '';
  showCard(`<h2>Account</h2>
    <p class="sub">Signed in as <b style="color:var(--ink)">${esc(cloud.user.email)}</b>.</p>
    <p class="sub" style="font-size:15px">Your progress, cash and gadgets are saved online a few seconds after every save. Sign in with the same email on another device to carry on there. ${when}</p>
    <p class="sub" style="font-size:15px">This save: ${esc(save.describe())}</p>
    ${note ? `<p class="acct-msg">${note}</p>` : ''}`,
  [
    { label: 'Back', primary: true, onClick: onBack },
    { label: 'Save online now', onClick: async () => {
      try { await cloud.push(); showSignedIn(onBack, 'Saved online ✓'); } catch (e) { showSignedIn(onBack, esc(e.message)); }
    } },
    { label: 'Sign out', onClick: async () => { await cloud.signOut(); showForm(onBack, 'Signed out. Your progress stays on this device too.'); } },
  ]);
}

function showForm(onBack, note = '', email = '') {
  showCard(`<h2>Account</h2>
    <p class="sub">Sign up (or sign in) to save your progress online, so you don't lose it if this browser is cleared, and to play on another device.</p>
    <form class="acct-form" autocomplete="on" onsubmit="return false">
      <label>Email <input id="acct-email" type="email" autocomplete="email" value="${esc(email)}" required></label>
      <label>Password <input id="acct-pass" type="password" autocomplete="current-password" minlength="6" required>
        <small>At least 6 characters</small></label>
    </form>
    <p class="acct-msg" id="acct-msg">${note}</p>`,
  [
    { label: 'Sign in', primary: true, onClick: () => submit('signIn') },
    { label: 'Create account', onClick: () => submit('signUp') },
    { label: 'Forgot password', onClick: () => submit('reset') },
    { label: 'Back', onClick: onBack },
  ]);
  const emailEl = document.getElementById('acct-email');
  const passEl = document.getElementById('acct-pass');
  const msg = document.getElementById('acct-msg');
  // Typing in the boxes mustn't trigger game keys, and Enter signs in.
  for (const el of [emailEl, passEl]) {
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit('signIn');
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
  }
  setTimeout(() => (emailEl.value ? passEl : emailEl).focus(), 40);

  let busy = false;
  async function submit(kind) {
    if (busy) return;
    const em = emailEl.value.trim();
    const pw = passEl.value;
    if (!em) { msg.textContent = 'Type your email.'; return; }
    if (kind !== 'reset' && pw.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; return; }
    busy = true;
    msg.textContent = kind === 'reset' ? 'Sending…' : kind === 'signUp' ? 'Creating your account…' : 'Signing in…';
    try {
      if (kind === 'reset') {
        await cloud.resetPassword(em);
        msg.textContent = `If ${em} has an account, a password reset email is on its way.`;
        busy = false;
        return;
      }
      await (kind === 'signUp' ? cloud.signUp(em, pw) : cloud.signIn(em, pw));
      await afterSignIn(onBack, kind === 'signUp');
    } catch (e) {
      msg.textContent = e.message;
      busy = false;
    }
  }
}

/** Signed in: work out which save to keep. */
async function afterSignIn(onBack, isNew) {
  let remote = null;
  if (!isNew) {
    try {
      remote = await cloud.pull();
    } catch (e) {
      // Don't upload anything: we don't know what's online yet.
      showSignedIn(onBack, `Signed in, but couldn't load your online save: ${esc(e.message)} It will try again next time you open the game.`);
      return;
    }
  }
  const done = (note) => showSignedIn(onBack, note);
  if (!remote || save.isFresh(remote.data)) {
    await cloud.push().catch(() => {});
    done(isNew ? 'Account created ✓ Your progress on this device is now saved online.' : 'Signed in ✓ Your progress on this device is now saved online.');
    return;
  }
  if (save.isFresh()) {
    cloud.useCloud(remote);
    done('Signed in ✓ Loaded your online save.');
    return;
  }
  // Both have progress: let the player pick.
  showCard(`<h2>Which save?</h2>
    <p class="sub">Your account already has a save, and so does this device. Pick the one to keep (the other is replaced).</p>
    <p class="sub" style="font-size:15px"><b style="color:var(--ink)">Online:</b> ${esc(save.describe({ ...remote.data, savedAt: remote.savedAt }))}</p>
    <p class="sub" style="font-size:15px"><b style="color:var(--ink)">This device:</b> ${esc(save.describe())}</p>`,
  [
    { label: 'Keep the online save', primary: true, onClick: () => { cloud.useCloud(remote); done('Loaded your online save ✓'); } },
    { label: 'Keep this device\'s save', onClick: async () => {
      try { await cloud.push(); done('This device\'s save is now saved online ✓'); } catch (e) { done(esc(e.message)); }
    } },
  ]);
}
