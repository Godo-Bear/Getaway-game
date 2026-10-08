// Who looks like what: the crew, uniforms, and random people on the street.
// Each look is a PlayerModel colours object with its `style` inside
// (see playerModel.js), so it can be passed straight to new PlayerModel(look).

import { HAIR_COLOURS } from './outfits.js';

/** The crew (and the old crew). Their main colour matches their colour in the story. */
export const CREW_LOOKS = {
  mags: { hoodie: 0xd8782a, trousers: 0x2a2a30, shoes: 0x3a2a1a, skin: 0xe0b090, hair: 0xb8b4ac, shirt: 0x2a2a30,
    style: { top: 'jacket', hair: 'bun' } },
  theo: { hoodie: 0x2a2438, trousers: 0x2a2438, shoes: 0x111111, skin: 0x8d5a3b, hair: 0x1a1410, tie: 0xc77dff,
    style: { top: 'suit', hair: 'short', beard: 'stubble' } },
  ricky: { hoodie: 0x2f9a4c, trousers: 0x34466a, shoes: 0xe8e8e8, skin: 0xc4946f, hair: 0x3a2416, shirt: 0xe8e8e8,
    style: { top: 'jacket', hair: 'spiky', build: 0.95 } },
  juno: { hoodie: 0xff8ac8, trousers: 0x2a2a3a, shoes: 0x3a3d45, skin: 0xe8c4a0, hair: 0xe0c890, shirt: 0xffffff,
    style: { top: 'ski', hair: 'ponytail', build: 0.92 } },
  // Paz: the fixer in Porto Sereno (linen shirt, sunglasses, panama hat)
  paz: { hoodie: 0xe8dcc0, trousers: 0x3a4a5a, shoes: 0x6a4a2a, skin: 0xb07a50, hair: 0x1a1410, shirt: 0xe8dcc0, hat: 0xd8c890,
    style: { top: 'jacket', hair: 'curly', hat: 'cap', build: 1.0 } },
  // Kitsu: the hacker in Neon Kōji (orange tracksuit, headphones, an undercut)
  kitsu: { hoodie: 0xff7a2a, trousers: 0x1a1b20, shoes: 0xe8e8e8, skin: 0xe8c4a0, hair: 0x1a1b20, hat: 0x1a1b20, shirt: 0xffffff,
    style: { top: 'tracksuit', hair: 'undercut', hat: 'headphones', face: 'aviators', build: 0.9, height: 0.95 } },
  nova: { hoodie: 0x1fb8d8, trousers: 0x1a1b20, shoes: 0x1a1b20, skin: 0xf0c8a8, hair: 0xa86ae8,
    style: { top: 'hoodie', hair: 'bob', build: 0.9, height: 0.96 } },
  vince: { hoodie: 0x4a3322, trousers: 0x23201c, shoes: 0x1a1410, skin: 0xd2a27f, hair: 0x2a2420, shirt: 0xd8d0c0,
    style: { top: 'jacket', hair: 'short', beard: 'beard', build: 1.1 } },
  marla: { hoodie: 0x1f6a4a, trousers: 0x1a1c22, skin: 0xc98f6a, hair: 0x9a3a1a, gloves: 0x111111,
    style: { top: 'hoodie', hair: 'long', build: 0.92 } },
  lindqvist: { hoodie: 0xe8e0d0, trousers: 0x2a2a30, shoes: 0x1a1410, skin: 0xf0c8a8, hair: 0xd8d4cc, shirt: 0x1a1b20, tie: 0x8a1f2e,
    style: { top: 'suit', hair: 'short', beard: 'goatee', build: 1.1 } },
  hask: { hoodie: 0x16181c, trousers: 0x16181c, hat: 0x16181c, skin: 0xe0b090, hair: 0x6a6660, shoes: 0x0a0a0a,
    style: { top: 'uniform', hat: 'guard', badge: true, beard: 'stubble', build: 1.2 } },
  dex: { hoodie: 0x2a3a5a, trousers: 0x1a1e2a, skin: 0x5a3a24, hair: 0x1a1410, style: { top: 'tee', hair: 'buzz', build: 1.15 } },
  hale: { hoodie: 0x6a5a48, trousers: 0x3a3630, skin: 0xe0b090, hair: 0x6a4422, style: { top: 'suit', hair: 'short', beard: 'moustache' } },
};

/** A crew member's look, with any colours changed (e.g. a prison jumpsuit). */
export function crewLook(id, over = {}) {
  const base = CREW_LOOKS[id] || CREW_LOOKS.vince;
  return { ...base, ...over, style: { ...base.style, ...over.style } };
}

// ---- Uniforms
export const GUARD_LOOK = { hoodie: 0x2a3140, trousers: 0x1c2028, hat: 0x1c2028, style: { top: 'uniform', hat: 'guard', badge: true } };
export const POLICE_LOOK = { hoodie: 0x1d3566, trousers: 0x151d30, hat: 0x141c30, shoes: 0x0a0a0a, tie: 0x0e1424,
  style: { top: 'uniform', hat: 'police', badge: true, tie: true } };
