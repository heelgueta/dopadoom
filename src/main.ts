/**
 * DOPADOOM — boot. Game (rules, no DOM) + App (DOM, listens to game events)
 * + one requestAnimationFrame loop. ?seed=abc replays a run.
 */
import './styles.css';
import { Game } from './engine/game';
import { App } from './ui/app';

const seed = new URLSearchParams(location.search).get('seed') ?? undefined;
const game = new Game(seed);
const app = new App(game, document.getElementById('app')!);

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); // clamp: tab switches don't nuke your dopa
  last = now;
  game.update(dt);
  app.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// handy in the desktop console: dd.game.s, dd.game.addDopa(50,'x')
(window as unknown as { dd: unknown }).dd = { game, app };
