/**
 * TWEAKS & DEBUG panel — tune CONFIG live on the phone. Values persist in
 * localStorage. "copy config" gives you a JSON diff to paste back into
 * src/config.ts DEFAULTS once something feels right.
 */
import { CFG, configDiff, FIELDS, resetConfig, saveConfig } from '../config';
import type { ConfigKey } from '../config';
import { ALL_CARDS } from '../content/cards';
import { EFFECTS } from '../content/effects';
import type { Game } from '../engine/game';
import type { App } from './app';
import { esc } from './dom';

function fieldHtml(key: ConfigKey): string {
  const f = FIELDS.find((x) => x.key === key)!;
  const v = CFG[key];
  const name = key.toLowerCase().replace(/_/g, ' ');
  if (typeof v === 'boolean') {
    return `<div class="tw"><div class="tw-top"><span>${name}</span><button class="tog ${v ? 'on' : ''}" data-bool="${key}">${v ? 'on' : 'off'}</button></div><small>${esc(f.desc)}</small></div>`;
  }
  if (f.choices) {
    const segs = f.choices.map((c) => `<button class="seg ${v === c ? 'on' : ''}" data-choice-key="${key}" data-val="${c}">${c}</button>`).join('');
    return `<div class="tw"><div class="tw-top"><span>${name}</span><b>${v}</b></div><div class="segrow">${segs}</div><small>${esc(f.desc)}</small></div>`;
  }
  return `<div class="tw"><div class="tw-top"><span>${name}</span><b data-out="${key}">${v}</b></div>
    <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" data-num="${key}">
    <small>${esc(f.desc)}</small></div>`;
}

export function openTweaks(g: Game, app: App): void {
  const groups = [...new Set(FIELDS.map((f) => f.group))];
  const cards = ALL_CARDS.map((c) => `<option value="${c.id}">${esc(c.art)} ${esc(c.id)}</option>`).join('');
  const effects = Object.values(EFFECTS).map((e) => `<option value="${e.id}">${e.icon} ${esc(e.name)}</option>`).join('');

  const body = app.openSheet(`
    <h2>⚙ tweaks & debug</h2>
    <p class="fx-note">changes apply live and persist on this device. some need a restart (marked).</p>
    <div class="dbg">
      <button class="btn ghost small" data-dbg="plus">+25 dopa</button>
      <button class="btn ghost small" data-dbg="minus">−10 dopa</button>
      <button class="btn ghost small" data-dbg="boss">jump to boss</button>
      <button class="btn ghost small" data-dbg="hour">end hour</button>
      <button class="btn ghost small" data-dbg="notif">notification</button>
      <button class="btn ghost small" data-dbg="restart">restart run</button>
    </div>
    <div class="dbg-row"><select data-sel="card"><option value="">show card…</option>${cards}</select></div>
    <div class="dbg-row"><select data-sel="effect"><option value="">give effect…</option>${effects}</select></div>
    ${groups.map((gr) => `<h3>${gr}</h3>${FIELDS.filter((f) => f.group === gr).map((f) => fieldHtml(f.key)).join('')}`).join('')}
    <div class="dbg">
      <button class="btn ghost small" data-dbg="copy">copy config JSON</button>
      <button class="btn ghost small" data-dbg="reset">reset all tweaks</button>
    </div>
    <textarea class="cfg-out" readonly></textarea>
    <button class="btn" data-close>done</button>
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
    }),
  );
  body.querySelectorAll<HTMLElement>('[data-bool]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.bool as ConfigKey;
      const v = !CFG[key];
      set(key, v);
      b.classList.toggle('on', v);
      b.textContent = v ? 'on' : 'off';
    }),
  );
  body.querySelectorAll<HTMLElement>('[data-choice-key]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.choiceKey as ConfigKey;
      set(key, Number(b.dataset.val));
      body.querySelectorAll(`[data-choice-key="${key}"]`).forEach((x) => x.classList.toggle('on', x === b));
      const top = b.closest('.tw')?.querySelector('b');
      if (top) top.textContent = String(b.dataset.val);
    }),
  );

  const dbg: Record<string, () => void> = {
    plus: () => g.addDopa(25, 'debug'),
    minus: () => g.addDopa(-10, 'debug'),
    boss: () => g.debugJumpBoss(),
    hour: () => g.debugNextHour(),
    notif: () => g.debugNotif(),
    restart: () => { app.closeSheet(); app.closeOverlayPause(); app.restart(); },
    reset: () => { resetConfig(); app.closeSheet(); openTweaks(g, app); },
    copy: () => {
      const json = JSON.stringify(configDiff(), null, 2);
      const ta = body.querySelector<HTMLTextAreaElement>('.cfg-out');
      if (ta) { ta.value = json; ta.style.display = 'block'; ta.select(); }
      navigator.clipboard?.writeText(json).then(() => app.toast('config copied'), () => {});
    },
  };
  body.querySelectorAll<HTMLElement>('[data-dbg]').forEach((b) => b.addEventListener('click', () => dbg[b.dataset.dbg!]?.()));

  body.querySelector<HTMLSelectElement>('[data-sel=card]')?.addEventListener('change', (e) => {
    const id = (e.target as HTMLSelectElement).value;
    if (id) { g.debugShowCard(id); app.toast(`showing ${id}`); }
  });
  body.querySelector<HTMLSelectElement>('[data-sel=effect]')?.addEventListener('change', (e) => {
    const id = (e.target as HTMLSelectElement).value;
    if (id && !g.saveEffect(id)) app.toast('saved list full', 'bad');
  });
}
