// A "chapter run": your progress through one playthrough of a chapter.
// It lives on the game object (game.chapterRun) so it carries over from part
// to part and into the deduction.

export function newChapterRun(chapterId) {
  return {
    chapterId,
    parts: {},          // partId -> seconds taken
    caught: 0,          // times caught or busted (all parts)
    clues: new Set(),   // clue ids found this run
    bought: new Set(),  // ...of which bought on the Case Board (don't count for the rating)
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

/**
 * Chapter rating: gold / silver / bronze, from time, clues and catches.
 * Each chapter sets its own target times (chapter.rating.gold / silver, seconds).
 */
export function chapterRating(run, chapter) {
  const totalClues = Object.keys(chapter.clues).length;
  const t = totalTime(run);
  const clues = run.clues.size - (run.bought?.size || 0); // bought clues don't count
  const r = chapter.rating || { gold: 300, silver: 480 };
  if (t < r.gold && clues >= totalClues - 1 && run.caught === 0) return 'gold';
  if (t < r.silver && clues >= Math.ceil(totalClues / 2) && run.caught <= 2) return 'silver';
  return 'bronze';
}
