// HTML HUD overlays: one panel per split-screen view, plus a shared minimap and countdown.
import { ITEM_SVG, ordinal } from './shared.js';

const fmt = (t) => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = t % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
export { fmt as formatTime };

const ITEM_CYCLE = ['turbo', 'banana', 'rocket', 'shield', 'triple'];

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = '';
    this.views = [];
    this.countdown = el('div', 'countdown hidden', root);
    this.banner = el('div', 'race-banner hidden', root);
    this.mapWrap = el('div', 'minimap', root);
    this.map = el('canvas', '', this.mapWrap);
    this.map.width = this.map.height = 240;
    this.mapBg = null;
  }

  setViews(rects, karts) {
    for (const v of this.views) v.el.remove();
    this.views = rects.map((r, i) => {
      const k = karts[i];
      const e = el('div', 'hud-view' + (k ? '' : ' spectator'), this.root);
      Object.assign(e.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      const scale = Math.max(0.55, Math.min(1.25, Math.min(r.w / 1100, r.h / 620)));
      e.style.setProperty('--s', scale);
      if (!k) {
        e.innerHTML = '<div class="tv-tag">● LIVE</div>';
        return { el: e, kart: null };
      }
      e.style.setProperty('--pc', k.color);
      e.innerHTML = `
        <div class="hv-tl">
          <div class="hv-name"><i></i>${escapeHtml(k.name)}</div>
          <div class="hv-lap">LAP <b>1</b><span>/3</span></div>
          <div class="hv-time">0:00.00</div>
          <div class="hv-coins"><span class="coin"></span><b>0</b></div>
        </div>
        <div class="hv-item"><div class="islot"><span class="ic"></span><span class="cnt"></span></div><div class="lbl">ITEM</div></div>
        <div class="hv-pos"><b>1</b><span>st</span></div>
        <div class="hv-drift"><i></i></div>
        <div class="hv-msg"></div>
        <div class="hv-flash"></div>`;
      const q = (s) => e.querySelector(s);
      return {
        el: e, kart: k,
        lap: q('.hv-lap b'), laps: q('.hv-lap span'), time: q('.hv-time'), slot: q('.hv-item .islot'), ic: q('.hv-item .ic'), cnt: q('.hv-item .cnt'),
        coins: q('.hv-coins b'), pos: q('.hv-pos b'), suf: q('.hv-pos span'), posBox: q('.hv-pos'), msg: q('.hv-msg'), drift: q('.hv-drift'), driftBar: q('.hv-drift i'),
        flash: q('.hv-flash'), cache: {},
      };
    });
  }

  placeMinimap(layout, w, h) {
    const m = this.mapWrap.style;
    m.left = m.right = m.top = m.bottom = m.transform = '';
    const size = layout === 1 ? Math.min(230, h * 0.3) : layout === 2 ? Math.min(210, h * 0.26) : Math.min(210, h * 0.26);
    m.width = m.height = size + 'px';
    if (layout === 1) { m.right = '24px'; m.top = '24px'; }
    else if (layout === 2) { m.right = '18px'; m.top = '50%'; m.transform = 'translateY(-50%)'; }
    else { m.left = '50%'; m.top = '50%'; m.transform = 'translate(-50%,-50%)'; }
  }

  drawMapBackground(track) {
    const B = track.bounds, pad = 18, S = 240;
    const sc = (S - pad * 2) / Math.max(B.maxX - B.minX, B.maxZ - B.minZ);
    const ox = S / 2 - ((B.minX + B.maxX) / 2) * sc, oz = S / 2 - ((B.minZ + B.maxZ) / 2) * sc;
    this.mapT = (x, z) => [ox + x * sc, oz + z * sc];
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const path = () => { g.beginPath(); for (let i = 0; i <= track.N; i += 3) { const [x, y] = this.mapT(track.px[i % track.N], track.pz[i % track.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    g.lineJoin = 'round';
    path(); g.strokeStyle = 'rgba(15,10,40,0.55)'; g.lineWidth = 16; g.stroke();
    path(); g.strokeStyle = '#f4f1ff'; g.lineWidth = 8; g.stroke();
    const [sx, sy] = this.mapT(track.px[0], track.pz[0]);
    g.fillStyle = '#111'; g.fillRect(sx - 5, sy - 5, 10, 10);
    g.fillStyle = '#fff'; g.fillRect(sx - 5, sy - 5, 5, 5); g.fillRect(sx, sy, 5, 5);
    this.mapBg = c;
  }

  drawMap(karts) {
    const g = this.map.getContext('2d');
    g.clearRect(0, 0, 240, 240);
    if (this.mapBg) g.drawImage(this.mapBg, 0, 0);
    const sorted = [...karts].sort((a, b) => (a.isAI ? 0 : 1) - (b.isAI ? 0 : 1));
    for (const k of sorted) {
      const [x, y] = this.mapT(k.x, k.z);
      const r = k.isAI ? 5.5 : 8;
      g.beginPath(); g.arc(x, y, r + 2.5, 0, 7); g.fillStyle = '#1b1340'; g.fill();
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = k.color; g.fill();
      if (!k.isAI) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    }
  }

  showCountdown(text, cls = '') {
    this.countdown.className = 'countdown ' + cls;
    this.countdown.innerHTML = text;
  }
  hideCountdown() { this.countdown.className = 'countdown hidden'; }

  update(race) {
    for (const v of this.views) {
      const k = v.kart;
      if (!k) continue;
      const c = v.cache;
      const lap = Math.min(race.laps, Math.max(1, k.lap));
      set(c, 'lap', lap, () => { v.lap.textContent = lap; v.laps.textContent = '/' + race.laps; });
      const time = k.finished ? k.finishTime : race.raceTime;
      v.time.textContent = fmt(time);
      const place = race.placeOf(k);
      set(c, 'pos', place, () => {
        v.pos.textContent = place; v.suf.textContent = ordinal(place).replace(/\d+/, '');
        v.posBox.classList.remove('bump'); void v.posBox.offsetWidth; v.posBox.classList.add('bump');
        v.posBox.dataset.p = place;
      });
      set(c, 'coins', k.coins, () => { v.coins.textContent = k.coins; });
      if (k.rollT > 0) {
        v.ic.innerHTML = ITEM_SVG[ITEM_CYCLE[Math.floor(race.time * 12) % ITEM_CYCLE.length]];
        v.cnt.textContent = '';
        v.slot.classList.add('rolling'); c.item = null;
      } else {
        v.slot.classList.remove('rolling');
        const key = (k.item || '') + k.itemCount;
        set(c, 'item', key, () => {
          v.ic.innerHTML = k.item ? ITEM_SVG[k.item] : '';
          v.cnt.textContent = k.itemCount > 1 ? '×' + k.itemCount : '';
          v.slot.classList.toggle('has', !!k.item);
        });
      }
      // drift meter
      v.drift.style.opacity = k.drifting ? 1 : 0;
      v.driftBar.style.width = Math.min(100, (k.driftCharge / 2.9) * 100) + '%';
      v.drift.dataset.l = k.driftLevel;
      // messages
      let msg = '';
      if (k.finished) msg = `<span class="big">${ordinal(k.place)}!</span><span class="sub">${fmt(k.finishTime)}</span>`;
      else if (k.wrongWayT > 1) msg = '<span class="warn">WRONG WAY</span>';
      else if (k.msgT > 0) msg = k.msg;
      set(c, 'msg', msg, () => { v.msg.innerHTML = msg; });
      if (k.flashT > 0) { v.flash.style.opacity = Math.min(0.6, k.flashT * 1.5); k.flashT -= 1 / 60; } else v.flash.style.opacity = 0;
    }
  }

  banner_(html, ms = 1600) {
    this.banner.innerHTML = html;
    this.banner.className = 'race-banner';
    clearTimeout(this.bt);
    this.bt = setTimeout(() => (this.banner.className = 'race-banner hidden'), ms);
  }

  destroy() { this.root.innerHTML = ''; }
}

function set(cache, key, val, fn) { if (cache[key] !== val) { cache[key] = val; fn(); } }
function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; }
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
