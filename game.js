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

function isLeft() { return keys['ArrowLeft'] || keys['KeyA']; }
function isRight() { return keys['ArrowRight'] || keys['KeyD']; }
function isJump() { return keys['ArrowUp'] || keys['KeyW'] || keys['Space']; }
function isEnter() { return keys['Enter']; }
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

        // jump (only on press, not hold)
        if (isJump() && !jumpWasPressed && this.isGrounded) {
            this.vy = PLAYER_JUMP;
            this.isGrounded = false;
            playSound('jump');
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
                    this.vy = 0;
                    this.isGrounded = true;
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
            gameState = 'GAME_OVER';
            playSound('gameover');
        } else {
            this.x = this.spawnX;
            this.y = this.spawnY;
            this.vx = 0;
            this.vy = 0;
            this.invincibleTimer = 120; // 2 seconds
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
    constructor(x, y, speed) {
        super(x, y, 30, 36);
        this.speed = speed;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.isAlive = true;
        this.deathTimer = 0;
        this.squishScale = 1;
        this.animFrame = 0;
        this.animTimer = 0;
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
    }
}

// === PARTICLES ===
class Particle {
    constructor(x, y, text) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.timer = 40;
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
        ctx.fillStyle = '#ffff00';
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
let enterWasPressed = false;
let escapeWasPressed = false;
let totalScore = 0;
let highScore = 0;

// === SOUND (Web Audio API) ===
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
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
    }
}

// === LEVEL MANAGEMENT ===
function loadLevel(index) {
    const lvlIndex = index < LEVELS.length ? index : (index % LEVELS.length);
    const lvl = LEVELS[lvlIndex];
    const speedMult = index >= LEVELS.length ? 1 + (index - LEVELS.length) * 0.15 : 1;

    platforms = lvl.platforms.map(p => new Platform(p.x, p.y, p.w, p.h));

    const speed = lvl.marioSpeed * speedMult;
    marios = lvl.marioSpawns.map(s => new Mario(s.x, s.y, speed));

    // Extra Marios for levels beyond 5
    if (index >= LEVELS.length) {
        const extraCount = Math.floor((index - LEVELS.length) / 2);
        for (let i = 0; i < extraCount; i++) {
            const spawn = lvl.marioSpawns[i % lvl.marioSpawns.length];
            marios.push(new Mario(spawn.x + 40, spawn.y, speed * 1.1));
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
}

function startGame() {
    currentLevel = 0;
    totalScore = 0;
    player = null;
    loadLevel(0);
    player.lives = 3;
    player.score = 0;
    gameState = 'PLAYING';
}

// === COLLISION DETECTION ===
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
            player.score += 100;
            totalScore += 100;
            particles.push(new Particle(mario.x, mario.y - 10, '+100'));
            shakeTimer = 6;
            shakeIntensity = 3;
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
function drawBackground() {
    // Sky gradient for 3D depth
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#3060c0');
    skyGrad.addColorStop(0.5, '#5c94fc');
    skyGrad.addColorStop(1, '#88bbff');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Distant mountains (3D depth layer)
    ctx.fillStyle = '#4a6fa0';
    drawMountain(80, 460, 200, 180);
    drawMountain(300, 460, 280, 220);
    drawMountain(580, 460, 250, 190);
    drawMountain(750, 460, 180, 160);

    // Clouds with 3D shadow
    drawCloud3D(100, 60, 60);
    drawCloud3D(350, 90, 45);
    drawCloud3D(600, 50, 55);
    drawCloud3D(750, 110, 35);

    // Hills with 3D shading
    drawHill3D(100, 460, 160, 80, '#3a7c2f', '#2d6025');
    drawHill3D(500, 460, 200, 100, '#3a7c2f', '#2d6025');
    drawHill3D(300, 460, 140, 60, '#4a8c3f', '#3a7c2f');
    drawHill3D(700, 460, 120, 50, '#4a8c3f', '#3a7c2f');
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

    // High score
    if (highScore > 0) {
        ctx.fillStyle = C.textShadow;
        ctx.fillText(`HI: ${highScore}`, W / 2 - 38, 32);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`HI: ${highScore}`, W / 2 - 40, 30);
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

    drawTitle("ENTER — Начать", 400, 18, C.text);
    drawTitle("←→ / AD — Движение  |  ↑ / W / SPACE — Прыжок", 430, 13, '#aaaaaa');
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

// === UPDATE ===
let levelCompleteTimer = 0;

function update() {
    switch (gameState) {
        case 'MENU':
            if (isEnter() && !enterWasPressed) {
                initAudio();
                startGame();
            }
            break;

        case 'PLAYING':
            player.update();
            marios = marios.filter(m => m.update());
            particles = particles.filter(p => p.update());
            checkPlayerMarioCollisions();

            if (shakeTimer > 0) shakeTimer--;

            // Check level complete
            if (marios.filter(m => m.isAlive).length === 0 && marios.length === 0) {
                gameState = 'LEVEL_COMPLETE';
                levelCompleteTimer = 90;
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
                loadLevel(currentLevel);
                gameState = 'PLAYING';
            }
            break;

        case 'GAME_OVER':
            if (isEnter() && !enterWasPressed) {
                if (totalScore > highScore) highScore = totalScore;
                startGame();
            }
            break;

        case 'PAUSED':
            if (isEscape() && !escapeWasPressed) {
                gameState = 'PLAYING';
            }
            break;
    }

    enterWasPressed = isEnter();
    escapeWasPressed = isEscape();
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

        case 'PLAYING':
            drawBackground();
            platforms.forEach(p => p.render());
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

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, W, H);
            drawTitle("ПАУЗА", 230, 40, C.text);
            drawTitle("ESC — Продолжить", 280, 18, '#aaaaaa');
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
