// Your look: mix and match (pause menu / Settings -> Your look). Pick a face
// (balaclava, face showing, or sunglasses), hat, top, trousers, shoes,
// gloves, skin tone, and whether you carry the cash bag. The presets are
// just starting points.
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

const BASE = { face: 'mask', skin: 0xc4946f, hat: 0x2a2b31, top: 0x24252b, legs: 0x1a1e2a, shoes: 0x0f0f10, gloves: 0x151515, bag: true };

export const OUTFITS = [
  { id: 'heist', name: 'Heist gear', text: 'Balaclava, black hoodie, the cash bag. Perfect at night.', look: { ...BASE } },
  { id: 'casual', name: 'Jeans and jacket', text: 'Nobody looks twice.', look: { ...BASE, face: 'face', hat: null, top: 0x3a6ea8, legs: 0x34466a, shoes: 0xe8e8e8, gloves: null, bag: false } },
  { id: 'tourist', name: 'Tourist', text: 'Sunglasses and an orange shirt.', look: { ...BASE, face: 'shades', hat: 0xe8c040, top: 0xe8743a, legs: 0xc8b48a, shoes: 0x6a4a2a, gloves: null, bag: false } },
  { id: 'suit', name: 'Business suit', text: 'You look like you work in a bank.', look: { ...BASE, face: 'face', hat: null, top: 0x3a3d45, legs: 0x3a3d45, shoes: 0x1a1b20, gloves: null, bag: false } },
  { id: 'ski', name: 'Ski jacket', text: 'Right at home in the snow.', look: { ...BASE, face: 'shades', hat: 0xe8e8e8, top: 0xd8344e, legs: 0x1a1b20, shoes: 0x3a3d45, gloves: 0x1a1b20, bag: false } },
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
  };
}
