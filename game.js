// === MUSHROOM'S REVENGE ===
// A reverse Mario platformer where you play as a mushroom

// === CONSTANTS ===
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 500;

const GRAVITY = 0.5;
const MAX_FALL = 10;
const PLAYER_SPEED = 3.5;
const PLAYER_JUMP = -13.5;
const STOMP_BOUNCE = -9;
const TICK = 1 / 60;
const DEPTH_3D = 12; // 3D extrusion depth for platforms

// === COLORS ===
const C = {
    sky: '#5c94fc',
    cloud: '#ffffff',
    hillFar: '#4a8c3f',
    hillNear: '#3a7c2f',
    brick: '#2d8c3e',
    brickLine: '#1e6b2b',
    mushroomCap: '#e02020',
    mushroomCapLight: '#ff4444',
    mushroomDot: '#ffffff',
    mushroomStem: '#f0d0a0',
    mushroomEye: '#000000',
    marioHat: '#e02020',
    marioSkin: '#ffb880',
    marioHair: '#6b3a1f',
    marioOveralls: '#3050d0',
    marioShirt: '#e02020',
    marioShoe: '#6b3a1f',
    marioMustache: '#6b3a1f',
    text: '#ffffff',
    textShadow: '#000000',
    hud: '#ffffff',
};

// === INPUT ===
const keys = {};
let jumpWasPressed = false;

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// === TOUCH INPUT ===
const touchKeys = { left: false, right: false, jump: false };

function setupTouchControls() {
    const btnLeft  = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnJump  = document.getElementById('btn-jump');
    if (!btnLeft || !btnRight || !btnJump) return;

    function bindBtn(btn, key) {
        btn.addEventListener('touchstart', e => {
            e.preventDefault();
            touchKeys[key] = true;
            btn.classList.add('pressed');
        }, { passive: false });
        btn.addEventListener('touchend', e => {
            e.preventDefault();
            touchKeys[key] = false;
            btn.classList.remove('pressed');
        }, { passive: false });
        btn.addEventListener('touchcancel', () => {
            touchKeys[key] = false;
            btn.classList.remove('pressed');
        });
    }

    bindBtn(btnLeft,  'left');
    bindBtn(btnRight, 'right');
    bindBtn(btnJump,  'jump');

    // Tap on canvas to interact with menus
    let touchStartX = 0;
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length > 0) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        if (gameState === 'MENU' || gameState === 'GAME_OVER') {
            initAudio();
            keys['Enter'] = true;
            setTimeout(() => { keys['Enter'] = false; }, 120);
        } else if (gameState === 'PAUSED') {
            keys['Escape'] = true;
            setTimeout(() => { keys['Escape'] = false; }, 120);
        } else if (gameState === 'LEVEL_SELECT') {
            const endX = e.changedTouches[0]?.clientX ?? touchStartX;
            const dx = endX - touchStartX;
            if (Math.abs(dx) > 30) {
                const k = dx < 0 ? 'ArrowLeft' : 'ArrowRight';
                keys[k] = true;
                setTimeout(() => { keys[k] = false; }, 120);
            } else {
                keys['Enter'] = true;
                setTimeout(() => { keys['Enter'] = false; }, 120);
            }
        }
    }, { passive: false });
}

window.addEventListener('DOMContentLoaded', setupTouchControls);

function isLeft()   { return keys['ArrowLeft']  || keys['KeyA'] || touchKeys.left; }
function isRight()  { return keys['ArrowRight'] || keys['KeyD'] || touchKeys.right; }
function isJump()   { return keys['ArrowUp'] || keys['KeyW'] || keys['Space'] || touchKeys.jump; }
function isEnter()  { return keys['Enter']; }
function isEscape() { return keys['Escape']; }

// === UTILITY ===
function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawPixelSprite(x, y, pxSize, data) {
    for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
            const color = data[r][c];
            if (color) {
                ctx.fillStyle = color;
                ctx.fillRect(x + c * pxSize, y + r * pxSize, pxSize, pxSize);
            }
        }
    }
}

// === SPRITE DATA ===
const _ = null;
const R = C.mushroomCap;
const L = C.mushroomCapLight;
const D = C.mushroomDot;
const S = C.mushroomStem;
const E = C.mushroomEye;

const MUSHROOM_SPRITE = [
    [_,_,_,_,R,R,R,R,R,R,_,_,_,_],
    [_,_,R,R,R,R,R,R,R,R,R,R,_,_],
    [_,R,R,D,D,R,R,R,R,D,D,R,R,_],
    [R,R,R,D,D,R,R,R,R,D,D,R,R,R],
    [R,R,R,R,R,R,L,L,R,R,R,R,R,R],
    [R,R,R,R,R,R,R,R,R,R,R,R,R,R],
    [_,R,R,R,R,R,R,R,R,R,R,R,R,_],
    [_,_,_,S,S,S,S,S,S,S,S,_,_,_],
    [_,_,_,S,S,E,S,S,E,S,S,_,_,_],
    [_,_,_,S,S,S,S,S,S,S,S,_,_,_],
    [_,_,_,_,S,S,S,S,S,S,_,_,_,_],
    [_,_,_,_,_,S,S,S,S,_,_,_,_,_],
];

const MH = C.marioHat;
const MS = C.marioSkin;
const MR = C.marioHair;
const MO = C.marioOveralls;
const MT = C.marioShirt;
const MB = C.marioShoe;
const MM = C.marioMustache;

const MARIO_SPRITE = [
    [_,_,_,MH,MH,MH,MH,MH,_,_,_,_],
    [_,_,MH,MH,MH,MH,MH,MH,MH,_,_,_],
    [_,_,MH,MH,MH,MH,MH,MH,MH,MH,_,_],
    [_,_,MR,MR,MS,MS,MS,MR,_,_,_,_],
    [_,MR,MS,MR,MS,MS,MS,MR,MS,MS,_,_],
    [_,MR,MS,MR,MR,MS,MS,MR,MS,MS,MS,_],
    [_,_,MS,MS,MS,MS,MS,MM,MM,MM,_,_],
    [_,_,_,MT,MT,MO,MO,MT,_,_,_,_],
    [_,_,MT,MT,MT,MO,MO,MT,MT,MT,_,_],
    [_,MT,MT,MT,MT,MO,MO,MT,MT,MT,MT,_],
    [_,_,_,MO,MO,MO,MO,MO,MO,_,_,_],
    [_,_,MO,MO,MO,_,_,MO,MO,MO,_,_],
    [_,MB,MB,MB,_,_,_,_,MB,MB,MB,_],
];

