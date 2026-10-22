// Home page background: faint neurons breathe; one fires on its own, its spike reaches
// the chip and the headline types itself. Hovering near a neuron makes it fire too.
(() => {
  const BG = '#1a1816';
  const AMBER = [232, 164, 92];
  const MSG = [["Hello, I'm ", false], ['Divyanshi', true], ['.', false]];
  const TOTAL = MSG.reduce((n, s) => n + s[0].length, 0);
  // timing: first spike at 0.5 s, 0.7 s to reach the chip, 55 ms per letter -> name done ~2.4 s
  const FIRST_FIRE_MS = 500, SPIKE_MS = 700, LETTER_MS = 55;

  const canvas = document.getElementById('net');
  const slot = document.querySelector('.chip-slot');
  const heading = document.getElementById('typed');
  const typedEl = document.getElementById('typed-text');
  const heroText = document.querySelector('.hero-text');
  if (!canvas || !slot || !typedEl || !heroText) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, R = 0, S = 0, chip = null, neurons = [], traces = [];
  const st = {
    typed: TOTAL, typing: false, lastType: 0, activity: 0,
    started: null, autoFired: false, lastMove: performance.now(), nextIdle: 0, mouse: null,
  };

  // element bounds in page coordinates, so scrolling does not move the scene
  function docRect(el) {
    const r = el.getBoundingClientRect();
    return { x0: r.left + scrollX, y0: r.top + scrollY, x1: r.right + scrollX, y1: r.bottom + scrollY };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    resize();
    const c = docRect(slot);
    S = c.x1 - c.x0;
    chip = { cx: (c.x0 + c.x1) / 2, cy: (c.y0 + c.y1) / 2 };
    const box = docRect(heroText);
    R = Math.min(W, H) * 0.1;
    const N = Math.round(Math.min(18, Math.max(8, (W * H) / 90000)));
    const top = 64 + R * 0.4;            // keep clear of the menu bar
    neurons = [];
    for (let tries = 0; tries < 2000 && neurons.length < N; tries++) {
      const x = R * 0.5 + Math.random() * (W - R), y = top + Math.random() * (H - top - R * 0.5);
      if (x > box.x0 - R * 0.6 && x < box.x1 + R * 0.6 && y > box.y0 - R * 0.6 && y < box.y1 + R * 0.6) continue;
      if (neurons.some(n => Math.hypot(n.x - x, n.y - y) < R * 1.4)) continue;
      neurons.push(makeNeuron(x, y));
    }
    traces = buildTraces();
  }

  function makeNeuron(sx, sy) {
    // grow the dendrites once, up front, into three Path2Ds by thickness
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    const branches = [], arms = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < arms; j++) {
      branches.push({ x: sx, y: sy, a: (j / arms) * Math.PI * 2 + Math.random() * 0.6,
                      w: 1.8, len: 0, maxLen: R * (0.5 + Math.random() * 0.5), alive: true });
    }
    for (let it = 0; it < 1500 && branches.some(b => b.alive); it++) {
      const born = [];
      for (const b of branches) {
        if (!b.alive) continue;
        const nx = b.x + Math.cos(b.a) * 2, ny = b.y + Math.sin(b.a) * 2;
        const p = paths[b.w > 1.3 ? 0 : b.w > 0.7 ? 1 : 2];
        p.moveTo(b.x, b.y); p.lineTo(nx, ny);
        b.x = nx; b.y = ny; b.len += 2;
        b.a += (Math.random() - 0.5) * 0.3;
        b.w *= 0.995;
        if (Math.random() < 0.03 && branches.length + born.length < 250) {
          born.push({ x: b.x, y: b.y, a: b.a + 0.35 + Math.random() * 0.3, w: b.w * 0.72, len: 0,
                      maxLen: Math.max(8, (b.maxLen - b.len) * 0.9), alive: true });
          b.a -= 0.2; b.w *= 0.85;
        }
        if (b.w < 0.35 || b.len > b.maxLen) b.alive = false;
      }
      branches.push(...born);
    }
    // curved axon from the soma to the chip's left side
    const ex = chip.cx - S / 2 - 6, ey = chip.cy + (Math.random() - 0.5) * S * 0.5;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2, d = Math.hypot(ex - sx, ey - sy);
    const nxp = -(ey - sy) / d, nyp = (ex - sx) / d, bend = (Math.random() - 0.5) * 0.5 * d;
    const qx = mx + nxp * bend, qy = my + nyp * bend;
    const pts = [];
    for (let k = 0; k <= 80; k++) {
      const u = k / 80;
      pts.push([(1 - u) ** 2 * sx + 2 * (1 - u) * u * qx + u * u * ex,
                (1 - u) ** 2 * sy + 2 * (1 - u) * u * qy + u * u * ey]);
    }
    const axon = new Path2D();
    pts.forEach(([x, y], i) => (i ? axon.lineTo(x, y) : axon.moveTo(x, y)));
    return { x: sx, y: sy, paths, axon, pts, glow: 0, fireT: null, lastFire: -1e9,
             warm: 0, breathP: Math.random() * 6.28, breathT: 4000 + Math.random() * 3000 };
  }

  function buildTraces() {
    const half = S / 2, die = S * 0.22, per = 5, out = [];
    for (let s = 0; s < 4; s++) {
      const ca = Math.cos(s * Math.PI / 2), sa = Math.sin(s * Math.PI / 2);
      const rot = ([x, y]) => [x * ca - y * sa, x * sa + y * ca];
      for (let k = 0; k < per; k++) {
        const u = -half + S * (k + 1) / (per + 1);
        const x1 = -half + S * (0.08 + Math.random() * 0.08);
        const v = Math.max(-die, Math.min(die, u * 0.5));
        out.push({ pts: [[-half, u], [x1, u], [-die - 2, v]].map(rot), phase: Math.random() * 6.28 });
      }
    }
    return out;
  }

  function renderText() {
    let left = st.typed, html = '';
    for (const [s, accent] of MSG) {
      const part = s.slice(0, Math.max(0, left));
      left -= s.length;
      if (!part) break;
      html += accent ? `<span class="name">${part}</span>` : part;
    }
    typedEl.innerHTML = html + '<span class="cursor"></span>';
    heading.classList.toggle('typing', st.typing);
  }

  // role, sentence and buttons fade in once the name is typed
  function reveal() { heroText.classList.remove('pending'); }

  function fire(n, t) {
    if (t - n.lastFire < 1500) return;
    n.lastFire = t; n.fireT = t; n.glow = 1;
  }

  function randomNeuron() { return neurons[Math.floor(Math.random() * neurons.length)]; }

  function update(t) {
    if (st.started === null) st.started = t;
    if (!st.autoFired && t - st.started > FIRST_FIRE_MS && neurons.length) {
      st.autoFired = true;
      fire(randomNeuron(), t);
    }
    // nobody moving: let a random neuron fire every 5-9 s
    if (neurons.length && t - st.lastMove > 8000 && t > st.nextIdle) {
      fire(randomNeuron(), t);
      st.nextIdle = t + 5000 + Math.random() * 4000;
    }
    for (const n of neurons) {
      const d = st.mouse ? Math.hypot(st.mouse.x - n.x, st.mouse.y - n.y) : Infinity;
      if (d < R * 0.5) fire(n, t);
      const warmTarget = Math.max(0, 1 - d / (R * 1.5)) ** 2;   // brightens as the mouse approaches
      n.warm += (warmTarget - n.warm) * 0.08;
      if (n.fireT !== null && t - n.fireT >= SPIKE_MS) {        // spike reached the chip
        n.fireT = null;
        st.activity = 1;
        if (st.typed < TOTAL && !st.typing) { st.typing = true; renderText(); }
      }
      n.glow *= 0.985;
    }
    if (st.typing && t - st.lastType > LETTER_MS) {
      st.typed++; st.lastType = t;
      if (st.typed >= TOTAL) { st.typing = false; reveal(); }
      renderText();
    }
    if (!st.typing) st.activity *= 0.985;
  }

  function at(n, f) {                    // point at fractional index f along the axon
    const i = Math.max(0, Math.min(79, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
    const [x0, y0] = n.pts[i], [x1, y1] = n.pts[i + 1];
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
  }

  function drawSpike(n, f) {
    // amber tail fading out behind a white-hot tip, drawn additively so overlaps glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const len = 24;
    for (let j = len; j >= 0; j--) {
      const g = f - j * 0.7;
      if (g < 0) continue;
      const [x, y] = at(n, g);
      const k = 1 - j / len;
      ctx.fillStyle = `rgba(${AMBER},${0.5 * k * k})`;
      ctx.beginPath(); ctx.arc(x, y, 0.8 + 2.2 * k, 0, Math.PI * 2); ctx.fill();
    }
    const [hx, hy] = at(n, f);
    const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
    halo.addColorStop(0, `rgba(${AMBER},0.45)`); halo.addColorStop(1, `rgba(${AMBER},0)`);
    ctx.fillStyle = halo; ctx.fillRect(hx - 14, hy - 14, 28, 28);
    ctx.fillStyle = 'rgba(255,246,232,0.95)';
    ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawChip(t) {
    const c = ctx, half = S / 2, die = S * 0.22, a = st.activity;
    c.save();
    c.translate(chip.cx, chip.cy);
    if (a > 0.01) {                      // soft halo
      const hg = c.createRadialGradient(0, 0, half * 0.5, 0, 0, S * 1.5);
      hg.addColorStop(0, `rgba(${AMBER},${0.22 * a})`); hg.addColorStop(1, `rgba(${AMBER},0)`);
      c.fillStyle = hg; c.fillRect(-S * 1.5, -S * 1.5, S * 3, S * 3);
    }
    for (let s = 0; s < 4; s++) {        // pins
      c.save(); c.rotate(s * Math.PI / 2);
      c.fillStyle = `rgba(${AMBER},${0.3 + 0.5 * a})`;
      for (let k = 0; k < 5; k++) c.fillRect(-half - 5, -half + S * (k + 1) / 6 - 0.75, 5, 1.5);
      c.restore();
    }
    const pkg = () => { c.beginPath(); c.roundRect(-half, -half, S, S, S * 0.12); };
    const g = c.createLinearGradient(-half, -half, half, half);
    g.addColorStop(0, '#2a2521'); g.addColorStop(1, '#0f0e0d');
    c.fillStyle = g; pkg(); c.fill();
    const rim = c.createLinearGradient(-half, -half, half, half);   // lit from the top left
    rim.addColorStop(0, 'rgba(255,230,200,0.35)'); rim.addColorStop(1, `rgba(${AMBER},0.08)`);
    c.strokeStyle = rim; c.lineWidth = 1; pkg(); c.stroke();
    c.lineWidth = 0.7;
    for (const tr of traces) {
      const lit = 0.12 + a * 0.7 * (0.5 + 0.5 * Math.sin(t * 0.008 + tr.phase));
      c.strokeStyle = `rgba(${AMBER},${lit})`;
      c.beginPath();
      tr.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    }
    const dg = c.createLinearGradient(-die, -die, die, die);
    dg.addColorStop(0, '#4a3726'); dg.addColorStop(1, '#1d1610');
    c.fillStyle = dg; c.fillRect(-die, -die, die * 2, die * 2);
    c.strokeStyle = `rgba(${AMBER},${0.35 + 0.5 * a})`; c.lineWidth = 0.8;
    c.strokeRect(-die, -die, die * 2, die * 2);
    c.fillStyle = `rgba(${AMBER},${0.1 + 0.6 * a})`;                // glowing core
    c.fillRect(-die * 0.35, -die * 0.35, die * 0.7, die * 0.7);
    c.save(); pkg(); c.clip();
    const gl = c.createRadialGradient(-half * 0.5, -half * 0.6, 0, -half * 0.5, -half * 0.6, S * 0.7);
    gl.addColorStop(0, 'rgba(255,240,225,0.07)'); gl.addColorStop(1, 'rgba(255,240,225,0)');
    c.fillStyle = gl; c.fillRect(-half, -half, S, S);
    const q = (t % 5000) / 1800;        // sheen sweep
    if (q < 1) {
      c.globalCompositeOperation = 'lighter';
      const pos = -S + q * 2 * S, w = S * 0.3;
      const sg = c.createLinearGradient(pos - w, pos - w, pos + w, pos + w);
      sg.addColorStop(0, 'rgba(255,236,210,0)');
      sg.addColorStop(0.5, 'rgba(255,236,210,0.12)');
      sg.addColorStop(1, 'rgba(255,236,210,0)');
      c.fillStyle = sg; c.fillRect(-half, -half, S, S);
    }
    c.restore();
    c.restore();
  }

  function draw(t) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, -scrollX * dpr, -scrollY * dpr);
    ctx.fillStyle = BG; ctx.fillRect(scrollX, scrollY, W, H);
    ctx.lineCap = 'round';
    for (const n of neurons) {
      const breath = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / n.breathT + n.breathP);
      const a = Math.min(1, 0.03 + 0.12 * breath + 0.3 * n.warm + 0.75 * n.glow);
      ctx.strokeStyle = `rgba(${AMBER},${0.03 + 0.08 * n.warm + 0.3 * n.glow})`; ctx.lineWidth = 0.8;
      ctx.stroke(n.axon);
      [1.6, 1.0, 0.5].forEach((w, i) => {
        ctx.strokeStyle = `rgba(${AMBER},${a * [1, 0.8, 0.6][i]})`; ctx.lineWidth = w;
        ctx.stroke(n.paths[i]);
      });
      ctx.save();
      ctx.shadowColor = `rgb(${AMBER})`; ctx.shadowBlur = 20 * n.glow;
      ctx.fillStyle = `rgba(${AMBER},${Math.min(1, 0.1 + 0.2 * breath + 0.4 * n.warm + 0.88 * n.glow)})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, 3 + 1.5 * breath, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (n.fireT !== null) drawSpike(n, Math.min(1, (t - n.fireT) / SPIKE_MS) * 80);
    }
    drawChip(t);
  }

  function loop(t) {
    update(t);
    draw(t);
    requestAnimationFrame(loop);
  }

  // mouse and touch in page coordinates
  const point = (x, y) => { st.mouse = { x: x + scrollX, y: y + scrollY }; st.lastMove = performance.now(); };
  window.addEventListener('mousemove', e => point(e.clientX, e.clientY));
  window.addEventListener('mouseleave', () => { st.mouse = null; });
  window.addEventListener('touchstart', e => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  window.addEventListener('touchmove', e => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); if (reduceMotion) draw(0); }, 150);
  });

  // measure while the full headline is still on the page, then clear it for typing
  layout();
  if (reduceMotion) {
    renderText();
    draw(0);
  } else {
    st.typed = 0;
    renderText();
    heroText.classList.add('pending');
    setTimeout(reveal, 4000);            // safety net if the first spike never arrives
    requestAnimationFrame(loop);
  }
})();
