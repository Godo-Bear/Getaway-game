// Everyone who can be a suspect: the old crew (Chapters 1-4) and the new
// crew you recruit in Chapter 5. Each chapter lists its own suspects
// (chapter.suspects); older chapters use the old crew.

export const SUSPECTS = {
  vince: {
    name: 'Vince',
    role: 'The planner',
    color: '#ffb020',
    bio: 'Planned the Harbor Trust job down to the minute. Owns a bar by the docks called The Anchor.',
  },
  marla: {
    name: 'Marla',
    role: 'The hacker',
    color: '#7dffb0',
    bio: 'Handles the alarms and the cameras. Always writes in green ink. Was on the radio with you all night.',
  },
  dex: {
    name: 'Dex',
    role: 'The driver and muscle',
    color: '#6fb3ff',
    bio: 'Was supposed to keep the engine running out back. Went missing during the heist.',
  },
  hale: {
    name: 'Det. Hale',
    role: 'The detective',
    color: '#ff5a6a',
    bio: 'The detective hunting you. Seems to know a lot about how your crew works.',
  },
  // ---- The new crew (Chapter 5)
  nova: {
    name: 'Nova',
    role: 'The hacker',
    color: '#39e6ff',
    bio: 'Nineteen, fast and very good. Runs everything from a battered laptop covered in stickers. Nobody knows where she learned her tricks.',
  },
  mags: {
    name: 'Mags',
    role: 'The safecracker',
    color: '#ff9a3d',
    bio: 'Thirty years of opening things that aren\'t hers. Just out of prison, and says she has nothing left to lose.',
  },
  theo: {
    name: 'Theo',
    role: 'The inside man',
    color: '#c77dff',
    bio: 'A blackjack dealer at the Lucky Star casino. He hates the owner, Silas Crane, and knows every door in the building.',
  },
  ricky: {
    name: 'Ricky',
    role: 'The driver',
    color: '#7dff8a',
    bio: 'Talks too much, drives better than anyone in the city. Dex\'s cousin: Dex sent him your way.',
  },
  juno: {
    name: 'Juno',
    role: 'The mountain guide',
    color: '#ff9ad5',
    bio: 'Ex-ski patrol in Frostvale. Knows every slope, cable and crevasse on the mountain, and flies a wingsuit for fun. Theo\'s cousin.',
  },
  paz: {
    name: 'Paz',
    role: 'The fixer',
    color: '#ffd070',
    bio: 'Knows everyone in Porto Sereno: the harbour master, the fish sellers, the customs men who look the other way. Joins the crew when it lands there.',
  },
  kitsu: {
    name: 'Kitsu',
    role: 'The hacker',
    color: '#ff7a2a',
    bio: 'A hacker in Neon Kōji who signs everything with a neon fox. Can turn a city\'s traffic lights, cameras and trains into her toys. Invited the crew to the city, and stays with them.',
  },
  // ---- Frostvale (Chapters 9-12): not crew, just people in the story
  lindqvist: {
    name: 'Mr. Lindqvist',
    role: 'The buyer',
    color: '#e8e0d0',
    bio: 'Buys gold with no questions asked, from a suite at the Summit Hotel. Smiles a lot.',
  },
  hask: {
    name: 'Commander Hask',
    role: 'Sentinel Security',
    color: '#ff4050',
    bio: 'Runs the private army the Glacier Bank hired after the vault job. Thinks the town belongs to him now.',
  },
  // ---- Porto Sereno and Neon Kōji: not crew either
  varga: {
    name: 'Inspector Varga',
    role: 'A crooked harbour cop',
    color: '#d8b070',
    bio: 'Porto Sereno\'s harbour police inspector. Takes money from everyone, and wants the crew\'s too.',
  },
  ryu: {
    name: 'Ryu',
    role: 'The Silver Dragons',
    color: '#c8d8ff',
    bio: 'Runs Neon Kōji\'s fastest street-racing crew, the Silver Dragons. A white racing jacket with a silver dragon on the back.',
  },
};

/** The old crew (and the detective): the suspects in Chapters 1-4. */
export const OLD_CREW = ['vince', 'marla', 'dex', 'hale'];

/** A chapter's suspects, in board order. */
export const suspectsOf = (chapter) => chapter?.suspects || OLD_CREW;
