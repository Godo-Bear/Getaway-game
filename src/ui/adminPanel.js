// Admin panel (Settings -> Admin, after entering the admin code).
//
//  - your cash, your abilities (no gadget recharge, god mode, infinite nitro,
//    super speed, infinite range), unlock everything, reset your progress
//  - other players (online accounts): see their cash, chapters and equipped
//    gadgets, set their cash, and share abilities with them. Only works for
//    admin accounts listed in the Firestore rules, see README.md

import { showCard } from './menus.js';
import { admin, ABILITIES } from '../core/admin.js';
import { save } from '../core/save.js';
import { cloud } from '../core/cloud.js';
import { GADGETS, gadget } from '../gadgets/gadgets.js';
import { CHAPTER_LIST } from '../story/chapters.js';
import { CAR_COLOURS } from '../vehicles/carColours.js';
import { audio } from '../core/audio.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Your own cheats (admins always have the admin gadgets). */
const OWN = ABILITIES.filter((a) => a.id !== 'adminGadgets');

let players = null;   // last loaded player list
let note = '';        // message line under the players section
let allPerks = {};    // the "every player" abilities row

/** Settings section: code entry, or the button that opens the panel. */
export function adminSettingsHtml() {
  if (admin.on) {
    return `<p class="sub setting-head">Admin</p>
      <div class="adm-row"><button class="chip adm-open" id="adm-open">Open the admin panel</button><span class="sub fine">Admin mode is on on this device.</span></div>`;
  }
  return `<p class="sub setting-head">Admin</p>
    <div class="adm-row"><input id="adm-code" type="password" placeholder="Admin code" autocomplete="off">
      <button class="chip" id="adm-unlock">Unlock</button></div>
    <p class="sub fine" id="adm-code-msg"></p>`;
}

/** Wire up the Settings section. `rerender` redraws Settings, `open` opens the panel. */
export function bindAdminSettings(rerender, open) {
  document.getElementById('adm-open')?.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  const input = document.getElementById('adm-code');
  if (!input) return;
  const msg = document.getElementById('adm-code-msg');
  guardKeys(input);
  const tryIt = async () => {
    try {
      if (await admin.unlock(input.value)) { audio.sfx('checkpoint'); open(); }
      else { msg.textContent = 'That code isn\'t right.'; audio.sfx('locked'); }
    } catch (err) { msg.textContent = err.message; }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryIt(); });
  document.getElementById('adm-unlock').addEventListener('click', (e) => { e.stopPropagation(); tryIt(); });
}

/** Typing in a box mustn't also press game keys (P pauses, Space jumps...). */
function guardKeys(el) {
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.addEventListener('keyup', (e) => e.stopPropagation());
}

/** Small chips showing a player's equipped gadgets. */
function equippedHtml(p) {
  const chip = (id, where) => {
    const g = id && gadget(id);
    return g ? `<span class="adm-gadget" style="--gc:${g.color}">${g.icon} ${esc(g.name)} <small>${where}</small></span>`
      : `<span class="adm-gadget none">nothing <small>${where}</small></span>`;
  };
  const owned = p.owned.filter((id) => gadget(id)).length;
  return `<div class="adm-equip">${chip(p.equipped.foot, 'on foot')}${chip(p.equipped.car, 'in the car')}<span class="adm-owned">owns ${owned} gadget${owned === 1 ? '' : 's'}</span></div>`;
}

/** Ability checkboxes for a player (or for everyone, with key 'all'). */
function perksHtml(key, perks) {
  return `<div class="adm-perks">${ABILITIES.map((a) => `
    <label title="${esc(a.desc)}"><input type="checkbox" data-perk="${a.id}" data-perk-for="${key}" ${perks[a.id] ? 'checked' : ''}>${a.name}</label>`).join('')}</div>`;
}