export const HUNTER_LOOK = { hoodie: 0xc8301e, trousers: 0x2a2e36, hat: 0x1a1b20, shoes: 0x0a0a0a, shirt: 0x1a1b20, gloves: 0x1a1a1a,
  style: { top: 'jacket', hat: 'beanie', beard: 'stubble', build: 1.1 } };
export const CASINO_SECURITY = { hoodie: 0x16161a, trousers: 0x16161a, shoes: 0x0a0a0a, tie: 0x16161a,
  style: { top: 'suit', face: 'shades', build: 1.12 } };
// Sentinel Security (Frostvale): black parkas, red stripe, black beanies
export const SENTINEL_LOOK = { hoodie: 0x1a1c22, trousers: 0x14161a, hat: 0x101114, shirt: 0xc8202e, shoes: 0x0a0a0a, gloves: 0x101114,
  style: { top: 'ski', hat: 'beanie', build: 1.12 } };
// Porto Sereno customs officers: white short-sleeved shirts, navy trousers and caps
export const CUSTOMS_LOOK = { hoodie: 0xf2f2ee, trousers: 0x1a2440, hat: 0x1a2440, shoes: 0x0a0a0a, tie: 0x1a2440,
  style: { top: 'uniform', hat: 'police', badge: true, tie: true } };
export const JUMPSUIT_LOOK = { hoodie: 0xe0701c, trousers: 0xe0701c, shoes: 0x222222, style: { top: 'jumpsuit', hair: 'buzz' } };

// ---- People on the street
const SKINS = [0xf0c8a8, 0xe0b090, 0xc4946f, 0x8d5a3b, 0x5a3a24];
const CLOTHES = [0x3b6fb6, 0xc24a4a, 0x4a9a5a, 0xd9a441, 0x7a5aa8, 0x2e2e36, 0xe0e0e0, 0x8a5a3a, 0xd46a9a, 0x3aa3a0, 0x5a6a3a, 0x34466a];
const TROUSERS = [0x34466a, 0x24324a, 0x2e2e36, 0x1a1b20, 0xc8b48a, 0x5a4a3a, 0x7a7f8a];
const SHOES = [0x1a1a1a, 0xe8e8e8, 0x6a4a2a, 0x3a3d45, 0xc0283a];
const HAIRS = ['short', 'short', 'buzz', 'spiky', 'curly', 'bob', 'long', 'ponytail', 'bun', 'bald', 'afro', 'braids', 'dreads', 'slick', 'undercut'];
const NATURAL_HAIR = HAIR_COLOURS.slice(0, 8);
const BEARDS = ['stubble', 'moustache', 'goatee', 'beard', 'chops'];
const WINTER_HATS = [0xc0283a, 0x3a6ea8, 0xe8e8e8, 0x2f8a4c, 0xe8c040, 0x1a1b20, 0xe87ab0];

/**
 * A random passer-by. cold: dressed for snow (ski jackets, bobble hats).
 * @param {() => number} rng
 */
export function randomPerson(rng, { cold = false } = {}) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const top = cold ? pick(['ski', 'ski', 'jacket', 'sweater']) : pick(['hoodie', 'jacket', 'jacket', 'tee', 'tee', 'sweater', 'suit', 'leather', 'tracksuit', 'hawaiian', 'vest', 'trench']);
  const hatChance = cold ? 0.7 : 0.22;
  const hat = rng() < hatChance ? (cold ? pick(['beanie', 'bobble']) : pick(['beanie', 'cap', 'cap', 'bucket', 'fedora', 'headphones', 'beret'])) : null;
  return {
    hoodie: pick(CLOTHES), trousers: top === 'suit' ? pick([0x2e2e36, 0x24324a, 0x3a3d45]) : pick(TROUSERS),
    shoes: pick(SHOES), skin, hair: rng() < 0.92 ? pick(NATURAL_HAIR) : pick(HAIR_COLOURS),
    hat: cold ? pick(WINTER_HATS) : pick(CLOTHES), shirt: rng() < 0.7 ? 0xe6e2da : pick(CLOTHES), tie: pick([0x7a1f2e, 0x24324a, 0x2f5a3a]),
    gloves: cold && rng() < 0.6 ? pick([0x1a1b20, 0x3a3d45, 0xc0283a]) : skin,
    style: {
      top, hair, hat,
      beard: hair !== 'bob' && hair !== 'ponytail' && hair !== 'bun' && rng() < 0.25 ? pick(BEARDS) : null,
      face: rng() < (cold ? 0.3 : 0.12) ? (rng() < 0.3 ? 'aviators' : 'shades') : 'face',
      build: 0.88 + rng() * 0.26,
      height: 0.92 + rng() * 0.12,
    },
  };
}
