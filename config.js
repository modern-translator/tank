/* =========================================================
   IRON ECLIPSE — configuration, utilities, and campaign data
   ========================================================= */
(() => {
  'use strict';

  const IRON = (window.IRON = window.IRON || {});

  const W = 1600;
  const H = 900;
  const TAU = Math.PI * 2;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist2 = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  };
  const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));

  const angleDiff = (from, to) => {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  const rotateToward = (from, to, maxDelta) => {
    const d = angleDiff(from, to);
    if (Math.abs(d) <= maxDelta) return to;
    return from + Math.sign(d) * maxDelta;
  };

  const angleLerp = (from, to, t) => from + angleDiff(from, to) * t;

  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const circleRectOverlap = (cx, cy, radius, rect) => {
    const nx = clamp(cx, rect.x, rect.x + rect.w);
    const ny = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < radius * radius;
  };

  const pointInEllipse = (x, y, e) => {
    const dx = (x - e.x) / e.rx;
    const dy = (y - e.y) / e.ry;
    return dx * dx + dy * dy <= 1;
  };

  // Liang–Barsky style segment/AABB check.
  const segmentIntersectsRect = (x1, y1, x2, y2, rect) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let tmin = 0;
    let tmax = 1;

    const clip = (origin, delta, min, max) => {
      if (Math.abs(delta) < 1e-9) {
        return origin >= min && origin <= max;
      }
      let t1 = (min - origin) / delta;
      let t2 = (max - origin) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };

    if (!clip(x1, dx, rect.x, rect.x + rect.w)) return false;
    if (!clip(y1, dy, rect.y, rect.y + rect.h)) return false;
    return tmin <= tmax;
  };

  const rayRectDistance = (ox, oy, dx, dy, rect, maxDist) => {
    let tmin = 0;
    let tmax = maxDist;

    const clip = (origin, delta, min, max) => {
      if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
      let t1 = (min - origin) / delta;
      let t2 = (max - origin) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };

    if (!clip(ox, dx, rect.x, rect.x + rect.w)) return null;
    if (!clip(oy, dy, rect.y, rect.y + rect.h)) return null;
    if (tmax < 0 || tmin > maxDist) return null;
    return Math.max(tmin, 0);
  };

  const distanceToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return dist(px, py, x1, y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = clamp(t, 0, 1);
    return dist(px, py, x1 + dx * t, y1 + dy * t);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  Object.assign(IRON, {
    W,
    H,
    TAU,
    utils: {
      clamp,
      lerp,
      rand,
      randInt,
      pick,
      dist,
      dist2,
      angleDiff,
      rotateToward,
      angleLerp,
      mulberry32,
      circleRectOverlap,
      pointInEllipse,
      segmentIntersectsRect,
      rayRectDistance,
      distanceToSegment,
      formatTime,
    },
  });

  IRON.ENEMY_TYPES = {
    scout: {
      label: 'Scout',
      hp: 58,
      speed: 165,
      radius: 18,
      damage: 9,
      bulletSpeed: 360,
      fireRate: 1.55,
      range: 510,
      desiredRange: 285,
      score: 100,
      color: '#ff8b5f',
      accent: '#ffcf9d',
      drawType: 'scout',
      pattern: 'single',
    },
    turret: {
      label: 'Sentry',
      hp: 120,
      speed: 0,
      radius: 23,
      damage: 12,
      bulletSpeed: 410,
      fireRate: 2.15,
      range: 660,
      desiredRange: 0,
      score: 160,
      color: '#ff6c50',
      accent: '#ffd09d',
      drawType: 'turret',
      pattern: 'burst',
      burst: 3,
    },
    drone: {
      label: 'Drone',
      hp: 44,
      speed: 230,
      radius: 14,
      damage: 7,
      bulletSpeed: 480,
      fireRate: 1.25,
      range: 470,
      desiredRange: 215,
      score: 120,
      color: '#ff7d9c',
      accent: '#ffd4df',
      drawType: 'drone',
      pattern: 'burst',
      burst: 2,
    },
    artillery: {
      label: 'Artillery',
      hp: 135,
      speed: 52,
      radius: 25,
      damage: 22,
      bulletSpeed: 0,
      fireRate: 3.9,
      range: 760,
      desiredRange: 520,
      score: 230,
      color: '#ffc15f',
      accent: '#ffe6a6',
      drawType: 'artillery',
      pattern: 'artillery',
    },
    heavy: {
      label: 'Heavy',
      hp: 250,
      speed: 74,
      radius: 31,
      damage: 16,
      bulletSpeed: 335,
      fireRate: 2.45,
      range: 620,
      desiredRange: 365,
      score: 320,
      color: '#ff6259',
      accent: '#ffb0a3',
      drawType: 'heavy',
      pattern: 'fan',
    },
  };

  IRON.UPGRADES = [
    {
      key: 'damage',
      name: 'Overpressure Rounds',
      tag: 'OFFENSE',
      icon: 'damage',
      desc: 'Cannon shells deal 25% more damage.',
      stat: 'DAMAGE +25%',
      max: 2,
    },
    {
      key: 'reload',
      name: 'Autoloader Rig',
      tag: 'OFFENSE',
      icon: 'reload',
      desc: 'Cannon reload time reduced by 18%.',
      stat: 'RELOAD −18%',
      max: 2,
    },
    {
      key: 'armor',
      name: 'Reactive Plating',
      tag: 'DEFENSE',
      icon: 'armor',
      desc: 'Hull integrity increased by 30 points.',
      stat: 'HULL +30',
      max: 2,
    },
    {
      key: 'mobility',
      name: 'Servo Track Array',
      tag: 'MOBILITY',
      icon: 'mobility',
      desc: 'Movement speed increased by 12%.',
      stat: 'SPEED +12%',
      max: 2,
    },
    {
      key: 'shield',
      name: 'Aegis Capacitor',
      tag: 'DEFENSE',
      icon: 'shield',
      desc: 'Shield capacity +30 and recharge +25%.',
      stat: 'SHIELD +30',
      max: 2,
    },
    {
      key: 'dash',
      name: 'Phase Drive',
      tag: 'MOBILITY',
      icon: 'dash',
      desc: 'Dash cooldown reduced by 25%; longer phase window.',
      stat: 'DASH COOLDOWN −25%',
      max: 2,
    },
  ];

  IRON.LEVELS = [
    {
      id: 'dust',
      index: 1,
      sector: 'SECTOR 01',
      name: 'DUST DIVIDE',
      subtitle: 'CANYON OUTPOST 7A',
      objective: 'Break the outpost perimeter and eliminate all hostiles.',
      intel: 'A relay outpost is coordinating enemy armor across the canyon. Command wants it erased.',
      threat: 'Scout armor / sentry batteries',
      hazard: 'Sandstorm fronts',
      hint: 'Use the rock formations for cover. Sentries cannot track you through solid ground.',
      spawn: { x: 800, y: 755 },
      seed: 1101,
      ambient: 'sand',
      enemyHpMul: 1,
      enemyDamageMul: 1,
      elite: 'SANDFANG',
      palette: {
        bg0: '#0e0906',
        bg1: '#24160d',
        bg2: '#3a2313',
        ground: '#2b1b10',
        fog: 'rgba(255, 165, 90, 0.08)',
        accent: '#ffb45f',
        accent2: '#ff764b',
        enemy: '#ff7153',
        steel: '#37291f',
        steelLight: '#65503b',
        rock: '#5a3a24',
        rockLight: '#8b5b36',
        border: '#6a4528',
        particle: '#ffc982',
        grid: 'rgba(255, 191, 124, 0.055)',
        text: '#ffe0bb',
      },
      obstacles: [
        { x: 170, y: 210, w: 195, h: 112, type: 'rock' },
        { x: 1200, y: 160, w: 220, h: 135, type: 'rock' },
        { x: 452, y: 520, w: 142, h: 112, type: 'container' },
        { x: 1040, y: 555, w: 152, h: 102, type: 'container' },
        { x: 760, y: 290, w: 100, h: 100, type: 'pillar' },
        { x: 205, y: 650, w: 125, h: 58, type: 'barrier' },
        { x: 1270, y: 655, w: 125, h: 58, type: 'barrier' },
      ],
      icePatches: [],
      lavaVents: [],
      waves: [
        { spawns: [{ type: 'scout', count: 3 }, { type: 'turret', count: 1 }] },
        {
          spawns: [
            { type: 'scout', count: 4 },
            { type: 'turret', count: 2 },
          ],
        },
        {
          elite: true,
          spawns: [
            { type: 'scout', count: 2 },
            { type: 'turret', count: 2 },
            { type: 'elite', base: 'scout', name: 'SANDFANG', count: 1 },
          ],
        },
      ],
    },
    {
      id: 'cryo',
      index: 2,
      sector: 'SECTOR 02',
      name: 'CRYO RELAY',
      subtitle: 'FROZEN SIGNAL STATION',
      objective: 'Storm the relay station and destroy its drone control core.',
      intel: 'The outpost has gone dark under a drone swarm. Ice and magnetic interference make traction unreliable.',
      threat: 'Strike drones / long-range artillery',
      hazard: 'Unstable ice fields',
      hint: 'Your tank slides on ice. Release the throttle early and use the dash to break traction.',
      spawn: { x: 800, y: 755 },
      seed: 2217,
      ambient: 'snow',
      enemyHpMul: 1.16,
      enemyDamageMul: 1.08,
      elite: 'CRYO WARDEN',
      palette: {
        bg0: '#040a12',
        bg1: '#0a1a2a',
        bg2: '#102b3e',
        ground: '#10283a',
        fog: 'rgba(105, 224, 255, 0.075)',
        accent: '#67e5ff',
        accent2: '#8dc7ff',
        enemy: '#ff708a',
        steel: '#1b3342',
        steelLight: '#3f687a',
        rock: '#1e4050',
        rockLight: '#3e7183',
        border: '#2f647b',
        particle: '#b9f3ff',
        grid: 'rgba(125, 227, 255, 0.065)',
        text: '#d9f7ff',
      },
      obstacles: [
        { x: 290, y: 255, w: 172, h: 92, type: 'container' },
        { x: 1135, y: 235, w: 195, h: 104, type: 'container' },
        { x: 760, y: 470, w: 118, h: 118, type: 'pillar' },
        { x: 192, y: 570, w: 76, h: 180, type: 'barrier' },
        { x: 1332, y: 555, w: 76, h: 190, type: 'barrier' },
        { x: 545, y: 155, w: 145, h: 70, type: 'pipe' },
      ],
      icePatches: [
        { x: 560, y: 690, rx: 185, ry: 92 },
        { x: 1060, y: 435, rx: 210, ry: 122 },
        { x: 385, y: 420, rx: 150, ry: 78 },
      ],
      lavaVents: [],
      waves: [
        { spawns: [{ type: 'drone', count: 3 }, { type: 'scout', count: 2 }] },
        {
          spawns: [
            { type: 'drone', count: 4 },
            { type: 'artillery', count: 2 },
          ],
        },
        {
          elite: true,
          spawns: [
            { type: 'drone', count: 3 },
            { type: 'scout', count: 2 },
            { type: 'elite', base: 'artillery', name: 'CRYO WARDEN', count: 1 },
          ],
        },
      ],
    },
    {
      id: 'ash',
      index: 3,
      sector: 'SECTOR 03',
      name: 'ASH FOUNDRY',
      subtitle: 'MOLTEN ARMOR WORKS',
      objective: 'Cut through the foundry and disable the titan assembly line.',
      intel: 'The Sovereign is being fueled here. The foundry floor is unstable and periodically vents superheated plasma.',
      threat: 'Heavy armor / artillery / mines',
      hazard: 'Erupting plasma vents',
      hint: 'Watch the vent rings. A red ring means the vent is about to fire.',
      spawn: { x: 800, y: 760 },
      seed: 3319,
      ambient: 'ember',
      enemyHpMul: 1.32,
      enemyDamageMul: 1.16,
      elite: 'SIEGEBREAKER',
      palette: {
        bg0: '#0b0505',
        bg1: '#1d0b0a',
        bg2: '#2d1110',
        ground: '#281211',
        fog: 'rgba(255, 105, 70, 0.075)',
        accent: '#ff9454',
        accent2: '#ff5148',
        enemy: '#ff6a58',
        steel: '#33201e',
        steelLight: '#66403a',
        rock: '#3a1b18',
        rockLight: '#70352d',
        border: '#642c25',
        particle: '#ffad7b',
        grid: 'rgba(255, 146, 104, 0.055)',
        text: '#ffded0',
      },
      obstacles: [
        { x: 235, y: 235, w: 158, h: 105, type: 'container' },
        { x: 1210, y: 210, w: 180, h: 112, type: 'container' },
        { x: 510, y: 545, w: 120, h: 120, type: 'pillar' },
        { x: 1010, y: 510, w: 120, h: 120, type: 'pillar' },
        { x: 775, y: 350, w: 90, h: 66, type: 'barrier' },
        { x: 190, y: 690, w: 150, h: 62, type: 'barrier' },
        { x: 1260, y: 700, w: 150, h: 62, type: 'barrier' },
      ],
      icePatches: [],
      lavaVents: [
        { x: 365, y: 455, r: 68, offset: 0 },
        { x: 1230, y: 425, r: 62, offset: 1.8 },
        { x: 795, y: 690, r: 78, offset: 3.3 },
      ],
      waves: [
        { spawns: [{ type: 'heavy', count: 2 }, { type: 'scout', count: 3 }] },
        {
          spawns: [
            { type: 'heavy', count: 2 },
            { type: 'artillery', count: 2 },
            { type: 'drone', count: 2 },
          ],
        },
        {
          elite: true,
          spawns: [
            { type: 'heavy', count: 1 },
            { type: 'turret', count: 2 },
            { type: 'elite', base: 'heavy', name: 'SIEGEBREAKER', count: 1 },
          ],
        },
      ],
    },
    {
      id: 'sovereign',
      index: 4,
      sector: 'FINAL SECTOR',
      name: 'THE SOVEREIGN',
      subtitle: 'TITAN FOUNDRY // CORE CHAMBER',
      objective: 'Destroy the Sovereign. End the siege.',
      intel: 'The titan has finished fueling. No reinforcements. No retreat. This is the last order.',
      threat: 'Titan-class siege platform',
      hazard: 'Orbital shockwaves',
      hint: 'Break the shield nodes in phase two, then hit the exposed core. Keep moving.',
      spawn: { x: 800, y: 750 },
      seed: 4409,
      ambient: 'void',
      enemyHpMul: 1,
      enemyDamageMul: 1,
      elite: '',
      palette: {
        bg0: '#05040b',
        bg1: '#0d0919',
        bg2: '#1a112e',
        ground: '#151024',
        fog: 'rgba(183, 120, 255, 0.08)',
        accent: '#c79bff',
        accent2: '#ff5c83',
        enemy: '#ff557c',
        steel: '#221a36',
        steelLight: '#4d3c6b',
        rock: '#1b1530',
        rockLight: '#382b58',
        border: '#4d356e',
        particle: '#d9b8ff',
        grid: 'rgba(188, 142, 255, 0.06)',
        text: '#f0e2ff',
      },
      obstacles: [
        { x: 240, y: 260, w: 105, h: 105, type: 'pillar' },
        { x: 1255, y: 260, w: 105, h: 105, type: 'pillar' },
        { x: 240, y: 615, w: 105, h: 105, type: 'pillar' },
        { x: 1255, y: 615, w: 105, h: 105, type: 'pillar' },
      ],
      icePatches: [],
      lavaVents: [],
      waves: [],
      boss: true,
    },
  ];

  IRON.PLAYER = {
    maxHp: 100,
    maxShield: 55,
    radius: 22,
    speed: 255,
    accel: 10.5,
    turnSpeed: 11,
    reload: 0.56,
    damage: 30,
    dashSpeed: 860,
    dashDuration: 0.17,
    dashCooldown: 2.2,
    dashInvuln: 0.32,
    shieldDelay: 4.6,
    shieldRegen: 14,
  };

  IRON.BOSS = {
    hp: 1350,
    radius: 96,
    score: 5000,
    phase2At: 0.66,
    phase3At: 0.33,
  };
})();