export function showAdminPanel(onBack) {
  const shop = save.data.shop;
  const cheats = OWN.map((a) => `
    <label class="setting check" for="adm-${a.id}"><span>${a.name}<small class="adm-sub">${a.desc}</small></span>
      <input type="checkbox" id="adm-${a.id}" ${save.data.admin[a.id] ? 'checked' : ''}></label>`).join('');

  let online;
  if (!cloud.ready) online = '<p class="sub fine">Online accounts aren\'t set up, so there are no other players to manage.</p>';
  else if (!cloud.user) online = '<p class="sub fine">Sign in with your admin account (Account, on the title screen) to manage other players.</p>';
  else {
    const others = players?.filter((p) => p.uid !== cloud.uid) || [];
    const rows = players?.length ? players.map((p) => {
      const me = p.uid === cloud.uid;
      return `
      <div class="adm-player">
        <div class="adm-who"><b>${esc(p.email)}</b><small>${money(p.cash)} · ${p.solved} chapter${p.solved === 1 ? '' : 's'} solved${p.savedAt ? ` · played ${new Date(p.savedAt).toLocaleDateString()}` : ''}${me ? ' · you' : ''}</small></div>
        ${equippedHtml(p)}
        <div class="adm-row">
          <input type="number" min="0" step="100" value="${p.cash}" data-cash-for="${p.uid}" aria-label="Cash for ${esc(p.email)}">
          <button class="chip" data-set-for="${p.uid}">Set cash</button>
        </div>
        ${me ? '<p class="sub fine">Your own abilities are the Abilities section above.</p>'
          : `${perksHtml(p.uid, p.perks)}<button class="chip" data-perks-save="${p.uid}">Save abilities</button>`}
      </div>`;
    }).join('') : players ? '<p class="sub fine">No online saves yet.</p>' : '';
    const all = others.length ? `
      <div class="adm-player adm-all">
        <div class="adm-who"><b>Every player (${others.length})</b><small>Give these abilities to everyone at once (replaces what they have)</small></div>
        ${perksHtml('all', allPerks)}
        <button class="chip" id="adm-perks-all">Give to everyone</button>
      </div>` : '';
    online = `
      <p class="sub fine">Your account ID (the admin list in the Firestore rules needs this): <code class="adm-uid">${esc(cloud.uid)}</code> <button class="chip" id="adm-copy">Copy</button></p>
      <button class="chip" id="adm-load">${players ? 'Refresh the player list' : 'Load the player list'}</button>
      <div class="adm-players">${all}${rows}</div>`;
  }

  showCard(`
    <p class="sub kicker">Admin</p>
    <h2>Admin panel</h2>
    <p class="sub setting-head">Your cash</p>
    <div class="adm-row">
      <input type="number" id="adm-cash" min="0" step="100" value="${shop.cash}" aria-label="Your cash">
      <button class="chip" id="adm-cash-set">Set</button>
      <button class="chip" data-add="1000">+$1,000</button>
      <button class="chip" data-add="10000">+$10,000</button>
      <button class="chip" data-add="100000">+$100,000</button>
    </div>
    <p class="sub setting-head">Your abilities</p>
    ${cheats}
    <p class="sub fine">With any ability on, Speedrun times aren't saved. Admin-only gadgets (Rocket Boots, Invisibility Cloak, Police Freeze, Teleporter) are free in the Shop's Admin tab. In a story part, the pause menu has "Admin: skip this part".</p>
    <p class="sub setting-head">Unlock</p>
    <div class="adm-row">
      <button class="chip" id="adm-gadgets">Every gadget</button>
      <button class="chip" id="adm-chapters">Every chapter</button>
      <button class="chip" id="adm-colours">Every car colour</button>
    </div>
    <p class="sub setting-head">Other players (online)</p>
    ${online}
    <p class="sub fine adm-msg" id="adm-msg">${esc(note)}</p>
    <p class="sub setting-head">Careful</p>
    <div class="adm-row">
      <button class="chip adm-danger" id="adm-reset">Reset my progress</button>
      <button class="chip" id="adm-lock">Lock admin mode</button>
    </div>`,
  [{ label: 'Done', primary: true, onClick: () => { note = ''; onBack(); } }]);

  const again = () => {
    const card = document.getElementById('card');
    const top = card.scrollTop;
    showAdminPanel(onBack);
    card.scrollTop = top; // stay where you were in the (long) panel
  };
  const $ = (id) => document.getElementById(id);
  const msg = (t) => { note = t; $('adm-msg').textContent = t; };
  const on = (el, fn) => el?.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
  const denied = (err) => (err.code === 'PERMISSION_DENIED'
    ? 'Not allowed: your account isn\'t in the admin list in the Firestore rules yet (see README.md, "Admin panel").' : err.message);
  for (const el of document.querySelectorAll('#card input[type=number], #card input[type=password]')) guardKeys(el);

  // --- your cash
  const setCash = (n) => { shop.cash = Math.max(0, Math.round(n) || 0); save.write(); audio.sfx('cash', { vol: 0.5 }); note = `Your cash is now ${money(shop.cash)}.`; again(); };
  on($('adm-cash-set'), () => setCash(Number($('adm-cash').value)));
  $('adm-cash').addEventListener('keydown', (e) => { if (e.key === 'Enter') setCash(Number($('adm-cash').value)); });
  for (const b of document.querySelectorAll('[data-add]')) on(b, () => setCash(shop.cash + Number(b.dataset.add)));

  // --- your abilities
  for (const a of OWN) $(`adm-${a.id}`).addEventListener('change', (e) => admin.set(a.id, e.target.checked));

  // --- unlocks
  on($('adm-gadgets'), () => {
    shop.owned = GADGETS.map((g) => g.id);
    shop.equipped.foot ||= 'cloak';
    shop.equipped.car ||= 'freeze';
    save.write();
    note = 'Every gadget is yours (equip them in the Shop).';
    again();
  });
  on($('adm-chapters'), () => {
    save.data.progress.chapterUnlocked = CHAPTER_LIST.length;
    save.write();
    note = 'Every chapter is unlocked.';
    again();
  });
  on($('adm-colours'), () => {
    save.data.progress.carColours = CAR_COLOURS.filter((c) => c.unlock).map((c) => c.id);
    save.write();
    note = 'Every car colour is unlocked (pick one in Settings).';
    again();
  });

  // --- other players
  on($('adm-copy'), () => { navigator.clipboard?.writeText(cloud.uid).then(() => msg('Account ID copied.'), () => msg('Couldn\'t copy: select it and copy it by hand.')); });
  on($('adm-load'), async () => {
    msg('Loading players...');
    try { players = await cloud.listPlayers(); note = `${players.length} player${players.length === 1 ? '' : 's'} with an online save.`; again(); }
    catch (err) { msg(denied(err)); }
  });
  for (const b of document.querySelectorAll('[data-set-for]')) {
    on(b, async () => {
      const uid = b.dataset.setFor;
      const amount = Number(document.querySelector(`[data-cash-for="${uid}"]`).value);
      const p = players.find((x) => x.uid === uid);
      if (uid === cloud.uid) { setCash(amount); return; }
      msg('Saving...');
      try {
        await cloud.setPlayerCash(uid, amount);
        p.cash = Math.max(0, Math.round(amount));
        note = `${p.email} now has ${money(p.cash)} (their game picks it up within a minute).`;
        again();
      } catch (err) { msg(denied(err)); }
    });
  }
  const readPerks = (key) => {
    const perks = {};
    for (const el of document.querySelectorAll(`[data-perk-for="${key}"]`)) if (el.checked) perks[el.dataset.perk] = true;
    return perks;
  };
  const perkNames = (perks) => ABILITIES.filter((a) => perks[a.id]).map((a) => a.name).join(', ') || 'no abilities';
  for (const b of document.querySelectorAll('[data-perks-save]')) {
    on(b, async () => {
      const uid = b.dataset.perksSave, p = players.find((x) => x.uid === uid), perks = readPerks(uid);
      msg('Saving...');
      try {
        await cloud.setPlayerPerks(uid, perks);
        p.perks = perks;
        note = `${p.email} now has: ${perkNames(perks)} (within a minute).`;
        again();
      } catch (err) { msg(denied(err)); }
    });
  }
  for (const el of document.querySelectorAll('[data-perk-for="all"]')) {
    el.addEventListener('change', () => { allPerks = readPerks('all'); });
  }
  on($('adm-perks-all'), async () => {
    const perks = readPerks('all');
    const others = players.filter((p) => p.uid !== cloud.uid);
    msg(`Saving for ${others.length} players...`);
    try {
      for (const p of others) { await cloud.setPlayerPerks(p.uid, perks); p.perks = { ...perks }; }
      note = `Everyone now has: ${perkNames(perks)} (within a minute).`;
      again();
    } catch (err) { msg(denied(err)); }
  });

  // --- careful
  on($('adm-reset'), (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Really reset? Tap again'; return; }
    save.replaceAll({ admin: save.data.admin });
    save.write();
    note = 'Your progress has been reset.';
    again();
  });
  on($('adm-lock'), () => { admin.lock(); note = ''; players = null; onBack(); });
}
