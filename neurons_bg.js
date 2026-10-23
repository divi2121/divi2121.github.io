// Inner pages: a few faint, still neurons behind the content, echoing the home page.
// Nothing moves; the scene is regrown only when the window is resized.
(() => {
  const BG = '#1a1816';
  const AMBER = [232, 164, 92];
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function neuron(sx, sy, R) {
    const branches = [], arms = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < arms; j++) {
      branches.push({ x: sx, y: sy, a: (j / arms) * Math.PI * 2 + Math.random() * 0.6,
                      w: 1.6, len: 0, maxLen: R * (0.5 + Math.random() * 0.5), alive: true });
    }
    ctx.lineCap = 'round';
    for (let it = 0; it < 1500 && branches.some(b => b.alive); it++) {
      const born = [];
      for (const b of branches) {
        if (!b.alive) continue;
        const nx = b.x + Math.cos(b.a) * 2, ny = b.y + Math.sin(b.a) * 2;
        ctx.strokeStyle = `rgba(${AMBER},${0.03 + b.w * 0.03})`;
        ctx.lineWidth = b.w;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(nx, ny); ctx.stroke();
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
    ctx.fillStyle = `rgba(${AMBER},0.14)`;
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    const R = Math.min(W, H) * 0.1, N = Math.round(Math.min(10, Math.max(5, (W * H) / 150000)));
    const pts = [];
    for (let tries = 0; tries < 1000 && pts.length < N; tries++) {
      const x = Math.random() * W, y = 64 + Math.random() * (H - 64);
      if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < R * 1.8)) continue;
      pts.push([x, y]);
    }
    for (const [x, y] of pts) neuron(x, y, R);
  }

  let timer = null;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });
  draw();
})();
