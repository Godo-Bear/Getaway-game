// Your look: mix and match (pause menu / Settings -> Your look). Pick a face
// (balaclava, face showing, or sunglasses), skin tone, hair and beard, a hat,
// what kind of top, and colours for everything, and whether you carry the
// cash bag. The presets are just starting points.
//
// In broad daylight, a balaclava is what gets noticed: with your face
// showing, police and bounty hunters on the street only recognise you
// closer up (see ChapterFootMode). Guard uniforms in the casino and the
// prison are disguises on top of this.

export const PALETTE = [
  0x1a1b20, 0x3a3d45, 0x7a7f8a, 0xe8e8e8, 0x24324a, 0x34466a, 0x3a6ea8, 0x7ab8e8,
  0xc0283a, 0xd8344e, 0xe8743a, 0xe8c040, 0x2f8a4c, 0x5a6a3a, 0x6a3aa8, 0xe87ab0,
  0x6a4a2a, 0xc8b48a,
];
export const SKINS = [0xf0c8a8, 0xe0b090, 0xc4946f, 0x8d5a3b, 0x5a3a24];
export const FACES = [
  { id: 'mask', name: 'Balaclava' },
  { id: 'face', name: 'Face showing' },
  { id: 'shades', name: 'Sunglasses' },
];
export const HAIRS = [
  { id: 'short', name: 'Short' }, { id: 'buzz', name: 'Buzz cut' }, { id: 'spiky', name: 'Spiky' },
  { id: 'curly', name: 'Curly' }, { id: 'mohawk', name: 'Mohawk' }, { id: 'bob', name: 'Bob' },
  { id: 'long', name: 'Long' }, { id: 'ponytail', name: 'Ponytail' }, { id: 'bun', name: 'Bun' },
  { id: 'bald', name: 'Bald' },
];
export const HAIR_COLOURS = [0x1a1410, 0x3a2416, 0x6a4422, 0xb08850, 0xe0c890, 0x9a3a1a, 0x8a8680, 0xe8e4dc, 0xe87ab0, 0x3a8ae8, 0x5ac87a, 0xa86ae8];
export const BEARDS = [
  { id: null, name: 'None' }, { id: 'stubble', name: 'Stubble' }, { id: 'moustache', name: 'Moustache' },
  { id: 'goatee', name: 'Goatee' }, { id: 'beard', name: 'Beard' },
];
export const HATS = [
  { id: null, name: 'None' }, { id: 'beanie', name: 'Beanie' }, { id: 'bobble', name: 'Bobble hat' }, { id: 'cap', name: 'Cap' },
];
export const TOPS = [
  { id: 'hoodie', name: 'Hoodie' }, { id: 'jacket', name: 'Jacket' }, { id: 'tee', name: 'T-shirt' },
  { id: 'sweater', name: 'Jumper' }, { id: 'suit', name: 'Suit' }, { id: 'ski', name: 'Ski jacket' },
];

const BASE = {
  face: 'mask', skin: 0xc4946f, hair: 'short', hairColour: 0x3a2416, beard: null,
  hatStyle: 'beanie', hat: 0x2a2b31, topStyle: 'hoodie', top: 0x24252b, legs: 0x1a1e2a, shoes: 0x0f0f10, gloves: 0x151515, bag: true,
};

export const OUTFITS = [
  { id: 'heist', name: 'Heist gear', text: 'Balaclava, black hoodie, the cash bag. Perfect at night.', look: { ...BASE } },
  { id: 'casual', name: 'Jeans and jacket', text: 'Nobody looks twice.', look: { ...BASE, face: 'face', hat: null, topStyle: 'jacket', top: 0x3a6ea8, legs: 0x34466a, shoes: 0xe8e8e8, gloves: null, bag: false } },
  { id: 'tourist', name: 'Tourist', text: 'Sunglasses, a cap and an orange T-shirt.', look: { ...BASE, face: 'shades', hatStyle: 'cap', hat: 0xe8c040, topStyle: 'tee', top: 0xe8743a, legs: 0xc8b48a, shoes: 0x6a4a2a, gloves: null, bag: false } },
  { id: 'suit', name: 'Business suit', text: 'You look like you work in a bank.', look: { ...BASE, face: 'face', hat: null, topStyle: 'suit', top: 0x3a3d45, legs: 0x3a3d45, shoes: 0x1a1b20, gloves: null, bag: false } },
  { id: 'ski', name: 'Ski jacket', text: 'Right at home in the snow.', look: { ...BASE, face: 'shades', hatStyle: 'bobble', hat: 0xe8e8e8, topStyle: 'ski', top: 0xd8344e, legs: 0x1a1b20, shoes: 0x3a3d45, gloves: 0x1a1b20, bag: false } },
];

export function outfitById(id) {
  return OUTFITS.find((o) => o.id === id) || OUTFITS[0];
}

/** Your current look (from your settings; older saves only had a preset). */
export function currentLook(settings) {
  return { ...BASE, ...(settings.look || outfitById(settings.outfit).look) };
}

/** Is your face showing? (then street patrols notice you later in daylight) */
export function faceShowing(look) {
  return look.face !== 'mask';
}

/** The PlayerModel colours for a look. gloves/hat null = bare hands / no hat. */
export function lookColors(look) {
  return {
    hoodie: look.top, trousers: look.legs, shoes: look.shoes, skin: look.skin,
    mask: look.face === 'mask' ? 0x111318 : look.skin,
    gloves: look.gloves ?? look.skin,
    hair: look.hairColour ?? BASE.hairColour, hat: look.hat ?? BASE.hat,
  };
}

/** The PlayerModel shapes for a look: face, hair, beard, hat, kind of top, the bag. */
export function lookStyle(look) {
  return {
    face: look.face, hair: look.hair || 'short', beard: look.beard || null,
    hat: look.hat == null ? null : (look.hatStyle || 'beanie'),
    top: look.topStyle || 'hoodie', bag: !!look.bag,
  };
}