// === ENTITY CLASSES ===
class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.vx = 0; this.vy = 0;
    }
}

class Platform extends Entity {
    render() {
        const d = DEPTH_3D;

        // 3D front face (bottom side)
        ctx.fillStyle = '#1a5c24';
        ctx.fillRect(this.x, this.y + this.h, this.w, d);

        // 3D right face
        ctx.fillStyle = '#1e6b2b';
        ctx.beginPath();
        ctx.moveTo(this.x + this.w, this.y);
        ctx.lineTo(this.x + this.w + d * 0.5, this.y - d * 0.3);
        ctx.lineTo(this.x + this.w + d * 0.5, this.y + this.h - d * 0.3);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.closePath();
        ctx.fill();

        // 3D top highlight face (slight perspective)
        ctx.fillStyle = '#3aad4e';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + d * 0.5, this.y - d * 0.3);
        ctx.lineTo(this.x + this.w + d * 0.5, this.y - d * 0.3);
        ctx.lineTo(this.x + this.w, this.y);
        ctx.closePath();
        ctx.fill();

        // Main top face
        ctx.fillStyle = C.brick;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Brick pattern on top face
        const bw = 24; const bh = 12;
        for (let row = 0; row < Math.ceil(this.h / bh); row++) {
            const offset = (row % 2 === 0) ? 0 : bw / 2;
            for (let col = -1; col < Math.ceil(this.w / bw) + 1; col++) {
                const bx = this.x + col * bw + offset;
                const by = this.y + row * bh;
                if (bx + bw > this.x && bx < this.x + this.w) {
                    ctx.strokeStyle = C.brickLine;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(
                        Math.max(bx, this.x),
                        Math.max(by, this.y),
                        Math.min(bw, this.x + this.w - Math.max(bx, this.x)),
                        Math.min(bh, this.y + this.h - Math.max(by, this.y))
                    );
                }
            }
        }

        // Brick pattern on front face
        for (let row = 0; row < Math.ceil(d / bh); row++) {
            const offset = (row % 2 === 0) ? bw / 2 : 0;
            for (let col = -1; col < Math.ceil(this.w / bw) + 1; col++) {
                const bx = this.x + col * bw + offset;
                const by = this.y + this.h + row * bh;
                if (bx + bw > this.x && bx < this.x + this.w) {
                    ctx.strokeStyle = '#145020';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(
                        Math.max(bx, this.x),
                        Math.max(by, this.y + this.h),
                        Math.min(bw, this.x + this.w - Math.max(bx, this.x)),
                        Math.min(bh, this.y + this.h + d - Math.max(by, this.y + this.h))
                    );
                }
            }
        }

        // Top edge highlight
        ctx.strokeStyle = '#5cd670';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 1);
        ctx.lineTo(this.x + this.w, this.y + 1);
        ctx.stroke();
    }
}

class Player extends Entity {
    constructor(x, y) {
        super(x, y, 32, 32);
        this.lives = 3;
        this.score = 0;
        this.isGrounded = false;
        this.facingRight = true;
        this.invincibleTimer = 0;
        this.spawnX = x;
        this.spawnY = y;
        this.animFrame = 0;
        this.animTimer = 0;
        // Squash & Stretch
        this.scaleX = 1;
        this.scaleY = 1;
        this.wasGrounded = false;
        this.doubleJumped = false;
    }

    update() {
        // horizontal movement
        if (isLeft()) {
            this.vx = -PLAYER_SPEED;
            this.facingRight = false;
        } else if (isRight()) {
            this.vx = PLAYER_SPEED;
            this.facingRight = true;
        } else {
            this.vx = 0;
        }

        // jump (only on press, not hold) — supports double jump
        if (isJump() && !jumpWasPressed) {
            if (this.isGrounded) {
                this.vy = PLAYER_JUMP;
                this.isGrounded = false;
                this.doubleJumped = false;
                this.scaleX = 0.75;
                this.scaleY = 1.3;
                playSound('jump');
            } else if (!this.doubleJumped) {
                // Double jump — slightly weaker
                this.vy = PLAYER_JUMP * 0.82;
                this.doubleJumped = true;
                this.scaleX = 0.7;
                this.scaleY = 1.4;
                // Spawn double-jump puff particles
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI * 0.5 + (Math.random() - 0.5) * 1.2;
                    const spd = 1.5 + Math.random() * 2;
                    particles.push(new DeathParticle(
                        this.x + this.w / 2 + (Math.random() - 0.5) * 10,
                        this.y + this.h,
                        Math.cos(angle) * spd, Math.sin(angle) * spd,
                        '#aaddff', 4 + Math.floor(Math.random() * 4)
                    ));
                }
                playSound('jump');
            }
        }
        jumpWasPressed = isJump();

        // gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;

