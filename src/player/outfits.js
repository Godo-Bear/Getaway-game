// Your look (the pause menu's "Your look"). Heist gear is the balaclava and
// hoodie with the cash bag; the others are everyday clothes, with your face
// showing and no bag. In broad daylight, a balaclava is what gets noticed:
// in everyday clothes, police and bounty hunters on the street only
// recognise you closer up (see ChapterFootMode). Guard uniforms in the
// casino and the prison are disguises on top of this.

const SKIN = 0xc4946f;

export const OUTFITS = [
  { id: 'heist', name: 'Heist gear', text: 'Balaclava, black hoodie, the cash bag. Perfect at night. In daylight, everyone stares.', colors: null, bag: true },
  { id: 'casual', name: 'Jeans and jacket', text: 'Blue jacket, jeans, white trainers. Nobody looks twice.', colors: { hoodie: 0x3a6ea8, trousers: 0x34466a, mask: SKIN, gloves: SKIN, shoes: 0xe8e8e8 }, bag: false },
  { id: 'tourist', name: 'Tourist', text: 'Orange shirt, khaki trousers, a camera-ready smile.', colors: { hoodie: 0xe8743a, trousers: 0xc8b48a, mask: SKIN, gloves: SKIN, shoes: 0x6a4a2a }, bag: false },
  { id: 'suit', name: 'Business suit', text: 'Grey suit, black shoes. You look like you work in a bank, not rob one.', colors: { hoodie: 0x50545e, trousers: 0x50545e, mask: SKIN, gloves: SKIN, shoes: 0x111111 }, bag: false },
  { id: 'ski', name: 'Ski jacket', text: 'Bright red ski jacket, dark trousers. Right at home in the snow.', colors: { hoodie: 0xd8344e, trousers: 0x20242c, mask: SKIN, gloves: 0x20242c, shoes: 0x3a3a3a }, bag: false },
];

export function outfitById(id) {
  return OUTFITS.find((o) => o.id === id) || OUTFITS[0];
}
