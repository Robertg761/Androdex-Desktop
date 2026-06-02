import {
  bgSmoothNoise,
  createBgCanvas,
  getBg,
  getColor,
  getEffectIntensity,
  getEffectSize,
  rgba,
} from "./bgEffectsHelpers";

// ── Synapse background effect ──
export function initSynapse() {
  const canvas = createBgCanvas("synapse-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const GRID = 24;
  const MAX_PULSES = 20;
  const SPEED_MIN = 2;
  const SPEED_MAX = 22;
  const TRAIL_LEN = 12;

  let W = window.innerWidth;
  let H = window.innerHeight;
  let cols = Math.ceil(W / GRID);
  let rows = Math.ceil(H / GRID);

  interface Pulse {
    x: number;
    y: number;
    dx: number;
    dy: number;
  }
  const pulses: Pulse[] = [];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (canvas) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / GRID);
    rows = Math.ceil(H / GRID);
  }
  resize();
  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  function spawnPulse() {
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    if (Math.random() > 0.5) {
      pulses.push({
        x: -TRAIL_LEN,
        y: Math.floor(Math.random() * (rows + 1)) * GRID,
        dx: speed,
        dy: 0,
      });
    } else {
      pulses.push({
        x: Math.floor(Math.random() * (cols + 1)) * GRID,
        y: -TRAIL_LEN,
        dx: 0,
        dy: speed,
      });
    }
  }

  function draw() {
    if (document.body.dataset.bgPattern !== "synapse") {
      window.removeEventListener("resize", onResize);
      canvas?.remove();
      return;
    }
    requestAnimationFrame(draw);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const c = getColor();

    if (pulses.length < MAX_PULSES && Math.random() < 0.12) spawnPulse();

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      if (!p) continue;
      p.x += p.dx;
      p.y += p.dy;

      if (p.x > W + TRAIL_LEN || p.y > H + TRAIL_LEN) {
        pulses.splice(i, 1);
        continue;
      }

      const tx = p.x - (p.dx > 0 ? TRAIL_LEN : 0);
      const ty = p.y - (p.dy > 0 ? TRAIL_LEN : 0);
      const grad = ctx.createLinearGradient(tx, ty, p.x, p.y);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, c);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
}

// ── Rain effect ──
export function initRain() {
  const canvas = createBgCanvas("rain-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth;
  let H = window.innerHeight;

  interface Drop {
    x: number;
    y: number;
    len: number;
    speed: number;
    alpha: number;
  }
  const drops: Drop[] = [];
  const MAX_DROPS = 130;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (canvas) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  function spawn() {
    const len = 20 + Math.random() * 40;
    const speed = 4 + Math.random() * 8;
    drops.push({ x: Math.random() * W, y: -len, len, speed, alpha: 0.32 + Math.random() * 0.28 });
  }

  function draw() {
    if (document.body.dataset.bgPattern !== "rain") {
      window.removeEventListener("resize", onResize);
      canvas?.remove();
      return;
    }
    requestAnimationFrame(draw);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const c = getColor();
    const inten = getEffectIntensity();
    const speedMult = 0.35 + inten * 0.65;
    const sizeMult = getEffectSize();

    if (drops.length < MAX_DROPS * inten && Math.random() < 0.6 * inten) spawn();

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (!d) continue;
      d.y += d.speed * speedMult;
      const effLen = d.len * sizeMult;
      if (d.y > H + effLen) {
        drops.splice(i, 1);
        continue;
      }

      const grad = ctx.createLinearGradient(d.x, d.y - effLen, d.x, d.y);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, c);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = d.alpha;
      ctx.lineWidth = 1.3 * Math.min(2, Math.max(0.6, sizeMult));
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - effLen);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  draw();
}

