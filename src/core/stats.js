import { save } from './save.js';
import { earn } from '../gadgets/gadgets.js';
import { audio } from './audio.js';

// Stats and achievements: counted everywhere you play, kept in the save.
// Each achievement pays out once. Title screen > Stats shows them all.

export const ACHIEVEMENTS = [
  { id: 'walk1', name: 'Stretch Your Legs', desc: 'Go 1 km on foot', stat: 'footM', goal: 1000, pay: 100 },
  { id: 'walk10', name: 'Marathon Runner', desc: 'Go 10 km on foot', stat: 'footM', goal: 10000, pay: 500 },
  { id: 'drive25', name: 'Road Trip', desc: 'Drive 25 km', stat: 'carM', goal: 25000, pay: 300 },
  { id: 'drive100', name: 'Wheelman', desc: 'Drive 100 km', stat: 'carM', goal: 100000, pay: 800 },
  { id: 'till5', name: 'Sticky Fingers', desc: 'Rob 5 tills', stat: 'tills', goal: 5, pay: 150 },
  { id: 'till25', name: 'Shopkeeper\'s Nightmare', desc: 'Rob 25 tills', stat: 'tills', goal: 25, pay: 600 },
  { id: 'pick10', name: 'Light Fingers', desc: 'Pickpocket 10 people', stat: 'pickpockets', goal: 10, pay: 200 },
  { id: 'escape10', name: 'Ghost', desc: 'Lose the police 10 times', stat: 'escapes', goal: 10, pay: 400 },
  { id: 'wanted5', name: 'Most Wanted', desc: 'Reach five stars on foot', stat: 'maxWanted', goal: 5, pay: 300 },
  { id: 'officers10', name: 'Brawler', desc: 'Knock down 10 officers', stat: 'officersDown', goal: 10, pay: 250 },
  { id: 'tags10', name: 'Tagger', desc: 'Find 10 crew tags', stat: 'tags', goal: 10, pay: 300 },
  { id: 'tags25', name: 'Street Artist', desc: 'Find 25 crew tags', stat: 'tags', goal: 25, pay: 700 },
  { id: 'jobs5', name: 'Errand Runner', desc: 'Finish 5 Free Run jobs', stat: 'missions', goal: 5, pay: 300 },
  { id: 'jobs20', name: 'The Fixer', desc: 'Finish 20 Free Run jobs', stat: 'missions', goal: 20, pay: 1000 },
  { id: 'runs3', name: 'Free Runner', desc: 'Finish 3 parkour challenges', stat: 'challenges', goal: 3, pay: 300 },
  { id: 'record', name: 'Record Breaker', desc: 'Beat your own best time on a challenge', stat: 'records', goal: 1, pay: 250 },
  { id: 'steal5', name: 'Joyrider', desc: 'Steal 5 parked cars', stat: 'carsStolen', goal: 5, pay: 250 },
  { id: 'bike2', name: 'Pedal Power', desc: 'Ride 2 km on bikes and scooters', stat: 'bikeM', goal: 2000, pay: 200 },
  { id: 'shop5', name: 'Big Spender', desc: 'Buy 5 things in the shops', stat: 'buys', goal: 5, pay: 150 },
];

export const STAT_NAMES = {
  footM: ['On foot', (v) => `${(v / 1000).toFixed(1)} km`],
  carM: ['Driven', (v) => `${(v / 1000).toFixed(1)} km`],
  tills: ['Tills robbed', String],
  pickpockets: ['Pockets picked', String],
  escapes: ['Police lost', String],
  maxWanted: ['Most wanted', (v) => '★'.repeat(v) || '-'],
  officersDown: ['Officers knocked down', String],
  tags: ['Crew tags found', String],
  missions: ['Jobs done', String],
  challenges: ['Challenges finished', String],
  buys: ['Things bought', String],
  carsStolen: ['Cars stolen', String],
  bikeM: ['On bikes', (v) => `${(v / 1000).toFixed(1)} km`],
};

const stats = () => (save.data.stats ||= {});

/** Add to a stat (distance, a robbery...). Achievements it completes pay out. */
export function addStat(game, key, n = 1) {
  const s = stats();
  s[key] = (s[key] || 0) + n;
  check(game, key);
}

/** Raise a stat to at least v (e.g. the most wanted you've been). */
export function maxStat(game, key, v) {
  const s = stats();
  if ((s[key] || 0) >= v) return;
  s[key] = v;
  check(game, key);
}

function check(game, key) {
  const s = stats(), got = (save.data.achievements ||= {});
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (a.stat !== key || got[a.id] || (s[key] || 0) < a.goal) continue;
    got[a.id] = Date.now();
    changed = true;
    const paid = earn(game, a.pay, '', { quiet: true });
    audio.sfx('win', { vol: 0.6 });
    game?.hud?.toast(`🏆 ${a.name}  +$${paid}`, a.desc, '#ffd040', 4);
  }
  // (distance ticks over every frame: only write it out now and then)
  if (changed || !key.endsWith('M') || Math.random() < 0.01) save.write();
}

/** For the Stats screen. */
export function statsHtml() {
  const s = stats(), got = save.data.achievements || {};
  const rows = Object.entries(STAT_NAMES).map(([k, [name, fmt]]) => `<div class="stat-row"><span>${name}</span><b>${fmt(s[k] || 0)}</b></div>`).join('');
  const ach = ACHIEVEMENTS.map((a) => {
    const done = !!got[a.id], v = Math.min(a.goal, s[a.stat] || 0);
    return `<div class="ach${done ? ' done' : ''}"><span class="ach-icon">${done ? '🏆' : '🔒'}</span><span class="ach-text"><b>${a.name}</b><small>${a.desc} · $${a.pay}</small></span><span class="ach-prog">${done ? 'Done' : `${a.stat.endsWith('M') ? (v / 1000).toFixed(1) + ' / ' + a.goal / 1000 + ' km' : `${v} / ${a.goal}`}`}</span></div>`;
  }).join('');
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  return `<p class="sub kicker">Your stats</p><h2>Stats & achievements</h2><div class="stat-grid">${rows}</div>
    <p class="sub" style="margin-top:10px">Achievements: <b>${n} / ${ACHIEVEMENTS.length}</b></p><div class="ach-list">${ach}</div>`;
}
