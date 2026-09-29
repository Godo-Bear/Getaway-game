import { showCard, hideCard, controlsHtml } from '../ui/menus.js';
import { playStoryCards } from '../ui/storyCards.js';
import { showCaseBoard } from '../ui/caseBoard.js';
import { CHAPTERS } from '../story/chapters.js';
import { showSettings } from '../ui/settings.js';
import { audio } from '../core/audio.js';

// Shared behaviour for every "playing" mode (on foot, driving):
//   - pause menu (P / Esc, or automatically when the mouse lock is lost)
//   - "click to play" prompt for mouse lock
//   - fixed-size physics steps
//
// Concrete modes extend this class and implement:
//   buildWorld(params), simulate(dt), renderFrame(renderer), restart(), teardown()

const PHYSICS_STEP = 1 / 120; // physics runs at 120 Hz regardless of frame rate

export class PlayState {
  constructor(game, { needsPointerLock = true } = {}) {
    this.game = game;
    this.needsPointerLock = needsPointerLock;
    this.paused = false;
    this.over = false;     // game over screen showing
    this.inCard = false;   // a story card is showing (game frozen, no pause menu)
    this.accumulator = 0;
    this._pausedAt = 0;
    this.clickEl = document.getElementById('click-to-play');
    this._onClickToPlay = () => this.game.input.requestPointerLock();
    this._onLockChange = () => this._lockChanged();
  }

  enter(params = {}) {
    this.params = params;
    this.paused = false;
    this.over = false;
    this.accumulator = 0;
    hideCard();
    this.clickEl.addEventListener('click', this._onClickToPlay);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.buildWorld(params);
    this._updateClickPrompt();
  }

  exit() {
    this.clickEl.removeEventListener('click', this._onClickToPlay);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.clickEl.hidden = true;
    this.game.input.exitPointerLock();
    hideCard();
    this.teardown();
  }

  /** Are we waiting for the player to click so we can lock the mouse? */
  get waitingForLock() {
    const inp = this.game.input;
    return this.needsPointerLock && !inp.pointerLocked && !inp.pointerLockFailed && !inp.noMouseNeeded;
  }

  _updateClickPrompt() {
    this.clickEl.hidden = !(this.waitingForLock && !this.paused && !this.over && !this.inCard);
  }

  _lockChanged() {
    // Losing the mouse lock mid-game (Esc) pauses, like most PC games.
    if (!this.game.input.pointerLocked && this.needsPointerLock && !this.game.input.noMouseNeeded && !this.paused && !this.over && !this.inCard) {
      this.pause();
    }
    this._updateClickPrompt();
  }

  pause() {
    if (this.over || this.inCard) return;
    this.paused = true;
    this._pausedAt = performance.now();
    this.game.input.exitPointerLock();
    this._updateClickPrompt();
    const resume = () => this.resume();
    const back = () => { this.paused = false; this.pause(); };
    const run = this.game.chapterRun;
    const chapter = run && this.isStory ? CHAPTERS[run.chapterId] : null;
    const ghostOn = !!this.mode?.ghost;
    showCard('<h2>Paused</h2>', [
      { label: 'Resume', primary: true, onClick: resume },
      ...(chapter ? [{ label: 'Case Board', onClick: () => showCaseBoard(chapter, run.clues, back) }] : []),
      ...(this.canGhost ? [{
        label: ghostOn ? 'Ghost mode: turn OFF' : 'Ghost mode: turn ON',
        sub: ghostOn ? 'The police come back and you return to where you turned it on' : 'Remove the police and roam freely. Nothing counts while it\'s on',
        onClick: () => { this.resume(); this.toggleGhost(); },
      }] : []),
      ...(this.respawnLabel ? [{ label: this.respawnLabel, onClick: () => { this.resume(); this.respawnKey(); } }] : []),
      { label: 'Restart', onClick: () => { hideCard(); this.paused = false; this.restart(); this._afterResume(); } },
      { label: 'Settings', onClick: () => showSettings(this.game, back) },
      { label: 'Controls', onClick: () => showCard(controlsHtml(), [{ label: 'Back', primary: true, onClick: back }]) },
      { label: 'Quit to title', onClick: () => this.game.goTitle() },
    ]);
  }

  /** Can ghost mode be switched on here? (story parts only) */
  get canGhost() {
    return this.isStory && !!this.mode?.setGhost;
  }

  /** Ghost mode on/off (G, d-pad left, the pause menu, or the touch button). */
  toggleGhost() {
    if (!this.canGhost || this.over || this.inCard || this.paused) return;
    this.mode.setGhost(!this.mode.ghost);
  }