// ── Constellations effect ──
export function initConstellations() {
  const canvas = createBgCanvas("constellations-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth;
  let H = window.innerHeight;
  const STAR_COUNT = 50;
  const CONNECT_DIST = 120;

  interface Star {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    phase: number;
  }
  let stars: Star[] = [];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (canvas) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (stars.length === 0) initStars();
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: 0.8 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  resize();
  const onResize = () => {
    resize();
    initStars();
  };
  window.addEventListener("resize", onResize);

  let t = 0;
  function draw() {
    if (document.body.dataset.bgPattern !== "constellations") {
      window.removeEventListener("resize", onResize);
      canvas?.remove();
      return;
    }
    requestAnimationFrame(draw);
    if (!ctx) return;
    t += 0.01;
    ctx.clearRect(0, 0, W, H);
    const c = getColor();

    for (const s of stars) {
      s.x += s.vx;
      s.y += s.vy;
      if (s.x < 0) s.x = W;
      if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H;
      if (s.y > H) s.y = 0;
    }

    ctx.strokeStyle = c;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const starI = stars[i];
        const starJ = stars[j];
        if (!starI || !starJ) continue;
        const dx = starI.x - starJ.x;
        const dy = starI.y - starJ.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT_DIST) {
          ctx.globalAlpha = (1 - dist / CONNECT_DIST) * 0.15;
          ctx.beginPath();
          ctx.moveTo(starI.x, starI.y);
          ctx.lineTo(starJ.x, starJ.y);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = c;
    for (const s of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + s.phase);
      ctx.globalAlpha = 0.15 + twinkle * 0.25;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
}

// ── Perlin Flow effect ──
export function initPerlinFlow() {
  const canvas = createBgCanvas("perlin-flow-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth;
  let H = window.innerHeight;
  let t = 0;

  interface Particle {
    x: number;
    y: number;
    life: number;
  }
  const particles: Particle[] = [];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (canvas) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (particles.length === 0) {
      for (let i = 0; i < 200; i++) {
        particles.push({ x: Math.random() * W, y: Math.random() * H, life: Math.random() });
      }
    }
  }
  resize();
  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  let cachedBg = "";
  let fadeStyle = "";
  function getFade(): string {
    const bg = getBg();
    if (bg !== cachedBg) {
      cachedBg = bg;
      const h = bg.replace("#", "");
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      fadeStyle = `rgba(${r},${g},${b},0.02)`;
    }
    return fadeStyle;
  }

  function draw() {
    if (document.body.dataset.bgPattern !== "perlin-flow") {
      window.removeEventListener("resize", onResize);
      canvas?.remove();
      return;
    }
    requestAnimationFrame(draw);
    if (!ctx) return;
    ctx.fillStyle = getFade();
    ctx.fillRect(0, 0, W, H);
    const c = getColor();
    particles.forEach((p) => {
      const n = bgSmoothNoise(p.x * 0.004 + t * 0.0008, p.y * 0.004 + 100);
      const angle = n * Math.PI * 6;
      const speed = 1 + bgSmoothNoise(p.x * 0.003, p.y * 0.003 + 50) * 1.5;
      p.x += Math.cos(angle) * speed;
      p.y += Math.sin(angle) * speed;
      p.life -= 0.001;
      if (p.life <= 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
        p.x = Math.random() * W;
        p.y = Math.random() * H;
        p.life = 1;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.globalAlpha = p.life * 0.15;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    t++;
  }
  draw();
}

// ── Petals effect ──
export function initPetals() {
  const canvas = createBgCanvas("petals-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth;
  let H = window.innerHeight;

  interface Petal {
    x: number;
    y: number;
    size: number;
    rot: number;
    vr: number;
    vy: number;
    drift: number;
    driftSpeed: number;
    wobble: number;
  }
  const petals: Petal[] = [];

  function makePetal(): Petal {
    return {
      x: Math.random() * W,
      y: -10 - Math.random() * 40,
      size: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.03,
      vy: 0.3 + Math.random() * 0.6,
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.008 + Math.random() * 0.012,
      wobble: 0.3 + Math.random() * 0.8,
    };
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (canvas) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (petals.length === 0) {
      for (let i = 0; i < 30; i++) {
        const p = makePetal();
        p.y = Math.random() * H;
        petals.push(p);
      }
    }
  }
  resize();
  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  function draw() {
    if (document.body.dataset.bgPattern !== "petals") {
      window.removeEventListener("resize", onResize);
      canvas?.remove();
      return;
    }
    requestAnimationFrame(draw);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const c = getColor();
    const sz = getEffectSize();
    petals.forEach((p) => {
      p.y += p.vy;
      p.rot += p.vr;
      p.drift += p.driftSpeed;
      p.x += Math.sin(p.drift) * p.wobble;
      if (p.y > H + 15) Object.assign(p, makePetal());
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(-p.size * 0.2 * sz, 0, p.size * 0.6 * sz, p.size * 0.3 * sz, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.ellipse(p.size * 0.2 * sz, 0, p.size * 0.6 * sz, p.size * 0.3 * sz, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }
  draw();
}

// ── Sparkles effect ──
export function initSparkles() {
  const canvas = createBgCanvas("sparkles-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth;
  let H = window.innerHeight;

  interface Sparkle {
    x: number;
    y: number;
    size: number;
    phase: number;
    speed: number;
    life: number;
  }
  const sparkles: Sparkle[] = [];

  function makeSpark(): Sparkle {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      size: 2 + Math.random() * 5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.015 + Math.random() * 0.03,
      life: 0.5 + Math.random() * 0.5,
    };
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (canvas) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sparkles.length === 0) {
      for (let i = 0; i < 35; i++) sparkles.push(makeSpark());
    }
  }
  resize();
  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  function drawStar(x: number, y: number, r: number, c: string, alpha: number) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = c;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.15, -r * 0.15, r, 0);
    ctx.quadraticCurveTo(r * 0.15, r * 0.15, 0, r);
    ctx.quadraticCurveTo(-r * 0.15, r * 0.15, -r, 0);
    ctx.quadraticCurveTo(-r * 0.15, -r * 0.15, 0, -r);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (document.body.dataset.bgPattern !== "sparkles") {
      window.removeEventListener("resize", onResize);
      canvas?.remove();
      return;
    }
    requestAnimationFrame(draw);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const c = getColor();
    const sizeMult = getEffectSize();
    sparkles.forEach((s) => {
      s.phase += s.speed;
      const twinkle = Math.sin(s.phase);
      const alpha = Math.max(0, twinkle) * 0.25 * s.life;
      const scale = 0.5 + Math.max(0, twinkle) * 0.5;
      if (alpha > 0.01) drawStar(s.x, s.y, s.size * scale * sizeMult, c, alpha);
      if (s.phase > Math.PI * 6) Object.assign(s, makeSpark());
    });
    ctx.globalAlpha = 1;
  }
  draw();
}

// ── Embers effect ──
export function initEmbers() {
  const canvas = createBgCanvas("embers-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth;
  let H = window.innerHeight;

  interface Ember {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    life: number;
    maxLife: number;
    wobble: number;
    spark: boolean;
  }
  const embers: Ember[] = [];

  function makeEmber(): Ember {
    return {
      x: Math.random() * W,
      y: H + Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.3 - Math.random() * 0.8,
      r: 0.3 + Math.random() * 0.6,
      life: 0,
      maxLife: 220 + Math.random() * 220,
      wobble: Math.random() * Math.PI * 2,
      spark: false,
    };
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (canvas) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (embers.length === 0) {
      for (let i = 0; i < 60; i++) {
        const e = makeEmber();
        e.y = Math.random() * H;
        e.life = Math.random() * e.maxLife;
        embers.push(e);
      }
    }
  }
  resize();
  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  function draw() {
    if (document.body.dataset.bgPattern !== "embers") {
      window.removeEventListener("resize", onResize);
      canvas?.remove();
      return;
    }
    requestAnimationFrame(draw);
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const color = getColor();

    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      if (!e) continue;
      e.wobble += 0.03;
      e.x += e.vx + Math.sin(e.wobble) * 0.5;
      e.y += e.vy;
      e.life++;
      if (e.life > e.maxLife || e.y < -20) {
        embers.splice(i, 1);
        if (embers.length < 70) embers.push(makeEmber());
        continue;
      }
      if (!e.spark && Math.random() < 0.003) e.spark = true;
      const lifeRatio = e.life / e.maxLife;
      const fade = Math.min(1, Math.min(lifeRatio * 4, (1 - lifeRatio) * 3));
      const sz = getEffectSize();
      const r = e.r * (e.spark ? 2.4 : 1) * sz;
      const a = (e.spark ? 0.9 : 0.55) * fade;

      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 4);
      g.addColorStop(0, rgba(color, a));
      g.addColorStop(0.4, rgba(color, a * 0.3));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(e.x - r * 4, e.y - r * 4, r * 8, r * 8);

      ctx.fillStyle = rgba("#ffffff", a * 0.6);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      e.spark = false;
    }

    if (Math.random() < 0.015) {
      const bx = Math.random() * W;
      for (let i = 0; i < 5; i++) {
        const e = makeEmber();
        e.x = bx + (Math.random() - 0.5) * 40;
        e.y = H - 10;
        e.vy *= 1.5;
        embers.push(e);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }
  draw();
}
