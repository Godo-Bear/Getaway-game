// A "chapter run": your progress through one playthrough of a chapter.
// It lives on the game object (game.chapterRun) so it carries over from the
// rooftops to the drive (and later to the deduction screen).

export function newChapterRun(chapterId) {
  return {
    chapterId,
    parts: {},          // partName -> seconds taken
    caught: 0,          // times caught or busted (all parts)
    clues: new Set(),   // clue ids found this run
  };
}

/** Get the current run for this chapter, or start a new one. */
export function getChapterRun(game, chapterId) {
  if (!game.chapterRun || game.chapterRun.chapterId !== chapterId) {
    game.chapterRun = newChapterRun(chapterId);
  }
  return game.chapterRun;
}

export function totalTime(run) {
  return Object.values(run.parts).reduce((a, b) => a + b, 0);
}

/** Chapter rating: gold / silver / bronze, from time, clues and catches. */
export function chapterRating(run, totalClues) {
  const t = totalTime(run);
  const clues = run.clues.size;
  if (t < 300 && clues >= totalClues - 1 && run.caught === 0) return 'gold';
  if (t < 480 && clues >= Math.ceil(totalClues / 2) && run.caught <= 2) return 'silver';
  return 'bronze';
}