        // animation
        if (this.vx !== 0 && this.isGrounded) {
            this.animTimer++;
            if (this.animTimer > 8) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }
        } else {
            this.animFrame = 0;
        }

        // move X
        this.x += this.vx;
        this.resolveCollisionsX();

        // move Y
        this.isGrounded = false;
        this.y += this.vy;
        this.resolveCollisionsY();

        // clamp to canvas
        if (this.x < 0) this.x = 0;
        if (this.x + this.w > W) this.x = W - this.w;

        // fall off screen
        if (this.y > H + 50) {
            this.die();
        }

        // invincibility
        if (this.invincibleTimer > 0) this.invincibleTimer--;

        // Smooth squash/stretch recovery
        this.scaleX += (1 - this.scaleX) * 0.22;
        this.scaleY += (1 - this.scaleY) * 0.22;
        // Stretch in air (falling fast)
        if (!this.isGrounded && this.vy > 3) {
            const stretch = Math.min(this.vy / MAX_FALL, 1) * 0.2;
            this.scaleX = Math.min(this.scaleX, 1 - stretch * 0.5);
            this.scaleY = Math.max(this.scaleY, 1 + stretch);
        }
    }

    resolveCollisionsX() {
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vx > 0) {
                    this.x = p.x - this.w;
                } else if (this.vx < 0) {
                    this.x = p.x + p.w;
                }
                this.vx = 0;
            }
        }
    }

    resolveCollisionsY() {
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vy > 0) {
                    this.y = p.y - this.h;
                    // Squash on hard landing
                    if (this.vy > 4) {
                        this.scaleX = 1.3;
                        this.scaleY = 0.7;
                    }
                    this.vy = 0;
                    this.isGrounded = true;
                    this.doubleJumped = false;
                    if (comboCount > 0) comboCount = 0;
                } else if (this.vy < 0) {
                    this.y = p.y + p.h;
                    this.vy = 0;
                }
            }
        }
    }

    die() {
        this.lives--;
        if (this.lives <= 0) {
            if (totalScore > highScore) {
                highScore = totalScore;
                localStorage.setItem('mushroomHighScore', String(highScore));
            }
            gameState = 'GAME_OVER';
            playSound('gameover');
        } else {
            this.x = this.spawnX;
            this.y = this.spawnY;
            this.vx = 0;
            this.vy = 0;
            this.invincibleTimer = 120; // 2 seconds
            comboCount = 0;
            comboDisplayTimer = 0;
            playSound('hurt');
        }
    }

    render() {
        // blink when invincible
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 4) % 2 === 0) return;

        // 3D shadow
        drawShadow(this.x, this.y + this.h, this.w);

        ctx.save();
        const px = 2.5;
        const spriteW = 14 * px;
        const spriteH = 12 * px;
        // Pivot from bottom-center for squash/stretch
        const pivotX = this.x + this.w / 2;
        const pivotY = this.y + this.h;
        ctx.translate(pivotX, pivotY);
        ctx.scale(this.scaleX, this.scaleY);
        ctx.translate(-pivotX, -pivotY);

        const drawX = this.x + (this.w - spriteW) / 2;
        const drawY = this.y + (this.h - spriteH);

        if (!this.facingRight) {
            ctx.translate(drawX + spriteW, drawY);
            ctx.scale(-1, 1);
            drawPixelSprite(0, 0, px, MUSHROOM_SPRITE);
        } else {
            drawPixelSprite(drawX, drawY, px, MUSHROOM_SPRITE);
        }
        ctx.restore();
    }
}

class Mario extends Entity {
    // type: 'normal' | 'fast' | 'jumpy'
    constructor(x, y, speed, type = 'normal') {
        super(x, y, 30, 36);
        this.type = type;
        this.speed = type === 'fast' ? speed * 1.9 : speed;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.isAlive = true;
        this.deathTimer = 0;
        this.squishScale = 1;
        this.animFrame = 0;
        this.animTimer = 0;
        // jumpy: timer until next jump
        this.jumpTimer = type === 'jumpy' ? 60 + Math.floor(Math.random() * 80) : 9999;
    }

    update() {
        if (!this.isAlive) {
            this.deathTimer--;
            this.squishScale = Math.max(0.1, this.deathTimer / 20);
            return this.deathTimer > 0;
        }

        this.vx = this.speed * this.direction;

        // gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;

        // animation
        this.animTimer++;
        if (this.animTimer > 10) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }

        // move X
        this.x += this.vx;
        this.resolveCollisionsX();

        // move Y
        this.y += this.vy;
        this.resolveCollisionsY();

        // check edge - reverse direction if about to walk off a platform
        this.checkEdge();

        // jumpy type: periodic jump
        if (this.type === 'jumpy') {
            this.jumpTimer--;
            if (this.jumpTimer <= 0 && this.vy >= 0 && this.vy <= GRAVITY * 2) {
                this.vy = -11;
                this.jumpTimer = 90 + Math.floor(Math.random() * 80);
            }
        }

        // reverse if hitting canvas bounds
        if (this.x <= 0 || this.x + this.w >= W) {
            this.direction *= -1;
            this.x = Math.max(0, Math.min(this.x, W - this.w));
        }

