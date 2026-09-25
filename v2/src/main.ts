/**
 * DOPADOOM v2 — boot. Game (rules) + App (DOM) + one animation-frame loop.
 * The old full-featured prototype lives in /pilot1.
 */
import '@fontsource/jersey-10/400.css';
import './styles.css';
import { Game } from './engine/game';
import { App } from './ui/app';

const game = new Game();
const app = new App(game, document.getElementById('app')!);

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  app.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// desktop console: dd.game.s
(window as unknown as { dd: unknown }).dd = { game, app };
