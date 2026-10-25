/* =========================================================
   IRON ECLIPSE — game engine, entities, rendering, and UI flow
   ========================================================= */
(() => {
  'use strict';

  const IRON = window.IRON;
  const { W, H, TAU, utils, LEVELS, UPGRADES, ENEMY_TYPES, PLAYER, BOSS } = IRON;
  const {
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
  } = utils;

  const byId = (id) => document.getElementById(id);
  const ARENA_INSET = 25;

  const padScore = (value) => String(Math.max(0, Math.floor(value))).padStart(6, '0');
  const padTwo = (value) => String(Math.max(0, Math.floor(value))).padStart(2, '0');

  const rgba = (hex, alpha = 1) => {
    if (!hex) return `rgba(255,255,255,${alpha})`;
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const num = parseInt(full, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  };

  const roundRectPath = (ctx, x, y, w, h, r) => {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  const polygonPath = (ctx, points) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
  };

  const segmentCircleHit = (x1, y1, x2, y2, cx, cy, radius) =>
    distanceToSegment(cx, cy, x1, y1, x2, y2) <= radius;

  const shuffle = (arr) => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const UPGRADE_ICONS = {
    damage: `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="7"/>
        <path d="M16 2v6M16 24v6M2 16h6M24 16h6M6.1 6.1l4.2 4.2M21.7 21.7l4.2 4.2M25.9 6.1l-4.2 4.2M10.3 21.7l-4.2 4.2"/>
        <circle cx="16" cy="16" r="2" fill="currentColor" stroke="none"/>
      </svg>`,
    reload: `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M25 12a10 10 0 1 0 1 7"/>
        <path d="M26 5v8h-8"/>
        <circle cx="16" cy="16" r="3"/>
      </svg>`,
    armor: `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3 27 7v8c0 7-4.7 11.7-11 14C9.7 26.7 5 22 5 15V7z"/>
        <path d="M16 8v13M11 12l5-3 5 3"/>
      </svg>`,
    mobility: `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="5" y="9" width="22" height="6" rx="3"/>
        <rect x="5" y="18" width="22" height="6" rx="3"/>
        <path d="M10 5l-3 3 3 3M22 5l3 3-3 3"/>
        <path d="M10 25v3M16 25v3M22 25v3"/>
      </svg>`,
    shield: `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3 26 8v8c0 7-4 10.7-10 13-6-2.3-10-6-10-13V8z"/>
        <path d="M16 8v13M10 14h12"/>
      </svg>`,
    dash: `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M18 3 8 18h7l-1 11 10-16h-7z"/>
        <path d="M3 12h6M2 18h6M4 24h5"/>
      </svg>`,
  };

  /* =========================================================
     Player
     ========================================================= */

  class Player {
    constructor(game, upgrades) {
      this.game = game;
      this.upgrades = upgrades || {};
      const armorLevel = this.upgrades.armor || 0;
      const shieldLevel = this.upgrades.shield || 0;
      this.armorLevel = armorLevel;
      this.shieldLevel = shieldLevel;
      this.mobilityLevel = this.upgrades.mobility || 0;
      this.dashLevel = this.upgrades.dash || 0;
      this.damageLevel = this.upgrades.damage || 0;
      this.reloadLevel = this.upgrades.reload || 0;

      this.maxHp = PLAYER.maxHp + armorLevel * 30;
      this.hp = this.maxHp;
      this.maxShield = PLAYER.maxShield + shieldLevel * 30;
      this.shield = this.maxShield;
      this.shieldRegen = PLAYER.shieldRegen * (1 + shieldLevel * 0.25);
      this.radius = PLAYER.radius;

      this.x = game.level.spawn.x;
      this.y = game.level.spawn.y;
      this.vx = 0;
      this.vy = 0;
      this.hullAngle = -Math.PI / 2;
      this.turretAngle = -Math.PI / 2;

      this.reloadTimer = 0;
      this.dashCooldown = 0;
      this.dashTimer = 0;
      this.dashDirX = 0;
      this.dashDirY = 0;
      this.dashTrailTimer = 0;
      this.invuln = 0;
      this.hitFlash = 0;
      this.shieldDelay = 0;
      this.recoil = 0;
      this.muzzleFlash = 0;
      this.overdrive = 0;
      this.dead = false;

      this.prevX = this.x;
      this.prevY = this.y;
      this.distanceMoved = 0;
      this.trackAccumulator = 0;
      this.dustTimer = 0;
    }

    get speed() {
      return PLAYER.speed * (1 + this.mobilityLevel * 0.12);
    }

    get cannonDamage() {
      return PLAYER.damage * (1 + this.damageLevel * 0.25);
    }

    get reloadTime() {
      const base = Math.max(0.24, PLAYER.reload * (1 - this.reloadLevel * 0.18));
      return this.overdrive > 0 ? base * 0.55 : base;
    }

    get dashCooldownTime() {
      return PLAYER.dashCooldown * (1 - this.dashLevel * 0.25);
    }

    get dashInvulnTime() {
      return PLAYER.dashInvuln + this.dashLevel * 0.1;
    }

    update(dt) {
      if (this.dead) return;

      this.prevX = this.x;
      this.prevY = this.y;
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5.5);
      this.recoil = Math.max(0, this.recoil - dt * 8);
      this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
      if (this.overdrive > 0) this.overdrive = Math.max(0, this.overdrive - dt);

      if (this.shieldDelay > 0) {
        this.shieldDelay = Math.max(0, this.shieldDelay - dt);
      } else if (this.shield < this.maxShield) {
        this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
      }

      const aimAngle = Math.atan2(
        this.game.pointer.y - this.y,
        this.game.pointer.x - this.x
      );
      this.turretAngle = rotateToward(this.turretAngle, aimAngle, dt * 15);

      let moveX = 0;
      let moveY = 0;
      const keys = this.game.input.keys;
      if (keys.has('w') || keys.has('arrowup')) moveY -= 1;
      if (keys.has('s') || keys.has('arrowdown')) moveY += 1;
      if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
      if (keys.has('d') || keys.has('arrowright')) moveX += 1;
      const moveLength = Math.hypot(moveX, moveY);
      if (moveLength > 0) {
        moveX /= moveLength;
        moveY /= moveLength;
      }

      if (this.game.input.dashQueued) {
        this.game.input.dashQueued = false;
        if (this.dashCooldown <= 0) this.startDash(moveX, moveY);
      }

      const onIce = this.game.isOnIce(this.x, this.y);

      if (this.dashTimer > 0) {
        this.dashTimer = Math.max(0, this.dashTimer - dt);
        const step = PLAYER.dashSpeed * dt;
        this.game.moveEntity(this, this.dashDirX * step, this.dashDirY * step);
        this.invuln = Math.max(this.invuln, 0.07);
        this.dashTrailTimer -= dt;
        if (this.dashTrailTimer <= 0) {
          this.dashTrailTimer = 0.026;
          this.game.spawnDashTrail(this);
        }
        if (this.dashTimer <= 0) {
          this.vx = this.dashDirX * this.speed * 0.5;
          this.vy = this.dashDirY * this.speed * 0.5;
        }
      } else {
        const acceleration = onIce ? 2.1 : PLAYER.accel;
        this.vx += (moveX * this.speed - this.vx) * Math.min(1, acceleration * dt);
        this.vy += (moveY * this.speed - this.vy) * Math.min(1, acceleration * dt);
        this.game.moveEntity(this, this.vx * dt, this.vy * dt);
      }

      const actualSpeed = Math.hypot(this.vx, this.vy);
      if (actualSpeed > 8) {
        this.hullAngle = rotateToward(
          this.hullAngle,
          Math.atan2(this.vy, this.vx),
          dt * PLAYER.turnSpeed
        );
      }

      const moved = Math.hypot(this.x - this.prevX, this.y - this.prevY);
      this.distanceMoved += moved;
      this.trackAccumulator += moved;
      if (this.trackAccumulator > 12) {
        this.trackAccumulator = 0;
        this.game.addTrackMark(this.x, this.y, this.hullAngle, this.dashTimer > 0);
      }

      if (actualSpeed > 32 && this.dashTimer <= 0) {
        this.dustTimer -= dt;
        if (this.dustTimer <= 0) {
          this.dustTimer = 0.06;
          const backX = this.x - Math.cos(this.hullAngle) * this.radius * 0.8;
          const backY = this.y - Math.sin(this.hullAngle) * this.radius * 0.8;
          this.game.spawnDust(backX, backY, this.hullAngle, onIce ? 0.55 : 1);
        }
      }

      if (this.game.input.firing && this.reloadTimer <= 0) {
        this.fire();
      }
    }

    startDash(moveX, moveY) {
      let dx = moveX;
      let dy = moveY;
      if (Math.hypot(dx, dy) < 0.1) {
        dx = Math.cos(this.hullAngle);
        dy = Math.sin(this.hullAngle);
      }
      const length = Math.hypot(dx, dy) || 1;
      this.dashDirX = dx / length;
      this.dashDirY = dy / length;
      this.dashTimer = PLAYER.dashDuration;
      this.dashCooldown = this.dashCooldownTime;
      this.invuln = Math.max(this.invuln, this.dashInvulnTime);
      this.dashTrailTimer = 0;
      this.game.audio.play('dash');
      this.game.triggerShake(2.4, 0.18);
      this.game.spawnDashBurst(this.x, this.y, this.hullAngle);
    }

    fire() {
      if (this.dead) return;
      const muzzleDistance = this.radius + 31;
      const angle = this.turretAngle + rand(-0.012, 0.012);
      const muzzleX = this.x + Math.cos(angle) * muzzleDistance;
      const muzzleY = this.y + Math.sin(angle) * muzzleDistance;
      this.reloadTimer = this.reloadTime;
      this.recoil = 1;
      this.muzzleFlash = 0.085;
      this.game.spawnPlayerBullet(muzzleX, muzzleY, angle, this.cannonDamage);
      this.game.spawnMuzzleFlash(muzzleX, muzzleY, angle, '#b8fbff');
      this.game.audio.play('cannon');
      this.game.triggerShake(1.6, 0.1);
      this.game.run.shots += 1;
    }

    damage(amount, source = 'shot') {
      if (this.dead || this.invuln > 0 || this.game.state !== 'playing') return false;
      let remaining = amount;
      const hadShield = this.shield > 0.5;

      if (this.shield > 0) {
        const absorbed = Math.min(this.shield, remaining);
        this.shield -= absorbed;
        remaining -= absorbed;
      }

      if (remaining > 0) {
        this.hp -= remaining;
      }

      this.shieldDelay = PLAYER.shieldDelay;
      this.invuln = source === 'beam' ? 0.5 : 0.38;
      this.hitFlash = 1;
      this.game.onPlayerHit(remaining, hadShield);

      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.game.playerDeath();
      }
      return true;
    }

    heal(amount) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      return this.hp - before;
    }

    addShield(amount) {
      const before = this.shield;
      this.shield = Math.min(this.maxShield, this.shield + amount);
      return this.shield - before;
    }
  }

  /* =========================================================
     Enemy
     ========================================================= */

  class Enemy {
    constructor(game, typeKey, x, y, options = {}) {
      const baseKey = options.baseType || typeKey;
      const stats = ENEMY_TYPES[baseKey];
      if (!stats) throw new Error(`Unknown enemy type: ${baseKey}`);

      this.game = game;
      this.typeKey = typeKey;
      this.baseKey = baseKey;
      this.elite = !!options.elite;
      this.name = options.name || (this.elite ? 'ELITE' : stats.label);
      this.label = stats.label;
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.radius = stats.radius * (this.elite ? 1.34 : 1);
      this.speed = stats.speed * (this.elite ? 0.88 : 1);
      this.maxHp =
        stats.hp *
        (game.level.enemyHpMul || 1) *
        (this.elite ? 3.35 : 1);
      this.hp = this.maxHp;
      this.damage =
        stats.damage *
        (game.level.enemyDamageMul || 1) *
        (this.elite ? 1.35 : 1);
      this.bulletSpeed = stats.bulletSpeed;
      this.fireRate = stats.fireRate * (this.elite ? 0.78 : 1);
      this.range = stats.range + (this.elite ? 65 : 0);
      this.desiredRange = stats.desiredRange + (this.elite ? 45 : 0);
      this.score = stats.score * (this.elite ? 5 : 1);
      this.color = this.elite ? '#ffd17a' : stats.color;
      this.accent = this.elite ? '#fff0c4' : stats.accent;
      this.drawType = stats.drawType;
      this.pattern = stats.pattern;
      this.burstCount = stats.burst || 1;

      const player = game.player;
      this.angle = player ? Math.atan2(player.y - y, player.x - x) : rand(0, TAU);
      this.turretAngle = this.angle;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = rand(1.4, 3.2);
      this.fireCooldown = rand(0.7, 1.8);
      this.burstLeft = 0;
      this.burstTimer = 0;
      this.spawnTimer = 0.62;
      this.hitFlash = 0;
      this.age = rand(0, 10);
      this.hoverPhase = rand(0, TAU);
      this.dead = false;
      this.trackAccumulator = 0;
      this.prevX = x;
      this.prevY = y;
    }

    update(dt) {
      if (this.dead) return;
      this.age += dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5.5);

      if (this.spawnTimer > 0) {
        this.spawnTimer -= dt;
        return;
      }

      const player = this.game.player;
      if (!player || player.dead) return;

      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const distance = Math.hypot(dx, dy) || 1;
      this.turretAngle = rotateToward(
        this.turretAngle,
        Math.atan2(dy, dx),
        dt * (this.elite ? 4.5 : 5.8)
      );

      this.fireCooldown -= dt;
      this.burstTimer -= dt;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeTimer = rand(1.6, 3.4);
      }

      if (this.speed > 0) {
        let dirX = 0;
        let dirY = 0;

        if (distance > this.desiredRange + 55) {
          dirX = dx / distance;
          dirY = dy / distance;
        } else if (distance < this.desiredRange - 55) {
          dirX = -dx / distance;
          dirY = -dy / distance;
        } else {
          dirX = (-dy / distance) * this.strafeDir;
          dirY = (dx / distance) * this.strafeDir;
        }

        if (this.drawType === 'drone') {
          dirX += Math.cos(this.age * 1.7 + this.hoverPhase) * 0.28;
          dirY += Math.sin(this.age * 1.7 + this.hoverPhase) * 0.28;
        }

        for (const other of this.game.enemies) {
          if (other === this || other.dead) continue;
          const sx = this.x - other.x;
          const sy = this.y - other.y;
          const sd = Math.hypot(sx, sy);
          const minDistance = this.radius + other.radius + 12;
          if (sd > 0 && sd < minDistance) {
            const strength = (minDistance - sd) / minDistance;
            dirX += (sx / sd) * strength * 1.3;
            dirY += (sy / sd) * strength * 1.3;
          }
        }

        const steer = this.game.getAvoidance(this, dirX, dirY);
        dirX = steer.x;
        dirY = steer.y;

        const targetVx = dirX * this.speed;
        const targetVy = dirY * this.speed;
        this.vx += (targetVx - this.vx) * Math.min(1, dt * 3.2);
        this.vy += (targetVy - this.vy) * Math.min(1, dt * 3.2);

        this.prevX = this.x;
        this.prevY = this.y;
        this.game.moveEntity(this, this.vx * dt, this.vy * dt);

        const moved = Math.hypot(this.x - this.prevX, this.y - this.prevY);
        this.trackAccumulator += moved;
        if (this.trackAccumulator > 18) {
          this.trackAccumulator = 0;
          if (this.drawType === 'heavy' || this.elite) {
            this.game.addTrackMark(this.x, this.y, this.angle, false);
          }
        }

        const actualSpeed = Math.hypot(this.vx, this.vy);
        if (actualSpeed > 9) {
          this.angle = rotateToward(
            this.angle,
            Math.atan2(this.vy, this.vx),
            dt * (this.drawType === 'heavy' ? 1.8 : 3.6)
          );
        }
      }

      const inRange = distance < this.range;
      const hasSight = this.game.hasLineOfSight(this.x, this.y, player.x, player.y);

      if (this.burstLeft > 0) {
        if (this.burstTimer <= 0) {
          this.fireOneShot();
          this.burstLeft -= 1;
          this.burstTimer = 0.13;
          if (this.burstLeft <= 0) {
            this.fireCooldown = this.fireRate * rand(0.9, 1.12);
          }
        }
        return;
      }

      if (this.fireCooldown > 0 || !inRange || !hasSight) return;

      if (this.pattern === 'artillery') {
        this.fireArtillery();
        this.fireCooldown = this.fireRate * rand(0.92, 1.1);
      } else if (this.pattern === 'burst') {
        this.burstLeft = this.burstCount;
        this.burstTimer = 0;
        this.fireCooldown = this.fireRate;
      } else if (this.pattern === 'fan') {
        this.fireFan();
        this.fireCooldown = this.fireRate * rand(0.9, 1.1);
      } else {
        this.fireOneShot();
        this.fireCooldown = this.fireRate * rand(0.9, 1.15);
      }
    }

    getMuzzle() {
      const offset = this.radius + (this.drawType === 'heavy' ? 27 : 20);
      return {
        x: this.x + Math.cos(this.turretAngle) * offset,
        y: this.y + Math.sin(this.turretAngle) * offset,
      };
    }

    fireOneShot() {
      const muzzle = this.getMuzzle();
      const spread = this.elite ? 0.035 : 0.065;
      const angle = this.turretAngle + rand(-spread, spread);
      this.game.spawnEnemyBullet(
        muzzle.x,
        muzzle.y,
        angle,
        this.bulletSpeed,
        this.damage,
        this.color
      );
      this.game.spawnMuzzleFlash(muzzle.x, muzzle.y, angle, this.accent);
      this.game.audio.play(
        this.drawType === 'heavy' ? 'heavyShot' : 'enemyShot'
      );
    }

    fireFan() {
      const muzzle = this.getMuzzle();
      const count = this.elite ? 5 : 3;
      const spread = this.elite ? 0.28 : 0.18;
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * spread;
        this.game.spawnEnemyBullet(
          muzzle.x,
          muzzle.y,
          this.turretAngle + offset,
          this.bulletSpeed,
          this.damage,
          this.color
        );
      }
      this.game.spawnMuzzleFlash(muzzle.x, muzzle.y, this.turretAngle, this.accent);
      this.game.audio.play('heavyShot');
    }

    fireArtillery() {
      const player = this.game.player;
      const lead = 0.45;
      const targetX = clamp(
        player.x + player.vx * lead + rand(-45, 45),
        ARENA_INSET + 50,
        W - ARENA_INSET - 50
      );
      const targetY = clamp(
        player.y + player.vy * lead + rand(-45, 45),
        ARENA_INSET + 50,
        H - ARENA_INSET - 50
      );
      this.game.spawnDangerZone({
        x: targetX,
        y: targetY,
        radius: this.elite ? 108 : 82,
        duration: this.elite ? 1.08 : 1.25,
        damage: this.damage,
        color: this.elite ? '#ffd17a' : '#ff9b5c',
      });
      const muzzle = this.getMuzzle();
      this.game.spawnMuzzleFlash(muzzle.x, muzzle.y, this.turretAngle, this.accent);
      this.game.audio.play('missile');
    }

    takeDamage(amount, hitX = this.x, hitY = this.y) {
      if (this.dead) return false;
      this.hp -= amount;
      this.hitFlash = 1;
      this.game.audio.play('hit');
      this.game.spawnHitSpark(hitX, hitY, this.accent);
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.game.killEnemy(this);
      }
      return true;
    }
  }

  /* =========================================================
     Projectiles and environmental effects
     ========================================================= */

  class Bullet {
    constructor(game, options) {
      this.game = game;
      this.x = options.x;
      this.y = options.y;
      this.prevX = options.x;
      this.prevY = options.y;
      this.angle = options.angle;
      this.speed = options.speed;
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.damage = options.damage;
      this.owner = options.owner;
      this.color = options.color || (this.owner === 'player' ? '#b9fbff' : '#ff8a72');
      this.radius = options.radius || (this.owner === 'player' ? 4.2 : 5.5);
      this.life = options.life || 2.6;
      this.dead = false;
    }

    update(dt) {
      this.prevX = this.x;
      this.prevY = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      if (
        this.life <= 0 ||
        this.x < -40 ||
        this.x > W + 40 ||
        this.y < -40 ||
        this.y > H + 40
      ) {
        this.dead = true;
      }
    }
  }

  class DangerZone {
    constructor(game, options) {
      this.game = game;
      this.x = options.x;
      this.y = options.y;
      this.radius = options.radius;
      this.duration = options.duration;
      this.elapsed = 0;
      this.damage = options.damage;
      this.color = options.color || '#ff925c';
      this.dead = false;
      this.detonated = false;
      this.age = 0;
    }

    update(dt) {
      if (this.dead) return;
      this.age += dt;
      this.elapsed += dt;
      if (!this.detonated && this.elapsed >= this.duration) {
        this.detonated = true;
        this.dead = true;
        this.game.detonateDangerZone(this);
      }
    }
  }

  class Shockwave {
    constructor(game, options) {
      this.game = game;
      this.x = options.x;
      this.y = options.y;
      this.radius = options.startRadius || 36;
      this.maxRadius = options.maxRadius || 680;
      this.speed = options.speed || 390;
      this.damage = options.damage || 18;
      this.color = options.color || '#ff746f';
      this.hit = false;
      this.dead = false;
      this.age = 0;
    }

    update(dt) {
      if (this.dead) return;
      this.age += dt;
      this.radius += this.speed * dt;
      const player = this.game.player;
      if (player && !player.dead && !this.hit) {
        const distanceToPlayer = dist(this.x, this.y, player.x, player.y);
        if (Math.abs(distanceToPlayer - this.radius) < 18 + player.radius) {
          this.hit = true;
          player.damage(this.damage, 'shockwave');
        }
      }
      if (this.radius >= this.maxRadius) this.dead = true;
    }
  }

  class Pickup {
    constructor(game, x, y, type) {
      this.game = game;
      this.x = x;
      this.y = y;
      this.type = type;
      this.radius = 15;
      this.age = rand(0, TAU);
      this.life = 28;
      this.dead = false;
    }

    update(dt) {
      if (this.dead) return;
      this.age += dt;
      this.life -= dt;
      if (this.life <= 0) {
        this.dead = true;
        return;
      }
      const player = this.game.player;
      if (!player || player.dead) return;
      if (dist(this.x, this.y, player.x, player.y) < this.radius + player.radius + 7) {
        this.dead = true;
        this.game.collectPickup(this);
      }
    }
  }

  class ShieldNode {
    constructor(game, x, y) {
      this.game = game;
      this.x = x;
      this.y = y;
      this.radius = 26;
      this.maxHp = 85;
      this.hp = this.maxHp;
      this.age = rand(0, TAU);
      this.angle = rand(0, TAU);
      this.hitFlash = 0;
      this.dead = false;
    }

    update(dt) {
      if (this.dead) return;
      this.age += dt;
      this.angle += dt * 1.8;
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    }

    damage(amount, hitX = this.x, hitY = this.y) {
      if (this.dead) return false;
      this.hp -= amount;
      this.hitFlash = 1;
      this.game.audio.play('shieldHit');
      this.game.spawnShieldSpark(hitX, hitY);
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.game.run.score += 300;
        this.game.onNodeDestroyed(this);
      }
      return true;
    }
  }

  /* =========================================================
     Particle
     ========================================================= */

  class Particle {
    constructor(game, options) {
      this.game = game;
      this.x = options.x;
      this.y = options.y;
      this.prevX = options.x;
      this.prevY = options.y;
      this.vx = options.vx || 0;
      this.vy = options.vy || 0;
      this.life = options.life || 0.5;
      this.maxLife = this.life;
      this.size = options.size || 2;
      this.maxSize = options.maxSize || this.size;
      this.color = options.color || '#ffffff';
      this.type = options.type || 'spark';
      this.gravity = options.gravity || 0;
      this.drag = options.drag === undefined ? 1.8 : options.drag;
      this.rotation = options.rotation || 0;
      this.rotationSpeed = options.rotationSpeed || 0;
      this.dead = false;
    }

    update(dt) {
      if (this.dead) return;
      this.prevX = this.x;
      this.prevY = this.y;
      this.life -= dt;
      if (this.life <= 0) {
        this.dead = true;
        return;
      }
      this.vx *= Math.max(0, 1 - this.drag * dt);
      this.vy *= Math.max(0, 1 - this.drag * dt);
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rotation += this.rotationSpeed * dt;

      if (this.type === 'ring') {
        const t = 1 - this.life / this.maxLife;
        this.size = lerp(this.size, this.maxSize, 0.22 + t * 0.1);
      } else if (this.type === 'smoke') {
        this.size += dt * 15;
      } else if (this.type === 'dust') {
        this.size += dt * 9;
      }
    }
  }

  /* =========================================================
     The Sovereign — final boss
     ========================================================= */

  class Boss {
    constructor(game) {
      this.game = game;
      this.x = W / 2;
      this.y = 255;
      this.radius = BOSS.radius;
      this.maxHp = BOSS.hp;
      this.hp = this.maxHp;
      this.phase = 1;
      this.hullAngle = Math.PI / 2;
      this.turretAngle = Math.PI / 2;
      this.time = 0;
      this.hitFlash = 0;
      this.shielded = false;
      this.stunTimer = 0;
      this.dead = false;
      this.beam = null;
      this.smokeTimer = 0;
      this.name = 'THE SOVEREIGN';
      this.score = BOSS.score;
      this.timers = {
        fan: 2.6,
        missile: 5.2,
        beam: 8.4,
        minion: 8.5,
        shock: 4.8,
      };
    }

    getMuzzle() {
      const offset = this.radius + 46;
      return {
        x: this.x + Math.cos(this.turretAngle) * offset,
        y: this.y + Math.sin(this.turretAngle) * offset,
      };
    }

    update(dt) {
      if (this.dead) return;
      this.time += dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4.5);
      this.smokeTimer -= dt;

      if (this.hp < this.maxHp * 0.72 || this.phase > 1) {
        if (this.smokeTimer <= 0) {
          this.smokeTimer = 0.22;
          this.game.spawnBossSmoke(this);
        }
      }

      if (this.stunTimer > 0) {
        this.stunTimer = Math.max(0, this.stunTimer - dt);
        if (this.beam) this.beam = null;
        return;
      }

      const player = this.game.player;
      if (!player || player.dead) return;

      const targetX = W / 2 + Math.sin(this.time * 0.19) * 330;
      const targetY = 255 + Math.sin(this.time * 0.33 + 0.7) * 44;
      const moveX = targetX - this.x;
      const moveY = targetY - this.y;
      const moveDistance = Math.hypot(moveX, moveY);
      const bossSpeed = this.phase === 3 ? 72 : 48;
      if (moveDistance > 1) {
        this.x += (moveX / moveDistance) * Math.min(moveDistance, bossSpeed * dt);
        this.y += (moveY / moveDistance) * Math.min(moveDistance, bossSpeed * dt);
      }

      this.hullAngle = rotateToward(
        this.hullAngle,
        Math.atan2(player.y - this.y, player.x - this.x),
        dt * 0.52
      );
      this.turretAngle = rotateToward(
        this.turretAngle,
        Math.atan2(player.y - this.y, player.x - this.x),
        dt * (this.phase === 3 ? 2.5 : 1.8)
      );

      if (this.beam) this.updateBeam(dt);

      this.timers.fan -= dt;
      this.timers.missile -= dt;
      this.timers.beam -= dt;
      this.timers.minion -= dt;
      this.timers.shock -= dt;

      const beamActive = this.beam && this.beam.state === 'active';

      if (this.timers.fan <= 0 && !beamActive) {
        const count = this.phase === 1 ? 3 : this.phase === 2 ? 5 : 7;
        const spread = this.phase === 1 ? 0.18 : this.phase === 2 ? 0.24 : 0.32;
        const speed = this.phase === 3 ? 420 : 365;
        const damage = this.phase === 3 ? 14 : 12;
        this.game.bossFireFan(this, count, spread, speed, damage);
        this.timers.fan = this.phase === 1 ? 2.45 : this.phase === 2 ? 2.9 : 1.75;
      }

      if (this.phase >= 2 && this.timers.missile <= 0 && !beamActive) {
        this.game.spawnBossMissiles(this.phase === 3 ? 4 : 3);
        this.timers.missile = this.phase === 3 ? 5.2 : 4.7;
      }

      if (this.phase >= 2 && this.timers.beam <= 0 && !this.beam) {
        this.startBeam();
        this.timers.beam = this.phase === 3 ? 8.8 : 8.2;
      }

      if (
        this.phase < 3 &&
        this.timers.minion <= 0 &&
        this.game.enemies.filter((enemy) => !enemy.dead).length < 3
      ) {
        this.game.spawnBossMinion(this.phase === 1 ? 'scout' : 'drone');
        this.timers.minion = 9.5;
      }

      if (this.phase === 3 && this.timers.shock <= 0) {
        this.game.spawnShockwave({
          x: this.x,
          y: this.y,
          damage: 18,
          maxRadius: 760,
          speed: 410,
          color: '#ff786d',
        });
        this.timers.shock = 4.35;
        this.game.audio.play('shockwave');
        this.game.triggerShake(4, 0.25);
      }
    }

    startBeam() {
      const player = this.game.player;
      if (!player) return;
      const muzzle = this.getMuzzle();
      this.beam = {
        state: 'windup',
        timer: 1.05,
        angle: Math.atan2(player.y - muzzle.y, player.x - muzzle.x),
        sweep: (Math.random() < 0.5 ? -1 : 1) * (this.phase === 3 ? 0.82 : 0.56),
        sparkTimer: 0,
      };
      this.game.audio.play('charge');
      this.game.showToast('TITAN BEAM CHARGING', true, 1100);
    }

    updateBeam(dt) {
      const beam = this.beam;
      if (!beam) return;
      beam.timer -= dt;
      const player = this.game.player;
      const muzzle = this.getMuzzle();

      if (beam.state === 'windup') {
        if (player) {
          const targetAngle = Math.atan2(player.y - muzzle.y, player.x - muzzle.x);
          beam.angle = rotateToward(beam.angle, targetAngle, dt * 2.6);
        }
        if (beam.timer <= 0) {
          beam.state = 'active';
          beam.timer = this.phase === 3 ? 1.55 : 1.35;
          this.game.audio.play('beam');
          this.game.triggerShake(5.5, 0.35);
        }
        return;
      }

      beam.angle += beam.sweep * dt;
      if (beam.timer <= 0) {
        this.beam = null;
        return;
      }

      const end = this.game.getBeamEnd(muzzle.x, muzzle.y, beam.angle, 1600);
      if (
        player &&
        !player.dead &&
        distanceToSegment(player.x, player.y, muzzle.x, muzzle.y, end.x, end.y) <
          player.radius + 15
      ) {
        player.damage(this.phase === 3 ? 18 : 15, 'beam');
      }

      beam.sparkTimer -= dt;
      if (beam.sparkTimer <= 0) {
        beam.sparkTimer = 0.075;
        this.game.spawnBeamSpark(end.x, end.y);
      }
    }

    damage(amount, hitX = this.x, hitY = this.y) {
      if (this.dead) return false;

      if (this.shielded) {
        this.hitFlash = 0.6;
        this.game.audio.play('shieldHit');
        this.game.spawnShieldSpark(hitX, hitY);
        return false;
      }

      this.hp -= amount;
      this.hitFlash = 1;
      this.game.audio.play('hit');
      this.game.spawnHitSpark(hitX, hitY, '#ffd6bc');

      if (this.phase === 1 && this.hp <= this.maxHp * BOSS.phase2At) {
        this.hp = this.maxHp * BOSS.phase2At;
        this.game.startBossPhaseTwo();
        return true;
      }

      if (this.phase === 2 && this.hp <= this.maxHp * BOSS.phase3At) {
        this.hp = this.maxHp * BOSS.phase3At;
        this.game.startBossPhaseThree();
        return true;
      }

      if (this.hp <= 0) {
        this.hp = 0;
        this.game.bossDefeated();
      }

      return true;
    }
  }

  /* =========================================================
     Pre-rendered terrain
     ========================================================= */

  function makeBackground(level) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const p = level.palette;
    const rng = mulberry32(level.seed);

    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, p.bg0);
    base.addColorStop(0.52, p.bg1);
    base.addColorStop(1, p.bg2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const topGlow = ctx.createRadialGradient(W * 0.68, H * 0.2, 20, W * 0.68, H * 0.2, W * 0.6);
    topGlow.addColorStop(0, rgba(p.accent, 0.09));
    topGlow.addColorStop(0.5, rgba(p.accent, 0.025));
    topGlow.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 80) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H; y += 80) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 34; i += 1) {
      const x = rng() * W;
      const y = rng() * H;
      const rx = 40 + rng() * 180;
      const ry = 20 + rng() * 80;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rng() * TAU, 0, TAU);
      ctx.fillStyle = rgba(i % 2 ? p.rock : p.accent, 0.012 + rng() * 0.018);
      ctx.fill();
    }

    if (level.id === 'dust') {
      ctx.save();
      for (let i = 0; i < 8; i += 1) {
        ctx.beginPath();
        const y = 80 + i * 88 + rng() * 18;
        ctx.moveTo(-40, y);
        for (let x = 0; x <= W + 80; x += 120) {
          ctx.lineTo(x, y + Math.sin(x * 0.0055 + i * 1.3) * (12 + i * 1.6));
        }
        ctx.strokeStyle = rgba(p.rockLight, 0.032 + i * 0.003);
        ctx.lineWidth = 20 + i * 3;
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(p.accent, 0.055);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 22; i += 1) {
        const x = rng() * W;
        const y = 160 + rng() * (H - 260);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 100, y + rng() * 28);
        ctx.lineTo(x + (rng() - 0.5) * 130, y + rng() * 55);
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.id === 'cryo') {
      ctx.save();
      for (let i = 0; i < 18; i += 1) {
        const x = rng() * W;
        const y = rng() * H;
        const size = 30 + rng() * 120;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.45);
        ctx.lineTo(x + size * 0.32, y);
        ctx.lineTo(x, y + size * 0.5);
        ctx.lineTo(x - size * 0.28, y);
        ctx.closePath();
        ctx.fillStyle = rgba(p.accent, 0.018 + rng() * 0.02);
        ctx.strokeStyle = rgba(p.accent, 0.045);
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(p.accent, 0.045);
      for (let i = 0; i < 18; i += 1) {
        const x = rng() * W;
        const y = rng() * H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 160, y + (rng() - 0.5) * 100);
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.id === 'ash') {
      ctx.save();
      for (let i = 0; i < 9; i += 1) {
        const x = (i % 3) * 540 - 40;
        const y = Math.floor(i / 3) * 310 - 30;
        ctx.strokeStyle = rgba(p.steelLight, 0.055);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 20, y + 18, 500 + rng() * 60, 280);
        ctx.fillStyle = rgba(p.steel, 0.08);
        ctx.fillRect(x + 20, y + 18, 500 + rng() * 60, 280);
        for (let b = 0; b < 7; b += 1) {
          const bx = x + 36 + b * 72;
          const by = y + 28;
          ctx.fillStyle = rgba(p.steelLight, 0.14);
          ctx.beginPath();
          ctx.arc(bx, by, 2, 0, TAU);
          ctx.fill();
        }
      }
      for (let i = 0; i < 14; i += 1) {
        const x = rng() * W;
        const y = rng() * H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        let cx = x;
        let cy = y;
        for (let s = 0; s < 4; s += 1) {
          cx += (rng() - 0.5) * 58;
          cy += 18 + rng() * 30;
          ctx.lineTo(cx, cy);
        }
        ctx.strokeStyle = rgba(p.accent2, 0.05 + rng() * 0.05);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.id === 'sovereign') {
      ctx.save();
      ctx.translate(W / 2, H * 0.45);
      for (let r = 130; r <= 470; r += 42) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.strokeStyle = rgba(p.accent, 0.022 + (r % 84 === 0 ? 0.02 : 0));
        ctx.lineWidth = r % 84 === 0 ? 1.4 : 1;
        ctx.stroke();
      }
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 120, Math.sin(angle) * 120);
        ctx.lineTo(Math.cos(angle) * 480, Math.sin(angle) * 480);
        ctx.strokeStyle = rgba(p.accent, 0.018);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 88, 0, TAU);
      ctx.strokeStyle = rgba(p.accent2, 0.11);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const x = Math.cos(a) * 66;
        const y = Math.sin(a) * 66;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = rgba(p.accent, 0.09);
      ctx.stroke();
      ctx.restore();
    }

    // Cover structures are part of the pre-rendered terrain so the collision
    // footprint is always readable during combat.
    for (const rect of level.obstacles) {
      const { x, y, w, h, type } = rect;
      ctx.save();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      roundRectPath(ctx, x + 9, y + 12, w, h, type === 'rock' ? 20 : 5);
      ctx.fill();

      if (type === 'rock') {
        const jitter = () => (rng() - 0.5) * 18;
        const points = [
          [x + 5 + jitter(), y + h * 0.32],
          [x + w * 0.22 + jitter(), y + 5 + jitter()],
          [x + w * 0.58 + jitter(), y + 3],
          [x + w - 9 + jitter(), y + h * 0.22],
          [x + w - 3, y + h * 0.62],
          [x + w * 0.76, y + h - 4],
          [x + w * 0.34, y + h - 2],
          [x + 3, y + h * 0.7],
        ];
        const rockGradient = ctx.createLinearGradient(x, y, x + w, y + h);
        rockGradient.addColorStop(0, p.rockLight);
        rockGradient.addColorStop(0.48, p.rock);
        rockGradient.addColorStop(1, p.bg2);
        polygonPath(ctx, points);
        ctx.fillStyle = rockGradient;
        ctx.fill();
        ctx.strokeStyle = rgba(p.rockLight, 0.82);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = rgba('#080504', 0.5);
        ctx.lineWidth = 1.5;
        for (let crack = 0; crack < 4; crack += 1) {
          const cx = x + w * (0.2 + rng() * 0.6);
          const cy = y + h * (0.2 + rng() * 0.55);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (rng() - 0.5) * 46, cy + 12 + rng() * 28);
          ctx.lineTo(cx + (rng() - 0.5) * 62, cy + 24 + rng() * 34);
          ctx.stroke();
        }

        ctx.strokeStyle = rgba(p.rockLight, 0.35);
        ctx.lineWidth = 1;
        for (let ledge = 0; ledge < 3; ledge += 1) {
          const ly = y + h * (0.28 + ledge * 0.2);
          ctx.beginPath();
          ctx.moveTo(x + w * 0.14, ly);
          ctx.lineTo(x + w * 0.42, ly - 7);
          ctx.lineTo(x + w * 0.68, ly + 2);
          ctx.stroke();
        }
      } else if (type === 'container') {
        roundRectPath(ctx, x, y, w, h, 5);
        const containerGradient = ctx.createLinearGradient(x, y, x, y + h);
        containerGradient.addColorStop(0, rgba(p.steelLight, 0.82));
        containerGradient.addColorStop(0.18, p.steel);
        containerGradient.addColorStop(1, rgba(p.bg1, 0.95));
        ctx.fillStyle = containerGradient;
        ctx.fill();
        ctx.strokeStyle = rgba(p.steelLight, 0.9);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = rgba(p.steelLight, 0.35);
        ctx.lineWidth = 1;
        for (let panel = 1; panel < 4; panel += 1) {
          const px = x + (w / 4) * panel;
          ctx.beginPath();
          ctx.moveTo(px, y + 5);
          ctx.lineTo(px, y + h - 5);
          ctx.stroke();
        }

        ctx.fillStyle = rgba(p.accent, 0.16);
        ctx.fillRect(x + 8, y + 8, w - 16, 12);
        ctx.strokeStyle = rgba(p.accent, 0.42);
        ctx.strokeRect(x + 8, y + 8, w - 16, 12);

        ctx.fillStyle = rgba(p.accent2, 0.8);
        ctx.fillRect(x + 12, y + 26, 22, 3);
        ctx.fillRect(x + w - 34, y + 26, 22, 3);

        ctx.fillStyle = rgba(p.accent, 0.7);
        for (let light = 0; light < 3; light += 1) {
          ctx.beginPath();
          ctx.arc(x + 18 + light * 9, y + h - 14, 2, 0, TAU);
          ctx.fill();
        }

        ctx.strokeStyle = rgba(p.steelLight, 0.55);
        ctx.lineWidth = 1.2;
        for (const [bx, by] of [
          [x + 6, y + 6],
          [x + w - 6, y + 6],
          [x + 6, y + h - 6],
          [x + w - 6, y + h - 6],
        ]) {
          ctx.beginPath();
          ctx.arc(bx, by, 2.2, 0, TAU);
          ctx.stroke();
        }
      } else if (type === 'pillar') {
        const inset = Math.min(w, h) * 0.12;
        polygonPath(ctx, [
          [x + inset, y],
          [x + w - inset, y],
          [x + w, y + inset],
          [x + w, y + h - inset],
          [x + w - inset, y + h],
          [x + inset, y + h],
          [x, y + h - inset],
          [x, y + inset],
        ]);
        const pillarGradient = ctx.createLinearGradient(x, y, x + w, y + h);
        pillarGradient.addColorStop(0, rgba(p.steelLight, 0.88));
        pillarGradient.addColorStop(0.5, p.steel);
        pillarGradient.addColorStop(1, rgba(p.bg1, 0.96));
        ctx.fillStyle = pillarGradient;
        ctx.fill();
        ctx.strokeStyle = rgba(p.steelLight, 0.95);
        ctx.lineWidth = 2;
        ctx.stroke();

        const cx = x + w / 2;
        const cy = y + h / 2;
        const ring = Math.min(w, h) * 0.3;
        ctx.strokeStyle = rgba(p.accent, 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, ring, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, ring * 0.62, 0, TAU);
        ctx.strokeStyle = rgba(p.steelLight, 0.6);
        ctx.stroke();
        const coreGlow = ctx.createRadialGradient(cx, cy, 1, cx, cy, ring * 0.8);
        coreGlow.addColorStop(0, rgba(p.accent, 0.4));
        coreGlow.addColorStop(0.55, rgba(p.accent, 0.08));
        coreGlow.addColorStop(1, rgba(p.accent, 0));
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, ring * 0.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(p.accent, 0.75);
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2, 0, TAU);
        ctx.fill();
      } else if (type === 'barrier') {
        roundRectPath(ctx, x, y, w, h, 3);
        const barrierGradient = ctx.createLinearGradient(x, y, x, y + h);
        barrierGradient.addColorStop(0, p.steelLight);
        barrierGradient.addColorStop(0.35, p.steel);
        barrierGradient.addColorStop(1, rgba(p.bg1, 0.95));
        ctx.fillStyle = barrierGradient;
        ctx.fill();
        ctx.strokeStyle = rgba(p.steelLight, 0.9);
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.save();
        roundRectPath(ctx, x + 5, y + 5, w - 10, h - 10, 2);
        ctx.clip();
        ctx.fillStyle = rgba(p.accent2, 0.3);
        for (let stripe = -h; stripe < w + h; stripe += 22) {
          ctx.beginPath();
          ctx.moveTo(x + stripe, y + h);
          ctx.lineTo(x + stripe + h, y);
          ctx.lineTo(x + stripe + h + 10, y);
          ctx.lineTo(x + stripe + 10, y + h);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        ctx.strokeStyle = rgba(p.accent, 0.45);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
        ctx.fillStyle = rgba(p.accent, 0.9);
        ctx.fillRect(x + w / 2 - 3, y + h - 10, 6, 3);
      } else if (type === 'pipe') {
        roundRectPath(ctx, x, y, w, h, h * 0.28);
        const pipeGradient = ctx.createLinearGradient(x, y, x, y + h);
        pipeGradient.addColorStop(0, rgba(p.steelLight, 0.9));
        pipeGradient.addColorStop(0.45, p.steel);
        pipeGradient.addColorStop(1, rgba(p.bg1, 0.95));
        ctx.fillStyle = pipeGradient;
        ctx.fill();
        ctx.strokeStyle = rgba(p.steelLight, 0.9);
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.strokeStyle = rgba(p.steelLight, 0.5);
        ctx.lineWidth = 1;
        for (let line = 1; line <= 3; line += 1) {
          const ly = y + (h / 4) * line;
          ctx.beginPath();
          ctx.moveTo(x + h * 0.22, ly);
          ctx.lineTo(x + w - h * 0.22, ly);
          ctx.stroke();
        }

        for (const fx of [x + h * 0.22, x + w - h * 0.22]) {
          roundRectPath(ctx, fx - 7, y - 2, 14, h + 4, 3);
          ctx.fillStyle = rgba(p.steelLight, 0.35);
          ctx.fill();
          ctx.strokeStyle = rgba(p.accent, 0.4);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.fillStyle = rgba(p.accent, 0.8);
        ctx.beginPath();
        ctx.arc(x + w - h * 0.4, y + h * 0.5, 3, 0, TAU);
        ctx.fill();
      }

      ctx.strokeStyle = rgba(p.accent, 0.16);
      ctx.lineWidth = 1;
      roundRectPath(ctx, x - 3.5, y - 3.5, w + 7, h + 7, type === 'rock' ? 22 : 7);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < 260; i += 1) {
      const x = rng() * W;
      const y = rng() * H;
      const size = rng() < 0.82 ? 1 : 2;
      ctx.fillStyle = rgba(p.particle, 0.04 + rng() * 0.12);
      ctx.fillRect(x, y, size, size);
    }

    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = p.text;
    ctx.font = '800 300px "Bahnschrift", "Arial Narrow", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(padTwo(level.index), W - 60, H - 55);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(ARENA_INSET + 0.5, ARENA_INSET + 0.5, W - ARENA_INSET * 2 - 1, H - ARENA_INSET * 2 - 1);
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = p.accent;
    const corner = 36;
    [
      [ARENA_INSET, ARENA_INSET, 1, 1],
      [W - ARENA_INSET, ARENA_INSET, -1, 1],
      [ARENA_INSET, H - ARENA_INSET, 1, -1],
      [W - ARENA_INSET, H - ARENA_INSET, -1, -1],
    ].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + corner * sy);
      ctx.lineTo(x, y);
      ctx.lineTo(x + corner * sx, y);
      ctx.stroke();
    });
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = p.accent;
    for (let x = 90; x < W - 90; x += 120) {
      ctx.fillRect(x, ARENA_INSET - 4, 42, 2);
      ctx.fillRect(x, H - ARENA_INSET + 2, 42, 2);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = rgba(p.accent, 0.08);
    ctx.font = '600 10px "Cascadia Mono", "Roboto Mono", monospace';
    ctx.letterSpacing = '2px';
    ctx.fillText(`${level.sector} // ${level.subtitle}`, ARENA_INSET + 18, H - ARENA_INSET - 15);
    ctx.restore();

    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, W * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.72, 'rgba(0,0,0,0.14)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    return canvas;
  }

  /* =========================================================
     Game controller
     ========================================================= */

  class Game {
    constructor() {
      this.canvas = byId('game-canvas');
      this.stage = byId('game-stage');
      this.ctx = this.canvas.getContext('2d');
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.resizeCanvas();

      this.audio = new IRON.AudioEngine();
      this.dom = this.cacheDom();

      this.state = 'menu';
      this.levelIndex = 0;
      this.level = LEVELS[0];
      this.background = makeBackground(this.level);

      this.upgrades = {};
      UPGRADES.forEach((upgrade) => {
        this.upgrades[upgrade.key] = 0;
      });
      this.campaign = this.emptyStats();
      this.run = this.newRun();

      this.bestScore = 0;
      this.muted = false;
      this.loadSettings();
      this.audio.muted = this.muted;

      this.input = {
        keys: new Set(),
        firing: false,
        dashQueued: false,
        inside: false,
      };
      this.pointer = { x: W / 2, y: H / 2 };
      this.shake = { time: 0, duration: 0, intensity: 0 };
      this.damageFlash = 0;

      this.player = null;
      this.boss = null;
      this.enemies = [];
      this.bullets = [];
      this.enemyBullets = [];
      this.particles = [];
      this.dangerZones = [];
      this.shockwaves = [];
      this.pickups = [];
      this.shieldNodes = [];
      this.trackMarks = [];
      this.afterimages = [];
      this.floatingTexts = [];
      this.ambient = [];

      this.waveIndex = 0;
      this.waveActive = false;
      this.nextWaveTimer = 0;
      this.pendingSpawns = [];
      this.bossStarted = false;
      this.bossSpawnTimer = 0;
      this.sectorCleared = false;

      this.introTimer = 0;
      this.clearTimer = 0;
      this.deathTimer = 0;
      this.bossDeathTimer = 0;
      this.bossBurstTimer = 0;
      this.shieldOrbitAngle = 0;
      this.ambientSpawnTimer = 0;
      this.hazardParticleTimer = 0;
      this.ventHitCooldown = 0;
      this.uiAccumulator = 0;
      this.announcementToken = 0;
      this.toastTimeout = null;

      this.lastTime = performance.now();
      this.accumulator = 0;
      this.loop = this.loop.bind(this);

      this.bindEvents();
      this.syncMute();
      this.showMenu();
      requestAnimationFrame(this.loop);
    }

    /* =======================================================
       Setup, persistence, and shared helpers
       ======================================================= */

    cacheDom() {
      return {
        canvas: byId('game-canvas'),
        stage: byId('game-stage'),
        hud: byId('hud'),
        bossHud: byId('boss-hud'),
        bossIntro: byId('boss-intro'),
        crosshair: byId('crosshair'),
        damageFlash: byId('damage-flash'),
        hullFill: byId('hull-fill'),
        hullText: byId('hull-text'),
        shieldFill: byId('shield-fill'),
        shieldText: byId('shield-text'),
        hudSector: byId('hud-sector'),
        hudWave: byId('hud-wave'),
        wavePips: byId('wave-pips'),
        hudObjective: byId('hud-objective'),
        hudScore: byId('hud-score'),
        hudKills: byId('hud-kills'),
        btnMute: byId('btn-mute'),
        btnPause: byId('btn-pause'),
        reloadFill: byId('reload-fill'),
        reloadText: byId('reload-text'),
        dashFill: byId('dash-fill'),
        dashText: byId('dash-text'),
        buffStatus: byId('buff-status'),
        buffText: byId('buff-text'),
        bossPhase: byId('boss-phase'),
        bossStatus: byId('boss-status'),
        bossFill: byId('boss-fill'),
        announcement: byId('announcement'),
        announcementKicker: byId('announcement-kicker'),
        announcementTitle: byId('announcement-title'),
        announcementSub: byId('announcement-sub'),
        toast: byId('toast'),
        screenMenu: byId('screen-menu'),
        btnStart: byId('btn-start'),
        btnMenuMute: byId('btn-menu-mute'),
        menuMuteLabel: byId('menu-mute-label'),
        menuBest: byId('menu-best'),
        screenBriefing: byId('screen-briefing'),
        briefingSector: byId('briefing-sector'),
        briefingTitle: byId('briefing-title'),
        briefingSubtitle: byId('briefing-subtitle'),
        briefingObjective: byId('briefing-objective'),
        briefingThreat: byId('briefing-threat'),
        briefingHazard: byId('briefing-hazard'),
        briefingIntel: byId('briefing-intel'),
        briefingHint: byId('briefing-hint'),
        btnDeploy: byId('btn-deploy'),
        screenUpgrade: byId('screen-upgrade'),
        upgradeCards: byId('upgrade-cards'),
        screenPause: byId('screen-pause'),
        btnResume: byId('btn-resume'),
        btnRestartLevel: byId('btn-restart-level'),
        btnQuit: byId('btn-quit'),
        screenGameover: byId('screen-gameover'),
        gameoverScore: byId('gameover-score'),
        gameoverKills: byId('gameover-kills'),
        gameoverAccuracy: byId('gameover-accuracy'),
        gameoverTime: byId('gameover-time'),
        btnRetry: byId('btn-retry'),
        btnGameoverQuit: byId('btn-gameover-quit'),
        screenVictory: byId('screen-victory'),
        victoryScore: byId('victory-score'),
        victoryKills: byId('victory-kills'),
        victoryAccuracy: byId('victory-accuracy'),
        victoryTime: byId('victory-time'),
        victoryUpgrades: byId('victory-upgrades'),
        btnNewCampaign: byId('btn-new-campaign'),
        btnVictoryQuit: byId('btn-victory-quit'),
      };
    }

    resizeCanvas() {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.floor(W * this.dpr);
      this.canvas.height = Math.floor(H * this.dpr);
      if (this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    emptyStats() {
      return { score: 0, kills: 0, shots: 0, hits: 0, time: 0 };
    }

    newRun() {
      return {
        score: 0,
        kills: 0,
        shots: 0,
        hits: 0,
        time: 0,
        committed: false,
      };
    }

    combinedStats() {
      if (this.run.committed) return { ...this.campaign };
      return {
        score: this.campaign.score + this.run.score,
        kills: this.campaign.kills + this.run.kills,
        shots: this.campaign.shots + this.run.shots,
        hits: this.campaign.hits + this.run.hits,
        time: this.campaign.time + this.run.time,
      };
    }

    accuracyOf(stats) {
      if (!stats.shots) return 0;
      return clamp((stats.hits / stats.shots) * 100, 0, 100);
    }

    commitCampaign() {
      if (this.run.committed) return;
      this.campaign.score += this.run.score;
      this.campaign.kills += this.run.kills;
      this.campaign.shots += this.run.shots;
      this.campaign.hits += this.run.hits;
      this.campaign.time += this.run.time;
      this.run.committed = true;
    }

    loadSettings() {
      try {
        const best = parseInt(window.localStorage.getItem('iron-eclipse-best') || '0', 10);
        this.bestScore = Number.isFinite(best) ? best : 0;
        this.muted = window.localStorage.getItem('iron-eclipse-muted') === '1';
      } catch (error) {
        this.bestScore = 0;
        this.muted = false;
      }
    }

    saveBest(score) {
      if (score > this.bestScore) {
        this.bestScore = Math.floor(score);
        try {
          window.localStorage.setItem('iron-eclipse-best', String(this.bestScore));
        } catch (error) {
          /* storage can be unavailable in private mode */
        }
      }
      this.updateBestLabel();
    }

    updateBestLabel() {
      this.dom.menuBest.textContent =
        this.bestScore > 0
          ? `BEST RECORD // ${padScore(this.bestScore)}`
          : 'NO COMBAT RECORD';
    }

    syncMute() {
      this.audio.setMuted(this.muted);
      this.dom.btnMute.classList.toggle('muted', this.muted);
      this.dom.btnMenuMute.classList.toggle('muted', this.muted);
      this.dom.menuMuteLabel.textContent = this.muted ? 'Audio muted' : 'Audio enabled';
      this.dom.btnMute.setAttribute('aria-label', this.muted ? 'Unmute audio' : 'Mute audio');
      this.dom.btnMenuMute.setAttribute('aria-label', this.muted ? 'Enable audio' : 'Mute audio');
    }

    toggleMute() {
      this.audio.init();
      this.muted = !this.muted;
      this.syncMute();
      try {
        window.localStorage.setItem('iron-eclipse-muted', this.muted ? '1' : '0');
      } catch (error) {
        /* ignore */
      }
      if (!this.muted) this.audio.play('ui');
    }

    /* =======================================================
       Event wiring
       ======================================================= */

    bindEvents() {
      const button = (element, handler) => {
        if (!element) return;
        element.addEventListener('click', (event) => {
          event.preventDefault();
          this.audio.init();
          this.audio.play('ui');
          handler();
        });
      };

      button(this.dom.btnStart, () => this.beginCampaign());
      button(this.dom.btnDeploy, () => this.deploy());
      button(this.dom.btnResume, () => this.resume());
      button(this.dom.btnRestartLevel, () => {
        this.audio.setMusicDucked(false);
        this.startLevel(this.levelIndex);
      });
      button(this.dom.btnQuit, () => this.showMenu());
      button(this.dom.btnRetry, () => this.startLevel(this.levelIndex));
      button(this.dom.btnGameoverQuit, () => this.showMenu());
      button(this.dom.btnNewCampaign, () => this.beginCampaign());
      button(this.dom.btnVictoryQuit, () => this.showMenu());
      button(this.dom.btnMute, () => this.toggleMute());
      button(this.dom.btnMenuMute, () => this.toggleMute());
      button(this.dom.btnPause, () => {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      });

      this.dom.upgradeCards.addEventListener('click', (event) => {
        const card = event.target.closest('.upgrade-card');
        if (!card) return;
        this.audio.init();
        this.chooseUpgrade(card.dataset.key);
      });

      window.addEventListener('keydown', (event) => this.onKeyDown(event));
      window.addEventListener('keyup', (event) => {
        this.input.keys.delete(event.key.toLowerCase());
      });
      window.addEventListener('blur', () => {
        this.input.keys.clear();
        this.input.firing = false;
        this.dom.crosshair.classList.remove('firing');
      });
      window.addEventListener('resize', () => this.resizeCanvas());
      window.addEventListener('pointerup', () => {
        this.input.firing = false;
        this.dom.crosshair.classList.remove('firing');
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.pause();
      });

      this.stage.addEventListener('pointermove', (event) => this.updatePointer(event));
      this.stage.addEventListener('pointerenter', (event) => {
        this.input.inside = true;
        this.updatePointer(event);
      });
      this.stage.addEventListener('pointerleave', () => {
        this.input.inside = false;
        this.dom.crosshair.classList.remove('visible');
      });
      this.stage.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (event.target.closest('button')) return;
        this.audio.init();
        this.updatePointer(event);
        if (this.state === 'playing') {
          this.input.firing = true;
          this.dom.crosshair.classList.add('firing');
        }
      });
      this.stage.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    onKeyDown(event) {
      const key = event.key.toLowerCase();
      const preventKeys = [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
      if (preventKeys.includes(key)) event.preventDefault();

      if (key === 'm') {
        event.preventDefault();
        this.toggleMute();
        return;
      }

      if (key === 'escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        else if (this.state === 'briefing') this.showMenu();
        return;
      }

      if (key === 'enter') {
        if (this.state === 'menu') this.beginCampaign();
        else if (this.state === 'briefing') this.deploy();
        else if (this.state === 'paused') this.resume();
        else if (this.state === 'gameover') this.startLevel(this.levelIndex);
        else if (this.state === 'victory') this.beginCampaign();
        return;
      }

      if (key === ' ' || key === 'spacebar') {
        if (this.state === 'playing') {
          this.audio.init();
          this.input.dashQueued = true;
        }
        return;
      }

      this.input.keys.add(key);
    }

    updatePointer(event) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const localX = clamp(event.clientX - rect.left, 0, rect.width);
      const localY = clamp(event.clientY - rect.top, 0, rect.height);
      this.pointer.x = (localX / rect.width) * W;
      this.pointer.y = (localY / rect.height) * H;
      this.dom.crosshair.style.left = `${localX}px`;
      this.dom.crosshair.style.top = `${localY}px`;
    }

    /* =======================================================
       Campaign and screen flow
       ======================================================= */

    hideScreens() {
      [
        this.dom.screenMenu,
        this.dom.screenBriefing,
        this.dom.screenUpgrade,
        this.dom.screenPause,
        this.dom.screenGameover,
        this.dom.screenVictory,
      ].forEach((screen) => screen.classList.add('hidden'));
    }

    resetWorld() {
      this.player = null;
      this.boss = null;
      this.enemies = [];
      this.bullets = [];
      this.enemyBullets = [];
      this.particles = [];
      this.dangerZones = [];
      this.shockwaves = [];
      this.pickups = [];
      this.shieldNodes = [];
      this.trackMarks = [];
      this.afterimages = [];
      this.floatingTexts = [];
      this.pendingSpawns = [];
      this.waveActive = false;
      this.waveIndex = 0;
      this.nextWaveTimer = 0;
      this.bossStarted = false;
      this.bossSpawnTimer = 0;
      this.sectorCleared = false;
      this.introTimer = 0;
      this.clearTimer = 0;
      this.deathTimer = 0;
      this.bossDeathTimer = 0;
      this.shieldOrbitAngle = 0;
      this.shake = { time: 0, duration: 0, intensity: 0 };
      this.damageFlash = 0;
      this.dom.damageFlash.style.opacity = '0';
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.dom.bossIntro.classList.remove('active');
      this.dom.bossIntro.setAttribute('aria-hidden', 'true');
      this.dom.bossHud.classList.add('hidden');
      this.dom.hud.classList.remove('boss-mode');
    }

    showMenu() {
      this.audio.stopMusic();
      this.audio.setMusicDucked(false);
      this.state = 'menu';
      this.resetWorld();
      this.levelIndex = 0;
      this.level = LEVELS[0];
      this.background = makeBackground(this.level);
      this.resetAmbient();
      this.hideScreens();
      this.dom.screenMenu.classList.remove('hidden');
      this.dom.hud.classList.add('hidden');
      this.dom.bossHud.classList.add('hidden');
      this.dom.bossIntro.classList.remove('active');
      this.dom.bossIntro.setAttribute('aria-hidden', 'true');
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.updateBestLabel();
      this.syncMute();
    }

    beginCampaign() {
      this.audio.init();
      this.campaign = this.emptyStats();
      this.upgrades = {};
      UPGRADES.forEach((upgrade) => {
        this.upgrades[upgrade.key] = 0;
      });
      this.levelIndex = 0;
      this.showBriefing(0);
    }

    showBriefing(index) {
      this.audio.stopMusic();
      this.audio.setMusicDucked(false);
      this.state = 'briefing';
      this.levelIndex = index;
      this.level = LEVELS[index];
      this.resetWorld();
      this.background = makeBackground(this.level);
      this.resetAmbient();

      this.hideScreens();
      this.dom.screenBriefing.classList.remove('hidden');
      this.dom.hud.classList.add('hidden');
      this.dom.bossHud.classList.add('hidden');
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');

      const level = this.level;
      this.dom.briefingSector.innerHTML =
        `<span class="eyebrow-line"></span> ${level.sector}`;
      this.dom.briefingTitle.textContent = level.name;
      this.dom.briefingSubtitle.textContent = level.subtitle;
      this.dom.briefingObjective.textContent = level.objective;
      this.dom.briefingThreat.textContent = level.threat;
      this.dom.briefingHazard.textContent = level.hazard;
      this.dom.briefingIntel.textContent = level.intel;
      this.dom.briefingHint.textContent = level.hint;

      const deployLabel = this.dom.btnDeploy.querySelector('span');
      if (deployLabel) {
        deployLabel.textContent = level.boss ? 'Engage the Sovereign' : 'Deploy unit';
      }

      this.dom.screenBriefing.querySelectorAll('.mini-node').forEach((node) => {
        const sector = Number(node.dataset.sector);
        node.classList.toggle('active', sector === level.index);
        node.classList.toggle('complete', sector < level.index);
        node.classList.toggle('boss', sector === 4);
      });
    }

    deploy() {
      if (this.state !== 'briefing') return;
      this.audio.init();
      this.startLevel(this.levelIndex);
    }

    startLevel(index) {
      this.audio.init();
      this.audio.setMusicDucked(false);
      this.state = 'playing';
      this.levelIndex = index;
      this.level = LEVELS[index];
      this.run = this.newRun();
      this.resetWorld();
      this.background = makeBackground(this.level);
      this.resetAmbient();

      this.player = new Player(this, this.upgrades);
      this.player.invuln = 1.4;

      this.waveIndex = 0;
      this.waveActive = false;
      this.nextWaveTimer = this.level.boss ? 0 : 2.75;
      this.bossSpawnTimer = this.level.boss ? 3.7 : 0;
      this.bossStarted = false;
      this.sectorCleared = false;

      this.hideScreens();
      this.dom.hud.classList.remove('hidden');
      this.dom.hud.classList.remove('boss-mode');
      this.dom.bossHud.classList.add('hidden');
      this.dom.bossIntro.classList.remove('active');
      this.dom.bossIntro.setAttribute('aria-hidden', 'true');

      this.audio.startMusic(this.level.id);
      this.updateWavePips();
      this.updateHUD(true);

      if (this.level.boss) {
        this.showAnnouncement('FINAL SECTOR', 'THE SOVEREIGN', 'TITAN SIGNATURE DETECTED');
        this.showToast('TITAN-CLASS CONTACT // HOLD FORMATION', true, 2300);
      } else {
        this.showAnnouncement(this.level.sector, this.level.name, this.level.subtitle);
      }
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.input.firing = false;
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.hideScreens();
      this.dom.screenPause.classList.remove('hidden');
      this.audio.setMusicDucked(true);
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.dom.screenPause.classList.add('hidden');
      this.audio.setMusicDucked(false);
    }

    showUpgrade() {
      this.audio.stopMusic();
      this.state = 'upgrade';
      this.hideScreens();
      this.dom.screenUpgrade.classList.remove('hidden');
      this.dom.hud.classList.add('hidden');
      this.dom.bossHud.classList.add('hidden');
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');

      const pool = UPGRADES.filter(
        (upgrade) => (this.upgrades[upgrade.key] || 0) < upgrade.max
      );
      const choices = shuffle(pool).slice(0, 3);

      this.dom.upgradeCards.innerHTML = choices
        .map((upgrade, index) => {
          const current = this.upgrades[upgrade.key] || 0;
          const pips = Array.from({ length: upgrade.max }, (_, pip) => {
            return `<b>${pip < current ? '◆' : '◇'}</b>`;
          }).join(' ');
          return `
            <button class="upgrade-card" type="button" data-key="${upgrade.key}">
              <span class="upgrade-index">REFIT // ${padTwo(index + 1)}</span>
              <span class="upgrade-icon">${UPGRADE_ICONS[upgrade.icon] || ''}</span>
              <span class="upgrade-tag">${upgrade.tag} // ${upgrade.stat}</span>
              <h3>${upgrade.name}</h3>
              <p>${upgrade.desc}</p>
              <span class="upgrade-level">INTEGRATION ${pips} // MAX ${upgrade.max}</span>
            </button>`;
        })
        .join('');
    }

    chooseUpgrade(key) {
      if (this.state !== 'upgrade') return;
      const upgrade = UPGRADES.find((item) => item.key === key);
      if (!upgrade) return;
      if ((this.upgrades[key] || 0) >= upgrade.max) return;

      this.upgrades[key] = (this.upgrades[key] || 0) + 1;
      this.audio.play('pickup');
      this.levelIndex += 1;
      if (this.levelIndex < LEVELS.length) {
        this.showBriefing(this.levelIndex);
      }
    }

    showGameOver() {
      const stats = this.combinedStats();
      this.state = 'gameover';
      this.audio.stopMusic();
      this.audio.play('gameOver');
      this.hideScreens();
      this.dom.screenGameover.classList.remove('hidden');
      this.dom.hud.classList.add('hidden');
      this.dom.bossHud.classList.add('hidden');
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.dom.gameoverScore.textContent = padScore(stats.score);
      this.dom.gameoverKills.textContent = padTwo(stats.kills);
      this.dom.gameoverAccuracy.textContent = `${Math.round(this.accuracyOf(stats))}%`;
      this.dom.gameoverTime.textContent = formatTime(stats.time);
      this.saveBest(stats.score);
    }

    showVictory() {
      this.commitCampaign();
      const stats = this.combinedStats();
      this.state = 'victory';
      this.audio.victorySting();
      this.hideScreens();
      this.dom.screenVictory.classList.remove('hidden');
      this.dom.hud.classList.add('hidden');
      this.dom.bossHud.classList.add('hidden');
      this.dom.bossIntro.classList.remove('active');
      this.dom.bossIntro.setAttribute('aria-hidden', 'true');
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.dom.victoryScore.textContent = padScore(stats.score);
      this.dom.victoryKills.textContent = padTwo(stats.kills);
      this.dom.victoryAccuracy.textContent = `${Math.round(this.accuracyOf(stats))}%`;
      this.dom.victoryTime.textContent = formatTime(stats.time);
      this.dom.victoryUpgrades.innerHTML = UPGRADES.filter(
        (upgrade) => (this.upgrades[upgrade.key] || 0) > 0
      )
        .map((upgrade) => {
          const level = this.upgrades[upgrade.key];
          return `<span>${upgrade.name} // ${'◆'.repeat(level)}</span>`;
        })
        .join('');
      this.saveBest(stats.score);
    }

    showAnnouncement(kicker, title, sub) {
      this.dom.announcementKicker.textContent = kicker;
      this.dom.announcementTitle.textContent = title;
      this.dom.announcementSub.textContent = sub;
      this.dom.announcement.classList.remove('show');
      void this.dom.announcement.offsetWidth;
      this.dom.announcement.classList.add('show');
      const token = ++this.announcementToken;
      window.setTimeout(() => {
        if (token === this.announcementToken) {
          this.dom.announcement.classList.remove('show');
        }
      }, 2900);
    }

    showToast(text, amber = false, duration = 1800) {
      if (this.toastTimeout) window.clearTimeout(this.toastTimeout);
      this.dom.toast.textContent = text;
      this.dom.toast.classList.toggle('amber', amber);
      this.dom.toast.classList.add('show');
      this.toastTimeout = window.setTimeout(() => {
        this.dom.toast.classList.remove('show');
      }, duration);
    }

    /* =======================================================
       Main loop and combat updates
       ======================================================= */

    loop(timestamp) {
      const elapsed = Math.max(0, (timestamp - this.lastTime) / 1000);
      this.lastTime = timestamp;

      // Fixed-step simulation keeps the campaign running at the intended speed
      // even when rendering drops below 60 fps. Rendering still happens once per
      // animation frame, and a hard cap prevents a background-tab stall from
      // turning into a long catch-up spiral.
      this.accumulator += Math.min(0.2, elapsed);
      const step = 1 / 60;
      let iterations = 0;
      while (this.accumulator >= step && iterations < 10) {
        this.tick(step);
        this.accumulator -= step;
        iterations += 1;
      }
      if (iterations === 10) this.accumulator = 0;

      this.render();
      requestAnimationFrame(this.loop);
    }

    tick(dt) {
      if (this.state === 'playing') {
        this.updateGameplay(dt);
      } else if (this.state === 'bossIntro') {
        this.updateBossIntro(dt);
      } else if (this.state === 'levelClear') {
        this.updateLevelClear(dt);
      } else if (this.state === 'dying') {
        this.updateDying(dt);
      } else if (this.state === 'bossDeath') {
        this.updateBossDeath(dt);
      } else if (this.state !== 'paused') {
        this.updateAmbient(dt);
        this.updateParticles(dt);
        this.updateFloatingTexts(dt);
        this.updateAfterimages(dt);
        this.updateTrackMarks(dt);
        this.updateShake(dt);
        this.updateVisualState(dt);
      }
    }

    updateGameplay(dt) {
      if (!this.player) return;
      this.run.time += dt;

      this.updatePlayer(dt);
      this.updateSpawns(dt);
      this.updateEnemies(dt);
      this.updateBoss(dt);
      this.updateShieldNodes(dt);
      this.updateBullets(dt);
      this.updateDangerZones(dt);
      this.updateShockwaves(dt);
      this.updatePickups(dt);
      this.updateHazards(dt);
      this.updateParticles(dt);
      this.updateAfterimages(dt);
      this.updateTrackMarks(dt);
      this.updateFloatingTexts(dt);
      this.updateAmbient(dt);
      this.updateWaveFlow(dt);
      this.updateShake(dt);
      this.updateVisualState(dt);
      this.cleanup();

      this.uiAccumulator += dt;
      if (this.uiAccumulator >= 0.04) {
        this.uiAccumulator = 0;
        this.updateHUD();
      }
    }

    updatePlayer(dt) {
      const player = this.player;
      if (!player || player.dead) return;
      player.update(dt);

      const boss = this.boss;
      if (boss && !boss.dead && !player.dead) {
        const contact = boss.radius * 0.78 + player.radius;
        if (dist(player.x, player.y, boss.x, boss.y) < contact) {
          player.damage(18, 'ram');
        }
      }
    }

    updateSpawns(dt) {
      if (!this.pendingSpawns.length) return;
      for (const pending of this.pendingSpawns) {
        pending.timer -= dt;
        if (pending.timer <= 0 && !pending.done) {
          pending.done = true;
          this.spawnEnemyFromSpec(pending);
        }
      }
      this.pendingSpawns = this.pendingSpawns.filter((pending) => !pending.done);
    }

    spawnEnemyFromSpec(spec) {
      const point = this.findSpawnPoint();
      const enemy = new Enemy(this, spec.typeKey, point.x, point.y, spec.options || {});
      this.enemies.push(enemy);
      this.spawnSpawnRing(point.x, point.y, enemy.color, enemy.elite);
      if (enemy.elite) {
        this.audio.play('alarm');
        this.triggerShake(3.5, 0.25);
      }
    }

    spawnWave(index) {
      const wave = this.level.waves[index];
      if (!wave || this.waveActive) return;
      this.waveIndex = index;
      this.waveActive = true;
      this.pendingSpawns = [];

      let delay = 0.08;
      wave.spawns.forEach((spawn) => {
        const count = spawn.count || 1;
        for (let i = 0; i < count; i += 1) {
          let typeKey = spawn.type;
          const options = {};
          if (spawn.type === 'elite') {
            typeKey = spawn.base || 'scout';
            options.elite = true;
            options.baseType = typeKey;
            options.name = spawn.name || this.level.elite;
          }
          this.pendingSpawns.push({ timer: delay, typeKey, options });
          delay += rand(0.1, 0.22);
        }
      });

      this.showAnnouncement(
        wave.elite ? 'ELITE SIGNATURE' : 'HOSTILE CONTACT',
        `WAVE ${padTwo(index + 1)}`,
        wave.elite ? `${this.level.elite} // ENGAGED` : 'BREAK THEIR FORMATION'
      );
      this.audio.play('alarm');
      this.updateWavePips();
    }

    updateWaveFlow(dt) {
      if (this.state !== 'playing') return;

      if (this.level.boss) {
        if (!this.bossStarted && !this.boss) {
          this.bossSpawnTimer -= dt;
          if (this.bossSpawnTimer <= 0) this.startBoss();
        }
        return;
      }

      if (this.sectorCleared) return;

      if (!this.waveActive) {
        if (this.nextWaveTimer > 0) {
          this.nextWaveTimer -= dt;
          if (this.nextWaveTimer <= 0) this.spawnWave(this.waveIndex);
        }
        return;
      }

      const alive = this.enemies.some((enemy) => !enemy.dead);
      if (!alive && this.pendingSpawns.length === 0) {
        this.waveActive = false;
        this.run.score += 150;
        this.waveIndex += 1;
        if (this.waveIndex >= this.level.waves.length) {
          this.levelCleared();
        } else {
          this.nextWaveTimer = 2.75;
          this.showAnnouncement(
            'WAVE CLEAR',
            `WAVE ${padTwo(this.waveIndex)} SECURED`,
            'NEXT CONTACT INBOUND'
          );
          this.showToast('WAVE CLEAR // +150', false, 1500);
          this.updateWavePips();
        }
      }
    }

    updateEnemies(dt) {
      const player = this.player;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        enemy.update(dt);
        if (
          player &&
          !player.dead &&
          enemy.spawnTimer <= 0 &&
          dist(player.x, player.y, enemy.x, enemy.y) <
            player.radius + enemy.radius * 0.82
        ) {
          player.damage(enemy.damage * 0.55, 'ram');
        }
      }
    }

    updateBoss(dt) {
      const boss = this.boss;
      if (!boss || boss.dead) return;
      boss.update(dt);

      const player = this.player;
      if (player && !player.dead) {
        const contact = boss.radius * 0.78 + player.radius;
        if (dist(player.x, player.y, boss.x, boss.y) < contact) {
          player.damage(20, 'ram');
        }
      }
    }

    updateShieldNodes(dt) {
      if (!this.shieldNodes.length) return;
      this.shieldOrbitAngle += dt * 0.34;
      const boss = this.boss;
      for (const node of this.shieldNodes) {
        node.update(dt);
        if (boss) {
          const angle = node.orbitAngle + this.shieldOrbitAngle;
          node.x = boss.x + Math.cos(angle) * 238;
          node.y = boss.y + Math.sin(angle) * 154;
        }
      }
    }

    updateBullets(dt) {
      const player = this.player;

      for (const bullet of this.bullets) {
        if (bullet.dead) continue;
        bullet.update(dt);
        if (bullet.dead) continue;

        if (
          bullet.x < ARENA_INSET ||
          bullet.x > W - ARENA_INSET ||
          bullet.y < ARENA_INSET ||
          bullet.y > H - ARENA_INSET
        ) {
          bullet.dead = true;
          this.spawnBulletImpact(
            clamp(bullet.x, ARENA_INSET, W - ARENA_INSET),
            clamp(bullet.y, ARENA_INSET, H - ARENA_INSET),
            bullet.color
          );
          continue;
        }

        if (this.segmentHitsObstacle(bullet.prevX, bullet.prevY, bullet.x, bullet.y)) {
          bullet.dead = true;
          this.spawnBulletImpact(bullet.x, bullet.y, bullet.color);
          continue;
        }

        let hit = false;
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          if (
            segmentCircleHit(
              bullet.prevX,
              bullet.prevY,
              bullet.x,
              bullet.y,
              enemy.x,
              enemy.y,
              enemy.radius + bullet.radius
            )
          ) {
            this.run.hits += 1;
            enemy.takeDamage(bullet.damage, bullet.x, bullet.y);
            bullet.dead = true;
            hit = true;
            break;
          }
        }
        if (hit) continue;

        for (const node of this.shieldNodes) {
          if (node.dead) continue;
          if (
            segmentCircleHit(
              bullet.prevX,
              bullet.prevY,
              bullet.x,
              bullet.y,
              node.x,
              node.y,
              node.radius + bullet.radius
            )
          ) {
            this.run.hits += 1;
            node.damage(bullet.damage, bullet.x, bullet.y);
            bullet.dead = true;
            hit = true;
            break;
          }
        }
        if (hit) continue;

        const boss = this.boss;
        if (boss && !boss.dead) {
          if (
            segmentCircleHit(
              bullet.prevX,
              bullet.prevY,
              bullet.x,
              bullet.y,
              boss.x,
              boss.y,
              boss.radius
            )
          ) {
            this.run.hits += 1;
            bullet.dead = true;
            if (boss.shielded) {
              this.audio.play('shieldHit');
              this.spawnShieldSpark(bullet.x, bullet.y);
              this.triggerShake(0.8, 0.08);
            } else {
              boss.damage(bullet.damage, bullet.x, bullet.y);
            }
          }
        }
      }

      for (const bullet of this.enemyBullets) {
        if (bullet.dead) continue;
        bullet.update(dt);
        if (bullet.dead) continue;

        if (
          bullet.x < ARENA_INSET ||
          bullet.x > W - ARENA_INSET ||
          bullet.y < ARENA_INSET ||
          bullet.y > H - ARENA_INSET
        ) {
          bullet.dead = true;
          continue;
        }

        if (this.segmentHitsObstacle(bullet.prevX, bullet.prevY, bullet.x, bullet.y)) {
          bullet.dead = true;
          this.spawnBulletImpact(bullet.x, bullet.y, bullet.color);
          continue;
        }

        if (
          player &&
          !player.dead &&
          segmentCircleHit(
            bullet.prevX,
            bullet.prevY,
            bullet.x,
            bullet.y,
            player.x,
            player.y,
            player.radius + bullet.radius
          )
        ) {
          player.damage(bullet.damage, 'shot');
          bullet.dead = true;
        }
      }
    }

    updateDangerZones(dt) {
      for (const zone of this.dangerZones) zone.update(dt);
    }

    updateShockwaves(dt) {
      for (const wave of this.shockwaves) wave.update(dt);
    }

    updatePickups(dt) {
      for (const pickup of this.pickups) pickup.update(dt);
    }

    updateHazards(dt) {
      const vents = this.level.lavaVents || [];
      if (!vents.length) return;
      this.ventHitCooldown = Math.max(0, this.ventHitCooldown - dt);
      this.hazardParticleTimer -= dt;

      for (const vent of vents) {
        const state = this.getVentState(vent);
        if (!state.active) continue;

        if (this.hazardParticleTimer <= 0) {
          this.hazardParticleTimer = 0.045;
          for (let i = 0; i < 2; i += 1) {
            this.addParticle({
              type: 'spark',
              x: vent.x + rand(-vent.r * 0.72, vent.r * 0.72),
              y: vent.y + rand(-vent.r * 0.22, vent.r * 0.3),
              vx: rand(-34, 34),
              vy: rand(-190, -65),
              life: rand(0.35, 0.8),
              size: rand(1.2, 3.2),
              color: pick(['#ffb45f', '#ff7a4c', '#ffd9a0']),
              drag: 1.1,
            });
          }
        }

        const player = this.player;
        if (
          player &&
          !player.dead &&
          this.ventHitCooldown <= 0 &&
          dist(player.x, player.y, vent.x, vent.y) < vent.r + player.radius * 0.7
        ) {
          if (player.damage(12, 'vent')) {
            this.ventHitCooldown = 0.62;
            this.spawnExplosion(player.x, player.y, 0.55, '#ff925c');
          }
        }
      }
    }

    getVentState(vent) {
      const cycle = 5.4;
      const t = ((this.run.time + (vent.offset || 0)) % cycle + cycle) % cycle;
      return {
        cycle,
        t,
        warning: t < 1.45,
        active: t >= 1.45 && t < 2.08,
        charge: clamp(t / 1.45, 0, 1),
        fade: clamp((t - 1.45) / 0.63, 0, 1),
      };
    }

    updateParticles(dt) {
      for (const particle of this.particles) particle.update(dt);
    }

    updateAfterimages(dt) {
      for (const ghost of this.afterimages) ghost.life -= dt;
    }

    updateTrackMarks(dt) {
      for (const mark of this.trackMarks) mark.life -= dt;
    }

    updateFloatingTexts(dt) {
      for (const text of this.floatingTexts) {
        text.life -= dt;
        text.y += text.vy * dt;
        text.vy *= Math.max(0, 1 - 1.2 * dt);
      }
    }

    updateShake(dt) {
      if (this.shake.time > 0) {
        this.shake.time = Math.max(0, this.shake.time - dt);
        if (this.shake.time <= 0) this.shake.intensity = 0;
      }
    }

    updateVisualState(dt) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 1.85);
      this.dom.damageFlash.style.opacity = this.damageFlash.toFixed(3);

      const combat = this.state === 'playing';
      this.stage.classList.toggle('combat', combat);
      const visible = combat && this.input.inside;
      this.dom.crosshair.classList.toggle('visible', visible);
      this.dom.crosshair.classList.toggle('firing', combat && this.input.firing);
    }

    updateHUD() {
      const player = this.player;
      const level = this.level;
      if (!level) return;

      this.dom.hudSector.textContent = `${level.sector} // ${level.name}`;
      this.dom.hudScore.textContent = padScore(this.campaign.score + this.run.score);
      this.dom.hudKills.textContent = padTwo(this.campaign.kills + this.run.kills);

      if (player) {
        this.dom.hullFill.style.width = `${clamp(player.hp / player.maxHp, 0, 1) * 100}%`;
        this.dom.shieldFill.style.width = `${clamp(player.shield / player.maxShield, 0, 1) * 100}%`;
        this.dom.hullText.textContent = String(Math.ceil(player.hp));
        this.dom.shieldText.textContent = String(Math.ceil(player.shield));

        const reloadProgress =
          player.reloadTimer <= 0
            ? 1
            : clamp(1 - player.reloadTimer / player.reloadTime, 0, 1);
        const dashProgress =
          player.dashCooldown <= 0
            ? 1
            : clamp(1 - player.dashCooldown / player.dashCooldownTime, 0, 1);
        this.dom.reloadFill.style.width = `${reloadProgress * 100}%`;
        this.dom.dashFill.style.width = `${dashProgress * 100}%`;
        this.dom.reloadText.textContent = player.reloadTimer <= 0 ? 'READY' : 'CYCLING';
        this.dom.dashText.textContent = player.dashCooldown <= 0 ? 'READY' : 'CHARGING';

        const overdrive = player.overdrive > 0;
        this.dom.buffStatus.classList.toggle('hidden', !overdrive);
        if (overdrive) {
          this.dom.buffText.textContent = `OVERDRIVE // ${player.overdrive.toFixed(1)}s`;
        }
      }

      const boss = this.boss;
      this.dom.hud.classList.toggle('boss-mode', !!boss);

      if (this.level.boss) {
        this.dom.hudWave.textContent = boss ? 'TITAN CONTACT' : 'FINAL CONTACT';
      } else if (this.waveIndex >= this.level.waves.length) {
        this.dom.hudWave.textContent = 'SECTOR CLEAR';
      } else {
        const displayWave = Math.min(this.waveIndex + 1, this.level.waves.length);
        this.dom.hudWave.textContent = `WAVE ${padTwo(displayWave)} / ${padTwo(
          this.level.waves.length
        )}`;
      }

      if (boss) {
        const phase = boss.phase;
        this.dom.bossFill.style.width = `${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%`;
        this.dom.bossPhase.textContent =
          phase === 1
            ? 'PHASE I // BASTION'
            : phase === 2
              ? 'PHASE II // BULWARK'
              : 'PHASE III // MELTDOWN';
        this.dom.bossStatus.textContent =
          boss.dead
            ? 'SIGNAL LOST'
            : boss.shielded
              ? 'SHIELD MATRIX ACTIVE'
              : phase === 3
                ? 'CORE CRITICAL // MELTDOWN'
                : phase === 2
                  ? 'CORE EXPOSED'
                  : 'CORE STABLE';
        this.dom.hudObjective.textContent =
          boss.shielded
            ? 'DESTROY THE SHIELD NODES'
            : phase === 3
              ? 'MELTDOWN PROTOCOL // END IT'
              : phase === 2
                ? 'CORE EXPOSED // FIRE AT WILL'
                : "BREAK THE TITAN'S ARMOR";
      } else {
        this.dom.hudObjective.textContent = level.objective;
      }
    }

    updateWavePips() {
      if (!this.level || this.level.boss) {
        this.dom.wavePips.innerHTML = '';
        return;
      }
      this.dom.wavePips.innerHTML = this.level.waves
        .map((wave, index) => {
          let cls = '';
          if (this.sectorCleared || index < this.waveIndex) cls = 'cleared';
          else if (index === this.waveIndex) cls = 'active';
          return `<i class="${cls}"></i>`;
        })
        .join('');
    }

    cleanup() {
      this.enemies = this.enemies.filter((enemy) => !enemy.dead);
      this.bullets = this.bullets.filter((bullet) => !bullet.dead);
      this.enemyBullets = this.enemyBullets.filter((bullet) => !bullet.dead);
      this.particles = this.particles.filter((particle) => !particle.dead);
      this.dangerZones = this.dangerZones.filter((zone) => !zone.dead);
      this.shockwaves = this.shockwaves.filter((wave) => !wave.dead);
      this.pickups = this.pickups.filter((pickup) => !pickup.dead);
      this.shieldNodes = this.shieldNodes.filter((node) => !node.dead);
      this.trackMarks = this.trackMarks.filter((mark) => mark.life > 0);
      this.afterimages = this.afterimages.filter((ghost) => ghost.life > 0);
      this.floatingTexts = this.floatingTexts.filter((text) => text.life > 0);
    }

    /* =======================================================
       Boss flow and cinematics
       ======================================================= */

    startBoss() {
      if (this.bossStarted || this.state !== 'playing') return;
      this.bossStarted = true;
      this.boss = new Boss(this);
      this.state = 'bossIntro';
      this.introTimer = 3.9;
      this.input.firing = false;
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.dom.hud.classList.add('boss-mode');
      this.dom.bossHud.classList.add('hidden');
      this.dom.bossIntro.classList.remove('active');
      void this.dom.bossIntro.offsetWidth;
      this.dom.bossIntro.classList.add('active');
      this.dom.bossIntro.setAttribute('aria-hidden', 'false');
      this.audio.setMusicDucked(true);
      this.audio.play('bossRoar');
      this.player.invuln = Math.max(this.player.invuln, 5);
      this.updateHUD();
    }

    endBossIntro() {
      this.state = 'playing';
      this.dom.bossIntro.classList.remove('active');
      this.dom.bossIntro.setAttribute('aria-hidden', 'true');
      this.dom.bossHud.classList.remove('hidden');
      this.audio.setMusicDucked(false);
      this.audio.play('alarm');
      this.showToast('TITAN-CLASS PLATFORM // ENGAGED', true, 2200);
      this.player.invuln = Math.max(this.player.invuln, 1.4);
      this.updateHUD(true);
    }

    updateBossIntro(dt) {
      this.introTimer -= dt;
      if (this.boss) this.boss.time += dt * 0.35;
      this.updateParticles(dt);
      this.updateAmbient(dt);
      this.updateFloatingTexts(dt);
      this.updateAfterimages(dt);
      this.updateTrackMarks(dt);
      this.updateShake(dt);
      this.updateVisualState(dt);
      if (this.introTimer <= 0) this.endBossIntro();
    }

    startBossPhaseTwo() {
      const boss = this.boss;
      if (!boss || boss.phase !== 1) return;
      boss.phase = 2;
      boss.shielded = true;
      boss.stunTimer = 2.7;
      boss.beam = null;
      boss.timers.fan = 2.4;
      boss.timers.missile = 4.7;
      boss.timers.beam = 6.6;
      boss.timers.minion = 8.5;
      boss.timers.shock = 5;
      this.enemyBullets = [];
      this.shieldOrbitAngle = 0;
      this.shieldNodes = [];
      const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
      angles.forEach((angle) => {
        const node = new ShieldNode(
          this,
          boss.x + Math.cos(angle) * 238,
          boss.y + Math.sin(angle) * 154
        );
        node.orbitAngle = angle;
        node.maxHp = 95;
        node.hp = node.maxHp;
        this.shieldNodes.push(node);
      });

      this.audio.play('bossPhase');
      this.audio.play('alarm');
      this.triggerShake(9, 0.65);
      this.spawnExplosion(boss.x, boss.y, 1.8, '#ff9dc0');
      this.showAnnouncement(
        'PHASE II // BULWARK',
        'SHIELD MATRIX',
        'DESTROY THE THREE NODES'
      );
      this.showToast('TARGET THE SHIELD NODES', true, 2300);
      this.updateHUD();
    }

    startBossPhaseThree() {
      const boss = this.boss;
      if (!boss || boss.phase !== 2) return;
      boss.phase = 3;
      boss.shielded = false;
      boss.stunTimer = 2.1;
      boss.beam = null;
      boss.timers.fan = 1.5;
      boss.timers.missile = 2.9;
      boss.timers.beam = 4.4;
      boss.timers.minion = 99;
      boss.timers.shock = 3;
      this.shieldNodes = [];
      this.enemyBullets = [];
      this.player.overdrive = Math.max(this.player.overdrive, 7);
      this.audio.play('bossPhase');
      this.audio.play('alarm');
      this.triggerShake(11, 0.85);
      this.spawnExplosion(boss.x, boss.y, 2.6, '#ffb0ff');
      this.showAnnouncement(
        'PHASE III // MELTDOWN',
        'CORE EXPOSED',
        'SURVIVE THE FINAL BARRAGE'
      );
      this.showToast('OVERDRIVE SURGE // CORE CRITICAL', true, 2500);
      this.updateHUD();
    }

    onNodeDestroyed(node) {
      this.spawnExplosion(node.x, node.y, 1.3, '#8ff4ff');
      this.audio.play('bigExplosion');
      this.triggerShake(5, 0.35);
      this.spawnFloatingText(node.x, node.y - 28, '+300', '#9ef7ff');

      const boss = this.boss;
      if (!boss) return;
      const alive = this.shieldNodes.some((shieldNode) => !shieldNode.dead);
      if (!alive) {
        boss.shielded = false;
        boss.stunTimer = 3.1;
        boss.beam = null;
        this.audio.play('shieldDown');
        this.showAnnouncement('SHIELD MATRIX', 'COLLAPSED', 'CORE EXPOSED // FIRE AT WILL');
        this.showToast('CORE EXPOSED // FULL DAMAGE', true, 2400);
        this.spawnExplosion(boss.x, boss.y, 1.8, '#a9f7ff');
        this.triggerShake(7, 0.5);
        this.updateHUD();
      }
    }

    bossDefeated() {
      const boss = this.boss;
      if (!boss || boss.dead) return;
      boss.dead = true;
      boss.hp = 0;
      this.state = 'bossDeath';
      this.bossDeathTimer = 4.5;
      this.bossBurstTimer = 0;
      this.input.firing = false;
      this.player.invuln = 999;
      this.enemyBullets = [];
      this.dangerZones = [];
      this.shockwaves = [];
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');

      this.enemies.forEach((enemy) => {
        if (enemy.dead) return;
        enemy.dead = true;
        this.spawnExplosion(enemy.x, enemy.y, 0.9, enemy.color);
      });
      this.enemies = [];

      this.run.kills += 1;
      this.addScore(boss.score, boss.x, boss.y - 80, '#ffe0aa');
      this.audio.stopMusic();
      this.audio.play('bigExplosion');
      this.audio.play('bossRoar');
      this.triggerShake(16, 1.25);
      this.spawnExplosion(boss.x, boss.y, 4.2, '#ffb0ff');
      this.spawnExplosion(boss.x, boss.y, 2.6, '#ffe2c0');
      this.showAnnouncement('TITAN SIGNATURE LOST', 'THE SOVEREIGN', 'CORE DESTROYED');
      this.dom.bossFill.style.width = '0%';
      this.dom.bossStatus.textContent = 'SIGNAL LOST';
      this.updateHUD(true);
    }

    updateBossDeath(dt) {
      this.bossDeathTimer -= dt;
      this.bossBurstTimer -= dt;
      this.updateParticles(dt);
      this.updateAmbient(dt);
      this.updateFloatingTexts(dt);
      this.updateAfterimages(dt);
      this.updateTrackMarks(dt);
      this.updateShake(dt);
      this.updateVisualState(dt);

      if (this.bossBurstTimer <= 0) {
        this.bossBurstTimer = 0.13;
        const boss = this.boss;
        if (boss) {
          const x = boss.x + rand(-boss.radius, boss.radius);
          const y = boss.y + rand(-boss.radius * 0.7, boss.radius * 0.7);
          this.spawnExplosion(x, y, rand(0.7, 1.6), pick(['#ffb0ff', '#ff8f7a', '#ffe3ba']));
          this.triggerShake(rand(3, 7), 0.2);
        }
      }

      if (this.bossDeathTimer <= 0) this.showVictory();
    }

    levelCleared() {
      if (this.state !== 'playing' || this.sectorCleared) return;
      this.sectorCleared = true;
      this.state = 'levelClear';
      this.clearTimer = 3.35;
      this.waveIndex = this.level.waves.length;
      this.run.score += 500;
      this.commitCampaign();
      this.audio.stopMusic();
      this.audio.play('levelClear');
      this.audio.setMusicDucked(false);
      this.input.firing = false;
      this.player.invuln = 999;
      this.enemyBullets = [];
      this.dangerZones = [];
      this.shockwaves = [];
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.showAnnouncement('SECTOR SECURED', this.level.name, 'FIELD REFIT AUTHORIZED');
      this.showToast('SECTOR CLEAR BONUS // +500', false, 1900);
      this.updateWavePips();
      this.updateHUD(true);
    }

    updateLevelClear(dt) {
      this.clearTimer -= dt;
      this.updateParticles(dt);
      this.updateAmbient(dt);
      this.updateFloatingTexts(dt);
      this.updateAfterimages(dt);
      this.updateTrackMarks(dt);
      this.updateShake(dt);
      this.updateVisualState(dt);
      if (this.clearTimer <= 0) this.showUpgrade();
    }

    updateDying(dt) {
      this.deathTimer -= dt;
      this.updateParticles(dt);
      this.updateAmbient(dt);
      this.updateFloatingTexts(dt);
      this.updateAfterimages(dt);
      this.updateTrackMarks(dt);
      this.updateShake(dt);
      this.updateVisualState(dt);
      if (this.deathTimer <= 0) this.showGameOver();
    }

    playerDeath() {
      if (this.state !== 'playing') return;
      this.state = 'dying';
      this.deathTimer = 1.85;
      this.input.firing = false;
      this.player.invuln = 999;
      this.audio.stopMusic();
      this.audio.play('bigExplosion');
      this.spawnExplosion(this.player.x, this.player.y, 2.3, '#ffb36b');
      this.triggerShake(13, 0.9);
      this.dom.crosshair.classList.remove('visible', 'firing');
      this.stage.classList.remove('combat');
      this.updateHUD();
    }

    /* =======================================================
       Collision, line-of-sight, and spawning helpers
       ======================================================= */

    segmentHitsObstacle(x1, y1, x2, y2) {
      if (!this.level) return false;
      return this.level.obstacles.some((rect) =>
        segmentIntersectsRect(x1, y1, x2, y2, rect)
      );
    }

    pointBlocked(x, y, radius) {
      if (!this.level) return false;
      return this.level.obstacles.some((rect) =>
        circleRectOverlap(x, y, radius, rect)
      );
    }

    entityBlocked(entity) {
      if (!this.level) return false;
      return this.level.obstacles.some((rect) =>
        circleRectOverlap(entity.x, entity.y, entity.radius, rect)
      );
    }

    moveEntity(entity, dx, dy) {
      entity.x += dx;
      let blockedX = false;
      if (this.entityBlocked(entity)) {
        entity.x -= dx;
        blockedX = true;
      }

      entity.y += dy;
      let blockedY = false;
      if (this.entityBlocked(entity)) {
        entity.y -= dy;
        blockedY = true;
      }

      const minX = ARENA_INSET + entity.radius;
      const maxX = W - ARENA_INSET - entity.radius;
      const minY = ARENA_INSET + entity.radius;
      const maxY = H - ARENA_INSET - entity.radius;
      if (entity.x < minX) {
        entity.x = minX;
        blockedX = true;
      } else if (entity.x > maxX) {
        entity.x = maxX;
        blockedX = true;
      }
      if (entity.y < minY) {
        entity.y = minY;
        blockedY = true;
      } else if (entity.y > maxY) {
        entity.y = maxY;
        blockedY = true;
      }

      if (blockedX) entity.vx = 0;
      if (blockedY) entity.vy = 0;
    }

    isOnIce(x, y) {
      if (!this.level || !this.level.icePatches) return false;
      return this.level.icePatches.some((patch) => pointInEllipse(x, y, patch));
    }

    hasLineOfSight(x1, y1, x2, y2) {
      return !this.segmentHitsObstacle(x1, y1, x2, y2);
    }

    getAvoidance(entity, dirX, dirY) {
      let ax = dirX;
      let ay = dirY;
      const len = Math.hypot(ax, ay);
      if (len < 0.0001) {
        ax = 1;
        ay = 0;
      } else {
        ax /= len;
        ay /= len;
      }

      const look = 72;
      const px = entity.x + ax * look;
      const py = entity.y + ay * look;

      if (this.level) {
        for (const rect of this.level.obstacles) {
          if (!circleRectOverlap(px, py, entity.radius + 14, rect)) continue;
          const nx = clamp(entity.x, rect.x, rect.x + rect.w);
          const ny = clamp(entity.y, rect.y, rect.y + rect.h);
          let rx = entity.x - nx;
          let ry = entity.y - ny;
          const distance = Math.hypot(rx, ry);
          if (distance < 0.001) {
            rx = entity.x - (rect.x + rect.w / 2);
            ry = entity.y - (rect.y + rect.h / 2);
          }
          const normal = Math.hypot(rx, ry) || 1;
          ax += (rx / normal) * 1.8;
          ay += (ry / normal) * 1.8;
        }
      }

      if (px < ARENA_INSET + entity.radius + 35) ax += 1.1;
      if (px > W - ARENA_INSET - entity.radius - 35) ax -= 1.1;
      if (py < ARENA_INSET + entity.radius + 35) ay += 1.1;
      if (py > H - ARENA_INSET - entity.radius - 35) ay -= 1.1;

      const finalLen = Math.hypot(ax, ay) || 1;
      return { x: ax / finalLen, y: ay / finalLen };
    }

    findSpawnPoint() {
      const player = this.player;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        const edge = randInt(0, 3);
        let x;
        let y;
        if (edge === 0) {
          x = rand(W * 0.12, W * 0.88);
          y = rand(ARENA_INSET + 95, 235);
        } else if (edge === 1) {
          x = rand(ARENA_INSET + 80, W * 0.23);
          y = rand(130, H * 0.7);
        } else if (edge === 2) {
          x = rand(W * 0.77, W - ARENA_INSET - 80);
          y = rand(130, H * 0.7);
        } else {
          x = rand(W * 0.14, W * 0.86);
          y = rand(H * 0.55, H - ARENA_INSET - 100);
        }

        if (this.pointBlocked(x, y, 42)) continue;
        if (player && !player.dead && dist(x, y, player.x, player.y) < 340) continue;
        if (
          this.enemies.some(
            (enemy) => !enemy.dead && dist(x, y, enemy.x, enemy.y) < 82
          )
        ) {
          continue;
        }
        return { x, y };
      }
      return { x: W / 2 + rand(-260, 260), y: ARENA_INSET + 120 };
    }

    getBeamEnd(x, y, angle, maxDistance) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let best = maxDistance;

      if (this.level) {
        for (const rect of this.level.obstacles) {
          const hit = rayRectDistance(x, y, dx, dy, rect, maxDistance);
          if (hit !== null && hit < best) best = hit;
        }
      }

      const minX = ARENA_INSET;
      const maxX = W - ARENA_INSET;
      const minY = ARENA_INSET;
      const maxY = H - ARENA_INSET;
      if (dx > 0.0001) best = Math.min(best, (maxX - x) / dx);
      if (dx < -0.0001) best = Math.min(best, (minX - x) / dx);
      if (dy > 0.0001) best = Math.min(best, (maxY - y) / dy);
      if (dy < -0.0001) best = Math.min(best, (minY - y) / dy);

      best = Math.max(0, best);
      return { x: x + dx * best, y: y + dy * best };
    }

    /* =======================================================
       Scoring, damage feedback, and combat spawners
       ======================================================= */

    triggerShake(intensity, duration) {
      this.shake.intensity = Math.max(this.shake.intensity, intensity);
      this.shake.time = Math.max(this.shake.time, duration);
      this.shake.duration = Math.max(this.shake.duration, duration);
    }

    onPlayerHit(remaining, hadShield) {
      const player = this.player;
      this.damageFlash = Math.max(this.damageFlash, hadShield ? 0.38 : 0.82);
      this.dom.damageFlash.style.opacity = this.damageFlash.toFixed(3);
      this.triggerShake(remaining > 0 ? 6.5 : 3.5, 0.26);

      if (hadShield && player && player.shield <= 0.5) {
        this.audio.play('shieldDown');
        this.showToast('SHIELD COLLAPSED // HULL EXPOSED', true, 1800);
      } else {
        this.audio.play(hadShield ? 'shieldHit' : 'hit');
      }

      if (player) this.spawnPlayerHitBurst(player.x, player.y, hadShield);
    }

    addScore(points, x, y, color) {
      if (!points) return;
      this.run.score += points;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.spawnFloatingText(x, y, `+${points}`, color || '#ffe0aa');
      }
    }

    killEnemy(enemy) {
      if (!enemy || enemy._counted) return;
      enemy._counted = true;
      this.run.kills += 1;
      this.addScore(
        enemy.score,
        enemy.x,
        enemy.y - enemy.radius - 10,
        enemy.elite ? '#ffd17a' : '#ffd6ae'
      );
      this.spawnExplosion(
        enemy.x,
        enemy.y,
        enemy.elite ? 1.85 : 0.95,
        enemy.elite ? '#ffd17a' : enemy.color
      );
      this.audio.play(enemy.elite ? 'bigExplosion' : 'explosion');
      this.triggerShake(enemy.elite ? 7 : 2.1, enemy.elite ? 0.42 : 0.18);

      if (enemy.elite) {
        this.spawnPickup(enemy.x - 20, enemy.y, 'hull');
        this.spawnPickup(enemy.x + 20, enemy.y, 'shield');
        this.showToast(`${enemy.name} DESTROYED // +${enemy.score}`, true, 2000);
      } else if (Math.random() < 0.18) {
        const roll = Math.random();
        this.spawnPickup(
          enemy.x,
          enemy.y,
          roll < 0.48 ? 'hull' : roll < 0.86 ? 'shield' : 'overdrive'
        );
      }
    }

    spawnPlayerBullet(x, y, angle, damage) {
      this.bullets.push(
        new Bullet(this, {
          x,
          y,
          angle,
          speed: 930,
          damage,
          owner: 'player',
          radius: 4.2,
          life: 1.65,
          color: '#bdfbff',
        })
      );
    }

    spawnEnemyBullet(x, y, angle, speed, damage, color) {
      this.enemyBullets.push(
        new Bullet(this, {
          x,
          y,
          angle,
          speed: Math.max(90, speed),
          damage,
          owner: 'enemy',
          radius: 5.4,
          life: 3.4,
          color: color || '#ff8a72',
        })
      );
    }

    spawnDangerZone(options) {
      if (this.dangerZones.length > 18) this.dangerZones.shift();
      this.dangerZones.push(new DangerZone(this, options));
    }

    detonateDangerZone(zone) {
      this.spawnExplosion(zone.x, zone.y, Math.max(0.8, zone.radius / 72), zone.color);
      this.audio.play('explosion');
      this.triggerShake(3.2, 0.22);
      const player = this.player;
      if (
        player &&
        !player.dead &&
        dist(zone.x, zone.y, player.x, player.y) < zone.radius + player.radius
      ) {
        player.damage(zone.damage, 'artillery');
      }
    }

    spawnShockwave(options) {
      if (this.shockwaves.length > 7) this.shockwaves.shift();
      this.shockwaves.push(new Shockwave(this, options));
    }

    spawnPickup(x, y, type) {
      this.pickups.push(
        new Pickup(
          this,
          clamp(x + rand(-18, 18), ARENA_INSET + 25, W - ARENA_INSET - 25),
          clamp(y + rand(-18, 18), ARENA_INSET + 25, H - ARENA_INSET - 25),
          type
        )
      );
    }

    collectPickup(pickup) {
      const player = this.player;
      if (!player || player.dead) return;

      if (pickup.type === 'hull') {
        const amount = player.heal(28);
        if (amount > 0) {
          this.spawnFloatingText(player.x, player.y - 38, `+${Math.round(amount)} HULL`, '#ffd08a');
        } else {
          this.showToast('HULL ALREADY AT CAPACITY', false, 1200);
        }
      } else if (pickup.type === 'shield') {
        const amount = player.addShield(34);
        if (amount > 0) {
          this.spawnFloatingText(player.x, player.y - 38, `+${Math.round(amount)} SHIELD`, '#9ef7ff');
        } else {
          this.showToast('SHIELD ALREADY AT CAPACITY', false, 1200);
        }
      } else if (pickup.type === 'overdrive') {
        player.overdrive = Math.max(player.overdrive, 7);
        player.reloadTimer = 0;
        this.showToast('OVERDRIVE SURGE // 7s', true, 1800);
        this.spawnFloatingText(player.x, player.y - 38, 'OVERDRIVE', '#ffcf78');
      }

      this.audio.play('pickup');
      this.spawnPickupBurst(pickup.x, pickup.y, pickup.type);
      this.updateHUD();
    }

    spawnBossMinion(type) {
      if (!this.boss) return;
      const point = this.findSpawnPoint();
      const enemy = new Enemy(this, type, point.x, point.y, {});
      this.enemies.push(enemy);
      this.spawnSpawnRing(point.x, point.y, enemy.color, false);
      this.showToast('TITAN DEPLOYING SUPPORT UNIT', true, 1500);
    }

    bossFireFan(boss, count, spread, speed, damage) {
      const muzzle = boss.getMuzzle();
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * spread;
        this.spawnEnemyBullet(
          muzzle.x,
          muzzle.y,
          boss.turretAngle + offset,
          speed,
          damage,
          '#ff8aa2'
        );
      }
      this.spawnMuzzleFlash(muzzle.x, muzzle.y, boss.turretAngle, '#ffd0dc');
      this.audio.play('heavyShot');
      this.triggerShake(1.6, 0.12);
    }

    spawnBossMissiles(count) {
      const player = this.player;
      const boss = this.boss;
      if (!player || !boss) return;
      for (let i = 0; i < count; i += 1) {
        const targetX = clamp(
          player.x + player.vx * rand(0.25, 0.8) + rand(-130, 130),
          ARENA_INSET + 55,
          W - ARENA_INSET - 55
        );
        const targetY = clamp(
          player.y + player.vy * rand(0.25, 0.8) + rand(-110, 110),
          ARENA_INSET + 55,
          H - ARENA_INSET - 55
        );
        this.spawnDangerZone({
          x: targetX,
          y: targetY,
          radius: rand(78, 106),
          duration: rand(1.15, 1.55),
          damage: 22,
          color: '#ff927a',
        });
        for (let spark = 0; spark < 7; spark += 1) {
          const t = rand(0.2, 0.9);
          this.addParticle({
            type: 'smoke',
            x: lerp(boss.x, targetX, t) + rand(-12, 12),
            y: lerp(boss.y, targetY, t) + rand(-12, 12),
            vx: rand(-14, 14),
            vy: rand(-14, 14),
            life: rand(0.3, 0.65),
            size: rand(3, 7),
            color: 'rgba(255, 145, 130, 0.32)',
            drag: 1.4,
          });
        }
      }
      this.audio.play('missile');
      this.showToast('MISSILE LOCK // MOVE', true, 1350);
    }

    /* =======================================================
       Particle and effect spawners
       ======================================================= */

    addParticle(options) {
      if (this.particles.length >= 850) return;
      this.particles.push(new Particle(this, options));
    }

    spawnMuzzleFlash(x, y, angle, color) {
      this.addParticle({
        type: 'flash',
        x,
        y,
        size: rand(15, 23),
        life: 0.09,
        color: color || '#ffe4b2',
        drag: 0,
      });
      for (let i = 0; i < 5; i += 1) {
        const a = angle + rand(-0.32, 0.32);
        const speed = rand(100, 300);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: rand(0.08, 0.2),
          size: rand(1, 2.4),
          color: color || '#ffe4b2',
          drag: 2.4,
        });
      }
    }

    spawnHitSpark(x, y, color) {
      this.addParticle({
        type: 'flash',
        x,
        y,
        size: rand(7, 13),
        life: 0.07,
        color: color || '#ffe0b2',
        drag: 0,
      });
      for (let i = 0; i < 4; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(70, 220);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.12, 0.32),
          size: rand(0.8, 2.2),
          color: color || '#ffcf9d',
          drag: 2,
        });
      }
    }

    spawnShieldSpark(x, y) {
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 4,
        maxSize: rand(20, 30),
        life: 0.24,
        color: '#9ef7ff',
        drag: 0,
      });
      this.addParticle({
        type: 'flash',
        x,
        y,
        size: rand(10, 17),
        life: 0.09,
        color: '#d7fdff',
        drag: 0,
      });
      for (let i = 0; i < 6; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(90, 250);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.15, 0.4),
          size: rand(0.9, 2),
          color: pick(['#a8f8ff', '#5be4ff', '#e6ffff']),
          drag: 2.3,
        });
      }
    }

    spawnBeamSpark(x, y) {
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 3,
        maxSize: rand(18, 36),
        life: 0.3,
        color: '#ffb0c0',
        drag: 0,
      });
      for (let i = 0; i < 3; i += 1) {
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: rand(-130, 130),
          vy: rand(-160, 40),
          life: rand(0.18, 0.42),
          size: rand(1, 2.6),
          color: pick(['#ffcf9d', '#ff7e93', '#fff0d0']),
          drag: 1.7,
        });
      }
    }

    spawnBulletImpact(x, y, color) {
      this.addParticle({
        type: 'flash',
        x,
        y,
        size: rand(5, 10),
        life: 0.06,
        color: color || '#ffe0b2',
        drag: 0,
      });
      for (let i = 0; i < 4; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(50, 170);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.1, 0.28),
          size: rand(0.7, 1.9),
          color: color || '#ffcf9d',
          drag: 2.2,
        });
      }
    }

    spawnExplosion(x, y, scale = 1, color) {
      const palette = this.level ? this.level.palette : LEVELS[0].palette;
      const tint = color || palette.accent;
      const size = clamp(scale, 0.4, 4.5);

      this.addParticle({
        type: 'flash',
        x,
        y,
        size: 34 * size,
        life: 0.15 + size * 0.035,
        color: '#fff3d6',
        drag: 0,
      });
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 8 * size,
        maxSize: (56 + 28 * size) * 1.15,
        life: 0.32 + size * 0.08,
        color: tint,
        drag: 0,
      });
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 3 * size,
        maxSize: 90 * size,
        life: 0.42 + size * 0.09,
        color: 'rgba(255, 235, 210, 0.7)',
        drag: 0,
      });

      const sparks = Math.floor(10 + size * 9);
      for (let i = 0; i < sparks; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(70, 310) * (0.65 + size * 0.28);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.2, 0.7) * (0.8 + size * 0.12),
          size: rand(1, 3.4) * (0.8 + size * 0.1),
          color: pick([tint, '#ffd9a2', '#fff1d0', palette.particle]),
          drag: rand(1.2, 2.2),
        });
      }

      const smoke = Math.floor(4 + size * 3);
      for (let i = 0; i < smoke; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(16, 80) * size;
        this.addParticle({
          type: 'smoke',
          x: x + rand(-8, 8) * size,
          y: y + rand(-8, 8) * size,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - rand(8, 28),
          life: rand(0.55, 1.2) * (0.8 + size * 0.08),
          size: rand(6, 15) * size,
          color: 'rgba(76, 69, 64, 0.34)',
          drag: 0.8,
        });
      }
    }

    spawnDust(x, y, angle, strength = 1) {
      const palette = this.level ? this.level.palette : LEVELS[0].palette;
      const back = angle + Math.PI + rand(-0.45, 0.45);
      const speed = rand(15, 55) * strength;
      this.addParticle({
        type: 'dust',
        x,
        y,
        vx: Math.cos(back) * speed,
        vy: Math.sin(back) * speed,
        life: rand(0.25, 0.55),
        size: rand(2, 5) * strength,
        color: rgba(palette.particle, 0.24),
        drag: 1.7,
      });
    }

    spawnDashTrail(player) {
      if (this.afterimages.length > 24) this.afterimages.shift();
      this.afterimages.push({
        x: player.x,
        y: player.y,
        hullAngle: player.hullAngle,
        turretAngle: player.turretAngle,
        life: 0.23,
        maxLife: 0.23,
      });
      this.addParticle({
        type: 'spark',
        x: player.x + rand(-8, 8),
        y: player.y + rand(-8, 8),
        vx: -player.dashDirX * rand(50, 150),
        vy: -player.dashDirY * rand(50, 150),
        life: rand(0.12, 0.26),
        size: rand(1, 2.4),
        color: '#8ef6ff',
        drag: 2.2,
      });
    }

    spawnDashBurst(x, y, angle) {
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 6,
        maxSize: 62,
        life: 0.34,
        color: '#80f2ff',
        drag: 0,
      });
      for (let i = 0; i < 12; i += 1) {
        const a = angle + Math.PI + rand(-0.65, 0.65);
        const speed = rand(90, 280);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: rand(0.16, 0.4),
          size: rand(0.8, 2.3),
          color: pick(['#91f7ff', '#d8feff', '#53d7ec']),
          drag: 2,
        });
      }
    }

    spawnSpawnRing(x, y, color, elite) {
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 4,
        maxSize: elite ? 100 : 55,
        life: elite ? 0.65 : 0.46,
        color: color || '#ff8a72',
        drag: 0,
      });
      this.addParticle({
        type: 'flash',
        x,
        y,
        size: elite ? 44 : 24,
        life: 0.16,
        color: color || '#ff8a72',
        drag: 0,
      });
      for (let i = 0; i < (elite ? 16 : 8); i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(30, 130);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.2, 0.5),
          size: rand(0.8, 2),
          color: color || '#ff8a72',
          drag: 1.6,
        });
      }
    }

    spawnBossSmoke(boss) {
      const angle = rand(0, TAU);
      const radius = rand(25, boss.radius * 0.8);
      this.addParticle({
        type: 'smoke',
        x: boss.x + Math.cos(angle) * radius,
        y: boss.y + Math.sin(angle) * radius * 0.6,
        vx: rand(-12, 12),
        vy: rand(-30, -10),
        life: rand(0.6, 1.25),
        size: rand(5, 13),
        color: 'rgba(86, 65, 91, 0.3)',
        drag: 0.8,
      });
    }

    spawnPickupBurst(x, y, type) {
      const color = type === 'hull' ? '#ffc16d' : type === 'shield' ? '#8ef7ff' : '#ffce78';
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 4,
        maxSize: 48,
        life: 0.36,
        color,
        drag: 0,
      });
      for (let i = 0; i < 8; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(50, 160);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.18, 0.45),
          size: rand(0.8, 2.2),
          color,
          drag: 1.9,
        });
      }
    }

    spawnPlayerHitBurst(x, y, hadShield) {
      const color = hadShield ? '#8ef7ff' : '#ff9a68';
      this.addParticle({
        type: 'ring',
        x,
        y,
        size: 8,
        maxSize: hadShield ? 58 : 42,
        life: 0.34,
        color,
        drag: 0,
      });
      for (let i = 0; i < 10; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(70, 240);
        this.addParticle({
          type: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.15, 0.4),
          size: rand(0.8, 2.1),
          color,
          drag: 2,
        });
      }
    }

    spawnFloatingText(x, y, text, color) {
      if (this.floatingTexts.length > 34) this.floatingTexts.shift();
      this.floatingTexts.push({
        x,
        y,
        text,
        color: color || '#ffe0aa',
        life: 0.95,
        maxLife: 0.95,
        vy: -38,
        size: 12,
      });
    }

    /* =======================================================
       Ambient atmosphere
       ======================================================= */

    createAmbientParticle(kind, prefill = false) {
      const palette = this.level ? this.level.palette : LEVELS[0].palette;
      if (kind === 'snow') {
        return {
          x: rand(0, W),
          y: prefill ? rand(0, H) : -12,
          vx: rand(-8, 8),
          vy: rand(24, 58),
          size: rand(0.8, 2.3),
          alpha: rand(0.25, 0.72),
          phase: rand(0, TAU),
          color: '#dff9ff',
          kind,
        };
      }
      if (kind === 'ember') {
        return {
          x: rand(0, W),
          y: prefill ? rand(0, H) : H + 12,
          vx: rand(-11, 11),
          vy: rand(-50, -18),
          size: rand(0.8, 2.5),
          alpha: rand(0.25, 0.7),
          phase: rand(0, TAU),
          color: pick(['#ffb45f', '#ff7d4d', '#ffd9a0']),
          kind,
        };
      }
      if (kind === 'void') {
        return {
          x: rand(0, W),
          y: prefill ? rand(0, H) : rand(0, H),
          vx: rand(-6, 6),
          vy: rand(-8, 8),
          size: rand(0.7, 2.1),
          alpha: rand(0.16, 0.5),
          phase: rand(0, TAU),
          color: pick(['#d9b8ff', '#b681ff', '#ff8eaf']),
          kind,
        };
      }
      return {
        x: rand(0, W),
        y: prefill ? rand(0, H) : rand(0, H),
        vx: rand(12, 48),
        vy: rand(-8, 8),
        size: rand(0.6, 2),
        alpha: rand(0.12, 0.42),
        phase: rand(0, TAU),
        color: palette.particle,
        kind: 'dust',
      };
    }

    resetAmbient() {
      this.ambient = [];
      const kind = this.level ? this.level.ambient : 'sand';
      for (let i = 0; i < 74; i += 1) {
        this.ambient.push(this.createAmbientParticle(kind, true));
      }
      this.ambientSpawnTimer = 0;
    }

    updateAmbient(dt) {
      if (!this.level) return;
      const kind = this.level.ambient;
      this.ambientSpawnTimer -= dt;
      const maxAmbient = kind === 'snow' ? 170 : 135;
      if (this.ambient.length < maxAmbient && this.ambientSpawnTimer <= 0) {
        this.ambientSpawnTimer = kind === 'snow' ? 0.035 : 0.07;
        this.ambient.push(this.createAmbientParticle(kind, false));
      }

      for (const mote of this.ambient) {
        mote.phase += dt * (kind === 'ember' ? 2.2 : 1.1);
        mote.x += mote.vx * dt + (kind === 'snow' ? Math.sin(mote.phase) * 7 * dt : 0);
        mote.y += mote.vy * dt;

        if (kind === 'ember') {
          if (mote.y < -14) {
            mote.y = H + 14;
            mote.x = rand(0, W);
          }
        } else if (kind === 'snow') {
          if (mote.y > H + 14) {
            mote.y = -14;
            mote.x = rand(0, W);
          }
        } else if (kind === 'void') {
          if (mote.x < -14) mote.x = W + 14;
          if (mote.x > W + 14) mote.x = -14;
          if (mote.y < -14) mote.y = H + 14;
          if (mote.y > H + 14) mote.y = -14;
        } else {
          if (mote.x > W + 14) {
            mote.x = -14;
            mote.y = rand(0, H);
          }
        }
      }
    }

    /* =======================================================
       Rendering
       ======================================================= */

    addTrackMark(x, y, angle, dashed = false) {
      if (this.trackMarks.length > 190) this.trackMarks.shift();
      this.trackMarks.push({
        x,
        y,
        angle,
        dashed,
        life: dashed ? 4.5 : 9,
        maxLife: dashed ? 4.5 : 9,
      });
    }

    render() {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#020507';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      if (this.shake.time > 0 && this.shake.duration > 0) {
        const factor = clamp(this.shake.time / this.shake.duration, 0, 1);
        const amount = this.shake.intensity * factor;
        ctx.translate(rand(-amount, amount), rand(-amount, amount));
      }

      if (this.background) ctx.drawImage(this.background, 0, 0, W, H);
      this.drawIce(ctx);
      this.drawTrackMarks(ctx);
      this.drawVents(ctx);
      this.drawDangerZones(ctx);
      this.drawShockwaves(ctx);
      this.drawPickups(ctx);
      this.drawEnemies(ctx);
      this.drawBoss(ctx);
      this.drawShieldNodes(ctx);
      this.drawPlayer(ctx);
      this.drawBullets(ctx);
      this.drawBossBeam(ctx);
      this.drawParticles(ctx);
      this.drawFloatingTexts(ctx);
      this.drawAmbient(ctx);

      ctx.restore();
    }

    drawIce(ctx) {
      if (!this.level || !this.level.icePatches) return;
      const palette = this.level.palette;
      for (const patch of this.level.icePatches) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(patch.x, patch.y, patch.rx, patch.ry, -0.08, 0, TAU);
        const gradient = ctx.createRadialGradient(
          patch.x - patch.rx * 0.22,
          patch.y - patch.ry * 0.28,
          8,
          patch.x,
          patch.y,
          Math.max(patch.rx, patch.ry)
        );
        gradient.addColorStop(0, rgba(palette.accent, 0.17));
        gradient.addColorStop(0.48, rgba(palette.accent, 0.075));
        gradient.addColorStop(1, rgba(palette.accent, 0.012));
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = rgba(palette.accent, 0.18);
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = rgba('#dffbff', 0.1);
        ctx.lineWidth = 1;
        for (let i = 0; i < 9; i += 1) {
          const angle = (i / 9) * TAU + 0.7;
          const inner = 0.16 + (i % 3) * 0.16;
          const outer = 0.48 + (i % 4) * 0.11;
          ctx.beginPath();
          ctx.moveTo(
            patch.x + Math.cos(angle) * patch.rx * inner,
            patch.y + Math.sin(angle) * patch.ry * inner
          );
          ctx.lineTo(
            patch.x + Math.cos(angle + 0.2) * patch.rx * outer,
            patch.y + Math.sin(angle + 0.2) * patch.ry * outer
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawTrackMarks(ctx) {
      if (!this.trackMarks.length) return;
      for (const mark of this.trackMarks) {
        const alpha = clamp(mark.life / mark.maxLife, 0, 1) * 0.3;
        ctx.save();
        ctx.translate(mark.x, mark.y);
        ctx.rotate(mark.angle);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        if (mark.dashed) {
          ctx.fillRect(-14, -17, 28, 4);
          ctx.fillRect(-14, 13, 28, 4);
        } else {
          ctx.fillRect(-18, -17, 36, 3.4);
          ctx.fillRect(-18, 13.6, 36, 3.4);
        }
        ctx.restore();
      }
    }

    drawVents(ctx) {
      if (!this.level || !this.level.lavaVents) return;
      const palette = this.level.palette;
      for (const vent of this.level.lavaVents) {
        const state = this.getVentState(vent);
        ctx.save();
        ctx.translate(vent.x, vent.y);

        ctx.beginPath();
        ctx.arc(0, 0, vent.r + 8, 0, TAU);
        ctx.fillStyle = 'rgba(9, 5, 5, 0.42)';
        ctx.fill();
        ctx.strokeStyle = rgba(palette.border, 0.6);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, vent.r, 0, TAU);
        ctx.fillStyle = 'rgba(17, 8, 6, 0.8)';
        ctx.fill();
        ctx.strokeStyle = rgba(palette.steelLight, 0.48);
        ctx.lineWidth = 1;
        ctx.stroke();

        const pulse = 0.5 + Math.sin(this.run.time * 4 + vent.offset) * 0.5;
        if (state.warning) {
          ctx.beginPath();
          ctx.arc(0, 0, vent.r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * state.charge);
          ctx.strokeStyle = rgba('#ff7a4c', 0.5 + pulse * 0.35);
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, vent.r - 6, 0, TAU);
          ctx.strokeStyle = rgba('#ffb45f', 0.12 + pulse * 0.12);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (state.active) {
          ctx.globalCompositeOperation = 'lighter';
          const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, vent.r * 1.35);
          glow.addColorStop(0, 'rgba(255, 234, 190, 0.78)');
          glow.addColorStop(0.22, 'rgba(255, 151, 77, 0.5)');
          glow.addColorStop(0.65, 'rgba(255, 74, 38, 0.16)');
          glow.addColorStop(1, 'rgba(255, 74, 38, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(0, 0, vent.r * 1.35, 0, TAU);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, vent.r * 0.54, 0, TAU);
          ctx.fillStyle = 'rgba(255, 226, 174, 0.82)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, vent.r * 0.72 + Math.sin(this.run.time * 8) * 4, 0, TAU);
          ctx.strokeStyle = 'rgba(255, 245, 218, 0.45)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(0, 0, vent.r + 13, 0.15, Math.PI - 0.15);
        ctx.arc(0, 0, vent.r + 13, Math.PI + 0.15, TAU - 0.15);
        ctx.strokeStyle = rgba(palette.accent2, 0.16);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    drawDangerZones(ctx) {
      for (const zone of this.dangerZones) {
        const progress = clamp(zone.elapsed / zone.duration, 0, 1);
        const pulse = 0.55 + Math.sin(zone.age * 12) * 0.45;
        ctx.save();
        ctx.translate(zone.x, zone.y);

        const gradient = ctx.createRadialGradient(0, 0, 3, 0, 0, zone.radius);
        gradient.addColorStop(0, rgba(zone.color, 0.16 + progress * 0.15));
        gradient.addColorStop(0.72, rgba(zone.color, 0.06 + progress * 0.09));
        gradient.addColorStop(1, rgba(zone.color, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, zone.radius, 0, TAU);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, zone.radius, 0, TAU);
        ctx.strokeStyle = rgba(zone.color, 0.4 + pulse * 0.35);
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, zone.radius * (1 - progress * 0.74), 0, TAU);
        ctx.strokeStyle = rgba(zone.color, 0.35 + progress * 0.45);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = rgba(zone.color, 0.24 + progress * 0.25);
        ctx.lineWidth = 1;
        const tick = zone.radius * 0.55;
        for (let i = 0; i < 4; i += 1) {
          const angle = (i / 4) * TAU + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * tick, Math.sin(angle) * tick);
          ctx.lineTo(Math.cos(angle) * (tick + 13), Math.sin(angle) * (tick + 13));
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawShockwaves(ctx) {
      for (const wave of this.shockwaves) {
        const fade = clamp(1 - wave.radius / wave.maxRadius, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(wave.color, fade * 0.7);
        ctx.lineWidth = 4 + fade * 6;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffe4d2', fade * 0.4);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, Math.max(1, wave.radius - 9), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawPickups(ctx) {
      for (const pickup of this.pickups) {
        const bob = Math.sin(pickup.age * 2.4) * 4;
        const color =
          pickup.type === 'hull'
            ? '#ffc16d'
            : pickup.type === 'shield'
              ? '#8ef7ff'
              : '#ffce78';
        const blink = pickup.life < 5 && Math.floor(pickup.life * 7) % 2 === 0;
        ctx.save();
        ctx.globalAlpha = blink ? 0.4 : 1;
        ctx.translate(pickup.x, pickup.y + bob);

        ctx.beginPath();
        ctx.ellipse(0, 15, 16, 5, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
        glow.addColorStop(0, rgba(color, 0.24));
        glow.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, TAU);
        ctx.fill();

        ctx.save();
        ctx.rotate(pickup.age * 0.7);
        ctx.strokeStyle = rgba(color, 0.55);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * TAU;
          const x = Math.cos(angle) * 17;
          const y = Math.sin(angle) * 17;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.fillStyle = rgba(color, 0.12);
        ctx.fill();
        ctx.strokeStyle = rgba(color, 0.7);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        if (pickup.type === 'hull') {
          ctx.fillRect(-2, -7, 4, 14);
          ctx.fillRect(-7, -2, 14, 4);
        } else if (pickup.type === 'shield') {
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(7, -4);
          ctx.lineTo(6, 4);
          ctx.lineTo(0, 8);
          ctx.lineTo(-6, 4);
          ctx.lineTo(-7, -4);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(2, -9);
          ctx.lineTo(-5, 1);
          ctx.lineTo(0, 1);
          ctx.lineTo(-2, 9);
          ctx.lineTo(6, -2);
          ctx.lineTo(1, -2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawEnemies(ctx) {
      const palette = this.level ? this.level.palette : LEVELS[0].palette;
      for (const enemy of this.enemies) {
        if (enemy.spawnTimer > 0) {
          const t = 1 - enemy.spawnTimer / 0.62;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgba(enemy.color, 0.6 * (1 - t * 0.4));
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, 18 + t * (enemy.elite ? 62 : 35), 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, 10 + t * 15, 0, TAU);
          ctx.strokeStyle = rgba('#fff0dc', 0.42);
          ctx.stroke();
          ctx.restore();
          continue;
        }

        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.beginPath();
        ctx.ellipse(2, enemy.radius * 0.54, enemy.radius * 0.9, enemy.radius * 0.34, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
        ctx.fill();
        ctx.restore();

        const p = {
          steel: palette.steel,
          steelLight: palette.steelLight,
          accent: enemy.color,
          accent2: enemy.accent,
        };

        if (enemy.drawType === 'scout') this.drawScout(ctx, enemy, p);
        else if (enemy.drawType === 'turret') this.drawTurret(ctx, enemy, p);
        else if (enemy.drawType === 'drone') this.drawDrone(ctx, enemy, p);
        else if (enemy.drawType === 'artillery') this.drawArtillery(ctx, enemy, p);
        else this.drawHeavy(ctx, enemy, p);

        if (enemy.elite) {
          ctx.save();
          ctx.translate(enemy.x, enemy.y);
          ctx.strokeStyle = 'rgba(255, 212, 126, 0.5)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([5, 6]);
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 11, enemy.age * 0.5, enemy.age * 0.5 + TAU);
          ctx.stroke();
          ctx.restore();
        }

        if (enemy.hitFlash > 0) {
          ctx.save();
          ctx.globalAlpha = enemy.hitFlash * 0.45;
          ctx.fillStyle = '#fff5e8';
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, enemy.radius * 0.92, 0, TAU);
          ctx.fill();
          ctx.restore();
        }

        if (enemy.hp < enemy.maxHp || enemy.elite) {
          const width = enemy.elite ? 94 : Math.max(38, enemy.radius * 2.2);
          const y = enemy.y - enemy.radius - (enemy.elite ? 23 : 15);
          const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
          ctx.fillStyle = 'rgba(4, 8, 10, 0.76)';
          ctx.fillRect(enemy.x - width / 2, y, width, 4);
          ctx.fillStyle = enemy.elite ? '#ffd17a' : '#ff8066';
          ctx.fillRect(enemy.x - width / 2, y, width * ratio, 4);
          ctx.strokeStyle = 'rgba(255, 235, 220, 0.16)';
          ctx.lineWidth = 1;
          ctx.strokeRect(enemy.x - width / 2 + 0.5, y + 0.5, width - 1, 3);
          if (enemy.elite) {
            ctx.fillStyle = '#ffd89b';
            ctx.font = '600 10px "Cascadia Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(enemy.name, enemy.x, y - 7);
          }
        }
      }
    }

    drawScout(ctx, enemy, p) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.angle);

      ctx.fillStyle = '#0b0b0b';
      for (const side of [-1, 1]) {
        roundRectPath(ctx, -23, side * 17 - 4, 42, 8, 3);
        ctx.fill();
        ctx.strokeStyle = rgba(p.steelLight, 0.8);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = rgba(p.accent, 0.45);
        ctx.fillRect(-16, side * 17 - 1, 23, 2);
      }

      polygonPath(ctx, [
        [-25, -13],
        [12, -16],
        [27, -7],
        [29, 7],
        [12, 16],
        [-25, 13],
        [-31, 5],
        [-31, -5],
      ]);
      ctx.fillStyle = p.steel;
      ctx.fill();
      ctx.strokeStyle = p.steelLight;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-17, -9);
      ctx.lineTo(13, -8);
      ctx.lineTo(20, 0);
      ctx.lineTo(13, 8);
      ctx.lineTo(-17, 9);
      ctx.closePath();
      ctx.fillStyle = rgba(p.accent, 0.12);
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent, 0.5);
      ctx.stroke();

      ctx.fillStyle = rgba(p.accent2, 0.75);
      ctx.fillRect(-23, -4, 6, 8);
      ctx.restore();

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.turretAngle);
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fillStyle = rgba(p.accent, 0.3);
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      roundRectPath(ctx, 6, -3, 22, 6, 2);
      ctx.fillStyle = p.steelLight;
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent2, 0.7);
      ctx.stroke();
      ctx.restore();
    }

    drawTurret(ctx, enemy, p) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);

      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * TAU + Math.PI / 4;
        ctx.strokeStyle = rgba(p.steelLight, 0.7);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 13, Math.sin(angle) * 13);
        ctx.lineTo(Math.cos(angle) * 25, Math.sin(angle) * 25);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 25, Math.sin(angle) * 25, 3, 0, TAU);
        ctx.fillStyle = p.steel;
        ctx.fill();
        ctx.stroke();
      }

      polygonPath(ctx, [
        [-18, -14],
        [18, -14],
        [23, -6],
        [23, 6],
        [18, 14],
        [-18, 14],
        [-23, 6],
        [-23, -6],
      ]);
      ctx.fillStyle = p.steel;
      ctx.fill();
      ctx.strokeStyle = p.steelLight;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.strokeStyle = rgba(p.accent, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.turretAngle);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fillStyle = rgba(p.accent, 0.18);
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      roundRectPath(ctx, 7, -4, 30, 8, 3);
      ctx.fillStyle = p.steelLight;
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent2, 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, TAU);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.restore();
    }

    drawDrone(ctx, enemy, p) {
      const bob = Math.sin(enemy.age * 3.4 + enemy.hoverPhase) * 4;
      ctx.save();
      ctx.translate(enemy.x, enemy.y + bob);

      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 27);
      glow.addColorStop(0, rgba(p.accent, 0.22));
      glow.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.rotate(enemy.age * 0.7);
      ctx.strokeStyle = rgba(p.steelLight, 0.9);
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
        ctx.lineTo(Math.cos(angle) * 23, Math.sin(angle) * 23);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 24, Math.sin(angle) * 24, 4.5, 0, TAU);
        ctx.fillStyle = rgba(p.accent, 0.14);
        ctx.fill();
        ctx.strokeStyle = rgba(p.accent, 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      polygonPath(ctx, [
        [0, -17],
        [15, -8],
        [18, 4],
        [8, 15],
        [-8, 15],
        [-18, 4],
        [-15, -8],
      ]);
      ctx.fillStyle = p.steel;
      ctx.fill();
      ctx.strokeStyle = p.steelLight;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fillStyle = rgba(p.accent, 0.34);
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.save();
      ctx.rotate(enemy.turretAngle);
      roundRectPath(ctx, 5, -2, 17, 4, 2);
      ctx.fillStyle = p.accent2;
      ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    drawArtillery(ctx, enemy, p) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.angle);

      ctx.fillStyle = '#0a0908';
      for (const side of [-1, 1]) {
        roundRectPath(ctx, -27, side * 21 - 6, 54, 12, 4);
        ctx.fill();
        ctx.strokeStyle = rgba(p.steelLight, 0.75);
        ctx.lineWidth = 1;
        ctx.stroke();
        for (let i = 0; i < 4; i += 1) {
          ctx.fillStyle = rgba(p.steelLight, 0.36);
          ctx.fillRect(-20 + i * 11, side * 21 - 2, 6, 2);
        }
      }

      polygonPath(ctx, [
        [-31, -19],
        [24, -20],
        [34, -10],
        [34, 10],
        [24, 20],
        [-31, 19],
        [-37, 8],
        [-37, -8],
      ]);
      ctx.fillStyle = p.steel;
      ctx.fill();
      ctx.strokeStyle = p.steelLight;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.fillStyle = rgba(p.accent, 0.15);
      ctx.fillRect(-20, -12, 37, 24);
      ctx.strokeStyle = rgba(p.accent, 0.32);
      ctx.strokeRect(-20, -12, 37, 24);

      ctx.fillStyle = rgba(p.accent2, 0.7 + Math.sin(enemy.age * 5) * 0.25);
      ctx.beginPath();
      ctx.arc(23, -12, 3, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.turretAngle);
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fillStyle = p.steelLight;
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      roundRectPath(ctx, 4, -6, 38, 12, 5);
      ctx.fillStyle = p.steel;
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent2, 0.8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(4, 6, 7, 0.85)';
      ctx.beginPath();
      ctx.arc(42, 0, 5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent, 0.7);
      ctx.stroke();
      ctx.restore();
    }

    drawHeavy(ctx, enemy, p) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.angle);

      for (const side of [-1, 1]) {
        roundRectPath(ctx, -31, side * 25 - 8, 62, 16, 5);
        ctx.fillStyle = '#090808';
        ctx.fill();
        ctx.strokeStyle = rgba(p.steelLight, 0.9);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        for (let i = 0; i < 5; i += 1) {
          ctx.fillStyle = rgba(p.steelLight, 0.4);
          ctx.fillRect(-23 + i * 12, side * 25 - 4, 7, 3);
        }
      }

      polygonPath(ctx, [
        [-39, -21],
        [18, -25],
        [38, -15],
        [42, 0],
        [38, 15],
        [18, 25],
        [-39, 21],
        [-46, 9],
        [-46, -9],
      ]);
      ctx.fillStyle = p.steel;
      ctx.fill();
      ctx.strokeStyle = p.steelLight;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      polygonPath(ctx, [
        [-30, -13],
        [15, -15],
        [29, -7],
        [31, 7],
        [15, 15],
        [-30, 13],
        [-35, 0],
      ]);
      ctx.fillStyle = rgba(p.accent, 0.1);
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent, 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = rgba(p.accent2, 0.7);
      ctx.fillRect(-34, -3, 8, 6);
      ctx.restore();

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.turretAngle);
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, TAU);
      ctx.fillStyle = p.steelLight;
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.7;
      ctx.stroke();
      for (const side of [-1, 1]) {
        roundRectPath(ctx, 7, side * 5 - 3, 38, 6, 2);
        ctx.fillStyle = p.steel;
        ctx.fill();
        ctx.strokeStyle = rgba(p.accent2, 0.8);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.restore();
    }

    drawShieldNodes(ctx) {
      const boss = this.boss;
      if (!this.shieldNodes.length) return;
      for (const node of this.shieldNodes) {
        if (node.dead) continue;
        if (boss) {
          ctx.save();
          ctx.strokeStyle = rgba('#8ef7ff', 0.1);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 9]);
          ctx.beginPath();
          ctx.moveTo(boss.x, boss.y);
          ctx.lineTo(node.x, node.y);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 38);
        glow.addColorStop(0, 'rgba(190, 251, 255, 0.42)');
        glow.addColorStop(1, 'rgba(80, 224, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.save();
        ctx.rotate(node.angle);
        ctx.strokeStyle = 'rgba(155, 249, 255, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * TAU;
          const x = Math.cos(angle) * 27;
          const y = Math.sin(angle) * 27;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, TAU);
        ctx.fillStyle = 'rgba(72, 220, 255, 0.16)';
        ctx.fill();
        ctx.strokeStyle = '#9af7ff';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, TAU);
        ctx.fillStyle = node.hitFlash > 0 ? '#ffffff' : '#aefbff';
        ctx.fill();

        const ratio = clamp(node.hp / node.maxHp, 0, 1);
        ctx.beginPath();
        ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
        ctx.strokeStyle = 'rgba(174, 251, 255, 0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }

    drawBoss(ctx) {
      const boss = this.boss;
      if (!boss) return;
      const palette = this.level ? this.level.palette : LEVELS[3].palette;
      const flicker =
        boss.dead && this.state === 'bossDeath'
          ? 0.35 + Math.abs(Math.sin(this.bossDeathTimer * 24)) * 0.65
          : 1;

      ctx.save();
      ctx.globalAlpha = flicker;
      ctx.translate(boss.x, boss.y);

      ctx.beginPath();
      ctx.ellipse(0, 72, 136, 34, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fill();

      ctx.save();
      ctx.rotate(boss.time * 0.13);
      ctx.strokeStyle = 'rgba(198, 152, 255, 0.16)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([18, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, 164, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 164, Math.sin(angle) * 164, 5, 0, TAU);
        ctx.fillStyle = rgba(palette.accent2, 0.35);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.rotate(-boss.time * 0.21);
      ctx.strokeStyle = 'rgba(255, 115, 142, 0.24)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, 128, (i / 4) * TAU + 0.25, (i / 4) * TAU + 1.05);
        ctx.stroke();
      }
      ctx.restore();

      polygonPath(ctx, [
        [-110, -34],
        [-76, -70],
        [76, -70],
        [110, -34],
        [122, 18],
        [82, 62],
        [30, 78],
        [-30, 78],
        [-82, 62],
        [-122, 18],
      ]);
      ctx.fillStyle = '#171122';
      ctx.fill();
      ctx.strokeStyle = palette.steelLight;
      ctx.lineWidth = 2;
      ctx.stroke();

      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 77, 8);
        ctx.beginPath();
        ctx.moveTo(-23, -42);
        ctx.lineTo(23, -34);
        ctx.lineTo(29, 30);
        ctx.lineTo(0, 46);
        ctx.lineTo(-29, 30);
        ctx.closePath();
        ctx.fillStyle = '#21182f';
        ctx.fill();
        ctx.strokeStyle = rgba(palette.accent, 0.32);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = rgba(palette.accent2, 0.7 + Math.sin(boss.time * 4 + side) * 0.2);
        ctx.beginPath();
        ctx.arc(0, -18, 4.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.rotate(boss.turretAngle);
      roundRectPath(ctx, 42, -13, 105, 26, 7);
      ctx.fillStyle = '#21192e';
      ctx.fill();
      ctx.strokeStyle = rgba(palette.accent, 0.55);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#0d0914';
      ctx.fillRect(120, -8, 30, 16);
      ctx.strokeStyle = rgba(palette.accent2, 0.8);
      ctx.strokeRect(120, -8, 30, 16);
      ctx.fillStyle = rgba(palette.accent2, 0.8);
      ctx.fillRect(142, -4, 6, 8);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, TAU);
      ctx.fillStyle = '#0a0711';
      ctx.fill();
      ctx.strokeStyle = rgba(palette.accent, 0.5);
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.rotate(boss.time * 0.9);
      ctx.strokeStyle = rgba(palette.accent, 0.35);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, 63, 0, TAU);
      ctx.stroke();
      ctx.restore();

      const coreColor =
        boss.phase === 3 ? '#ff5b72' : boss.phase === 2 ? '#d59aff' : '#ff9bb1';
      const corePulse = 0.72 + Math.sin(boss.time * 5) * 0.16;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const coreGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 72);
      coreGlow.addColorStop(0, rgba('#fff5f8', corePulse));
      coreGlow.addColorStop(0.18, rgba(coreColor, 0.65));
      coreGlow.addColorStop(0.55, rgba(coreColor, 0.16));
      coreGlow.addColorStop(1, rgba(coreColor, 0));
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(0, 0, 72, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fillStyle = boss.shielded ? '#543264' : coreColor;
      ctx.fill();
      ctx.strokeStyle = '#fff0f5';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fillStyle = '#fff8fb';
      ctx.fill();

      if (boss.phase === 3 && !boss.dead) {
        ctx.strokeStyle = 'rgba(255, 102, 118, 0.48)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 5; i += 1) {
          const angle = i * 1.7 + boss.time * 0.1;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * 30, Math.sin(angle) * 30);
          ctx.lineTo(Math.cos(angle + 0.2) * 72, Math.sin(angle + 0.2) * 72);
          ctx.stroke();
        }
      }

      if (boss.hitFlash > 0) {
        ctx.globalAlpha = boss.hitFlash * 0.25;
        ctx.fillStyle = '#fff4f8';
        ctx.beginPath();
        ctx.arc(0, 0, 78, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      if (boss.shielded) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        ctx.globalCompositeOperation = 'lighter';
        const bubble = ctx.createRadialGradient(0, 0, 90, 0, 0, 224);
        bubble.addColorStop(0, 'rgba(120, 234, 255, 0)');
        bubble.addColorStop(0.78, 'rgba(120, 234, 255, 0.035)');
        bubble.addColorStop(0.94, 'rgba(120, 234, 255, 0.14)');
        bubble.addColorStop(1, 'rgba(120, 234, 255, 0)');
        ctx.fillStyle = bubble;
        ctx.beginPath();
        ctx.arc(0, 0, 224, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = 'rgba(143, 245, 255, 0.46)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, 220, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(143, 245, 255, 0.15)';
        ctx.setLineDash([7, 11]);
        ctx.beginPath();
        ctx.arc(0, 0, 207, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawBossBeam(ctx) {
      const boss = this.boss;
      if (!boss || !boss.beam || boss.dead) return;
      const beam = boss.beam;
      const muzzle = boss.getMuzzle();
      const end = this.getBeamEnd(muzzle.x, muzzle.y, beam.angle, 1600);
      const pulse = 0.72 + Math.sin(boss.time * 24) * 0.28;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (beam.state === 'windup') {
        ctx.strokeStyle = `rgba(255, 172, 190, ${0.18 + pulse * 0.18})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 13]);
        ctx.beginPath();
        ctx.moveTo(muzzle.x, muzzle.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const charge = ctx.createRadialGradient(
          muzzle.x,
          muzzle.y,
          2,
          muzzle.x,
          muzzle.y,
          42 + pulse * 10
        );
        charge.addColorStop(0, 'rgba(255, 245, 250, 0.9)');
        charge.addColorStop(0.3, 'rgba(255, 105, 137, 0.48)');
        charge.addColorStop(1, 'rgba(255, 80, 112, 0)');
        ctx.fillStyle = charge;
        ctx.beginPath();
        ctx.arc(muzzle.x, muzzle.y, 42 + pulse * 10, 0, TAU);
        ctx.fill();
      } else {
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255, 72, 105, ${0.12 + pulse * 0.1})`;
        ctx.lineWidth = 34;
        ctx.beginPath();
        ctx.moveTo(muzzle.x, muzzle.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 110, 136, ${0.34 + pulse * 0.16})`;
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(muzzle.x, muzzle.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 236, 242, ${0.82 + pulse * 0.15})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(muzzle.x, muzzle.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        const impact = ctx.createRadialGradient(end.x, end.y, 1, end.x, end.y, 34);
        impact.addColorStop(0, 'rgba(255, 248, 250, 0.9)');
        impact.addColorStop(0.3, 'rgba(255, 125, 145, 0.45)');
        impact.addColorStop(1, 'rgba(255, 80, 110, 0)');
        ctx.fillStyle = impact;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 34, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawPlayer(ctx) {
      for (const ghost of this.afterimages) {
        const alpha = clamp(ghost.life / ghost.maxLife, 0, 1) * 0.32;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(ghost.x, ghost.y);
        ctx.rotate(ghost.hullAngle);
        polygonPath(ctx, [
          [-28, -16],
          [18, -16],
          [28, -7],
          [28, 7],
          [18, 16],
          [-28, 16],
          [-34, 7],
          [-34, -7],
        ]);
        ctx.strokeStyle = '#83f3ff';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }

      const player = this.player;
      if (!player || player.dead) return;
      const palette = this.level ? this.level.palette : LEVELS[0].palette;

      ctx.save();
      ctx.translate(player.x, player.y);

      ctx.beginPath();
      ctx.ellipse(2, 18, 32, 11, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fill();

      if (player.overdrive > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255, 190, 100, ${0.18 + Math.sin(player.overdrive * 12) * 0.08})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, 38, player.distanceMoved * 0.01, player.distanceMoved * 0.01 + TAU);
        ctx.stroke();
        ctx.restore();
      }

      ctx.rotate(player.hullAngle);
      for (const side of [-1, 1]) {
        roundRectPath(ctx, -31, side * 19 - 6, 62, 12, 4);
        ctx.fillStyle = '#080b0c';
        ctx.fill();
        ctx.strokeStyle = rgba(palette.steelLight, 0.95);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        for (let i = 0; i < 5; i += 1) {
          ctx.fillStyle = rgba(palette.steelLight, 0.44);
          ctx.fillRect(-23 + i * 12, side * 19 - 2, 7, 3);
        }
      }

      polygonPath(ctx, [
        [-32, -17],
        [16, -18],
        [29, -10],
        [34, 0],
        [29, 10],
        [16, 18],
        [-32, 17],
        [-38, 8],
        [-38, -8],
      ]);
      ctx.fillStyle = '#16262b';
      ctx.fill();
      ctx.strokeStyle = '#7ce8f4';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      polygonPath(ctx, [
        [-23, -11],
        [14, -12],
        [24, -5],
        [26, 5],
        [14, 12],
        [-23, 11],
        [-28, 0],
      ]);
      ctx.fillStyle = 'rgba(100, 225, 238, 0.09)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(128, 240, 250, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = palette.accent;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(-25, -4, 7, 8);
      ctx.fillRect(20, -4, 6, 8);
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(188, 250, 255, 0.35)';
      ctx.fillRect(-17, -8, 26, 2);
      ctx.fillRect(-17, 6, 26, 2);

      ctx.restore();

      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.turretAngle);
      const recoil = player.recoil * 7;
      roundRectPath(ctx, 7 - recoil, -4.5, 38, 9, 3);
      ctx.fillStyle = '#1b3035';
      ctx.fill();
      ctx.strokeStyle = 'rgba(139, 243, 252, 0.8)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = '#091014';
      ctx.fillRect(38 - recoil, -3, 10, 6);
      ctx.strokeStyle = 'rgba(255, 187, 101, 0.85)';
      ctx.strokeRect(38 - recoil, -3, 10, 6);

      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fillStyle = '#193036';
      ctx.fill();
      ctx.strokeStyle = '#8ff5ff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fillStyle = rgba(palette.accent, 0.85);
      ctx.fill();

      if (player.muzzleFlash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const flash = ctx.createRadialGradient(48, 0, 1, 48, 0, 24);
        flash.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
        flash.addColorStop(0.35, 'rgba(128, 247, 255, 0.45)');
        flash.addColorStop(1, 'rgba(128, 247, 255, 0)');
        ctx.fillStyle = flash;
        ctx.beginPath();
        ctx.arc(48, 0, 24, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      const shieldRatio = player.maxShield > 0 ? player.shield / player.maxShield : 0;
      if (player.shield > 0.5) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(115, 235, 255, ${0.2 + shieldRatio * 0.35})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 35, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(190, 251, 255, ${0.1 + shieldRatio * 0.18})`;
        ctx.setLineDash([4, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, 39, -player.distanceMoved * 0.02, -player.distanceMoved * 0.02 + TAU);
        ctx.stroke();
        ctx.restore();
      }

      if (player.invuln > 0 && player.dashTimer <= 0) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.strokeStyle = 'rgba(143, 247, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, 32, -player.invuln * 8, -player.invuln * 8 + TAU);
        ctx.stroke();
        ctx.restore();
      }

      if (player.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = player.hitFlash * 0.4;
        ctx.fillStyle = '#fff4e8';
        ctx.beginPath();
        ctx.arc(player.x, player.y, 28, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawBullets(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const bullet of this.bullets) {
        const trailX = bullet.x - bullet.vx * 0.024;
        const trailY = bullet.y - bullet.vy * 0.024;
        ctx.strokeStyle = rgba(bullet.color, 0.24);
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(trailX, trailY);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();

        ctx.fillStyle = bullet.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius * 0.82, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 245, 0.9)';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius * 0.34, 0, TAU);
        ctx.fill();
      }

      for (const bullet of this.enemyBullets) {
        const trailX = bullet.x - bullet.vx * 0.03;
        const trailY = bullet.y - bullet.vy * 0.03;
        ctx.strokeStyle = rgba(bullet.color, 0.2);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(trailX, trailY);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();

        ctx.fillStyle = rgba(bullet.color, 0.28);
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius * 1.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = bullet.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius * 0.9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff4e8';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius * 0.34, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const particle of this.particles) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        if (particle.type === 'smoke' || particle.type === 'dust') {
          ctx.save();
          ctx.globalAlpha = alpha * (particle.type === 'dust' ? 0.72 : 0.62);
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, Math.max(0.2, particle.size), 0, TAU);
          ctx.fill();
          ctx.restore();
          continue;
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (particle.type === 'ring') {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = 1.2 + alpha * 2.4;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, Math.max(0.2, particle.size), 0, TAU);
          ctx.stroke();
        } else if (particle.type === 'flash') {
          const radius = Math.max(1, particle.size * (0.55 + alpha * 0.6));
          const glow = ctx.createRadialGradient(
            particle.x,
            particle.y,
            0,
            particle.x,
            particle.y,
            radius
          );
          glow.addColorStop(0, rgba('#fffaf0', alpha * 0.95));
          glow.addColorStop(0.28, rgba(particle.color, alpha * 0.62));
          glow.addColorStop(1, rgba(particle.color, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, radius, 0, TAU);
          ctx.fill();
        } else {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = Math.max(0.5, particle.size * 0.62);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(
            particle.x - particle.vx * 0.018,
            particle.y - particle.vy * 0.018
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawFloatingTexts(ctx) {
      for (const text of this.floatingTexts) {
        const alpha = clamp(text.life / text.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '600 12px "Cascadia Mono", "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(3, 7, 9, 0.8)';
        ctx.strokeText(text.text, text.x, text.y);
        ctx.fillStyle = text.color;
        ctx.fillText(text.text, text.x, text.y);
        ctx.restore();
      }
    }

    drawAmbient(ctx) {
      if (!this.ambient.length) return;
      ctx.save();
      for (const mote of this.ambient) {
        const isBright = mote.kind === 'ember' || mote.kind === 'void';
        ctx.globalCompositeOperation = isBright ? 'lighter' : 'source-over';
        ctx.globalAlpha = mote.alpha;
        ctx.fillStyle = mote.color;
        if (mote.kind === 'snow') {
          ctx.beginPath();
          ctx.arc(mote.x, mote.y, mote.size, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillRect(mote.x, mote.y, mote.size, mote.size * (mote.kind === 'ember' ? 1.7 : 1));
        }
      }
      ctx.restore();
    }
  }

  const game = new Game();
  IRON.game = game;
})();