  /** What the R key does here, for the pause menu (touch screens have no R). */
  get respawnLabel() { return null; }
  respawnKey() {}

  /** Is this a story chapter (so the Case Board is available)? */
  get isStory() {
    return !!this.mode?.chapter;
  }

  /** Pause and jump straight to the Case Board (Tab key). */
  openCaseBoard() {
    const run = this.game.chapterRun;
    if (!this.isStory || !run || this.over || this.inCard || this.paused) return;
    this.pause();
    showCaseBoard(CHAPTERS[run.chapterId], run.clues, () => { this.paused = false; this.pause(); });
  }

  /** Play a multi-page story scene (skippable), freezing the game meanwhile. */
  showStoryCards(pages, finalLabel = 'Continue', onDone = () => {}) {
    this.inCard = true;
    this.game.input.exitPointerLock();
    this._updateClickPrompt();
    playStoryCards(pages, {
      finalLabel,
      onDone: () => { this.inCard = false; onDone(); this._afterResume(); },
    });
  }

  /**
   * Show a story card that freezes the game until the player continues.
   * Clicking the button also grabs the mouse lock (browsers need a click).
   */
  showStoryCard(html, buttonLabel = 'Continue', onDone = () => {}) {
    this.inCard = true;
    this.game.input.exitPointerLock();
    this._updateClickPrompt();
    showCard(html, [{
      label: buttonLabel, primary: true,
      onClick: () => { hideCard(); this.inCard = false; onDone(); this._afterResume(); },
    }]);
  }

  resume() {
    hideCard();
    this.paused = false;
    this._afterResume();
  }

  _afterResume() {
    if (this.needsPointerLock && !this.game.input.noMouseNeeded) this.game.input.requestPointerLock();
    this._updateClickPrompt();
  }

  /** Show a game-over (or level complete) card. */
  gameOver(html, extraButtons = [], { retryLabel = 'Try again', extraFirst = false } = {}) {
    this.over = true;
    this.game.input.exitPointerLock();
    this._updateClickPrompt();
    const retry = { label: retryLabel, primary: !extraFirst, onClick: () => { hideCard(); this.over = false; this.restart(); this._afterResume(); } };
    showCard(html, [
      ...(extraFirst ? [...extraButtons, retry] : [retry, ...extraButtons]),
      { label: 'Quit to title', onClick: () => this.game.goTitle() },
    ]);
  }

  update(dt) {
    const input = this.game.input;
    // (Ignore the key briefly after pausing: Esc both releases the mouse
    // lock AND may arrive as a key press, which would instantly un-pause.)
    if (input.wasPressed('pause') && !this.over && !this.inCard && performance.now() - this._pausedAt > 300) {
      if (this.paused) this.resume();
      else this.pause();
    }
    if (input.wasPressed('help')) this.game.hud.toggleControls();
    if (input.wasPressed('caseBoard')) this.openCaseBoard();
    if (input.wasPressed('ghost')) this.toggleGhost();
    this.game.touch?.setGhost(this.canGhost && !this.over && !this.inCard && !this.paused, !!this.mode?.ghost);
    if (input.wasPressed('debug')) this.game.showDebug = !this.game.showDebug;
    this.game.hud.update(dt);
    this._updateClickPrompt(); // e.g. hides the prompt once a gamepad is used

    const frozen = this.paused || this.over || this.inCard || this.waitingForLock;
    if (!frozen) {
      this.readInput(dt);
      // Fixed timestep: run physics in equal small steps so it behaves the
      // same at any frame rate (and fast objects don't tunnel through walls).
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= PHYSICS_STEP && steps < 12) {
        this.simulate(PHYSICS_STEP);
        this.accumulator -= PHYSICS_STEP;
        steps++;
      }
      if (steps === 12) this.accumulator = 0; // way behind: drop time rather than spiral
    }
    this.frameUpdate(dt, frozen);
    // While paused / in a menu: only quiet music (the state's own mix is skipped).
    const rain = this.weather?.rainVolume ?? 0;
    if (frozen) audio.setMix({ music: 0.3, intensity: 0.1, rain: rain * 0.5 });
    else audio.setMix({ rain, ...(this.audioMix?.() ?? {}) });
  }

  render(renderer) {
    this.renderFrame(renderer);
  }

  // --- to be implemented by subclasses ---
  buildWorld() {}
  readInput() {}   // once per frame, before the physics steps
  simulate() {}    // once per physics step
  frameUpdate() {}
  renderFrame() {}
  restart() {}
  teardown() {}
}