        return true;
    }

    resolveCollisionsX() {
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vx > 0) {
                    this.x = p.x - this.w;
                } else if (this.vx < 0) {
                    this.x = p.x + p.w;
                }
                this.direction *= -1;
            }
        }
    }

    resolveCollisionsY() {
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vy > 0) {
                    this.y = p.y - this.h;
                    this.vy = 0;
                } else if (this.vy < 0) {
                    this.y = p.y + p.h;
                    this.vy = 0;
                }
            }
        }
    }

    checkEdge() {
        const footX = this.direction > 0 ? this.x + this.w + 2 : this.x - 2;
        const footY = this.y + this.h + 2;
        let onPlatform = false;
        for (const p of platforms) {
            if (footX >= p.x && footX <= p.x + p.w && footY >= p.y && footY <= p.y + p.h + 4) {
                onPlatform = true;
                break;
            }
        }
        if (!onPlatform && this.vy === 0) {
            this.direction *= -1;
        }
    }

    stomp() {
        this.isAlive = false;
        this.deathTimer = 20;
        this.vx = 0;
        this.vy = 0;
        spawnDeathParticles(this.x, this.y, this.w, this.h);
        playSound('stomp');
    }

    render() {
        // 3D shadow
        if (this.isAlive) {
            drawShadow(this.x, this.y + this.h, this.w);
        }

        ctx.save();
        const px = 2.5;
        const spriteW = 12 * px;
        const spriteH = 13 * px;
        const drawX = this.x + (this.w - spriteW) / 2;
        const drawY = this.y + this.h - spriteH * this.squishScale;

        if (this.direction < 0) {
            ctx.translate(drawX + spriteW, drawY);
            ctx.scale(-1, this.squishScale);
            drawPixelSprite(0, 0, px, MARIO_SPRITE);
        } else {
            ctx.translate(drawX, drawY);
            ctx.scale(1, this.squishScale);
            drawPixelSprite(0, 0, px, MARIO_SPRITE);
        }
        ctx.restore();

        // Type badge above head
        if (this.isAlive && this.type !== 'normal') {
            ctx.save();
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            const badgeX = this.x + this.w / 2;
            const badgeY = this.y - 4;
            if (this.type === 'fast') {
                ctx.fillStyle = '#000';
                ctx.fillText('⚡', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#ff6600';
                ctx.fillText('⚡', badgeX, badgeY);
            } else if (this.type === 'jumpy') {
                ctx.fillStyle = '#000';
                ctx.fillText('↑', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#44aaff';
                ctx.fillText('↑', badgeX, badgeY);
            }
            ctx.textAlign = 'left';
            ctx.restore();
        }
    }
}

// === COINS ===
class Coin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 16;
        this.h = 16;
        this.collected = false;
        this.animTimer = Math.random() * 60; // stagger animation
        this.bobOffset = Math.random() * Math.PI * 2;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const bob = Math.sin(this.animTimer * 0.07 + this.bobOffset) * 3;
        const rx = this.x;
        const ry = this.y + bob;
        const glow = Math.abs(Math.sin(this.animTimer * 0.05)) * 0.4 + 0.6;

        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(rx + 8, ry + 8, 10, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 0, ${glow * 0.25})`;
        ctx.fill();
        // Coin body
        ctx.beginPath();
        ctx.arc(rx + 8, ry + 8, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ffcc00';
        ctx.fill();
        // Shine
        ctx.beginPath();
        ctx.arc(rx + 6, ry + 5, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,200,0.7)';
        ctx.fill();
        // Dollar sign
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#b8860b';
        ctx.fillText('$', rx + 8, ry + 12);
        ctx.restore();
    }
}

let coins = [];

// === DEATH PARTICLES ===
class DeathParticle {
    constructor(x, y, vx, vy, color, size) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.timer = 35 + Math.random() * 20;
        this.maxTimer = this.timer;
        this.gravity = 0.35;
    }

    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.97;
        this.timer--;
        return this.timer > 0;
    }

    render() {
        const alpha = this.timer / this.maxTimer;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

function spawnDeathParticles(x, y, w, h) {
    const colors = [C.marioHat, C.marioSkin, C.marioOveralls, C.marioShirt, C.marioShoe];
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let i = 0; i < 14; i++) {
        const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
        const speed = 2 + Math.random() * 3.5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 2;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 3 + Math.floor(Math.random() * 4);
        particles.push(new DeathParticle(cx, cy, vx, vy, color, size));
    }
}

// === SCORE PARTICLES ===
class Particle {
    constructor(x, y, text, color = '#ffff00') {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.timer = 50;
        this.vy = -2;
    }

    update() {
        this.y += this.vy;
        this.vy *= 0.95;
        this.timer--;
        return this.timer > 0;
    }

    render() {
        const alpha = Math.min(1, this.timer / 15);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 18px monospace';
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// === LEVEL DATA ===
const LEVELS = [
    {
        // Level 1: Simple ground + 2 platforms
        platforms: [
            { x: 0, y: 460, w: 800, h: 40 },
            { x: 150, y: 370, w: 150, h: 20 },
            { x: 500, y: 370, w: 150, h: 20 },
        ],
        marioSpawns: [
            { x: 300, y: 420 },
            { x: 600, y: 420 },
        ],
        marioSpeed: 1.5,
        playerSpawn: { x: 50, y: 400 },
        coinSpawns: [
            { x: 230, y: 435 }, { x: 400, y: 435 }, { x: 570, y: 435 },
            { x: 195, y: 345 }, { x: 545, y: 345 },
        ],
    },
    {
        // Level 2: More platforms, 3 Marios
        platforms: [
            { x: 0, y: 460, w: 350, h: 40 },
            { x: 450, y: 460, w: 350, h: 40 },
            { x: 100, y: 370, w: 180, h: 20 },
            { x: 350, y: 320, w: 120, h: 20 },
            { x: 550, y: 370, w: 180, h: 20 },
        ],
        marioSpawns: [
            { x: 100, y: 420 },
            { x: 550, y: 420 },
            { x: 370, y: 280 },
        ],
        marioSpeed: 1.8,
        playerSpawn: { x: 50, y: 400 },
        coinSpawns: [
            { x: 140, y: 435 }, { x: 220, y: 435 }, { x: 490, y: 435 },
            { x: 155, y: 345 }, { x: 395, y: 295 }, { x: 605, y: 345 },
        ],
    },
    {
        // Level 3: Gaps, multi-tier
        platforms: [
            { x: 0, y: 460, w: 200, h: 40 },
            { x: 280, y: 460, w: 240, h: 40 },
            { x: 600, y: 460, w: 200, h: 40 },
            { x: 80, y: 370, w: 150, h: 20 },
            { x: 320, y: 330, w: 160, h: 20 },
            { x: 570, y: 370, w: 150, h: 20 },
            { x: 300, y: 220, w: 200, h: 20 },
        ],
        marioSpawns: [
            { x: 50, y: 420 },
            { x: 350, y: 420 },
            { x: 650, y: 420 },
            { x: 350, y: 180 },
        ],
        marioSpeed: 2.0,
        playerSpawn: { x: 50, y: 400 },
        coinSpawns: [
            { x: 80, y: 435 }, { x: 360, y: 435 }, { x: 670, y: 435 },
            { x: 120, y: 345 }, { x: 370, y: 305 }, { x: 620, y: 345 },
            { x: 370, y: 195 },
        ],
    },
    {
        // Level 4: Complex layout
        platforms: [
            { x: 0, y: 460, w: 160, h: 40 },
            { x: 240, y: 460, w: 160, h: 40 },
            { x: 480, y: 460, w: 160, h: 40 },
            { x: 680, y: 460, w: 120, h: 40 },
            { x: 50, y: 375, w: 120, h: 20 },
            { x: 250, y: 340, w: 120, h: 20 },
            { x: 440, y: 375, w: 120, h: 20 },
            { x: 620, y: 340, w: 120, h: 20 },
            { x: 200, y: 230, w: 160, h: 20 },
            { x: 460, y: 230, w: 160, h: 20 },
        ],
        marioSpawns: [
            { x: 50, y: 420 },
            { x: 300, y: 420 },
            { x: 530, y: 420 },
            { x: 220, y: 190 },
            { x: 480, y: 190 },
        ],
        marioSpeed: 2.2,
        playerSpawn: { x: 30, y: 400 },
        coinSpawns: [
            { x: 100, y: 435 }, { x: 340, y: 435 }, { x: 570, y: 435 },
            { x: 90, y: 350 }, { x: 290, y: 315 }, { x: 470, y: 350 }, { x: 660, y: 315 },
            { x: 260, y: 205 }, { x: 500, y: 205 },
        ],
    },
    {
        // Level 5: The gauntlet
        platforms: [
            { x: 0, y: 460, w: 120, h: 40 },
            { x: 180, y: 460, w: 120, h: 40 },
            { x: 360, y: 460, w: 120, h: 40 },
            { x: 540, y: 460, w: 120, h: 40 },
            { x: 700, y: 460, w: 100, h: 40 },
            { x: 80, y: 380, w: 100, h: 20 },
            { x: 260, y: 355, w: 100, h: 20 },
            { x: 440, y: 380, w: 100, h: 20 },
            { x: 620, y: 355, w: 100, h: 20 },
            { x: 160, y: 260, w: 140, h: 20 },
            { x: 380, y: 230, w: 140, h: 20 },
            { x: 560, y: 260, w: 140, h: 20 },
            { x: 300, y: 130, w: 200, h: 20 },
        ],
        marioSpawns: [
            { x: 200, y: 420 },
            { x: 400, y: 420 },
            { x: 560, y: 420 },
            { x: 180, y: 220 },
            { x: 400, y: 190 },
            { x: 350, y: 90 },
        ],
        marioSpeed: 2.5,
        playerSpawn: { x: 30, y: 400 },
    },
];

// === GAME STATE ===
let gameState = 'MENU';
let currentLevel = 0;
let player = null;
let marios = [];
let platforms = [];
let particles = [];
let shakeTimer = 0;
let shakeIntensity = 0;
let comboCount = 0;
let comboDisplayTimer = 0;
let levelTimer = 0;       // frames elapsed in current level
const TIME_BONUS_MAX = 3000; // max bonus at 0 seconds
const TIME_PER_FRAME = 1 / 60;
let enterWasPressed = false;
let escapeWasPressed = false;
let leftWasPressed = false;
let rightWasPressed = false;
let muteWasPressed = false;
let totalScore = 0;
let highScore = parseInt(localStorage.getItem('mushroomHighScore') || '0');
let unlockedLevels = parseInt(localStorage.getItem('mushroomUnlockedLevels') || '1');
let selectedLevelIdx = 0;
let soundMuted = false;

// === SOUND (Web Audio API) ===
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx || soundMuted) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    switch (type) {
        case 'jump':
            osc.type = 'square';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(600, now + 0.1);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        case 'stomp':
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;
        case 'hurt':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.3);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            break;
        case 'gameover':
            osc.type = 'square';
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.linearRampToValueAtTime(200, now + 0.2);
            osc.frequency.linearRampToValueAtTime(100, now + 0.5);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
            break;
        case 'levelup':
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.setValueAtTime(500, now + 0.1);
            osc.frequency.setValueAtTime(600, now + 0.2);
            osc.frequency.setValueAtTime(800, now + 0.3);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
            break;
        case 'coin':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.08);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
    }
}

// === LEVEL MANAGEMENT ===
function getMarioType(levelIndex, spawnIdx) {
    if (levelIndex < 2) return 'normal';
    if (levelIndex === 2) return spawnIdx === 0 ? 'fast' : 'normal';
    if (levelIndex === 3) {
        const types = ['normal', 'fast', 'jumpy', 'normal', 'normal'];
        return types[spawnIdx % types.length];
    }
    const types = ['normal', 'fast', 'jumpy', 'fast', 'jumpy', 'fast'];
    return types[spawnIdx % types.length];
}

function loadLevel(index) {
    const lvlIndex = index < LEVELS.length ? index : (index % LEVELS.length);
    const lvl = LEVELS[lvlIndex];
    const speedMult = index >= LEVELS.length ? 1 + (index - LEVELS.length) * 0.15 : 1;

    platforms = lvl.platforms.map(p => new Platform(p.x, p.y, p.w, p.h));

    const speed = lvl.marioSpeed * speedMult;
    marios = lvl.marioSpawns.map((s, i) => new Mario(s.x, s.y, speed, getMarioType(index, i)));

    // Extra Marios for levels beyond 5
    if (index >= LEVELS.length) {
        const extraCount = Math.floor((index - LEVELS.length) / 2);
        for (let i = 0; i < extraCount; i++) {
            const spawn = lvl.marioSpawns[i % lvl.marioSpawns.length];
            marios.push(new Mario(spawn.x + 40, spawn.y, speed * 1.1, 'fast'));
        }
    }

    const sp = lvl.playerSpawn;
    if (player) {
        player.x = sp.x;
        player.y = sp.y;
        player.spawnX = sp.x;
        player.spawnY = sp.y;
        player.vx = 0;
        player.vy = 0;
        player.invincibleTimer = 60;
    } else {
        player = new Player(sp.x, sp.y);
    }

    particles = [];
    comboCount = 0;
    comboDisplayTimer = 0;
    levelTimer = 0;
    coins = (lvl.coinSpawns || []).map(c => new Coin(c.x, c.y));
}

function startGame() {
    startGameFromLevel(0);
}

function startGameFromLevel(level) {
    currentLevel = level;
    totalScore = 0;
    player = null;
    loadLevel(level);
    player.lives = 3;
    player.score = 0;
    gameState = 'PLAYING';
}

// === COLLISION DETECTION ===
function checkCoinCollisions() {
    for (const coin of coins) {
        if (coin.collected) continue;
        if (aabb(player, coin)) {
            coin.collected = true;
            player.score += 50;
            totalScore += 50;
            particles.push(new Particle(coin.x, coin.y - 5, '+50', '#ffcc00'));
            playSound('coin');
        }
    }
    coins = coins.filter(c => !c.collected);
}

function checkPlayerMarioCollisions() {
    if (player.invincibleTimer > 0) return;

    for (const mario of marios) {
        if (!mario.isAlive) continue;
        if (!aabb(player, mario)) continue;

        // Stomp: player is falling and above mario
        const playerBottom = player.y + player.h;
        const marioTop = mario.y;
        const overlapY = playerBottom - marioTop;

        if (player.vy > 0 && overlapY < 15) {
            // STOMP!
            mario.stomp();
            player.vy = STOMP_BOUNCE;
            comboCount++;
            const multiplier = comboCount;
            const points = 100 * multiplier;
            player.score += points;
            totalScore += points;
            comboDisplayTimer = 100;
            const comboColors = ['#ffff00', '#ffaa00', '#ff6600', '#ff2200', '#ff00ff'];
            const pColor = comboColors[Math.min(comboCount - 1, 4)];
            const pText = comboCount > 1 ? `x${comboCount}  +${points}` : `+${points}`;
            particles.push(new Particle(mario.x, mario.y - 10, pText, pColor));
            shakeTimer = Math.min(6 + comboCount, 12);
            shakeIntensity = Math.min(3 + comboCount * 0.5, 7);
        } else {
            // Side hit — damage
            player.die();
        }
    }
}

// === 3D HELPERS ===
function drawShadow(x, y, w) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 4, w * 0.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// === BACKGROUND DRAWING ===
// Parallax offset based on player position
function prlx(factor) {
    if (!player) return 0;
    return (player.x - W / 2) * factor;
}

function drawBackground() {
    // Sky gradient for 3D depth
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#3060c0');
    skyGrad.addColorStop(0.5, '#5c94fc');
    skyGrad.addColorStop(1, '#88bbff');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Distant mountains (layer 1 — slowest parallax)
    const mo = prlx(-0.04);
    ctx.fillStyle = '#4a6fa0';
    drawMountain(80 + mo, 460, 200, 180);
    drawMountain(300 + mo, 460, 280, 220);
    drawMountain(580 + mo, 460, 250, 190);
    drawMountain(750 + mo, 460, 180, 160);

    // Clouds (layer 2 — medium parallax)
    const co = prlx(-0.08);
    drawCloud3D(100 + co, 60, 60);
    drawCloud3D(350 + co, 90, 45);
    drawCloud3D(600 + co, 50, 55);
    drawCloud3D(750 + co, 110, 35);

    // Hills (layer 3 — fastest parallax)
    const ho = prlx(-0.14);
    drawHill3D(100 + ho, 460, 160, 80, '#3a7c2f', '#2d6025');
    drawHill3D(500 + ho, 460, 200, 100, '#3a7c2f', '#2d6025');
    drawHill3D(300 + ho, 460, 140, 60, '#4a8c3f', '#3a7c2f');
    drawHill3D(700 + ho, 460, 120, 50, '#4a8c3f', '#3a7c2f');
}

function drawCloud3D(x, y, size) {
    // Cloud shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(x + 3, y + 4, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.3 + 3, y - size * 0.15 + 4, size * 0.35, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6 + 3, y + 4, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Cloud body
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.3, y - size * 0.15, size * 0.35, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Cloud highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x + size * 0.15, y - size * 0.1, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawMountain(x, baseY, width, height) {
    ctx.beginPath();
    ctx.moveTo(x - width / 2, baseY);
    ctx.lineTo(x - width * 0.05, baseY - height);
    ctx.lineTo(x + width * 0.05, baseY - height * 0.9);
    ctx.lineTo(x + width / 2, baseY);
    ctx.closePath();
    ctx.fill();

    // Snow cap
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(x - width * 0.08, baseY - height * 0.8);
    ctx.lineTo(x - width * 0.05, baseY - height);
    ctx.lineTo(x + width * 0.05, baseY - height * 0.9);
    ctx.lineTo(x + width * 0.08, baseY - height * 0.75);
    ctx.closePath();
    ctx.fill();
}

function drawHill3D(x, baseY, width, height, colorLight, colorDark) {
    // Hill shadow (3D depth)
    ctx.fillStyle = colorDark;
    ctx.beginPath();
    ctx.moveTo(x - width / 2 + 5, baseY);
    ctx.quadraticCurveTo(x + 5, baseY - height + 5, x + width / 2 + 5, baseY);
    ctx.fill();

    // Hill body
    ctx.fillStyle = colorLight;
    ctx.beginPath();
    ctx.moveTo(x - width / 2, baseY);
    ctx.quadraticCurveTo(x, baseY - height, x + width / 2, baseY);
    ctx.fill();

    // Hill highlight
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(x - width / 4, baseY);
    ctx.quadraticCurveTo(x - width * 0.1, baseY - height * 0.7, x, baseY - height * 0.3);
    ctx.quadraticCurveTo(x - width * 0.05, baseY, x - width / 4, baseY);
    ctx.fill();
}

// === HUD ===
function drawHUD() {
    ctx.font = 'bold 16px monospace';

    // Score
    ctx.fillStyle = C.textShadow;
    ctx.fillText(`SCORE: ${player.score}`, 22, 32);
    ctx.fillStyle = C.hud;
    ctx.fillText(`SCORE: ${player.score}`, 20, 30);

    // Lives
    ctx.fillStyle = C.textShadow;
    ctx.fillText(`LIVES: ${player.lives}`, 22, 57);
    ctx.fillStyle = C.hud;
    ctx.fillText(`LIVES: ${player.lives}`, 20, 55);

    // Level
    const lvlText = `LEVEL: ${currentLevel + 1}`;
    ctx.fillStyle = C.textShadow;
    ctx.fillText(lvlText, W - 152, 32);
    ctx.fillStyle = C.hud;
    ctx.fillText(lvlText, W - 150, 30);

    // Timer
    const secs = Math.floor(levelTimer / 60);
    const timerColor = secs >= 50 ? '#ff4444' : secs >= 35 ? '#ffaa00' : '#ffffff';
    ctx.fillStyle = C.textShadow;
    ctx.fillText(`T: ${secs}s`, W - 152, 57);
    ctx.fillStyle = timerColor;
    ctx.fillText(`T: ${secs}s`, W - 150, 55);

    // High score
    if (highScore > 0) {
        ctx.fillStyle = C.textShadow;
        ctx.fillText(`HI: ${highScore}`, W / 2 - 38, 32);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`HI: ${highScore}`, W / 2 - 40, 30);
    }

    // Mute indicator
    ctx.save();
    ctx.font = '18px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = soundMuted ? '#ff6666' : '#aaffaa';
    ctx.fillText(soundMuted ? '🔇' : '🔊', W - 10, 55);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('[V]', W - 12, 70);
    ctx.textAlign = 'left';
    ctx.restore();

    // Combo indicator
    if (comboCount >= 2 && comboDisplayTimer > 0) {
        const alpha = Math.min(1, comboDisplayTimer / 20);
        const pulse = 1 + Math.sin(comboDisplayTimer * 0.3) * 0.08;
        const comboColors = ['', '', '#ffff00', '#ffaa00', '#ff6600', '#ff2200'];
        const color = comboColors[Math.min(comboCount, 5)] || '#ff00ff';
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(26 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(`COMBO x${comboCount}!`, W / 2 + 2, H / 2 - 28);
        ctx.fillStyle = color;
        ctx.fillText(`COMBO x${comboCount}!`, W / 2, H / 2 - 30);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

// === SCREEN RENDERS ===
function drawTitle(text, y, size, color) {
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.textShadow;
    ctx.fillText(text, W / 2 + 3, y + 3);
    ctx.fillStyle = color || C.text;
    ctx.fillText(text, W / 2, y);
    ctx.textAlign = 'left';
}

function renderMenu() {
    drawBackground();

    drawTitle("MUSHROOM'S REVENGE", 160, 36, '#ff4444');
    drawTitle("Прыгай на Марио!", 210, 20, '#ffcc00');

    // Draw big mushroom
    ctx.save();
    const px = 5;
    const sx = W / 2 - (14 * px) / 2;
    drawPixelSprite(sx, 240, px, MUSHROOM_SPRITE);
    ctx.restore();

    drawTitle("ENTER / Нажми — Начать", 400, 18, C.text);
    drawTitle("←→ / AD — Движение  |  ↑ / W / SPACE — Прыжок", 430, 13, '#aaaaaa');
    drawTitle("На мобильном: кнопки ◀ ▶ ▲", 455, 12, '#888888');
}

function renderGameOver() {
    drawBackground();

    drawTitle("GAME OVER", 170, 42, '#ff4444');
    drawTitle(`Счёт: ${totalScore}`, 220, 22, '#ffcc00');

    if (totalScore >= highScore && highScore > 0) {
        drawTitle("НОВЫЙ РЕКОРД!", 255, 20, '#00ff00');
    }

    drawTitle("ENTER — Играть снова", 350, 18, C.text);
}

function renderLevelComplete() {
    drawBackground();
    platforms.forEach(p => p.render());

    drawTitle(`УРОВЕНЬ ${currentLevel + 1} ПРОЙДЕН!`, 200, 32, '#00ff00');
    drawTitle(`Счёт: ${player.score}`, 245, 20, '#ffcc00');
}

function renderLevelSelect() {
    drawBackground();

    drawTitle('ВЫБОР УРОВНЯ', 90, 30, '#ffcc00');

    const boxW = 120;
    const boxH = 110;
    const gap = 16;
    const totalW = LEVELS.length * boxW + (LEVELS.length - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = 160;

    for (let i = 0; i < LEVELS.length; i++) {
        const bx = startX + i * (boxW + gap);
        const by = startY;
        const locked = i >= unlockedLevels;
        const isSelected = i === selectedLevelIdx;

        // Box shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(bx + 3, by + 3, boxW, boxH, 10);
        ctx.fill();

        // Box background
        if (locked) {
            ctx.fillStyle = 'rgba(40,40,60,0.8)';
        } else if (isSelected) {
            ctx.fillStyle = 'rgba(80,180,80,0.85)';
        } else {
            ctx.fillStyle = 'rgba(60,120,200,0.75)';
        }
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 10);
        ctx.fill();

        // Selected border glow
        if (isSelected && !locked) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(bx, by, boxW, boxH, 10);
            ctx.stroke();
        }

        ctx.save();
        ctx.textAlign = 'center';
        if (locked) {
            // Lock icon
            ctx.font = 'bold 32px monospace';
            ctx.fillStyle = '#888';
            ctx.fillText('🔒', bx + boxW / 2, by + 52);
            ctx.font = 'bold 13px monospace';
            ctx.fillStyle = '#666';
            ctx.fillText(`УРОВЕНЬ ${i + 1}`, bx + boxW / 2, by + 85);
        } else {
            // Level number
            ctx.font = 'bold 40px monospace';
            ctx.fillStyle = '#fff';
            ctx.fillText(`${i + 1}`, bx + boxW / 2, by + 55);
            ctx.font = 'bold 13px monospace';
            ctx.fillStyle = '#ddd';
            ctx.fillText(`УРОВЕНЬ ${i + 1}`, bx + boxW / 2, by + 82);
            // Stars for unlocked
            ctx.font = '14px monospace';
            ctx.fillStyle = '#ffdd00';
            ctx.fillText('★ ★ ★', bx + boxW / 2, by + 102);
        }
        ctx.restore();
    }

    // Selected level name
    const levelNames = ['Начало', 'Равнина', 'Пропасти', 'Лабиринт', 'Финал'];
    if (selectedLevelIdx < unlockedLevels) {
        drawTitle(levelNames[selectedLevelIdx] || `Уровень ${selectedLevelIdx + 1}`, 310, 18, '#88ffaa');
    }

    drawTitle('← → — Выбор   ENTER — Играть   ESC — Назад', 380, 13, '#aaaaaa');
    if (selectedLevelIdx >= unlockedLevels) {
        drawTitle('Уровень заблокирован! Пройди предыдущий.', 405, 12, '#ff6666');
    }
}

// === UPDATE ===
let levelCompleteTimer = 0;

function update() {
    switch (gameState) {
        case 'MENU':
            if (isEnter() && !enterWasPressed) {
                initAudio();
                selectedLevelIdx = 0;
                gameState = 'LEVEL_SELECT';
            }
            break;

        case 'LEVEL_SELECT':
            if (isLeft() && !leftWasPressed && selectedLevelIdx > 0) {
                selectedLevelIdx--;
            }
            if (isRight() && !rightWasPressed && selectedLevelIdx < LEVELS.length - 1) {
                selectedLevelIdx++;
            }
            if (isEnter() && !enterWasPressed) {
                if (selectedLevelIdx < unlockedLevels) {
                    startGameFromLevel(selectedLevelIdx);
                }
            }
            if (isEscape() && !escapeWasPressed) {
                gameState = 'MENU';
            }
            break;

        case 'PLAYING':
            player.update();
            marios = marios.filter(m => m.update());
            particles = particles.filter(p => p.update());
            coins = coins.filter(c => c.update());
            checkPlayerMarioCollisions();
            checkCoinCollisions();

            if (shakeTimer > 0) shakeTimer--;
            if (comboDisplayTimer > 0) comboDisplayTimer--;
            levelTimer++;

            // Check level complete
            if (marios.filter(m => m.isAlive).length === 0 && marios.length === 0) {
                // Time bonus: max 3000 pts at <5s, scales to 0 at 60s
                const elapsed = levelTimer / 60;
                const timeBonus = Math.max(0, Math.round(TIME_BONUS_MAX * (1 - elapsed / 60)));
                if (timeBonus > 0) {
                    player.score += timeBonus;
                    totalScore += timeBonus;
                    particles.push(new Particle(W / 2 - 60, H / 2 - 60, `ВРЕМЯ +${timeBonus}`, '#00ffcc'));
                }
                gameState = 'LEVEL_COMPLETE';
                levelCompleteTimer = 120;
                playSound('levelup');
            }

            if (isEscape() && !escapeWasPressed) {
                gameState = 'PAUSED';
            }
            break;

        case 'LEVEL_COMPLETE':
            levelCompleteTimer--;
            if (levelCompleteTimer <= 0) {
                currentLevel++;
                // Unlock next level (up to LEVELS.length)
                if (currentLevel < LEVELS.length && currentLevel >= unlockedLevels) {
                    unlockedLevels = currentLevel + 1;
                    localStorage.setItem('mushroomUnlockedLevels', String(unlockedLevels));
                }
                loadLevel(currentLevel);
                gameState = 'PLAYING';
            }
            break;

        case 'GAME_OVER':
            if (isEnter() && !enterWasPressed) {
                if (totalScore > highScore) {
                    highScore = totalScore;
                    localStorage.setItem('mushroomHighScore', String(highScore));
                }
                startGame();
            }
            break;

        case 'PAUSED':
            if (isEscape() && !escapeWasPressed) {
                gameState = 'PLAYING';
            }
            // R = restart, M = menu
            if (keys['KeyR'] && !keys['_rWas']) {
                startGame();
            }
            if (keys['KeyM'] && !keys['_mWas']) {
                gameState = 'MENU';
                player = null;
            }
            keys['_rWas'] = keys['KeyR'];
            keys['_mWas'] = keys['KeyM'];
            break;
    }

    // V key — toggle mute (any state)
    if (keys['KeyV'] && !muteWasPressed) {
        soundMuted = !soundMuted;
    }
    muteWasPressed = !!keys['KeyV'];

    enterWasPressed = isEnter();
    escapeWasPressed = isEscape();
    leftWasPressed = isLeft();
    rightWasPressed = isRight();
}

// === RENDER ===
function render() {
    ctx.save();

    // Screen shake
    if (shakeTimer > 0) {
        const sx = (Math.random() - 0.5) * shakeIntensity * 2;
        const sy = (Math.random() - 0.5) * shakeIntensity * 2;
        ctx.translate(sx, sy);
    }

    switch (gameState) {
        case 'MENU':
            renderMenu();
            break;

        case 'LEVEL_SELECT':
            renderLevelSelect();
            break;

        case 'PLAYING':
            drawBackground();
            platforms.forEach(p => p.render());
            coins.forEach(c => c.render());
            marios.forEach(m => m.render());
            player.render();
            particles.forEach(p => p.render());
            drawHUD();
            break;

        case 'LEVEL_COMPLETE':
            renderLevelComplete();
            break;

        case 'GAME_OVER':
            renderGameOver();
            break;

        case 'PAUSED':
            drawBackground();
            platforms.forEach(p => p.render());
            marios.forEach(m => m.render());
            player.render();
            drawHUD();

            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, W, H);

            // Pause panel
            ctx.fillStyle = 'rgba(20,30,60,0.92)';
            ctx.beginPath();
            ctx.roundRect(W / 2 - 170, 150, 340, 220, 16);
            ctx.fill();
            ctx.strokeStyle = 'rgba(100,150,255,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 170, 150, 340, 220, 16);
            ctx.stroke();

            drawTitle('ПАУЗА', 205, 36, '#ffffff');
            drawTitle(`Счёт: ${player.score}`, 242, 16, '#ffcc00');

            // Buttons
            const btnW = 220; const btnH = 38; const btnX = W / 2 - btnW / 2;
            ctx.fillStyle = 'rgba(60,180,60,0.8)';
            ctx.beginPath(); ctx.roundRect(btnX, 268, btnW, btnH, 8); ctx.fill();
            drawTitle('ESC — Продолжить', 293, 15, '#ffffff');

            ctx.fillStyle = 'rgba(200,120,30,0.8)';
            ctx.beginPath(); ctx.roundRect(btnX, 316, btnW, btnH, 8); ctx.fill();
            drawTitle('R — Рестарт', 341, 15, '#ffffff');

            ctx.fillStyle = 'rgba(150,60,200,0.8)';
            ctx.beginPath(); ctx.roundRect(btnX, 364, btnW - 2, btnH - 8, 8); ctx.fill();
            drawTitle('M — В меню', 386, 15, '#ffffff');
            break;
    }

    ctx.restore();
}

// === GAME LOOP ===
let lastTime = 0;
let accumulator = 0;

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    accumulator += dt;

    while (accumulator >= TICK) {
        update();
        accumulator -= TICK;
    }

    render();
    requestAnimationFrame(gameLoop);
}

// === START ===
ctx.imageSmoothingEnabled = false;
requestAnimationFrame(gameLoop);
