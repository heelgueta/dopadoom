/**
 * TWEAKS & DEBUG — every CONFIG value as a slider/toggle, live, saved on this
 * device. "COPY CONFIG" gives a JSON diff to paste into src/config.ts.
 */
import { CFG, configDiff, FIELDS, resetConfig, saveConfig } from '../config';
import type { ConfigKey } from '../config';
import type { Game } from '../engine/game';
import type { App } from './app';

function fieldHtml(key: ConfigKey): string {
  const f = FIELDS.find((x) => x.key === key)!;
  const v = CFG[key];
  const name = key.replace(/_/g, ' ');
  if (typeof v === 'boolean') {
    return `<div class="tw"><span>${name}</span><button class="tog ${v ? 'on' : ''}" data-bool="${key}">${v ? 'ON' : 'OFF'}</button></div>`;
  }
  return `<div class="tw col"><div class="tw-top"><span>${name}</span><b data-out="${key}">${v}</b></div>
    <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" data-num="${key}"></div>`;
}

export function openTweaks(g: Game, app: App): void {
  const groups = [...new Set(FIELDS.map((f) => f.group))];
  const body = app.openSheet(`
    <h2>TWEAKS</h2>
    <p class="dim small">LIVE + SAVED ON THIS DEVICE</p>
    <div class="grid2">
      <button class="btn small" data-dbg="plus">+10 DOPA</button>
      <button class="btn small" data-dbg="minus">−10 DOPA</button>
      <button class="btn small" data-dbg="ad">AD NEXT</button>
      <button class="btn small" data-dbg="premium">PREMIUM NEXT</button>
      <button class="btn small" data-dbg="notif">NOTIF</button>
      <button class="btn small" data-dbg="gift">GIFT</button>
    </div>
    ${groups.map((gr) => `<h3>${gr.toUpperCase()}</h3>${FIELDS.filter((f) => f.group === gr).map((f) => fieldHtml(f.key)).join('')}`).join('')}
    <div class="grid2">
      <button class="btn small" data-dbg="copy">COPY CONFIG</button>
      <button class="btn small" data-dbg="reset">RESET ALL</button>
    </div>
    <textarea class="cfg-out" readonly></textarea>
    <button class="btn" data-close>DONE</button>
  `);

  const set = (key: ConfigKey, v: number | boolean) => {
    (CFG as Record<ConfigKey, number | boolean>)[key] = v;
    saveConfig();
    app.applyCfgClasses();
  };

  body.querySelectorAll<HTMLInputElement>('input[data-num]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const key = inp.dataset.num as ConfigKey;
      set(key, Number(inp.value));
      const out = body.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = inp.value;
    }));
  body.querySelectorAll<HTMLElement>('[data-bool]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.bool as ConfigKey;
      const v = !CFG[key];
      set(key, v);
      b.classList.toggle('on', v);
      b.textContent = v ? 'ON' : 'OFF';
    }));

  const playing = () => g.s.phase === 'playing' || g.s.phase === 'website';
  const dbg: Record<string, () => void> = {
    plus: () => playing() && g.addDopa(10, 'DEBUG'),
    minus: () => playing() && g.addDopa(-10, 'DEBUG'),
    ad: () => playing() && g.debugAd(false),
    premium: () => playing() && g.debugAd(true),
    notif: () => playing() && g.debugNotif(),
    gift: () => playing() && g.gift(),
    reset: () => { resetConfig(); app.closeSheet(); openTweaks(g, app); },
    copy: () => {
      const json = JSON.stringify(configDiff(), null, 2);
      const ta = body.querySelector<HTMLTextAreaElement>('.cfg-out');
      if (ta) { ta.value = json; ta.style.display = 'block'; ta.select(); }
      navigator.clipboard?.writeText(json).then(() => app.toast('COPIED'), () => {});
    },
  };
  body.querySelectorAll<HTMLElement>('[data-dbg]').forEach((b) => b.addEventListener('click', () => dbg[b.dataset.dbg!]?.()));
}
