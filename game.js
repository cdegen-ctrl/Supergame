// === MUSHROOM'S REVENGE ===
// A reverse Mario platformer where you play as a mushroom

// === CONSTANTS ===
const canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d', { alpha: false }); // opaque: every frame paints the full background. `let`: renderToBitmap() temporarily points it at an offscreen canvas
const W = 800;
const H = 500;

const GRAVITY = 0.5;
let levelGravityMult = 1.0; // Feature 100: per-level gravity multiplier (1.0 = normal, <1 = low gravity)
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

// === FEATURE 114: GAMEPAD SUPPORT ===
const gamepadKeys = { left: false, right: false, jump: false, throw: false, start: false, down: false };
let gamepadConnected = false;
let gamepadConnectedTimer = 0; // frames to show "gamepad connected" banner

window.addEventListener('gamepadconnected', () => {
    gamepadConnected = true;
    gamepadConnectedTimer = 180; // show banner for 3 seconds
});
window.addEventListener('gamepaddisconnected', () => {
    gamepadConnected = false;
    Object.keys(gamepadKeys).forEach(k => { gamepadKeys[k] = false; });
});

function pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (!gp) return;
    // Axes: 0 = left stick X, 1 = left stick Y
    const axisX = gp.axes[0] || 0;
    const axisY = gp.axes[1] || 0;
    // D-pad buttons: typically 12=up, 13=down, 14=left, 15=right
    const dpadLeft  = (gp.buttons[14] && gp.buttons[14].pressed) || axisX < -0.4;
    const dpadRight = (gp.buttons[15] && gp.buttons[15].pressed) || axisX >  0.4;
    const dpadUp    = (gp.buttons[12] && gp.buttons[12].pressed) || axisY < -0.4;
    // Button mappings: 0=A/Cross (jump), 1=B/Circle (throw), 7=Start/Options (pause/enter), 2=X/Square (throw alt)
    const btnJump  = gp.buttons[0]?.pressed || gp.buttons[2]?.pressed || false;
    const btnThrow = gp.buttons[1]?.pressed || gp.buttons[3]?.pressed || false;
    const btnStart = gp.buttons[7]?.pressed || gp.buttons[9]?.pressed || false;
    const btnSelect= gp.buttons[6]?.pressed || gp.buttons[8]?.pressed || false;

    gamepadKeys.left  = dpadLeft;
    gamepadKeys.right = dpadRight;
    gamepadKeys.jump  = btnJump || dpadUp;
    gamepadKeys.throw = btnThrow;
    gamepadKeys.start = btnStart || btnSelect;
    gamepadKeys.down  = (gp.buttons[13] && gp.buttons[13].pressed) || axisY > 0.4; // Feature 132
}

// === FEATURE 109: KONAMI CODE EASTER EGG ===
const KONAMI_SEQUENCE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','Enter'];
let konamiProgress = 0;
let ultraModeActive = false;
let ultraModeTimer = 0;        // frames remaining (display only)
const ULTRA_MODE_FRAMES = 180; // 3s banner

window.addEventListener('keydown', e => {
    if (e.code === KONAMI_SEQUENCE[konamiProgress]) {
        konamiProgress++;
        if (konamiProgress >= KONAMI_SEQUENCE.length) {
            konamiProgress = 0;
            if (gameState === 'MENU' || gameState === 'PLAYING') {
                activateUltraMode();
            }
        }
    } else {
        konamiProgress = e.code === KONAMI_SEQUENCE[0] ? 1 : 0;
    }
}, true); // capture phase so it runs alongside the main keydown listener

function activateUltraMode() {
    ultraModeActive = true;
    ultraModeTimer = ULTRA_MODE_FRAMES;
    if (gameState === 'PLAYING' && player) {
        player.lives = Math.min(player.lives + 3, 9);
        player.starTimer = 600;        // 10 seconds of star power
        player.giantTimer = 600;       // 10 seconds of giant mode
        player.shieldActive = true;
        shakeTimer = 30; shakeIntensity = 8;
        particles.push(new Particle(W / 2 - 80, H / 2 - 60, '🌟 ULTRA MODE! 🌟', '#ffdd00'));
    }
    playSound('star');
}

// === TOUCH INPUT ===
// Feature 121: multi-touch controls. Every active finger is hit-tested against the buttons on each
// touch event, so sliding a finger from ◀ to ▶ (or holding ▶ + ▲) works like a real gamepad.
const touchKeys = { left: false, right: false, jump: false, throw: false, dash: false, groundPound: false };
const ctrlButtons = Array.from(document.querySelectorAll('#mobile-controls .ctrl-btn'));
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
let renderScale = 1; // backing-store pixels per logical canvas pixel
let lowQuality = false; // Feature 124: set when the device can't keep up

function enableTouchMode() {
    if (document.body.classList.contains('touch')) return;
    document.body.classList.add('touch');
    layoutScreen();
}
if (isTouchDevice) document.body.classList.add('touch');
window.addEventListener('touchstart', enableTouchMode, { passive: true, capture: true });

function updateTouchKeys(touches) {
    const held = { left: false, right: false, jump: false, throw: false, dash: false };
    for (const t of touches) {
        for (const btn of ctrlButtons) {
            const r = btn.getBoundingClientRect();
            const pad = r.width * 0.18; // forgiving hit area around each button
            if (t.clientX >= r.left - pad && t.clientX <= r.right + pad &&
                t.clientY >= r.top - pad && t.clientY <= r.bottom + pad) {
                held[btn.dataset.key] = true;
                break;
            }
        }
    }
    for (const btn of ctrlButtons) btn.classList.toggle('pressed', held[btn.dataset.key]);
    Object.assign(touchKeys, held);
}

const ctrlLayer = document.getElementById('mobile-controls');
for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    ctrlLayer.addEventListener(type, e => {
        e.preventDefault();
        updateTouchKeys(e.touches);
    }, { passive: false });
}

// Feature 132: Swipe-down on canvas → Ground Pound
{
    let _swipeTouchId = null;
    let _swipeStartY = 0;
    canvas.addEventListener('touchstart', e => {
        if (_swipeTouchId === null && e.changedTouches.length) {
            _swipeTouchId = e.changedTouches[0].identifier;
            _swipeStartY = e.changedTouches[0].clientY;
        }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
        for (const t of e.changedTouches) {
            if (t.identifier === _swipeTouchId && t.clientY - _swipeStartY > 45) {
                touchKeys.groundPound = true;
                _swipeTouchId = null; // consume
            }
        }
    }, { passive: true });
    canvas.addEventListener('touchend', () => { _swipeTouchId = null; touchKeys.groundPound = false; }, { passive: true });
    canvas.addEventListener('touchcancel', () => { _swipeTouchId = null; touchKeys.groundPound = false; }, { passive: true });
}

// Fit the 800×500 game into the screen. Portrait: controls get the space under the canvas.
// Landscape: the canvas uses the full height and the buttons sit in the side margins / corners.
function layoutScreen() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const touch = document.body.classList.contains('touch');
    const portrait = vh > vw;
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('landscape', !portrait);

    const border = touch ? 0 : 6;
    const ctrlH = touch && portrait ? Math.min(Math.max(vh * 0.34, 190), 300) : 0;
    const scale = Math.min((vw - border) / W, (vh - border - ctrlH) / H);
    const cw = Math.floor(W * scale);
    const ch = Math.floor(H * scale);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    const dpr = window.devicePixelRatio || 1;
    renderScale = Math.max(1, Math.min(lowQuality ? 1.25 : 2, scale * dpr));
    canvas.width = Math.round(W * renderScale);
    canvas.height = Math.round(H * renderScale);
    ctx.imageSmoothingEnabled = false;

    // Portrait: canvas + control block are centred together as one group
    const bigP = Math.min(vw * 0.22, (vh - ch) * 0.42 * 0.72, 110);
    const blockH = bigP * 3;
    const topPad = touch && portrait ? Math.max(0, (vh - ch - blockH) / 2) : 0;
    const container = document.getElementById('game-container');
    document.body.style.alignItems = touch && portrait ? 'flex-start' : 'center';
    container.style.marginTop = topPad + 'px';

    if (!touch) return;
    const btn = id => document.getElementById(id);
    const place = (el, x, y, size) => {
        el.style.left = Math.round(x - size / 2) + 'px';
        el.style.top = Math.round(y - size / 2) + 'px';
        el.style.width = el.style.height = Math.round(size) + 'px';
        el.style.fontSize = Math.round(size * 0.4) + 'px';
    };
    if (portrait) {
        const areaH = blockH;
        ctrlLayer.style.top = (topPad + ch) + 'px';
        ctrlLayer.style.bottom = 'auto';
        ctrlLayer.style.height = areaH + 'px';
        const big = bigP;
        const small = big * 0.72;
        const cy = areaH * 0.55;
        place(btn('btn-left'), vw * 0.14, cy, big);
        place(btn('btn-right'), vw * 0.14 + big * 1.15, cy, big);
        place(btn('btn-jump'), vw * 0.84, cy + big * 0.15, big * 1.1);
        place(btn('btn-throw'), vw * 0.84 - big * 1.05, cy + big * 0.45, small);
        place(btn('btn-dash'), vw * 0.84 - big * 0.6, cy - big * 0.75, small);
    } else {
        ctrlLayer.style.top = '0px';
        ctrlLayer.style.bottom = '0px';
        ctrlLayer.style.height = vh + 'px';
        const side = (vw - cw) / 2;
        const big = Math.max(56, Math.min(vh * 0.22, 96));
        const small = big * 0.72;
        const by = vh - big * 0.75;
        const lx = Math.max(big * 0.6, side / 2);
        place(btn('btn-left'), lx, by, big);
        place(btn('btn-right'), lx + big * 1.1, by, big);
        const rx = vw - Math.max(big * 0.6, side / 2);
        place(btn('btn-jump'), rx, by, big * 1.1);
        place(btn('btn-throw'), rx - big * 1.1, by + big * 0.1, small);
        place(btn('btn-dash'), rx - big * 0.2, by - big * 1.15, small);
    }
}
window.addEventListener('resize', layoutScreen);
window.addEventListener('orientationchange', () => setTimeout(layoutScreen, 150));
layoutScreen();

// === FEATURE 123: PWA — offline cache, install prompt, fullscreen on phones ===
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; });
const isStandalone = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;

function goFullscreen() {
    if (!document.body.classList.contains('touch') || isStandalone || document.fullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return; // iPhone Safari: no element fullscreen — "add to home screen" gives it instead
    Promise.resolve(req.call(el))
        .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
        .catch(() => {});
}

// === FEATURE 124: haptics + automatic quality on slow phones ===
function haptic(pattern) {
    if (navigator.vibrate && document.body.classList.contains('touch') && !soundMuted) {
        try { navigator.vibrate(pattern); } catch { /* not allowed before a user gesture */ }
    }
}
let frameTimeAvg = 1000 / 60;
let slowFrameCount = 0;
function trackFrameTime(frameMs) {
    if (lowQuality || gameState !== 'PLAYING' || frameMs <= 0 || frameMs > 250) return;
    frameTimeAvg = frameTimeAvg * 0.95 + frameMs * 0.05;
    slowFrameCount = frameTimeAvg > 24 ? slowFrameCount + 1 : 0;
    if (slowFrameCount > 120) { // ~3+ seconds below ~40 fps
        lowQuality = true;
        layoutScreen(); // drops the canvas backing-store resolution
        particles.push(new Particle(W / 2 - 110, 70, '⚙ Эффекты упрощены для плавности', '#aaddff'));
    }
}

// Feature 122: every menu screen registers tappable/clickable buttons while it renders
let uiButtons = [];
function pressKey(k) {
    keys[k] = true;
    setTimeout(() => { keys[k] = false; }, 120);
}
canvas.addEventListener('pointerup', e => {
    initAudio();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvas.clientLeft) * W / canvas.clientWidth;
    const y = (e.clientY - rect.top - canvas.clientTop) * H / canvas.clientHeight;
    for (let i = uiButtons.length - 1; i >= 0; i--) {
        const b = uiButtons[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            b.action();
            return;
        }
    }
});

function isLeft()   { return keys['ArrowLeft']  || keys['KeyA'] || touchKeys.left  || gamepadKeys.left; }
function isRight()  { return keys['ArrowRight'] || keys['KeyD'] || touchKeys.right || gamepadKeys.right; }
function isJump()   { return keys['ArrowUp'] || keys['KeyW'] || keys['Space'] || touchKeys.jump || gamepadKeys.jump; }
function isThrow()  { return keys['KeyZ'] || touchKeys.throw || gamepadKeys.throw; } // Feature 101: Spore throw
function isEnter()  { return keys['Enter'] || gamepadKeys.start; }
function isEscape() { return keys['Escape']; }

// === FEATURE 101: SPORE THROW CONSTANT ===
const SPORE_REGEN_TIME = 480; // 8 seconds per ammo at 60fps
const CONVEYOR_SPEED = 1.6;   // Feature 102: conveyor push velocity

// === UTILITY ===
function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Feature 125: pixel sprites are baked once into a 1-pixel-per-cell bitmap and drawn with a single
// nearest-neighbour drawImage (was one fillRect per pixel — ~150 calls per Mario per frame).
const spriteBitmaps = new WeakMap();
function drawPixelSprite(x, y, pxSize, data) {
    let bmp = spriteBitmaps.get(data);
    if (!bmp) {
        bmp = document.createElement('canvas');
        bmp.width = Math.max(...data.map(row => row.length));
        bmp.height = data.length;
        const g = bmp.getContext('2d');
        for (let r = 0; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
                if (data[r][c]) { g.fillStyle = data[r][c]; g.fillRect(c, r, 1, 1); }
            }
        }
        spriteBitmaps.set(data, bmp);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, x, y, bmp.width * pxSize, bmp.height * pxSize);
}

// Recoloured mushroom sprites are built once per colour pair (they used to be rebuilt every frame)
const mushroomSpriteVariants = new Map();
function getMushroomSprite(cap, capLight) {
    const key = cap + capLight;
    let sprite = mushroomSpriteVariants.get(key);
    if (!sprite) {
        sprite = MUSHROOM_SPRITE.map(row => row.map(cell =>
            cell === C.mushroomCap ? cap : cell === C.mushroomCapLight ? capLight : cell));
        mushroomSpriteVariants.set(key, sprite);
    }
    return sprite;
}

// Render arbitrary existing drawing code into an offscreen bitmap at the current render scale
function renderToBitmap(w, h, drawFn) {
    const bmp = document.createElement('canvas');
    bmp.width = Math.max(1, Math.ceil(w * renderScale));
    bmp.height = Math.max(1, Math.ceil(h * renderScale));
    const saved = ctx;
    ctx = bmp.getContext('2d');
    ctx.scale(renderScale, renderScale);
    try { drawFn(); } finally { ctx = saved; }
    return bmp;
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
    constructor(x, y, w, h, moveAxis, moveRange, moveSpeed, crumble, ice, conveyor, pulse) {
        super(x, y, w, h);
        // Moving platform support
        this.moveAxis = moveAxis || null;   // 'x' | 'y' | null
        this.moveRange = moveRange || 0;
        this.moveSpeed = moveSpeed || 0;
        this.moveOrigin = moveAxis === 'x' ? x : y;
        this.moveDir = 1;
        this._prevX = x;
        this._prevY = y;
        // Feature 66: Crumbling platform
        this.crumble = !!crumble;
        this.crumbleState = 'normal'; // 'normal' | 'shaking' | 'falling' | 'respawning'
        this.crumbleTimer = 0;
        this.crumbleOrigY = y;
        this.crumbleDy = 0;
        // Feature 67: Ice platform
        this.ice = !!ice;
        // Feature 102: Conveyor belt direction (-1=left, 0=none, 1=right)
        this.conveyor = conveyor || 0;
        // Feature 159: Pulsing platform
        this.pulse = !!pulse;
    }

    update() {
        // Feature 66: Crumble state machine
        if (this.crumble) {
            if (this.crumbleState === 'shaking') {
                this.crumbleTimer--;
                if (this.crumbleTimer <= 0) {
                    this.crumbleState = 'falling';
                    this.crumbleTimer = 50;
                    this.crumbleDy = 0;
                }
            } else if (this.crumbleState === 'falling') {
                this.crumbleDy += 0.9;
                this.y += this.crumbleDy;
                this.crumbleTimer--;
                if (this.crumbleTimer <= 0 || this.y > H + 60) {
                    this.crumbleState = 'respawning';
                    this.crumbleTimer = 220;
                    this.y = this.crumbleOrigY;
                    this.crumbleDy = 0;
                }
            } else if (this.crumbleState === 'respawning') {
                this.crumbleTimer--;
                if (this.crumbleTimer <= 0) {
                    this.crumbleState = 'normal';
                    this.y = this.crumbleOrigY;
                }
            }
        }
        if (!this.moveAxis) return;
        this._prevX = this.x;
        this._prevY = this.y;
        if (this.moveAxis === 'x') {
            this.x += this.moveSpeed * this.moveDir;
            if (this.x > this.moveOrigin + this.moveRange) { this.x = this.moveOrigin + this.moveRange; this.moveDir = -1; }
            if (this.x < this.moveOrigin - this.moveRange) { this.x = this.moveOrigin - this.moveRange; this.moveDir = 1; }
        } else {
            this.y += this.moveSpeed * this.moveDir;
            if (this.y > this.moveOrigin + this.moveRange) { this.y = this.moveOrigin + this.moveRange; this.moveDir = -1; }
            if (this.y < this.moveOrigin - this.moveRange) { this.y = this.moveOrigin - this.moveRange; this.moveDir = 1; }
        }
    }

    render() {
        // Feature 66: Don't render while respawning (except Feature 157: blink preview near end)
        if (this.crumble && this.crumbleState === 'respawning') {
            // Feature 157: blink preview during last 40 frames of respawn cooldown
            if (this.crumbleTimer > 40) return;
            const blinkOn = Math.floor(this.crumbleTimer / 6) % 2 === 0;
            if (!blinkOn) return;
            // Fall through to render at low alpha
        }

        // Feature 66: Shake crumbling platform visually
        let shakeX = 0;
        if (this.crumble && this.crumbleState === 'shaking') {
            shakeX = Math.sin(Date.now() * 0.055) * Math.max(1, (65 - this.crumbleTimer) * 0.12);
        }

        ctx.save();
        if (shakeX !== 0) ctx.translate(shakeX, 0);
        // Feature 66: fade out when falling
        if (this.crumble && this.crumbleState === 'falling') {
            ctx.globalAlpha = Math.max(0, this.crumbleTimer / 50);
        }
        // Feature 157: blink preview — show at 40% alpha
        if (this.crumble && this.crumbleState === 'respawning') {
            ctx.globalAlpha = 0.4;
        }

        // Feature 125: the static 3D body (faces + bricks + labels) is baked once into a bitmap
        const padL = 2, padT = Math.ceil(DEPTH_3D * 0.3) + 2;
        const bw = this.w + DEPTH_3D * 0.5 + padL + 3, bh = this.h + DEPTH_3D + padT + 2;
        if (!this._bmp || this._bmpScale !== renderScale) {
            const ox = this.x - padL, oy = this.y - padT;
            this._bmp = renderToBitmap(bw, bh, () => {
                ctx.translate(-ox, -oy);
                this.renderStatic();
            });
            this._bmpScale = renderScale;
        }
        const snap = v => Math.round(v * renderScale) / renderScale;
        ctx.drawImage(this._bmp, snap(this.x - padL), snap(this.y - padT), bw, bh);

        // Feature 159: Pulsing platform glow overlay (live, on top of cached bitmap)
        if (this.pulse) {
            const glow = 0.35 + Math.sin(Date.now() * 0.003) * 0.25;
            ctx.save();
            ctx.globalAlpha = glow;
            ctx.strokeStyle = '#dd88ff';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
            ctx.globalAlpha = glow * 0.45;
            ctx.strokeStyle = '#ff44ff';
            ctx.lineWidth = 7;
            ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
            ctx.restore();
        }

        // Feature 66: Draw cracks on crumbling platforms when shaking
        if (this.crumble && this.crumbleState === 'shaking') {
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1.5;
            const progress = 1 - this.crumbleTimer / 65;
            const crackCount = Math.floor(progress * 5) + 1;
            for (let i = 0; i < crackCount; i++) {
                const cx = this.x + (i + 1) * this.w / (crackCount + 1);
                ctx.beginPath();
                ctx.moveTo(cx, this.y);
                ctx.lineTo(cx + (Math.random() - 0.5) * 6, this.y + this.h * 0.5);
                ctx.lineTo(cx + (Math.random() - 0.5) * 8, this.y + this.h);
                ctx.stroke();
            }
        }

        // Feature 102: Conveyor belt — animated direction strips
        if (this.conveyor) {
            const stripeW = 10;
            const gap = 10;
            const pitch = stripeW + gap;
            const t = Math.floor(Date.now() / 45) * this.conveyor;
            const offset = ((t % pitch) + pitch) % pitch;
            ctx.save();
            ctx.beginPath();
            ctx.rect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
            ctx.clip();
            ctx.globalAlpha = 0.52;
            for (let sx = this.x - pitch + offset; sx < this.x + this.w + pitch; sx += pitch) {
                ctx.fillStyle = this.conveyor > 0 ? '#dd8822' : '#2288dd';
                ctx.fillRect(sx, this.y + 1, stripeW, this.h - 2);
            }
            ctx.globalAlpha = 1;
            ctx.restore();
            // Direction label
            ctx.save();
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = this.conveyor > 0 ? '#ffcc55' : '#55ccff';
            ctx.fillText(this.conveyor > 0 ? '►' : '◄', this.x + this.w / 2, this.y + this.h / 2 + 4);
            ctx.textAlign = 'left';
            ctx.restore();
        }

        ctx.restore();
    }

    renderStatic() {
        const d = DEPTH_3D;
        // Choose colors based on platform type
        const mainColor  = this.pulse ? '#7030a0' : this.ice ? '#88ccee' : this.crumble ? '#8c7060' : C.brick;
        const frontColor = this.pulse ? '#4a1a80' : this.ice ? '#5599bb' : this.crumble ? '#5c4030' : '#1a5c24';
        const rightColor = this.pulse ? '#5525a0' : this.ice ? '#6699cc' : this.crumble ? '#6b4838' : '#1e6b2b';
        const topColor   = this.pulse ? '#9040c0' : this.ice ? '#aaddff' : this.crumble ? '#a08070' : '#3aad4e';
        const lineColor  = this.pulse ? '#4a1080' : this.ice ? '#4488aa' : this.crumble ? '#4a3028' : C.brickLine;
        const edgeColor  = this.pulse ? '#cc77ff' : this.ice ? '#cceeff' : this.crumble ? '#c0a090' : '#5cd670';

        // 3D front face (bottom side)
        ctx.fillStyle = frontColor;
        ctx.fillRect(this.x, this.y + this.h, this.w, d);

        // 3D right face
        ctx.fillStyle = rightColor;
        ctx.beginPath();
        ctx.moveTo(this.x + this.w, this.y);
        ctx.lineTo(this.x + this.w + d * 0.5, this.y - d * 0.3);
        ctx.lineTo(this.x + this.w + d * 0.5, this.y + this.h - d * 0.3);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.closePath();
        ctx.fill();

        // 3D top highlight face (slight perspective)
        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + d * 0.5, this.y - d * 0.3);
        ctx.lineTo(this.x + this.w + d * 0.5, this.y - d * 0.3);
        ctx.lineTo(this.x + this.w, this.y);
        ctx.closePath();
        ctx.fill();

        // Main top face
        ctx.fillStyle = mainColor;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Brick pattern on top face
        const bw = 24; const bh = 12;
        for (let row = 0; row < Math.ceil(this.h / bh); row++) {
            const offset = (row % 2 === 0) ? 0 : bw / 2;
            for (let col = -1; col < Math.ceil(this.w / bw) + 1; col++) {
                const bx = this.x + col * bw + offset;
                const by = this.y + row * bh;
                if (bx + bw > this.x && bx < this.x + this.w) {
                    ctx.strokeStyle = lineColor;
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
                    ctx.strokeStyle = this.ice ? '#336688' : '#145020';
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
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 1);
        ctx.lineTo(this.x + this.w, this.y + 1);
        ctx.stroke();

        // Feature 67: Ice surface sheen
        if (this.ice) {
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(this.x + 4, this.y + 2, this.w * 0.3, 3);
            ctx.fillRect(this.x + this.w * 0.6, this.y + 2, this.w * 0.2, 2);
            ctx.globalAlpha = 1;
            // Snowflake label
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(200,240,255,0.8)';
            ctx.fillText('❄', this.x + this.w / 2, this.y + this.h / 2 + 4);
        }

        // Feature 159: Pulse platform indicator
        if (this.pulse) {
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(220,180,255,0.85)';
            ctx.fillText('✦', this.x + this.w / 2, this.y + this.h / 2 + 4);
        }

        // Moving platform indicator (glowing arrows)
        if (this.moveAxis) {
            ctx.globalAlpha = 0.75;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffee55';
            const label = this.moveAxis === 'x' ? '↔' : '↕';
            ctx.fillText(label, this.x + this.w / 2, this.y + this.h / 2 + 4);
        }

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
        // Double jump
        this.jumpCount = 0;
        this.canDoubleJump = false;
        this.doubleJumpFlash = 0;
        // Feature 131: Triple jump
        this.canTripleJump = false;
        this.tripleJumpFlash = 0;
        // Feature 132: Ground Pound
        this.groundPounding = false;
        this.downWasFree = true;
        // Star power-up
        this.starTimer = 0;
        // Shield power-up
        this.shieldActive = false;
        this.shieldBreakTimer = 0;
        // Speed boost power-up
        this.speedBoostTimer = 0;
        // Magnet power-up
        this.magnetTimer = 0;
        // Freeze power-up (global freeze timer)
        this.freezeTimer = 0;
        // Ghost power-up (Feature 54)
        this.ghostTimer = 0;
        // Score boost power-up (Feature 61)
        this.scoreBoostTimer = 0;
        // Electro power-up (Feature 72)
        this.electroTimer = 0;
        // Slow-Mo power-up (Feature 75)
        this.slowMoTimer = 0;
        // Rocket power-up (Feature 80)
        this.rocketTimer = 0;
        // Feature 85: MagBoots power-up
        this.magBootsTimer = 0;
        this.ceilingLocked = false;
        // Feature 87: Giant Mode power-up
        this.giantTimer = 0;
        this.ceilingLockPlatform = null;
        // Feature 99: Jetpack power-up
        this.jetpackTimer = 0;
        this.jetpackThrust = false;
        this.ceilingLockTimer = 0;
        // Wall jump
        this.wallSlideDir = 0;      // -1 = left wall, 0 = none, 1 = right wall
        this.wallJumpLockTimer = 0; // prevents re-triggering wall jump
        // Checkpoint respawn
        this.checkpointSpawn = null;
        // Feature 65: Dash ability
        this.dashTimer = 0;        // active dash frames remaining
        this.dashCooldown = 0;     // cooldown frames (90 = 1.5s)
        this.dashDir = 1;          // direction of last dash
        this.lastLeftTap = -999;
        this.lastRightTap = -999;
        this.leftWasDown = false;
        this.rightWasDown = false;
        this.shiftWasDown = false;
        // Feature 67: Ice platform tracking
        this.isOnIce = false;
        // Feature 101: Spore Throw
        this.sporeAmmo = 3;
        this.sporeAmmoTimer = 0;
        this.throwWasDown = false;
        // Feature 102: Conveyor belt push (set each frame in resolveCollisionsY)
        this.conveyorPush = 0;
        // Feature 104: Parachute Glide
        this.parachuting = false;
        // Feature 105: Flashlight power-up timer
        this.flashlightTimer = 0;
        // Feature 145: Bubble Shield power-up timer
        this.bubbleTimer = 0;
        // Feature 148: Jump Boost power-up timer
        this.jumpBoostTimer = 0;
        // Feature 171: Reflect Shield timer
        this.reflectTimer = 0;
        // Feature 173: Earthquake Stomp timer
        this.quakeTimer = 0;
        // Feature 149: Magma Floor damage cooldown
        this.magmaDmgTimer = 0;
        // Feature 144: Roll Dodge
        this.rollTimer = 0;       // active roll frames (0 = not rolling)
        this.rollCooldown = 0;    // cooldown frames until next roll is allowed
        this.rollDir = 1;         // direction of roll
        // Feature 161: Companion Drone
        this.droneTimer = 0;
        this.droneShootCooldown = 0;
        this.spikeBootsTimer = 0;   // Feature 163: spike boots chain stomp
        this.spikeBootsChains = 0;  // Feature 163: chains used this stomp
        this.vortexCoinTimer = 0;   // Feature 169: Vortex Coin — all coins pulled in
    }

    update() {
        // Wall jump lock countdown
        if (this.wallJumpLockTimer > 0) this.wallJumpLockTimer--;

        // horizontal movement
        const currentSpeed = this.speedBoostTimer > 0 ? PLAYER_SPEED * 2 : PLAYER_SPEED;
        const leftDown  = isLeft();
        const rightDown = isRight();
        const shiftDown = !!(keys['ShiftLeft'] || keys['ShiftRight'] || touchKeys.dash);

        // Feature 65: Dash — double-tap direction or Shift key
        if (leftDown && !this.leftWasDown) {
            if (levelTimer - this.lastLeftTap < 16 && this.dashCooldown <= 0) {
                this.dashTimer = 11; this.dashDir = -1; this.dashCooldown = 90;
                this.invincibleTimer = Math.max(this.invincibleTimer, 12);
                this.scaleX = 0.6; this.scaleY = 1.2;
                dashShadows.push(new DashShadow(this.x, this.y, this.w, this.h, this.facingRight)); // Feature 152
                playSound('dash');
            }
            this.lastLeftTap = levelTimer;
        }
        if (rightDown && !this.rightWasDown) {
            if (levelTimer - this.lastRightTap < 16 && this.dashCooldown <= 0) {
                this.dashTimer = 11; this.dashDir = 1; this.dashCooldown = 90;
                this.invincibleTimer = Math.max(this.invincibleTimer, 12);
                this.scaleX = 0.6; this.scaleY = 1.2;
                dashShadows.push(new DashShadow(this.x, this.y, this.w, this.h, this.facingRight)); // Feature 152
                playSound('dash');
            }
            this.lastRightTap = levelTimer;
        }
        if (shiftDown && !this.shiftWasDown && this.dashCooldown <= 0) {
            this.dashTimer = 11; this.dashDir = this.facingRight ? 1 : -1;
            this.dashCooldown = 90;
            this.invincibleTimer = Math.max(this.invincibleTimer, 12);
            this.scaleX = 0.6; this.scaleY = 1.2;
            dashShadows.push(new DashShadow(this.x, this.y, this.w, this.h, this.facingRight)); // Feature 152
            playSound('dash');
        }
        this.leftWasDown  = leftDown;
        this.rightWasDown = rightDown;
        this.shiftWasDown = shiftDown;
        if (this.dashCooldown > 0) this.dashCooldown--;

        if (this.dashTimer > 0) {
            // Active dash: override movement
            this.dashTimer--;
            this.vx = this.dashDir * currentSpeed * 2.5;
            this.facingRight = this.dashDir > 0;
            // Cyan afterimage during dash
            if (this.dashTimer % 2 === 0) {
                afterimages.push({ x: this.x, y: this.y, scaleX: this.scaleX, scaleY: this.scaleY, facingRight: this.facingRight, alpha: 0.5, dashTint: true });
                if (afterimages.length > 9) afterimages.shift();
            }
        } else if (this.isOnIce && this.isGrounded) {
            // Feature 67: Ice platform — gradual acceleration / slow deceleration
            if (leftDown)       { this.vx = Math.max(this.vx - 0.45, -currentSpeed); this.facingRight = false; }
            else if (rightDown) { this.vx = Math.min(this.vx + 0.45,  currentSpeed); this.facingRight = true; }
            else                { this.vx *= 0.93; if (Math.abs(this.vx) < 0.08) this.vx = 0; }
        } else {
            if (leftDown)       { this.vx = -currentSpeed; this.facingRight = false; }
            else if (rightDown) { this.vx =  currentSpeed; this.facingRight = true; }
            else                { this.vx = 0; }
            // Feature 102: Conveyor belt push (additive, from previous frame's resolveCollisionsY)
            if (this.isGrounded && this.conveyorPush !== 0) {
                this.vx += this.conveyorPush;
                this.vx = Math.max(-currentSpeed * 1.8, Math.min(currentSpeed * 1.8, this.vx));
            }
        }

        // Feature 144: Roll Dodge — press DOWN + direction while grounded
        if (this.rollCooldown > 0) this.rollCooldown--;
        if (this.rollTimer > 0) {
            this.rollTimer--;
            // During roll: override vx and give brief invincibility
            this.vx = this.rollDir * PLAYER_SPEED * 2.2;
            this.invincibleTimer = Math.max(this.invincibleTimer, 1); // stay invincible during roll
            this.scaleX = 1.6; this.scaleY = 0.55; // squished roll shape
        } else {
            // Check for roll trigger: grounded, moving, press DOWN key (not already dashing/jumping/gound-pounding)
            const downNowRoll = !!(keys['ArrowDown'] || keys['KeyS'] || gamepadKeys.down);
            if (this.isGrounded && downNowRoll && !this._downWasForRoll && this.rollCooldown <= 0
                    && this.dashTimer <= 0 && !this.groundPounding && (leftDown || rightDown)) {
                this.rollTimer = 16;  // 0.27s roll
                this.rollDir = rightDown ? 1 : -1;
                this.rollCooldown = 180; // 3s cooldown
                this.invincibleTimer = Math.max(this.invincibleTimer, 16);
                spawnJumpSmoke(this.x + this.w / 2, this.y + this.h, false);
                particles.push(new Particle(this.x + this.w / 2, this.y - 8, '💨 КУВЫРОК!', '#88ddff'));
                playSound('dash');
            }
            this._downWasForRoll = downNowRoll;
        }

        // Feature 141: Wind force — push player horizontally (stronger in air)
        if (windActive && windForce !== 0 && this.dashTimer <= 0) {
            const windMult = this.isGrounded ? 0.035 : 0.06;
            const maxWind = currentSpeed * 1.6;
            this.vx = Math.max(-maxWind, Math.min(maxWind, this.vx + windForce * windMult));
        }

        // Feature 101: Spore Throw ammo regen + throw action
        if (this.sporeAmmoTimer > 0) this.sporeAmmoTimer--;
        if (this.sporeAmmoTimer <= 0 && this.sporeAmmo < 3) {
            this.sporeAmmo++;
            this.sporeAmmoTimer = this.sporeAmmo < 3 ? SPORE_REGEN_TIME : 0;
        }
        const throwDown = isThrow();
        if (throwDown && !this.throwWasDown && this.sporeAmmo > 0) {
            this.sporeAmmo--;
            this.sporeAmmoTimer = SPORE_REGEN_TIME;
            const dir = this.facingRight ? 1 : -1;
            spores.push(new Spore(this.x + (dir > 0 ? this.w - 2 : -8), this.y + this.h * 0.35, dir));
            playSound('coin');
        }
        this.throwWasDown = throwDown;

        // Feature 105: Flashlight timer countdown
        if (this.flashlightTimer > 0) this.flashlightTimer--;

        // jump (only on press, not hold) — supports double jump + wall jump + ceiling detach
        if (isJump() && !jumpWasPressed) {
            if (this.ceilingLocked) {
                // Feature 85: Detach from ceiling — dive down to stomp enemies!
                this.ceilingLocked = false;
                this.ceilingLockPlatform = null;
                this.vy = -PLAYER_JUMP * 0.75; // fast downward (PLAYER_JUMP is negative)
                this.isGrounded = false;
                this.jumpCount = 1;
                this.canDoubleJump = false;
                this.scaleX = 0.7; this.scaleY = 1.3;
                playSound('jump');
            } else if (this.isGrounded) {
                this.vy = PLAYER_JUMP * (this.jumpBoostTimer > 0 ? 1.6 : 1.0);
                this.isGrounded = false;
                this.jumpCount = 1;
                this.canDoubleJump = true;
                this.scaleX = 0.75;
                this.scaleY = 1.3;
                playSound('jump');
                // Feature 52: smoke puff on ground jump
                spawnJumpSmoke(this.x + this.w / 2, this.y + this.h);
            } else if (this.canDoubleJump) {
                this.vy = PLAYER_JUMP * 0.85 * (this.jumpBoostTimer > 0 ? 1.6 : 1.0);
                this.canDoubleJump = false;
                this.jumpCount = 2;
                this.doubleJumpFlash = 12;
                this.canTripleJump = true; // Feature 131
                this.scaleX = 0.7;
                this.scaleY = 1.35;
                playSound('jump');
                // Feature 52: bigger smoke puff on double jump
                spawnJumpSmoke(this.x + this.w / 2, this.y + this.h, true);
            } else if (this.canTripleJump) {
                // Feature 131: Triple Jump — rainbow burst, slightly weaker than double
                this.vy = PLAYER_JUMP * 0.7 * (this.jumpBoostTimer > 0 ? 1.6 : 1.0);
                this.canTripleJump = false;
                this.jumpCount = 3;
                this.tripleJumpFlash = 20;
                this.scaleX = 0.8;
                this.scaleY = 1.2;
                playSound('star');
                spawnJumpSmoke(this.x + this.w / 2, this.y + this.h, true);
                const rainbowColors = ['#ff4444','#ff8800','#ffff00','#44ff44','#4488ff','#cc44ff'];
                for (let _i = 0; _i < 10; _i++) {
                    const _ang = (_i / 10) * Math.PI * 2;
                    const _spd = 2.5 + Math.random() * 2;
                    particles.push(new DeathParticle(
                        this.x + this.w / 2, this.y + this.h / 2,
                        Math.cos(_ang) * _spd, Math.sin(_ang) * _spd - 1,
                        rainbowColors[_i % rainbowColors.length], 4 + Math.floor(Math.random() * 3)
                    ));
                }
            } else if (this.wallSlideDir !== 0 && this.wallJumpLockTimer <= 0) {
                // Wall jump! Launch away from wall
                this.vy = PLAYER_JUMP * 0.9 * (this.jumpBoostTimer > 0 ? 1.6 : 1.0);
                this.vx = -this.wallSlideDir * currentSpeed * 3.5;
                this.facingRight = this.wallSlideDir < 0;
                this.canDoubleJump = true;
                this.jumpCount = 1;
                this.wallJumpLockTimer = 18;
                this.doubleJumpFlash = 15;
                this.scaleX = 0.7;
                this.scaleY = 1.35;
                playSound('jump');
            }
        }
        jumpWasPressed = isJump();

        // Feature 132: Ground Pound — press DOWN while in air to slam down fast
        {
            const downNow = !!(keys['ArrowDown'] || keys['KeyS'] || gamepadKeys.down || touchKeys.groundPound);
            if (!this.isGrounded && !this.groundPounding && downNow && this.downWasFree
                    && this.vy > -3 && this.jetpackTimer <= 0 && !this.ceilingLocked && !this.rocketTimer) {
                this.groundPounding = true;
                this.parachuting = false;
                this.vy = 16;
                this.vx *= 0.3;
                this.scaleX = 0.8; this.scaleY = 1.4;
                spawnJumpSmoke(this.x + this.w / 2, this.y + this.h, false);
            }
            this.downWasFree = !downNow;
            if (this.isGrounded) this.groundPounding = false;
        }

        // gravity (Feature 100: space level uses reduced gravity)
        // Feature 145: Bubble Shield — slight upward float (reduced gravity while active)
        const gravMult = (this.bubbleTimer > 0 && !this.isGrounded) ? 0.65 : 1.0;
        this.vy += GRAVITY * levelGravityMult * gravMult;
        // Feature 132: ground pound overrides MAX_FALL cap — falls much faster
        const effectiveMaxFall = this.groundPounding ? 22 : MAX_FALL * levelGravityMult;
        if (this.vy > effectiveMaxFall) this.vy = effectiveMaxFall;
        if (this.groundPounding && this.vy < 16) this.vy = 16; // ensure minimum slam speed

        // Feature 104: Parachute Glide — hold DOWN while falling to slow descent
        // Touch/gamepad: keep holding jump after the double jump to glide
        const holdGlide = (touchKeys.jump || gamepadKeys.jump) && this.jumpCount >= 2 && !this.canDoubleJump;
        const downHeld = !!(keys['ArrowDown'] || keys['KeyS'] || holdGlide);
        if (!this.isGrounded && this.vy > 1.5 && downHeld && this.jetpackTimer <= 0 && !this.ceilingLocked && !this.groundPounding) {
            this.parachuting = true;
            this.vy = Math.min(this.vy, 1.8);
        } else {
            this.parachuting = false;
        }

        // Feature 99: Jetpack thrust — hold jump to fly up
        if (this.jetpackTimer > 0) {
            this.jetpackTimer--;
            if (isJump() && !this.isGrounded) {
                this.vy = Math.max(this.vy - 2.2, -9); // upward thrust
                this.jetpackThrust = true;
            } else {
                this.jetpackThrust = false;
            }
        } else {
            this.jetpackThrust = false;
        }

        // Feature 85: Ceiling lock — override gravity, hold player to platform underside
        if (this.ceilingLocked) {
            this.vy = 0;
            this.ceilingLockTimer--;
            if (this.ceilingLockTimer <= 0) {
                this.ceilingLocked = false;
                this.ceilingLockPlatform = null;
                this.vy = 2;
            } else if (this.ceilingLockPlatform) {
                this.y = this.ceilingLockPlatform.y + this.ceilingLockPlatform.h;
            }
        }

        // Wall slide: slow down fall when pressing against a wall in air
        if (this.wallSlideDir !== 0 && !this.isGrounded && this.vy > 1.5) {
            this.vy = 1.5 + (this.vy - 1.5) * 0.18; // damp fall speed
        }

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
        const _prevGrounded = this.isGrounded;
        this.isGrounded = false;
        this.y += this.vy;
        this.resolveCollisionsY();
        if (this.quakeTimer > 0 && !_prevGrounded && this.isGrounded) triggerQuake(this.x + this.w / 2, this.y + this.h); // Feature 173

        // clamp to canvas
        if (this.x < 0) this.x = 0;
        if (this.x + this.w > W) this.x = W - this.w;

        // fall off screen
        if (this.y > H + 50) {
            this.die();
        }

        // invincibility
        if (this.invincibleTimer > 0) this.invincibleTimer--;
        // star power-up timer
        if (this.starTimer > 0) this.starTimer--;
        // speed boost timer
        if (this.speedBoostTimer > 0) this.speedBoostTimer--;
        // Feature 53: afterimage trail when speed boost active
        if (this.speedBoostTimer > 0 && this.animTimer % 3 === 0) {
            afterimages.push({ x: this.x, y: this.y, scaleX: this.scaleX, scaleY: this.scaleY, facingRight: this.facingRight, alpha: 0.45 });
            if (afterimages.length > 7) afterimages.shift();
        } else if (this.speedBoostTimer <= 0 && afterimages.length > 0) {
            afterimages = [];
        }
        // magnet timer
        if (this.magnetTimer > 0) this.magnetTimer--;
        // ghost timer (Feature 54)
        if (this.ghostTimer > 0) this.ghostTimer--;
        // score boost timer (Feature 61)
        if (this.scoreBoostTimer > 0) this.scoreBoostTimer--;
        // electro timer (Feature 72)
        if (this.electroTimer > 0) this.electroTimer--;
        // slow-mo timer (Feature 75)
        if (this.slowMoTimer > 0) this.slowMoTimer--;
        // rocket timer (Feature 80)
        if (this.rocketTimer > 0) {
            this.rocketTimer--;
            // Keep pushing upward during rocket flight
            if (this.vy > -12) this.vy -= 1.5;
        }
        // Feature 85: MagBoots timer — release ceiling lock when boots expire
        if (this.magBootsTimer > 0) {
            this.magBootsTimer--;
            if (this.magBootsTimer <= 0 && this.ceilingLocked) {
                this.ceilingLocked = false;
                this.ceilingLockPlatform = null;
                this.vy = 2;
            }
        }
        // Feature 87: Giant Mode timer
        if (this.giantTimer > 0) this.giantTimer--;
        // freeze timer
        if (this.freezeTimer > 0) this.freezeTimer--;
        // shield break animation timer
        if (this.shieldBreakTimer > 0) this.shieldBreakTimer--;
        // Feature 145: Bubble Shield timer
        if (this.bubbleTimer > 0) this.bubbleTimer--;
        // Feature 148: Jump Boost timer
        if (this.jumpBoostTimer > 0) this.jumpBoostTimer--;
        if (this.spikeBootsTimer > 0) this.spikeBootsTimer--; // Feature 163
        if (this.reflectTimer > 0) this.reflectTimer--; // Feature 171
        if (this.quakeTimer > 0) this.quakeTimer--;     // Feature 173
        if (this.vortexCoinTimer > 0) this.vortexCoinTimer--; // Feature 169
        // Feature 149: Magma Floor — damage player when near bottom on volcano levels
        if (this.magmaDmgTimer > 0) this.magmaDmgTimer--;
        if (LEVELS[currentLevel] && LEVELS[currentLevel].isVolcano && this.y + this.h >= 462
                && this.invincibleTimer <= 0 && this.starTimer <= 0) {
            if (this.magmaDmgTimer <= 0) {
                this.magmaDmgTimer = 90; // 1.5s cooldown
                this.die();
                particles.push(new Particle(this.x, this.y - 10, '🔥 МАГМА!', '#ff6600'));
                shakeTimer = 10;
                shakeIntensity = 6;
            }
        }

        // Wall slide dust particles
        if (this.wallSlideDir !== 0 && !this.isGrounded && this.vy > 0.5) {
            if (Math.random() < 0.18) {
                const px = this.wallSlideDir > 0 ? this.x + this.w + 1 : this.x - 3;
                const py = this.y + this.h * 0.5 + Math.random() * this.h * 0.35;
                particles.push(new DeathParticle(px, py,
                    -this.wallSlideDir * (0.8 + Math.random()), this.vy * 0.2,
                    '#ddddcc', 2));
            }
        }

        // Smooth squash/stretch recovery
        this.scaleX += (1 - this.scaleX) * 0.22;
        this.scaleY += (1 - this.scaleY) * 0.22;
        // Stretch in air (falling fast)
        if (!this.isGrounded && this.vy > 3) {
            const stretch = Math.min(this.vy / MAX_FALL, 1) * 0.2;
            this.scaleX = Math.min(this.scaleX, 1 - stretch * 0.5);
            this.scaleY = Math.max(this.scaleY, 1 + stretch);
        }
        // Double jump flash timer
        if (this.doubleJumpFlash > 0) this.doubleJumpFlash--;
        // Feature 131: Triple jump flash timer
        if (this.tripleJumpFlash > 0) this.tripleJumpFlash--;
        // Feature 150: Coin Trail — golden sparkles when moving fast
        const speedMag = Math.abs(this.vx);
        if (speedMag > 4 && Math.random() < (speedMag - 4) * 0.06) {
            const hue = 40 + Math.random() * 20;
            particles.push(new DeathParticle(
                this.x + this.w * 0.5 + (Math.random() - 0.5) * 8,
                this.y + this.h * 0.7 + (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 0.6, -Math.random() * 0.8 - 0.2,
                `hsl(${hue}, 100%, 65%)`, 2
            ));
        }
    }

    resolveCollisionsX() {
        this.wallSlideDir = 0; // reset each frame
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vx > 0) {
                    this.x = p.x - this.w;
                    if (!this.isGrounded) this.wallSlideDir = 1;  // touching right wall
                } else if (this.vx < 0) {
                    this.x = p.x + p.w;
                    if (!this.isGrounded) this.wallSlideDir = -1; // touching left wall
                }
                this.vx = 0;
            }
        }
        // During wall jump lock, suppress wallSlideDir to prevent re-triggering
        if (this.wallJumpLockTimer > 0) this.wallSlideDir = 0;
    }

    resolveCollisionsY() {
        this.isOnIce = false;    // reset; set below if landing on ice platform
        this.conveyorPush = 0;   // Feature 102: reset; set below if on conveyor
        for (const p of platforms) {
            // Feature 66: skip falling/respawning crumble platforms
            if (p.crumble && (p.crumbleState === 'falling' || p.crumbleState === 'respawning')) continue;
            if (aabb(this, p)) {
                if (this.vy > 0) {
                    this.y = p.y - this.h;
                    // Squash on hard landing
                    if (this.vy > 4) {
                        this.scaleX = 1.3;
                        this.scaleY = 0.7;
                        // Feature 158: screen shake on very hard landing
                        if (this.vy > 8) {
                            const impactStr = Math.min((this.vy - 8) * 0.6, 5);
                            shakeTimer = Math.max(shakeTimer, Math.round(impactStr * 2));
                            shakeIntensity = Math.max(shakeIntensity, impactStr);
                        }
                    }
                    this.vy = 0;
                    this.isGrounded = true;
                    this.jumpCount = 0;
                    this.canDoubleJump = false;
                    this.canTripleJump = false; // Feature 131
                    this.spikeBootsChains = 0;  // Feature 163: reset chain count on landing
                    if (this.groundPounding) { // Feature 132: ground pound impact
                        this.groundPounding = false;
                        groundPoundEffect(this.x + this.w / 2, this.y + this.h);
                    }
                    if (comboCount > 0) { comboCount = 0; coinFrenzyActivated = false; } // Feature 73: reset frenzy flag
                    // Feature 66: start crumble timer when player lands
                    if (p.crumble && p.crumbleState === 'normal') {
                        p.crumbleState = 'shaking';
                        p.crumbleTimer = 65;
                    }
                    // Feature 67: detect ice platform
                    if (p.ice) this.isOnIce = true;
                    // Feature 102: detect conveyor belt
                    if (p.conveyor) this.conveyorPush = p.conveyor * CONVEYOR_SPEED;
                } else if (this.vy < 0) {
                    this.y = p.y + p.h;
                    this.vy = 0;
                    // Feature 85: MagBoots — stick to ceiling on upward hit
                    if (this.magBootsTimer > 0 && !this.ceilingLocked) {
                        this.ceilingLocked = true;
                        this.ceilingLockPlatform = p;
                        this.ceilingLockTimer = 90; // 1.5 seconds
                        this.isGrounded = false;
                        this.canDoubleJump = false;
                    }
                }
            }
        }
    }

    die() {
        this.lives--;
        haptic(this.lives <= 0 ? [80, 60, 160] : [60, 40, 60]); // Feature 124
        levelDeathCount++;  // Feature 59: track per-level deaths
        runStats.deaths++;  // Feature 63: track total deaths this run
        // Feature 83: reset kill streak on damage
        killStreakCount = 0;
        killStreakTimer = 0;
        deathFlashTimer = 35;
        shakeTimer = 20;
        shakeIntensity = 10;
        bulletTimeTimer = BULLET_TIME_DURATION; // Feature 139
        if (this.lives <= 0) {
            if (totalScore > highScore) {
                highScore = totalScore;
                localStorage.setItem('mushroomHighScore', String(highScore));
            }
            // Feature 68: save survival best time
            if (survivalMode) {
                const survivedSecs = Math.floor(survivalTimer / 60);
                if (survivedSecs > survivalBestTime) {
                    survivalBestTime = survivedSecs;
                    localStorage.setItem('mushroomSurvivalBest', String(survivalBestTime));
                }
                survivalMode = false;
            }
            submitScore(totalScore);
            gameState = 'GAME_OVER';
            playSound('gameover');
        } else {
            // Respawn at checkpoint if activated, otherwise level start
            const rx = this.checkpointSpawn ? this.checkpointSpawn.x : this.spawnX;
            const ry = this.checkpointSpawn ? this.checkpointSpawn.y : this.spawnY;
            this.x = rx;
            this.y = ry;
            this.vx = 0;
            this.vy = 0;
            this.invincibleTimer = 120; // 2 seconds
            this.portalLock = true; // Feature 119: don't get teleported straight off the respawn point
            comboCount = 0;
            comboDisplayTimer = 0;
            coinFrenzyActivated = false; // Feature 73
            this.bubbleTimer = 0; // Feature 145: lose bubble on death
            this.jumpBoostTimer = 0; // Feature 148: lose jump boost on death
            this.droneTimer = 0; // Feature 161: lose drone on death
            this.spikeBootsTimer = 0; // Feature 163: lose spike boots on death
            this.reflectTimer = 0; // Feature 171: lose reflect shield on death
            this.quakeTimer = 0;   // Feature 173: lose quake stomp on death
            this.vortexCoinTimer = 0; // Feature 169: lose vortex on death
            playSound('hurt');
        }
    }

    render() {
        // Feature 135: Drop shadow — project an ellipse onto the surface below the player
        if (!this.isGrounded) {
            let shadowY = H; // default to bottom of screen
            const cx = this.x + this.w / 2;
            for (const p of platforms) {
                if (cx >= p.x && cx <= p.x + p.w && p.y > this.y + this.h && p.y < shadowY) {
                    shadowY = p.y;
                }
            }
            const dist = shadowY - (this.y + this.h);
            if (dist < 260) {
                const opacity = Math.max(0, 0.35 * (1 - dist / 260));
                const rx = Math.max(4, (this.w * 0.45) * (1 - dist / 500));
                const ry = Math.max(2, rx * 0.35);
                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.ellipse(cx, shadowY - 1, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // blink when invincible
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 4) % 2 === 0) return;

        // Star power rainbow aura
        if (this.starTimer > 0) {
            const hue = (this.starTimer * 6) % 360;
            const alpha = this.starTimer < 120 ? (this.starTimer / 120) * 0.8 : 0.8;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = `hsl(${hue}, 100%, 65%)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w * 0.7, this.h * 0.7, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Feature 155: Kill Aura — pulsing ring when kill streak >= 5
        if (killStreakCount >= 5) {
            const t = Date.now() * 0.008;
            const pulse = 0.6 + Math.abs(Math.sin(t)) * 0.4;
            const color = killStreakCount >= 8 ? '#ffd700' : '#ff4400';
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = pulse * 0.7;
            ctx.beginPath();
            ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2,
                        this.w * 0.85 + Math.sin(t * 1.7) * 3,
                        this.h * 0.85 + Math.sin(t * 2.1) * 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2,
                        this.w * 0.6 + Math.sin(t * 2.3) * 2,
                        this.h * 0.6 + Math.sin(t * 1.9) * 1, 0, 0, Math.PI * 2);
            ctx.globalAlpha = pulse * 0.3;
            ctx.fill();
            ctx.restore();
        }

        // Feature 169: Vortex aura — cyan spiral ring when vortex coin is active
        if (this.vortexCoinTimer > 0) {
            const t = Date.now() * 0.010;
            const frac = this.vortexCoinTimer / VORTEX_COIN_DURATION;
            const pulse = 0.5 + Math.abs(Math.sin(t)) * 0.5;
            ctx.save();
            for (let i = 0; i < 4; i++) {
                const a = t + (Math.PI * 2 / 4) * i;
                ctx.beginPath();
                ctx.arc(this.x + this.w / 2, this.y + this.h / 2,
                    (this.w * 0.75 + Math.sin(t * 1.5 + i) * 4),
                    a, a + Math.PI * 0.55);
                ctx.strokeStyle = `rgba(0, 230, 255, ${pulse * frac})`;
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
            ctx.restore();
        }

        // Shield glow
        if (this.shieldActive) {
            const pulse = 0.85 + Math.sin(Date.now() * 0.006) * 0.15;
            ctx.save();
            ctx.strokeStyle = `rgba(80, 140, 255, ${0.7 * pulse})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w * 0.65 * pulse, this.h * 0.65 * pulse, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        // Shield break flash
        if (this.shieldBreakTimer > 0) {
            const alpha = this.shieldBreakTimer / 20;
            const r = (1 - alpha) * 40 + 16;
            ctx.save();
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = '#4488ff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x + this.w / 2, this.y + this.h / 2, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Wall slide glow (vertical strip on wall side)
        if (this.wallSlideDir !== 0 && !this.isGrounded && this.vy > 0) {
            ctx.save();
            ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.015) * 0.15;
            const glowX = this.wallSlideDir > 0 ? this.x + this.w - 3 : this.x;
            ctx.fillStyle = '#ffdd55';
            ctx.fillRect(glowX, this.y + 4, 3, this.h - 8);
            ctx.restore();
        }

        // Double jump ring flash
        if (this.doubleJumpFlash > 0) {
            const alpha = this.doubleJumpFlash / 12;
            const r = (1 - alpha) * 28 + 16;
            ctx.save();
            ctx.globalAlpha = alpha * 0.7;
            ctx.strokeStyle = '#88ddff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x + this.w / 2, this.y + this.h / 2, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Feature 131: Triple jump rainbow ring flash
        if (this.tripleJumpFlash > 0) {
            const alpha = this.tripleJumpFlash / 20;
            const r = (1 - alpha) * 36 + 14;
            const rainbowCols = ['#ff4444','#ff8800','#ffee00','#44ff44','#4488ff','#cc44ff'];
            const col = rainbowCols[Math.floor(levelTimer * 0.3) % rainbowCols.length];
            ctx.save();
            ctx.globalAlpha = alpha * 0.85;
            ctx.strokeStyle = col;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x + this.w / 2, this.y + this.h / 2, r, 0, Math.PI * 2);
            ctx.stroke();
            // Second inner ring
            ctx.globalAlpha = alpha * 0.5;
            ctx.beginPath();
            ctx.arc(this.x + this.w / 2, this.y + this.h / 2, r * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Feature 132: Ground pound visual indicator — red glow while pounding
        if (this.groundPounding) {
            ctx.save();
            ctx.globalAlpha = 0.55 + Math.sin(levelTimer * 0.5) * 0.2;
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x + this.w / 2, this.y + this.h / 2, 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Feature 72: Electro aura — rotating electric field around player
        if (this.electroTimer > 0) {
            const ecx = this.x + this.w / 2;
            const ecy = this.y + this.h / 2;
            const t = this.electroTimer;
            const pulse = 0.85 + Math.sin(t * 0.12) * 0.15;
            ctx.save();
            // Outer ring glow
            ctx.beginPath();
            ctx.arc(ecx, ecy, ELECTRO_RADIUS * pulse * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 60, ${0.18 * pulse})`;
            ctx.lineWidth = 8;
            ctx.stroke();
            // Inner field ring
            ctx.beginPath();
            ctx.arc(ecx, ecy, ELECTRO_RADIUS * 0.4 * pulse, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(50, 220, 255, ${0.55 * pulse})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            // Rotating sparks
            ctx.strokeStyle = '#ffff44';
            ctx.lineWidth = 1.5;
            const elapsed = ELECTRO_DURATION - t;
            for (let i = 0; i < 8; i++) {
                const ang = (elapsed * 0.08) + (Math.PI / 4) * i;
                const r1 = ELECTRO_RADIUS * 0.38 * pulse;
                const r2 = r1 + 8;
                ctx.beginPath();
                ctx.moveTo(ecx + Math.cos(ang) * r1, ecy + Math.sin(ang) * r1);
                ctx.lineTo(ecx + Math.cos(ang) * r2, ecy + Math.sin(ang) * r2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Feature 54: Ghost mode aura
        if (this.ghostTimer > 0) {
            const hue = (this.ghostTimer * 2) % 360;
            const pulse = 0.5 + Math.sin(this.ghostTimer * 0.08) * 0.2;
            ctx.save();
            ctx.globalAlpha = 0.35 * pulse;
            ctx.strokeStyle = `hsl(${270 + hue * 0.2}, 100%, 70%)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w * 0.75, this.h * 0.75, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Feature 145: Bubble Shield — translucent bubble around player
        if (this.bubbleTimer > 0) {
            const frac = this.bubbleTimer / BUBBLE_DURATION;
            const pulse = 0.9 + Math.sin(this.bubbleTimer * 0.12) * 0.1;
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            const rad = 20 * pulse;
            ctx.save();
            ctx.globalAlpha = Math.min(0.55 * frac + 0.15, 0.55);
            ctx.fillStyle = 'rgba(150, 220, 255, 0.45)';
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.7 * pulse;
            ctx.strokeStyle = '#aaeeff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.stroke();
            // Shine highlight
            ctx.globalAlpha = 0.5 * pulse;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx - 6 * pulse, cy - 6 * pulse, 4 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Feature 171: Reflect Shield — orange-gold hexagonal aura
        if (this.reflectTimer > 0) {
            const frac = this.reflectTimer / REFLECT_SHIELD_DURATION;
            const t = this.reflectTimer;
            const pulse = 0.88 + Math.sin(t * 0.13) * 0.12;
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            ctx.save();
            // Rotating hexagonal outline
            ctx.translate(cx, cy);
            ctx.rotate(t * 0.04);
            ctx.globalAlpha = Math.min(0.5 * frac + 0.2, 0.7);
            ctx.strokeStyle = '#ffaa22';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const r = 22 * pulse;
                if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.globalAlpha = 0.18 * frac * pulse;
            ctx.fillStyle = '#ffcc44';
            ctx.fill();
            ctx.restore();
        }

        // Feature 173: Earthquake Stomp — orange crackling ground ring
        if (this.quakeTimer > 0) {
            const pulse = 0.7 + Math.sin(this.quakeTimer * 0.18) * 0.3;
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h;
            ctx.save();
            ctx.globalAlpha = 0.55 * pulse;
            ctx.strokeStyle = '#ff7700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 20 * pulse, 7 * pulse, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.3 * pulse;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 32 * pulse, 11 * pulse, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Feature 87: Giant Mode glow
        if (this.giantTimer > 0) {
            const pulse = 0.85 + Math.sin(this.giantTimer * 0.08) * 0.15;
            ctx.save();
            ctx.globalAlpha = 0.38 * pulse;
            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w * 1.5 * pulse, this.h * 1.5 * pulse, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 3D shadow
        drawShadow(this.x, this.y + this.h, this.w);

        // Feature 54: Ghost mode — semi-transparent rendering
        const ghostAlpha = this.ghostTimer > 0 ? 0.42 + Math.sin(this.ghostTimer * 0.1) * 0.08 : 1;
        ctx.save();
        if (this.ghostTimer > 0) ctx.globalAlpha = ghostAlpha;
        // Feature 87: Giant Mode — scale sprite 2x around bottom-center
        const giantScale = this.giantTimer > 0 ? 2.0 : 1.0;
        const px = 2.5 * giantScale;
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

        // Build a color-customized sprite copy
        const mc = getMushroomColors();
        const coloredSprite = getMushroomSprite(mc.cap, mc.capLight);

        if (!this.facingRight) {
            ctx.translate(drawX + spriteW, drawY);
            ctx.scale(-1, 1);
            drawPixelSprite(0, 0, px, coloredSprite);
        } else {
            drawPixelSprite(drawX, drawY, px, coloredSprite);
        }
        ctx.restore();

        // Feature 104: Parachute Glide — draw parachute above player
        if (this.parachuting) {
            const pcx = this.x + this.w / 2;
            const pcy = this.y - 28;
            ctx.save();
            // Canopy (semicircle)
            ctx.beginPath();
            ctx.arc(pcx, pcy, 24, Math.PI, 0);
            ctx.closePath();
            ctx.fillStyle = '#e06020';
            ctx.globalAlpha = 0.88;
            ctx.fill();
            ctx.strokeStyle = '#ffffcc';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Alternating panel
            ctx.beginPath();
            ctx.moveTo(pcx - 12, pcy);
            ctx.arc(pcx, pcy, 12, Math.PI, 0);
            ctx.closePath();
            ctx.fillStyle = '#fff8cc';
            ctx.globalAlpha = 0.7;
            ctx.fill();
            // Strings to player
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = '#ccccaa';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pcx - 22, pcy + 2); ctx.lineTo(this.x + 5, this.y);
            ctx.moveTo(pcx, pcy + 2);      ctx.lineTo(this.x + this.w / 2, this.y);
            ctx.moveTo(pcx + 22, pcy + 2); ctx.lineTo(this.x + this.w - 5, this.y);
            ctx.stroke();
            ctx.restore();
        }
    }
}

class Mario extends Entity {
    // type: 'normal' | 'fast' | 'jumpy' | 'armored' | 'flying' | 'shooter' | 'teleporter' | 'berserker'
    constructor(x, y, speed, type = 'normal') {
        super(x, y, 30, 36);
        this.type = type;
        this.baseSpeed = type === 'fast' ? speed * 1.9 : type === 'armored' ? speed * 0.85 : type === 'berserker' ? speed * 0.75 : (type === 'shooter' || type === 'teleporter') ? 0 : speed;
        this.speed = this.baseSpeed;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.isAlive = true;
        this.deathTimer = 0;
        this.squishScale = 1;
        this.animFrame = 0;
        this.animTimer = 0;
        this.armor = (type === 'armored' || type === 'berserker') ? 1 : 0;
        // Feature 103: Berserker rage state
        this.berserkerRage = false;
        // jumpy: timer until next jump
        this.jumpTimer = type === 'jumpy' ? 60 + Math.floor(Math.random() * 80) : 9999;
        // flying: fixed altitude
        this.flyingY = type === 'flying' ? y : null;
        this.wingFlap = Math.random() * Math.PI * 2; // random phase
        // shooter: fire rate timer
        this.shootTimer = type === 'shooter' ? 120 + Math.floor(Math.random() * 120) : 9999;
        // parachute: oscillation timer and deployed flag (Feature 71)
        this.parachuteDeployed = type === 'parachute';
        this.parachuteOscTimer = Math.random() * Math.PI * 2;
        // Feature 89: teleporter
        this.teleportTimer = type === 'teleporter' ? 180 + Math.floor(Math.random() * 120) : 99999;
        this.teleportFlash = 0;
        // freeze
        this.frozenTimer = 0;
    }

    update() {
        if (!this.isAlive) {
            this.deathTimer--;
            this.squishScale = Math.max(0.1, this.deathTimer / 20);
            return this.deathTimer > 0;
        }

        // Frozen: skip all movement, just count down
        if (this.frozenTimer > 0) {
            this.frozenTimer--;
            return true;
        }

        // Feature 69: Rage Mode speed boost
        this.speed = rageModeActive ? this.baseSpeed * 1.5 : this.baseSpeed;

        // Shooter type: stands still, aims and fires toward player
        if (this.type === 'shooter') {
            // Face the player
            if (player) {
                this.direction = player.x < this.x ? -1 : 1;
            }
            this.animTimer++;
            if (this.animTimer > 20) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }
            // Apply gravity so it stays on platforms
            this.vy += GRAVITY * levelGravityMult;
            if (this.vy > MAX_FALL) this.vy = MAX_FALL;
            this.y += this.vy;
            this.resolveCollisionsY();
            // Shoot timer
            this.shootTimer--;
            if (this.shootTimer <= 0 && player) {
                this.shootTimer = 150 + Math.floor(Math.random() * 90);
                const dir = player.x + player.w / 2 < this.x + this.w / 2 ? -1 : 1;
                fireballs.push(new Fireball(
                    this.x + this.w / 2, this.y + this.h * 0.4, dir
                ));
                playSound('jump'); // reuse a sound
            }
            return true;
        }

        // Feature 89: Teleporter type — stands still, periodically teleports near player
        if (this.type === 'teleporter') {
            if (player) this.direction = player.x < this.x ? -1 : 1;
            this.animTimer++;
            if (this.animTimer > 20) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }
            // Apply gravity
            this.vy += GRAVITY * levelGravityMult;
            if (this.vy > MAX_FALL) this.vy = MAX_FALL;
            this.y += this.vy;
            this.resolveCollisionsY();
            // Teleport timer
            if (this.teleportFlash > 0) this.teleportFlash--;
            this.teleportTimer--;
            if (this.teleportTimer <= 0 && player) {
                this.teleportTimer = 200 + Math.floor(Math.random() * 80);
                // Pick a position near the player
                const side = Math.random() > 0.5 ? 1 : -1;
                const newX = Math.max(10, Math.min(W - this.w - 10, player.x + side * (90 + Math.random() * 60)));
                this.x = newX;
                this.y = Math.max(player.y - 10, 0);
                this.vy = 0;
                this.teleportFlash = 25;
                // Teleport particles at both source and destination
                for (let i = 0; i < 10; i++) {
                    const a = (Math.PI * 2 / 10) * i;
                    const spd = 2 + Math.random() * 2;
                    particles.push(new DeathParticle(this.x + this.w/2, this.y + this.h/2, Math.cos(a)*spd, Math.sin(a)*spd, '#44aaff', 4));
                }
            }
            return true;
        }

        // Feature 71: Parachute type — descends slowly from above
        if (this.type === 'parachute' && this.parachuteDeployed) {
            this.parachuteOscTimer += 0.025;
            this.vx = Math.sin(this.parachuteOscTimer) * 1.4;
            this.vy = 1.1;
            this.x += this.vx;
            this.y += this.vy;
            // Clamp X to screen bounds
            if (this.x < 0) this.x = 0;
            if (this.x + this.w > W) this.x = W - this.w;
            // Land on platforms
            for (const p of platforms) {
                if (p.crumble && (p.crumbleState === 'falling' || p.crumbleState === 'respawning')) continue;
                if (this.x + this.w > p.x && this.x < p.x + p.w &&
                    this.y + this.h >= p.y && this.y + this.h <= p.y + 14) {
                    this.y = p.y - this.h;
                    this.vy = 0;
                    this.parachuteDeployed = false;
                    break;
                }
            }
            // Land at screen bottom
            if (this.y + this.h >= H - 38) {
                this.y = H - 38 - this.h;
                this.vy = 0;
                this.parachuteDeployed = false;
            }
            this.animTimer++;
            if (this.animTimer > 18) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }
            return true;
        }

        // Feature 95: Flying type — sinusoidal altitude, no gravity
        if (this.type === 'flying') {
            this.wingFlap += 0.18;
            const flySlowMult = (player && player.slowMoTimer > 0) ? SLOW_MO_FACTOR : 1;
            this.vx = this.speed * this.direction * flySlowMult;
            this.x += this.vx;
            // Sinusoidal vertical oscillation: ±38px around base altitude
            this.y = this.flyingY + Math.sin(this.wingFlap * 0.55) * 38;
            this.vy = Math.cos(this.wingFlap * 0.55) * 38 * 0.55 * 0.18; // approximate dy for stomp detection
            // Reverse on canvas bounds
            if (this.x <= 0 || this.x + this.w >= W) {
                this.direction *= -1;
                this.x = Math.max(0, Math.min(this.x, W - this.w));
            }
            // Reverse on platform horizontal collision
            for (const p of platforms) {
                if (aabb(this, p)) {
                    if (this.vx > 0) this.x = p.x - this.w;
                    else if (this.vx < 0) this.x = p.x + p.w;
                    this.direction *= -1;
                    break;
                }
            }
            this.animTimer++;
            if (this.animTimer > 8) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }
            return true;
        }

        // Feature 75: Slow-Mo — reduce enemy movement speed
        const slowMoMult = (player && player.slowMoTimer > 0) ? SLOW_MO_FACTOR : 1;
        this.vx = this.speed * this.direction * slowMoMult;

        // gravity
        this.vy += GRAVITY * levelGravityMult;
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

        // Feature 103: Berserker rage — actively chase player
        if (this.type === 'berserker' && this.berserkerRage && player) {
            this.direction = player.x + player.w / 2 < this.x + this.w / 2 ? -1 : 1;
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
            // Feature 66: skip falling/respawning crumble platforms
            if (p.crumble && (p.crumbleState === 'falling' || p.crumbleState === 'respawning')) continue;
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
            // Feature 66: skip falling/respawning crumble platforms
            if (p.crumble && (p.crumbleState === 'falling' || p.crumbleState === 'respawning')) continue;
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
        if (this.armor > 0) {
            this.armor--;
            // Feature 103: Berserker — enters rage after losing armor
            if (this.type === 'berserker') {
                this.berserkerRage = true;
                this.speed = this.baseSpeed * 3.2;
                this.baseSpeed = this.speed;
                particles.push(new Particle(this.x, this.y - 10, '😡 ЯРОСТЬ!', '#ff3300'));
            }
            spawnDeathParticles(this.x, this.y, this.w / 2, this.h / 2);
            playSound('stomp');
            return false; // survived — armor absorbed hit
        }
        this.isAlive = false;
        this.deathTimer = 20;
        this.vx = 0;
        this.vy = 0;
        spawnDeathParticles(this.x, this.y, this.w, this.h);
        spawnStarBurst(this.x + this.w / 2, this.y + this.h / 2, comboCount); // Feature 117
        playSound('stomp');
        // 50% chance to drop a coin
        if (Math.random() < 0.5) {
            const dc = new Coin(this.x + this.w / 2 - 8, this.y + 4);
            dc.isDropped = true;
            dc.vx = (Math.random() - 0.5) * 4;
            dc.vy = -5 - Math.random() * 3;
            coins.push(dc);
        }
        // Feature 77: 10% chance to drop a random power-up
        if (Math.random() < 0.10) {
            droppedPowerups.push(new DroppedPowerup(this.x + this.w / 2 - 9, this.y));
        }
        return true; // killed
    }

    render() {
        // Feature 84: ghost_mario — transparency based on distance to player
        let _ghostWrap = false;
        if (this.type === 'ghost_mario' && this.isAlive) {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            const dist = player
                ? Math.hypot((player.x + player.w / 2) - cx, (player.y + player.h / 2) - cy)
                : 999;
            const baseAlpha = Math.max(0.07, Math.min(0.92, 1 - (dist - 55) / 160));
            const flicker = dist < 130 ? (0.55 + Math.abs(Math.sin(Date.now() * 0.009 + this.x * 0.05)) * 0.45) : 1;
            ctx.save();
            ctx.globalAlpha = baseAlpha * flicker;
            _ghostWrap = true;
        }

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

        // Armored overlay: grey helmet drawn over sprite
        if (this.isAlive && this.armor > 0) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            const helmetX = this.x + this.w * 0.1;
            const helmetY = this.y;
            const helmetW = this.w * 0.8;
            const helmetH = this.h * 0.45;
            // Helmet dome
            ctx.fillStyle = '#888899';
            ctx.beginPath();
            ctx.ellipse(helmetX + helmetW / 2, helmetY + helmetH * 0.55, helmetW / 2, helmetH * 0.55, 0, Math.PI, 0);
            ctx.fill();
            // Helmet visor
            ctx.fillStyle = '#445566';
            ctx.fillRect(helmetX + helmetW * 0.1, helmetY + helmetH * 0.45, helmetW * 0.8, helmetH * 0.25);
            // Highlight
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ccddff';
            ctx.beginPath();
            ctx.ellipse(helmetX + helmetW * 0.38, helmetY + helmetH * 0.2, helmetW * 0.2, helmetH * 0.15, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Type badge above head
        if (this.isAlive && this.type !== 'normal') {
            ctx.save();
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            const badgeX = this.x + this.w / 2;
            const badgeY = this.y - 4;
            if (this.type === 'fast') {
                ctx.fillStyle = '#ff6600';
                ctx.fillText('⚡', badgeX, badgeY);
            } else if (this.type === 'jumpy') {
                ctx.fillStyle = '#000';
                ctx.fillText('↑', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#44aaff';
                ctx.fillText('↑', badgeX, badgeY);
            } else if (this.type === 'armored') {
                ctx.fillStyle = '#aabbcc';
                ctx.fillText('🛡', badgeX, badgeY);
            } else if (this.type === 'flying') {
                ctx.fillStyle = '#000';
                ctx.fillText('✈', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#88ddff';
                ctx.fillText('✈', badgeX, badgeY);
            } else if (this.type === 'shooter') {
                ctx.fillStyle = '#ff8800';
                ctx.fillText('🎯', badgeX, badgeY);
            } else if (this.type === 'parachute') {
                ctx.fillStyle = '#ffeeaa';
                ctx.fillText('🪂', badgeX, badgeY);
            } else if (this.type === 'ghost_mario') {
                // Feature 84: ghost badge only visible when nearby
                const gdist = player ? Math.hypot((player.x + player.w/2) - badgeX, (player.y + player.h/2) - (this.y + this.h/2)) : 999;
                if (gdist < 130) {
                    ctx.fillStyle = 'rgba(180,100,255,0.7)';
                    ctx.fillText('👻', badgeX, badgeY);
                }
            } else if (this.type === 'teleporter') {
                ctx.fillStyle = '#44aaff';
                ctx.fillText('⚡', badgeX, badgeY);
            } else if (this.type === 'berserker') {
                ctx.fillStyle = this.berserkerRage ? '#ff2200' : '#aa6600';
                ctx.fillText(this.berserkerRage ? '😡' : '😤', badgeX, badgeY);
            }
            ctx.textAlign = 'left';
            ctx.restore();
        }

        // Feature 103: Berserker dark tint + rage aura
        if (this.isAlive && this.type === 'berserker') {
            ctx.save();
            // Dark purple tint overlay
            ctx.globalAlpha = 0.38;
            ctx.fillStyle = '#330022';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            if (this.berserkerRage) {
                // Rage flame aura
                const pulse = 0.35 + Math.abs(Math.sin(Date.now() * 0.014)) * 0.55;
                ctx.globalAlpha = pulse;
                ctx.strokeStyle = '#ff2200';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8, 4);
                ctx.stroke();
                ctx.globalAlpha = pulse * 0.22;
                ctx.fillStyle = '#ff4400';
                ctx.fillRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8);
            }
            ctx.restore();
        }

        // Feature 89: Teleporter flash effect on teleport
        if (this.isAlive && this.type === 'teleporter' && this.teleportFlash > 0) {
            const alpha = (this.teleportFlash / 25) * 0.7;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#88ccff';
            ctx.beginPath();
            ctx.ellipse(this.x + this.w/2, this.y + this.h/2, this.w * 1.2, this.h * 1.0, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Feature 71: Parachute visual — drawn above the Mario sprite
        if (this.isAlive && this.type === 'parachute' && this.parachuteDeployed) {
            const cx = this.x + this.w / 2;
            const py = this.y - 2;
            const r = 26;
            // Canopy (3 colored segments)
            const colors = ['#ff4444', '#ffffff', '#ff4444'];
            for (let i = 0; i < 3; i++) {
                const startA = Math.PI + (i / 3) * Math.PI;
                const endA   = Math.PI + ((i + 1) / 3) * Math.PI;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(cx, py);
                ctx.arc(cx, py, r, startA, endA);
                ctx.closePath();
                ctx.fillStyle = colors[i];
                ctx.globalAlpha = 0.92;
                ctx.fill();
                ctx.strokeStyle = '#aa2200';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            }
            // Canopy outline
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, py, r, Math.PI, 0);
            ctx.strokeStyle = '#cc3300';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
            // Suspension lines
            ctx.save();
            ctx.strokeStyle = 'rgba(180,120,60,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx - r * 0.7, py);     ctx.lineTo(this.x + 4, this.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, py + 4);            ctx.lineTo(cx, this.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + r * 0.7, py);     ctx.lineTo(this.x + this.w - 4, this.y); ctx.stroke();
            ctx.restore();
        }

        // Wings for flying type
        if (this.isAlive && this.type === 'flying') {
            const flapY = Math.sin(this.wingFlap) * 6;
            const wx = this.x + this.w / 2;
            const wy = this.y + this.h * 0.25;
            ctx.save();
            ctx.globalAlpha = 0.82;
            // Left wing
            ctx.fillStyle = '#aaddff';
            ctx.strokeStyle = '#5599cc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(wx - 20, wy + flapY, 16, 7, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Right wing
            ctx.beginPath();
            ctx.ellipse(wx + 20, wy - flapY, 16, 7, 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Wing highlights
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(wx - 22, wy + flapY - 2, 8, 3, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(wx + 18, wy - flapY - 2, 8, 3, 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Feature 75: Slow-Mo aura — cyan ring around slowed enemies
        if (this.isAlive && player && player.slowMoTimer > 0 && this.frozenTimer <= 0) {
            const pulse = 0.25 + Math.abs(Math.sin(Date.now() * 0.006)) * 0.3;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = '#55ddff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(this.x - 2, this.y - 2, this.w + 4, this.h + 4);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // Frozen overlay: ice-blue tint + snowflake icon
        if (this.isAlive && this.frozenTimer > 0) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = '#88ddff';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.globalAlpha = 1;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('❄', this.x + this.w / 2, this.y - 2);
            ctx.textAlign = 'left';
            ctx.restore();
        }

        // Feature 89: Teleporter — blue tint overlay + countdown pulse
        if (this.isAlive && this.type === 'teleporter') {
            // Blue tint
            ctx.save();
            ctx.globalAlpha = 0.25 + Math.abs(Math.sin(Date.now() * 0.004)) * 0.15;
            ctx.fillStyle = '#4488ff';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.restore();
            // If about to teleport, show warning pulse
            if (this.teleportTimer < 60) {
                const urgency = 1 - this.teleportTimer / 60;
                ctx.save();
                ctx.globalAlpha = urgency * 0.6;
                ctx.strokeStyle = '#88ccff';
                ctx.lineWidth = 2 + urgency * 2;
                ctx.beginPath();
                ctx.rect(this.x - 3, this.y - 3, this.w + 6, this.h + 6);
                ctx.stroke();
                ctx.restore();
            }
        }

        // Feature 69: Rage Mode — red glow on enraged enemies
        if (this.isAlive && rageModeActive && this.type !== 'shooter') {
            const pulse = 0.3 + Math.abs(Math.sin(Date.now() * 0.008)) * 0.4;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = '#ff2200';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(this.x - 3, this.y - 3, this.w + 6, this.h + 6, 4);
            ctx.stroke();
            ctx.globalAlpha = pulse * 0.25;
            ctx.fillStyle = '#ff4400';
            ctx.fillRect(this.x - 3, this.y - 3, this.w + 6, this.h + 6);
            ctx.restore();
        }

        // Feature 84: close ghost_mario transparency wrapper
        if (_ghostWrap) ctx.restore();
    }
}

// === COINS ===
// Feature 126: coin body + shine + label pre-rendered per kind (1 = normal, 2 = x2, 3 = x3)
const coinBitmaps = {};
function getCoinBitmap(kind, r) {
    const key = kind + '@' + renderScale;
    if (coinBitmaps[key]) return coinBitmaps[key];
    const isTriple = kind === 3, isDouble = kind === 2;
    const sz = r * 2 + 4, cx = sz / 2, cy = sz / 2;
    coinBitmaps[key] = renderToBitmap(sz, sz, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = isTriple ? '#cc44ff' : isDouble ? '#ff9900' : '#ffcc00';
        ctx.fill();
        ctx.strokeStyle = isTriple ? '#ff99ff' : isDouble ? '#ffcc00' : '#e6a800';
        ctx.lineWidth = isTriple ? 2.5 : isDouble ? 2 : 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
        ctx.font = `bold ${isTriple ? 10 : isDouble ? 9 : 8}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isTriple ? '#ffffff' : isDouble ? '#7a3c00' : '#b8860b';
        ctx.fillText(isTriple ? 'x3' : isDouble ? 'x2' : '$', cx, cy + r * 0.45);
    });
    return coinBitmaps[key];
}

class Coin {
    constructor(x, y, bonus = 50, isRainbow = false) {
        this.x = x;
        this.y = y;
        this.isRainbow = isRainbow; // Feature 138
        this.w = isRainbow ? 26 : bonus >= 150 ? 24 : bonus > 50 ? 20 : 16; // Feature 92/138
        this.h = isRainbow ? 26 : bonus >= 150 ? 24 : bonus > 50 ? 20 : 16;
        this.bonus = isRainbow ? 200 : bonus;
        this.collected = false;
        this.animTimer = Math.random() * 60; // stagger animation
        this.bobOffset = Math.random() * Math.PI * 2;
        this.isDropped = false;
        this.vx = 0;
        this.vy = 0;
    }

    update() {
        this.animTimer++;
        // Magnet attraction: pull coin toward player when magnet is active
        // Feature 169: Vortex Coin — pulls ALL coins with no radius limit and faster speed
        if (player && (player.magnetTimer > 0 || player.vortexCoinTimer > 0) && !this.isDropped) {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            const px = player.x + player.w / 2;
            const py = player.y + player.h / 2;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const isVortex = player.vortexCoinTimer > 0;
            if ((isVortex || dist < MAGNET_RADIUS) && dist > 1) {
                const spd = isVortex
                    ? Math.min(14, dist * 0.15 + 4)
                    : Math.min(10, (MAGNET_RADIUS - dist) / 18 + 2);
                this.x += (dx / dist) * spd;
                this.y += (dy / dist) * spd;
            }
        }
        if (this.isDropped) {
            this.vy += 0.45;
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.96;
            for (const p of platforms) {
                if (aabb(this, p) && this.vy > 0) {
                    this.y = p.y - this.h;
                    this.vy = 0;
                    this.vx = 0;
                    this.isDropped = false;
                }
            }
            if (this.y > H + 50) this.collected = true;
        }
        return !this.collected;
    }

    render() {
        const bob = Math.sin(this.animTimer * 0.07 + this.bobOffset) * 3;
        const isTriple = this.bonus >= 150; // Feature 92
        const isDouble = this.bonus > 50 && !isTriple;
        const r = isTriple ? 12 : isDouble ? 10 : 7;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        // Feature 73: Coin Frenzy — extra pulse glow
        const frenzyActive = coinFrenzyTimer > 0;
        const frenzyPulse = frenzyActive ? 0.5 + Math.abs(Math.sin(Date.now() * 0.012)) * 0.5 : 0;
        const glow = Math.abs(Math.sin(this.animTimer * 0.05)) * 0.4 + (frenzyActive ? 0.8 : 0.6);
        const spin = (isDouble || isTriple) ? Math.cos(this.animTimer * 0.09) : 1;

        ctx.save();
        // Feature 73: Frenzy outer ring
        if (frenzyActive) {
            ctx.beginPath();
            ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 140, 0, ${frenzyPulse * 0.4})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 220, 0, ${frenzyPulse})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        // Feature 138: Rainbow coin — multicolor rotating glow ring
        if (this.isRainbow) {
            const hueA = (this.animTimer * 4) % 360;
            const hueB = (hueA + 180) % 360;
            const rPulse = 0.5 + Math.abs(Math.sin(this.animTimer * 0.1)) * 0.5;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${hueA}, 100%, 60%, ${rPulse * 0.45})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
            ctx.strokeStyle = `hsl(${hueB}, 100%, 70%)`;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }
        // Feature 92: Triple coin pulsing purple glow
        if (isTriple) {
            const triPulse = 0.4 + Math.abs(Math.sin(this.animTimer * 0.1)) * 0.6;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180, 60, 255, ${triPulse * 0.35})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(220, 100, 255, ${triPulse * 0.7})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = this.isRainbow
            ? `hsla(${(this.animTimer * 3) % 360}, 100%, 65%, ${glow * 0.5})`
            : isTriple
            ? `rgba(200, 80, 255, ${glow * 0.45})`
            : isDouble
            ? `rgba(255, 160, 0, ${glow * 0.4})`
            : `rgba(255, 220, 0, ${glow * 0.25})`;
        ctx.fill();
        // Coin body (with spin for double/triple) — Feature 126: baked once per coin kind
        const kind = isTriple ? 3 : isDouble ? 2 : 1;
        const bmp = getCoinBitmap(kind, r);
        const sz = r * 2 + 4, sx = Math.max(0.08, Math.abs(spin));
        ctx.drawImage(bmp, cx - (sz / 2) * sx, cy - sz / 2, sz * sx, sz);
        // Feature 138: Rainbow label
        if (this.isRainbow) {
            const hue = (this.animTimer * 4) % 360;
            ctx.font = `bold 8px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = `hsl(${hue}, 100%, 90%)`;
            ctx.shadowColor = `hsl(${(hue + 120) % 360}, 100%, 50%)`;
            ctx.shadowBlur = 5;
            ctx.fillText('🌈', cx, cy + 3);
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }
}

let coins = [];

// === FEATURE 147: LIGHTNING COIN — blue crackling coin +250 pts, stuns enemies in 100px radius ===
class LightningCoin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 3.5;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.88 + Math.sin(t * 0.16) * 0.12;
        ctx.save();
        // Electric outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(80, 160, 255, ${0.25 * pulse})`;
        ctx.fill();
        // Core circle
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 10 * pulse);
        grad.addColorStop(0, '#88ccff');
        grad.addColorStop(1, '#2244cc');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#66aaff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Crackle lines
        const crackleCount = 4;
        ctx.strokeStyle = `rgba(200, 230, 255, ${0.6 + Math.sin(t * 0.3) * 0.4})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < crackleCount; i++) {
            const ang = (i / crackleCount) * Math.PI * 2 + t * 0.1;
            const r1 = 10 * pulse;
            const r2 = 14 * pulse + Math.sin(t * 0.5 + i) * 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
            ctx.lineTo(cx + Math.cos(ang + 0.3) * (r1 + r2) / 2, cy + Math.sin(ang + 0.3) * (r1 + r2) / 2);
            ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
            ctx.stroke();
        }
        // Lightning symbol
        ctx.font = `bold ${Math.round(12 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('⚡', cx, cy + 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let lightningCoins = [];

function checkLightningCoinCollisions() {
    if (!player) return;
    for (const lc of lightningCoins) {
        if (lc.collected) continue;
        if (!aabb(player, lc)) continue;
        lc.collected = true;
        let pts = 250;
        if (player.scoreBoostTimer > 0) pts *= 2;
        player.score += pts;
        totalScore += pts;
        particles.push(new Particle(lc.x - 10, lc.y - 18, '⚡ +' + pts + '!', '#88aaff'));
        // Stun nearby enemies (100px radius) for 2 seconds
        const cx = lc.x + lc.w / 2;
        const cy = lc.y + lc.h / 2;
        let stunCount = 0;
        for (const m of marios) {
            if (!m.isAlive) continue;
            const mx = m.x + m.w / 2;
            const my = m.y + m.h / 2;
            const dist = Math.sqrt((mx - cx) * (mx - cx) + (my - cy) * (my - cy));
            if (dist <= 100) {
                m.frozenTimer = 120; // 2 seconds at 60fps
                stunCount++;
            }
        }
        if (stunCount > 0) {
            particles.push(new Particle(lc.x - 10, lc.y - 32, '⚡ ОГЛУШЕНО ' + stunCount + '!', '#aaccff'));
        }
        // Arc discharge particles
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            particles.push(new DeathParticle(cx, cy, Math.cos(ang) * 3.5, Math.sin(ang) * 3.5, '#88ccff', 3));
        }
        playSound('star');
    }
    lightningCoins = lightningCoins.filter(lc => !lc.collected);
}

// === FEATURE 162: EXPLODING COIN — red-orange coin that kills enemies in radius on pickup ===
class ExplodingCoin {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 22; this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }
    update() { this.animTimer++; return !this.collected; }
    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 3;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.88 + Math.sin(t * 0.2) * 0.12;
        const blink = Math.floor(t / 8) % 2 === 0;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 17 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = blink ? `rgba(255,90,0,${0.35*pulse})` : `rgba(255,200,0,${0.25*pulse})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(cx-2, cy-2, 1, cx, cy, 10*pulse);
        grad.addColorStop(0, blink ? '#ff8844' : '#ffcc44');
        grad.addColorStop(1, blink ? '#cc2200' : '#ee6600');
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = blink ? '#ff4400' : '#ffaa00';
        ctx.lineWidth = 2; ctx.stroke();
        ctx.font = `bold ${Math.round(12 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('💥', cx, cy + 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let explodingCoins = [];

function checkExplodingCoinCollisions() {
    if (!player) return;
    const EXPLODE_RADIUS = 130;
    for (const ec of explodingCoins) {
        if (ec.collected) continue;
        if (!aabb(player, ec)) continue;
        ec.collected = true;
        let pts = 300;
        if (player.scoreBoostTimer > 0) pts *= 2;
        if (coinFrenzyTimer > 0) pts = Math.floor(pts * 3);
        player.score += pts;
        totalScore += pts;
        particles.push(new Particle(ec.x - 10, ec.y - 18, '💥 +' + pts + '!', '#ff8800'));
        const cx = ec.x + ec.w / 2, cy = ec.y + ec.h / 2;
        let killCount = 0;
        for (const m of marios) {
            if (!m.isAlive) continue;
            const mx = m.x + m.w / 2, my = m.y + m.h / 2;
            if (Math.hypot(mx - cx, my - cy) <= EXPLODE_RADIUS) {
                m.armor = 0;
                m.stomp();
                killCount++;
            }
        }
        if (killCount > 0) {
            const kpts = killCount * 100;
            player.score += kpts; totalScore += kpts;
            particles.push(new Particle(cx - 20, cy - 30, '💥 x' + killCount + ' +' + kpts + '!', '#ff4400'));
            for (let _k = 0; _k < killCount; _k++) onEnemyKilledStreak(cx, cy);
            comboCount += killCount;
            runStats.enemiesKilled += killCount;
        }
        spawnExplosionParticles(cx, cy);
        shakeTimer = 18; shakeIntensity = 5;
        playSound('bomb');
    }
    explodingCoins = explodingCoins.filter(ec => !ec.collected);
}

// === FEATURE 165: WARP COIN ===
class WarpCoin {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 22; this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }
    update() { this.animTimer++; return !this.collected; }
    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07) * 3;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const spin = t * 0.05;
        const pulse = 0.85 + Math.sin(t * 0.13) * 0.15;
        ctx.save();
        // Outer portal ring
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160, 0, 255, ${0.25 * pulse})`;
        ctx.fill();
        // Inner body
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 9 * pulse);
        grad.addColorStop(0, '#ee88ff');
        grad.addColorStop(1, '#7700cc');
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = '#cc44ff';
        ctx.lineWidth = 2; ctx.stroke();
        // Spiral arcs to indicate portal / teleport
        for (let i = 0; i < 3; i++) {
            const a = spin + (Math.PI * 2 / 3) * i;
            ctx.beginPath();
            ctx.arc(cx, cy, 5 * pulse, a, a + Math.PI * 0.8);
            ctx.strokeStyle = `rgba(255, 200, 255, ${0.65 * pulse})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        // Icon
        ctx.font = `bold 10px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('↔', cx, cy + 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let warpCoins = [];

function checkWarpCoinCollisions() {
    if (!player) return;
    for (const wc of warpCoins) {
        if (wc.collected) continue;
        if (!aabb(player, wc)) continue;
        wc.collected = true;
        let pts = 90;
        if (player.scoreBoostTimer > 0) pts *= 2;
        if (coinFrenzyTimer > 0) pts = Math.floor(pts * 3);
        player.score += pts; totalScore += pts;
        levelCoinsCollected++;
        runStats.coinsCollected++;
        // Teleport up to 2 nearest alive enemies to random platform positions
        const alive = marios.filter(m => m.isAlive && m.type !== 'flying' && m.type !== 'parachute');
        const cx = wc.x + wc.w / 2, cy = wc.y + wc.h / 2;
        alive.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
        const targets = alive.slice(0, 2);
        const solidFloors = platforms.filter(p => !p.crumble && !p.ice && p.w >= 60 && p.y < 450);
        for (const m of targets) {
            if (solidFloors.length === 0) continue;
            const dest = solidFloors[Math.floor(Math.random() * solidFloors.length)];
            const newX = dest.x + Math.random() * Math.max(1, dest.w - m.w);
            const newY = dest.y - m.h;
            // Warp particles at origin
            for (let i = 0; i < 8; i++) {
                const ang = (Math.PI * 2 * i) / 8;
                particles.push(new DeathParticle(m.x + m.w / 2, m.y + m.h / 2,
                    Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, '#cc44ff', 5));
            }
            m.x = newX; m.y = newY;
            m.vx = 0; m.vy = 0;
            // Warp particles at destination
            for (let i = 0; i < 8; i++) {
                const ang = (Math.PI * 2 * i) / 8;
                particles.push(new DeathParticle(m.x + m.w / 2, m.y + m.h / 2,
                    Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, '#ee88ff', 5));
            }
        }
        // Visual burst at coin
        for (let i = 0; i < 14; i++) {
            const ang = (Math.PI * 2 * i) / 14;
            const spd = 2 + Math.random() * 3;
            particles.push(new DeathParticle(cx, cy,
                Math.cos(ang) * spd, Math.sin(ang) * spd, i % 2 === 0 ? '#cc44ff' : '#ffffff', 6));
        }
        particles.push(new Particle(wc.x - 10, wc.y - 20, '↔ +' + pts + '!', '#dd44ff'));
        if (targets.length > 0)
            particles.push(new Particle(cx - 30, cy - 32, '✦ ВАРП!', '#cc44ff'));
        playSound('coin');
    }
    warpCoins = warpCoins.filter(wc => !wc.collected);
}

// === FEATURE 169: VORTEX COIN — pulls ALL coins on level toward player for 8 seconds, no distance limit ===
const VORTEX_COIN_DURATION = 480; // 8 seconds at 60fps
class VortexCoin {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 22; this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }
    update() { this.animTimer++; return !this.collected; }
    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 3;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const spin = t * 0.07;
        const pulse = 0.85 + Math.sin(t * 0.15) * 0.15;
        ctx.save();
        // Outer glow ring
        ctx.beginPath();
        ctx.arc(cx, cy, 17 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 220, 255, ${0.2 * pulse})`;
        ctx.fill();
        // Inner body
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 9 * pulse);
        grad.addColorStop(0, '#88ffff');
        grad.addColorStop(1, '#0088bb');
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 2; ctx.stroke();
        // Swirl arcs
        for (let i = 0; i < 4; i++) {
            const a = spin + (Math.PI * 2 / 4) * i;
            ctx.beginPath();
            ctx.arc(cx, cy, 6 * pulse, a, a + Math.PI * 0.6);
            ctx.strokeStyle = `rgba(200, 255, 255, ${0.7 * pulse})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        // Icon
        ctx.font = `bold 10px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🌀', cx, cy + 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let vortexCoins = [];

function checkVortexCoinCollisions() {
    if (!player) return;
    for (const vc of vortexCoins) {
        if (vc.collected) continue;
        if (!aabb(player, vc)) continue;
        vc.collected = true;
        const pts = player.scoreBoostTimer > 0 ? 300 : 150;
        player.score += pts; totalScore += pts;
        player.vortexCoinTimer = VORTEX_COIN_DURATION;
        scorePopups.push({ x: vc.x, y: vc.y - 20, text: `+${pts}`, color: '#00ddff', timer: 90 });
        for (let i = 0; i < 12; i++) {
            const ang = (Math.PI * 2 * i) / 12;
            particles.push(new DeathParticle(vc.x + vc.w / 2, vc.y + vc.h / 2,
                Math.cos(ang) * 3, Math.sin(ang) * 3, '#00eeee', 6));
        }
        particles.push(new Particle(vc.x - 20, vc.y - 24, '🌀 ВИХРЬ!', '#00ddff'));
        playSound('powerup');
    }
    vortexCoins = vortexCoins.filter(vc => !vc.collected);
}

// === FEATURE 167: EXPLOSIVE BARREL — stomping or spore-hitting detonates it, kills enemies in radius 150px ===
class ExplosiveBarrel {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 30; this.h = 36;
        this.exploded = false;
        this.animTimer = Math.random() * 60;
    }
    update() { this.animTimer++; return !this.exploded; }
    explode(cx, cy) {
        if (this.exploded) return;
        this.exploded = true;
        const RADIUS = 150;
        let killCount = 0;
        for (const m of marios) {
            if (!m.isAlive) continue;
            if (Math.hypot(m.x + m.w / 2 - cx, m.y + m.h / 2 - cy) > RADIUS) continue;
            m.stomp();
            killCount++;
            let pts = 150;
            if (player) { if (player.scoreBoostTimer > 0) pts *= 2; player.score += pts; totalScore += pts; }
            onEnemyKilledStreak(m.x, m.y);
            runStats.enemiesKilled++;
            comboCount++; comboDisplayTimer = 100;
            scorePopups.push({ x: m.x, y: m.y - 16, text: '+' + pts, color: '#ff6600', timer: 90 });
        }
        for (let i = 0; i < 22; i++) {
            const ang = (Math.PI * 2 * i) / 22;
            const spd = 2.5 + Math.random() * 5;
            const col = [' #ff4400', '#ffaa00', '#ffffff', '#ff8800'][i % 4].trim();
            particles.push(new DeathParticle(cx, cy, Math.cos(ang) * spd, Math.sin(ang) * spd, col, 9));
        }
        shakeTimer = 22; shakeIntensity = 8;
        particles.push(new Particle(cx - 36, cy - 36, '💥 ВЗРЫВ!', '#ff6600'));
        if (killCount > 0)
            particles.push(new Particle(cx - 30, cy - 52, `×${killCount}`, '#ff4400'));
        playSound('bomb');
    }
    render() {
        if (this.exploded) return;
        const t = this.animTimer;
        const pulse = Math.sin(t * 0.14) * 0.12;
        ctx.save();
        const bx = this.x, by = this.y, bw = this.w, bh = this.h;
        // Body gradient
        const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        grad.addColorStop(0, '#a0522d');
        grad.addColorStop(1, '#6b3a1f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 5);
        ctx.fill();
        // Metal hoops
        ctx.strokeStyle = '#3a1f00';
        ctx.lineWidth = 3;
        [0.2, 0.5, 0.8].forEach(frac => {
            ctx.beginPath();
            ctx.moveTo(bx, by + bh * frac);
            ctx.lineTo(bx + bw, by + bh * frac);
            ctx.stroke();
        });
        // Warning text
        ctx.font = `${13 + pulse * 8}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', bx + bw / 2, by + bh / 2);
        // Glow
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 10 + pulse * 14;
        ctx.strokeStyle = `rgba(255,100,0,${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 7);
        ctx.stroke();
        ctx.restore();
    }
}

let explosiveBarrels = [];

function checkBarrelCollisions() {
    if (!player) return;
    for (const barrel of explosiveBarrels) {
        if (barrel.exploded) continue;
        const playerBottom = player.y + player.h;
        const overlapX = player.x + player.w > barrel.x + 5 && player.x < barrel.x + barrel.w - 5;
        const topHit = playerBottom >= barrel.y - 4 && playerBottom <= barrel.y + 14;
        if (player.vy > 0 && overlapX && topHit) {
            player.y = barrel.y - player.h;
            player.vy = STOMP_BOUNCE;
            player.isGrounded = false;
            player.scaleX = 0.75; player.scaleY = 1.3;
            barrel.explode(barrel.x + barrel.w / 2, barrel.y + barrel.h / 2);
        }
    }
    explosiveBarrels = explosiveBarrels.filter(b => !b.exploded);
}

// === STAR POWER-UP ===
const STAR_DURATION = 600; // 10 seconds at 60fps
const SPEED_BOOST_DURATION = 300; // 5 seconds at 60fps
const MAGNET_DURATION = 420; // 7 seconds at 60fps
const MAGNET_RADIUS = 180;
const FREEZE_DURATION = 240; // 4 seconds at 60fps
const GHOST_DURATION = 300; // Feature 54: 5 seconds at 60fps
const SCORE_BOOST_DURATION = 480; // Feature 61: 8 seconds at 60fps
const ELECTRO_DURATION = 360; // Feature 72: 6 seconds at 60fps
const ELECTRO_RADIUS = 80; // px radius of electric field
const SLOW_MO_DURATION = 360; // Feature 75: 6 seconds at 60fps
const BUBBLE_DURATION = 600;  // Feature 145: 10 seconds at 60fps
const JUMP_BOOST_DURATION = 480; // Feature 148: 8 seconds at 60fps
const REFLECT_SHIELD_DURATION = 480; // Feature 171: 8 seconds at 60fps
const QUAKE_DURATION = 360; // Feature 173: Earthquake Stomp — 6 seconds at 60fps
const SPIKE_BOOTS_DURATION = 600; // Feature 163: 10 seconds at 60fps
const SPIKE_BOOTS_RADIUS = 220;   // Feature 163: chain stomp search radius px
const SPIKE_BOOTS_MAX_CHAIN = 3;  // Feature 163: max chain bounces per stomp
const SLOW_MO_FACTOR = 0.4;   // enemies move at 40% speed

class Star {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 20;
        this.h = 20;
        this.collected = false;
        this.animTimer = 0;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.8 + Math.sin(t * 0.12) * 0.2;
        const hue = (t * 3) % 360;

        ctx.save();
        // Rainbow glow
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.3)`;
        ctx.fill();
        // Draw 5-pointed star
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI / 5) * i - Math.PI / 2;
            const r = i % 2 === 0 ? 9 * pulse : 4.5 * pulse;
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}

let stars = [];

// === SHIELD POWER-UP ===
class Shield {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 18;
        this.h = 20;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.1) * 0.1;

        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(60, 120, 255, 0.3)';
        ctx.fill();
        // Shield body (hexagonal)
        ctx.fillStyle = '#3366ff';
        ctx.strokeStyle = '#88aaff';
        ctx.lineWidth = 2;
        const r = 9 * pulse;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.75, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.75, cy + r * 0.5);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r * 0.75, cy + r * 0.5);
        ctx.lineTo(cx - r * 0.75, cy - r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Shine
        ctx.fillStyle = 'rgba(180, 210, 255, 0.5)';
        ctx.beginPath();
        ctx.ellipse(cx - 2, cy - 2, 2.5, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // Label
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🛡', cx, cy + 3);
        ctx.restore();
    }
}

let shields = [];

// === BOMB POWER-UP ===
class Bomb {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(t * 0.15) * 0.15;
        const fuse = t % 30; // fuse spark timing

        ctx.save();
        // Outer danger glow
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 80, 0, ${0.25 * pulse})`;
        ctx.fill();

        // Bomb body
        ctx.beginPath();
        ctx.arc(cx, cy + 2, 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#222222';
        ctx.fill();
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Bomb shine
        ctx.beginPath();
        ctx.arc(cx - 2.5, cy - 1, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180,180,180,0.35)';
        ctx.fill();

        // Fuse
        ctx.strokeStyle = '#aa8833';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + 1, cy - 7);
        ctx.quadraticCurveTo(cx + 7, cy - 14, cx + 3, cy - 18);
        ctx.stroke();

        // Fuse spark
        if (fuse < 8) {
            const sparkAlpha = 1 - fuse / 8;
            ctx.save();
            ctx.globalAlpha = sparkAlpha;
            ctx.fillStyle = fuse % 2 === 0 ? '#ffff00' : '#ff8800';
            ctx.beginPath();
            ctx.arc(cx + 3, cy - 18, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Label
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff4400';
        ctx.fillText('💣', cx, cy + 6);
        ctx.restore();
    }
}

let bombs = [];

function spawnExplosionParticles(cx, cy) {
    const colors = ['#ff6600', '#ff2200', '#ffcc00', '#ffffff', '#ff8800'];
    for (let i = 0; i < 24; i++) {
        const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.3;
        const speed = 3 + Math.random() * 6;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 3;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 4 + Math.floor(Math.random() * 6);
        particles.push(new DeathParticle(cx, cy, vx, vy, color, size));
    }
}

function checkBombCollisions() {
    for (const bomb of bombs) {
        if (bomb.collected) continue;
        if (!aabb(player, bomb)) continue;
        bomb.collected = true;

        // Kill all alive enemies instantly (ignoring armor)
        let killCount = 0;
        for (const mario of marios) {
            if (!mario.isAlive) continue;
            mario.armor = 0;
            mario.stomp();
            killCount++;
        }

        const pts = killCount * 100;
        player.score += pts;
        totalScore += pts;

        // Explosion at center of screen
        const cx = W / 2;
        const cy = H / 2;
        spawnExplosionParticles(cx, cy);
        shakeTimer = 22;
        shakeIntensity = 9;

        const msg = killCount > 0 ? `💥 ВЗРЫВ! +${pts}` : '💥 ВЗРЫВ!';
        particles.push(new Particle(W / 2 - 50, H / 2 - 50, msg, '#ff6600'));
        playSound('bomb');
    }
    bombs = bombs.filter(b => !b.collected);
}

// === SPRING PAD ===
class SpringPad {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 36;
        this.h = 14;
        this.animTimer = 0;
        this.compressTimer = 0; // compressed animation after bounce
    }

    update() {
        this.animTimer++;
        if (this.compressTimer > 0) this.compressTimer--;
    }

    render() {
        const compress = this.compressTimer > 0 ? (this.compressTimer / 18) : 0;
        const h = this.h * (1 - compress * 0.55);
        const yOff = this.h - h;
        const cx = this.x + this.w / 2;
        const cy = this.y + yOff;

        ctx.save();
        // Base plate
        ctx.fillStyle = '#884400';
        ctx.fillRect(this.x + 2, this.y + this.h - 4, this.w - 4, 4);

        // Spring coils
        const coilCount = 3;
        const coilH = h / coilCount;
        for (let i = 0; i < coilCount; i++) {
            const coilY = cy + i * coilH;
            const bright = i % 2 === 0 ? '#ffcc00' : '#ddaa00';
            ctx.fillStyle = bright;
            ctx.fillRect(this.x + 5, coilY, this.w - 10, coilH * 0.55);
        }

        // Top pad
        const padGrad = ctx.createLinearGradient(this.x, cy, this.x, cy + 5);
        padGrad.addColorStop(0, '#ff8800');
        padGrad.addColorStop(1, '#cc5500');
        ctx.fillStyle = padGrad;
        ctx.beginPath();
        ctx.roundRect(this.x, cy, this.w, 6, 3);
        ctx.fill();

        // Shine on top pad
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ffdd88';
        ctx.fillRect(this.x + 4, cy + 1, this.w - 8, 2);

        ctx.restore();
    }
}

let springPads = [];

// === SPIKES (Feature 91) ===
class Spike {
    constructor(x, y, count) {
        this.x = x;
        this.y = y;
        this.count = count || 3;
        this.w = this.count * 16;
        this.h = 16;
    }

    render() {
        const spikeW = 16;
        ctx.save();
        for (let i = 0; i < this.count; i++) {
            const sx = this.x + i * spikeW;
            // Dark metal base
            ctx.fillStyle = '#44444a';
            ctx.fillRect(sx, this.y + 9, spikeW, 7);
            // Silver spike body with gradient
            const grad = ctx.createLinearGradient(sx, this.y + 9, sx + spikeW, this.y);
            grad.addColorStop(0, '#667788');
            grad.addColorStop(1, '#ccccdd');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(sx + 1, this.y + 9);
            ctx.lineTo(sx + spikeW / 2, this.y);
            ctx.lineTo(sx + spikeW - 1, this.y + 9);
            ctx.closePath();
            ctx.fill();
            // Highlight shine
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath();
            ctx.moveTo(sx + 4, this.y + 7);
            ctx.lineTo(sx + spikeW / 2, this.y + 1);
            ctx.lineTo(sx + spikeW / 2 + 1, this.y + 7);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

let spikes = [];

// === SPEED BOOST POWER-UP ===
class SpeedBoost {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 18;
        this.h = 18;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.12) * 0.1;

        ctx.save();
        // Green glow
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 220, 80, ${0.28 * pulse})`;
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#00bb44';
        ctx.fill();
        ctx.strokeStyle = '#88ffaa';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Shine
        ctx.beginPath();
        ctx.arc(cx - 2.5, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,255,220,0.5)';
        ctx.fill();
        // Lightning bolt
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('⚡', cx, cy + 4);
        ctx.restore();
    }
}

let speedBoosts = [];

// === MAGNET POWER-UP ===
class Magnet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 20;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.12) * 0.1;

        ctx.save();
        // Pink/magenta glow
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 60, 200, ${0.3 * pulse})`;
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#cc00aa';
        ctx.fill();
        ctx.strokeStyle = '#ff88dd';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Shine
        ctx.beginPath();
        ctx.arc(cx - 2.5, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 200, 240, 0.5)';
        ctx.fill();
        // Magnet symbol
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🧲', cx, cy + 4);
        ctx.restore();
    }
}

let magnets = [];

// === FREEZE CRYSTAL POWER-UP ===
class Freeze {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 20;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.1) * 0.1;

        ctx.save();
        // Icy glow
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 220, 255, ${0.3 * pulse})`;
        ctx.fill();
        // Crystal body (hexagon-like)
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const r = 8 * pulse;
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#55ccee';
        ctx.fill();
        ctx.strokeStyle = '#aaeeff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Inner shine
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 245, 255, 0.7)';
        ctx.fill();
        // Snowflake symbol
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('❄', cx, cy + 4);
        ctx.restore();
    }
}

let freezes = [];

function checkFreezeCollisions() {
    for (const f of freezes) {
        if (f.collected) continue;
        if (!aabb(player, f)) continue;
        f.collected = true;
        player.freezeTimer = FREEZE_DURATION;
        // Freeze all alive enemies
        for (const m of marios) {
            if (m.isAlive) m.frozenTimer = FREEZE_DURATION;
        }
        // Ice particles burst
        for (let i = 0; i < 16; i++) {
            const angle = (Math.PI * 2 * i) / 16;
            const spd = 2 + Math.random() * 3;
            particles.push(new DeathParticle(
                f.x + f.w / 2, f.y + f.h / 2,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                i % 2 === 0 ? '#88ddff' : '#ffffff', 5
            ));
        }
        particles.push(new Particle(f.x - 20, f.y - 16, '❄ ЗАМОРОЗКА!', '#88eeff'));
        playSound('star'); // reuse levelup sound
    }
    freezes = freezes.filter(f => !f.collected);
}

// === FEATURE 54: GHOST POWER-UP ===
class Ghost {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.75 + Math.sin(t * 0.1) * 0.25;

        ctx.save();
        // Purple glow
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 100, 255, ${0.25 * pulse})`;
        ctx.fill();
        // Ghost body (teardrop shape)
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = `rgba(220, 200, 255, 0.9)`;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 9 * pulse, Math.PI, 0);
        ctx.lineTo(cx + 9 * pulse, cy + 6 * pulse);
        // Wavy bottom
        ctx.quadraticCurveTo(cx + 6 * pulse, cy + 9 * pulse, cx + 3 * pulse, cy + 6 * pulse);
        ctx.quadraticCurveTo(cx, cy + 10 * pulse, cx - 3 * pulse, cy + 6 * pulse);
        ctx.quadraticCurveTo(cx - 6 * pulse, cy + 9 * pulse, cx - 9 * pulse, cy + 6 * pulse);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(160, 80, 255, 0.6)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#6600cc';
        ctx.beginPath();
        ctx.ellipse(cx - 3 * pulse, cy - 3 * pulse, 2.5, 2, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 3 * pulse, cy - 3 * pulse, 2.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

let ghosts = [];

function checkGhostCollisions() {
    for (const g of ghosts) {
        if (g.collected) continue;
        if (!aabb(player, g)) continue;
        g.collected = true;
        player.ghostTimer = GHOST_DURATION;
        particles.push(new Particle(g.x - 10, g.y - 16, '👻 ПРИЗРАК!', '#cc88ff'));
        playSound('ghost');
    }
    ghosts = ghosts.filter(g => !g.collected);
}


// === FEATURE 61: SCORE BOOST POWER-UP ===
class ScoreBoost {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 20;
        this.h = 20;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.88 + Math.sin(t * 0.14) * 0.12;

        ctx.save();
        // Purple glow
        ctx.beginPath();
        ctx.arc(cx, cy, 15 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 60, 255, ${0.30 * pulse})`;
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#9922ee';
        ctx.fill();
        ctx.strokeStyle = '#dd88ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Inner shine
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 2.5, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(240,200,255,0.45)';
        ctx.fill();
        // "x2" label
        ctx.font = `bold ${Math.round(9 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('x2', cx, cy + 3.5);
        ctx.restore();
    }
}

let scoreBoosts = [];

function checkScoreBoostCollisions() {
    for (const sb of scoreBoosts) {
        if (sb.collected) continue;
        if (!aabb(player, sb)) continue;
        sb.collected = true;
        player.scoreBoostTimer = SCORE_BOOST_DURATION;
        particles.push(new Particle(sb.x - 15, sb.y - 16, '✨ ДВОЙНЫЕ ОЧКИ!', '#dd88ff'));
        playSound('levelup');
    }
    scoreBoosts = scoreBoosts.filter(s => !s.collected);
}

// === FEATURE 72: ELECTRO POWER-UP ===
class Electro {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(t * 0.15) * 0.15;

        ctx.save();
        // Outer electric glow
        ctx.beginPath();
        ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 240, 50, ${0.25 * pulse})`;
        ctx.fill();
        // Inner body (bright yellow-cyan)
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#22ddff';
        ctx.fill();
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Lightning bolt symbol
        ctx.font = `bold ${Math.round(12 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('⚡', cx, cy + 4.5);
        // Sparks (rotating lines)
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
            const angle = (t * 0.06) + (Math.PI / 3) * i;
            const r1 = 11 * pulse;
            const r2 = 15 * pulse;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
            ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
            ctx.stroke();
        }
        ctx.restore();
    }
}

let electricos = [];

function checkElectroCollisions() {
    for (const e of electricos) {
        if (e.collected) continue;
        if (!aabb(player, e)) continue;
        e.collected = true;
        player.electroTimer = ELECTRO_DURATION;
        // Spark burst on pickup
        for (let i = 0; i < 14; i++) {
            const angle = (Math.PI * 2 * i) / 14;
            const spd = 2.5 + Math.random() * 3;
            particles.push(new DeathParticle(
                e.x + e.w / 2, e.y + e.h / 2,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                i % 2 === 0 ? '#ffff44' : '#22ddff', 5
            ));
        }
        particles.push(new Particle(e.x - 20, e.y - 16, '⚡ ЭЛЕКТРО!', '#ffff44'));
        playSound('star');
    }
    electricos = electricos.filter(e => !e.collected);
}

// === FEATURE 75: SLOW-MO POWER-UP ===
class SlowMo {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 20;
        this.h = 20;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.88 + Math.sin(t * 0.13) * 0.12;

        ctx.save();
        // Teal/cyan outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 200, 255, ${0.28 * pulse})`;
        ctx.fill();
        // Inner body
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#0088cc';
        ctx.fill();
        ctx.strokeStyle = '#55ddff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Rotating clock hands
        const angle = t * 0.04;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * 6 * pulse, cy + Math.sin(angle) * 6 * pulse);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle * 0.5) * 4 * pulse, cy + Math.sin(angle * 0.5) * 4 * pulse);
        ctx.stroke();
        // Clock tick marks
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            const a = (Math.PI / 2) * i;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 8 * pulse, cy + Math.sin(a) * 8 * pulse);
            ctx.lineTo(cx + Math.cos(a) * 10 * pulse, cy + Math.sin(a) * 10 * pulse);
            ctx.stroke();
        }
        ctx.restore();
    }
}

let slowMos = [];

// === ROCKET POWER-UP (Feature 80) ===
const ROCKET_DURATION = 120; // 2 seconds at 60fps

class RocketPU {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.88 + Math.sin(t * 0.14) * 0.12;

        ctx.save();
        // Outer glow (orange)
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 140, 0, ${0.3 * pulse})`;
        ctx.fill();
        // Inner body
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#cc4400';
        ctx.fill();
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Rocket icon
        ctx.font = `${Math.round(14 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🚀', cx, cy);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let rockets = [];

function checkRocketCollisions() {
    for (const r of rockets) {
        if (r.collected) continue;
        if (!aabb(player, r)) continue;
        r.collected = true;
        player.rocketTimer = ROCKET_DURATION;
        player.vy = -20; // immediate upward launch
        player.invincibleTimer = Math.max(player.invincibleTimer, ROCKET_DURATION);
        unlockAchievement('rocketeer'); // Feature 79
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 * i) / 12;
            const spd = 2 + Math.random() * 3;
            particles.push(new DeathParticle(
                r.x + r.w / 2, r.y + r.h / 2,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                i % 2 === 0 ? '#ff8800' : '#ffff00', 5
            ));
        }
        particles.push(new Particle(r.x - 25, r.y - 16, '🚀 РАКЕТА!', '#ff8800'));
        playSound('levelup');
    }
    rockets = rockets.filter(r => !r.collected);
}

function renderRocketTrail() {
    if (!player || player.rocketTimer <= 0) return;
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h;
    const intensity = Math.min(1, player.rocketTimer / 30);
    ctx.save();
    for (let i = 0; i < 4; i++) {
        const ox = (Math.random() - 0.5) * 10;
        const oy = Math.random() * 14;
        const r = (3 + Math.random() * 5) * intensity;
        const alpha = (0.4 + Math.random() * 0.5) * intensity;
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,140,0' : '255,60,0'}, ${alpha})`;
        ctx.fill();
    }
    ctx.restore();
}

// === FEATURE 99: JETPACK POWER-UP ===
const JETPACK_DURATION = 300; // 5 seconds at 60fps

class JetpackPU {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 24;
        this.h = 24;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(t * 0.12) * 0.15;

        ctx.save();
        // Outer glow (orange-red)
        ctx.beginPath();
        ctx.arc(cx, cy, 17 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 100, 0, ${0.28 * pulse})`;
        ctx.fill();
        // Body (drum shape)
        ctx.fillStyle = '#cc5500';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 9 * pulse, 11 * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Flame nozzle at bottom
        const flameH = 4 + Math.random() * 4;
        const grad = ctx.createLinearGradient(cx, cy + 8, cx, cy + 8 + flameH);
        grad.addColorStop(0, 'rgba(255,200,0,0.9)');
        grad.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 8 + flameH / 2, 5, flameH / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Icon
        ctx.font = `${Math.round(13 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🛸', cx, cy - 1);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let jetpacks = [];

function checkJetpackCollisions() {
    for (const j of jetpacks) {
        if (j.collected) continue;
        if (!aabb(player, j)) continue;
        j.collected = true;
        player.jetpackTimer = JETPACK_DURATION;
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            const spd = 2 + Math.random() * 3;
            particles.push(new DeathParticle(
                j.x + j.w / 2, j.y + j.h / 2,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                i % 2 === 0 ? '#ff8800' : '#ffdd00', 5
            ));
        }
        particles.push(new Particle(j.x - 30, j.y - 16, '🛸 ДЖЕТПАК!', '#ff8800'));
        playSound('levelup');
    }
    jetpacks = jetpacks.filter(j => !j.collected);
}

function renderJetpackFlame() {
    if (!player || !player.jetpackThrust) return;
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h + 4;
    ctx.save();
    for (let i = 0; i < 5; i++) {
        const ox = (Math.random() - 0.5) * 8;
        const oy = Math.random() * 14;
        const r = (4 + Math.random() * 5);
        const alpha = 0.5 + Math.random() * 0.4;
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        ctx.fillStyle = Math.random() > 0.4 ? `rgba(255,180,0,${alpha})` : `rgba(255,80,0,${alpha})`;
        ctx.fill();
    }
    ctx.restore();
}

// === MAGBOOTS POWER-UP (Feature 85) ===
const MAG_BOOTS_DURATION = 180; // 3 seconds

class MagBootsPU {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 20; this.h = 20;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() { this.animTimer++; return !this.collected; }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(t * 0.14) * 0.15;
        ctx.save();
        // Blue glow halo
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(30,100,255,${0.22 * pulse})`;
        ctx.fill();
        // Boot body
        ctx.fillStyle = '#1155ee';
        ctx.beginPath();
        ctx.roundRect(cx - 7, cy - 5, 14, 10, 3);
        ctx.fill();
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(cx - 8, cy + 4, 16, 4);
        // Orbiting sparks
        for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 / 5) * i + t * 0.09;
            const sr = 13 * pulse;
            ctx.fillStyle = `rgba(120,200,255,${0.5 + Math.sin(t * 0.2 + i) * 0.3})`;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * sr, cy + Math.sin(a) * sr * 0.6, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#aaddff';
        ctx.fillText('🦶', cx, cy - 9);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let magBootsList = [];

function checkMagBootsCollisions() {
    for (const mb of magBootsList) {
        if (mb.collected) continue;
        if (!aabb(player, mb)) continue;
        mb.collected = true;
        player.magBootsTimer = MAG_BOOTS_DURATION;
        particles.push(new Particle(mb.x - 30, mb.y - 16, '🦶 МАГЛАПТИ!', '#4488ff'));
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8;
            const spd = 2 + Math.random() * 2;
            particles.push(new DeathParticle(mb.x + mb.w/2, mb.y + mb.h/2, Math.cos(a) * spd, Math.sin(a) * spd, '#4488ff', 4));
        }
        playSound('coin');
    }
    magBootsList = magBootsList.filter(mb => !mb.collected);
}

function renderMagBootsEffect() {
    if (!player || player.magBootsTimer <= 0) return;
    const cx = player.x + player.w / 2;
    const cy = player.ceilingLocked ? player.y : player.y + player.h;
    const t = Date.now();
    ctx.save();
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i + t * 0.005;
        const r = 18 + Math.sin(t * 0.007 + i) * 4;
        const alpha = 0.3 + Math.abs(Math.sin(t * 0.009 + i * 0.7)) * 0.45;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = player.ceilingLocked ? '#00ff88' : '#4488ff';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

// === FEATURE 87: GIANT MODE POWER-UP ===
const GIANT_DURATION = 360; // 6 seconds

class GiantPU {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 22; this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() { this.animTimer++; return !this.collected; }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(t * 0.13) * 0.15;
        ctx.save();
        // Orange glow halo
        ctx.beginPath();
        ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,100,0,${0.25 * pulse})`;
        ctx.fill();
        // Big mushroom icon
        ctx.fillStyle = '#ff5500';
        ctx.beginPath();
        ctx.arc(cx, cy - 3, 8 * pulse, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#ff8833';
        ctx.fillRect(cx - 5 * pulse, cy - 3, 10 * pulse, 8 * pulse);
        // White spots
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 5, 2 * pulse, 0, Math.PI * 2);
        ctx.arc(cx + 3, cy - 5, 2 * pulse, 0, Math.PI * 2);
        ctx.fill();
        // Orbiting stars
        for (let i = 0; i < 4; i++) {
            const a = (Math.PI * 2 / 4) * i + t * 0.08;
            const sr = 14 * pulse;
            ctx.fillStyle = `rgba(255,200,0,${0.6 + Math.sin(t * 0.15 + i) * 0.3})`;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * sr, cy + Math.sin(a) * sr, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

let giantPUs = [];

// === FEATURE 143: GIFT CHEST ===
// A golden mystery chest that gives a random power-up when opened.
const GIFT_CHEST_BUFFS = [
    { id: 'speed',   label: '⚡ УСКОРЕНИЕ!', color: '#00ff88', apply: () => { player.speedBoostTimer = 300; } },
    { id: 'star',    label: '⭐ ЗВЕЗДА!',     color: '#ffff00', apply: () => { player.starTimer = 600; } },
    { id: 'shield',  label: '🛡 ЩИТ!',        color: '#4488ff', apply: () => { player.shield = true; } },
    { id: 'freeze',  label: '❄ ЗАМОРОЗКА!',  color: '#88ddff', apply: () => { marios.forEach(m => { if (m.isAlive) m.freezeTimer = 240; }); } },
    { id: 'slowmo',  label: '⏱ ЗАМЕДЛЕНИЕ!', color: '#55ddff', apply: () => { player.slowMoTimer = 360; } },
    { id: 'magnet',  label: '🧲 МАГНИТ!',     color: '#ff88cc', apply: () => { player.magnetTimer = 420; } },
];

class GiftChest {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 20; this.h = 18;
        this.collected = false;
        this.animTimer = Math.random() * 60;
        this.bobOffset = Math.random() * Math.PI * 2;
    }
    update() { this.animTimer++; return !this.collected; }
    render() {
        if (this.collected) return;
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07 + this.bobOffset) * 3;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.88 + Math.sin(t * 0.11) * 0.12;
        ctx.save();
        // Gold glow
        ctx.beginPath(); ctx.arc(cx, cy, 15 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,0,${0.22 * pulse})`; ctx.fill();
        // Chest body
        ctx.fillStyle = '#cc8800';
        ctx.fillRect(cx - 9, cy - 6, 18, 13);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(cx - 9, cy - 9, 18, 7);
        // Lid outline
        ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 9, cy - 9, 18, 7);
        ctx.strokeRect(cx - 9, cy - 6, 18, 13);
        // Lock
        ctx.fillStyle = '#ffdd44';
        ctx.fillRect(cx - 2.5, cy - 3.5, 5, 5);
        // "?" label
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('?', cx, cy - 4);
        ctx.restore();
    }
}
let giftChests = [];

function checkGiftChestCollisions() {
    for (const gc of giftChests) {
        if (gc.collected || !aabb(player, gc)) continue;
        gc.collected = true;
        const buff = GIFT_CHEST_BUFFS[Math.floor(Math.random() * GIFT_CHEST_BUFFS.length)];
        buff.apply();
        particles.push(new Particle(gc.x - 20, gc.y - 16, buff.label, buff.color));
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 * i) / 12;
            const spd = 2 + Math.random() * 3;
            particles.push(new DeathParticle(gc.x + gc.w/2, gc.y + gc.h/2, Math.cos(a)*spd, Math.sin(a)*spd, '#ffd700', 5));
        }
        playSound('star');
    }
    giftChests = giftChests.filter(gc => !gc.collected);
}

function checkGiantPUCollisions() {
    for (const g of giantPUs) {
        if (g.collected) continue;
        if (!aabb(player, g)) continue;
        g.collected = true;
        player.giantTimer = GIANT_DURATION;
        particles.push(new Particle(g.x - 20, g.y - 16, '🔴 ГИГАНТ!', '#ff6600'));
        for (let i = 0; i < 10; i++) {
            const a = (Math.PI * 2 * i) / 10;
            const spd = 2 + Math.random() * 3;
            particles.push(new DeathParticle(g.x + g.w/2, g.y + g.h/2, Math.cos(a)*spd, Math.sin(a)*spd, '#ff6600', 5));
        }
        playSound('star');
    }
    giantPUs = giantPUs.filter(g => !g.collected);
}

function checkSlowMoCollisions() {
    for (const sm of slowMos) {
        if (sm.collected) continue;
        if (!aabb(player, sm)) continue;
        sm.collected = true;
        player.slowMoTimer = SLOW_MO_DURATION;
        // Burst particles
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            const spd = 1.5 + Math.random() * 2.5;
            particles.push(new DeathParticle(
                sm.x + sm.w / 2, sm.y + sm.h / 2,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                '#55ddff', 4
            ));
        }
        particles.push(new Particle(sm.x - 20, sm.y - 16, '⏱ ЗАМЕДЛЕНИЕ!', '#55ddff'));
        playSound('freeze');
    }
    slowMos = slowMos.filter(sm => !sm.collected);
}

function updateElectroField() {
    if (!player || player.electroTimer <= 0) return;
    // Kill enemies in radius
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    for (const m of marios) {
        if (!m.isAlive) continue;
        const mcx = m.x + m.w / 2;
        const mcy = m.y + m.h / 2;
        const dx = mcx - pcx;
        const dy = mcy - pcy;
        if (Math.sqrt(dx * dx + dy * dy) <= ELECTRO_RADIUS) {
            // Zap enemy: instant kill (treated as stomp)
            if (m.stomp()) {
                player.score += 150;
                totalScore += 150;
                runStats.enemiesKilled++;
                particles.push(new Particle(m.x, m.y - 10, '+150 ⚡', '#ffff44'));
                // Spark at enemy position
                for (let i = 0; i < 8; i++) {
                    const ang = (Math.PI * 2 * i) / 8;
                    particles.push(new DeathParticle(
                        m.x + m.w / 2, m.y + m.h / 2,
                        Math.cos(ang) * 3, Math.sin(ang) * 3,
                        '#ffff00', 4
                    ));
                }
                playSound('stomp');
            }
        }
    }
}

// === FIREBALL (Shooter enemy projectile) ===
class Fireball {
    constructor(x, y, dir) {
        this.x = x;
        this.y = y;
        this.w = 12;
        this.h = 12;
        this.vx = dir * 5.5;
        this.vy = 0;
        this.alive = true;
        this.animTimer = 0;
    }

    update() {
        this.animTimer++;
        this.x += this.vx;
        // Light gravity on fireball
        this.vy += 0.15;
        this.y += this.vy;
        // Hit platform → bounce once then die
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vy > 0) {
                    this.vy = -this.vy * 0.4;
                    this.y = p.y - this.h;
                    if (Math.abs(this.vy) < 0.5) { this.alive = false; }
                }
            }
        }
        // Out of bounds
        if (this.x < -20 || this.x > W + 20 || this.y > H + 20) this.alive = false;
        return this.alive;
    }

    render() {
        const t = this.animTimer;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const flicker = 0.8 + Math.sin(t * 0.4) * 0.2;
        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * flicker, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 120, 0, 0.35)`;
        ctx.fill();
        // Inner fire
        ctx.beginPath();
        ctx.arc(cx, cy, 5 * flicker, 0, Math.PI * 2);
        ctx.fillStyle = t % 4 < 2 ? '#ff6600' : '#ffcc00';
        ctx.fill();
        // Hot center
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
    }
}

let fireballs = [];

// === FEATURE 101: SPORE PROJECTILE ===
class Spore {
    constructor(x, y, dir) {
        this.x = x;
        this.y = y;
        this.w = 10;
        this.h = 10;
        this.vx = dir * 7.5;
        this.vy = -0.8;
        this.alive = true;
        this.animTimer = 0;
    }

    update() {
        this.animTimer++;
        this.x += this.vx;
        this.vy += 0.12;
        this.y += this.vy;
        if (this.x < -20 || this.x > W + 20 || this.y > H + 20 || this.y < -50) { this.alive = false; return false; }
        for (const p of platforms) {
            if (aabb(this, p)) { this.alive = false; return false; }
        }
        return this.alive;
    }

    render() {
        const t = this.animTimer;
        const pulse = 0.85 + Math.sin(t * 0.35) * 0.15;
        const cx = this.x + 5;
        const cy = this.y + 5;
        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80, 220, 40, 0.28)';
        ctx.fill();
        // Main spore body
        ctx.beginPath();
        ctx.arc(cx, cy, 5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = t % 6 < 3 ? '#44cc22' : '#66ee44';
        ctx.fill();
        // White highlight
        ctx.beginPath();
        ctx.arc(cx - 1.5, cy - 1.5, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = '#ccffbb';
        ctx.fill();
        ctx.restore();
    }
}

let spores = [];

function checkSporeCollisions() {
    if (!player) return;
    for (const s of spores) {
        if (!s.alive) continue;
        for (const mario of marios) {
            if (!mario.isAlive) continue;
            if (!aabb(s, mario)) continue;
            s.alive = false;
            const killed = mario.stomp();
            if (killed) {
                runStats.enemiesKilled++;
                onEnemyKilledStreak(mario.x, mario.y);
                comboCount++;
                let pts = 100 * comboCount;
                if (player.scoreBoostTimer > 0) pts *= 2;
                player.score += pts;
                totalScore += pts;
                comboDisplayTimer = 100;
                if (comboCount > runStats.maxCombo) runStats.maxCombo = comboCount;
                particles.push(new Particle(mario.x, mario.y - 10, `🍄 +${pts}`, '#44cc22'));
            } else {
                particles.push(new Particle(mario.x, mario.y - 10, '💥 ОГЛУШЁН!', '#88ff44'));
            }
            break;
        }
    }
    spores = spores.filter(s => s.alive);
    // Feature 167: spore hits explosive barrel
    for (const s of spores) {
        if (!s.alive) continue;
        for (const barrel of explosiveBarrels) {
            if (barrel.exploded) continue;
            if (!aabb(s, barrel)) continue;
            s.alive = false;
            barrel.explode(barrel.x + barrel.w / 2, barrel.y + barrel.h / 2);
            break;
        }
    }
}

// === FEATURE 105: FLASHLIGHT POWER-UP ===
const FLASHLIGHT_DURATION = 1200; // 20 seconds at 60fps

class FlashlightPU {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 20; this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        if (this.collected) return false;
        this.animTimer++;
        return true;
    }

    render() {
        if (this.collected) return;
        const bob = Math.sin(this.animTimer * 0.07) * 3;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.82 + Math.sin(this.animTimer * 0.13) * 0.18;
        ctx.save();
        // Glow
        ctx.beginPath();
        ctx.arc(cx, cy, 15 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 230, 80, 0.28)';
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#cc9900';
        ctx.fill();
        ctx.strokeStyle = '#ffee44';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Icon
        ctx.font = `bold ${Math.round(9 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffcc';
        ctx.fillText('🔦', cx, cy + 3);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let flashlights = [];

function checkFlashlightCollisions() {
    if (!player) return;
    for (const fl of flashlights) {
        if (fl.collected) continue;
        if (!aabb(player, fl)) continue;
        fl.collected = true;
        player.flashlightTimer = FLASHLIGHT_DURATION;
        particles.push(new Particle(fl.x, fl.y - 10, '🔦 ФОНАРЬ!', '#ffdd44'));
        playSound('levelup');
    }
    flashlights = flashlights.filter(fl => !fl.collected);
}

// === FEATURE 145: BUBBLE SHIELD — translucent protective bubble ===
class BubbleShieldPU {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.12) * 0.1;
        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 17 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150, 230, 255, ${0.2 * pulse})`;
        ctx.fill();
        // Bubble surface
        ctx.beginPath();
        ctx.arc(cx, cy, 11 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180, 240, 255, 0.45)';
        ctx.fill();
        ctx.strokeStyle = '#aaeeff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Shine highlight
        ctx.beginPath();
        ctx.arc(cx - 3 * pulse, cy - 3 * pulse, 3.5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();
        // Symbol
        ctx.font = `bold ${Math.round(11 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,100,140,0.9)';
        ctx.fillText('🫧', cx, cy + 5);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let bubbleShields = [];

// === FEATURE 171: REFLECT SHIELD — fireballs bounce back and kill shooters ===
class ReflectShieldPU {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.12) * 0.1;
        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 180, 40, ${0.25 * pulse})`;
        ctx.fill();
        // Hexagonal body (rotating)
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.035);
        ctx.strokeStyle = '#ffaa22';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = `rgba(255, 200, 60, ${0.35 * pulse})`;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const r = 10 * pulse;
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Icon
        ctx.font = `bold ${Math.round(10 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.rotate(-(t * 0.035)); // un-rotate text
        ctx.fillText('🪃', 0, 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let reflectShields = [];

function checkReflectShieldCollisions() {
    if (!player) return;
    for (const rs of reflectShields) {
        if (rs.collected) continue;
        if (!aabb(player, rs)) continue;
        rs.collected = true;
        player.reflectTimer = REFLECT_SHIELD_DURATION;
        particles.push(new Particle(rs.x, rs.y - 10, '🪃 ОТРАЖЕНИЕ!', '#ffcc44'));
        playSound('levelup');
    }
    reflectShields = reflectShields.filter(rs => !rs.collected);
}

// === FEATURE 173: EARTHQUAKE STOMP — stomp landing shockwave kills nearby grounded enemies for 6s ===
class EarthquakePU {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.07) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.11) * 0.1;
        ctx.save();
        // Outer glow
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18 * pulse);
        grd.addColorStop(0, 'rgba(255,120,0,0.4)');
        grd.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
        ctx.fill();
        // Ground ellipse
        ctx.globalAlpha = 0.5 * pulse;
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 4, 12 * pulse, 4 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Icon
        ctx.font = `bold ${Math.round(14 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('🌋', cx, cy + 5);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let quakePowerUps = [];

function triggerQuake(cx, groundY) {
    const QUAKE_RADIUS = 250;
    let killed = 0;
    for (const m of marios) {
        if (!m.isAlive) continue;
        const dist = Math.abs((m.x + m.w / 2) - cx);
        if (dist > QUAKE_RADIUS) continue;
        if (!m.isGrounded) continue;
        m.stomp();
        const pts = 100;
        totalScore += pts;
        if (player) player.score += pts;
        addScorePopup(m.x + m.w / 2, m.y, '+' + pts);
        particles.push(new Particle(m.x, m.y - 10, '💥 +100', '#ff8800'));
        killed++;
    }
    // Shockwave rings visual
    for (let r = 0; r < 3; r++) {
        particles.push(new Particle(cx - 20, groundY - 5 + r * 8, '~~~', '#ff7700'));
    }
    if (killed > 0) {
        shakeTimer = 8;
        shakeIntensity = 5;
    }
}

function checkQuakePUCollisions() {
    if (!player) return;
    for (const q of quakePowerUps) {
        if (q.collected) continue;
        if (!aabb(player, q)) continue;
        q.collected = true;
        player.quakeTimer = QUAKE_DURATION;
        particles.push(new Particle(q.x, q.y - 10, '🌋 ЗЕМЛЕТРЯС!', '#ff8844'));
        playSound('levelup');
    }
    quakePowerUps = quakePowerUps.filter(q => !q.collected);
}

function checkBubbleShieldCollisions() {
    if (!player) return;
    for (const b of bubbleShields) {
        if (b.collected) continue;
        if (!aabb(player, b)) continue;
        b.collected = true;
        player.bubbleTimer = BUBBLE_DURATION;
        particles.push(new Particle(b.x - 10, b.y - 18, '🫧 ПУЗЫРЬ!', '#aaeeff'));
        playSound('shield');
    }
    bubbleShields = bubbleShields.filter(b => !b.collected);
}

// === FEATURE 148: JUMP BOOST — yellow power-up that boosts jump height 60% for 8s ===
class JumpBoostPU {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.92 + Math.sin(t * 0.14) * 0.08;
        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 230, 60, ${0.22 * pulse})`;
        ctx.fill();
        // Core circle
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 10 * pulse);
        grad.addColorStop(0, '#ffe066');
        grad.addColorStop(1, '#e07b00');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Arrow symbol ↑
        ctx.font = `bold ${Math.round(13 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('↑', cx, cy + 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let jumpBoosts = [];

function checkJumpBoostCollisions() {
    if (!player) return;
    for (const jb of jumpBoosts) {
        if (jb.collected) continue;
        if (!aabb(player, jb)) continue;
        jb.collected = true;
        player.jumpBoostTimer = JUMP_BOOST_DURATION;
        particles.push(new Particle(jb.x - 10, jb.y - 18, '↑ ПРЫЖОК x1.6!', '#ffd700'));
        playSound('powerup');
    }
    jumpBoosts = jumpBoosts.filter(jb => !jb.collected);
}

// === FEATURE 163: SPIKE BOOTS — chain stomp power-up ===
class SpikeBootsPU {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }
    update() {
        this.animTimer++;
        return !this.collected;
    }
    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(t * 0.13) * 0.15;
        ctx.save();
        // Red-orange glow
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 60, 0, ${0.22 + Math.abs(Math.sin(t * 0.08)) * 0.18})`;
        ctx.fill();
        // Boot body
        ctx.fillStyle = '#cc2200';
        ctx.fillRect(cx - 8, cy - 4, 16, 10);
        // Sole
        ctx.fillStyle = '#882200';
        ctx.fillRect(cx - 9, cy + 5, 18, 4);
        // Spikes on bottom
        ctx.fillStyle = '#ffcc00';
        for (let i = 0; i < 4; i++) {
            const sx = cx - 8 + i * 5;
            ctx.beginPath();
            ctx.moveTo(sx, cy + 9);
            ctx.lineTo(sx + 2.5, cy + 15);
            ctx.lineTo(sx + 5, cy + 9);
            ctx.fill();
        }
        // Lace detail
        ctx.strokeStyle = '#ffaa66';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 4);
        ctx.lineTo(cx + 5, cy - 4);
        ctx.stroke();
        // Top trim
        ctx.fillStyle = '#ff5500';
        ctx.fillRect(cx - 8, cy - 8, 16, 5);
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', cx, cy - 1);
        ctx.restore();
    }
}
let spikeBoots = [];

function checkSpikeBootsCollisions() {
    if (!player) return;
    for (const sb of spikeBoots) {
        if (sb.collected) continue;
        if (!aabb(player, sb)) continue;
        sb.collected = true;
        player.spikeBootsTimer = SPIKE_BOOTS_DURATION;
        particles.push(new Particle(sb.x - 10, sb.y - 18, '🥾 ЦЕПНОЙ СТОМП!', '#ff6600'));
        playSound('powerup');
    }
    spikeBoots = spikeBoots.filter(sb => !sb.collected);
}

// === FEATURE 137: HEALING MUSHROOM — green +1 life power-up ===
class HealingMushroom {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 20;
        this.h = 20;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }

    update() {
        this.animTimer++;
        return !this.collected;
    }

    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.08) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(t * 0.12) * 0.15;

        ctx.save();
        // Outer green glow
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 220, 80, ${0.25 + Math.abs(Math.sin(t * 0.07)) * 0.2})`;
        ctx.fill();
        // Mushroom cap (green half-circle)
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 9 * pulse, Math.PI, 0);
        ctx.fillStyle = '#22cc55';
        ctx.fill();
        ctx.strokeStyle = '#44ee77';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // White dots on cap
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(cx - 3, cy - 4, 2 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 4, cy - 5, 1.5 * pulse, 0, Math.PI * 2); ctx.fill();
        // Stem
        ctx.fillStyle = '#f0d0a0';
        ctx.fillRect(cx - 4, cy - 2, 8, 9 * pulse);
        ctx.strokeStyle = '#c8a870';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 4, cy - 2, 8, 9 * pulse);
        // "+" symbol
        ctx.font = `bold ${Math.round(10 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00aa44';
        ctx.shadowBlur = 6;
        ctx.fillText('+', cx, cy + 10);
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

let healingMushrooms = [];

function checkHealingMushroomCollisions() {
    if (!player) return;
    for (const hm of healingMushrooms) {
        if (hm.collected) continue;
        if (!aabb(player, hm)) continue;
        hm.collected = true;
        const maxLives = 5;
        if (player.lives < maxLives) {
            player.lives++;
            particles.push(new Particle(hm.x, hm.y - 10, '❤ +1 ЖИЗНЬ!', '#44ff88'));
        } else {
            // Already at max — convert to score bonus
            player.score += 200;
            totalScore += 200;
            particles.push(new Particle(hm.x, hm.y - 10, '💚 +200', '#44ff88'));
        }
        playSound('star');
    }
    healingMushrooms = healingMushrooms.filter(hm => !hm.collected);
}

// === FEATURE 161: COMPANION DRONE POWER-UP ===
const DRONE_DURATION = 600;        // 10 seconds
const DRONE_SHOOT_INTERVAL = 180;  // shoot every 3 seconds
const DRONE_STUN_FRAMES = 120;     // 2-second stun

class CompanionDronePU {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 22; this.h = 22;
        this.collected = false;
        this.animTimer = Math.random() * 60;
    }
    update() { this.animTimer++; return !this.collected; }
    render() {
        const t = this.animTimer;
        const bob = Math.sin(t * 0.09) * 4;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.9 + Math.sin(t * 0.14) * 0.1;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 140, 0, ${0.25 * pulse})`; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy - 10 * pulse);
        ctx.lineTo(cx + 8 * pulse, cy);
        ctx.lineTo(cx, cy + 10 * pulse);
        ctx.lineTo(cx - 8 * pulse, cy);
        ctx.closePath();
        ctx.fillStyle = '#ff8800'; ctx.fill();
        ctx.strokeStyle = '#ffcc44'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = `bold ${Math.round(11 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('🤖', cx, cy + 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

let dronePowerUps = [];

function checkDronePUCollisions() {
    if (!player) return;
    for (const dp of dronePowerUps) {
        if (dp.collected) continue;
        if (!aabb(player, dp)) continue;
        dp.collected = true;
        player.droneTimer = DRONE_DURATION;
        player.droneShootCooldown = DRONE_SHOOT_INTERVAL;
        particles.push(new Particle(dp.x - 10, dp.y - 18, '🤖 ДРОН!', '#ffaa44'));
        playSound('powerup');
    }
    dronePowerUps = dronePowerUps.filter(dp => !dp.collected);
}

function updateDroneCompanion() {
    if (!player || player.droneTimer <= 0) return;
    player.droneTimer--;
    if (player.droneShootCooldown > 0) { player.droneShootCooldown--; return; }
    let nearest = null, nearestDist = Infinity;
    const px = player.x + player.w / 2, py = player.y + player.h / 2;
    for (const m of marios) {
        if (!m.isAlive) continue;
        const d = Math.hypot(m.x + m.w / 2 - px, m.y + m.h / 2 - py);
        if (d < nearestDist) { nearestDist = d; nearest = m; }
    }
    if (nearest) {
        nearest.frozenTimer = DRONE_STUN_FRAMES;
        player.droneShootCooldown = DRONE_SHOOT_INTERVAL;
        const ex = nearest.x + nearest.w / 2, ey = nearest.y + nearest.h / 2;
        for (let i = 0; i < 6; i++) {
            const t = i / 5;
            particles.push(new DeathParticle(
                px + (ex - px) * t + (Math.random() - 0.5) * 20,
                py + (ey - py) * t + (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, '#88ccff', 2));
        }
        particles.push(new Particle(nearest.x, nearest.y - 12, '⚡ ОГЛУШЁН!', '#88aaff'));
        playSound('freeze');
    }
}

function renderDroneCompanion() {
    if (!player || player.droneTimer <= 0) return;
    const t = Date.now() * 0.003;
    const orbitR = 38;
    const pcx = player.x + player.w / 2, pcy = player.y + player.h / 2 - 10;
    const dx = pcx + Math.cos(t) * orbitR;
    const dy = pcy + Math.sin(t) * orbitR;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pcx, pcy, orbitR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,150,50,0.18)';
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(dx, dy, 11, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,130,30,${0.3 + Math.sin(t * 4) * 0.1})`; ctx.fill();
    const ps = 0.9 + Math.sin(t * 5) * 0.1;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 8 * ps);
    ctx.lineTo(dx + 6 * ps, dy);
    ctx.lineTo(dx, dy + 8 * ps);
    ctx.lineTo(dx - 6 * ps, dy);
    ctx.closePath();
    ctx.fillStyle = '#ff7700'; ctx.fill();
    ctx.strokeStyle = '#ffcc44'; ctx.lineWidth = 1.2; ctx.stroke();
    if (player.droneShootCooldown > 0) {
        const frac = 1 - player.droneShootCooldown / DRONE_SHOOT_INTERVAL;
        ctx.beginPath();
        ctx.arc(dx, dy, 10, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = '#88ccff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
}

function renderFlashlightEffect() {
    if (!player || player.flashlightTimer <= 0) return;
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    const radius = 140 + Math.sin(Date.now() * 0.003) * 8;
    // Dark overlay with radial gradient hole around player
    ctx.save();
    // Draw solid dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.80)';
    ctx.fillRect(0, 0, W, H);
    // Carve light hole using destination-out composite operation
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.9)');
    grad.addColorStop(0.85, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // Warm light tint inside the radius
    ctx.save();
    const warmGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.6);
    warmGrad.addColorStop(0, 'rgba(255, 220, 120, 0.07)');
    warmGrad.addColorStop(1, 'rgba(255, 180, 60, 0)');
    ctx.fillStyle = warmGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

function checkFireballCollisions() {
    if (!player) return;
    if (player.ghostTimer > 0) { fireballs = fireballs.filter(fb => fb.alive); return; } // Feature 54: ghost passes through fireballs
    for (const fb of fireballs) {
        if (!fb.alive) continue;
        if (!aabb(player, fb)) continue;
        // Feature 171: Reflect Shield — bounce fireball back
        if (player.reflectTimer > 0 && !fb.reflected) {
            fb.vx = -fb.vx * 1.3;
            fb.vy = -Math.abs(fb.vy) - 1;
            fb.reflected = true;
            particles.push(new Particle(fb.x, fb.y, '↩ ОТРАЖЕНО!', '#ffcc44'));
            playSound('hurt');
            continue;
        }
        fb.alive = false;
        if (player.invincibleTimer > 0 || player.starTimer > 0) continue;
        if (player.shieldActive) {
            player.shieldActive = false;
            player.shieldBreakTimer = 20;
            player.invincibleTimer = 60;
            particles.push(new Particle(player.x, player.y - 10, 'ЩИТ!', '#4488ff'));
            playSound('hurt');
        } else {
            player.die();
        }
    }
    fireballs = fireballs.filter(fb => fb.alive);
    // Feature 171: reflected fireballs can kill shooters
    for (const fb of fireballs) {
        if (!fb.alive || !fb.reflected) continue;
        for (const m of marios) {
            if (!m.isAlive || m.type !== 'shooter') continue;
            if (aabb(fb, m)) {
                fb.alive = false;
                m.stomp();
                const pts = 200;
                if (player) { player.score += pts; }
                totalScore += pts;
                addScorePopup(m.x, m.y, pts);
                particles.push(new Particle(m.x, m.y - 15, '🎯 +200', '#ffcc44'));
                break;
            }
        }
    }
    fireballs = fireballs.filter(fb => fb.alive);
}

function checkMagnetCollisions() {
    for (const m of magnets) {
        if (m.collected) continue;
        if (!aabb(player, m)) continue;
        m.collected = true;
        player.magnetTimer = MAGNET_DURATION;
        particles.push(new Particle(m.x, m.y - 10, '🧲 МАГНИТ!', '#ff44cc'));
        playSound('levelup');
    }
    magnets = magnets.filter(m => !m.collected);
}

function checkSpeedBoostCollisions() {
    for (const sb of speedBoosts) {
        if (sb.collected) continue;
        if (!aabb(player, sb)) continue;
        sb.collected = true;
        player.speedBoostTimer = SPEED_BOOST_DURATION;
        particles.push(new Particle(sb.x, sb.y - 10, '⚡ УСКОРЕНИЕ!', '#00ff88'));
        playSound('levelup');
    }
    speedBoosts = speedBoosts.filter(s => !s.collected);
}

function checkSpringCollisions() {
    if (!player) return;
    for (const sp of springPads) {
        const playerBottom = player.y + player.h;
        const overlapY = playerBottom - sp.y;
        if (player.vy > 0 && overlapY >= 0 && overlapY <= 16 &&
            player.x + player.w > sp.x + 4 && player.x < sp.x + sp.w - 4) {
            player.y = sp.y - player.h;
            player.vy = PLAYER_JUMP * 2.2; // super jump
            player.isGrounded = false;
            player.jumpCount = 0;
            player.canDoubleJump = true;
            player.scaleX = 0.6;
            player.scaleY = 1.45;
            sp.compressTimer = 18;
            particles.push(new Particle(sp.x + sp.w / 2 - 20, sp.y - 15, '🌀 ПРУЖИНА!', '#ff8800'));
            playSound('spring');
        }
    }
}

function checkShieldCollisions() {
    for (const sh of shields) {
        if (sh.collected) continue;
        if (aabb(player, sh)) {
            sh.collected = true;
            player.shieldActive = true;
            particles.push(new Particle(sh.x, sh.y - 10, '🛡 ЩИТ!', '#4488ff'));
            playSound('levelup');
        }
    }
    shields = shields.filter(s => !s.collected);
}

// === WEATHER SYSTEM ===
let weatherParticles = [];
let currentWeatherType = null;

function initWeather(levelIndex) {
    weatherParticles = [];
    currentWeatherType = levelIndex >= 6 ? 'snow' : levelIndex >= 4 ? 'rain' : null;
    if (!currentWeatherType) return;
    const count = currentWeatherType === 'rain' ? 80 : 50;
    for (let i = 0; i < count; i++) {
        weatherParticles.push(spawnWeatherParticle(true));
    }
}

function spawnWeatherParticle(randomY = false) {
    if (currentWeatherType === 'rain') {
        return {
            x: Math.random() * W,
            y: randomY ? Math.random() * H : -10,
            vy: 8 + Math.random() * 5,
            vx: -1.5 - Math.random() * 1.5,
            len: 10 + Math.random() * 8,
            alpha: 0.25 + Math.random() * 0.3,
        };
    }
    return {
        x: Math.random() * W,
        y: randomY ? Math.random() * H : -10,
        vy: 1 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.8,
        size: 2 + Math.random() * 3,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.03,
        alpha: 0.5 + Math.random() * 0.5,
    };
}

function updateWeather() {
    if (!currentWeatherType) return;
    for (const p of weatherParticles) {
        if (currentWeatherType === 'rain') {
            p.x += p.vx;
            p.y += p.vy;
            if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
            if (p.x < 0) p.x = W;
        } else {
            p.wobble += p.wobbleSpeed;
            p.x += p.vx + Math.sin(p.wobble) * 0.5;
            p.y += p.vy;
            if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
            if (p.x < 0) p.x = W;
            if (p.x > W) p.x = 0;
        }
    }
}

function renderWeather() {
    if (!currentWeatherType || weatherParticles.length === 0) return;
    ctx.save();
    for (const p of weatherParticles) {
        ctx.globalAlpha = p.alpha;
        if (currentWeatherType === 'rain') {
            ctx.strokeStyle = '#aaddff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.vx * 1.5, p.y - p.len);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#eeeeff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

function checkStarCollisions() {
    for (const star of stars) {
        if (star.collected) continue;
        if (aabb(player, star)) {
            star.collected = true;
            player.starTimer = STAR_DURATION;
            unlockAchievement('starPower');
            particles.push(new Particle(star.x, star.y - 10, '⭐ ЗВЕЗДА!', '#ffff00'));
            playSound('levelup');
        }
    }
    stars = stars.filter(s => !s.collected);
}

// === DEATH PARTICLES ===
// === FEATURE 152: DASH SHADOW CLONE — ghost silhouette at dash origin ===
class DashShadow {
    constructor(x, y, w, h, facingRight) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.facingRight = facingRight;
        this.timer = 18;
        this.maxTimer = 18;
    }

    update() {
        this.timer--;
        return this.timer > 0;
    }

    render() {
        const alpha = (this.timer / this.maxTimer) * 0.55;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#88aaff';
        // Body
        ctx.fillRect(this.x + 3, this.y + this.h * 0.45, this.w - 6, this.h * 0.55);
        // Head cap (mushroom shape)
        ctx.beginPath();
        ctx.ellipse(cx, this.y + this.h * 0.3, this.w * 0.48, this.h * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

let dashShadows = [];

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

// Feature 117: Star burst effect on stomp kill
function spawnStarBurst(cx, cy, comboN) {
    const starColors = ['#ffee00', '#ffffff', '#ffaa00', '#ff88ff', '#88ffff'];
    const count = 8 + Math.min(comboN * 3, 12); // more stars for higher combos
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speed = 1.5 + Math.random() * 3;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 1;
        const color = starColors[Math.floor(Math.random() * starColors.length)];
        const p = new DeathParticle(cx, cy, vx, vy, color, 2 + Math.floor(Math.random() * 3));
        p.gravity = 0.08;              // star bursts drift gently
        p.timer = 50 + Math.random() * 30;
        p.maxTimer = p.timer;
        particles.push(p);
    }
    // Ring flash: brief screen flash at kill position
    particles.push(new Particle(cx - 10, cy - 10, '✨', '#ffee88'));
}

// === TELEPORT PORTALS (Feature 49) ===
class Portal {
    constructor(x, y, color, linkedPortal = null) {
        this.x = x;
        this.y = y;
        this.w = 22;
        this.h = 44;
        this.color = color; // 'blue' | 'orange'
        this.linked = linkedPortal; // set after creation
        this.animTimer = Math.random() * 60;
        this.cooldown = 0; // prevent teleport loop
    }

    update() {
        this.animTimer++;
        if (this.cooldown > 0) this.cooldown--;
    }

    render() {
        const t = this.animTimer;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const spin = t * 0.06;
        const pulse = 0.88 + Math.sin(t * 0.09) * 0.12;
        const isBlue = this.color === 'blue';
        const mainColor = isBlue ? '#2255ff' : '#ff8800';
        const glowColor = isBlue ? 'rgba(60,120,255,0.35)' : 'rgba(255,140,0,0.35)';

        ctx.save();
        // Outer glow oval
        ctx.beginPath();
        ctx.ellipse(cx, cy, (this.w / 2 + 10) * pulse, (this.h / 2 + 8) * pulse, spin * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.fill();
        // Portal body (swirling ellipse)
        ctx.beginPath();
        ctx.ellipse(cx, cy, this.w / 2 * pulse, this.h / 2 * pulse, 0, 0, Math.PI * 2);
        ctx.fillStyle = isBlue ? '#0033cc' : '#cc5500';
        ctx.fill();
        // Inner swirl rings
        for (let i = 0; i < 3; i++) {
            const r = (0.7 - i * 0.2) * pulse;
            ctx.beginPath();
            ctx.ellipse(cx, cy, this.w / 2 * r, this.h / 2 * r, spin + i * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = isBlue ? `rgba(100,180,255,${0.7 - i * 0.2})` : `rgba(255,200,80,${0.7 - i * 0.2})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        // Center bright dot
        ctx.beginPath();
        ctx.arc(cx, cy, 4 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        // Label above
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = mainColor;
        ctx.fillText(isBlue ? '●' : '●', cx, this.y - 4);
        ctx.restore();
    }
}

let portalPairs = []; // each pair: [portalA, portalB]

function checkPortalCollisions() {
    if (!player) return;
    // Feature 119: after spawning or teleporting the player must step out of every portal first
    if (player.portalLock) {
        if (!portalPairs.some(([a, b]) => aabb(player, a) || aabb(player, b))) player.portalLock = false;
        return;
    }
    for (const [pA, pB] of portalPairs) {
        // Check blue portal entry
        if (pA.cooldown <= 0 && pB.cooldown <= 0 && aabb(player, pA)) {
            player.x = pB.x + pB.w / 2 - player.w / 2;
            player.y = pB.y + pB.h / 2 - player.h / 2;
            player.portalLock = true;
            pA.cooldown = 45;
            pB.cooldown = 45;
            // Teleport flash particles
            for (let i = 0; i < 10; i++) {
                const angle = (Math.PI * 2 * i) / 10;
                particles.push(new DeathParticle(
                    pB.x + pB.w / 2, pB.y + pB.h / 2,
                    Math.cos(angle) * 3, Math.sin(angle) * 3, '#88aaff', 4
                ));
            }
            particles.push(new Particle(player.x, player.y - 14, '🌀 ПОРТАЛ!', '#88aaff'));
            playSound('levelup');
            break;
        }
        // Check orange portal entry (bidirectional)
        if (pA.cooldown <= 0 && pB.cooldown <= 0 && aabb(player, pB)) {
            player.x = pA.x + pA.w / 2 - player.w / 2;
            player.y = pA.y + pA.h / 2 - player.h / 2;
            player.portalLock = true;
            pA.cooldown = 45;
            pB.cooldown = 45;
            for (let i = 0; i < 10; i++) {
                const angle = (Math.PI * 2 * i) / 10;
                particles.push(new DeathParticle(
                    pA.x + pA.w / 2, pA.y + pA.h / 2,
                    Math.cos(angle) * 3, Math.sin(angle) * 3, '#ffaa44', 4
                ));
            }
            particles.push(new Particle(player.x, player.y - 14, '🌀 ПОРТАЛ!', '#ffaa44'));
            playSound('levelup');
            break;
        }
    }
}

// Feature 52: Jump smoke effect
function spawnJumpSmoke(cx, cy, isDouble = false) {
    const count = isDouble ? 8 : 5;
    const color1 = 'rgba(200,200,200,0.7)';
    const color2 = isDouble ? '#aaeeff' : 'rgba(180,180,180,0.5)';
    for (let i = 0; i < count; i++) {
        const vx = (Math.random() - 0.5) * (isDouble ? 4.5 : 3);
        const vy = -(0.5 + Math.random() * (isDouble ? 2.5 : 1.5));
        const sz = 3 + Math.floor(Math.random() * (isDouble ? 5 : 3));
        particles.push(new DeathParticle(cx + (Math.random() - 0.5) * 14, cy, vx, vy, i % 2 === 0 ? color1 : color2, sz));
    }
}

// === FEATURE 132: GROUND POUND EFFECT ===
function groundPoundEffect(cx, groundY) {
    shakeTimer = 16; shakeIntensity = 7;
    // Shockwave ring particles radiating outward
    for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const speed = 3.5 + Math.random() * 2.5;
        const col = i % 2 === 0 ? '#ff8800' : '#ffdd44';
        const p = new DeathParticle(cx, groundY, Math.cos(angle) * speed, Math.sin(angle) * speed * 0.6 - 1, col, 4 + Math.floor(Math.random() * 4));
        particles.push(p);
    }
    // Kill/damage enemies in radius
    let killCount = 0;
    for (const e of marios) {
        if (!e.isAlive) continue;
        const dx = (e.x + e.w / 2) - cx;
        const dy = (e.y + e.h / 2) - groundY;
        if (Math.sqrt(dx * dx + dy * dy) <= 110) {
            const killed = e.stomp();
            if (killed) { killCount++; }
        }
    }
    if (killCount > 0) {
        for (let _k = 0; _k < killCount; _k++) onEnemyKilledStreak(cx, groundY);
        comboCount += killCount;
        let pts = killCount * 150 * Math.max(1, comboCount);
        if (player.scoreBoostTimer > 0) pts *= 2;
        player.score += pts;
        totalScore += pts;
        comboDisplayTimer = 120;
        addScorePopup(cx - 20, groundY - 40, pts);
        particles.push(new Particle(cx - 40, groundY - 50, `💥 УДАР! +${pts}`, '#ff8800'));
        runStats.enemiesKilled += killCount;
    }
    playSound('bomb');
}

// === CHECKPOINTS ===
class Checkpoint {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 16;
        this.h = 50;
        this.activated = false;
        this.animTimer = 0;
    }

    update() {
        this.animTimer++;
        if (!this.activated && player && aabb(player, this)) {
            this.activated = true;
            player.checkpointSpawn = { x: this.x - 8, y: this.y + 2 };
            particles.push(new Particle(this.x - 20, this.y - 25, '✅ ЧЕКПОИНТ!', '#00ff88'));
            playSound('levelup');
        }
    }

    render() {
        const t = this.animTimer;
        const poleH = 46;
        const px = this.x + 5;
        ctx.save();

        // Glow behind pole when activated
        if (this.activated) {
            const glow = 0.3 + Math.abs(Math.sin(t * 0.07)) * 0.25;
            ctx.globalAlpha = glow;
            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.arc(px, this.y + poleH / 2, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Flagpole
        ctx.strokeStyle = this.activated ? '#55cc66' : '#999999';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, this.y + poleH);
        ctx.lineTo(px, this.y);
        ctx.stroke();

        // Pole ball top
        ctx.fillStyle = this.activated ? '#ffdd00' : '#aaaaaa';
        ctx.beginPath();
        ctx.arc(px, this.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Flag (waves when active)
        const wave = this.activated ? Math.sin(t * 0.13) * 3 : 0;
        ctx.fillStyle = this.activated ? '#00cc44' : '#888888';
        ctx.beginPath();
        ctx.moveTo(px, this.y + 4);
        ctx.lineTo(px + 20 + wave, this.y + 11);
        ctx.lineTo(px, this.y + 22);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

let checkpoints = [];

// === BOSS MARIO ===
class BossMarco extends Entity {
    constructor(x, y) {
        super(x, y, 72, 90);
        this.hp = 5;
        this.maxHp = 5;
        this.speed = 1.3;
        this.direction = -1;
        this.isAlive = true;
        this.isGrounded = false;
        this.deathTimer = 0;
        this.invTimer = 0;    // invincibility after each hit
        this.animFrame = 0;
        this.animTimer = 0;
        this.slamCooldown = 200; // frames until first slam
        this.isSlaming = false;  // in the air for slam
        this.shockwaveTimer = 0;
    }

    update() {
        if (!this.isAlive) {
            this.deathTimer--;
            if (this.deathTimer % 8 === 0) spawnExplosionParticles(
                this.x + Math.random() * this.w, this.y + Math.random() * this.h);
            return this.deathTimer > 0;
        }

        if (this.invTimer > 0) this.invTimer--;
        if (this.slamCooldown > 0) this.slamCooldown--;
        if (this.shockwaveTimer > 0) this.shockwaveTimer--;

        const speedMult = this.hp <= 2 ? 2.0 : 1;

        // Ground slam attack
        if (this.slamCooldown <= 0 && this.isGrounded && !this.isSlaming) {
            this.vy = -16;
            this.isGrounded = false;
            this.isSlaming = true;
            this.slamCooldown = 260;
            shakeTimer = 4; shakeIntensity = 2;
        }

        // Walk (face player when low HP)
        if (player && this.hp <= 3 && this.isGrounded) {
            this.direction = player.x < this.x ? -1 : 1;
        }
        this.vx = this.speed * speedMult * this.direction;

        // Gravity
        this.vy += GRAVITY * levelGravityMult;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;

        // Animation
        this.animTimer++;
        if (this.animTimer > 10) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }

        // Move X
        this.x += this.vx;
        this.resolveBossX();

        // Move Y
        const wasGrounded = this.isGrounded;
        this.isGrounded = false;
        this.y += this.vy;
        this.resolveBossY();

        // Landing shockwave
        if (!wasGrounded && this.isGrounded && this.isSlaming) {
            this.isSlaming = false;
            this.shockwaveTimer = 35;
            shakeTimer = 18; shakeIntensity = 8;
            particles.push(new Particle(this.x + this.w / 2 - 50, this.y - 20, '💥 УДАР!', '#ff6600'));
            // Shockwave damage to player
            if (player && player.invincibleTimer <= 0 && player.starTimer <= 0) {
                const hDist = Math.abs((player.x + player.w / 2) - (this.x + this.w / 2));
                const playerNearGround = player.y + player.h > this.y + this.h - 60;
                if (hDist < 140 && playerNearGround) {
                    if (player.shieldActive) {
                        player.shieldActive = false;
                        player.shieldBreakTimer = 20;
                        player.invincibleTimer = 60;
                        unlockAchievement('shieldUser');
                        playSound('hurt');
                    } else {
                        player.die();
                    }
                }
            }
        }

        // Reverse at bounds
        if (this.x <= 0 || this.x + this.w >= W) {
            this.direction *= -1;
            this.x = Math.max(0, Math.min(this.x, W - this.w));
        }

        return true;
    }

    resolveBossX() {
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vx > 0) { this.x = p.x - this.w; }
                else if (this.vx < 0) { this.x = p.x + p.w; }
                this.direction *= -1;
                this.vx = 0;
            }
        }
    }

    resolveBossY() {
        for (const p of platforms) {
            if (aabb(this, p)) {
                if (this.vy > 0) { this.y = p.y - this.h; this.vy = 0; this.isGrounded = true; }
                else if (this.vy < 0) { this.y = p.y + p.h; this.vy = 0; }
            }
        }
    }

    stomp(fromStar = false) {
        const invDur = fromStar ? 20 : 60;
        if (this.invTimer > 0) return false;
        this.hp--;
        this.invTimer = invDur;
        spawnDeathParticles(this.x + this.w * 0.25, this.y, this.w * 0.5, this.h * 0.4);
        shakeTimer = 8; shakeIntensity = 5;
        playSound('stomp');
        if (this.hp <= 0) {
            this.isAlive = false;
            this.deathTimer = 90;
            return true;
        }
        return false;
    }

    render() {
        if (this.invTimer > 0 && Math.floor(this.invTimer / 4) % 2 === 0) {
            this.renderHPBar(); return;
        }

        // Shockwave rings on landing
        if (this.shockwaveTimer > 0) {
            const elapsed = 35 - this.shockwaveTimer;
            const r = elapsed * 6;
            const alpha = this.shockwaveTimer / 35;
            ctx.save();
            ctx.globalAlpha = alpha * 0.65;
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.ellipse(this.x + this.w / 2, this.y + this.h - 2, r, r * 0.25, 0, 0, Math.PI);
            ctx.stroke();
            ctx.restore();
        }

        drawShadow(this.x, this.y + this.h, this.w);

        // 3x scale Mario sprite
        ctx.save();
        const px = 5.5;
        const spriteW = 12 * px;
        const spriteH = 13 * px;
        const drawX = this.x + (this.w - spriteW) / 2;
        const drawY = this.y + this.h - spriteH;
        if (this.direction < 0) {
            ctx.translate(drawX + spriteW, drawY);
            ctx.scale(-1, 1);
            drawPixelSprite(0, 0, px, MARIO_SPRITE);
        } else {
            ctx.translate(drawX, drawY);
            drawPixelSprite(0, 0, px, MARIO_SPRITE);
        }
        ctx.restore();

        this.renderHPBar();

        // BOSS label
        ctx.save();
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText('👑 МАРИО БОСС', this.x + this.w / 2 + 1, this.y - 16);
        ctx.fillStyle = '#ff3333';
        ctx.fillText('👑 МАРИО БОСС', this.x + this.w / 2, this.y - 17);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    renderHPBar() {
        const bw = this.w + 14;
        const bh = 8;
        const bx = this.x - 7;
        const by = this.y - 13;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = this.hp > 2 ? '#cc0000' : '#ff4400';
        ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
        ctx.restore();
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
        // Feature 126: outlined text is baked once per particle (strokeText every frame was costly)
        if (!this.bmp || this.bmpScale !== renderScale) {
            ctx.font = 'bold 18px monospace';
            this.bmpW = Math.ceil(ctx.measureText(this.text).width) + 8;
            this.bmp = renderToBitmap(this.bmpW, 30, () => {
                ctx.font = 'bold 18px monospace';
                ctx.fillStyle = this.color;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.strokeText(this.text, 4, 22);
                ctx.fillText(this.text, 4, 22);
            });
            this.bmpScale = renderScale;
        }
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.timer / 15);
        ctx.drawImage(this.bmp, this.x - 4, this.y - 22, this.bmpW, 30);
        ctx.restore();
    }
}

// === FEATURE 88: SCORE POPUPS — bigger, color-graded floating score indicators ===
let scorePopups = [];

class ScorePopup {
    constructor(x, y, pts) {
        this.x = x;
        this.y = y;
        this.pts = pts;
        this.maxLife = 75;
        this.life = this.maxLife;
        this.vy = -2.2;
        // Scale starts large, settles down
        this.scale = 1.5;
        // Color grade by point value
        if (pts >= 1000)      this.color = '#ff00ff';
        else if (pts >= 500)  this.color = '#ff4400';
        else if (pts >= 200)  this.color = '#ff9900';
        else if (pts >= 100)  this.color = '#ffdd00';
        else                  this.color = '#ffffff';
    }

    update() {
        this.y += this.vy;
        this.vy *= 0.93;
        this.scale = Math.max(1.0, this.scale - 0.03);
        this.life--;
        return this.life > 0;
    }

    render() {
        const alpha = Math.min(1, this.life / 20);
        const text = `+${this.pts}`;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        const fs = Math.round(22 * this.scale);
        ctx.font = `bold ${fs}px monospace`;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 4;
        ctx.strokeText(text, this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.fillText(text, this.x, this.y);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

function addScorePopup(x, y, pts) {
    scorePopups.push(new ScorePopup(x + 16, y - 8, pts));
}

// === FEATURE 160: KILL FEED — FPS-style panel showing recent kills ===
let killFeed = [];
const KILL_FEED_MAX = 4;
const KILL_FEED_LIFE = 180; // 3 seconds at 60fps

const MARIO_TYPE_LABELS = {
    normal:     { icon: '🍄', name: 'Марио'    },
    fast:       { icon: '💨', name: 'Быстрый'  },
    jumpy:      { icon: '🦘', name: 'Прыгун'   },
    armored:    { icon: '🛡', name: 'Броня'    },
    flying:     { icon: '✈', name: 'Летун'     },
    shooter:    { icon: '🎯', name: 'Снайпер'  },
    berserker:  { icon: '💀', name: 'Берсерк'  },
    ghost_mario:{ icon: '👻', name: 'Призрак'  },
    teleporter: { icon: '⚡', name: 'Телепорт' },
    parachute:  { icon: '🪂', name: 'Парашют'  },
};

function addKillFeedEntry(marioType, pts) {
    const info = MARIO_TYPE_LABELS[marioType] || { icon: '❌', name: marioType };
    killFeed.unshift({ icon: info.icon, name: info.name, pts, timer: KILL_FEED_LIFE });
    if (killFeed.length > KILL_FEED_MAX) killFeed.length = KILL_FEED_MAX;
}

function updateKillFeed() {
    killFeed = killFeed.filter(e => { e.timer--; return e.timer > 0; });
}

function renderKillFeed() {
    if (killFeed.length === 0) return;
    if (coinCaveMode) return; // not relevant in coin cave
    ctx.save();
    const entryH = 20;
    const panelW = 138;
    const panelX = W - panelW - 8;
    const panelY = 44; // below HUD top strip
    killFeed.forEach((entry, i) => {
        const fadeAlpha = Math.min(1, entry.timer / 30);
        const y = panelY + i * (entryH + 3);
        ctx.globalAlpha = fadeAlpha * 0.85;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(panelX, y, panelW, entryH, 4);
        ctx.fill();
        ctx.globalAlpha = fadeAlpha;
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ddaaff';
        ctx.fillText(`${entry.icon} ${entry.name}`, panelX + 5, y + 13);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(`+${entry.pts}`, panelX + panelW - 4, y + 13);
    });
    ctx.textAlign = 'left';
    ctx.restore();
}

// === RUN STATISTICS ===
let runStats = { enemiesKilled: 0, coinsCollected: 0, maxCombo: 0, levelsCleared: 0, deaths: 0 }; // Feature 63: deaths counter
function resetRunStats() {
    runStats = { enemiesKilled: 0, coinsCollected: 0, maxCombo: 0, levelsCleared: 0, deaths: 0 };
}

// === FEATURE 110: PRESTIGE TITLE SYSTEM ===
const PRESTIGE_TITLES = [
    { minKills: 1000, title: '☠️ Истребитель Марио',   color: '#ff2222' },
    { minKills: 500,  title: '🔥 Легенда Грибного леса', color: '#ff7700' },
    { minKills: 200,  title: '⚔️ Великий Охотник',       color: '#ffcc00' },
    { minKills: 50,   title: '🍄 Опытный Гриб',          color: '#88ff44' },
    { minKills: 10,   title: '🌱 Начинающий',            color: '#aaddff' },
    { minKills: 0,    title: '🥚 Новичок',               color: '#cccccc' },
];
function getPrestigeTitle() {
    const kills = allTimeStats.enemiesKilled;
    for (const tier of PRESTIGE_TITLES) {
        if (kills >= tier.minKills) return tier;
    }
    return PRESTIGE_TITLES[PRESTIGE_TITLES.length - 1];
}

// === FEATURE 108: ALL-TIME PERSISTENT STATISTICS ===
const ALL_TIME_STATS_KEY = 'mushroomAllTimeStats';
let allTimeStats = { enemiesKilled: 0, coinsCollected: 0, deaths: 0, gamesPlayed: 0, levelsCleared: 0, maxCombo: 0, wins: 0 };
try { allTimeStats = { ...allTimeStats, ...JSON.parse(localStorage.getItem(ALL_TIME_STATS_KEY) || '{}') }; } catch {}
function saveAllTimeStats() { localStorage.setItem(ALL_TIME_STATS_KEY, JSON.stringify(allTimeStats)); }
function mergeRunIntoAllTime() {
    allTimeStats.enemiesKilled += runStats.enemiesKilled;
    allTimeStats.coinsCollected += runStats.coinsCollected;
    allTimeStats.deaths += runStats.deaths;
    allTimeStats.levelsCleared += runStats.levelsCleared;
    if (runStats.maxCombo > allTimeStats.maxCombo) allTimeStats.maxCombo = runStats.maxCombo;
    saveAllTimeStats();
}

// === FEATURE 111: COIN RAIN RANDOM EVENT ===
let coinRainTimer = 0;          // frames remaining for coin rain effect
let coinRainSpawnTimer = 0;     // frames until next coin spawned during rain
let coinRainBannerTimer = 0;    // banner display timer
const COIN_RAIN_DURATION = 360; // 6 seconds
const COIN_RAIN_INTERVAL = 8;   // 1 coin every 8 frames
// Random trigger check: call once per level periodically
let coinRainEventInterval = 0;  // countdown to next chance
const COIN_RAIN_CHECK_INTERVAL = 600; // check every 10s

function updateCoinRain() {
    if (!player || survivalMode) return;
    // Countdown to next event check
    if (coinRainEventInterval > 0) {
        coinRainEventInterval--;
    } else if (coinRainTimer <= 0) {
        coinRainEventInterval = COIN_RAIN_CHECK_INTERVAL;
        // 20% chance per check to trigger coin rain
        if (Math.random() < 0.20) {
            coinRainTimer = COIN_RAIN_DURATION;
            coinRainBannerTimer = 120;
            coinRainSpawnTimer = 0;
            playSound('star');
            particles.push(new Particle(W / 2 - 70, H / 2 - 40, '🪙 МОНЕТНЫЙ ДОЖДЬ!', '#ffd700'));
        }
    }
    if (coinRainTimer > 0) {
        coinRainTimer--;
        coinRainSpawnTimer--;
        if (coinRainSpawnTimer <= 0) {
            coinRainSpawnTimer = COIN_RAIN_INTERVAL;
            const rx = 30 + Math.random() * (W - 60);
            const rc = new Coin(rx, -16);
            rc.vy = 1 + Math.random() * 1.5; // initial falling velocity
            rc.isDropped = true;              // use existing physics (gravity + platform landing)
            coins.push(rc);
        }
    }
    if (coinRainBannerTimer > 0) coinRainBannerTimer--;
}

// === FEATURE 107: BETWEEN-LEVEL UPGRADE SHOP ===
let shopCoins = 0;          // coins accumulated this run (wallet for the shop)
let shopSelectedIdx = 0;    // currently highlighted shop item
const SHOP_ITEMS = [
    { id: 'life',   label: '❤️  +1 Жизнь',    desc: 'Получить дополнительную жизнь',  price: 8 },
    { id: 'shield', label: '🛡️  Щит',           desc: 'Начать уровень со щитом',        price: 5 },
    { id: 'ammo',   label: '🍄 +3 Споры',       desc: 'Восстановить все заряды спор',   price: 4 },
    { id: 'magnet', label: '🧲 Магнит (10с)',   desc: 'Притягивать монеты 10 секунд',  price: 6 },
    { id: 'skip',   label: '⏭ Пропустить ур.',  desc: 'Пропустить следующий уровень',  price: 25 }, // Feature 130
];
function resetShop() { shopCoins = dailyStreakBonusCoins || 0; shopSelectedIdx = 0; }

// === ACHIEVEMENT SYSTEM (Feature 79: Persistent) ===
const achievementDefs = [
    { id: 'firstStomp',   label: '🦶 Первый стомп!',       desc: 'Раздавь первого Марио' },
    { id: 'starPower',    label: '⭐ Звёздная мощь!',      desc: 'Подбери звезду' },
    { id: 'comboMaster',  label: '🔥 Комбо-мастер!',       desc: 'Combo x5' },
    { id: 'coinCollector',label: '💰 Коллекционер!',       desc: 'Собери 10 монет за игру' },
    { id: 'shieldUser',   label: '🛡 Непробиваемый!',      desc: 'Щит поглотил удар' },
    // Feature 79: New persistent achievements
    { id: 'bigSpender',   label: '🪙 Бездонный карман!',   desc: 'Собери 50 монет за игру' },
    { id: 'noDeaths',     label: '💎 Без потерь!',         desc: 'Пройди уровень без смертей' },
    { id: 'rocketeer',    label: '🚀 Ракетчик!',           desc: 'Подбери ракету' },
    { id: 'mirrorHero',   label: '🪞 Зеркальный воин!',   desc: 'Пройди уровень в режиме Зеркало' },
    { id: 'speedRunner',  label: '⚡ Спидраннер!',         desc: 'Пройди уровень быстрее 30 сек' },
];

// Feature 79: Load persistent achievements from localStorage
let persistentAchievements = {};
try { persistentAchievements = JSON.parse(localStorage.getItem('mushroomAchievements') || '{}'); } catch { persistentAchievements = {}; }

const achievementUnlocked = { ...persistentAchievements };
let achievementToasts = []; // { label, timer }
let totalCoinsCollectedRun = 0;

function resetAchievements() {
    // Feature 79: Don't clear persistent achievements — only per-run counters
    achievementToasts = [];
    totalCoinsCollectedRun = 0;
}

function unlockAchievement(id) {
    if (achievementUnlocked[id]) return;
    achievementUnlocked[id] = true;
    // Feature 79: Save to localStorage
    persistentAchievements[id] = true;
    localStorage.setItem('mushroomAchievements', JSON.stringify(persistentAchievements));
    const def = achievementDefs.find(d => d.id === id);
    if (def) {
        achievementToasts.push({ label: def.label, timer: 180 });
        playSound('levelup');
    }
}

function updateAchievementToasts() {
    achievementToasts = achievementToasts.filter(t => {
        t.timer--;
        return t.timer > 0;
    });
}

function renderAchievementToasts() {
    if (achievementToasts.length === 0) return;
    ctx.save();
    achievementToasts.forEach((toast, i) => {
        const SHOW_IN = 20;
        const SHOW_OUT = 40;
        const TOTAL = 180;
        const alpha = toast.timer < SHOW_OUT ? toast.timer / SHOW_OUT
                    : toast.timer > TOTAL - SHOW_IN ? (TOTAL - toast.timer) / SHOW_IN : 1;
        // Feature 116: slide in from right edge
        const slideProgress = toast.timer > TOTAL - SHOW_IN
            ? (TOTAL - toast.timer) / SHOW_IN  // slide in
            : 1;
        const tw = 250, th = 44;
        const targetX = W - tw - 12;
        const slideOffsetX = (1 - slideProgress) * (tw + 14);
        const tx = targetX + slideOffsetX;
        const ty = 70 + i * (th + 6);

        ctx.globalAlpha = alpha;
        // Card background with gradient
        const grad = ctx.createLinearGradient(tx, ty, tx + tw, ty);
        grad.addColorStop(0, 'rgba(20, 40, 10, 0.94)');
        grad.addColorStop(1, 'rgba(10, 25, 5, 0.94)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, th, 10);
        ctx.fill();

        // Glowing border (Feature 116)
        const pulse = 0.7 + Math.sin(Date.now() * 0.008 - i) * 0.3;
        ctx.strokeStyle = `rgba(255, 220, 50, ${pulse})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, th, 10);
        ctx.stroke();

        // "ДОСТИЖЕНИЕ!" header
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#ffcc00';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 ДОСТИЖЕНИЕ!', tx + 10, ty + 13);

        // Achievement label
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#ffffcc';
        ctx.fillText(toast.label, tx + 10, ty + 32);
        ctx.textAlign = 'left';
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

// === LEVEL DATA ===
const LEVEL_NAMES = ['Начало', 'Равнина', 'Пропасти', 'Лабиринт', 'Финал', 'Небо', 'Хаос', 'Кошмар', 'БОСС', 'Возмездие', 'Апокалипсис', 'Олимп', '🪙 Монетная пещера', '🌑 Тьма', '☁ Небеса', '🚀 Космос', '🕯 Подземелье', '💚 Матрица', '⛈ Буря', '🔥 Инферно', '♾ Вечность', '🪐 Орбита', '💣 Бомбардировка', '🌀 Утопия', '🌅 Рассвет', '🕳 Пещера'];

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
        doubleCoinSpawns: [{ x: 380, y: 435 }],
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
        doubleCoinSpawns: [{ x: 360, y: 295 }],
        shieldSpawns: [{ x: 600, y: 435 }],
        springSpawns: [{ x: 370, y: 446 }],
        scoreBoostSpawns: [{ x: 245, y: 435 }], // Feature 61
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
        doubleCoinSpawns: [{ x: 450, y: 195 }],
        starSpawns: [{ x: 380, y: 290 }],
        shieldSpawns: [{ x: 620, y: 345 }],
        bombSpawns: [{ x: 150, y: 305 }],
        springSpawns: [{ x: 460, y: 446 }],
        speedBoostSpawns: [{ x: 90, y: 435 }],
        magnetSpawns: [{ x: 310, y: 195 }],
        slowMoSpawns: [{ x: 420, y: 300 }], // Feature 75
    },
    {
        // Level 4: Complex layout with moving platforms + crumbling platforms
        platforms: [
            { x: 0, y: 460, w: 160, h: 40 },
            { x: 240, y: 460, w: 160, h: 40 },
            { x: 480, y: 460, w: 160, h: 40 },
            { x: 680, y: 460, w: 120, h: 40 },
            { x: 50, y: 375, w: 120, h: 20, crumble: true }, // Feature 66: crumbling
            { x: 250, y: 340, w: 120, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 1.2 },
            { x: 440, y: 375, w: 120, h: 20, crumble: true }, // Feature 66: crumbling
            { x: 620, y: 340, w: 120, h: 20, moveAxis: 'x', moveRange: 60, moveSpeed: 1.5 },
            { x: 200, y: 230, w: 160, h: 20, moveAxis: 'y', moveRange: 40, moveSpeed: 0.8 },
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
        doubleCoinSpawns: [{ x: 420, y: 205 }, { x: 380, y: 315 }],
        starSpawns: [{ x: 530, y: 205 }],
        bombSpawns: [{ x: 660, y: 295 }],
        springSpawns: [{ x: 50, y: 446 }, { x: 700, y: 446 }],
        speedBoostSpawns: [{ x: 470, y: 350 }],
        magnetSpawns: [{ x: 130, y: 350 }],
        freezeSpawns: [{ x: 390, y: 205 }],
        portalSpawns: [{ blue: { x: 30, y: 415 }, orange: { x: 650, y: 415 } }],
        ghostSpawns: [{ x: 270, y: 200 }],
        electroSpawns: [{ x: 460, y: 205 }], // Feature 72
        slowMoSpawns: [{ x: 210, y: 350 }], // Feature 75
        giantSpawns: [{ x: 670, y: 350 }], // Feature 87
        jetpackSpawns: [{ x: 350, y: 295 }], // Feature 99
    },
    {
        // Level 5: The gauntlet with moving + crumbling + conveyor platforms
        platforms: [
            { x: 0, y: 460, w: 120, h: 40 },
            { x: 180, y: 460, w: 120, h: 40, conveyor: 1 },  // Feature 102: right conveyor
            { x: 360, y: 460, w: 120, h: 40 },
            { x: 540, y: 460, w: 120, h: 40, conveyor: -1 }, // Feature 102: left conveyor
            { x: 700, y: 460, w: 100, h: 40 },
            { x: 80, y: 380, w: 100, h: 20, moveAxis: 'x', moveRange: 60, moveSpeed: 1.4 },
            { x: 260, y: 355, w: 100, h: 20, crumble: true }, // Feature 66
            { x: 440, y: 380, w: 100, h: 20, moveAxis: 'x', moveRange: 70, moveSpeed: 1.6 },
            { x: 620, y: 355, w: 100, h: 20, crumble: true }, // Feature 66
            { x: 160, y: 260, w: 140, h: 20, moveAxis: 'y', moveRange: 50, moveSpeed: 1.0 },
            { x: 380, y: 230, w: 140, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 1.3 },
            { x: 560, y: 260, w: 140, h: 20, moveAxis: 'y', moveRange: 40, moveSpeed: 0.9 },
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
        doubleCoinSpawns: [{ x: 480, y: 105 }, { x: 620, y: 330 }],
        starSpawns: [{ x: 380, y: 185 }],
        shieldSpawns: [{ x: 90, y: 350 }],
        bombSpawns: [{ x: 640, y: 230 }],
        springSpawns: [{ x: 280, y: 446 }],
        speedBoostSpawns: [{ x: 350, y: 105 }],
        magnetSpawns: [{ x: 200, y: 235 }],
        freezeSpawns: [{ x: 580, y: 330 }],
        portalSpawns: [{ blue: { x: 0, y: 415 }, orange: { x: 700, y: 415 } }],
        checkpointSpawns: [{ x: 395, y: 415 }],
        flyingMarioSpawns: [{ x: 120, y: 195 }, { x: 520, y: 175 }],
        shooterMarioSpawns: [{ x: 350, y: 90 }],
        ghostSpawns: [{ x: 300, y: 95 }],
        scoreBoostSpawns: [{ x: 450, y: 200 }], // Feature 61
        parachuteMarioSpawns: [{ x: 180, y: -60 }, { x: 560, y: -110 }], // Feature 71
        electroSpawns: [{ x: 590, y: 230 }], // Feature 72
        slowMoSpawns: [{ x: 160, y: 235 }], // Feature 75
        rocketSpawns: [{ x: 520, y: 105 }], // Feature 80
        giantSpawns: [{ x: 300, y: 105 }], // Feature 87
        jetpackSpawns: [{ x: 400, y: 200 }], // Feature 99
        spikeSpawns: [{ x: 130, y: 444, count: 2 }, { x: 310, y: 444, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 400, y: 95 }], // Feature 92
    },
    {
        // Level 6: Sky — lots of mid-air platforms, fast enemies
        platforms: [
            { x: 0, y: 460, w: 100, h: 40 },
            { x: 700, y: 460, w: 100, h: 40 },
            { x: 120, y: 400, w: 90, h: 20 },
            { x: 280, y: 360, w: 90, h: 20, moveAxis: 'x', moveRange: 60, moveSpeed: 1.8 },
            { x: 450, y: 400, w: 90, h: 20 },
            { x: 610, y: 360, w: 90, h: 20, moveAxis: 'x', moveRange: 50, moveSpeed: 2.0 },
            { x: 60, y: 300, w: 100, h: 20, moveAxis: 'y', moveRange: 40, moveSpeed: 1.2 },
            { x: 220, y: 260, w: 100, h: 20 },
            { x: 380, y: 290, w: 100, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 1.5 },
            { x: 560, y: 250, w: 100, h: 20, moveAxis: 'y', moveRange: 50, moveSpeed: 1.0 },
            { x: 150, y: 170, w: 130, h: 20 },
            { x: 410, y: 150, w: 130, h: 20, moveAxis: 'x', moveRange: 60, moveSpeed: 2.2 },
            { x: 280, y: 80, w: 240, h: 20 },
        ],
        marioSpawns: [
            { x: 20, y: 420 },
            { x: 730, y: 420 },
            { x: 140, y: 360 },
            { x: 460, y: 360 },
            { x: 240, y: 220 },
            { x: 430, y: 110 },
        ],
        marioSpeed: 2.7,
        playerSpawn: { x: 30, y: 420 },
        coinSpawns: [
            { x: 150, y: 375 }, { x: 310, y: 335 }, { x: 480, y: 375 },
            { x: 80, y: 275 }, { x: 250, y: 235 }, { x: 590, y: 225 },
            { x: 180, y: 145 }, { x: 440, y: 125 }, { x: 360, y: 55 },
        ],
        doubleCoinSpawns: [{ x: 320, y: 55 }, { x: 690, y: 330 }],
        starSpawns: [{ x: 440, y: 55 }],
        bombSpawns: [{ x: 230, y: 235 }],
        springSpawns: [{ x: 0, y: 446 }, { x: 680, y: 446 }],
        speedBoostSpawns: [{ x: 450, y: 375 }],
        magnetSpawns: [{ x: 590, y: 225 }],
        freezeSpawns: [{ x: 155, y: 145 }],
        portalSpawns: [{ blue: { x: 130, y: 375 }, orange: { x: 620, y: 325 } }],
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns: [{ x: 200, y: 165 }, { x: 550, y: 145 }],
        shooterMarioSpawns: [{ x: 450, y: 370 }],
        ghostSpawns: [{ x: 490, y: 55 }],
        scoreBoostSpawns: [{ x: 350, y: 375 }], // Feature 61
        parachuteMarioSpawns: [{ x: 300, y: -80 }, { x: 600, y: -50 }], // Feature 71
        electroSpawns: [{ x: 680, y: 375 }], // Feature 72
        slowMoSpawns: [{ x: 490, y: 125 }], // Feature 75
        giantSpawns: [{ x: 240, y: 325 }], // Feature 87
        spikeSpawns: [{ x: 102, y: 384, count: 2 }, { x: 452, y: 384, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 320, y: 55 }], // Feature 92
    },
    {
        // Level 7: Chaos — all enemy types + moving + crumble + ice platforms
        platforms: [
            { x: 0, y: 460, w: 80, h: 40 },
            { x: 720, y: 460, w: 80, h: 40 },
            { x: 100, y: 420, w: 80, h: 20, moveAxis: 'x', moveRange: 70, moveSpeed: 2.0 },
            { x: 260, y: 380, w: 80, h: 20, moveAxis: 'y', moveRange: 40, moveSpeed: 1.5 },
            { x: 420, y: 420, w: 80, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 2.2 },
            { x: 580, y: 380, w: 80, h: 20, moveAxis: 'y', moveRange: 50, moveSpeed: 1.8 },
            { x: 50, y: 320, w: 80, h: 20, crumble: true }, // Feature 66
            { x: 200, y: 290, w: 80, h: 20, crumble: true }, // Feature 66
            { x: 380, y: 310, w: 80, h: 20, moveAxis: 'y', moveRange: 45, moveSpeed: 1.6 },
            { x: 560, y: 280, w: 80, h: 20, ice: true }, // Feature 67
            { x: 120, y: 200, w: 110, h: 20, ice: true }, // Feature 67
            { x: 380, y: 180, w: 110, h: 20, moveAxis: 'y', moveRange: 50, moveSpeed: 1.4 },
            { x: 620, y: 190, w: 110, h: 20, moveAxis: 'x', moveRange: 60, moveSpeed: 2.1 },
            { x: 300, y: 90, w: 200, h: 20, ice: true }, // Feature 67
        ],
        marioSpawns: [
            { x: 20, y: 430 },
            { x: 730, y: 430 },
            { x: 130, y: 380 },
            { x: 430, y: 380 },
            { x: 210, y: 250 },
            { x: 570, y: 240 },
            { x: 350, y: 50 },
        ],
        marioSpeed: 3.0,
        playerSpawn: { x: 20, y: 430 },
        coinSpawns: [
            { x: 120, y: 395 }, { x: 280, y: 355 }, { x: 440, y: 395 }, { x: 600, y: 355 },
            { x: 70, y: 295 }, { x: 220, y: 265 }, { x: 400, y: 285 }, { x: 580, y: 255 },
            { x: 150, y: 175 }, { x: 410, y: 155 }, { x: 650, y: 165 },
            { x: 360, y: 65 },
        ],
        doubleCoinSpawns: [{ x: 490, y: 255 }, { x: 320, y: 65 }],
        starSpawns: [{ x: 460, y: 155 }, { x: 190, y: 175 }],
        bombSpawns: [{ x: 140, y: 375 }, { x: 500, y: 355 }],
        springSpawns: [{ x: 0, y: 446 }, { x: 700, y: 446 }],
        speedBoostSpawns: [{ x: 640, y: 165 }],
        magnetSpawns: [{ x: 300, y: 65 }],
        freezeSpawns: [{ x: 220, y: 265 }],
        portalSpawns: [{ blue: { x: 20, y: 430 }, orange: { x: 400, y: 50 } }],
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns: [{ x: 150, y: 150 }, { x: 450, y: 135 }, { x: 620, y: 155 }],
        shooterMarioSpawns: [{ x: 100, y: 250 }, { x: 600, y: 230 }],
        ghostSpawns: [{ x: 350, y: 65 }],
        scoreBoostSpawns: [{ x: 480, y: 65 }], // Feature 61
        parachuteMarioSpawns: [{ x: 100, y: -70 }, { x: 450, y: -50 }, { x: 700, y: -90 }], // Feature 71
        electroSpawns: [{ x: 300, y: 65 }], // Feature 72
        rocketSpawns: [{ x: 640, y: 155 }], // Feature 80
        giantSpawns: [{ x: 170, y: 200 }], // Feature 87
        jetpackSpawns: [{ x: 380, y: 155 }], // Feature 99
        spikeSpawns: [{ x: 0, y: 444, count: 3 }, { x: 680, y: 444, count: 3 }], // Feature 91
        tripleCoinSpawns: [{ x: 380, y: 65 }], // Feature 92
    },
    {
        // Level 8: Nightmare — extreme difficulty, maximum chaos
        platforms: [
            { x: 0,   y: 460, w: 60,  h: 40 },
            { x: 740, y: 460, w: 60,  h: 40 },
            { x: 80,  y: 430, w: 60,  h: 20, moveAxis: 'x', moveRange: 80,  moveSpeed: 2.5 },
            { x: 220, y: 400, w: 60,  h: 20, moveAxis: 'y', moveRange: 50,  moveSpeed: 2.0 },
            { x: 360, y: 430, w: 60,  h: 20, moveAxis: 'x', moveRange: 90,  moveSpeed: 2.8 },
            { x: 500, y: 400, w: 60,  h: 20, moveAxis: 'y', moveRange: 60,  moveSpeed: 2.2 },
            { x: 640, y: 430, w: 60,  h: 20, moveAxis: 'x', moveRange: 70,  moveSpeed: 2.6 },
            { x: 30,  y: 340, w: 70,  h: 20, moveAxis: 'y', moveRange: 70,  moveSpeed: 1.8 },
            { x: 160, y: 310, w: 70,  h: 20, moveAxis: 'x', moveRange: 100, moveSpeed: 2.8 },
            { x: 320, y: 330, w: 70,  h: 20, moveAxis: 'y', moveRange: 55,  moveSpeed: 2.0 },
            { x: 480, y: 300, w: 70,  h: 20, moveAxis: 'x', moveRange: 80,  moveSpeed: 3.0 },
            { x: 630, y: 330, w: 70,  h: 20, moveAxis: 'y', moveRange: 65,  moveSpeed: 2.3 },
            { x: 80,  y: 220, w: 80,  h: 20, moveAxis: 'x', moveRange: 90,  moveSpeed: 2.5 },
            { x: 320, y: 200, w: 80,  h: 20, moveAxis: 'y', moveRange: 50,  moveSpeed: 2.0 },
            { x: 555, y: 215, w: 80,  h: 20, moveAxis: 'x', moveRange: 80,  moveSpeed: 2.7 },
            { x: 250, y: 110, w: 300, h: 20 },
        ],
        marioSpawns: [
            { x: 10,  y: 430 },
            { x: 750, y: 430 },
            { x: 100, y: 390 },
            { x: 370, y: 390 },
            { x: 650, y: 390 },
            { x: 170, y: 270 },
            { x: 490, y: 260 },
            { x: 330, y: 165 },
            { x: 510, y: 165 },
        ],
        marioSpeed: 3.5,
        playerSpawn: { x: 10, y: 430 },
        coinSpawns: [
            { x: 100, y: 405 }, { x: 240, y: 375 }, { x: 380, y: 405 }, { x: 520, y: 375 },
            { x: 50,  y: 315 }, { x: 180, y: 285 }, { x: 340, y: 305 }, { x: 500, y: 275 },
            { x: 100, y: 195 }, { x: 340, y: 175 }, { x: 580, y: 190 },
            { x: 310, y: 85  }, { x: 450, y: 85  },
        ],
        doubleCoinSpawns: [{ x: 400, y: 85 }, { x: 260, y: 175 }],
        starSpawns: [{ x: 350, y: 85 }, { x: 600, y: 190 }],
        bombSpawns: [{ x: 200, y: 285 }, { x: 555, y: 270 }],
        springSpawns: [{ x: 0, y: 446 }, { x: 720, y: 446 }],
        speedBoostSpawns: [{ x: 360, y: 175 }],
        magnetSpawns: [{ x: 460, y: 275 }],
        freezeSpawns: [{ x: 100, y: 195 }, { x: 560, y: 190 }],
        portalSpawns: [
            { blue: { x: 10, y: 415 }, orange: { x: 610, y: 285 } },
            { blue: { x: 380, y: 415 }, orange: { x: 260, y: 85 } },
        ],
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns: [{ x: 200, y: 140 }, { x: 500, y: 125 }, { x: 380, y: 155 }],
        shooterMarioSpawns: [{ x: 310, y: 85 }, { x: 530, y: 265 }],
        ghostSpawns: [{ x: 400, y: 85 }],
        parachuteMarioSpawns: [{ x: 150, y: -60 }, { x: 620, y: -80 }], // Feature 71
        electroSpawns: [{ x: 210, y: 85 }, { x: 600, y: 185 }], // Feature 72
        slowMoSpawns: [{ x: 460, y: 85 }], // Feature 75
        magBootsSpawns: [{ x: 540, y: 165 }], // Feature 85
        giantSpawns: [{ x: 320, y: 85 }], // Feature 87
        spikeSpawns: [{ x: 62, y: 414, count: 2 }, { x: 300, y: 444, count: 2 }, { x: 570, y: 414, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 300, y: 85 }], // Feature 92
    },
    {
        // Level 9: BOSS FIGHT — final battle arena
        isBossLevel: true,
        platforms: [
            { x: 0,   y: 460, w: 800, h: 40 },          // full ground
            { x: 80,  y: 360, w: 160, h: 20 },           // left platform
            { x: 560, y: 360, w: 160, h: 20 },           // right platform
            { x: 310, y: 260, w: 180, h: 20 },           // center high
            { x: 100, y: 210, w: 100, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 1.5 },
            { x: 600, y: 210, w: 100, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 1.5 },
        ],
        marioSpawns: [],
        marioSpeed: 0,
        playerSpawn: { x: 50, y: 400 },
        coinSpawns: [
            { x: 130, y: 435 }, { x: 280, y: 435 }, { x: 450, y: 435 }, { x: 620, y: 435 },
            { x: 120, y: 335 }, { x: 600, y: 335 },
            { x: 360, y: 235 }, { x: 430, y: 235 },
        ],
        doubleCoinSpawns: [{ x: 195, y: 335 }, { x: 395, y: 235 }],
        starSpawns: [{ x: 370, y: 225 }],
        shieldSpawns: [{ x: 600, y: 335 }],
        bombSpawns: [{ x: 110, y: 325 }],
        springSpawns: [{ x: 0, y: 446 }, { x: 740, y: 446 }],
        speedBoostSpawns: [{ x: 450, y: 225 }],
        magnetSpawns: [{ x: 280, y: 225 }],
        ghostSpawns: [{ x: 340, y: 225 }],
        electroSpawns: [{ x: 500, y: 225 }], // Feature 72
        spikeSpawns: [{ x: 200, y: 444, count: 2 }, { x: 560, y: 444, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 355, y: 235 }], // Feature 92
    },
    {
        // Level 10: «Возмездие» — post-boss gauntlet with all enemy types
        platforms: [
            { x: 0,   y: 460, w: 60,  h: 40 },
            { x: 740, y: 460, w: 60,  h: 40 },
            { x: 90,  y: 420, w: 80,  h: 20, moveAxis: 'x', moveRange: 90, moveSpeed: 2.8 },
            { x: 260, y: 390, w: 80,  h: 20, moveAxis: 'y', moveRange: 55, moveSpeed: 2.2 },
            { x: 420, y: 420, w: 80,  h: 20, moveAxis: 'x', moveRange: 85, moveSpeed: 3.0 },
            { x: 590, y: 390, w: 80,  h: 20, moveAxis: 'y', moveRange: 60, moveSpeed: 2.5 },
            { x: 40,  y: 330, w: 90,  h: 20, moveAxis: 'y', moveRange: 70, moveSpeed: 2.0 },
            { x: 200, y: 300, w: 90,  h: 20, moveAxis: 'x', moveRange: 100, moveSpeed: 3.2 },
            { x: 380, y: 320, w: 90,  h: 20, moveAxis: 'y', moveRange: 50, moveSpeed: 2.3 },
            { x: 560, y: 290, w: 90,  h: 20, moveAxis: 'x', moveRange: 85, moveSpeed: 2.8 },
            { x: 100, y: 210, w: 100, h: 20, moveAxis: 'x', moveRange: 95, moveSpeed: 2.6 },
            { x: 360, y: 190, w: 100, h: 20, moveAxis: 'y', moveRange: 55, moveSpeed: 2.2 },
            { x: 600, y: 205, w: 100, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 3.0 },
            { x: 260, y: 100, w: 280, h: 20, pulse: true },
        ],
        marioSpawns: [
            { x: 10,  y: 430 },
            { x: 750, y: 430 },
            { x: 110, y: 380 },
            { x: 430, y: 380 },
            { x: 660, y: 370 },
            { x: 210, y: 260 },
            { x: 570, y: 250 },
        ],
        marioTypes: ['normal', 'normal', 'fast', 'fast', 'jumpy', 'armored', 'armored'],
        marioSpeed: 4.0,
        playerSpawn: { x: 10, y: 430 },
        coinSpawns: [
            { x: 110, y: 395 }, { x: 280, y: 365 }, { x: 440, y: 395 }, { x: 610, y: 365 },
            { x: 60,  y: 305 }, { x: 220, y: 275 }, { x: 400, y: 295 }, { x: 580, y: 265 },
            { x: 120, y: 185 }, { x: 380, y: 165 }, { x: 630, y: 180 },
            { x: 310, y: 75  }, { x: 450, y: 75  },
        ],
        doubleCoinSpawns: [{ x: 380, y: 75 }, { x: 500, y: 180 }],
        starSpawns: [{ x: 510, y: 75 }, { x: 140, y: 185 }],
        shieldSpawns: [{ x: 700, y: 435 }],
        bombSpawns: [{ x: 330, y: 265 }, { x: 660, y: 180 }],
        springSpawns: [{ x: 0, y: 446 }, { x: 720, y: 446 }],
        speedBoostSpawns: [{ x: 415, y: 165 }],
        magnetSpawns: [{ x: 480, y: 75 }],
        freezeSpawns: [{ x: 240, y: 265 }, { x: 630, y: 265 }],
        portalSpawns: [
            { blue: { x: 10, y: 415 }, orange: { x: 540, y: 165 } },
            { blue: { x: 390, y: 415 }, orange: { x: 280, y: 75 } },
        ],
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns: [{ x: 180, y: 155 }, { x: 480, y: 140 }, { x: 660, y: 165 }],
        shooterMarioSpawns: [{ x: 120, y: 170 }, { x: 620, y: 165 }],
        parachuteMarioSpawns: [{ x: 400, y: -60 }, { x: 200, y: -100 }, { x: 600, y: -80 }], // Feature 71
        electroSpawns: [{ x: 530, y: 75 }, { x: 300, y: 75 }], // Feature 72
        slowMoSpawns: [{ x: 650, y: 75 }, { x: 100, y: 185 }], // Feature 75
        rocketSpawns: [{ x: 450, y: 75 }], // Feature 80
        magBootsSpawns: [{ x: 240, y: 75 }], // Feature 85
        giantSpawns: [{ x: 520, y: 75 }], // Feature 87
        spikeSpawns: [{ x: 62, y: 444, count: 2 }, { x: 420, y: 444, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 350, y: 75 }], // Feature 92
    },
    {
        // Level 11: «Апокалипсис» — Feature 74: megafinal with all mechanics
        platforms: [
            // Ground — tiny patches only
            { x: 0,   y: 460, w: 50,  h: 40 },
            { x: 750, y: 460, w: 50,  h: 40 },
            // Low tier — moving chaos
            { x: 60,  y: 430, w: 55,  h: 20, moveAxis: 'x', moveRange: 80,  moveSpeed: 3.0 },
            { x: 200, y: 410, w: 55,  h: 20, moveAxis: 'y', moveRange: 40,  moveSpeed: 2.6 },
            { x: 340, y: 430, w: 55,  h: 20, moveAxis: 'x', moveRange: 100, moveSpeed: 3.2 },
            { x: 490, y: 410, w: 55,  h: 20, moveAxis: 'y', moveRange: 50,  moveSpeed: 2.8 },
            { x: 640, y: 430, w: 55,  h: 20, moveAxis: 'x', moveRange: 75,  moveSpeed: 3.0 },
            // Mid tier — crumble and ice mix
            { x: 30,  y: 340, w: 70,  h: 20, crumble: true },
            { x: 160, y: 315, w: 70,  h: 20, moveAxis: 'x', moveRange: 90,  moveSpeed: 3.5 },
            { x: 310, y: 330, w: 70,  h: 20, crumble: true },
            { x: 450, y: 305, w: 70,  h: 20, moveAxis: 'y', moveRange: 55,  moveSpeed: 3.0 },
            { x: 590, y: 325, w: 70,  h: 20, ice: true },
            { x: 700, y: 300, w: 70,  h: 20, moveAxis: 'x', moveRange: 60,  moveSpeed: 2.8 },
            // Upper-mid tier
            { x: 60,  y: 230, w: 80,  h: 20, moveAxis: 'x', moveRange: 100, moveSpeed: 3.2 },
            { x: 230, y: 210, w: 80,  h: 20, ice: true },
            { x: 390, y: 225, w: 80,  h: 20, moveAxis: 'y', moveRange: 60,  moveSpeed: 3.2 },
            { x: 550, y: 210, w: 80,  h: 20, crumble: true },
            { x: 680, y: 230, w: 80,  h: 20, moveAxis: 'x', moveRange: 70,  moveSpeed: 3.5 },
            // Top tier — ice + crumble madness
            { x: 100, y: 130, w: 100, h: 20, ice: true },
            { x: 310, y: 110, w: 100, h: 20, crumble: true },
            { x: 530, y: 125, w: 100, h: 20, ice: true },
            { x: 320, y: 45,  w: 160, h: 20 }, // very top safe zone
        ],
        marioSpawns: [
            { x: 5,   y: 430 },
            { x: 755, y: 430 },
            { x: 170, y: 390 },
            { x: 360, y: 390 },
            { x: 520, y: 390 },
            { x: 40,  y: 310 },
            { x: 480, y: 270 },
            { x: 700, y: 265 },
        ],
        marioTypes: ['normal', 'normal', 'fast', 'armored', 'jumpy', 'armored', 'fast', 'armored'],
        marioSpeed: 4.5,
        playerSpawn: { x: 5, y: 400 },
        coinSpawns: [
            { x: 110, y: 405 }, { x: 260, y: 385 }, { x: 400, y: 405 }, { x: 545, y: 385 },
            { x: 70,  y: 315 }, { x: 200, y: 290 }, { x: 380, y: 305 }, { x: 620, y: 300 },
            { x: 90,  y: 205 }, { x: 265, y: 185 }, { x: 430, y: 200 }, { x: 600, y: 185 },
            { x: 150, y: 105 }, { x: 360, y: 85  }, { x: 590, y: 100 },
        ],
        doubleCoinSpawns: [
            { x: 380, y: 85  }, { x: 160, y: 85 }, { x: 560, y: 85 },
        ],
        starSpawns:       [{ x: 350, y: 20  }, { x: 130, y: 105 }],
        shieldSpawns:     [{ x: 740, y: 435 }],
        bombSpawns:       [{ x: 470, y: 185 }, { x: 230, y: 190 }],
        springSpawns:     [{ x: 0,   y: 446 }, { x: 740, y: 446 }],
        speedBoostSpawns: [{ x: 560, y: 100 }],
        magnetSpawns:     [{ x: 320, y: 85  }],
        freezeSpawns:     [{ x: 105, y: 105 }, { x: 540, y: 100 }],
        ghostSpawns:      [{ x: 400, y: 85  }],
        electroSpawns:    [{ x: 490, y: 20  }, { x: 200, y: 85  }],  // Feature 72
        portalSpawns: [
            { blue: { x: 0, y: 415 }, orange: { x: 340, y: 65 } },
            { blue: { x: 430, y: 415 }, orange: { x: 130, y: 95 } },
        ],
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns:    [{ x: 100, y: 170 }, { x: 350, y: 155 }, { x: 600, y: 165 }, { x: 220, y: 130 }],
        shooterMarioSpawns:   [{ x: 320, y: 25  }, { x: 540, y: 100 }, { x: 110, y: 105 }],
        parachuteMarioSpawns: [{ x: 200, y: -60 }, { x: 500, y: -90 }, { x: 700, y: -50 }, { x: 100, y: -120 }], // Feature 71
        slowMoSpawns: [{ x: 360, y: 20 }, { x: 580, y: 100 }], // Feature 75
        rocketSpawns: [{ x: 160, y: 85 }, { x: 490, y: 85 }], // Feature 80
        magBootsSpawns: [{ x: 420, y: 20 }], // Feature 85
        giantSpawns: [{ x: 220, y: 20 }, { x: 620, y: 20 }], // Feature 87
        spikeSpawns: [{ x: 52, y: 444, count: 2 }, { x: 600, y: 444, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 400, y: 20 }], // Feature 92
    },
    {
        // Level 12: «Олимп» — Feature 78: sky-high olympus, airborne enemies, strategic platforms
        platforms: [
            // Tiny ground anchors — mostly airborne level
            { x: 0,   y: 460, w: 40,  h: 40 },
            { x: 760, y: 460, w: 40,  h: 40 },
            // Lower cloud tier — wide but moving
            { x: 80,  y: 420, w: 70,  h: 18, moveAxis: 'x', moveRange: 60, moveSpeed: 2.5 },
            { x: 240, y: 400, w: 70,  h: 18, moveAxis: 'x', moveRange: 80, moveSpeed: 2.8 },
            { x: 420, y: 420, w: 70,  h: 18, moveAxis: 'x', moveRange: 70, moveSpeed: 2.5 },
            { x: 590, y: 400, w: 70,  h: 18, moveAxis: 'x', moveRange: 60, moveSpeed: 3.0 },
            // Mid cloud tier — mix of crumble and ice
            { x: 30,  y: 340, w: 80,  h: 18, crumble: true },
            { x: 170, y: 315, w: 80,  h: 18, ice: true },
            { x: 340, y: 330, w: 80,  h: 18, moveAxis: 'y', moveRange: 50, moveSpeed: 2.0 },
            { x: 510, y: 310, w: 80,  h: 18, ice: true },
            { x: 660, y: 330, w: 80,  h: 18, crumble: true },
            // Upper tier — smaller, faster moving
            { x: 60,  y: 230, w: 90,  h: 18, moveAxis: 'x', moveRange: 100, moveSpeed: 3.2 },
            { x: 280, y: 210, w: 90,  h: 18, moveAxis: 'y', moveRange:  55, moveSpeed: 2.5 },
            { x: 490, y: 225, w: 90,  h: 18, moveAxis: 'x', moveRange:  90, moveSpeed: 3.0 },
            { x: 670, y: 210, w: 90,  h: 18, moveAxis: 'y', moveRange:  45, moveSpeed: 2.3 },
            // Summit platform — safe zone at top
            { x: 290, y: 110, w: 220, h: 20, pulse: true },
        ],
        marioSpawns: [
            { x: 100, y: 390 },
            { x: 440, y: 390 },
            { x: 680, y: 390 },
            { x: 50,  y: 310 },
            { x: 520, y: 280 },
            { x: 300, y: 165 },
        ],
        marioTypes: ['fast', 'jumpy', 'fast', 'armored', 'jumpy', 'armored'],
        marioSpeed: 3.8,
        playerSpawn: { x: 5, y: 430 },
        coinSpawns: [
            { x: 110, y: 395 }, { x: 260, y: 375 }, { x: 450, y: 395 }, { x: 620, y: 375 },
            { x: 55,  y: 315 }, { x: 200, y: 290 }, { x: 370, y: 305 }, { x: 540, y: 285 },
            { x: 80,  y: 205 }, { x: 310, y: 185 }, { x: 520, y: 200 }, { x: 700, y: 185 },
            { x: 340, y: 85  }, { x: 430, y: 85  },
        ],
        doubleCoinSpawns: [
            { x: 390, y: 85 }, { x: 480, y: 85 },
        ],
        starSpawns:       [{ x: 360, y: 85 }, { x: 510, y: 85 }],
        shieldSpawns:     [{ x: 720, y: 435 }],
        bombSpawns:       [{ x: 190, y: 290 }, { x: 560, y: 280 }],
        springSpawns:     [{ x: 0, y: 446 }, { x: 740, y: 446 }],
        speedBoostSpawns: [{ x: 300, y: 185 }],
        magnetSpawns:     [{ x: 460, y: 85  }],
        freezeSpawns:     [{ x: 90,  y: 205 }, { x: 680, y: 185 }],
        ghostSpawns:      [{ x: 540, y: 85  }],
        electroSpawns:    [{ x: 410, y: 85  }, { x: 250, y: 185 }],
        slowMoSpawns:     [{ x: 350, y: 185 }, { x: 630, y: 280 }], // Feature 75
        rocketSpawns:     [{ x: 200, y: 285 }], // Feature 80
        scoreBoostSpawns: [{ x: 590, y: 85 }],
        portalSpawns: [
            { blue: { x: 0, y: 415 }, orange: { x: 310, y: 85 } },
            { blue: { x: 440, y: 415 }, orange: { x: 160, y: 285 } },
        ],
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns:    [{ x: 140, y: 220 }, { x: 400, y: 200 }, { x: 640, y: 215 }, { x: 270, y: 140 }, { x: 520, y: 140 }],
        shooterMarioSpawns:   [{ x: 310, y: 85  }, { x: 490, y: 100 }],
        parachuteMarioSpawns: [{ x: 150, y: -60 }, { x: 380, y: -80 }, { x: 620, y: -50 }, { x: 50, y: -110 }, { x: 750, y: -90 }], // Feature 71
        giantSpawns: [{ x: 100, y: 185 }, { x: 540, y: 185 }], // Feature 87
        spikeSpawns: [{ x: 0, y: 444, count: 2 }, { x: 744, y: 444, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 310, y: 185 }], // Feature 92
    },
    {
        // Level 13: «Монетная пещера» — Feature 82: bonus coin-only timed challenge
        isBonusLevel: true,
        platforms: [
            // Floor
            { x: 0,   y: 460, w: 800, h: 40 },
            // Low caves platforms
            { x: 50,  y: 400, w: 90,  h: 16 },
            { x: 200, y: 410, w: 80,  h: 16 },
            { x: 360, y: 395, w: 90,  h: 16 },
            { x: 530, y: 405, w: 80,  h: 16 },
            { x: 680, y: 395, w: 90,  h: 16 },
            // Mid cave tier
            { x: 0,   y: 340, w: 70,  h: 16 },
            { x: 130, y: 325, w: 90,  h: 16 },
            { x: 290, y: 335, w: 90,  h: 16 },
            { x: 450, y: 320, w: 90,  h: 16 },
            { x: 610, y: 330, w: 80,  h: 16 },
            { x: 740, y: 320, w: 60,  h: 16 },
            // Upper-mid cave tier
            { x: 40,  y: 255, w: 100, h: 16 },
            { x: 190, y: 240, w: 90,  h: 16 },
            { x: 340, y: 255, w: 90,  h: 16, moveAxis: 'x', moveRange: 60, moveSpeed: 2.0 },
            { x: 500, y: 240, w: 90,  h: 16 },
            { x: 660, y: 250, w: 100, h: 16 },
            // Top cave tier
            { x: 80,  y: 170, w: 110, h: 16 },
            { x: 260, y: 155, w: 100, h: 16 },
            { x: 440, y: 165, w: 100, h: 16, moveAxis: 'x', moveRange: 50, moveSpeed: 1.8 },
            { x: 620, y: 155, w: 110, h: 16 },
            // Summit platform
            { x: 300, y: 85,  w: 200, h: 16 },
        ],
        marioSpawns: [],  // No enemies — pure coin collecting!
        marioSpeed: 0,
        playerSpawn: { x: 50, y: 400 },
        coinSpawns: [
            // Floor level coins
            { x: 90,  y: 435 }, { x: 180, y: 435 }, { x: 270, y: 435 }, { x: 360, y: 435 },
            { x: 450, y: 435 }, { x: 540, y: 435 }, { x: 630, y: 435 }, { x: 720, y: 435 },
            // Low platform coins
            { x: 65,  y: 375 }, { x: 215, y: 385 }, { x: 375, y: 370 },
            { x: 545, y: 380 }, { x: 695, y: 370 },
            // Mid tier coins
            { x: 15,  y: 315 }, { x: 145, y: 300 }, { x: 305, y: 310 },
            { x: 465, y: 295 }, { x: 625, y: 305 }, { x: 755, y: 295 },
            // Upper-mid tier coins
            { x: 55,  y: 230 }, { x: 205, y: 215 }, { x: 355, y: 230 },
            { x: 515, y: 215 }, { x: 675, y: 225 },
            // Top tier coins
            { x: 95,  y: 145 }, { x: 275, y: 130 }, { x: 455, y: 140 },
            { x: 635, y: 130 },
            // Summit coins
            { x: 325, y: 60 }, { x: 375, y: 60 }, { x: 425, y: 60 }, { x: 475, y: 60 },
        ],
        doubleCoinSpawns: [
            { x: 150, y: 435 }, { x: 460, y: 435 },
            { x: 490, y: 370 }, { x: 180, y: 300 },
            { x: 575, y: 215 }, { x: 345, y: 130 },
            { x: 395, y: 60  },
        ],
        springSpawns: [
            { x: 370, y: 446 },
        ],
    },
    {
        // Level 14: «Тьма» — Feature 90: dark level with teleporters and ghosts
        platforms: [
            // Broken floor with gaps
            { x: 0,   y: 460, w: 150, h: 40 },
            { x: 200, y: 460, w: 120, h: 40 },
            { x: 380, y: 460, w: 100, h: 40 },
            { x: 540, y: 460, w: 120, h: 40 },
            { x: 720, y: 460, w: 80,  h: 40 },
            // Lower platforms
            { x: 60,  y: 390, w: 90,  h: 18 },
            { x: 270, y: 375, w: 90,  h: 18, moveAxis: 'x', moveRange: 60, moveSpeed: 1.8 },
            { x: 460, y: 390, w: 80,  h: 18 },
            { x: 640, y: 375, w: 90,  h: 18, moveAxis: 'y', moveRange: 40, moveSpeed: 1.5 },
            // Mid platforms
            { x: 0,   y: 310, w: 80,  h: 18, crumble: true },
            { x: 140, y: 295, w: 90,  h: 18 },
            { x: 320, y: 310, w: 80,  h: 18, moveAxis: 'x', moveRange: 80, moveSpeed: 2.2 },
            { x: 510, y: 295, w: 80,  h: 18, crumble: true },
            { x: 680, y: 310, w: 80,  h: 18 },
            // Upper-mid platforms
            { x: 50,  y: 220, w: 90,  h: 18, ice: true },
            { x: 220, y: 205, w: 90,  h: 18, moveAxis: 'y', moveRange: 50, moveSpeed: 2.0 },
            { x: 410, y: 215, w: 90,  h: 18, crumble: true },
            { x: 590, y: 200, w: 90,  h: 18, ice: true },
            // Top platforms
            { x: 100, y: 130, w: 100, h: 18, moveAxis: 'x', moveRange: 70, moveSpeed: 1.6 },
            { x: 330, y: 115, w: 140, h: 18, pulse: true },
            { x: 580, y: 125, w: 90,  h: 18, crumble: true },
        ],
        marioSpawns: [
            { x: 80,  y: 430 },
            { x: 400, y: 430 },
            { x: 680, y: 430 },
            { x: 160, y: 340 },
            { x: 530, y: 340 },
        ],
        marioTypes: ['ghost_mario', 'fast', 'ghost_mario', 'armored', 'ghost_mario'],
        marioSpeed: 2.8,
        playerSpawn: { x: 30, y: 420 },
        coinSpawns: [
            { x: 70,  y: 435 }, { x: 210, y: 435 }, { x: 390, y: 435 }, { x: 555, y: 435 }, { x: 735, y: 435 },
            { x: 75,  y: 365 }, { x: 285, y: 350 }, { x: 470, y: 365 }, { x: 655, y: 350 },
            { x: 10,  y: 285 }, { x: 150, y: 270 }, { x: 340, y: 285 }, { x: 520, y: 270 }, { x: 690, y: 285 },
            { x: 60,  y: 195 }, { x: 235, y: 180 }, { x: 425, y: 190 }, { x: 605, y: 175 },
            { x: 115, y: 105 }, { x: 360, y: 90  }, { x: 595, y: 100 },
        ],
        doubleCoinSpawns: [
            { x: 400, y: 90  }, { x: 440, y: 90 },
            { x: 290, y: 270 }, { x: 680, y: 165 },
        ],
        starSpawns:       [{ x: 380, y: 90 }, { x: 480, y: 90 }],
        shieldSpawns:     [{ x: 0,   y: 295 }],
        bombSpawns:       [{ x: 220, y: 270 }, { x: 600, y: 175 }],
        springSpawns:     [{ x: 155, y: 446 }],
        speedBoostSpawns: [{ x: 330, y: 270 }],
        magnetSpawns:     [{ x: 450, y: 90  }],
        freezeSpawns:     [{ x: 60,  y: 200 }, { x: 680, y: 190 }],
        ghostSpawns:      [{ x: 540, y: 90  }],
        electroSpawns:    [{ x: 360, y: 90  }],
        slowMoSpawns:     [{ x: 160, y: 205 }],
        rocketSpawns:     [{ x: 700, y: 295 }],
        scoreBoostSpawns: [{ x: 500, y: 195 }],
        magBootsSpawns:   [{ x: 250, y: 105 }],
        giantSpawns:      [{ x: 140, y: 280 }, { x: 620, y: 280 }], // Feature 87
        checkpointSpawns: [{ x: 395, y: 435 }],
        flyingMarioSpawns:    [{ x: 200, y: 170 }, { x: 500, y: 155 }],
        shooterMarioSpawns:   [{ x: 350, y: 90 }],
        teleporterMarioSpawns: [{ x: 600, y: 420 }, { x: 150, y: 290 }], // Feature 89
        portalSpawns: [
            { blue: { x: 10, y: 420 }, orange: { x: 410, y: 90 } },
        ],
        spikeSpawns: [{ x: 152, y: 444, count: 2 }, { x: 480, y: 444, count: 2 }], // Feature 91
        tripleCoinSpawns: [{ x: 340, y: 90 }], // Feature 92
    },
    {
        // Level 15: «Небеса» — Feature 94: heavenly sky, all enemy types, max challenge
        platforms: [
            // Tiny ground footholds
            { x: 0,   y: 460, w: 50,  h: 40 },
            { x: 750, y: 460, w: 50,  h: 40 },
            // Low tier — moving clouds
            { x: 70,  y: 420, w: 80,  h: 18, moveAxis: 'x', moveRange: 80,  moveSpeed: 2.8 },
            { x: 240, y: 400, w: 70,  h: 18, moveAxis: 'x', moveRange: 90,  moveSpeed: 3.0 },
            { x: 420, y: 420, w: 80,  h: 18, moveAxis: 'x', moveRange: 75,  moveSpeed: 2.6 },
            { x: 610, y: 400, w: 70,  h: 18, moveAxis: 'y', moveRange: 45,  moveSpeed: 2.4 },
            // Mid tier — crumbling and ice
            { x: 30,  y: 340, w: 90,  h: 18, crumble: true },
            { x: 180, y: 320, w: 90,  h: 18, ice: true },
            { x: 360, y: 335, w: 80,  h: 18, moveAxis: 'y', moveRange: 55,  moveSpeed: 2.2 },
            { x: 530, y: 315, w: 90,  h: 18, crumble: true },
            { x: 680, y: 335, w: 80,  h: 18, ice: true },
            // Upper-mid tier
            { x: 60,  y: 240, w: 90,  h: 18, moveAxis: 'x', moveRange: 90,  moveSpeed: 3.2 },
            { x: 240, y: 220, w: 90,  h: 18, ice: true },
            { x: 420, y: 235, w: 90,  h: 18, moveAxis: 'y', moveRange: 50,  moveSpeed: 2.5 },
            { x: 610, y: 215, w: 90,  h: 18, crumble: true },
            // Top tier — summit
            { x: 100, y: 140, w: 100, h: 18, moveAxis: 'x', moveRange: 80,  moveSpeed: 2.0 },
            { x: 320, y: 115, w: 160, h: 18 },
            { x: 570, y: 130, w: 100, h: 18, crumble: true },
        ],
        marioSpawns: [
            { x: 80,  y: 430 },
            { x: 430, y: 430 },
            { x: 700, y: 430 },
            { x: 190, y: 295 },
            { x: 545, y: 290 },
        ],
        marioTypes: ['fast', 'armored', 'fast', 'ghost_mario', 'armored'],
        marioSpeed: 3.2,
        playerSpawn: { x: 20, y: 430 },
        coinSpawns: [
            { x: 60,  y: 435 }, { x: 250, y: 435 }, { x: 440, y: 435 }, { x: 640, y: 435 },
            { x: 40,  y: 315 }, { x: 190, y: 295 }, { x: 375, y: 310 }, { x: 545, y: 290 }, { x: 695, y: 310 },
            { x: 70,  y: 215 }, { x: 255, y: 195 }, { x: 430, y: 210 }, { x: 625, y: 190 },
            { x: 120, y: 115 }, { x: 360, y: 90  }, { x: 590, y: 105 },
        ],
        doubleCoinSpawns: [
            { x: 400, y: 90 }, { x: 450, y: 90 },
            { x: 300, y: 195 }, { x: 660, y: 180 },
        ],
        tripleCoinSpawns: [{ x: 380, y: 90 }], // Feature 92
        starSpawns:       [{ x: 340, y: 90 }, { x: 490, y: 90 }],
        shieldSpawns:     [{ x: 0,   y: 445 }, { x: 720, y: 445 }],
        bombSpawns:       [{ x: 230, y: 290 }, { x: 620, y: 280 }],
        springSpawns:     [{ x: 0, y: 446 }, { x: 730, y: 446 }],
        speedBoostSpawns: [{ x: 375, y: 310 }],
        magnetSpawns:     [{ x: 460, y: 90  }],
        freezeSpawns:     [{ x: 65,  y: 220 }, { x: 625, y: 195 }],
        ghostSpawns:      [{ x: 500, y: 90  }],
        electroSpawns:    [{ x: 350, y: 90  }, { x: 260, y: 195 }],
        slowMoSpawns:     [{ x: 165, y: 125 }, { x: 580, y: 115 }],
        rocketSpawns:     [{ x: 160, y: 90 }, { x: 520, y: 90 }], // Feature 80
        magBootsSpawns:   [{ x: 420, y: 90  }], // Feature 85
        giantSpawns:      [{ x: 210, y: 90 }, { x: 590, y: 90 }], // Feature 87
        scoreBoostSpawns: [{ x: 550, y: 90  }],
        checkpointSpawns: [{ x: 395, y: 435 }],
        flyingMarioSpawns:    [{ x: 160, y: 185 }, { x: 420, y: 165 }, { x: 640, y: 180 }],
        shooterMarioSpawns:   [{ x: 340, y: 90  }, { x: 490, y: 105 }],
        teleporterMarioSpawns:[{ x: 200, y: 420 }, { x: 580, y: 415 }], // Feature 89
        parachuteMarioSpawns: [{ x: 180, y: -60 }, { x: 420, y: -90 }, { x: 680, y: -50 }], // Feature 71
        portalSpawns: [
            { blue: { x: 10, y: 420 }, orange: { x: 380, y: 90 } },
            { blue: { x: 450, y: 420 }, orange: { x: 160, y: 130 } },
        ],
        spikeSpawns: [{ x: 52, y: 444, count: 3 }, { x: 360, y: 444, count: 2 }, { x: 620, y: 444, count: 3 }], // Feature 91
    },
    // === FEATURE 100: LEVEL 16 — КОСМОС (Space) ===
    {
        name: 'Космос',
        lowGravity: true, // Feature 100: reduced gravity
        platforms: [
            { x: 0,   y: 460, w: 800, h: 40 },           // ground
            { x: 80,  y: 380, w: 120, h: 14 },
            { x: 270, y: 360, w: 100, h: 14 },
            { x: 450, y: 380, w: 110, h: 14 },
            { x: 620, y: 360, w: 130, h: 14 },
            { x: 160, y: 285, w: 110, h: 14, moving: true, moveAxis: 'x', moveRange: 80, moveSpeed: 1.2 },
            { x: 370, y: 270, w: 110, h: 14, moving: true, moveAxis: 'x', moveRange: 80, moveSpeed: -1.4 },
            { x: 560, y: 285, w: 110, h: 14, moving: true, moveAxis: 'y', moveRange: 40, moveSpeed: 1.1 },
            { x: 90,  y: 195, w: 100, h: 14 },
            { x: 310, y: 180, w: 110, h: 14 },
            { x: 540, y: 200, w: 100, h: 14 },
            { x: 680, y: 185, w: 80,  h: 14 },
            { x: 200, y: 100, w: 120, h: 14, ice: true },
            { x: 420, y: 90,  w: 130, h: 14, ice: true },
            { x: 620, y: 100, w: 80,  h: 14 },
        ],
        marioSpawns: [
            { x: 100, y: 430 }, { x: 350, y: 430 }, { x: 600, y: 430 },
            { x: 160, y: 250 }, { x: 540, y: 250 },
        ],
        marioTypes: ['fast', 'ghost_mario', 'teleporter', 'ghost_mario', 'armored'],
        marioSpeed: 2.4,
        playerSpawn: { x: 30, y: 430 },
        coinSpawns: [
            { x: 100, y: 435 }, { x: 350, y: 435 }, { x: 610, y: 435 },
            { x: 100, y: 350 }, { x: 300, y: 335 }, { x: 490, y: 350 }, { x: 660, y: 335 },
            { x: 175, y: 255 }, { x: 390, y: 240 }, { x: 590, y: 255 },
            { x: 120, y: 165 }, { x: 345, y: 150 }, { x: 565, y: 170 }, { x: 700, y: 155 },
            { x: 240, y: 70  }, { x: 450, y: 60  }, { x: 650, y: 70  },
        ],
        doubleCoinSpawns: [
            { x: 250, y: 70 }, { x: 490, y: 60 },
        ],
        tripleCoinSpawns: [{ x: 480, y: 58 }],
        starSpawns:       [{ x: 220, y: 68 }, { x: 640, y: 68 }],
        shieldSpawns:     [{ x: 80,  y: 445 }, { x: 680, y: 445 }],
        bombSpawns:       [{ x: 310, y: 248 }, { x: 555, y: 168 }],
        springSpawns:     [{ x: 80,  y: 446 }],
        speedBoostSpawns: [{ x: 380, y: 248 }],
        magnetSpawns:     [{ x: 460, y: 58  }],
        freezeSpawns:     [{ x: 95,  y: 163 }, { x: 555, y: 168 }],
        ghostSpawns:      [{ x: 500, y: 58  }],
        electroSpawns:    [{ x: 350, y: 148 }],
        slowMoSpawns:     [{ x: 640, y: 98  }],
        rocketSpawns:     [{ x: 200, y: 68  }, { x: 420, y: 58  }], // Feature 80
        magBootsSpawns:   [{ x: 440, y: 58  }], // Feature 85
        giantSpawns:      [{ x: 240, y: 68  }, { x: 600, y: 68  }], // Feature 87
        jetpackSpawns:    [{ x: 330, y: 68  }, { x: 570, y: 68  }], // Feature 99
        scoreBoostSpawns: [{ x: 680, y: 68  }],
        checkpointSpawns: [{ x: 380, y: 435 }],
        flyingMarioSpawns:     [{ x: 200, y: 140 }, { x: 460, y: 125 }, { x: 680, y: 145 }],
        teleporterMarioSpawns: [{ x: 320, y: 430 }, { x: 630, y: 425 }],
        parachuteMarioSpawns:  [{ x: 150, y: -60 }, { x: 450, y: -80 }, { x: 700, y: -50 }],
        spikeSpawns: [{ x: 200, y: 444, count: 2 }, { x: 500, y: 444, count: 3 }],
        portalSpawns: [
            { blue: { x: 10, y: 420 }, orange: { x: 400, y: 58 } },
        ],
    },
    // === FEATURE 106: LEVEL 17 — ПОДЗЕМЕЛЬЕ (Underground) ===
    {
        name: 'Подземелье',
        isUnderground: true,
        platforms: [
            // Bottom tier — main floor gaps
            { x: 0,   y: 460, w: 130, h: 40 },
            { x: 180, y: 460, w: 110, h: 40 },
            { x: 350, y: 460, w: 100, h: 40 },
            { x: 510, y: 460, w: 120, h: 40 },
            { x: 690, y: 460, w: 110, h: 40 },
            // Conveyor belt platforms — mid tier
            { x: 80,  y: 380, w: 110, h: 18, conveyor:  1 },   // right conveyor
            { x: 260, y: 360, w: 110, h: 18, conveyor: -1 },   // left conveyor
            { x: 440, y: 380, w: 110, h: 18, conveyor:  1 },   // right conveyor
            { x: 620, y: 360, w: 120, h: 18, conveyor: -1 },   // left conveyor
            // Regular platforms — upper-mid
            { x: 30,  y: 290, w: 100, h: 18 },
            { x: 195, y: 275, w: 100, h: 18, crumble: true },
            { x: 360, y: 295, w: 100, h: 18 },
            { x: 525, y: 275, w: 100, h: 18, crumble: true },
            { x: 680, y: 290, w: 90,  h: 18 },
            // More conveyors — second set
            { x: 110, y: 200, w: 120, h: 18, conveyor: -1 },
            { x: 340, y: 185, w: 120, h: 18, conveyor:  1 },
            { x: 565, y: 200, w: 120, h: 18, conveyor: -1 },
            // Top platforms
            { x: 50,  y: 110, w: 110, h: 18 },
            { x: 240, y: 95,  w: 160, h: 18 },
            { x: 490, y: 105, w: 120, h: 18 },
            { x: 680, y: 95,  w: 80,  h: 18 },
        ],
        marioSpawns: [
            { x: 20,  y: 430 },
            { x: 370, y: 430 },
            { x: 710, y: 430 },
            { x: 200, y: 340 },
            { x: 540, y: 340 },
        ],
        marioTypes: ['normal', 'fast', 'armored', 'armored', 'fast'],
        marioSpeed: 2.8,
        playerSpawn: { x: 20, y: 430 },
        coinSpawns: [
            { x: 50,  y: 435 }, { x: 220, y: 435 }, { x: 390, y: 435 }, { x: 545, y: 435 }, { x: 720, y: 435 },
            { x: 100, y: 355 }, { x: 290, y: 335 }, { x: 470, y: 355 }, { x: 655, y: 335 },
            { x: 55,  y: 265 }, { x: 220, y: 250 }, { x: 390, y: 270 }, { x: 555, y: 250 }, { x: 710, y: 265 },
            { x: 140, y: 175 }, { x: 380, y: 160 }, { x: 610, y: 175 },
            { x: 80,  y: 85  }, { x: 290, y: 70  }, { x: 510, y: 80  }, { x: 700, y: 70  },
        ],
        doubleCoinSpawns: [{ x: 350, y: 70 }, { x: 550, y: 80 }],
        tripleCoinSpawns: [{ x: 320, y: 70 }],
        starSpawns:       [{ x: 280, y: 70 }, { x: 530, y: 80 }],
        shieldSpawns:     [{ x: 0,   y: 445 }, { x: 700, y: 445 }],
        bombSpawns:       [{ x: 230, y: 250 }, { x: 570, y: 255 }],
        springSpawns:     [{ x: 0, y: 446 }, { x: 710, y: 446 }],
        speedBoostSpawns: [{ x: 380, y: 160 }],
        magnetSpawns:     [{ x: 460, y: 70  }],
        freezeSpawns:     [{ x: 90,  y: 85  }, { x: 600, y: 80  }],
        ghostSpawns:      [{ x: 500, y: 70  }],
        electroSpawns:    [{ x: 340, y: 70  }],
        slowMoSpawns:     [{ x: 440, y: 175 }],
        rocketSpawns:     [{ x: 180, y: 70  }, { x: 480, y: 70  }],
        jetpackSpawns:    [{ x: 270, y: 70  }],
        scoreBoostSpawns: [{ x: 590, y: 70  }],
        flashlightSpawns: [{ x: 390, y: 70  }, { x: 150, y: 265 }, { x: 640, y: 175 }], // Feature 105
        checkpointSpawns: [{ x: 380, y: 450 }],
        berserkerMarioSpawns: [{ x: 200, y: 250 }, { x: 500, y: 260 }], // Feature 103
        flyingMarioSpawns:    [{ x: 160, y: 160 }, { x: 420, y: 145 }, { x: 650, y: 160 }],
        shooterMarioSpawns:   [{ x: 260, y: 75  }, { x: 520, y: 85  }],
        parachuteMarioSpawns: [{ x: 100, y: -60 }, { x: 500, y: -80 }],
        spikeSpawns: [{ x: 132, y: 444, count: 2 }, { x: 452, y: 444, count: 2 }],
    },
    // === FEATURE 133: LEVEL 18 — МАТРИЦА ===
    {
        name: 'Матрица',
        isMatrix: true,
        platforms: [
            // Bottom floor with gaps
            { x: 0,   y: 460, w: 120, h: 40 },
            { x: 175, y: 460, w: 120, h: 40 },
            { x: 355, y: 460, w: 110, h: 40 },
            { x: 520, y: 460, w: 120, h: 40 },
            { x: 695, y: 460, w: 105, h: 40 },
            // Mid tier
            { x: 60,  y: 370, w: 110, h: 18 },
            { x: 230, y: 355, w: 120, h: 18, crumble: true },
            { x: 410, y: 370, w: 110, h: 18 },
            { x: 595, y: 355, w: 110, h: 18, crumble: true },
            // Upper-mid
            { x: 20,  y: 275, w: 100, h: 18 },
            { x: 195, y: 265, w: 115, h: 18 },
            { x: 370, y: 280, w: 100, h: 18 },
            { x: 545, y: 265, w: 110, h: 18 },
            { x: 695, y: 275, w: 85,  h: 18 },
            // Top tier
            { x: 80,  y: 170, w: 120, h: 18 },
            { x: 290, y: 155, w: 200, h: 18 },
            { x: 560, y: 165, w: 120, h: 18 },
            // Very top
            { x: 180, y: 70,  w: 140, h: 18 },
            { x: 440, y: 70,  w: 140, h: 18 },
        ],
        marioSpawns: [
            { x: 10,  y: 430 }, { x: 380, y: 430 }, { x: 710, y: 430 },
            { x: 250, y: 335 }, { x: 610, y: 335 },
            { x: 300, y: 140 }, { x: 480, y: 45  },
        ],
        marioTypes: ['fast', 'armored', 'fast', 'berserker', 'armored', 'teleporter', 'ghost_mario'],
        marioSpeed: 3.0,
        playerSpawn: { x: 30, y: 430 },
        coinSpawns: [
            { x: 40,  y: 435 }, { x: 210, y: 435 }, { x: 390, y: 435 }, { x: 555, y: 435 }, { x: 720, y: 435 },
            { x: 90,  y: 345 }, { x: 270, y: 330 }, { x: 450, y: 345 }, { x: 630, y: 330 },
            { x: 40,  y: 250 }, { x: 230, y: 240 }, { x: 400, y: 255 }, { x: 575, y: 240 }, { x: 720, y: 250 },
            { x: 120, y: 145 }, { x: 350, y: 130 }, { x: 595, y: 140 },
            { x: 220, y: 45  }, { x: 350, y: 45  }, { x: 480, y: 45  }, { x: 560, y: 45  },
        ],
        doubleCoinSpawns: [{ x: 310, y: 130 }, { x: 500, y: 45 }],
        tripleCoinSpawns: [{ x: 390, y: 45 }],
        starSpawns:       [{ x: 260, y: 45  }, { x: 520, y: 45  }],
        shieldSpawns:     [{ x: 0,   y: 445 }, { x: 715, y: 445 }],
        bombSpawns:       [{ x: 200, y: 240 }, { x: 560, y: 245 }],
        springSpawns:     [{ x: 60, y: 446 }, { x: 680, y: 446 }],
        speedBoostSpawns: [{ x: 340, y: 45 }],
        magnetSpawns:     [{ x: 455, y: 45 }],
        freezeSpawns:     [{ x: 100, y: 145 }, { x: 610, y: 145 }],
        ghostSpawns:      [{ x: 260, y: 130 }],
        electroSpawns:    [{ x: 420, y: 45  }],
        slowMoSpawns:     [{ x: 590, y: 45  }],
        rocketSpawns:     [{ x: 190, y: 45  }, { x: 540, y: 45  }],
        jetpackSpawns:    [{ x: 310, y: 45  }],
        scoreBoostSpawns: [{ x: 480, y: 45  }],
        checkpointSpawns: [{ x: 380, y: 450 }],
        flyingMarioSpawns:     [{ x: 150, y: 120 }, { x: 430, y: 110 }, { x: 680, y: 130 }],
        shooterMarioSpawns:    [{ x: 280, y: 45  }, { x: 500, y: 45  }],
        teleporterMarioSpawns: [{ x: 110, y: 430 }, { x: 600, y: 430 }],
        parachuteMarioSpawns:  [{ x: 100, y: -60 }, { x: 450, y: -80 }, { x: 700, y: -60 }],
        spikeSpawns: [{ x: 122, y: 444, count: 2 }, { x: 455, y: 444, count: 2 }],
    },
    // === FEATURE 142: LEVEL 19 — БУРЯ ===
    {
        name: 'Буря',
        isStorm: true,
        hasWind: true,
        platforms: [
            // Floor with gaps
            { x: 0,   y: 460, w: 140, h: 40 },
            { x: 195, y: 460, w: 130, h: 40 },
            { x: 385, y: 460, w: 110, h: 40 },
            { x: 555, y: 460, w: 130, h: 40 },
            { x: 740, y: 460, w: 60,  h: 40 },
            // Mid-low tier — some ice (wind + ice = chaos)
            { x: 50,  y: 370, w: 120, h: 18, ice: true },
            { x: 240, y: 355, w: 110, h: 18 },
            { x: 420, y: 375, w: 115, h: 18, ice: true },
            { x: 600, y: 355, w: 110, h: 18, crumble: true },
            // Mid tier
            { x: 10,  y: 275, w: 100, h: 18 },
            { x: 195, y: 265, w: 105, h: 18, crumble: true },
            { x: 360, y: 278, w: 100, h: 18 },
            { x: 540, y: 268, w: 105, h: 18, ice: true },
            { x: 700, y: 278, w: 80,  h: 18 },
            // Upper tier
            { x: 75,  y: 175, w: 120, h: 18 },
            { x: 285, y: 162, w: 115, h: 18 },
            { x: 470, y: 170, w: 115, h: 18, crumble: true },
            { x: 655, y: 175, w: 95,  h: 18 },
            // Top platforms
            { x: 160, y: 75,  w: 130, h: 18 },
            { x: 440, y: 68,  w: 130, h: 18 },
        ],
        marioSpawns: [
            { x: 10,  y: 430 }, { x: 400, y: 430 }, { x: 565, y: 430 },
            { x: 260, y: 335 }, { x: 615, y: 335 },
            { x: 90,  y: 255 }, { x: 550, y: 248 },
            { x: 300, y: 140 }, { x: 495, y: 45  },
        ],
        marioTypes: ['fast', 'armored', 'berserker', 'armored', 'ghost_mario', 'fast', 'berserker', 'teleporter', 'flying'],
        marioSpeed: 3.2,
        playerSpawn: { x: 30, y: 430 },
        coinSpawns: [
            { x: 35,  y: 435 }, { x: 220, y: 435 }, { x: 410, y: 435 }, { x: 580, y: 435 }, { x: 755, y: 435 },
            { x: 80,  y: 345 }, { x: 275, y: 330 }, { x: 455, y: 350 }, { x: 640, y: 330 },
            { x: 25,  y: 250 }, { x: 225, y: 240 }, { x: 390, y: 253 }, { x: 570, y: 243 }, { x: 720, y: 253 },
            { x: 115, y: 150 }, { x: 320, y: 138 }, { x: 505, y: 145 }, { x: 685, y: 150 },
            { x: 195, y: 50  }, { x: 310, y: 50  }, { x: 460, y: 43  }, { x: 550, y: 43  },
        ],
        doubleCoinSpawns: [{ x: 295, y: 138 }, { x: 510, y: 43 }],
        tripleCoinSpawns: [{ x: 460, y: 43 }],
        starSpawns:       [{ x: 185, y: 50  }, { x: 555, y: 43 }],
        shieldSpawns:     [{ x: 0,   y: 445 }, { x: 750, y: 445 }],
        bombSpawns:       [{ x: 210, y: 243 }, { x: 560, y: 248 }],
        springSpawns:     [{ x: 55, y: 446 }, { x: 690, y: 446 }],
        speedBoostSpawns: [{ x: 340, y: 43 }],
        magnetSpawns:     [{ x: 460, y: 43 }],
        freezeSpawns:     [{ x: 105, y: 150 }, { x: 665, y: 150 }],
        ghostSpawns:      [{ x: 275, y: 138 }],
        electroSpawns:    [{ x: 475, y: 43 }],
        slowMoSpawns:     [{ x: 530, y: 43 }],
        rocketSpawns:     [{ x: 200, y: 43 }, { x: 565, y: 43 }],
        scoreBoostSpawns: [{ x: 505, y: 43 }],
        checkpointSpawns: [{ x: 390, y: 450 }],
        flyingMarioSpawns:     [{ x: 100, y: 115 }, { x: 360, y: 100 }, { x: 620, y: 110 }],
        shooterMarioSpawns:    [{ x: 300, y: 138 }, { x: 475, y: 140 }],
        teleporterMarioSpawns: [{ x: 120, y: 430 }, { x: 610, y: 430 }],
        parachuteMarioSpawns:  [{ x: 80,  y: -60 }, { x: 380, y: -80 }, { x: 660, y: -60 }],
        spikeSpawns: [{ x: 142, y: 444, count: 2 }, { x: 498, y: 444, count: 2 }],
    },
    // === FEATURE 146: LEVEL 20 — ИНФЕРНО ===
    {
        name: 'Инферно',
        isVolcano: true,
        platforms: [
            // Lava-separated floor sections
            { x: 0,   y: 460, w: 100, h: 40 },
            { x: 160, y: 460, w: 100, h: 40 },
            { x: 320, y: 460, w: 100, h: 40 },
            { x: 480, y: 460, w: 100, h: 40 },
            { x: 650, y: 460, w: 150, h: 40 },
            // Mid-low — mix of crumble and ice
            { x: 40,  y: 375, w: 100, h: 18, crumble: true },
            { x: 210, y: 360, w: 110, h: 18 },
            { x: 385, y: 375, w: 100, h: 18, crumble: true },
            { x: 560, y: 360, w: 110, h: 18 },
            { x: 700, y: 375, w: 80,  h: 18 },
            // Mid
            { x: 10,  y: 275, w: 90,  h: 18 },
            { x: 185, y: 265, w: 100, h: 18, ice: true },
            { x: 355, y: 278, w: 100, h: 18 },
            { x: 525, y: 265, w: 100, h: 18, ice: true },
            { x: 700, y: 278, w: 80,  h: 18, crumble: true },
            // Upper
            { x: 60,  y: 180, w: 110, h: 18 },
            { x: 270, y: 165, w: 120, h: 18 },
            { x: 470, y: 175, w: 110, h: 18 },
            { x: 670, y: 180, w: 90,  h: 18, crumble: true },
            // Top
            { x: 150, y: 75,  w: 130, h: 18 },
            { x: 430, y: 65,  w: 135, h: 18 },
        ],
        marioSpawns: [
            { x: 10,  y: 430 }, { x: 170, y: 430 }, { x: 495, y: 430 }, { x: 665, y: 430 },
            { x: 220, y: 340 }, { x: 575, y: 340 },
            { x: 90,  y: 255 }, { x: 540, y: 245 },
            { x: 285, y: 143 }, { x: 490, y: 40  },
        ],
        marioTypes: ['fast', 'armored', 'berserker', 'fast', 'ghost_mario', 'teleporter', 'armored', 'berserker', 'shooter', 'flying'],
        marioSpeed: 3.4,
        playerSpawn: { x: 20, y: 430 },
        coinSpawns: [
            { x: 30,  y: 435 }, { x: 190, y: 435 }, { x: 345, y: 435 }, { x: 505, y: 435 }, { x: 685, y: 435 },
            { x: 70,  y: 350 }, { x: 250, y: 335 }, { x: 420, y: 350 }, { x: 600, y: 335 },
            { x: 25,  y: 250 }, { x: 215, y: 240 }, { x: 385, y: 253 }, { x: 555, y: 240 }, { x: 720, y: 253 },
            { x: 100, y: 155 }, { x: 310, y: 140 }, { x: 500, y: 150 }, { x: 695, y: 155 },
            { x: 185, y: 50  }, { x: 310, y: 40  }, { x: 445, y: 40  }, { x: 540, y: 40  },
        ],
        doubleCoinSpawns: [{ x: 280, y: 140 }, { x: 510, y: 40 }],
        tripleCoinSpawns: [{ x: 465, y: 40 }],
        starSpawns:       [{ x: 175, y: 50  }, { x: 545, y: 40 }],
        shieldSpawns:     [{ x: 0,   y: 445 }, { x: 755, y: 445 }],
        bombSpawns:       [{ x: 200, y: 240 }, { x: 550, y: 245 }],
        springSpawns:     [{ x: 45, y: 446 }, { x: 655, y: 446 }],
        speedBoostSpawns: [{ x: 340, y: 40 }],
        magnetSpawns:     [{ x: 450, y: 40 }],
        freezeSpawns:     [{ x: 100, y: 155 }, { x: 660, y: 155 }],
        ghostSpawns:      [{ x: 265, y: 140 }],
        electroSpawns:    [{ x: 420, y: 40  }],
        slowMoSpawns:     [{ x: 510, y: 40  }],
        rocketSpawns:     [{ x: 185, y: 40  }, { x: 540, y: 40  }],
        scoreBoostSpawns: [{ x: 475, y: 40  }],
        jetpackSpawns:    [{ x: 310, y: 40  }],
        bubbleSpawns:     [{ x: 460, y: 40  }],
        checkpointSpawns: [{ x: 380, y: 450 }],
        flyingMarioSpawns:     [{ x: 120, y: 125 }, { x: 420, y: 110 }, { x: 680, y: 125 }],
        shooterMarioSpawns:    [{ x: 290, y: 140 }, { x: 490, y: 148 }],
        teleporterMarioSpawns: [{ x: 110, y: 430 }, { x: 590, y: 430 }],
        parachuteMarioSpawns:  [{ x: 90,  y: -60 }, { x: 390, y: -80 }, { x: 670, y: -60 }],
        spikeSpawns: [{ x: 103, y: 444, count: 2 }, { x: 422, y: 444, count: 2 }],
    },
    // === LEVEL 21: ВЕЧНОСТЬ (Feature 164) ===
    {
        name: 'Вечность',
        hasWind: true,
        platforms: [
            // Broken floor sections with gaps
            { x: 0,   y: 460, w: 90,  h: 40 },
            { x: 150, y: 460, w: 90,  h: 40 },
            { x: 310, y: 460, w: 90,  h: 40, conveyor: 1 },
            { x: 470, y: 460, w: 90,  h: 40 },
            { x: 630, y: 460, w: 90,  h: 40, conveyor: -1 },
            // Low-mid — ice and crumble mix
            { x: 30,  y: 370, w: 100, h: 18, ice: true },
            { x: 195, y: 355, w: 100, h: 18, crumble: true },
            { x: 360, y: 368, w: 100, h: 18 },
            { x: 520, y: 355, w: 100, h: 18, ice: true },
            { x: 690, y: 368, w: 80,  h: 18, crumble: true },
            // Mid — moving + pulse platforms
            { x: 10,  y: 270, w: 110, h: 18, pulse: true },
            { x: 190, y: 258, w: 100, h: 18, moveAxis: 'x', moveRange: 80, moveSpeed: 1.4 },
            { x: 360, y: 270, w: 80,  h: 18, crumble: true },
            { x: 490, y: 258, w: 100, h: 18, moveAxis: 'x', moveRange: 60, moveSpeed: 1.6 },
            { x: 680, y: 270, w: 90,  h: 18, pulse: true },
            // Upper — varied heights
            { x: 50,  y: 175, w: 120, h: 18 },
            { x: 245, y: 160, w: 110, h: 18, ice: true },
            { x: 430, y: 170, w: 110, h: 18, moveAxis: 'y', moveRange: 40, moveSpeed: 1.2 },
            { x: 620, y: 175, w: 110, h: 18, crumble: true },
            // Top
            { x: 110, y: 80,  w: 140, h: 18, pulse: true },
            { x: 370, y: 65,  w: 140, h: 18 },
            { x: 590, y: 80,  w: 100, h: 18 },
        ],
        marioSpawns: [
            { x: 5,   y: 430 }, { x: 160, y: 430 }, { x: 480, y: 430 }, { x: 645, y: 430 },
            { x: 215, y: 330 }, { x: 540, y: 330 },
            { x: 100, y: 248 }, { x: 520, y: 238 },
            { x: 270, y: 135 }, { x: 450, y: 42  }, { x: 620, y: 50  },
        ],
        marioTypes: ['fast', 'armored', 'berserker', 'ghost_mario', 'teleporter', 'fast', 'berserker', 'armored', 'shooter', 'flying', 'ghost_mario'],
        marioSpeed: 3.6,
        playerSpawn: { x: 20, y: 430 },
        coinSpawns: [
            { x: 15,  y: 435 }, { x: 175, y: 435 }, { x: 330, y: 435 }, { x: 490, y: 435 }, { x: 650, y: 435 },
            { x: 55,  y: 345 }, { x: 225, y: 330 }, { x: 400, y: 343 }, { x: 555, y: 330 },
            { x: 40,  y: 245 }, { x: 220, y: 233 }, { x: 385, y: 245 }, { x: 520, y: 233 }, { x: 710, y: 245 },
            { x: 90,  y: 150 }, { x: 285, y: 135 }, { x: 475, y: 145 }, { x: 650, y: 150 },
            { x: 150, y: 55  }, { x: 275, y: 40  }, { x: 420, y: 40  }, { x: 530, y: 40  }, { x: 620, y: 55  },
        ],
        doubleCoinSpawns:   [{ x: 265, y: 135 }, { x: 455, y: 40 }],
        tripleCoinSpawns:   [{ x: 400, y: 40 }],
        rainbowCoinSpawns:  [{ x: 580, y: 55 }],
        lightningCoinSpawns:[{ x: 130, y: 55 }],
        explodingCoinSpawns:[{ x: 700, y: 50 }],
        starSpawns:         [{ x: 140, y: 55 }, { x: 560, y: 40 }],
        shieldSpawns:       [{ x: 0,   y: 445 }, { x: 730, y: 445 }],
        bombSpawns:         [{ x: 260, y: 135 }, { x: 510, y: 145 }],
        springSpawns:       [{ x: 40, y: 446 }, { x: 645, y: 446 }],
        speedBoostSpawns:   [{ x: 390, y: 40 }],
        magnetSpawns:       [{ x: 480, y: 40 }],
        freezeSpawns:       [{ x: 100, y: 150 }, { x: 650, y: 150 }],
        ghostSpawns:        [{ x: 280, y: 135 }],
        electroSpawns:      [{ x: 430, y: 40 }],
        slowMoSpawns:       [{ x: 530, y: 40 }],
        rocketSpawns:       [{ x: 200, y: 40 }, { x: 595, y: 55 }],
        scoreBoostSpawns:   [{ x: 340, y: 40 }],
        jetpackSpawns:      [{ x: 460, y: 40 }],
        bubbleSpawns:       [{ x: 370, y: 65 }],
        spikeBootsSpawns:   [{ x: 490, y: 40 }],
        healSpawns:         [{ x: 120, y: 55 }],
        checkpointSpawns:   [{ x: 380, y: 450 }],
        flyingMarioSpawns:      [{ x: 150, y: 115 }, { x: 450, y: 100 }, { x: 700, y: 115 }],
        shooterMarioSpawns:     [{ x: 300, y: 135 }, { x: 505, y: 143 }],
        teleporterMarioSpawns:  [{ x: 90,  y: 430 }, { x: 560, y: 430 }],
        parachuteMarioSpawns:   [{ x: 100, y: -60 }, { x: 400, y: -80 }, { x: 680, y: -60 }],
        berserkerMarioSpawns:   [{ x: 200, y: 430 }, { x: 640, y: 430 }],
        spikeSpawns: [
            { x: 93,  y: 444, count: 2 },
            { x: 313, y: 444, count: 2 },
            { x: 563, y: 444, count: 2 },
        ],
    },
    // === LEVEL 22: ОРБИТА (Feature 166) — low gravity, floating arenas ===
    {
        name: 'Орбита',
        lowGravity: true,
        platforms: [
            // Ground sections with big gaps
            { x: 0,   y: 460, w: 80,  h: 40 },
            { x: 160, y: 460, w: 80,  h: 40 },
            { x: 380, y: 460, w: 80,  h: 40 },
            { x: 600, y: 460, w: 80,  h: 40 },
            // Low floating platforms
            { x: 60,  y: 370, w: 100, h: 16, moveAxis: 'x', moveRange: 60, moveSpeed: 0.9 },
            { x: 260, y: 355, w: 80,  h: 16, pulse: true },
            { x: 430, y: 368, w: 90,  h: 16, ice: true },
            { x: 620, y: 355, w: 80,  h: 16, moveAxis: 'y', moveRange: 35, moveSpeed: 0.7 },
            // Mid platforms
            { x: 20,  y: 270, w: 110, h: 16, pulse: true },
            { x: 210, y: 258, w: 90,  h: 16, moveAxis: 'x', moveRange: 70, moveSpeed: 1.1 },
            { x: 390, y: 270, w: 80,  h: 16, crumble: true },
            { x: 560, y: 258, w: 100, h: 16, pulse: true },
            // Upper
            { x: 50,  y: 175, w: 110, h: 16, ice: true },
            { x: 250, y: 162, w: 100, h: 16, moveAxis: 'x', moveRange: 80, moveSpeed: 1.3 },
            { x: 450, y: 170, w: 100, h: 16, moveAxis: 'y', moveRange: 50, moveSpeed: 1.0 },
            { x: 650, y: 175, w: 80,  h: 16, crumble: true },
            // Top
            { x: 100, y: 80,  w: 140, h: 16, pulse: true },
            { x: 340, y: 65,  w: 120, h: 16 },
            { x: 570, y: 80,  w: 100, h: 16, ice: true },
        ],
        marioSpawns: [
            { x: 10,  y: 430 }, { x: 170, y: 430 }, { x: 610, y: 430 },
            { x: 270, y: 330 }, { x: 640, y: 330 },
            { x: 105, y: 248 }, { x: 570, y: 238 },
            { x: 260, y: 138 }, { x: 460, y: 42  },
        ],
        marioTypes: ['fast', 'ghost_mario', 'teleporter', 'berserker', 'ghost_mario', 'fast', 'teleporter', 'berserker', 'armored'],
        marioSpeed: 2.8,
        playerSpawn: { x: 15, y: 430 },
        coinSpawns: [
            { x: 15,  y: 435 }, { x: 175, y: 435 }, { x: 395, y: 435 }, { x: 615, y: 435 },
            { x: 85,  y: 348 }, { x: 290, y: 333 }, { x: 460, y: 343 }, { x: 650, y: 333 },
            { x: 50,  y: 248 }, { x: 240, y: 233 }, { x: 420, y: 245 }, { x: 600, y: 233 },
            { x: 90,  y: 153 }, { x: 285, y: 138 }, { x: 490, y: 145 }, { x: 670, y: 152 },
            { x: 150, y: 55  }, { x: 380, y: 40  }, { x: 610, y: 55  },
        ],
        doubleCoinSpawns:   [{ x: 265, y: 138 }, { x: 470, y: 40 }],
        tripleCoinSpawns:   [{ x: 360, y: 40 }],
        rainbowCoinSpawns:  [{ x: 550, y: 55 }],
        lightningCoinSpawns:[{ x: 110, y: 55 }],
        warpCoinSpawns:     [{ x: 640, y: 55 }, { x: 200, y: 55 }],
        starSpawns:         [{ x: 120, y: 55 }, { x: 590, y: 55 }],
        shieldSpawns:       [{ x: 0, y: 445 }, { x: 720, y: 445 }],
        bombSpawns:         [{ x: 250, y: 138 }, { x: 475, y: 145 }],
        springSpawns:       [{ x: 55, y: 446 }, { x: 615, y: 446 }],
        speedBoostSpawns:   [{ x: 380, y: 40 }],
        magnetSpawns:       [{ x: 450, y: 40 }],
        freezeSpawns:       [{ x: 90,  y: 152 }, { x: 660, y: 152 }],
        ghostSpawns:        [{ x: 300, y: 138 }],
        electroSpawns:      [{ x: 410, y: 40 }],
        slowMoSpawns:       [{ x: 510, y: 40 }],
        rocketSpawns:       [{ x: 175, y: 40 }, { x: 575, y: 55 }],
        scoreBoostSpawns:   [{ x: 330, y: 40 }],
        jetpackSpawns:      [{ x: 440, y: 40 }],
        bubbleSpawns:       [{ x: 355, y: 65 }],
        spikeBootsSpawns:   [{ x: 465, y: 40 }],
        healSpawns:         [{ x: 110, y: 55 }],
        checkpointSpawns:   [{ x: 385, y: 450 }],
        flyingMarioSpawns:      [{ x: 130, y: 108 }, { x: 430, y: 95 }, { x: 700, y: 108 }],
        teleporterMarioSpawns:  [{ x: 80,  y: 420 }, { x: 540, y: 420 }],
        parachuteMarioSpawns:   [{ x: 120, y: -60 }, { x: 380, y: -80 }, { x: 660, y: -60 }],
    },

    // === LEVEL 23: БОМБАРДИРОВКА (Feature 168) — explosive barrels, multi-platform arena ===
    {
        name: 'Бомбардировка',
        platforms: [
            // Ground sections
            { x: 0,   y: 460, w: 120, h: 40 },
            { x: 200, y: 460, w: 100, h: 40 },
            { x: 400, y: 460, w: 100, h: 40 },
            { x: 600, y: 460, w: 200, h: 40 },
            // Low mid platforms
            { x: 80,  y: 370, w: 100, h: 16 },
            { x: 270, y: 360, w: 90,  h: 16, moveAxis: 'x', moveRange: 60, moveSpeed: 1.0 },
            { x: 450, y: 370, w: 90,  h: 16, crumble: true },
            { x: 620, y: 360, w: 100, h: 16 },
            // Mid platforms
            { x: 20,  y: 275, w: 110, h: 16 },
            { x: 220, y: 262, w: 90,  h: 16, ice: true },
            { x: 400, y: 270, w: 90,  h: 16, moveAxis: 'y', moveRange: 40, moveSpeed: 0.9 },
            { x: 590, y: 265, w: 110, h: 16, crumble: true },
            // Upper platforms
            { x: 60,  y: 178, w: 110, h: 16, ice: true },
            { x: 260, y: 165, w: 100, h: 16, moveAxis: 'x', moveRange: 80, moveSpeed: 1.2 },
            { x: 460, y: 174, w: 100, h: 16 },
            { x: 650, y: 178, w: 90,  h: 16, crumble: true },
            // Top
            { x: 100, y: 82,  w: 140, h: 16 },
            { x: 340, y: 68,  w: 120, h: 16 },
            { x: 570, y: 82,  w: 110, h: 16 },
        ],
        marioSpawns: [
            { x: 10,  y: 430 }, { x: 210, y: 430 },
            { x: 620, y: 430 }, { x: 680, y: 430 },
            { x: 290, y: 338 }, { x: 630, y: 338 },
            { x: 30,  y: 253 }, { x: 605, y: 243 },
        ],
        marioTypes: ['fast', 'armored', 'berserker', 'fast', 'ghost_mario', 'teleporter', 'berserker', 'armored'],
        shooterMarioSpawns: [{ x: 110, y: 158 }, { x: 480, y: 154 }],
        flyingMarioSpawns:  [{ x: 150, y: 100 }, { x: 500, y: 88 }],
        parachuteMarioSpawns: [{ x: 200, y: -50 }, { x: 550, y: -70 }],
        marioSpeed: 3.0,
        playerSpawn: { x: 10, y: 430 },
        barrelSpawns: [
            { x: 50,  y: 424 }, { x: 460, y: 424 }, { x: 650, y: 424 },
            { x: 90,  y: 334 }, { x: 640, y: 324 },
            { x: 115, y: 142 }, { x: 473, y: 138 },
        ],
        coinSpawns: [
            { x: 15,  y: 438 }, { x: 215, y: 438 }, { x: 415, y: 438 }, { x: 625, y: 438 },
            { x: 100, y: 348 }, { x: 310, y: 338 }, { x: 500, y: 348 }, { x: 650, y: 338 },
            { x: 50,  y: 253 }, { x: 250, y: 240 }, { x: 430, y: 248 }, { x: 620, y: 243 },
            { x: 100, y: 156 }, { x: 300, y: 143 }, { x: 500, y: 152 }, { x: 680, y: 156 },
            { x: 160, y: 60  }, { x: 380, y: 46  }, { x: 610, y: 60  },
        ],
        doubleCoinSpawns:  [{ x: 280, y: 143 }, { x: 490, y: 60 }],
        tripleCoinSpawns:  [{ x: 370, y: 46 }],
        rainbowCoinSpawns: [{ x: 600, y: 60 }],
        lightningCoinSpawns: [{ x: 140, y: 60 }],
        warpCoinSpawns:    [{ x: 690, y: 60 }, { x: 220, y: 60 }],
        starSpawns:        [{ x: 130, y: 60 }, { x: 580, y: 60 }],
        shieldSpawns:      [{ x: 0,   y: 444 }, { x: 720, y: 444 }],
        bombSpawns:        [{ x: 265, y: 143 }, { x: 480, y: 152 }],
        springSpawns:      [{ x: 0,   y: 444 }, { x: 720, y: 444 }],
        speedBoostSpawns:  [{ x: 380, y: 46 }],
        magnetSpawns:      [{ x: 440, y: 46 }],
        freezeSpawns:      [{ x: 100, y: 156 }, { x: 665, y: 156 }],
        ghostSpawns:       [{ x: 290, y: 143 }],
        electroSpawns:     [{ x: 410, y: 46 }],
        slowMoSpawns:      [{ x: 510, y: 46 }],
        rocketSpawns:      [{ x: 180, y: 46 }, { x: 570, y: 60 }],
        scoreBoostSpawns:  [{ x: 330, y: 46 }],
        jetpackSpawns:     [{ x: 450, y: 46 }],
        bubbleSpawns:      [{ x: 350, y: 68 }],
        spikeBootsSpawns:  [{ x: 460, y: 46 }],
        healSpawns:        [{ x: 105, y: 60 }],
        spikeSpawns:       [{ x: 310, y: 444, count: 3 }, { x: 510, y: 444, count: 2 }],
        checkpointSpawns:  [{ x: 395, y: 450 }],
    },

    // === LEVEL 24: УТОПИЯ (Feature 170) — bright sky arena with vortex coins, all enemy types ===
    {
        name: 'Утопия',
        platforms: [
            // Ground sections (gaps in the middle for challenge)
            { x: 0,   y: 460, w: 140, h: 40 },
            { x: 220, y: 460, w: 100, h: 40 },
            { x: 420, y: 460, w: 100, h: 40 },
            { x: 620, y: 460, w: 180, h: 40 },
            // Low platforms
            { x: 60,  y: 372, w: 110, h: 16 },
            { x: 260, y: 360, w: 90,  h: 16, moveAxis: 'x', moveRange: 70, moveSpeed: 1.1 },
            { x: 460, y: 368, w: 90,  h: 16, crumble: true },
            { x: 630, y: 362, w: 100, h: 16, ice: true },
            // Mid platforms
            { x: 10,  y: 272, w: 120, h: 16, pulse: true },
            { x: 220, y: 260, w: 90,  h: 16, moveAxis: 'y', moveRange: 50, moveSpeed: 1.0 },
            { x: 410, y: 268, w: 90,  h: 16, crumble: true },
            { x: 600, y: 262, w: 110, h: 16 },
            // Upper platforms
            { x: 50,  y: 175, w: 110, h: 16, ice: true },
            { x: 255, y: 162, w: 100, h: 16, moveAxis: 'x', moveRange: 90, moveSpeed: 1.3 },
            { x: 455, y: 172, w: 100, h: 16, pulse: true },
            { x: 650, y: 176, w: 90,  h: 16, crumble: true },
            // Top platforms
            { x: 90,  y: 78,  w: 150, h: 16 },
            { x: 330, y: 64,  w: 130, h: 16 },
            { x: 560, y: 78,  w: 110, h: 16 },
        ],
        marioSpawns: [
            { x: 10,  y: 430 }, { x: 225, y: 430 },
            { x: 425, y: 430 }, { x: 640, y: 430 },
            { x: 280, y: 338 }, { x: 640, y: 340 },
            { x: 20,  y: 250 }, { x: 610, y: 240 },
        ],
        marioTypes: ['fast', 'armored', 'berserker', 'fast', 'ghost_mario', 'teleporter', 'berserker', 'armored'],
        shooterMarioSpawns: [{ x: 100, y: 155 }, { x: 470, y: 152 }],
        flyingMarioSpawns:  [{ x: 160, y: 95  }, { x: 520, y: 82  }],
        parachuteMarioSpawns: [{ x: 250, y: -50 }, { x: 600, y: -65 }],
        marioSpeed: 3.2,
        playerSpawn: { x: 10, y: 430 },
        vortexCoinSpawns: [{ x: 360, y: 42 }, { x: 120, y: 58 }],
        coinSpawns: [
            { x: 20,  y: 440 }, { x: 230, y: 440 }, { x: 430, y: 440 }, { x: 650, y: 440 },
            { x: 80,  y: 350 }, { x: 300, y: 338 }, { x: 500, y: 346 }, { x: 660, y: 340 },
            { x: 30,  y: 250 }, { x: 240, y: 238 }, { x: 440, y: 246 }, { x: 625, y: 240 },
            { x: 80,  y: 153 }, { x: 295, y: 140 }, { x: 495, y: 150 }, { x: 680, y: 154 },
            { x: 130, y: 56  }, { x: 375, y: 42  }, { x: 610, y: 56  },
        ],
        doubleCoinSpawns:    [{ x: 350, y: 42  }, { x: 510, y: 56  }],
        tripleCoinSpawns:    [{ x: 570, y: 56  }],
        rainbowCoinSpawns:   [{ x: 630, y: 56  }],
        lightningCoinSpawns: [{ x: 150, y: 56  }],
        explodingCoinSpawns: [{ x: 200, y: 56  }],
        warpCoinSpawns:      [{ x: 690, y: 56  }, { x: 240, y: 56  }],
        starSpawns:          [{ x: 140, y: 56  }, { x: 590, y: 56  }],
        shieldSpawns:        [{ x: 0,   y: 444 }, { x: 730, y: 444 }],
        bombSpawns:          [{ x: 270, y: 140 }, { x: 490, y: 150 }],
        springSpawns:        [{ x: 0,   y: 444 }, { x: 730, y: 444 }],
        speedBoostSpawns:    [{ x: 380, y: 42  }],
        magnetSpawns:        [{ x: 440, y: 42  }],
        freezeSpawns:        [{ x: 110, y: 155 }, { x: 670, y: 154 }],
        ghostSpawns:         [{ x: 295, y: 140 }],
        electroSpawns:       [{ x: 420, y: 42  }],
        slowMoSpawns:        [{ x: 500, y: 42  }],
        rocketSpawns:        [{ x: 175, y: 42  }, { x: 570, y: 56  }],
        scoreBoostSpawns:    [{ x: 330, y: 42  }],
        jetpackSpawns:       [{ x: 455, y: 42  }],
        bubbleSpawns:        [{ x: 345, y: 64  }],
        spikeBootsSpawns:    [{ x: 465, y: 42  }],
        healSpawns:          [{ x: 110, y: 58  }],
        spikeSpawns:         [{ x: 320, y: 444, count: 2 }, { x: 520, y: 444, count: 3 }],
        barrelSpawns: [
            { x: 55,  y: 424 }, { x: 465, y: 424 }, { x: 665, y: 424 },
            { x: 80,  y: 340 }, { x: 650, y: 340 },
            { x: 120, y: 139 }, { x: 475, y: 136 },
        ],
        checkpointSpawns: [{ x: 400, y: 450 }],
    },
    // === LEVEL 25: РАССВЕТ (Feature 172) — dawn sky arena, all enemies/platforms, reflect shields ===
    {
        name: 'Рассвет',
        isDawn: true,
        platforms: [
            // Ground sections with gaps
            { x: 0,   y: 460, w: 160, h: 40 },
            { x: 240, y: 460, w: 110, h: 40 },
            { x: 440, y: 460, w: 110, h: 40 },
            { x: 640, y: 460, w: 160, h: 40 },
            // Low tier
            { x: 70,  y: 375, w: 120, h: 16 },
            { x: 285, y: 362, w: 95,  h: 16, moveAxis: 'x', moveRange: 80, moveSpeed: 1.2 },
            { x: 470, y: 370, w: 95,  h: 16, crumble: true },
            { x: 640, y: 365, w: 105, h: 16, ice: true },
            // Mid tier
            { x: 15,  y: 275, w: 125, h: 16, pulse: true },
            { x: 225, y: 262, w: 95,  h: 16, moveAxis: 'y', moveRange: 55, moveSpeed: 1.1 },
            { x: 415, y: 270, w: 95,  h: 16, crumble: true },
            { x: 605, y: 265, w: 115, h: 16 },
            // Upper tier
            { x: 55,  y: 178, w: 115, h: 16, ice: true },
            { x: 260, y: 165, w: 105, h: 16, moveAxis: 'x', moveRange: 95, moveSpeed: 1.4 },
            { x: 460, y: 175, w: 105, h: 16, pulse: true },
            { x: 655, y: 180, w: 95,  h: 16, crumble: true },
            // Top tier
            { x: 100, y: 80,  w: 150, h: 16 },
            { x: 330, y: 66,  w: 140, h: 16 },
            { x: 565, y: 80,  w: 115, h: 16 },
        ],
        marioSpawns: [
            { x: 15,  y: 432 }, { x: 250, y: 432 },
            { x: 450, y: 432 }, { x: 655, y: 432 },
            { x: 300, y: 340 }, { x: 650, y: 343 },
            { x: 25,  y: 253 }, { x: 615, y: 243 },
        ],
        marioTypes: ['fast', 'armored', 'berserker', 'fast', 'ghost_mario', 'teleporter', 'berserker', 'armored'],
        shooterMarioSpawns: [{ x: 110, y: 158 }, { x: 480, y: 155 }],
        flyingMarioSpawns:  [{ x: 180, y: 98  }, { x: 540, y: 88  }],
        parachuteMarioSpawns: [{ x: 260, y: -55 }, { x: 610, y: -70 }],
        marioSpeed: 3.3,
        playerSpawn: { x: 15, y: 432 },
        reflectSpawns:       [{ x: 370, y: 44 }, { x: 130, y: 62 }],
        coinSpawns: [
            { x: 25,  y: 442 }, { x: 255, y: 442 }, { x: 455, y: 442 }, { x: 660, y: 442 },
            { x: 90,  y: 353 }, { x: 315, y: 340 }, { x: 510, y: 348 }, { x: 670, y: 343 },
            { x: 35,  y: 253 }, { x: 250, y: 240 }, { x: 445, y: 248 }, { x: 630, y: 243 },
            { x: 85,  y: 156 }, { x: 295, y: 143 }, { x: 495, y: 153 }, { x: 685, y: 158 },
            { x: 140, y: 58  }, { x: 380, y: 44  }, { x: 620, y: 58  },
        ],
        doubleCoinSpawns:    [{ x: 360, y: 44  }, { x: 525, y: 58  }],
        tripleCoinSpawns:    [{ x: 580, y: 58  }],
        rainbowCoinSpawns:   [{ x: 645, y: 58  }],
        lightningCoinSpawns: [{ x: 160, y: 58  }],
        explodingCoinSpawns: [{ x: 210, y: 58  }],
        warpCoinSpawns:      [{ x: 700, y: 58  }, { x: 250, y: 58  }],
        vortexCoinSpawns:    [{ x: 370, y: 44  }, { x: 130, y: 62  }],
        starSpawns:          [{ x: 150, y: 58  }, { x: 600, y: 58  }],
        shieldSpawns:        [{ x: 5,   y: 444 }, { x: 745, y: 444 }],
        bombSpawns:          [{ x: 280, y: 143 }, { x: 500, y: 153 }],
        springSpawns:        [{ x: 5,   y: 444 }, { x: 745, y: 444 }],
        speedBoostSpawns:    [{ x: 390, y: 44  }],
        magnetSpawns:        [{ x: 450, y: 44  }],
        freezeSpawns:        [{ x: 120, y: 158 }, { x: 680, y: 156 }],
        ghostSpawns:         [{ x: 305, y: 143 }],
        electroSpawns:       [{ x: 430, y: 44  }],
        slowMoSpawns:        [{ x: 510, y: 44  }],
        rocketSpawns:        [{ x: 185, y: 44  }, { x: 580, y: 58  }],
        scoreBoostSpawns:    [{ x: 340, y: 44  }],
        jetpackSpawns:       [{ x: 465, y: 44  }],
        bubbleSpawns:        [{ x: 355, y: 66  }],
        spikeBootsSpawns:    [{ x: 475, y: 44  }],
        healSpawns:          [{ x: 120, y: 62  }],
        spikeSpawns:         [{ x: 330, y: 444, count: 2 }, { x: 530, y: 444, count: 3 }],
        barrelSpawns: [
            { x: 60,  y: 424 }, { x: 470, y: 424 }, { x: 670, y: 424 },
            { x: 90,  y: 340 }, { x: 660, y: 340 },
            { x: 130, y: 142 }, { x: 485, y: 138 },
        ],
        checkpointSpawns: [{ x: 410, y: 450 }],
    },
    // === LEVEL 26: ПЕЩЕРА (Feature 174) — dark underground cave with lava at the bottom ===
    {
        name: 'Пещера',
        isCave: true,
        platforms: [
            // Ground (fragmented cave floor with lava gaps)
            { x: 0,   y: 460, w: 140, h: 40 },
            { x: 220, y: 460, w: 120, h: 40 },
            { x: 430, y: 460, w: 120, h: 40 },
            { x: 650, y: 460, w: 150, h: 40 },
            // Low tier — stone ledges
            { x: 55,  y: 380, w: 110, h: 16 },
            { x: 265, y: 368, w: 90,  h: 16, crumble: true },
            { x: 455, y: 375, w: 90,  h: 16, ice: true },
            { x: 640, y: 370, w: 100, h: 16 },
            // Mid tier
            { x: 10,  y: 280, w: 120, h: 16, moveAxis: 'x', moveRange: 75, moveSpeed: 1.3 },
            { x: 230, y: 268, w: 100, h: 16, crumble: true },
            { x: 430, y: 275, w: 95,  h: 16, pulse: true },
            { x: 620, y: 270, w: 110, h: 16, ice: true },
            // Upper tier
            { x: 60,  y: 185, w: 115, h: 16, crumble: true },
            { x: 270, y: 172, w: 100, h: 16, moveAxis: 'y', moveRange: 45, moveSpeed: 1.1 },
            { x: 455, y: 180, w: 95,  h: 16 },
            { x: 645, y: 178, w: 100, h: 16, pulse: true },
            // Top tier
            { x: 100, y: 90,  w: 140, h: 16 },
            { x: 330, y: 76,  w: 140, h: 16 },
            { x: 560, y: 88,  w: 110, h: 16 },
        ],
        marioSpawns: [
            { x: 10,  y: 432 }, { x: 230, y: 432 },
            { x: 440, y: 432 }, { x: 660, y: 432 },
            { x: 280, y: 346 }, { x: 650, y: 348 },
            { x: 20,  y: 258 }, { x: 630, y: 248 },
            { x: 280, y: 150 }, { x: 466, y: 158 },
        ],
        marioTypes: ['fast', 'armored', 'berserker', 'fast', 'ghost_mario', 'teleporter', 'berserker', 'armored', 'fast', 'berserker'],
        shooterMarioSpawns: [{ x: 115, y: 168 }, { x: 470, y: 160 }, { x: 665, y: 156 }],
        flyingMarioSpawns:  [{ x: 220, y: 100 }, { x: 500, y: 96 }],
        parachuteMarioSpawns: [{ x: 140, y: -60 }, { x: 400, y: -70 }, { x: 630, y: -55 }],
        marioSpeed: 3.4,
        playerSpawn: { x: 15, y: 432 },
        quakeSpawns: [{ x: 350, y: 54 }, { x: 140, y: 68 }],
        coinSpawns: [
            { x: 20,  y: 442 }, { x: 235, y: 442 }, { x: 445, y: 442 }, { x: 665, y: 442 },
            { x: 80,  y: 358 }, { x: 295, y: 346 }, { x: 490, y: 353 }, { x: 665, y: 348 },
            { x: 40,  y: 258 }, { x: 260, y: 246 }, { x: 460, y: 253 }, { x: 645, y: 248 },
            { x: 95,  y: 163 }, { x: 305, y: 150 }, { x: 490, y: 158 }, { x: 680, y: 156 },
            { x: 150, y: 68  }, { x: 390, y: 54  }, { x: 615, y: 66  },
        ],
        doubleCoinSpawns:    [{ x: 380, y: 54  }, { x: 540, y: 66  }],
        tripleCoinSpawns:    [{ x: 590, y: 66  }],
        rainbowCoinSpawns:   [{ x: 650, y: 66  }],
        lightningCoinSpawns: [{ x: 170, y: 68  }],
        explodingCoinSpawns: [{ x: 225, y: 54  }],
        warpCoinSpawns:      [{ x: 710, y: 66  }, { x: 260, y: 54  }],
        vortexCoinSpawns:    [{ x: 380, y: 54  }, { x: 140, y: 68  }],
        starSpawns:          [{ x: 160, y: 68  }, { x: 610, y: 66  }],
        shieldSpawns:        [{ x: 5,   y: 444 }, { x: 745, y: 444 }],
        bombSpawns:          [{ x: 290, y: 150 }, { x: 510, y: 158 }],
        springSpawns:        [{ x: 5,   y: 444 }, { x: 745, y: 444 }],
        speedBoostSpawns:    [{ x: 400, y: 54  }],
        magnetSpawns:        [{ x: 460, y: 54  }],
        freezeSpawns:        [{ x: 130, y: 168 }, { x: 690, y: 160 }],
        ghostSpawns:         [{ x: 315, y: 150 }],
        electroSpawns:       [{ x: 440, y: 54  }],
        slowMoSpawns:        [{ x: 520, y: 54  }],
        rocketSpawns:        [{ x: 195, y: 54  }, { x: 590, y: 66  }],
        scoreBoostSpawns:    [{ x: 350, y: 54  }],
        jetpackSpawns:       [{ x: 475, y: 54  }],
        bubbleSpawns:        [{ x: 365, y: 76  }],
        spikeBootsSpawns:    [{ x: 485, y: 54  }],
        healSpawns:          [{ x: 130, y: 72  }],
        reflectSpawns:       [{ x: 380, y: 54  }, { x: 140, y: 72  }],
        spikeSpawns:         [{ x: 340, y: 444, count: 3 }, { x: 545, y: 444, count: 3 }],
        barrelSpawns: [
            { x: 65,  y: 424 }, { x: 480, y: 424 }, { x: 680, y: 424 },
            { x: 100, y: 348 }, { x: 660, y: 348 },
            { x: 140, y: 152 }, { x: 500, y: 148 },
        ],
        checkpointSpawns: [{ x: 415, y: 450 }],
    },
];

// === FEATURE 77: DROPPED POWERUP (enemy loot drops) ===
const DROP_TYPE_CONFIG = {
    star:    { color: '#ffdd00', glow: 'rgba(255,220,0,0.35)',  icon: '⭐' },
    shield:  { color: '#4488ff', glow: 'rgba(60,120,255,0.3)', icon: '🛡' },
    speed:   { color: '#ff8800', glow: 'rgba(255,140,0,0.3)',  icon: '💨' },
    freeze:  { color: '#88ddff', glow: 'rgba(100,200,255,0.3)',icon: '❄' },
    slowmo:  { color: '#00ccff', glow: 'rgba(0,180,255,0.3)',  icon: '⏱' },
};
const DROP_TYPES = Object.keys(DROP_TYPE_CONFIG);
const DROPPED_POWERUP_LIFE = 480; // 8 seconds

class DroppedPowerup {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 18;
        this.h = 18;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = -6 - Math.random() * 3;
        this.type = DROP_TYPES[Math.floor(Math.random() * DROP_TYPES.length)];
        this.grounded = false;
        this.life = DROPPED_POWERUP_LIFE;
        this.animTimer = 0;
        this.collected = false;
    }

    update() {
        if (this.collected) return false;
        this.life--;
        if (this.life <= 0) return false;
        this.animTimer++;

        if (!this.grounded) {
            this.vy += GRAVITY * levelGravityMult;
            if (this.vy > MAX_FALL) this.vy = MAX_FALL;
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.9;

            // Land on platforms
            for (const p of platforms) {
                if (p.crumble && (p.crumbleState === 'falling' || p.crumbleState === 'respawning')) continue;
                if (this.x + this.w > p.x && this.x < p.x + p.w &&
                    this.y + this.h >= p.y && this.y + this.h <= p.y + 16 && this.vy >= 0) {
                    this.y = p.y - this.h;
                    this.vy = 0;
                    this.vx = 0;
                    this.grounded = true;
                    break;
                }
            }
            // Land at screen bottom
            if (this.y + this.h >= H - 38) {
                this.y = H - 38 - this.h;
                this.vy = 0;
                this.vx = 0;
                this.grounded = true;
            }
            // Keep in bounds
            if (this.x < 0) this.x = 0;
            if (this.x + this.w > W) this.x = W - this.w;
        }
        return true;
    }

    render() {
        const blinking = this.life < 120;
        if (blinking && Math.floor(this.animTimer * 0.15) % 2 === 0) return;
        const cfg = DROP_TYPE_CONFIG[this.type];
        const bob = this.grounded ? Math.sin(this.animTimer * 0.09) * 2 : 0;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const pulse = 0.85 + Math.sin(this.animTimer * 0.14) * 0.15;

        ctx.save();
        // Glow
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = cfg.glow;
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = cfg.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Icon
        ctx.font = `bold ${Math.round(9 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(cfg.icon, cx, cy + 3);
        ctx.restore();
    }
}

let droppedPowerups = [];

function checkDroppedPowerupCollisions() {
    for (const dp of droppedPowerups) {
        if (dp.collected) continue;
        if (!aabb(player, dp)) continue;
        dp.collected = true;
        switch (dp.type) {
            case 'star':
                player.starTimer = Math.min((player.starTimer || 0) + 180, STAR_DURATION);
                particles.push(new Particle(dp.x - 10, dp.y - 14, '⭐ ЗВЕЗДА!', '#ffdd00'));
                playSound('star');
                break;
            case 'shield':
                player.hasShield = true;
                particles.push(new Particle(dp.x - 10, dp.y - 14, '🛡 ЩИТ!', '#4488ff'));
                playSound('shield');
                break;
            case 'speed':
                player.speedBoostTimer = Math.min((player.speedBoostTimer || 0) + 180, SPEED_BOOST_DURATION);
                particles.push(new Particle(dp.x - 10, dp.y - 14, '💨 СКОРОСТЬ!', '#ff8800'));
                playSound('speedboost');
                break;
            case 'freeze':
                player.freezeTimer = FREEZE_DURATION;
                for (const m of marios) { if (m.isAlive) m.frozenTimer = FREEZE_DURATION; }
                particles.push(new Particle(dp.x - 10, dp.y - 14, '❄ ЗАМОРОЗКА!', '#88ddff'));
                playSound('freeze');
                break;
            case 'slowmo':
                player.slowMoTimer = SLOW_MO_DURATION;
                particles.push(new Particle(dp.x - 10, dp.y - 14, '⏱ ЗАМЕДЛЕНИЕ!', '#00ccff'));
                playSound('freeze');
                break;
        }
    }
    droppedPowerups = droppedPowerups.filter(dp => !dp.collected);
}

// === FEATURE 56: VICTORY CONFETTI ===
let confettiParticles = [];
const CONFETTI_COLORS = ['#ff3333', '#ffcc00', '#33ff66', '#3399ff', '#cc33ff', '#ff9900', '#ffffff'];

class ConfettiParticle {
    constructor() {
        this.x = Math.random() * W;
        this.y = -10 - Math.random() * 60;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = 1.5 + Math.random() * 2.5;
        this.color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
        this.w = 6 + Math.random() * 6;
        this.h = 4 + Math.random() * 4;
        this.rot = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.18;
        this.life = 260 + Math.floor(Math.random() * 120);
        this.maxLife = this.life;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx += (Math.random() - 0.5) * 0.1; // slight wind wobble
        this.rot += this.rotSpeed;
        this.life--;
        return this.life > 0 && this.y < H + 20;
    }

    render() {
        const alpha = Math.min(1, this.life / 30);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
    }
}

function spawnConfetti() {
    confettiParticles = [];
    for (let i = 0; i < 90; i++) {
        confettiParticles.push(new ConfettiParticle());
    }
}

// === GAME STATE ===
let gameState = 'MENU';
let currentLevel = 0;
let player = null;
let marios = [];
let platforms = [];
let bossMarco = null;
let isBossLevel = false;
let particles = [];
let shakeTimer = 0;
let shakeIntensity = 0;
let deathFlashTimer = 0; // red screen flash on player death
let levelClearFlash = 0; // Feature 136: white flash on level complete
let bulletTimeTimer = 0; // Feature 139: frames of slow-motion after player death
const BULLET_TIME_DURATION = 120; // 2 seconds
let afterimages = []; // Feature 53: speed boost afterimage trail
let levelTotalMarios = 0; // total enemies spawned at level start
let comboCount = 0;
let comboDisplayTimer = 0;
// Feature 73: Coin Frenzy
let coinFrenzyTimer = 0;        // frames remaining (300 = 5 sec)
const COIN_FRENZY_DURATION = 300;
let coinFrenzyActivated = false; // flag to show activation text once

// Feature 76: Score Milestone Banners
const SCORE_MILESTONES = [1000, 5000, 10000, 25000];
const MILESTONE_TEXTS  = ['ХОРОШО!', 'ОТЛИЧНО!', 'НЕВЕРОЯТНО!', 'ЛЕГЕНДА!'];
const MILESTONE_COLORS = ['#44ff88', '#ffdd00', '#ff8800', '#dd44ff'];
let nextMilestoneIdx = 0;
let milestoneBannerTimer = 0;   // frames remaining (180 = 3 sec)
let milestoneBannerText  = '';
let milestoneBannerColor = '#ffffff';

// === FEATURE 141: WIND GUSTS ===
let windForce = 0;          // current horizontal wind push (negative = left, positive = right)
let windTarget = 0;         // target wind force we're easing towards
let windChangeTimer = 0;    // frames until next wind change
let windActive = false;     // whether current level has wind
let windStreaks = [];        // visual wind streak particles
let lightningFlashTimer = 0;// frames of lightning flash overlay
let lightningNextTimer = 0; // frames until next lightning strike
let isStormLevel = false;   // whether current level is storm theme

function updateWind() {
    if (!windActive) return;
    // Ease current wind toward target
    windForce += (windTarget - windForce) * 0.03;
    if (Math.abs(windForce) < 0.01) windForce = 0;
    // Periodically change wind target
    windChangeTimer--;
    if (windChangeTimer <= 0) {
        const gustMag = 0.8 + Math.random() * 1.4;
        windTarget = (Math.random() < 0.5 ? -1 : 1) * gustMag;
        windChangeTimer = 120 + Math.floor(Math.random() * 200);
    }
    // Spawn wind streaks when wind is strong
    if (Math.abs(windForce) > 0.4 && Math.random() < 0.25) {
        windStreaks.push({
            x: windForce > 0 ? -30 : W + 30,
            y: 20 + Math.random() * (H - 80),
            len: 30 + Math.random() * 60,
            speed: (2.5 + Math.random() * 3) * (windForce > 0 ? 1 : -1),
            alpha: 0.12 + Math.random() * 0.2,
            life: 25 + Math.floor(Math.random() * 20),
        });
    }
    windStreaks = windStreaks.filter(s => {
        s.x += s.speed * 3;
        s.life--;
        return s.life > 0 && s.x > -80 && s.x < W + 80;
    });
    // Lightning logic on storm levels
    if (isStormLevel) {
        lightningNextTimer--;
        if (lightningNextTimer <= 0) {
            lightningFlashTimer = 4 + Math.floor(Math.random() * 4);
            lightningNextTimer = 180 + Math.floor(Math.random() * 360);
        }
        if (lightningFlashTimer > 0) lightningFlashTimer--;
    }
}

function renderWindEffect() {
    if (!windActive || windStreaks.length === 0) return;
    ctx.save();
    for (const s of windStreaks) {
        ctx.globalAlpha = s.alpha * (s.life / 40);
        ctx.strokeStyle = '#cce8ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.len * Math.sign(s.speed), s.y + (Math.random() - 0.5) * 4);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Lightning flash overlay
    if (lightningFlashTimer > 0) {
        const alpha = (lightningFlashTimer / 8) * 0.35;
        ctx.fillStyle = `rgba(220,230,255,${alpha})`;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
}

let levelTimer = 0;       // frames elapsed in current level
const TIME_BONUS_MAX = 3000; // max bonus at 0 seconds
const TIME_PER_FRAME = 1 / 60;
let enterWasPressed = false;
let escapeWasPressed = false;
let leftWasPressed = false;
let rightWasPressed = false;
let totalScore = 0;
let highScore = parseInt(localStorage.getItem('mushroomHighScore') || '0');
let scoreMilestoneReached = 0; // Feature 153: last milestone crossed
let hudScoreDisplay = 0; // animated score counter
let unlockedLevels = parseInt(localStorage.getItem('mushroomUnlockedLevels') || '1');
let selectedLevelIdx = 0;
let soundMuted = false;
let difficulty = localStorage.getItem('mushroomDifficulty') || 'normal';

// === FEATURE 81: MIRROR MODE ===
let mirrorMode = localStorage.getItem('mushroomMirrorMode') === 'true';

// === FEATURE 97: COLORBLIND MODE ===
let colorblindMode = localStorage.getItem('mushroomColorblind') === 'true';
function applyColorblindMode() {
    if (colorblindMode) {
        canvas.classList.add('colorblind');
    } else {
        canvas.classList.remove('colorblind');
    }
}
applyColorblindMode();

// === FEATURE 129: DAILY STREAK ===
let dailyStreak = parseInt(localStorage.getItem('mushroomDailyStreak') || '0');
let dailyStreakLastDate = localStorage.getItem('mushroomDailyStreakDate') || '';
let dailyStreakBonusCoins = 0;
(function initDailyStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dailyStreakLastDate === today) {
        // already counted today
    } else if (dailyStreakLastDate === yesterday) {
        dailyStreak++;
    } else {
        dailyStreak = 1;
    }
    dailyStreakLastDate = today;
    localStorage.setItem('mushroomDailyStreak', String(dailyStreak));
    localStorage.setItem('mushroomDailyStreakDate', today);
    dailyStreakBonusCoins = dailyStreak >= 7 ? 10 : dailyStreak >= 3 ? 3 : 0;
})();

// === FEATURE 82: COIN CAVE MODE ===
let coinCaveMode = false;
let coinCaveCountdown = 0;       // frames remaining (starts at 30*60)
let coinCaveBestCoins = parseInt(localStorage.getItem('mushroomCoinCaveBest') || '0');
const COIN_CAVE_DURATION = 30 * 60; // 30 seconds in frames
const COIN_CAVE_LEVEL_INDEX = 12;   // bonus level 13 is index 12

// === FEATURE 86: DAILY CHALLENGE ===
let dailyChallengeMode = false;
let dailyChallengeLevelIdx = 0;
let dailyChallengeModifiers = [];       // e.g. ['mirror', 'fast_enemies', 'no_shield']
let dailyChallengeDate = '';            // 'YYYY-MM-DD' of the current challenge
let dailyChallengeBest = parseInt(localStorage.getItem('mushroomDailyBest') || '0');
let dailyChallengeBestDate = localStorage.getItem('mushroomDailyBestDate') || '';

function getDailyChallenge() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    const seed = now.getFullYear() * 10000 + (now.getMonth()+1) * 100 + now.getDate();
    // Simple LCG seeded RNG
    let s = seed;
    const rng = () => { s = (s * 1664525 + 1013904223) & 0xFFFFFFFF; return (s >>> 0) / 0x100000000; };
    const lvlIdx = Math.floor(rng() * 12); // levels 0-11 (skip bonus)
    const modPool = ['mirror', 'fast_enemies', 'no_shield', 'no_star', 'x2_score'];
    const modCount = 1 + Math.floor(rng() * 3);
    const mods = [];
    while (mods.length < modCount) {
        const m = modPool[Math.floor(rng() * modPool.length)];
        if (!mods.includes(m)) mods.push(m);
    }
    return { dateStr, lvlIdx, mods };
}

const MOD_LABELS = {
    mirror:       '🪞 Зеркальный режим',
    fast_enemies: '⚡ Враги ×1.6',
    no_shield:    '🛡✗ Нет щитов',
    no_star:      '⭐✗ Нет звёзд',
    x2_score:     '✨ Очки ×2',
};

// === FEATURE 83: KILL STREAK ===
let killStreakCount = 0;
let killStreakTimer = 0;          // frames since last kill
const KILL_STREAK_WINDOW = 180;  // 3 seconds to continue streak

// === FEATURE 68: SURVIVAL MODE ===
let survivalMode = false;
let survivalTimer = 0;          // frames survived
let survivalWaveTimer = 0;      // frames until next wave
let survivalWave = 0;           // current wave number
const SURVIVAL_WAVE_INTERVAL = 480; // 8 seconds per wave
let survivalBestTime = parseInt(localStorage.getItem('mushroomSurvivalBest') || '0');

const SURVIVAL_ARENA = {
    platforms: [
        { x: 0, y: 460, w: 800, h: 40 },
        { x: 100, y: 360, w: 160, h: 20 },
        { x: 330, y: 315, w: 140, h: 20 },
        { x: 540, y: 360, w: 160, h: 20 },
        { x: 200, y: 235, w: 130, h: 20, crumble: true },
        { x: 470, y: 235, w: 130, h: 20, crumble: true },
        { x: 335, y: 145, w: 130, h: 20, ice: true },
    ],
    playerSpawn: { x: 380, y: 420 },
    coinSpawns: [
        { x: 150, y: 435 }, { x: 400, y: 435 }, { x: 650, y: 435 },
        { x: 175, y: 335 }, { x: 380, y: 290 }, { x: 625, y: 335 },
    ],
    doubleCoinSpawns: [{ x: 395, y: 120 }],
    marioSpawns: [{ x: 200, y: 420 }, { x: 560, y: 420 }],
    marioSpeed: 2.2,
    starSpawns: [{ x: 350, y: 290 }],
    bombSpawns: [{ x: 560, y: 295 }],
    shieldSpawns: [{ x: 100, y: 315 }],
};

function startSurvivalMode() {
    survivalMode = true;
    survivalTimer = 0;
    survivalWave = 0;
    survivalWaveTimer = SURVIVAL_WAVE_INTERVAL;
    const lvl = SURVIVAL_ARENA;
    platforms = lvl.platforms.map(p => new Platform(p.x, p.y, p.w, p.h, null, 0, 0, p.crumble, p.ice, p.conveyor, p.pulse));
    const diffMult = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.3 : difficulty === 'hardcore' ? 1.6 : 1;
    marios = lvl.marioSpawns.map((s, i) => new Mario(s.x, s.y, lvl.marioSpeed * diffMult, 'normal'));
    fireballs = [];
    const sp = lvl.playerSpawn;
    player = new Player(sp.x, sp.y);
    player.lives = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : difficulty === 'hardcore' ? 1 : 3;
    particles = [];
    comboCount = 0;
    comboDisplayTimer = 0;
    levelTimer = 0;
    hudScoreDisplay = 0;
    levelTotalMarios = marios.length;
    levelDeathCount = 0;
    levelCoinsCollected = 0;
    levelCoinsTotal = (lvl.coinSpawns || []).length + (lvl.doubleCoinSpawns || []).length;
    coins = [...(lvl.coinSpawns || []).map(c => new Coin(c.x, c.y)), ...(lvl.doubleCoinSpawns || []).map(c => new Coin(c.x, c.y, 100))];
    stars = (lvl.starSpawns || []).map(s => new Star(s.x, s.y));
    shields = (lvl.shieldSpawns || []).map(s => new Shield(s.x, s.y));
    bombs = (lvl.bombSpawns || []).map(b => new Bomb(b.x, b.y));
    springPads = []; speedBoosts = []; magnets = []; freezes = []; ghosts = []; scoreBoosts = []; electricos = []; slowMos = []; rockets = []; magBootsList = []; giantPUs = []; giftChests = [];
    explodingCoins = []; dronePowerUps = []; // Feature 161/162
    spikeBoots = []; // Feature 163
    warpCoins = []; // Feature 165
    portalPairs = []; checkpoints = [];
    isBossLevel = false; bossMarco = null;
    initWeather(4); initBirds(); shootingStars = [];
    if (audioCtx && !soundMuted) startBGM(getBGMThemeForLevel(4));
    gameState = 'PLAYING';
}

// === FEATURE 69: RAGE MODE ===
let rageModeActive = false;
let rageModeWarningTimer = 0; // frames to show "ЯРОСТЬ!" warning

// === FEATURE 151: LAST ENEMY BANNER ===
let lastEnemyBannerTimer = 0; // Feature 151

// === LEVEL BEST TIMES ===
let levelBestTimes = [];
try { levelBestTimes = JSON.parse(localStorage.getItem('mushroomLevelTimes') || '[]'); } catch { levelBestTimes = []; }
let levelCompletionTime = 0;   // seconds spent on last completed level
let isNewLevelTimeRecord = false;

// === FEATURE 115: ENDLESS MODE ===
let endlessMode = false;
let endlessCycle = 0;           // how many times all levels have been cleared
let endlessBestScore = parseInt(localStorage.getItem('mushroomEndlessBest') || '0');

// === FEATURE 127: MARATHON MODE ===
let marathonMode = false;
const MARATHON_LEVELS = [0, 2, 4, 6, 8]; // play levels 1, 3, 5, 7, 9 back-to-back
let marathonLevelIdx = 0;
let marathonBestScore = parseInt(localStorage.getItem('mushroomMarathonBest') || '0');

// === FEATURE 128: NEW RECORD FLASH ===
let newRecordFlashTimer = 0;   // frames for on-screen "NEW RECORD" golden flash
let newRecordThisRun = false;  // whether the record was beaten in this run
let runStartHighScore = 0;     // highScore value at run start (for mid-run detection)

function startEndlessMode() {
    endlessMode = true;
    endlessCycle = 0;
    survivalMode = false;
    marathonMode = false;
    dailyChallengeMode = false;
    speedRunMode = false;
    resetRunStats();
    resetShop();
    currentLevel = 0;
    totalScore = 0;
    nextMilestoneIdx = 0;
    milestoneBannerTimer = 0;
    player = null;
    stars = [];
    loadLevel(currentLevel);
    player.lives = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : difficulty === 'hardcore' ? 1 : 3;
    player.score = 0;
    gameState = 'PLAYING';
}

function startMarathonMode() {
    marathonMode = true;
    marathonLevelIdx = 0;
    endlessMode = false;
    survivalMode = false;
    dailyChallengeMode = false;
    speedRunMode = false;
    resetRunStats();
    resetShop();
    currentLevel = MARATHON_LEVELS[0];
    totalScore = 0;
    nextMilestoneIdx = 0;
    milestoneBannerTimer = 0;
    player = null;
    stars = [];
    runStartHighScore = highScore;
    newRecordThisRun = false;
    newRecordFlashTimer = 0;
    loadLevel(currentLevel);
    player.lives = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : difficulty === 'hardcore' ? 1 : 3;
    player.score = 0;
    gameState = 'PLAYING';
}

// === FEATURE 96: SPEED RUN MODE ===
let speedRunMode = false;
let speedRunTotalTime = 0;     // accumulated total time across all levels in this run
let speedRunBestTotal = parseFloat(localStorage.getItem('mushroomSpeedRunBest') || '0');
let speedRunNewRecord = false; // flash on completion screen

// === FEATURE 59: LETTER GRADE ===
let levelGrades = [];
try { levelGrades = JSON.parse(localStorage.getItem('mushroomLevelGrades') || '[]'); } catch { levelGrades = []; }
let levelPerfectClears = []; // Feature 140: which levels have earned Perfect Clear
try { levelPerfectClears = JSON.parse(localStorage.getItem('mushroomPerfectClears') || '[]'); } catch { levelPerfectClears = []; }
let lastLevelWasPerfectClear = false; // Feature 140: flag for render
let levelDeathCount = 0;       // deaths during current level
let levelCoinsTotal = 0;       // total coins available at level start
let levelCoinsCollected = 0;   // coins collected this level
let currentLevelGrade = '';    // grade calculated on level completion

function calcLevelGrade(deaths, coinsCollected, coinsTotal, timeSecs) {
    if (deaths > 0) return 'D';
    const pct = coinsTotal > 0 ? coinsCollected / coinsTotal : 1;
    if (pct >= 1.0 && timeSecs < 25) return 'S';
    if (pct >= 0.75 && timeSecs < 50) return 'A';
    if (pct >= 0.50) return 'B';
    return 'C';
}

// === FEATURE 98: CHALLENGE CARDS ===
// One challenge per level (deterministic per level index)
const CHALLENGE_DEFS = [
    { id: 'coins100',   desc: 'Собери 100 очков монетами',   check: () => levelCoinsCollected >= 2 },
    { id: 'noDeathLvl', desc: 'Пройди без смертей',         check: () => levelDeathCount === 0 },
    { id: 'combo3',     desc: 'Убей 3 врагов комбо',        check: () => levelMaxCombo >= 3 },
    { id: 'fast30',     desc: 'Пройди за 30 секунд',        check: () => levelCompletionTime <= 30 },
    { id: 'allCoins',   desc: 'Собери все монеты',           check: () => levelCoinsTotal > 0 && levelCoinsCollected >= levelCoinsTotal },
    { id: 'combo5',     desc: 'Комбо ×5 или больше',        check: () => levelMaxCombo >= 5 },
    { id: 'fast20',     desc: 'Пройди за 20 секунд',        check: () => levelCompletionTime <= 20 },
    { id: 'noDeathFast',desc: 'Без смертей и за 40 сек',    check: () => levelDeathCount === 0 && levelCompletionTime <= 40 },
];
let challengeCompleted = {};
try { challengeCompleted = JSON.parse(localStorage.getItem('mushroomChallenges') || '{}'); } catch { challengeCompleted = {}; }
let currentChallengeIdx = 0;
let challengeCardTimer = 0;    // frames to show the card at level start (180 = 3 sec)
const CHALLENGE_CARD_DURATION = 180;
let challengeBonusAwarded = false; // flag so we only award once per level

let levelMaxCombo = 0; // best combo within the current level (for challenge cards)

function getChallengeForLevel(lvlIdx) {
    return CHALLENGE_DEFS[lvlIdx % CHALLENGE_DEFS.length];
}

// === MUSHROOM COLOR CUSTOMIZATION ===
const MUSHROOM_COLORS = [
    { name: 'Красный',   cap: '#e02020', capLight: '#ff4444' },
    { name: 'Синий',     cap: '#2060e0', capLight: '#4488ff' },
    { name: 'Зелёный',   cap: '#20a030', capLight: '#44cc55' },
    { name: 'Жёлтый',    cap: '#ccaa00', capLight: '#ffdd22' },
    { name: 'Фиолетовый',cap: '#9020c0', capLight: '#cc55ee' },
    // Feature 64: 3 new colors
    { name: 'Оранжевый', cap: '#d04010', capLight: '#ff7733' },
    { name: 'Розовый',   cap: '#cc2080', capLight: '#ff55bb' },
    { name: 'Чёрный',    cap: '#111111', capLight: '#444444' },
];
let mushroomColorIdx = parseInt(localStorage.getItem('mushroomColorIdx') || '0');
function getMushroomColors() { return MUSHROOM_COLORS[mushroomColorIdx % MUSHROOM_COLORS.length]; }

// === LEADERBOARD (top-3) ===
function loadLeaderboard() {
    try {
        return JSON.parse(localStorage.getItem('mushroomLeaderboard') || '[]');
    } catch { return []; }
}

function saveLeaderboard(board) {
    localStorage.setItem('mushroomLeaderboard', JSON.stringify(board));
}

function submitScore(score) {
    const board = loadLeaderboard();
    board.push({ score, date: new Date().toLocaleDateString('ru-RU') });
    board.sort((a, b) => b.score - a.score);
    const top3 = board.slice(0, 3);
    saveLeaderboard(top3);
    return top3;
}

// === SOUND (Web Audio API) ===
let audioCtx = null;
let masterGain = null; // Feature 112: master volume node

// Feature 112: volume control (0.0 - 1.0), persisted in localStorage
let soundVolume = parseFloat(localStorage.getItem('mushroomVolume') || '0.7');
function setSoundVolume(v) {
    soundVolume = Math.max(0, Math.min(1, v));
    localStorage.setItem('mushroomVolume', String(soundVolume.toFixed(2)));
    if (masterGain) masterGain.gain.value = soundMuted ? 0 : soundVolume;
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = soundVolume;
        masterGain.connect(audioCtx.destination);
    }
}

function playSound(type) {
    if (!audioCtx || soundMuted) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(masterGain || audioCtx.destination); // Feature 112: route through master gain
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
        case 'bomb':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(60, now + 0.15);
            osc.frequency.linearRampToValueAtTime(30, now + 0.4);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.2);
            gain.gain.linearRampToValueAtTime(0, now + 0.55);
            osc.start(now);
            osc.stop(now + 0.55);
            break;
        case 'spring':
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(900, now + 0.12);
            osc.frequency.linearRampToValueAtTime(600, now + 0.2);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
            break;
        case 'ghost': // Feature 54: ghost mode pickup
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.linearRampToValueAtTime(400, now + 0.1);
            osc.frequency.linearRampToValueAtTime(700, now + 0.2);
            osc.frequency.linearRampToValueAtTime(300, now + 0.35);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.2);
            gain.gain.linearRampToValueAtTime(0, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;
        case 'victory': // Feature 58: victory fanfare
            osc.type = 'square';
            osc.frequency.setValueAtTime(523, now);
            osc.frequency.setValueAtTime(659, now + 0.12);
            osc.frequency.setValueAtTime(784, now + 0.24);
            osc.frequency.setValueAtTime(1046, now + 0.36);
            osc.frequency.setValueAtTime(784, now + 0.52);
            osc.frequency.setValueAtTime(1046, now + 0.62);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.setValueAtTime(0.18, now + 0.6);
            gain.gain.linearRampToValueAtTime(0, now + 0.9);
            osc.start(now);
            osc.stop(now + 0.9);
            break;
        case 'dash': // Feature 65: dash whoosh
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.linearRampToValueAtTime(200, now + 0.12);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.13);
            osc.start(now);
            osc.stop(now + 0.13);
            break;
        case 'rage': // Feature 69: rage mode activation
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(350, now + 0.08);
            osc.frequency.linearRampToValueAtTime(150, now + 0.18);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.22);
            osc.start(now);
            osc.stop(now + 0.22);
            break;
    }
}

// === BACKGROUND MUSIC (chiptune BGM) ===
let bgmTheme = null;
let bgmBeat = 0;
let bgmNextNoteTime = 0;
let bgmSchedulerTimeout = null;

const BGM_THEMES = {
    day: {
        tempo: 0.17,
        oscType: 'square',
        gain: 0.038,
        melody: [
            330, 392, 440, 392, 330, 262, 294, 330,
            349, 440, 523, 440, 392, 330, 294, 0,
            330, 0,  392, 440, 494, 440, 392, 330,
            392, 330, 294, 262, 294, 330, 392, 0,
        ],
    },
    dusk: {
        tempo: 0.22,
        oscType: 'triangle',
        gain: 0.032,
        melody: [
            294, 0,   330, 294, 262, 0,   247, 0,
            262, 294, 330, 294, 262, 247, 220, 0,
            247, 0,   262, 0,   294, 330, 294, 0,
            262, 247, 220, 0,   220, 0,   247, 0,
        ],
    },
    night: {
        tempo: 0.28,
        oscType: 'sine',
        gain: 0.028,
        melody: [
            220, 0,   0,   247, 220, 0,   196, 0,
            220, 0,   0,   220, 196, 175, 0,   0,
            185, 196, 0,   0,   185, 0,   175, 0,
            196, 0,   220, 0,   196, 185, 0,   0,
        ],
    },
};

function getBGMThemeForLevel(levelIdx) {
    if (levelIdx >= 6) return 'night';
    if (levelIdx >= 4) return 'dusk';
    return 'day';
}

function startBGM(theme) {
    stopBGM();
    if (!audioCtx || soundMuted || !theme) return;
    bgmTheme = theme;
    bgmBeat = 0;
    bgmNextNoteTime = audioCtx.currentTime + 0.05;
    scheduleBGMNotes();
}

function stopBGM() {
    if (bgmSchedulerTimeout) { clearTimeout(bgmSchedulerTimeout); bgmSchedulerTimeout = null; }
    bgmTheme = null;
}

function scheduleBGMNotes() {
    if (!bgmTheme || !audioCtx || soundMuted) return;
    // Stop scheduling when in menu or game over
    if (gameState === 'GAME_OVER' || gameState === 'MENU') { bgmTheme = null; return; }

    const theme = BGM_THEMES[bgmTheme];
    if (!theme) return;

    while (bgmNextNoteTime < audioCtx.currentTime + 0.4) {
        const freq = theme.melody[bgmBeat % theme.melody.length];
        if (freq > 0) {
            const osc = audioCtx.createOscillator();
            const g   = audioCtx.createGain();
            osc.connect(g);
            g.connect(masterGain || audioCtx.destination); // Feature 112: route through master gain
            osc.type = theme.oscType;
            osc.frequency.value = freq;
            const noteDur = theme.tempo * 0.82;
            g.gain.setValueAtTime(0, bgmNextNoteTime);
            g.gain.linearRampToValueAtTime(theme.gain, bgmNextNoteTime + 0.012);
            g.gain.setValueAtTime(theme.gain, bgmNextNoteTime + noteDur * 0.65);
            g.gain.linearRampToValueAtTime(0, bgmNextNoteTime + noteDur);
            osc.start(bgmNextNoteTime);
            osc.stop(bgmNextNoteTime + noteDur);
        }
        bgmBeat++;
        bgmNextNoteTime += theme.tempo;
    }
    bgmSchedulerTimeout = setTimeout(scheduleBGMNotes, 100);
}

function setMuted(muted) {
    soundMuted = muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : soundVolume; // Feature 112
    if (muted) {
        stopBGM();
    } else if (gameState === 'PLAYING' && audioCtx) {
        startBGM(getBGMThemeForLevel(currentLevel));
    }
}

// === FEATURE 113: LEVEL START TIPS ===
const LEVEL_TIPS = [
    '💡 Прыгай на врагов сверху!  SHIFT — рывок',
    '💡 Двойной прыжок — нажми ↑ в воздухе снова',
    '💡 Комбо: стомпай врагов без касания земли',
    '💡 Стены! Удерживай направление к стене и прыгай',
    '💡 Броня: бронированных Марио нужно стомпнуть дважды',
    '💡 Ледяные платформы — скользко! Контролируй инерцию',
    '💡 Летучие Марио — подлови на уровне их полёта',
    '💡 Подбери звезду ⭐ для неуязвимости!',
    '💡 Шипы ☠️ убивают мгновенно — звезда спасает',
    '💡 Порталы телепортируют — используй тактически',
    '💡 Стрелки-Марио! Прыгай сбоку или сверху быстро',
    '💡 Босс: 5 стомпов — атакуй сверху, уворачивайся',
    '💡 Монеты = накопления в магазине между уровнями',
    '💡 Бросай споры (Z) для поражения врагов на расстоянии',
    '💡 Парашют: удерживай ↓ в воздухе для медленного падения',
    '💡 Летит джетпак! Удерживай ↑ для ускорения вверх',
    '💡 Бездействуй в темноте — собери фонарик 🔦',
];
let levelTipTimer = 0;           // frames remaining to show tip
const LEVEL_TIP_DURATION = 240;  // 4 seconds

function showLevelTip(levelIndex) {
    const tip = LEVEL_TIPS[levelIndex % LEVEL_TIPS.length];
    if (tip) levelTipTimer = LEVEL_TIP_DURATION;
}

// === LEVEL MANAGEMENT ===
function getMarioType(levelIndex, spawnIdx) {
    if (levelIndex < 2) return 'normal';
    if (levelIndex === 2) return spawnIdx === 0 ? 'fast' : 'normal';
    if (levelIndex === 3) {
        const types = ['normal', 'fast', 'jumpy', 'armored', 'normal'];
        return types[spawnIdx % types.length];
    }
    if (levelIndex === 4) {
        const types = ['armored', 'fast', 'jumpy', 'armored', 'fast', 'jumpy'];
        return types[spawnIdx % types.length];
    }
    if (levelIndex >= 10) {
        // Level 11 "Apocalypse": marioTypes array from level data takes priority (handled in loadLevel)
        const types = ['armored', 'ghost_mario', 'armored', 'jumpy', 'armored', 'fast', 'ghost_mario', 'armored'];
        return types[spawnIdx % types.length];
    }
    if (levelIndex === 8) {
        // Boss level — keep regular enemy types, no ghost_mario
        const types = ['normal', 'fast', 'armored', 'jumpy', 'armored'];
        return types[spawnIdx % types.length];
    }
    if (levelIndex >= 6) {
        // Night levels 7-10: introduce ghost_mario (Feature 84)
        const types = ['armored', 'ghost_mario', 'fast', 'jumpy', 'armored', 'ghost_mario', 'armored', 'fast'];
        return types[spawnIdx % types.length];
    }
    const types = ['armored', 'fast', 'jumpy', 'fast', 'armored', 'fast'];
    return types[spawnIdx % types.length];
}

// Feature 81: Mirror a level layout horizontally
function mirrorLevelData(lvl) {
    const mx = (x, w) => W - x - (w || 0);
    const msp = s => ({ ...s, x: mx(s.x, 20) });
    const mPlatforms = lvl.platforms.map(p => ({ ...p, x: mx(p.x, p.w) }));
    const mPlayerSpawn = { x: mx(lvl.playerSpawn.x, 18), y: lvl.playerSpawn.y };
    return {
        ...lvl,
        platforms: mPlatforms,
        playerSpawn: mPlayerSpawn,
        marioSpawns:          (lvl.marioSpawns         || []).map(msp),
        coinSpawns:           (lvl.coinSpawns           || []).map(s => ({ x: mx(s.x, 14), y: s.y })),
        doubleCoinSpawns:     (lvl.doubleCoinSpawns     || []).map(s => ({ x: mx(s.x, 14), y: s.y })),
        starSpawns:           (lvl.starSpawns           || []).map(msp),
        shieldSpawns:         (lvl.shieldSpawns         || []).map(msp),
        bombSpawns:           (lvl.bombSpawns           || []).map(msp),
        springSpawns:         (lvl.springSpawns         || []).map(msp),
        speedBoostSpawns:     (lvl.speedBoostSpawns     || []).map(msp),
        magnetSpawns:         (lvl.magnetSpawns         || []).map(msp),
        freezeSpawns:         (lvl.freezeSpawns         || []).map(msp),
        ghostSpawns:          (lvl.ghostSpawns          || []).map(msp),
        scoreBoostSpawns:     (lvl.scoreBoostSpawns     || []).map(msp),
        electroSpawns:        (lvl.electroSpawns        || []).map(msp),
        slowMoSpawns:         (lvl.slowMoSpawns         || []).map(msp),
        rocketSpawns:         (lvl.rocketSpawns         || []).map(msp),
        magBootsSpawns:       (lvl.magBootsSpawns       || []).map(msp), // Feature 85
        giantSpawns:          (lvl.giantSpawns          || []).map(msp), // Feature 87
        jetpackSpawns:        (lvl.jetpackSpawns        || []).map(msp), // Feature 99
        checkpointSpawns:     (lvl.checkpointSpawns     || []).map(msp),
        flyingMarioSpawns:    (lvl.flyingMarioSpawns    || []).map(msp),
        shooterMarioSpawns:   (lvl.shooterMarioSpawns   || []).map(msp),
        parachuteMarioSpawns: (lvl.parachuteMarioSpawns || []).map(msp),
        teleporterMarioSpawns: (lvl.teleporterMarioSpawns || []).map(msp), // Feature 89
        tripleCoinSpawns:     (lvl.tripleCoinSpawns     || []).map(s => ({ x: mx(s.x, 14), y: s.y })),
        rainbowCoinSpawns:    (lvl.rainbowCoinSpawns    || []).map(s => ({ x: mx(s.x, 16), y: s.y })), // Feature 138
        healSpawns:           (lvl.healSpawns           || []).map(msp), // Feature 137
        bubbleSpawns:         (lvl.bubbleSpawns         || []).map(msp), // Feature 145
        jumpBoostSpawns:      (lvl.jumpBoostSpawns      || []).map(msp), // Feature 148
        lightningCoinSpawns:  (lvl.lightningCoinSpawns  || []).map(msp), // Feature 147
        explodingCoinSpawns:  (lvl.explodingCoinSpawns  || []).map(msp), // Feature 162
        dronePUSpawns:        (lvl.dronePUSpawns        || []).map(msp), // Feature 161
        spikeBootsSpawns:     (lvl.spikeBootsSpawns    || []).map(msp), // Feature 163
        portalSpawns: (lvl.portalSpawns || []).map(p => ({
            blue:   { x: mx(p.blue.x,   22), y: p.blue.y   },
            orange: { x: mx(p.orange.x, 22), y: p.orange.y },
        })),
    };
}

function loadLevel(index) {
    rageModeActive = false; // Feature 69: reset rage on level change
    rageModeWarningTimer = 0;
    lastEnemyBannerTimer = 0; // Feature 151
    dashShadows = []; // Feature 152
    const rawLvl0 = LEVELS[index < LEVELS.length ? index : (index % LEVELS.length)];
    levelGravityMult = rawLvl0.lowGravity ? 0.38 : 1.0; // Feature 100: space level low gravity
    // Feature 141: Wind — reset and initialize based on level flag
    windActive = !!rawLvl0.hasWind;
    isStormLevel = !!rawLvl0.isStorm;
    windForce = 0; windTarget = 0; windStreaks = []; lightningFlashTimer = 0;
    windChangeTimer = 60; lightningNextTimer = 180;
    const lvlIndex = index < LEVELS.length ? index : (index % LEVELS.length);
    const rawLvl = LEVELS[lvlIndex];
    // Feature 81: apply horizontal mirror if mode is active
    let lvl = (mirrorMode && !rawLvl.isBonusLevel) ? mirrorLevelData(rawLvl) : rawLvl;
    const speedMult = index >= LEVELS.length ? 1 + (index - LEVELS.length) * 0.15 : 1;

    // Feature 86: Apply Daily Challenge modifier — strip certain powerup spawns
    if (dailyChallengeMode) {
        if (dailyChallengeModifiers.includes('no_shield')) lvl = { ...lvl, shieldSpawns: [] };
        if (dailyChallengeModifiers.includes('no_star'))   lvl = { ...lvl, starSpawns: [] };
    }

    // Feature 82: Coin Cave setup
    coinCaveMode = !!lvl.isBonusLevel;
    coinCaveCountdown = coinCaveMode ? COIN_CAVE_DURATION : 0;

    platforms = lvl.platforms.map(p => new Platform(p.x, p.y, p.w, p.h, p.moveAxis, p.moveRange, p.moveSpeed, p.crumble, p.ice, p.conveyor, p.pulse));

    const diffMult = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.3 : difficulty === 'hardcore' ? 1.6 : 1;
    const dailySpeedMult = (dailyChallengeMode && dailyChallengeModifiers.includes('fast_enemies')) ? 1.6 : 1;
    const endlessMult = endlessMode ? 1 + endlessCycle * 0.12 : 1; // Feature 115: each cycle enemies are 12% faster
    const speed = lvl.marioSpeed * speedMult * diffMult * dailySpeedMult * endlessMult;
    marios = lvl.marioSpawns.map((s, i) => {
        const type = lvl.marioTypes ? (lvl.marioTypes[i] || getMarioType(index, i)) : getMarioType(index, i);
        return new Mario(s.x, s.y, speed, type);
    });

    // Extra Marios for levels beyond 5
    if (index >= LEVELS.length) {
        const extraCount = Math.floor((index - LEVELS.length) / 2);
        for (let i = 0; i < extraCount; i++) {
            const spawn = lvl.marioSpawns[i % lvl.marioSpawns.length];
            marios.push(new Mario(spawn.x + 40, spawn.y, speed * 1.1, 'fast'));
        }
    }

    // Flying Marios (no gravity, patrol at fixed altitude)
    const flyingSpeed = speed * 0.85;
    const flyingMarios = (lvl.flyingMarioSpawns || []).map(s => new Mario(s.x, s.y, flyingSpeed, 'flying'));
    marios = [...marios, ...flyingMarios];
    // Shooter Marios (stationary, fires fireballs)
    const shooterMarios = (lvl.shooterMarioSpawns || []).map(s => new Mario(s.x, s.y, 0, 'shooter'));
    marios = [...marios, ...shooterMarios];
    // Feature 71: Parachute Marios (descend slowly from above)
    const parachuteMarios = (lvl.parachuteMarioSpawns || []).map(s => new Mario(s.x, s.y, speed * 0.6, 'parachute'));
    marios = [...marios, ...parachuteMarios];
    // Feature 89: Teleporter Marios
    const teleporterMarios = (lvl.teleporterMarioSpawns || []).map(s => new Mario(s.x, s.y, 0, 'teleporter'));
    marios = [...marios, ...teleporterMarios];
    // Feature 103: Berserker Marios
    const berserkerMarios = (lvl.berserkerMarioSpawns || []).map(s => new Mario(s.x, s.y, speed * 0.65, 'berserker'));
    marios = [...marios, ...berserkerMarios];
    fireballs = [];
    spores = []; // Feature 101: reset spores on level load

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
    scorePopups = []; // Feature 88
    killFeed = [];    // Feature 160
    droppedPowerups = []; // Feature 77: reset on level load
    explodingCoins = []; dronePowerUps = []; spikeBoots = []; warpCoins = []; explosiveBarrels = []; vortexCoins = []; reflectShields = []; quakePowerUps = []; // Feature 161/162/163/165/167/169/171/173: reset on level load
    comboCount = 0;
    comboDisplayTimer = 0;
    levelMaxCombo = 0;
    killStreakCount = 0; // Feature 83: reset streak on new level
    levelClearFlash = 0; // Feature 136
    coinRainTimer = 0; coinRainBannerTimer = 0; coinRainEventInterval = COIN_RAIN_CHECK_INTERVAL; // Feature 111
    killStreakTimer = 0;
    levelTimer = 0;
    hudScoreDisplay = 0;
    levelTotalMarios = marios.length;
    // Feature 59: reset per-level grade tracking
    levelDeathCount = 0;
    levelCoinsCollected = 0;
    // Feature 137/138: Auto-generate heal mushroom + rainbow coin positions for levels without explicit spawns
    if (lvl.healSpawns === undefined && index >= 3) {
        const candid = lvl.platforms.filter(p => p.y < 400 && p.w >= 80 && !p.crumble && !p.ice)
            .sort((a, b) => a.y - b.y);
        if (candid.length > 0) {
            const p = candid[0];
            lvl = { ...lvl, healSpawns: [{ x: p.x + Math.floor(p.w * 0.25), y: p.y - 22 }] };
        }
    }
    if (lvl.rainbowCoinSpawns === undefined && index >= 2) {
        const candid = lvl.platforms.filter(p => p.y < 420 && p.w >= 70 && !p.crumble)
            .sort((a, b) => a.y - b.y);
        const src = candid.length >= 2 ? candid[1] : candid[0];
        if (src) lvl = { ...lvl, rainbowCoinSpawns: [{ x: src.x + Math.floor(src.w * 0.6), y: src.y - 22 }] };
    }
    levelCoinsTotal = (lvl.coinSpawns || []).length + (lvl.doubleCoinSpawns || []).length + (lvl.tripleCoinSpawns || []).length + (lvl.rainbowCoinSpawns || []).length; // Features 92, 138
    coins = [
        ...(lvl.coinSpawns || []).map(c => new Coin(c.x, c.y)),
        ...(lvl.doubleCoinSpawns || []).map(c => new Coin(c.x, c.y, 100)),
        ...(lvl.tripleCoinSpawns || []).map(c => new Coin(c.x, c.y, 150)), // Feature 92
        ...(lvl.rainbowCoinSpawns || []).map(c => new Coin(c.x, c.y, 200, true)), // Feature 138
    ];
    stars = (lvl.starSpawns || []).map(s => new Star(s.x, s.y));
    shields = (lvl.shieldSpawns || []).map(s => new Shield(s.x, s.y));
    bombs = (lvl.bombSpawns || []).map(b => new Bomb(b.x, b.y));
    springPads = (lvl.springSpawns || []).map(s => new SpringPad(s.x, s.y));
    speedBoosts = (lvl.speedBoostSpawns || []).map(s => new SpeedBoost(s.x, s.y));
    magnets = (lvl.magnetSpawns || []).map(m => new Magnet(m.x, m.y));
    freezes = (lvl.freezeSpawns || []).map(f => new Freeze(f.x, f.y));
    ghosts = (lvl.ghostSpawns || []).map(g => new Ghost(g.x, g.y)); // Feature 54
    scoreBoosts = (lvl.scoreBoostSpawns || []).map(s => new ScoreBoost(s.x, s.y)); // Feature 61
    electricos = (lvl.electroSpawns || []).map(e => new Electro(e.x, e.y)); // Feature 72
    slowMos = (lvl.slowMoSpawns || []).map(s => new SlowMo(s.x, s.y)); // Feature 75
    rockets = (lvl.rocketSpawns || []).map(r => new RocketPU(r.x, r.y)); // Feature 80
    magBootsList = (lvl.magBootsSpawns || []).map(m => new MagBootsPU(m.x, m.y)); // Feature 85
    giantPUs = (lvl.giantSpawns || []).map(g => new GiantPU(g.x, g.y)); // Feature 87
    jetpacks = (lvl.jetpackSpawns || []).map(j => new JetpackPU(j.x, j.y)); // Feature 99
    flashlights = (lvl.flashlightSpawns || []).map(f => new FlashlightPU(f.x, f.y)); // Feature 105
    healingMushrooms = (lvl.healSpawns || []).map(h => new HealingMushroom(h.x, h.y)); // Feature 137
    giftChests = (lvl.giftChestSpawns || []).map(g => new GiftChest(g.x, g.y)); // Feature 143
    bubbleShields = (lvl.bubbleSpawns || []).map(b => new BubbleShieldPU(b.x, b.y)); // Feature 145
    // Auto-place 1 bubble shield on levels 6+ if none specified
    if (!lvl.bubbleSpawns && index >= 5) {
        const cands = lvl.platforms.filter(p => p.y < 350 && p.w >= 60 && !p.crumble && !p.ice).sort((a, b) => b.y - a.y);
        if (cands.length >= 2) {
            const p = cands[1];
            bubbleShields = [new BubbleShieldPU(p.x + Math.floor(p.w * 0.5), p.y - 24)];
        }
    }
    jumpBoosts = (lvl.jumpBoostSpawns || []).map(jb => new JumpBoostPU(jb.x, jb.y)); // Feature 148
    // Auto-place 1 jump boost on levels 3+ if none specified
    if (!lvl.jumpBoostSpawns && index >= 2) {
        const cands = lvl.platforms.filter(p => p.y < 380 && p.w >= 50 && !p.crumble && !p.ice).sort((a, b) => b.y - a.y);
        if (cands.length >= 3) {
            const p = cands[Math.floor(cands.length * 0.6)];
            jumpBoosts = [new JumpBoostPU(p.x + Math.floor(p.w * 0.3), p.y - 24)];
        }
    }
    lightningCoins = (lvl.lightningCoinSpawns || []).map(lc => new LightningCoin(lc.x, lc.y)); // Feature 147
    // Auto-place 1 lightning coin on levels 4+ if none specified
    if (!lvl.lightningCoinSpawns && index >= 3) {
        const cands = lvl.platforms.filter(p => p.y < 350 && p.w >= 60 && !p.crumble).sort((a, b) => a.y - b.y);
        if (cands.length >= 2) {
            const p = cands[Math.floor(cands.length * 0.5)];
            lightningCoins = [new LightningCoin(p.x + Math.floor(p.w * 0.6), p.y - 24)];
        }
    }
    // Auto-place 1 gift chest on levels 5+ if none specified
    if (!lvl.giftChestSpawns && index >= 4) {
        const cands = lvl.platforms.filter(p => p.y < 380 && p.w >= 60 && !p.crumble && !p.ice).sort((a, b) => a.y - b.y);
        if (cands.length >= 3) {
            const p = cands[Math.floor(cands.length * 0.4)];
            giftChests = [new GiftChest(p.x + Math.floor(p.w * 0.7), p.y - 20)];
        }
    }
    // Feature 162: Auto-place 1 exploding coin on levels 3+ if none specified
    explodingCoins = (lvl.explodingCoinSpawns || []).map(s => new ExplodingCoin(s.x, s.y));
    if (!lvl.explodingCoinSpawns && index >= 2) {
        const cands = lvl.platforms.filter(p => p.y < 420 && p.w >= 50 && !p.crumble).sort((a, b) => b.y - a.y);
        if (cands.length >= 2) {
            const p = cands[Math.floor(cands.length * 0.35)];
            explodingCoins = [new ExplodingCoin(p.x + Math.floor(p.w * 0.5), p.y - 24)];
        }
    }
    // Feature 165: Warp Coin — auto-place on levels 5+ if not explicitly set
    warpCoins = (lvl.warpCoinSpawns || []).map(wc => new WarpCoin(wc.x, wc.y));
    if (!lvl.warpCoinSpawns && index >= 4) {
        const cands = lvl.platforms.filter(p => p.y < 380 && p.w >= 60 && !p.crumble && !p.ice).sort((a, b) => a.y - b.y);
        if (cands.length >= 2) {
            const p = cands[Math.floor(cands.length * 0.55)];
            warpCoins = [new WarpCoin(p.x + Math.floor(p.w * 0.5), p.y - 26)];
        }
    }
    // Feature 161: Auto-place 1 companion drone power-up on levels 4+
    dronePowerUps = (lvl.dronePUSpawns || []).map(s => new CompanionDronePU(s.x, s.y));
    if (!lvl.dronePUSpawns && index >= 3) {
        const cands = lvl.platforms.filter(p => p.y < 350 && p.w >= 60 && !p.crumble && !p.ice).sort((a, b) => a.y - b.y);
        if (cands.length >= 3) {
            const p = cands[Math.floor(cands.length * 0.7)];
            dronePowerUps = [new CompanionDronePU(p.x + Math.floor(p.w * 0.4), p.y - 24)];
        }
    }
    // Feature 167: Explosive barrels — auto-place 1-2 on levels 6+ if not explicitly set
    explosiveBarrels = (lvl.barrelSpawns || []).map(b => new ExplosiveBarrel(b.x, b.y));
    if (!lvl.barrelSpawns && index >= 5) {
        const cands = lvl.platforms.filter(p => p.y >= 380 && p.y <= 460 && p.w >= 60 && !p.crumble && !p.ice).sort((a, b) => a.y - b.y);
        if (cands.length >= 2) {
            const p1 = cands[0];
            explosiveBarrels = [new ExplosiveBarrel(p1.x + Math.floor(p1.w * 0.5), p1.y - 36)];
            if (cands.length >= 3) {
                const p2 = cands[Math.floor(cands.length / 2)];
                if (Math.abs(p2.x - p1.x) > 100)
                    explosiveBarrels.push(new ExplosiveBarrel(p2.x + Math.floor(p2.w * 0.4), p2.y - 36));
            }
        }
    }

    // Feature 169: Vortex Coin — load from spawns or auto-place on levels 4+
    vortexCoins = (lvl.vortexCoinSpawns || []).map(vc => new VortexCoin(vc.x, vc.y));
    if (!lvl.vortexCoinSpawns && index >= 3) {
        const cands = lvl.platforms.filter(p => p.y < 350 && p.w >= 60 && !p.crumble && !p.ice).sort((a, b) => a.y - b.y);
        if (cands.length >= 2) {
            const p = cands[Math.floor(cands.length * 0.45)];
            vortexCoins = [new VortexCoin(p.x + Math.floor(p.w * 0.5), p.y - 26)];
        }
    }

    // Feature 171: Reflect Shield — load from spawns or auto-place on levels 6+
    reflectShields = (lvl.reflectSpawns || []).map(r => new ReflectShieldPU(r.x, r.y));
    if (!lvl.reflectSpawns && index >= 5) {
        const cands = lvl.platforms.filter(p => p.y < 380 && p.w >= 50 && !p.crumble && !p.ice).sort((a, b) => a.y - b.y);
        if (cands.length >= 2) {
            const p = cands[Math.floor(cands.length * 0.65)];
            reflectShields = [new ReflectShieldPU(p.x + Math.floor(p.w * 0.4), p.y - 24)];
        }
    }

    // Feature 173: Earthquake Stomp PU — load from spawns or auto-place on levels 5+
    quakePowerUps = (lvl.quakeSpawns || []).map(q => new EarthquakePU(q.x, q.y));
    if (!lvl.quakeSpawns && index >= 4) {
        const cands = lvl.platforms.filter(p => p.y < 380 && p.w >= 50 && !p.crumble).sort((a, b) => b.y - a.y);
        if (cands.length >= 2) {
            const p = cands[Math.floor(cands.length * 0.55)];
            quakePowerUps = [new EarthquakePU(p.x + Math.floor(p.w * 0.3), p.y - 26)];
        }
    }

    // Feature 163: Auto-place 1 spike boots power-up on levels 5+
    spikeBoots = (lvl.spikeBootsSpawns || []).map(s => new SpikeBootsPU(s.x, s.y));
    if (!lvl.spikeBootsSpawns && index >= 4) {
        const cands = lvl.platforms.filter(p => p.y < 380 && p.w >= 50 && !p.crumble).sort((a, b) => b.y - a.y);
        if (cands.length >= 2) {
            const p = cands[Math.floor(cands.length * 0.45)];
            spikeBoots = [new SpikeBootsPU(p.x + Math.floor(p.w * 0.6), p.y - 26)];
        }
    }
    // Portals: each entry is {blue: {x,y}, orange: {x,y}}
    portalPairs = (lvl.portalSpawns || []).map(p => {
        const pA = new Portal(p.blue.x, p.blue.y, 'blue');
        const pB = new Portal(p.orange.x, p.orange.y, 'orange');
        pA.linked = pB;
        pB.linked = pA;
        return [pA, pB];
    });
    checkpoints = (lvl.checkpointSpawns || []).map(c => new Checkpoint(c.x, c.y));
    if (player) player.checkpointSpawn = null; // reset checkpoint on new level
    spikes = (lvl.spikeSpawns || []).map(s => new Spike(s.x, s.y, s.count || 3)); // Feature 91
    isBossLevel = !!lvl.isBossLevel;
    bossMarco = isBossLevel ? new BossMarco(620, 380) : null;
    initWeather(index);
    initBirds(); // Feature 60: spawn background birds
    shootingStars = []; // Feature 62: reset shooting stars on level load
    // Feature 98: set up challenge card for this level
    currentChallengeIdx = index % CHALLENGE_DEFS.length;
    challengeCardTimer = CHALLENGE_CARD_DURATION;
    challengeBonusAwarded = false;
    // Start BGM appropriate to this level's theme
    if (audioCtx && !soundMuted) startBGM(getBGMThemeForLevel(index));
    showLevelTip(index); // Feature 113
    makeSpawnSafe(lvl);
}

function snapToGround(obj) {
    const solid = platforms.filter(p => !p.moveAxis && !p.crumble);
    const cx = obj.x + obj.w / 2;
    const bottom = obj.y + obj.h;
    if (solid.some(p => cx >= p.x && cx <= p.x + p.w && p.y >= bottom - 6 && p.y - bottom < 140)) return;
    let best = null, bestD = Infinity;
    for (const p of solid) {
        if (p.w < obj.w + 4) continue;
        const nx = Math.max(p.x + obj.w / 2 + 2, Math.min(p.x + p.w - obj.w / 2 - 2, cx));
        const d = Math.hypot(nx - cx, p.y - bottom);
        if (d < bestD) { bestD = d; best = { x: nx, y: p.y }; }
    }
    if (best) { obj.x = best.x - obj.w / 2; obj.y = best.y - obj.h; }
}

// Feature 119: keep the level start fair — no enemies, spikes or portals right on the spawn point
function makeSpawnSafe(lvl) {
    const sp = lvl.playerSpawn;
    const cx = sp.x + player.w / 2;
    player.invincibleTimer = Math.max(player.invincibleTimer, 90);
    player.portalLock = true;
    spikes = spikes.filter(s => s.x + s.w < cx - 70 || s.x > cx + 70 || Math.abs(s.y - sp.y) > 80);
    // Farthest regular spawn from the player — used to relocate enemies that start too close
    const far = (lvl.marioSpawns || []).reduce((best, s) =>
        (!best || Math.abs(s.x - sp.x) > Math.abs(best.x - sp.x)) ? s : best, null);
    // Portals and checkpoints must stand on solid ground, otherwise they teleport/respawn the player into a pit
    for (const [pA, pB] of portalPairs) { snapToGround(pA); snapToGround(pB); }
    checkpoints.forEach(snapToGround);
    let shift = 0;
    for (const m of marios) {
        if (m.type === 'flying' || m.type === 'parachute') continue;
        const near = Math.abs(m.x + m.w / 2 - cx) < 150 && Math.abs(m.y - sp.y) < 90;
        if (!near) continue;
        if (far && Math.abs(far.x - sp.x) >= 200) {
            m.x = far.x + shift;
            m.y = far.y;
            shift += 34;
        }
        m.direction = m.x > sp.x ? 1 : -1;
    }
}

// Feature 83: Kill Streak — call on every confirmed enemy kill
function onEnemyKilledStreak(x, y) {
    killStreakTimer = 0;
    killStreakCount++;
    if (killStreakCount < 3) return;

    let bonus = 0;
    let msg = '';
    let color = '#ff6600';
    if (killStreakCount >= 8) {
        bonus = 1000; msg = `🌟 ЛЕГЕНДА x${killStreakCount}!`; color = '#ffd700';
    } else if (killStreakCount >= 5) {
        bonus = 500; msg = `💥 ОГОНЬ! x${killStreakCount}`; color = '#ff4400';
    } else {
        bonus = 200; msg = `🔥 СТРИК x${killStreakCount}!`; color = '#ff8800';
    }
    if (player && bonus > 0) {
        player.score += bonus;
        totalScore += bonus;
    }
    particles.push(new Particle(x - 30, y - 25, `${msg} +${bonus}`, color));
}

function startGame() {
    dailyChallengeMode = false; // Feature 86: clear daily challenge on new game
    endlessMode = false;        // Feature 115: clear endless mode on new game
    endlessCycle = 0;
    marathonMode = false;       // Feature 127: clear marathon mode on new game
    mirrorMode = localStorage.getItem('mushroomMirrorMode') === 'true'; // restore persisted mirror
    resetAchievements();
    resetRunStats();
    resetShop(); // Feature 107
    runStartHighScore = highScore;
    newRecordThisRun = false;
    newRecordFlashTimer = 0;
    startGameFromLevel(0);
}

function startGameFromLevel(level) {
    survivalMode = false; // ensure survival mode off in normal game
    rageModeActive = false;
    rageModeWarningTimer = 0;
    currentLevel = level;
    totalScore = 0;
    nextMilestoneIdx = 0; // Feature 76: reset milestones on new game
    milestoneBannerTimer = 0;
    player = null;
    stars = [];
    loadLevel(level);
    player.lives = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : difficulty === 'hardcore' ? 1 : 3;
    player.score = 0;
    gameState = 'PLAYING';
}

// === COLLISION DETECTION ===
// Feature 91: Spike collision — instant kill (star & ghost protect, post-death invincibility protects)
function checkSpikeCollisions() {
    if (player.invincibleTimer > 0) return;
    if (player.starTimer > 0 || player.ghostTimer > 0) return;
    for (const spike of spikes) {
        const hitbox = { x: spike.x + 2, y: spike.y, w: spike.w - 4, h: 10 };
        if (aabb(player, hitbox)) {
            particles.push(new Particle(player.x + player.w / 2, player.y - 10, '💀 ШИПЫ!', '#ff4444'));
            player.die();
            return;
        }
    }
}

function checkCoinCollisions() {
    for (const coin of coins) {
        if (coin.collected) continue;
        if (aabb(player, coin)) {
            coin.collected = true;
            let pts = coin.bonus || 50;
            // Feature 73: Coin Frenzy — x3 multiplier
            const frenzyMulti = coinFrenzyTimer > 0 ? 3 : 1;
            pts *= frenzyMulti;
            player.score += pts;
            totalScore += pts;
            totalCoinsCollectedRun++;
            runStats.coinsCollected++;
            levelCoinsCollected++;  // Feature 59
            if (totalCoinsCollectedRun >= 10) unlockAchievement('coinCollector');
            if (totalCoinsCollectedRun >= 50) unlockAchievement('bigSpender');
            // Feature 138: Rainbow coin triggers Coin Frenzy
            if (coin.isRainbow) {
                coinFrenzyTimer = 480; // 8 seconds
                coinFrenzyActivated = true;
                particles.push(new Particle(coin.x, coin.y - 18, '🌈 РАДУГА!', '#ff88ff'));
                playSound('levelup');
            }
            const pColor = coinFrenzyTimer > 0 ? '#ff8800' : (pts > 50 ? '#ff9900' : '#ffcc00');
            const pText = coinFrenzyTimer > 0 ? `x3 +${pts}` : `+${pts}`;
            particles.push(new Particle(coin.x, coin.y - 5, pText, pColor));
            playSound('coin');
        }
    }
    coins = coins.filter(c => !c.collected);
}

function checkPlayerMarioCollisions() {
    // Feature 87: Giant Mode — allow entry (handled per-enemy inside loop)
    if (player.invincibleTimer > 0 && player.starTimer <= 0 && player.giantTimer <= 0) return;

    for (const mario of marios) {
        if (!mario.isAlive) continue;
        if (!aabb(player, mario)) continue;

        // Star power: kill on any contact
        if (player.starTimer > 0) {
            mario.stomp();
            onEnemyKilledStreak(mario.x, mario.y); // Feature 83
            comboCount++;
            let points = 100 * comboCount;
            if (player.scoreBoostTimer > 0) points *= 2; // Feature 61
            player.score += points;
            totalScore += points;
            comboDisplayTimer = 100;
            addKillFeedEntry(mario.type, points); // Feature 160
            const comboColors = ['#ffff00', '#ffaa00', '#ff6600', '#ff2200', '#ff00ff'];
            const pColor = comboColors[Math.min(comboCount - 1, 4)];
            const pText = comboCount > 1 ? `x${comboCount}  +${points}` : `+${points}`;
            particles.push(new Particle(mario.x, mario.y - 10, pText, pColor));
            shakeTimer = Math.min(6 + comboCount, 12);
            shakeIntensity = Math.min(3 + comboCount * 0.5, 7);
            continue;
        }

        // Feature 87: Giant Mode — kill on any contact
        if (player.giantTimer > 0) {
            mario.stomp();
            comboCount++;
            runStats.enemiesKilled++;
            onEnemyKilledStreak(mario.x, mario.y);
            let points = 200 * comboCount;
            if (player.scoreBoostTimer > 0) points *= 2;
            player.score += points;
            totalScore += points;
            comboDisplayTimer = 100;
            addKillFeedEntry(mario.type, points); // Feature 160
            const pText = `🔴 +${points}`;
            particles.push(new Particle(mario.x, mario.y - 10, pText, '#ff6600'));
            shakeTimer = Math.min(6 + comboCount, 12);
            shakeIntensity = Math.min(3 + comboCount * 0.5, 7);
            continue;
        }

        // Feature 80: Rocket power — kill on any contact while flying
        if (player.rocketTimer > 0) {
            mario.stomp();
            comboCount++;
            runStats.enemiesKilled++;
            onEnemyKilledStreak(mario.x, mario.y); // Feature 83
            let points = 150 * comboCount; // bonus points for rocket kills
            if (player.scoreBoostTimer > 0) points *= 2;
            player.score += points;
            totalScore += points;
            comboDisplayTimer = 100;
            addKillFeedEntry(mario.type, points); // Feature 160
            const pColor = '#ff8800';
            const pText = `🚀 +${points}`;
            particles.push(new Particle(mario.x, mario.y - 10, pText, pColor));
            shakeTimer = Math.min(8 + comboCount, 14);
            shakeIntensity = Math.min(4 + comboCount * 0.5, 8);
            continue;
        }

        if (player.invincibleTimer > 0) continue;

        // Stomp: player is falling and above mario
        const playerBottom = player.y + player.h;
        const marioTop = mario.y;
        const overlapY = playerBottom - marioTop;

        if (player.vy > 0 && overlapY < 15) {
            // STOMP!
            const killed = mario.stomp();
            player.vy = STOMP_BOUNCE;
            haptic(killed ? 18 : 8); // Feature 124
            if (killed) {
                runStats.enemiesKilled++;
                onEnemyKilledStreak(mario.x, mario.y); // Feature 83
                unlockAchievement('firstStomp');
                const _kfPts = 100 * Math.max(1, comboCount + 1);
                addKillFeedEntry(mario.type, player.scoreBoostTimer > 0 ? _kfPts * 2 : _kfPts); // Feature 160
                comboCount++;
                if (comboCount > runStats.maxCombo) runStats.maxCombo = comboCount;
                if (comboCount >= 5) unlockAchievement('comboMaster');
                // Feature 73: Coin Frenzy trigger at combo x8+
                if (comboCount >= 8) {
                    coinFrenzyTimer = COIN_FRENZY_DURATION;
                    if (!coinFrenzyActivated) {
                        coinFrenzyActivated = true;
                        particles.push(new Particle(W / 2 - 60, H / 2 - 80, '💰 МОНЕТНАЯ ЛИХОРАДКА!', '#ffdd00'));
                        playSound('levelup');
                    }
                } else {
                    coinFrenzyActivated = false;
                }
                const multiplier = comboCount;
                let points = 100 * multiplier;
                if (player.scoreBoostTimer > 0) points *= 2; // Feature 61
                player.score += points;
                totalScore += points;
                comboDisplayTimer = 100;
                const comboColors = ['#ffff00', '#ffaa00', '#ff6600', '#ff2200', '#ff00ff'];
                const pColor = comboColors[Math.min(comboCount - 1, 4)];
                const pText = comboCount > 1 ? `x${comboCount}  +${points}` : `+${points}`;
                particles.push(new Particle(mario.x, mario.y - 10, pText, pColor));
                shakeTimer = Math.min(6 + comboCount, 12);
                shakeIntensity = Math.min(3 + comboCount * 0.5, 7);
                // Feature 163: Spike Boots — auto-redirect to nearest enemy (chain stomp)
                if (player.spikeBootsTimer > 0 && player.spikeBootsChains < SPIKE_BOOTS_MAX_CHAIN) {
                    const killedCx = mario.x + mario.w / 2;
                    const killedCy = mario.y + mario.h / 2;
                    let nearest = null;
                    let nearestDist = SPIKE_BOOTS_RADIUS;
                    for (const m2 of marios) {
                        if (!m2.isAlive || m2 === mario) continue;
                        const d = Math.hypot(m2.x + m2.w/2 - killedCx, m2.y + m2.h/2 - killedCy);
                        if (d < nearestDist) { nearestDist = d; nearest = m2; }
                    }
                    if (nearest) {
                        // Launch player toward nearest enemy
                        const dx = (nearest.x + nearest.w / 2) - (player.x + player.w / 2);
                        player.vx = Math.sign(dx) * Math.min(Math.abs(dx) * 0.15, 8);
                        player.vy = -12; // jump arc toward enemy
                        player.spikeBootsChains++;
                        // Visual sparks
                        for (let _si = 0; _si < 6; _si++) {
                            const ang = Math.random() * Math.PI * 2;
                            particles.push(new DeathParticle(player.x + player.w/2, player.y + player.h, Math.cos(ang)*3, Math.sin(ang)*2 - 2, '#ff6600', 4));
                        }
                        particles.push(new Particle(player.x, player.y - 18, '🥾 ЦЕПЬ!', '#ff4400'));
                    }
                }
            } else {
                // Armor absorbed — no score, just a bounce
                particles.push(new Particle(mario.x, mario.y - 10, 'БРОНЯ!', '#aaaaaa'));
                shakeTimer = 4;
                shakeIntensity = 3;
            }
        } else {
            // Side hit — skip if ghost mode active (Feature 54)
            if (player.ghostTimer > 0) continue;
            // Feature 145: Bubble Shield — absorbs one side hit, kills the enemy
            if (player.bubbleTimer > 0) {
                mario.stomp();
                runStats.enemiesKilled++;
                onEnemyKilledStreak(mario.x, mario.y);
                let pts = 100;
                if (player.scoreBoostTimer > 0) pts *= 2;
                player.score += pts;
                totalScore += pts;
                player.bubbleTimer = 0;
                player.invincibleTimer = 45;
                // Bubble pop particles
                for (let i = 0; i < 8; i++) {
                    const ang = (Math.PI * 2 / 8) * i;
                    const bpx = player.x + player.w / 2 + Math.cos(ang) * 18;
                    const bpy = player.y + player.h / 2 + Math.sin(ang) * 18;
                    particles.push(new DeathParticle(bpx, bpy, Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, '#aaeeff', 3));
                }
                particles.push(new Particle(player.x, player.y - 14, '🫧 ПОП! +' + pts, '#88ddff'));
                playSound('shield');
                continue;
            }
            if (player.shieldActive) {
                player.shieldActive = false;
                player.shieldBreakTimer = 20;
                player.invincibleTimer = 60;
                unlockAchievement('shieldUser');
                particles.push(new Particle(player.x, player.y - 10, '🛡 ЩИТ!', '#4488ff'));
                playSound('hurt');
            } else {
                player.die();
            }
        }
    }
}

function checkPlayerBossCollision() {
    if (!bossMarco || !bossMarco.isAlive) return;
    if (!aabb(player, bossMarco)) return;

    // Star power: deal 1 HP per contact (with short invincibility window)
    if (player.starTimer > 0) {
        if (bossMarco.stomp(true)) {
            const pts = 1000;
            player.score += pts;
            totalScore += pts;
            particles.push(new Particle(bossMarco.x + bossMarco.w / 2 - 40, bossMarco.y - 10, `+${pts}`, '#ffff00'));
        }
        return;
    }

    if (player.invincibleTimer > 0) return;

    const playerBottom = player.y + player.h;
    const bossTop = bossMarco.y;
    const overlapY = playerBottom - bossTop;

    if (player.vy > 0 && overlapY < 20) {
        // Stomp on boss
        const killed = bossMarco.stomp(false);
        player.vy = STOMP_BOUNCE;
        if (killed) {
            runStats.enemiesKilled++;
            const pts = 1000;
            player.score += pts;
            totalScore += pts;
            particles.push(new Particle(bossMarco.x + bossMarco.w / 2 - 50, bossMarco.y - 10, `👑 +${pts}!`, '#ffff00'));
        } else if (bossMarco.invTimer > 0) {
            particles.push(new Particle(bossMarco.x + bossMarco.w / 2 - 40, bossMarco.y - 10, `HP: ${bossMarco.hp}`, '#ff6666'));
        }
    } else {
        // Side hit
        if (player.shieldActive) {
            player.shieldActive = false;
            player.shieldBreakTimer = 20;
            player.invincibleTimer = 60;
            unlockAchievement('shieldUser');
            particles.push(new Particle(player.x, player.y - 10, '🛡 ЩИТ!', '#4488ff'));
            playSound('hurt');
        } else {
            player.die();
        }
    }
}

// === FEATURE 53: Afterimage trail ===
function renderAfterimages() {
    if (afterimages.length === 0) return;
    const px = 2.5;
    const spriteW = 14 * px;
    const spriteH = 12 * px;
    afterimages.forEach((img, i) => {
        const alpha = (i + 1) / afterimages.length * 0.42;
        ctx.save();
        ctx.globalAlpha = alpha;
        // Feature 65: cyan tint for dash afterimages, green for speed boost
        const pivotX = img.x + 16;
        const pivotY = img.y + 32;
        ctx.translate(pivotX, pivotY);
        ctx.scale(img.scaleX, img.scaleY);
        ctx.translate(-pivotX, -pivotY);
        const drawX = img.x + (32 - spriteW) / 2;
        const drawY = img.y + (32 - spriteH);
        // Feature 65 tint via a recoloured sprite (ctx.filter per afterimage was very expensive)
        const coloredSprite = img.dashTint ? getMushroomSprite('#1fb8e0', '#7ff0ff') : getMushroomSprite('#22b844', '#88ff99');
        if (!img.facingRight) {
            ctx.translate(drawX + spriteW, drawY);
            ctx.scale(-1, 1);
            drawPixelSprite(0, 0, px, coloredSprite);
        } else {
            drawPixelSprite(drawX, drawY, px, coloredSprite);
        }
        ctx.restore();
    });
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

// === FEATURE 62: SHOOTING STARS ===
let shootingStars = [];

function spawnShootingStar() {
    const angle = (Math.random() * 0.35 + 0.05) * Math.PI; // downward arc
    const speed = 6 + Math.random() * 8;
    shootingStars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.4,
        vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
        vy: Math.sin(angle) * speed,
        life: 40 + Math.floor(Math.random() * 30),
        maxLife: 70,
        len: 20 + Math.random() * 30,
    });
}

function updateAndDrawShootingStars() {
    // Occasional spawn
    if (Math.random() < 0.008 && shootingStars.length < 4) spawnShootingStar();
    shootingStars = shootingStars.filter(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (s.life <= 0) return false;
        const alpha = Math.min(1, s.life / 15) * 0.85;
        const nx = -s.vx / Math.hypot(s.vx, s.vy);
        const ny = -s.vy / Math.hypot(s.vx, s.vy);
        const grad = ctx.createLinearGradient(s.x, s.y, s.x + nx * s.len, s.y + ny * s.len);
        grad.addColorStop(0, `rgba(255,255,220,${alpha})`);
        grad.addColorStop(1, 'rgba(255,255,220,0)');
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + nx * s.len, s.y + ny * s.len);
        ctx.stroke();
        ctx.restore();
        return true;
    });
}

// === FEATURE 60: BACKGROUND BIRDS ===
let backgroundBirds = [];

function spawnBird() {
    const dir = Math.random() > 0.5 ? 1 : -1;
    const baseY = 28 + Math.random() * 155;
    backgroundBirds.push({
        x: dir > 0 ? -50 - Math.random() * 300 : W + 50 + Math.random() * 300,
        baseY,
        y: baseY,
        vx: (0.45 + Math.random() * 0.75) * dir,
        waveT: Math.random() * Math.PI * 2,
        waveAmp: 5 + Math.random() * 9,
        waveSpeed: 0.016 + Math.random() * 0.018,
        flapTimer: Math.random() * 30,
        size: 0.55 + Math.random() * 0.55,
        dir,
    });
}

function initBirds() {
    backgroundBirds = [];
    for (let i = 0; i < 4; i++) spawnBird();
}

function updateBirds() {
    for (const b of backgroundBirds) {
        b.x += b.vx;
        b.waveT += b.waveSpeed;
        b.y = b.baseY + Math.sin(b.waveT) * b.waveAmp;
        b.flapTimer++;
    }
    // Remove birds that left the screen
    backgroundBirds = backgroundBirds.filter(b => b.x > -120 && b.x < W + 120);
    // Occasionally spawn a new bird to keep the sky lively
    if (Math.random() < 0.005 && backgroundBirds.length < 7) spawnBird();
}

function drawBird(x, y, flapTimer, size) {
    const flap = 0.35 + Math.sin(flapTimer * 0.23) * 0.5; // 0-1
    const s = size * 7;
    const wingUp = flap * s * 0.7;
    ctx.strokeStyle = 'rgba(15,30,15,0.62)';
    ctx.lineWidth = 1.4 * size;
    ctx.lineCap = 'round';

    // Left wing
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - s * 0.7, y - wingUp, x - s * 1.45, y - wingUp * 0.35);
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + s * 0.7, y - wingUp, x + s * 1.45, y - wingUp * 0.35);
    ctx.stroke();
}

// === BACKGROUND DRAWING ===
// Parallax offset based on player position
function prlx(factor) {
    if (!player) return 0;
    return (player.x - W / 2) * factor;
}

// Feature 125: background layers are baked into bitmaps once per theme; each frame only blits them
// with their parallax offsets (the full-screen gradient + shapes used to be redrawn every frame).
let bgCache = null;

function getBackgroundTheme() {
    const lvl = gameState === 'PLAYING' ? LEVELS[currentLevel] : null;
    if (lvl && lvl.lowGravity) return 'space';
    if (lvl && lvl.isMatrix) return 'matrix'; // Feature 133
    if (lvl && lvl.isStorm) return 'night'; // Feature 142: storm level uses dark sky
    if (lvl && lvl.isVolcano) return 'volcano'; // Feature 146
    if (lvl && lvl.isDawn) return 'dawn'; // Feature 172
    if (lvl && lvl.isCave) return 'cave'; // Feature 174
    if (lvl && lvl.isUnderground) return 'underground';
    if (coinCaveMode && gameState === 'PLAYING') return 'coincave';
    if (gameState === 'PLAYING' && currentLevel >= 6) return 'night';
    if (gameState === 'PLAYING' && currentLevel >= 4) return 'dusk';
    return 'day';
}

// Feature 133: Matrix rain columns
let matrixCols = [];
function initMatrixRain() {
    const spacing = 20;
    const cols = Math.floor(W / spacing);
    matrixCols = [];
    const chars = '0123456789ABCDEF@#$%&アイウエオカキクケコ';
    for (let i = 0; i < cols; i++) {
        matrixCols.push({
            x: i * spacing + 4,
            y: -Math.random() * H * 1.5,
            speed: 1.5 + Math.random() * 2.5,
            trailLen: 6 + Math.floor(Math.random() * 10),
            chars: Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]),
            tick: 0,
        });
    }
}
function updateDrawMatrixRain() {
    const fontSize = 13;
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'left';
    for (const col of matrixCols) {
        col.y += col.speed;
        col.tick++;
        if (col.y - col.trailLen * fontSize > H) {
            col.y = -fontSize;
            col.speed = 1.5 + Math.random() * 2.5;
        }
        // Occasionally randomise one char for glitch effect
        if (col.tick % 8 === 0) {
            const idx = Math.floor(Math.random() * col.chars.length);
            col.chars[idx] = '0123456789ABCDEF@#$%&アイウエオ'[Math.floor(Math.random() * 26)];
        }
        for (let i = 0; i < col.trailLen; i++) {
            const cy = Math.floor(col.y - i * fontSize);
            if (cy < -fontSize || cy > H) continue;
            const fade = Math.max(0, (col.trailLen - i) / col.trailLen);
            ctx.globalAlpha = i === 0 ? 0.95 : fade * 0.55;
            ctx.fillStyle = i === 0 ? '#bbffbb' : i < 3 ? '#00dd44' : '#006622';
            const charIdx = ((Math.floor(col.y / (fontSize + 1)) + i) % col.chars.length + col.chars.length) % col.chars.length;
            ctx.fillText(col.chars[charIdx], col.x, cy);
        }
    }
    ctx.globalAlpha = 1;
}

function paintSolidBackground(theme) {
    if (theme === 'space') {
        const spaceGrad = ctx.createLinearGradient(0, 0, 0, H);
        spaceGrad.addColorStop(0, '#000010');
        spaceGrad.addColorStop(0.6, '#050025');
        spaceGrad.addColorStop(1, '#0a0535');
        ctx.fillStyle = spaceGrad;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 80; i++) {
            const sx = (i * 137.5 + 17) % W;
            const sy = (i * 73.1 + 11) % (H * 0.85);
            ctx.globalAlpha = 0.4 + (i % 5) * 0.12;
            ctx.fillStyle = i % 5 === 0 ? '#aaddff' : i % 7 === 0 ? '#ffddaa' : '#ffffff';
            ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
        }
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(680, 80, 55, 0, Math.PI * 2);
        ctx.fillStyle = '#4466cc';
        ctx.fill();
        ctx.globalAlpha = 0.08;
        ctx.beginPath();
        ctx.arc(680, 80, 72, 0, Math.PI * 2);
        ctx.strokeStyle = '#aabbff';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(100,200,255,0.35)';
        ctx.fillText('⚠ ПОНИЖЕННАЯ ГРАВИТАЦИЯ', W / 2, 52);
        ctx.textAlign = 'left';
        const groundGrad = ctx.createLinearGradient(0, 440, 0, H);
        groundGrad.addColorStop(0, '#1a1a3a');
        groundGrad.addColorStop(1, '#0a0a20');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, 440, W, H - 440);
    } else if (theme === 'underground') {
        const caveGrad = ctx.createLinearGradient(0, 0, 0, H);
        caveGrad.addColorStop(0, '#0d0804');
        caveGrad.addColorStop(0.4, '#1a1008');
        caveGrad.addColorStop(1, '#251608');
        ctx.fillStyle = caveGrad;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) {
            const rx = (i * 197.3 + 11) % W;
            const ry = (i * 113.7 + 23) % (H * 0.85);
            ctx.globalAlpha = 0.12 + (i % 4) * 0.03;
            ctx.fillStyle = i % 4 === 0 ? '#554433' : '#443322';
            ctx.fillRect(rx, ry, i % 5 === 0 ? 4 : 2, i % 5 === 0 ? 4 : 2);
        }
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#221408';
        for (let i = 0; i < 12; i++) {
            const sx = (i * 66 + 18) % W;
            const sh = 18 + (i * 37) % 28;
            ctx.beginPath();
            ctx.moveTo(sx - 8, 0);
            ctx.lineTo(sx + 8, 0);
            ctx.lineTo(sx + (i % 2 ? 3 : -3), sh);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        const groundGrad = ctx.createLinearGradient(0, 440, 0, H);
        groundGrad.addColorStop(0, '#2a1808');
        groundGrad.addColorStop(1, '#180e04');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, 440, W, H - 440);
    } else if (theme === 'volcano') {
        // Feature 146: Volcano / Inferno level — fiery dark red/orange sky
        const volGrad = ctx.createLinearGradient(0, 0, 0, H);
        volGrad.addColorStop(0, '#1a0000');
        volGrad.addColorStop(0.35, '#3d0800');
        volGrad.addColorStop(0.7, '#6b1500');
        volGrad.addColorStop(1, '#8f2200');
        ctx.fillStyle = volGrad;
        ctx.fillRect(0, 0, W, H);
        // Ember / lava-glow dots
        for (let i = 0; i < 50; i++) {
            const ex = (i * 157.3 + 19) % W;
            const ey = (i * 89.7 + 37) % (H * 0.75);
            const bright = 0.25 + (i % 5) * 0.1;
            ctx.globalAlpha = bright;
            ctx.fillStyle = i % 4 === 0 ? '#ff8800' : i % 4 === 1 ? '#ff4400' : i % 4 === 2 ? '#ffcc00' : '#ff2200';
            ctx.fillRect(ex, ey, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
        }
        // Distant volcano silhouette
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#220000';
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(60, 240); ctx.lineTo(150, 320);
        ctx.lineTo(250, 200); ctx.lineTo(340, 310);
        ctx.lineTo(400, H); ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(400, H);
        ctx.lineTo(480, 220); ctx.lineTo(570, 300);
        ctx.lineTo(660, 185); ctx.lineTo(750, 280);
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fill();
        // Glowing lava crack near bottom
        const lavaCrackGrad = ctx.createLinearGradient(0, H - 50, 0, H);
        lavaCrackGrad.addColorStop(0, 'rgba(255,80,0,0.0)');
        lavaCrackGrad.addColorStop(1, 'rgba(255,80,0,0.35)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = lavaCrackGrad;
        ctx.fillRect(0, H - 50, W, 50);
        ctx.globalAlpha = 1;
    } else if (theme === 'coincave') {
        const caveGrad = ctx.createLinearGradient(0, 0, 0, H);
        caveGrad.addColorStop(0, '#0a0010');
        caveGrad.addColorStop(0.5, '#15003a');
        caveGrad.addColorStop(1, '#220050');
        ctx.fillStyle = caveGrad;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 25; i++) {
            ctx.globalAlpha = 0.25 + (i % 3) * 0.12;
            ctx.fillStyle = i % 3 === 0 ? '#ffd700' : i % 3 === 1 ? '#cc44ff' : '#44ffcc';
            ctx.beginPath();
            ctx.arc((i * 137.5 + 7) % W, (i * 97.3 + 31) % (H * 0.9), 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    } else if (theme === 'matrix') {
        // Feature 133: Matrix level — dark green gradient base
        const matGrad = ctx.createLinearGradient(0, 0, 0, H);
        matGrad.addColorStop(0, '#000800');
        matGrad.addColorStop(0.6, '#001400');
        matGrad.addColorStop(1, '#001e00');
        ctx.fillStyle = matGrad;
        ctx.fillRect(0, 0, W, H);
        // subtle scanlines
        for (let y = 0; y < H; y += 4) {
            ctx.globalAlpha = 0.04;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, y, W, 1);
        }
        ctx.globalAlpha = 1;
    }
}

const BG_THEMES = {
    night: { sky: ['#05051a', '#0d0d2e', '#161630'], mountain: '#1a1a3a', hillLight: '#0f2010', hillDark: '#0a150b', cloudAlpha: 0.15 },
    dusk:  { sky: ['#1a0530', '#3d1060', '#7a2060'], mountain: '#3a2060', hillLight: '#2a1a40', hillDark: '#1e1030', cloudAlpha: 0.25 },
    day:   { sky: ['#3060c0', '#5c94fc', '#88bbff'], mountain: '#4a6fa0', hillLight: '#3a7c2f', hillDark: '#2d6025', cloudAlpha: 0.85 },
    // Feature 172: Dawn — warm pink-orange gradient with golden horizon
    dawn:  { sky: ['#1a0a2a', '#a02060', '#ff8844'], mountain: '#4a2a50', hillLight: '#3a4030', hillDark: '#2a3022', cloudAlpha: 0.55 },
    // Feature 174: Cave — near-black underground with dark stone silhouettes
    cave:  { sky: ['#050205', '#100808', '#1c0e0a'], mountain: '#1a0a06', hillLight: '#2a1008', hillDark: '#18080a', cloudAlpha: 0.0 },
};
const BG_MARGIN = 80; // extra width on each side of parallax layers

function buildBackgroundCache(theme) {
    const cache = { key: theme + '@' + renderScale, theme };
    if (!BG_THEMES[theme]) {
        cache.sky = renderToBitmap(W, H, () => paintSolidBackground(theme));
        return cache;
    }
    const t = BG_THEMES[theme];
    const dark = theme !== 'day';
    cache.sky = renderToBitmap(W, H, () => {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
        skyGrad.addColorStop(0, t.sky[0]);
        skyGrad.addColorStop(0.5, t.sky[1]);
        skyGrad.addColorStop(1, t.sky[2]);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);
        if (theme === 'night') {
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 60; i++) {
                ctx.globalAlpha = 0.45 + (i % 4) * 0.15;
                ctx.beginPath();
                ctx.arc((i * 137.508 + 42) % W, (i * 97.31 + 21) % (H * 0.65), 0.5 + (i % 3) * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        if (theme === 'dawn') {
            // Feature 172: Dawn — few remaining stars + golden sun on horizon
            for (let i = 0; i < 18; i++) {
                ctx.globalAlpha = 0.28 + (i % 3) * 0.12;
                ctx.fillStyle = i % 3 === 0 ? '#ffd8aa' : '#fff0e0';
                ctx.beginPath();
                ctx.arc((i * 137.508 + 9) % W, (i * 97.31 + 7) % (H * 0.35), 0.5 + (i % 2) * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            // Rising sun glow on horizon
            const sunGrad = ctx.createRadialGradient(W * 0.55, H * 0.72, 0, W * 0.55, H * 0.72, 120);
            sunGrad.addColorStop(0, 'rgba(255, 240, 80, 0.55)');
            sunGrad.addColorStop(0.3, 'rgba(255, 140, 20, 0.35)');
            sunGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');
            ctx.fillStyle = sunGrad;
            ctx.fillRect(0, 0, W, H);
            // Sun disc peeking above horizon
            ctx.globalAlpha = 0.70;
            ctx.beginPath();
            ctx.arc(W * 0.55, H * 0.82, 34, 0, Math.PI * 2);
            const discGrad = ctx.createRadialGradient(W * 0.55, H * 0.82, 0, W * 0.55, H * 0.82, 34);
            discGrad.addColorStop(0, '#ffffc0');
            discGrad.addColorStop(0.5, '#ffcc40');
            discGrad.addColorStop(1, '#ff8800');
            ctx.fillStyle = discGrad;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (theme === 'cave') {
            // Feature 174: Cave — lava glow rising from below + stalactites from ceiling
            const lavaGlow = ctx.createLinearGradient(0, H * 0.65, 0, H);
            lavaGlow.addColorStop(0, 'rgba(255, 60, 0, 0)');
            lavaGlow.addColorStop(0.6, 'rgba(255, 80, 0, 0.2)');
            lavaGlow.addColorStop(1, 'rgba(255, 110, 0, 0.45)');
            ctx.fillStyle = lavaGlow;
            ctx.fillRect(0, 0, W, H);
            // Stalactite silhouettes hanging from ceiling
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#08030a';
            for (let i = 0; i < 9; i++) {
                const sx = (i * 95 + 22) % W;
                const sh = 28 + (i * 19) % 48;
                ctx.beginPath();
                ctx.moveTo(sx - 10, 0);
                ctx.lineTo(sx + 10, 0);
                ctx.lineTo(sx, sh);
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    });
    const layerW = W + BG_MARGIN * 2;
    cache.mountains = renderToBitmap(layerW, 240, () => {
        ctx.translate(BG_MARGIN, -230);
        ctx.fillStyle = t.mountain;
        drawMountain(80, 460, 200, 180); // (later mountains inherit the snow-cap fill — the original look)
        drawMountain(300, 460, 280, 220);
        drawMountain(580, 460, 250, 190);
        drawMountain(750, 460, 180, 160);
    });
    cache.clouds = renderToBitmap(layerW, 180, () => {
        ctx.translate(BG_MARGIN, 0);
        ctx.globalAlpha = t.cloudAlpha;
        drawCloud3D(100, 60, 60);
        drawCloud3D(350, 90, 45);
        drawCloud3D(600, 50, 55);
        drawCloud3D(750, 110, 35);
    });
    cache.hills = renderToBitmap(layerW, 140, () => {
        ctx.translate(BG_MARGIN, -340);
        drawHill3D(100, 460, 160, 80, t.hillLight, t.hillDark);
        drawHill3D(500, 460, 200, 100, t.hillLight, t.hillDark);
        drawHill3D(300, 460, 140, 60, dark ? t.hillDark : '#4a8c3f', dark ? '#0a0a18' : '#3a7c2f');
        drawHill3D(700, 460, 120, 50, dark ? t.hillDark : '#4a8c3f', dark ? '#0a0a18' : '#3a7c2f');
    });
    return cache;
}

function drawBackground() {
    const theme = getBackgroundTheme();
    if (!bgCache || bgCache.key !== theme + '@' + renderScale) bgCache = buildBackgroundCache(theme);
    ctx.drawImage(bgCache.sky, 0, 0, W, H);
    if (!bgCache.mountains) {
        // Feature 133: Matrix rain — drawn live (not cached)
        if (theme === 'matrix') {
            if (matrixCols.length === 0) initMatrixRain();
            updateDrawMatrixRain();
        }
        return;
    }

    // Feature 62: Shooting stars on night levels
    if (theme === 'night') updateAndDrawShootingStars();

    const layerW = W + BG_MARGIN * 2;
    // Snap offsets to whole device pixels: a sub-pixel blit takes a ~10x slower resampling path
    const snap = v => Math.round(v * renderScale) / renderScale;
    ctx.drawImage(bgCache.mountains, snap(prlx(-0.04)) - BG_MARGIN, 230, layerW, 240);
    ctx.drawImage(bgCache.clouds, snap(prlx(-0.08)) - BG_MARGIN, 0, layerW, 180);

    // Feature 60: Background birds (day levels only)
    if (gameState === 'PLAYING' && currentLevel < 4 && backgroundBirds.length) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        for (const b of backgroundBirds) {
            drawBird(b.x, b.y, b.flapTimer, b.size);
        }
        ctx.restore();
    }

    ctx.drawImage(bgCache.hills, snap(prlx(-0.14)) - BG_MARGIN, 340, layerW, 140);
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
    // Feature 120: translucent top strip keeps the score row readable over any background
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, W, 40);
    ctx.font = 'bold 16px monospace';

    // Score (animated display)
    const scoreShown = Math.floor(hudScoreDisplay);
    ctx.fillStyle = C.textShadow;
    ctx.fillText(`СЧЁТ: ${scoreShown}`, 16, 27);
    ctx.fillStyle = C.hud;
    ctx.fillText(`СЧЁТ: ${scoreShown}`, 14, 25);

    // Lives — heart icons (shop and Ultra Mode can push lives above the starting count)
    const heartSlots = Math.max(3, Math.min(player.lives, 9));
    for (let i = 0; i < heartSlots; i++) {
        ctx.font = '20px monospace';
        ctx.fillStyle = i < player.lives ? '#ff3333' : 'rgba(120,40,40,0.45)';
        ctx.fillText('♥', 20 + i * 22, 57);
    }

    // Feature 101: Spore ammo display
    for (let i = 0; i < 3; i++) {
        ctx.font = '14px monospace';
        ctx.fillStyle = i < player.sporeAmmo ? '#55dd33' : 'rgba(40,80,20,0.38)';
        ctx.fillText('🍄', 20 + i * 19, 79);
    }
    if (player.sporeAmmo < 3 && player.sporeAmmoTimer > 0) {
        const pct = 1 - player.sporeAmmoTimer / SPORE_REGEN_TIME;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(20, 82, 52, 4);
        ctx.fillStyle = '#55dd33';
        ctx.fillRect(20, 82, Math.round(52 * pct), 4);
    }

    // Feature 105: Flashlight timer bar (bottom-left, if active)
    if (player.flashlightTimer > 0) {
        const pct = player.flashlightTimer / 1200;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(20, 88, 52, 4);
        ctx.fillStyle = '#ffdd44';
        ctx.fillRect(20, 88, Math.round(52 * pct), 4);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#ffdd88';
        ctx.fillText('🔦', 20, 100);
    }

    // Level
    const lvlText = `УР. ${currentLevel + 1}`;
    ctx.fillStyle = C.textShadow;
    ctx.fillText(lvlText, W - 232, 27);
    ctx.fillStyle = C.hud;
    ctx.fillText(lvlText, W - 234, 25);

    // Timer
    const secs = Math.floor(levelTimer / 60);
    const timerColor = secs >= 50 ? '#ff4444' : secs >= 35 ? '#ffaa00' : '#ffffff';
    ctx.fillStyle = C.textShadow;
    ctx.fillText(`⏱ ${secs}s`, W - 132, 27);
    ctx.fillStyle = timerColor;
    ctx.fillText(`⏱ ${secs}s`, W - 134, 25);

    // Feature 122: pause button (tap/click) — the only way to pause on a phone
    uiButtons.push({ x: W - 52, y: 0, w: 52, h: 44, action: () => { if (gameState === 'PLAYING') gameState = 'PAUSED'; } });
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.roundRect(W - 44, 5, 34, 30, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W - 34, 12, 5, 16);
    ctx.fillRect(W - 25, 12, 5, 16);
    ctx.restore();

    // Feature 96: Speed Run Mode — live timer with PB delta
    if (speedRunMode) {
        const curSecs = levelTimer / 60;
        const totalSecs = speedRunTotalTime + curSecs;
        const m = Math.floor(totalSecs / 60);
        const s = Math.floor(totalSecs % 60);
        const ms = Math.floor((totalSecs % 1) * 100);
        const timeStr = `⏱ ${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(2,'0')}`;
        const pb = levelBestTimes[currentLevel];
        let deltaStr = '';
        let deltaColor = '#aaffaa';
        if (pb != null) {
            const delta = curSecs - pb;
            const sign = delta < 0 ? '-' : '+';
            const abs = Math.abs(delta).toFixed(1);
            deltaStr = ` (${sign}${abs}s)`;
            deltaColor = delta < 0 ? '#44ff88' : '#ff6644';
        }
        ctx.save();
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(W / 2 - 105, 63, 210, 20);
        ctx.fillStyle = '#ffffaa';
        ctx.fillText(timeStr, W / 2, 78);
        if (deltaStr) {
            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = deltaColor;
            ctx.fillText(deltaStr, W / 2 + 75, 78);
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // High score / Endless cycle indicator
    if (endlessMode) {
        const cycleStr = `♾️ ЦИКЛ ${endlessCycle + 1}`;
        ctx.fillStyle = C.textShadow;
        ctx.fillText(cycleStr, W / 2 - 48, 27);
        ctx.fillStyle = '#aaffcc';
        ctx.fillText(cycleStr, W / 2 - 50, 25);
    } else if (highScore > 0) {
        ctx.fillStyle = C.textShadow;
        ctx.fillText(`🏆 ${highScore}`, W / 2 - 38, 27);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`🏆 ${highScore}`, W / 2 - 40, 25);
    }

    // Combo indicator (Feature 47: large animated combo display)
    if (comboCount >= 2 && comboDisplayTimer > 0) {
        const alpha = Math.min(1, comboDisplayTimer / 20);
        // Pulsing scale: bursts big at start, then steady pulse
        const burstScale = comboDisplayTimer > 80 ? 1 + (100 - comboDisplayTimer) * 0.02 : 1;
        const pulse = burstScale * (1 + Math.sin(comboDisplayTimer * 0.25) * 0.07);
        const comboColors = ['', '', '#ffff00', '#ffaa00', '#ff6600', '#ff2200', '#ff00ff'];
        const color = comboColors[Math.min(comboCount, 6)] || '#ff00ff';
        const fontSize = Math.round(40 * pulse);
        ctx.save();
        ctx.globalAlpha = alpha;
        // Glow halo behind text
        ctx.beginPath();
        ctx.arc(W / 2, H / 2 - 55, 70 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = color.replace('#', 'rgba(').replace(/(..)(..)(..)/, (m, r, g, b) =>
            `${parseInt(r,16)}, ${parseInt(g,16)}, ${parseInt(b,16)}, 0.18)`);
        ctx.fill();
        // Text shadow
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(`COMBO x${comboCount}!`, W / 2 + 3, H / 2 - 48);
        // Main text
        ctx.fillStyle = color;
        ctx.fillText(`COMBO x${comboCount}!`, W / 2, H / 2 - 51);
        // Underline sparkle dots
        if (comboCount >= 3) {
            const dotCount = Math.min(comboCount, 7);
            for (let i = 0; i < dotCount; i++) {
                const dx = (i - (dotCount - 1) / 2) * 16;
                const dy = 10 + Math.sin(comboDisplayTimer * 0.2 + i) * 3;
                ctx.beginPath();
                ctx.arc(W / 2 + dx, H / 2 - 28 + dy, 4, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Star power-up timer bar
    if (player && player.starTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68;
        const frac = player.starTimer / STAR_DURATION;
        const hue = (player.starTimer * 6) % 360;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('⭐ ЗВЕЗДА', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Speed boost timer bar
    if (player && player.speedBoostTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68 + (player.starTimer > 0 ? 18 : 0);
        const frac = player.speedBoostTimer / SPEED_BOOST_DURATION;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = '#00cc44';
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('⚡ УСКОР.', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Magnet timer bar
    if (player && player.magnetTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68 + (player.starTimer > 0 ? 18 : 0) + (player.speedBoostTimer > 0 ? 18 : 0);
        const frac = player.magnetTimer / MAGNET_DURATION;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = '#cc00aa';
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('🧲 МАГНИТ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Ghost timer bar (Feature 54)
    if (player && player.ghostTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0);
        const frac = player.ghostTimer / GHOST_DURATION;
        const hue = 270 + Math.sin(Date.now() * 0.004) * 30;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `hsl(${hue}, 80%, 65%)`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('👻 ПРИЗРАК', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Freeze timer bar
    if (player && player.freezeTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0);
        const frac = player.freezeTimer / FREEZE_DURATION;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `hsl(${190 + Math.sin(Date.now() * 0.005) * 15}, 90%, 60%)`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('❄ ЗАМОРОЗКА', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 61: Score boost timer bar
    if (player && player.scoreBoostTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0);
        const frac = player.scoreBoostTimer / SCORE_BOOST_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.007) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(160,40,240,${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ee88ff';
        ctx.fillText('✨ x2 ОЧКИ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 72: Electro timer bar
    if (player && player.electroTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0);
        const frac = player.electroTimer / ELECTRO_DURATION;
        const pulse = 0.8 + Math.sin(Date.now() * 0.015) * 0.2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(50,220,255,${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffff88';
        ctx.fillText('⚡ ЭЛЕКТРО', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 75: Slow-Mo timer bar
    if (player && player.slowMoTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0);
        const frac = player.slowMoTimer / SLOW_MO_DURATION;
        const pulse = 0.8 + Math.sin(Date.now() * 0.010) * 0.2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(0,180,255,${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#aaeeff';
        ctx.fillText('⏱ ЗАМЕДЛЕНИЕ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 80: Rocket timer bar
    if (player && player.rocketTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0);
        const frac = player.rocketTimer / ROCKET_DURATION;
        const pulse = 0.8 + Math.sin(Date.now() * 0.02) * 0.2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(255,${Math.round(80 + 80 * pulse)},0,${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffcc88';
        ctx.fillText('🚀 РАКЕТА', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 85: MagBoots timer bar
    if (player && player.magBootsTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0);
        const frac = player.magBootsTimer / MAG_BOOTS_DURATION;
        const pulse = 0.8 + Math.sin(Date.now() * 0.014) * 0.2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = player.ceilingLocked ? `rgba(0,255,136,${pulse})` : `rgba(30,100,255,${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = player.ceilingLocked ? '#aaffcc' : '#aaddff';
        ctx.fillText(player.ceilingLocked ? '🦶 ПОТОЛОК!' : '🦶 МАГЛАПТИ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 87: Giant Mode timer bar
    if (player && player.giantTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0);
        const frac = player.giantTimer / GIANT_DURATION;
        const pulse = 0.8 + Math.sin(Date.now() * 0.014) * 0.2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(255,${Math.round(80 + 80 * pulse)},0,${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffaa66';
        ctx.fillText('🔴 ГИГАНТ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 99: Jetpack timer bar
    if (player && player.jetpackTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0);
        const frac = player.jetpackTimer / JETPACK_DURATION;
        const thrustColor = player.jetpackThrust ? `rgba(255,180,0,0.9)` : `rgba(200,100,0,0.75)`;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = thrustColor;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffcc88';
        ctx.fillText(player.jetpackThrust ? '🛸 ДЖЕТПАК ▲' : '🛸 ДЖЕТПАК', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 145: Bubble Shield timer bar
    if (player && player.bubbleTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0)
            + (player.jetpackTimer > 0 ? 18 : 0);
        const frac = player.bubbleTimer / BUBBLE_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.01) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(100, 210, 255, ${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ccf0ff';
        ctx.fillText('🫧 ПУЗЫРЬ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 148: Jump Boost timer bar
    if (player && player.jumpBoostTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0)
            + (player.jetpackTimer > 0 ? 18 : 0)
            + (player.bubbleTimer > 0 ? 18 : 0);
        const frac = player.jumpBoostTimer / JUMP_BOOST_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.011) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(255, 220, 50, ${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff099';
        ctx.fillText('↑ ПРЫЖОК x1.6', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 161: Companion Drone timer bar
    if (player && player.droneTimer > 0) {
        const barW = 140, barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0)
            + (player.jetpackTimer > 0 ? 18 : 0)
            + (player.bubbleTimer > 0 ? 18 : 0)
            + (player.jumpBoostTimer > 0 ? 18 : 0);
        const frac = player.droneTimer / DRONE_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.012) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(255, 150, 50, ${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffcc88';
        ctx.fillText('🤖 ДРОН', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 163: Spike Boots timer bar
    if (player && player.spikeBootsTimer > 0) {
        const barW = 140, barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0)
            + (player.jetpackTimer > 0 ? 18 : 0)
            + (player.bubbleTimer > 0 ? 18 : 0)
            + (player.jumpBoostTimer > 0 ? 18 : 0)
            + (player.droneTimer > 0 ? 18 : 0);
        const frac = player.spikeBootsTimer / SPIKE_BOOTS_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.013) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(255, 80, 0, ${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff9966';
        ctx.fillText('🥾 ЦЕПНОЙ СТОМП', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 169: Vortex Coin timer bar
    if (player && player.vortexCoinTimer > 0) {
        const barW = 140, barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0)
            + (player.jetpackTimer > 0 ? 18 : 0)
            + (player.bubbleTimer > 0 ? 18 : 0)
            + (player.jumpBoostTimer > 0 ? 18 : 0)
            + (player.droneTimer > 0 ? 18 : 0)
            + (player.spikeBootsTimer > 0 ? 18 : 0);
        const frac = player.vortexCoinTimer / VORTEX_COIN_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.014) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(0, 210, 255, ${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#88ffff';
        ctx.fillText('🌀 ВИХРЬ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 171: Reflect Shield timer bar
    if (player && player.reflectTimer > 0) {
        const barW = 140, barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0)
            + (player.jetpackTimer > 0 ? 18 : 0)
            + (player.bubbleTimer > 0 ? 18 : 0)
            + (player.jumpBoostTimer > 0 ? 18 : 0)
            + (player.droneTimer > 0 ? 18 : 0)
            + (player.spikeBootsTimer > 0 ? 18 : 0)
            + (player.vortexCoinTimer > 0 ? 18 : 0);
        const frac = player.reflectTimer / REFLECT_SHIELD_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.015) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(255, 180, 40, ${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffeeaa';
        ctx.fillText('🪃 ОТРАЖЕНИЕ', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 173: Earthquake Stomp timer bar
    if (player && player.quakeTimer > 0) {
        const barW = 140, barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0)
            + (player.ghostTimer > 0 ? 18 : 0)
            + (player.freezeTimer > 0 ? 18 : 0)
            + (player.scoreBoostTimer > 0 ? 18 : 0)
            + (player.electroTimer > 0 ? 18 : 0)
            + (player.slowMoTimer > 0 ? 18 : 0)
            + (player.rocketTimer > 0 ? 18 : 0)
            + (player.magBootsTimer > 0 ? 18 : 0)
            + (player.giantTimer > 0 ? 18 : 0)
            + (player.jetpackTimer > 0 ? 18 : 0)
            + (player.bubbleTimer > 0 ? 18 : 0)
            + (player.jumpBoostTimer > 0 ? 18 : 0)
            + (player.droneTimer > 0 ? 18 : 0)
            + (player.spikeBootsTimer > 0 ? 18 : 0)
            + (player.vortexCoinTimer > 0 ? 18 : 0)
            + (player.reflectTimer > 0 ? 18 : 0);
        const frac = player.quakeTimer / QUAKE_DURATION;
        const pulse = 0.85 + Math.sin(Date.now() * 0.016) * 0.15;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = `rgba(255, 120, 0, ${pulse})`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffcc88';
        ctx.fillText('🌋 ЗЕМЛЕТРЯС', W / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 81: Mirror mode HUD indicator
    if (mirrorMode) {
        ctx.save();
        const pulse = 0.75 + Math.abs(Math.sin(Date.now() * 0.003)) * 0.25;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText('🪞 ЗЕРКАЛО', W / 2 + 1, 71);
        ctx.fillStyle = '#aaeeff';
        ctx.fillText('🪞 ЗЕРКАЛО', W / 2, 70);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 141: Wind indicator in HUD
    if (windActive && Math.abs(windForce) > 0.3) {
        const dir = windForce > 0 ? '→' : '←';
        const strength = Math.abs(windForce) > 1.5 ? '💨💨' : '💨';
        ctx.save();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillText(`${strength} ВЕТЕР ${dir}`, W / 2 + 1, 87);
        ctx.fillStyle = '#aaddff';
        ctx.fillText(`${strength} ВЕТЕР ${dir}`, W / 2, 86);
        ctx.restore();
    }

    // Feature 82: Coin Cave HUD — big countdown + coin counter instead of normal timer
    if (coinCaveMode) {
        const secsLeft = Math.ceil(coinCaveCountdown / 60);
        const isUrgent = secsLeft <= 10;
        const timerColor = secsLeft <= 5 ? '#ff2222' : secsLeft <= 10 ? '#ffaa00' : '#ffee44';
        const pulse = isUrgent ? 1 + Math.abs(Math.sin(Date.now() * 0.012)) * 0.15 : 1;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(28 * pulse)}px monospace`;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(`⏱ ${secsLeft}с`, W / 2 + 2, H / 2 - 188);
        ctx.fillStyle = timerColor;
        ctx.fillText(`⏱ ${secsLeft}с`, W / 2, H / 2 - 190);
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`🪙 ${levelCoinsCollected} монет`, W / 2, H / 2 - 162);
        if (coinCaveBestCoins > 0) {
            ctx.font = '11px monospace';
            ctx.fillStyle = 'rgba(255,220,100,0.7)';
            ctx.fillText(`РЕКОРД: ${coinCaveBestCoins}`, W / 2, H / 2 - 147);
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Boss HP bar at top center (when in boss level)
    if (isBossLevel && bossMarco && bossMarco.isAlive) {
        const bw = 320;
        const bh = 18;
        const bx = W / 2 - bw / 2;
        const by = 6;
        const frac = bossMarco.hp / bossMarco.maxHp;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 5);
        ctx.fill();
        ctx.fillStyle = bossMarco.hp <= 2 ? '#ff3300' : '#cc0000';
        ctx.fillRect(bx, by, bw * frac, bh);
        // Bright stripe on HP bar
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ff8888';
        ctx.fillRect(bx, by, bw * frac, bh * 0.4);
        ctx.globalAlpha = 1;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(`👑 МАРИО БОСС  ❤ ${bossMarco.hp}/${bossMarco.maxHp}`, W / 2, by + 13);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Enemy counter (bottom-left area)
    if (levelTotalMarios > 0 && !isBossLevel) {
        const aliveCount = marios.filter(m => m.isAlive).length;
        const isLast = aliveCount === 1;
        const enemyColor = rageModeActive ? '#ff2200' : (isLast ? '#ff4444' : '#ffffff');
        const pulse = (isLast || rageModeActive) ? 1 + Math.sin(Date.now() * 0.008) * 0.12 : 1;
        ctx.save();
        ctx.font = `bold ${Math.round(13 * pulse)}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(`ВРАГИ: ${aliveCount}/${levelTotalMarios}`, 22, H - 15);
        ctx.fillStyle = enemyColor;
        ctx.fillText(`ВРАГИ: ${aliveCount}/${levelTotalMarios}`, 20, H - 17);
        ctx.restore();
    }

    // Feature 69: Rage Mode warning text
    if (rageModeWarningTimer > 0) {
        const alpha = Math.min(1, rageModeWarningTimer / 30);
        const scale = 1 + Math.sin(rageModeWarningTimer * 0.15) * 0.06;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(28 * scale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText('🔥 ЯРОСТЬ!', W / 2 + 2, H / 2 - 98);
        ctx.fillStyle = '#ff3300';
        ctx.fillText('🔥 ЯРОСТЬ!', W / 2, H / 2 - 100);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 151: Last Enemy banner
    if (lastEnemyBannerTimer > 0) {
        const alpha = Math.min(1, lastEnemyBannerTimer / 30) * (lastEnemyBannerTimer > 120 ? 1 : lastEnemyBannerTimer / 120);
        const scale = 1 + Math.sin(lastEnemyBannerTimer * 0.18) * 0.05;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(24 * scale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText('⚔ ПОСЛЕДНИЙ ВРАГ!', W / 2 + 2, H / 2 - 78);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('⚔ ПОСЛЕДНИЙ ВРАГ!', W / 2, H / 2 - 80);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 73: Coin Frenzy indicator
    if (coinFrenzyTimer > 0) {
        const frenzyAlpha = Math.min(1, coinFrenzyTimer / 30);
        const frenzySecs = Math.ceil(coinFrenzyTimer / 60);
        const frenzyPulse = 1 + Math.sin(Date.now() * 0.015) * 0.08;
        ctx.save();
        ctx.globalAlpha = frenzyAlpha;
        ctx.font = `bold ${Math.round(20 * frenzyPulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(`💰 ЛИХОРАДКА! x3 (${frenzySecs}с)`, W / 2 + 2, H / 2 - 122);
        ctx.fillStyle = '#ffdd00';
        ctx.fillText(`💰 ЛИХОРАДКА! x3 (${frenzySecs}с)`, W / 2, H / 2 - 124);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 68: Survival Mode timer and wave info
    if (survivalMode) {
        const survivedSecs = Math.floor(survivalTimer / 60);
        ctx.save();
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#000';
        ctx.fillText(`⏱ ${survivedSecs}с`, W / 2 - 28, 57);
        ctx.fillStyle = '#ffaa00';
        ctx.fillText(`⏱ ${survivedSecs}с`, W / 2 - 30, 55);
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ffcc66';
        ctx.textAlign = 'center';
        ctx.fillText(`ВОЛНА ${survivalWave + 1}  РЕКОРД: ${survivalBestTime}с`, W / 2, 75);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 127: Marathon mode indicator in HUD
    if (marathonMode) {
        ctx.save();
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(`🏃 МАРАФОН ${marathonLevelIdx + 1}/${MARATHON_LEVELS.length}`, W / 2 + 1, 58);
        ctx.fillStyle = '#ffbb33';
        ctx.fillText(`🏃 МАРАФОН ${marathonLevelIdx + 1}/${MARATHON_LEVELS.length}`, W / 2, 56);
        if (marathonBestScore > 0) {
            ctx.font = '11px monospace';
            ctx.fillStyle = '#ccaa66';
            ctx.fillText(`РЕКОРД МАРАФОНА: ${marathonBestScore}`, W / 2, 73);
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 128: New record flash — golden banner during gameplay
    if (newRecordFlashTimer > 0) {
        newRecordFlashTimer--;
        const alpha = Math.min(1, newRecordFlashTimer / 30) * Math.min(1, (200 - newRecordFlashTimer + 1) / 30);
        const pulse = 1 + Math.sin(Date.now() * 0.012) * 0.06;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(26 * pulse)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 18;
        ctx.fillText('🏆 НОВЫЙ РЕКОРД!', W / 2 + 1, H / 2 + 1);
        ctx.fillStyle = '#ffd700';
        ctx.fillText('🏆 НОВЫЙ РЕКОРД!', W / 2, H / 2);
        ctx.restore();
    }

    // Feature 98: Challenge Card — shown for first 3 seconds of each level
    if (challengeCardTimer > 0) {
        challengeCardTimer--;
        const fadeIn  = Math.min(1, (CHALLENGE_CARD_DURATION - challengeCardTimer) / 20);
        const fadeOut = Math.min(1, challengeCardTimer / 20);
        const alpha = Math.min(fadeIn, fadeOut);
        const ch = getChallengeForLevel(currentChallengeIdx);
        const done = !!challengeCompleted[`${currentLevel}_${ch.id}`];
        ctx.save();
        ctx.globalAlpha = alpha;
        // Card background
        ctx.fillStyle = done ? 'rgba(20,80,30,0.92)' : 'rgba(20,30,70,0.92)';
        ctx.beginPath();
        ctx.roundRect(W / 2 - 150, H / 2 - 42, 300, 68, 12);
        ctx.fill();
        ctx.strokeStyle = done ? '#44ff88' : '#8899ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 150, H / 2 - 42, 300, 68, 12);
        ctx.stroke();
        // Title
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = done ? '#aaffaa' : '#aabbff';
        ctx.fillText('🎯 ЗАДАНИЕ УРОВНЯ', W / 2, H / 2 - 24);
        // Challenge text
        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = done ? '#ccffcc' : '#ffffff';
        ctx.fillText(ch.desc, W / 2, H / 2 - 4);
        // Status
        ctx.font = '11px monospace';
        ctx.fillStyle = done ? '#44ff88' : '#ffcc44';
        ctx.fillText(done ? '✓ Выполнено! +500 очков в прошлый раз' : 'Выполни для +500 очков!', W / 2, H / 2 + 16);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 86: Daily Challenge indicator
    if (dailyChallengeMode) {
        ctx.save();
        const pulse = 0.7 + Math.abs(Math.sin(Date.now() * 0.004)) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText('📅 ИСПЫТАНИЕ ДНЯ', W / 2 + 1, 89);
        ctx.fillStyle = '#ffcc44';
        ctx.fillText('📅 ИСПЫТАНИЕ ДНЯ', W / 2, 88);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 83: Kill Streak indicator (bottom-right, above mini-map area)
    if (killStreakCount >= 2) {
        const streakX = W - 80;
        const streakY = H - 70;
        const fadeFrames = KILL_STREAK_WINDOW;
        const freshness = 1 - Math.max(0, killStreakTimer - fadeFrames * 0.6) / (fadeFrames * 0.4);
        const alpha = Math.min(1, freshness + 0.35);
        const color = killStreakCount >= 8 ? '#ffd700' : killStreakCount >= 5 ? '#ff4400' : '#ff8800';
        const pulse = 1 + Math.sin(Date.now() * 0.012) * 0.07;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(13 * pulse)}px monospace`;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(killStreakCount >= 8 ? '🌟' : killStreakCount >= 5 ? '💥' : '🔥', streakX + 1, streakY - 11);
        ctx.fillStyle = color;
        ctx.fillText(killStreakCount >= 8 ? '🌟' : killStreakCount >= 5 ? '💥' : '🔥', streakX, streakY - 12);
        ctx.font = `bold ${Math.round(11 * pulse)}px monospace`;
        ctx.fillStyle = color;
        ctx.fillText(`СТРИК x${killStreakCount}`, streakX, streakY);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 65 & 70: Dash indicator in HUD (above enemy counter)
    if (player) {
        const dashReady = player.dashCooldown <= 0;
        const dashX = 140; const dashY = H - 30;
        ctx.save();
        ctx.globalAlpha = dashReady ? 1 : 0.55;
        ctx.fillStyle = dashReady ? '#44aaff' : '#223344';
        ctx.beginPath();
        ctx.roundRect(dashX, dashY, 52, 18, 4);
        ctx.fill();
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = dashReady ? '#ffffff' : '#8899aa';
        ctx.fillText('⚡ DASH', dashX + 26, dashY + 13);
        if (!dashReady) {
            // Cooldown arc
            const cdFrac = 1 - player.dashCooldown / 90;
            ctx.strokeStyle = '#44aaff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(dashX + 38, dashY + 9, 7, -Math.PI / 2, -Math.PI / 2 + cdFrac * Math.PI * 2);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 144: Roll Dodge cooldown indicator
    if (player) {
        const rollReady = player.rollCooldown <= 0;
        const rollX = 200; const rollY = H - 30;
        ctx.save();
        ctx.globalAlpha = rollReady ? 0.9 : 0.45;
        ctx.fillStyle = rollReady ? '#88ddff' : '#112233';
        ctx.beginPath();
        ctx.roundRect(rollX, rollY, 52, 18, 4);
        ctx.fill();
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = rollReady ? '#ffffff' : '#556677';
        ctx.fillText('💨 ROLL', rollX + 26, rollY + 13);
        if (!rollReady) {
            const cdFrac = 1 - player.rollCooldown / 180;
            ctx.strokeStyle = '#88ddff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(rollX + 40, rollY + 9, 7, -Math.PI / 2, -Math.PI / 2 + cdFrac * Math.PI * 2);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Mute icon (bottom-right, clickable area)
    uiButtons.push({ x: W - 50, y: H - 36, w: 50, h: 36, action: () => setMuted(!soundMuted) });
    ctx.save();
    ctx.font = '18px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = soundMuted ? 'rgba(255,80,80,0.85)' : 'rgba(255,255,255,0.7)';
    ctx.fillText(soundMuted ? '🔇' : '🔊', W - 10, H - 10);
    // Feature 97: Colorblind mode indicator
    if (colorblindMode) {
        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(0,220,255,0.85)';
        ctx.fillText('👁CB', W - 10, H - 26);
    }
    ctx.textAlign = 'left';
    ctx.restore();

    // Feature 57: Pulsing red border when last life
    if (player && player.lives === 1) {
        const pulse = 0.4 + Math.abs(Math.sin(Date.now() * 0.004)) * 0.55;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(2, 2, W - 4, H - 4);
        // Inner vignette glow
        const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
        grad.addColorStop(0, 'rgba(255,0,0,0)');
        grad.addColorStop(1, `rgba(180,0,0,${pulse * 0.22})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    // Feature 156: Enemy Progress Bar — thin bar at top showing how many enemies remain
    if (!survivalMode && !coinCaveMode && levelTotalMarios > 0) {
        const alive = marios.filter(m => m.isAlive).length;
        const frac = Math.max(0, 1 - alive / levelTotalMarios);
        const barW = W - 8;
        const barH = 3;
        const barX = 4;
        const barY = 0;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(barX, barY, barW, barH);
        const col = frac >= 1 ? '#55ff55' : frac > 0.5 ? '#ffcc00' : '#ff6622';
        ctx.fillStyle = col;
        ctx.fillRect(barX, barY, barW * frac, barH);
        ctx.restore();
    }

    // Jump state indicator (double jump or wall jump)
    if (player && !player.isGrounded) {
        ctx.save();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        if (player.wallSlideDir !== 0 && player.wallJumpLockTimer <= 0) {
            ctx.fillStyle = 'rgba(255,220,80,0.92)';
            ctx.fillText('↑ ПРЫЖОК ОТ СТЕНЫ!', W / 2, H - 15);
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Feature 160: Kill Feed panel (upper-right corner)
    renderKillFeed();
}

// === SCREEN RENDERS ===
function drawTitle(text, y, size, color) {
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.textShadow;
    const sh = Math.max(1, Math.round(size / 12)); // shadow offset scales with text size
    ctx.fillText(text, W / 2 + sh, y + sh);
    ctx.fillStyle = color || C.text;
    ctx.fillText(text, W / 2, y);
    ctx.textAlign = 'left';
}

// Feature 122: rounded canvas button that also registers a tap/click hotspot
function uiButton(x, y, w, h, label, action, opts = {}) {
    uiButtons.push({ x, y, w, h, action });
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, w, h, 10);
    ctx.fill();
    ctx.fillStyle = opts.color || 'rgba(35,55,110,0.88)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(160,190,255,0.55)';
    ctx.lineWidth = opts.active ? 3 : 1.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${opts.size || 15}px monospace`;
    ctx.fillStyle = opts.textColor || '#ffffff';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    if (opts.hint) {
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'right';
        ctx.fillText(opts.hint, x + w - 6, y + h - 8);
    }
    ctx.restore();
}

// Feature 86: Daily Challenge preview screen
function renderDailyChallenge() {
    drawBackground();
    const levelNames = LEVEL_NAMES;
    const lvlName = levelNames[dailyChallengeLevelIdx] || `Уровень ${dailyChallengeLevelIdx + 1}`;
    const dateStr = dailyChallengeDate;

    drawTitle('📅 ИСПЫТАНИЕ ДНЯ', 130, 30, '#ffcc44');
    drawTitle(dateStr, 168, 14, '#888888');

    // Level display
    const cx = W / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(80,60,120,0.7)';
    ctx.beginPath();
    ctx.roundRect(cx - 160, 190, 320, 60, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('УРОВЕНЬ', cx, 214);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lvlName, cx, 238);
    ctx.restore();

    // Modifiers
    drawTitle('МОДИФИКАТОРЫ:', 278, 14, '#ffaa44');
    dailyChallengeModifiers.forEach((mod, i) => {
        const label = MOD_LABELS[mod] || mod;
        const colors = { mirror: '#44eeff', fast_enemies: '#ff6600', no_shield: '#ff4444', no_star: '#ff8800', x2_score: '#cc44ff' };
        drawTitle(label, 300 + i * 24, 16, colors[mod] || '#ffffff');
    });

    // Best score today
    if (dailyChallengeBestDate === dateStr && dailyChallengeBest > 0) {
        drawTitle(`Лучший результат сегодня: ${dailyChallengeBest}`, 400, 14, '#ffcc44');
    }

    uiButton(20, H - 58, 150, 42, '← Назад', () => pressKey('Escape'), { hint: 'ESC' });
    uiButton(W - 220, H - 62, 200, 48, '▶ НАЧАТЬ', () => pressKey('Enter'),
        { color: 'rgba(40,150,60,0.92)', border: '#88ff99', size: 18, hint: 'ENTER' });
}

// Feature 93: Animated menu background — floating coins and stars
const menuDecor = Array.from({ length: 18 }, (_, i) => ({
    x: Math.random() * 800,
    y: Math.random() * 500,
    vy: -(0.3 + Math.random() * 0.6),
    vx: (Math.random() - 0.5) * 0.4,
    r: 4 + Math.random() * 7,
    phase: Math.random() * Math.PI * 2,
    type: i < 12 ? 'coin' : 'star', // 12 coins, 6 stars
    alpha: 0.15 + Math.random() * 0.25,
}));

function updateRenderMenuDecor() {
    const t = Date.now() * 0.001;
    for (const d of menuDecor) {
        d.x += d.vx + Math.sin(t * 0.5 + d.phase) * 0.2;
        d.y += d.vy;
        if (d.y < -20) { d.y = H + 10; d.x = Math.random() * W; }
        if (d.x < -20) d.x = W + 10;
        if (d.x > W + 20) d.x = -10;

        const pulse = d.alpha * (0.7 + Math.sin(t * 1.2 + d.phase) * 0.3);
        ctx.save();
        ctx.globalAlpha = pulse;
        if (d.type === 'coin') {
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fillStyle = '#ffcc00';
            ctx.fill();
            ctx.strokeStyle = '#e6a800';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.font = `bold ${Math.round(d.r * 1.1)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#b8860b';
            ctx.fillText('$', d.x, d.y + d.r * 0.4);
        } else {
            // Star shape
            ctx.beginPath();
            for (let k = 0; k < 10; k++) {
                const angle = (Math.PI / 5) * k - Math.PI / 2;
                const r = k % 2 === 0 ? d.r : d.r * 0.45;
                const px = d.x + Math.cos(angle) * r;
                const py = d.y + Math.sin(angle) * r;
                k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = '#ffffaa';
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

function renderMenu() {
    drawBackground();
    updateRenderMenuDecor(); // Feature 93: animated floating coins & stars

    drawTitle("MUSHROOM'S REVENGE", 82, 40, '#ff4444');
    drawTitle("Прыгай на Марио!", 114, 18, '#ffcc00');

    // Big mushroom in the player's chosen colour
    const mcols = getMushroomColors();
    const sprite = getMushroomSprite(mcols.cap, mcols.capLight);
    const bob = Math.sin(Date.now() * 0.004) * 4;
    drawPixelSprite(W / 2 - 35, 128 + bob, 5, sprite);

    // Feature 110: Prestige title display on menu
    const prestige = getPrestigeTitle();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = prestige.color;
    ctx.shadowColor = prestige.color;
    ctx.shadowBlur = 8;
    ctx.fillText(prestige.title, W / 2, 222);
    ctx.restore();

    // Feature 122: tappable menu — every mode is reachable without a keyboard
    uiButton(W / 2 - 140, 236, 280, 54, '▶  ИГРАТЬ', () => { initAudio(); goFullscreen(); gameState = 'DIFFICULTY_SELECT'; },
        { color: 'rgba(40,150,60,0.92)', border: '#88ff99', size: 22, hint: 'ENTER' });
    const modes = [
        ['🏟 Выживание', 'KeyS', 'S'], ['📅 Испытание', 'KeyD', 'D'], ['⏱ Спидран', 'KeyR', 'R'],
        ['♾️ Бесконечный', 'KeyE', 'E'], ['🏆 Достижения', 'KeyA', 'A'], ['📊 Статистика', 'KeyT', 'T'],
        ['🏃 Марафон', 'KeyQ', 'Q'],
    ];
    const bw = 196, bh = 42, gap = 12;
    const x0 = W / 2 - (bw * 3 + gap * 2) / 2;
    modes.forEach(([label, key, hint], i) => {
        const col = i % 3, row = Math.floor(i / 3);
        uiButton(x0 + col * (bw + gap), 300 + row * (bh + gap), bw, bh, label, () => pressKey(key), { size: 14, hint });
    });

    // Feature 123: install as an app (Chrome/Android/desktop offer this via beforeinstallprompt)
    if (installPrompt) {
        uiButton(W - 176, 12, 164, 36, '📲 Установить', () => {
            installPrompt.prompt();
            installPrompt.userChoice.finally(() => { installPrompt = null; });
        }, { size: 13, color: 'rgba(30,100,60,0.9)', border: '#88ffaa' });
    }

    // Records line
    const recs = [];
    const board = loadLeaderboard();
    if (board.length > 0) recs.push(`🥇 ${board[0].score}`);
    if (survivalBestTime > 0) recs.push(`🏟 ${survivalBestTime}с`);
    if (endlessBestScore > 0) recs.push(`♾️ ${endlessBestScore}`);
    if (marathonBestScore > 0) recs.push(`🏃 ${marathonBestScore}`);
    if (recs.length) drawTitle('РЕКОРДЫ:  ' + recs.join('   '), 456, 12, '#ffdd66');

    const touch = document.body.classList.contains('touch');
    // Feature 129: Daily Streak display
    if (dailyStreak >= 2) {
        const streakColor = dailyStreak >= 7 ? '#ffd700' : '#ff8800';
        const bonusNote = dailyStreak >= 7 ? '  +10🪙 в магазин' : dailyStreak >= 3 ? '  +3🪙 в магазин' : '';
        drawTitle(`🔥 Серия: ${dailyStreak} дн.${bonusNote}`, 472, 11, streakColor);
    }
    const hint1 = touch ? 'Кнопки ◀ ▶ ▲ внизу · ⚡ рывок · 🍄 спора'
                        : '←→/AD движение · ↑/W/SPACE прыжок · SHIFT рывок · Z спора · ↓ парашют · ESC пауза';
    drawTitle(hint1, 487, 10, '#aaaaaa');

    // Feature 109: Ultra Mode active banner on menu
    if (ultraModeTimer > 0) {
        ultraModeTimer--;
        const sc = 1 + Math.sin(Date.now() * 0.006) * 0.05;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(22 * sc)}px monospace`;
        ctx.fillStyle = '#ffee00';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 12;
        ctx.fillText('🌟 ULTRA MODE АКТИВЕН! 🌟', W / 2, 400);
        ctx.restore();
    }
}

// Feature 79: Achievements screen
function renderAchievements() {
    drawBackground();
    drawTitle('🏆 ДОСТИЖЕНИЯ', 80, 28, '#ffcc00');

    const unlockedCount = achievementDefs.filter(d => achievementUnlocked[d.id]).length;
    drawTitle(`Выполнено: ${unlockedCount} / ${achievementDefs.length}`, 112, 14, '#aaffaa');

    const colW = 360;
    const rowH = 38;
    const startX = (W - colW * 2 - 20) / 2;
    const startY = 138;

    achievementDefs.forEach((def, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const bx = startX + col * (colW + 20);
        const by = startY + row * rowH;
        const done = !!achievementUnlocked[def.id];

        ctx.save();
        // Background box
        ctx.fillStyle = done ? 'rgba(30,80,30,0.85)' : 'rgba(20,20,40,0.7)';
        ctx.beginPath();
        ctx.roundRect(bx, by, colW, rowH - 4, 8);
        ctx.fill();
        ctx.strokeStyle = done ? '#44ff88' : '#444466';
        ctx.lineWidth = done ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, colW, rowH - 4, 8);
        ctx.stroke();

        // Icon + label
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = done ? '#ccffcc' : '#777799';
        ctx.fillText(done ? def.label : `🔒 ${def.desc}`, bx + 12, by + 16);
        if (done) {
            ctx.font = '10px monospace';
            ctx.fillStyle = '#88cc88';
            ctx.fillText(def.desc, bx + 12, by + 29);
        }
        ctx.restore();
    });

    uiButton(20, H - 58, 150, 42, '← Назад', () => pressKey('Escape'), { hint: 'ESC' });
}

// Feature 108: All-time persistent statistics screen
function renderStats() {
    drawBackground();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText('📊 СТАТИСТИКА ЗА ВСЁ ВРЕМЯ', W / 2 + 2, 82);
    ctx.fillStyle = '#aaddff';
    ctx.fillText('📊 СТАТИСТИКА ЗА ВСЁ ВРЕМЯ', W / 2, 80);
    // Feature 110: current prestige title
    const sp = getPrestigeTitle();
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = sp.color;
    ctx.shadowColor = sp.color;
    ctx.shadowBlur = 6;
    ctx.fillText(sp.title, W / 2, 104);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.restore();

    const rows = [
        ['⚔️', 'Убито врагов',      allTimeStats.enemiesKilled],
        ['💰', 'Монет собрано',     allTimeStats.coinsCollected],
        ['🔥', 'Лучшее комбо',      allTimeStats.maxCombo],
        ['🏁', 'Уровней пройдено',  allTimeStats.levelsCleared],
        ['💀', 'Смертей всего',     allTimeStats.deaths],
        ['🎮', 'Игр сыграно',       allTimeStats.gamesPlayed],
        ['🏆', 'Побед',             allTimeStats.wins],
        ['🌟', 'Лучший счёт',       highScore],
    ];

    const startY = 118;
    const rowH = 36;
    const panelW = 460;
    const panelX = W / 2 - panelW / 2;

    rows.forEach(([icon, label, value], i) => {
        const ry = startY + i * rowH;
        // Row background
        ctx.save();
        ctx.fillStyle = i % 2 === 0 ? 'rgba(20,30,60,0.65)' : 'rgba(10,18,40,0.55)';
        ctx.beginPath();
        ctx.roundRect(panelX, ry, panelW, rowH - 2, 8);
        ctx.fill();
        ctx.restore();

        ctx.font = '16px monospace';
        ctx.fillStyle = '#ccddff';
        ctx.fillText(`${icon}  ${label}`, panelX + 18, ry + 23);

        ctx.save();
        ctx.textAlign = 'right';
        ctx.font = 'bold 18px monospace';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(String(value), panelX + panelW - 16, ry + 23);
        ctx.textAlign = 'left';
        ctx.restore();
    });

    uiButton(20, H - 58, 150, 42, '← Назад', () => pressKey('Escape'), { hint: 'ESC' });
}

function renderGameOver() {
    drawBackground();

    drawTitle("GAME OVER", 100, 42, '#ff4444');
    drawTitle(`Счёт: ${totalScore}`, 145, 22, '#ffcc00');
    if (totalScore >= highScore && highScore > 0) drawTitle("НОВЫЙ РЕКОРД!", 173, 18, '#00ff00');

    // Feature 110: Show prestige title on game over
    const pt = getPrestigeTitle();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = pt.color;
    ctx.shadowColor = pt.color;
    ctx.shadowBlur = 6;
    ctx.fillText(pt.title, W / 2, 196);
    ctx.restore();

    const panelY = 214, panelH = 176;
    // Leaderboard top-3 (left)
    const board = loadLeaderboard();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 330, panelY, 310, panelH, 10);
    ctx.fill();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd00';
    ctx.fillText('🏆 ТАБЛИЦА РЕКОРДОВ', W / 2 - 175, panelY + 24);
    const medals = ['🥇', '🥈', '🥉'];
    board.forEach((entry, i) => {
        ctx.font = '13px monospace';
        ctx.fillStyle = i === 0 ? '#ffcc00' : i === 1 ? '#cccccc' : '#cd7f32';
        ctx.fillText(`${medals[i] || (i + 1 + '.')} ${entry.score}   ${entry.date}`, W / 2 - 175, panelY + 58 + i * 30);
    });
    ctx.restore();

    // Run statistics (right)
    const statData = [
        ['⚔️', 'Убито врагов', runStats.enemiesKilled],
        ['💰', 'Монет собрано', runStats.coinsCollected],
        ['🔥', 'Макс. комбо',   runStats.maxCombo],
        ['🏁', 'Уровней пройдено', runStats.levelsCleared],
        ['💀', 'Смертей', runStats.deaths],  // Feature 63
    ];
    const sx = W / 2 + 20;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(sx, panelY, 310, panelH, 10);
    ctx.fill();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaddff';
    ctx.fillText('📊 СТАТИСТИКА', sx + 155, panelY + 24);
    statData.forEach(([icon, label, val], i) => {
        const sy = panelY + 52 + i * 26;
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`${icon} ${label}:`, sx + 14, sy);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffee88';
        ctx.fillText(String(val), sx + 296, sy);
    });
    ctx.restore();

    uiButton(W / 2 - 230, 412, 220, 52, '↻ ЕЩЁ РАЗ', () => pressKey('Enter'),
        { color: 'rgba(40,150,60,0.92)', border: '#88ff99', size: 18, hint: 'ENTER' });
    uiButton(W / 2 + 10, 412, 220, 52, '☰ В МЕНЮ', gameOverToMenu, { size: 18, hint: 'ESC' });
}

// Leave the game-over screen for the main menu (keeps the same bookkeeping as "play again")
function gameOverToMenu() {
    if (totalScore > highScore) {
        highScore = totalScore;
        localStorage.setItem('mushroomHighScore', String(highScore));
    }
    speedRunMode = false; speedRunTotalTime = 0;
    marathonMode = false; // Feature 127
    allTimeStats.gamesPlayed++;
    mergeRunIntoAllTime();
    stopBGM();
    player = null;
    gameState = 'MENU';
}

function renderVictory() {
    drawBackground();

    // Golden banner
    ctx.save();
    const grd = ctx.createLinearGradient(0, 80, 0, 170);
    grd.addColorStop(0, 'rgba(200,150,0,0.0)');
    grd.addColorStop(0.5, 'rgba(255,220,0,0.18)');
    grd.addColorStop(1, 'rgba(200,150,0,0.0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 80, W, 90);
    ctx.restore();

    drawTitle('🏆 ТЫ ПОБЕДИЛ! 🏆', 120, 40, '#ffee00');
    drawTitle(`Все ${LEVELS.length} уровней пройдены!`, 160, 18, '#00ff88');
    drawTitle(`Счёт: ${totalScore}`, 192, 22, '#ffcc00');
    if (totalScore >= highScore && highScore > 0) drawTitle('НОВЫЙ РЕКОРД! 🎉', 218, 16, '#00ff44');
    // Feature 110: Show prestige title on victory screen
    const victoryPrestige = getPrestigeTitle();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = victoryPrestige.color;
    ctx.shadowColor = victoryPrestige.color;
    ctx.shadowBlur = 8;
    ctx.fillText(victoryPrestige.title, W / 2, 240);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.restore();
    // Feature 96: Speed Run total time display
    if (speedRunMode && speedRunTotalTime > 0) {
        const m = Math.floor(speedRunTotalTime / 60);
        const s = Math.floor(speedRunTotalTime % 60);
        const ms = Math.floor((speedRunTotalTime % 1) * 100);
        const srStr = `⏱ Спидран: ${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(2,'0')}`;
        drawTitle(srStr, 262, 15, '#aaffff');
        if (speedRunNewRecord) drawTitle('⚡ РЕКОРД СПИДРАНА!', 280, 14, '#44ffcc');
        else if (speedRunBestTotal > 0) {
            const bm = Math.floor(speedRunBestTotal / 60);
            const bs = Math.floor(speedRunBestTotal % 60);
            const bms = Math.floor((speedRunBestTotal % 1) * 100);
            drawTitle(`Рекорд: ${bm}:${String(bs).padStart(2,'0')}.${String(bms).padStart(2,'0')}`, 280, 13, '#778899');
        }
    }

    // Big mushroom
    ctx.save();
    const mcols = getMushroomColors();
    const bigSprite = getMushroomSprite(mcols.cap, mcols.capLight);
    const spx = 6;
    drawPixelSprite(W / 2 - 250, 305, spx, bigSprite);
    drawPixelSprite(W / 2 + 250 - 14 * spx, 305, spx, bigSprite);
    ctx.restore();

    // Stats
    const panelX = W / 2 - 160;
    const panelY = 292;
    const statData = [
        ['⚔️', 'Убито врагов', runStats.enemiesKilled],
        ['💰', 'Монет собрано', runStats.coinsCollected],
        ['🔥', 'Макс. комбо',   runStats.maxCombo],
        ['🏁', 'Уровней пройдено', runStats.levelsCleared],
        ['💀', 'Смертей', runStats.deaths],  // Feature 63
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, 320, statData.length * 22 + 22, 10);
    ctx.fill();
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaddff';
    ctx.fillText('📊 СТАТИСТИКА', W / 2, panelY + 15);
    statData.forEach(([icon, label, val], i) => {
        const sy = panelY + 15 + (i + 1) * 22;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`${icon} ${label}:`, panelX + 12, sy);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffee88';
        ctx.fillText(String(val), panelX + 308, sy);
    });
    ctx.textAlign = 'left';
    ctx.restore();

    // Feature 56: Confetti
    confettiParticles.forEach(p => p.render());

    uiButton(W / 2 - 110, 438, 220, 48, '☰ В МЕНЮ', () => pressKey('Enter'), { size: 18, hint: 'ENTER' });
}

function renderLevelComplete() {
    drawBackground();
    platforms.forEach(p => p.render());

    // Feature 82: Special coin cave completion screen
    if (currentLevel === COIN_CAVE_LEVEL_INDEX) {
        drawTitle('🪙 МОНЕТНАЯ ПЕЩЕРА!', 170, 30, '#ffd700');
        drawTitle(`Собрано монет: ${levelCoinsCollected} / ${levelCoinsTotal}`, 215, 20, '#ffcc00');
        const pct = levelCoinsTotal > 0 ? Math.floor(levelCoinsCollected / levelCoinsTotal * 100) : 0;
        drawTitle(`${pct}% — Рекорд: ${coinCaveBestCoins} монет`, 248, 14, '#cc88ff');
    } else {
        drawTitle(`УРОВЕНЬ ${currentLevel + 1} ПРОЙДЕН!`, 200, 32, '#00ff00');
        drawTitle(`Счёт: ${player.score}`, 245, 20, '#ffcc00');
    }

    // Time display
    const t = levelCompletionTime;
    const tMins = Math.floor(t / 60);
    const tSecs = Math.floor(t % 60);
    const tMs = Math.floor((t % 1) * 10);
    const timeStr = tMins > 0 ? `${tMins}м ${tSecs}.${tMs}с` : `${tSecs}.${tMs}с`;
    drawTitle(`⏱ Время: ${timeStr}`, 278, 17, '#88ddff');

    if (isNewLevelTimeRecord) {
        const pulse = 0.85 + Math.sin(Date.now() * 0.008) * 0.15;
        ctx.save();
        ctx.globalAlpha = 0.85 + pulse * 0.15;
        drawTitle('🏅 РЕКОРД ВРЕМЕНИ!', 308, 16, '#00ffcc');
        ctx.restore();
    } else {
        const best = levelBestTimes[currentLevel];
        if (best != null) {
            const bm = Math.floor(best / 60);
            const bs = Math.floor(best % 60);
            const bms = Math.floor((best % 1) * 10);
            const bestStr = bm > 0 ? `${bm}м ${bs}.${bms}с` : `${bs}.${bms}с`;
            drawTitle(`Рекорд: ${bestStr}`, 308, 14, '#888888');
        }
    }

    // Feature 140: Perfect Clear banner
    if (lastLevelWasPerfectClear) {
        const pcPulse = 0.85 + Math.sin(Date.now() * 0.007) * 0.15;
        const pcAlpha = 0.85 + pcPulse * 0.15;
        ctx.save();
        ctx.globalAlpha = pcAlpha;
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(18 * pcPulse)}px monospace`;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText('⭐ ИДЕАЛЬНОЕ ПРОХОЖДЕНИЕ! +1000', W / 2 + 2, 337);
        ctx.fillStyle = '#ffdd00';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 14;
        ctx.fillText('⭐ ИДЕАЛЬНОЕ ПРОХОЖДЕНИЕ! +1000', W / 2, 335);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
        ctx.restore();
    }
    // Feature 59: Letter grade display
    if (currentLevelGrade) {
        const gradeColors = { S: '#ffdd00', A: '#00ff88', B: '#55bbff', C: '#aaaaaa', D: '#ff4444' };
        const gradeColor = gradeColors[currentLevelGrade] || '#ffffff';
        const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.06;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(72 * pulse)}px monospace`;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(currentLevelGrade, W / 2 + 4, 185 + 4);
        // Glow halo
        ctx.shadowColor = gradeColor;
        ctx.shadowBlur = 24;
        ctx.fillStyle = gradeColor;
        ctx.fillText(currentLevelGrade, W / 2, 185);
        ctx.shadowBlur = 0;

        // Grade label
        const gradeLabels = { S: 'ИДЕАЛЬНО!', A: 'ОТЛИЧНО!', B: 'ХОРОШО', C: 'НОРМАЛЬНО', D: 'ПОПРОБУЙ ЕЩЁ' };
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = gradeColor;
        ctx.fillText(gradeLabels[currentLevelGrade] || '', W / 2, 215);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

// Feature 107: Between-level upgrade shop renderer
function renderShop() {
    drawBackground();

    // Title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText('🛒 МАГАЗИН АПГРЕЙДОВ', W / 2 + 2, 82);
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('🛒 МАГАЗИН АПГРЕЙДОВ', W / 2, 80);

    // Coin wallet display
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`💰 Монеты: ${shopCoins}`, W / 2, 116);
    ctx.textAlign = 'left';
    ctx.restore();

    // Shop items
    const itemW = 480, itemH = 60, itemX = W / 2 - itemW / 2;
    SHOP_ITEMS.forEach((item, i) => {
        const itemY = 140 + i * 70;
        const selected = i === shopSelectedIdx;
        const canAfford = shopCoins >= item.price;
        uiButtons.push({ x: itemX, y: itemY, w: itemW, h: itemH, action: () => { shopSelectedIdx = i; pressKey('Enter'); } });

        // Card background
        ctx.save();
        ctx.fillStyle = selected
            ? (canAfford ? 'rgba(255,220,50,0.22)' : 'rgba(200,80,80,0.18)')
            : 'rgba(15,25,55,0.72)';
        ctx.beginPath();
        ctx.roundRect(itemX, itemY, itemW, itemH, 12);
        ctx.fill();

        // Border
        ctx.strokeStyle = selected ? (canAfford ? '#ffdd44' : '#ff6666') : (canAfford ? '#334466' : '#222233');
        ctx.lineWidth = selected ? 2.5 : 1.2;
        ctx.beginPath();
        ctx.roundRect(itemX, itemY, itemW, itemH, 12);
        ctx.stroke();
        ctx.restore();

        // Label
        ctx.font = `bold 16px monospace`;
        ctx.fillStyle = canAfford ? '#ffffff' : '#555566';
        ctx.fillText(item.label, itemX + 18, itemY + 24);
        // Description
        ctx.font = `12px monospace`;
        ctx.fillStyle = canAfford ? '#99aacc' : '#444455';
        ctx.fillText(item.desc, itemX + 18, itemY + 46);

        // Price badge
        ctx.save();
        ctx.textAlign = 'right';
        ctx.font = `bold 16px monospace`;
        ctx.fillStyle = canAfford ? '#ffd700' : '#555555';
        ctx.fillText(`💰 ${item.price}`, itemX + itemW - 14, itemY + 36);
        ctx.textAlign = 'left';
        ctx.restore();
    });

    // Instructions
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillStyle = '#888899';
    ctx.fillText('Нажми на товар, чтобы купить  ·  ↑↓ + ENTER', W / 2, 432);
    ctx.textAlign = 'left';
    ctx.restore();
    uiButton(W - 250, H - 60, 230, 48, 'ПРОДОЛЖИТЬ ▶', () => pressKey('Escape'),
        { color: 'rgba(40,150,60,0.92)', border: '#88ff99', size: 17, hint: 'ESC' });
}

function renderDifficultySelect() {
    drawBackground();
    drawTitle('ВЫБОР СЛОЖНОСТИ', 70, 30, '#ffcc00');
    drawTitle('Нажми на карточку, чтобы выбрать', 100, 12, '#dddddd');

    const opts = [
        {
            key: 'easy',
            name: 'ЛЕГКО',
            color: 'rgba(30,120,200,0.85)',
            selColor: 'rgba(60,180,255,0.92)',
            border: '#88ccff',
            icon: '😊',
            lines: ['Скорость ×0.7', '5 жизней', 'Бонус ×2', 'Для новичков'],
        },
        {
            key: 'normal',
            name: 'НОРМА',
            color: 'rgba(30,130,60,0.85)',
            selColor: 'rgba(60,200,80,0.92)',
            border: '#88ffaa',
            icon: '😐',
            lines: ['Стандартно', '3 жизни', 'Обычный бонус', 'Баланс'],
        },
        {
            key: 'hard',
            name: 'СЛОЖНО',
            color: 'rgba(160,30,30,0.85)',
            selColor: 'rgba(230,60,60,0.92)',
            border: '#ff8888',
            icon: '😤',
            lines: ['Скорость ×1.3', '2 жизни', 'Бонус ×0.5', 'Для мастеров'],
        },
        {
            key: 'hardcore',
            name: 'ХАРДКОР',
            color: 'rgba(40,0,60,0.92)',
            selColor: 'rgba(100,0,150,0.95)',
            border: '#ff00ff',
            icon: '💀',
            lines: ['Скорость ×1.6', '1 жизнь', 'Нет бонуса', 'Только смерть'],
        },
    ];

    const cardW = 165;
    const cardH = 200;
    const gap = 14;
    const totalW = opts.length * cardW + (opts.length - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = 120;

    opts.forEach((opt, i) => {
        const bx = startX + i * (cardW + gap);
        const by = startY;
        const isSel = difficulty === opt.key;
        // Feature 122: tap a card to select it, tap the selected card again to continue
        uiButtons.push({ x: bx, y: by, w: cardW, h: cardH, action: () => {
            if (difficulty === opt.key) { pressKey('Enter'); return; }
            difficulty = opt.key;
            localStorage.setItem('mushroomDifficulty', difficulty);
        } });

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(bx + 4, by + 4, cardW, cardH, 14);
        ctx.fill();

        // Card background
        ctx.fillStyle = isSel ? opt.selColor : opt.color;
        ctx.beginPath();
        ctx.roundRect(bx, by, cardW, cardH, 14);
        ctx.fill();

        // Border
        if (isSel) {
            ctx.strokeStyle = opt.border;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(bx, by, cardW, cardH, 14);
            ctx.stroke();
        }

        ctx.save();
        ctx.textAlign = 'center';
        const cx = bx + cardW / 2;

        // Icon
        ctx.font = '32px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(opt.icon, cx, by + 48);

        // Name
        ctx.font = `bold ${isSel ? 17 : 15}px monospace`;
        ctx.fillStyle = '#fff';
        ctx.fillText(opt.name, cx, by + 80);

        // Details
        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        opt.lines.forEach((line, li) => {
            ctx.fillText(line, cx, by + 105 + li * 22);
        });

        ctx.restore();
    });

    // Show current difficulty label
    const labels = { easy: 'ЛЁГКИЙ', normal: 'НОРМАЛЬНЫЙ', hard: 'СЛОЖНЫЙ', hardcore: '💀 ХАРДКОР' };
    drawTitle(`Выбрано: ${labels[difficulty] || difficulty}`, 352, 16, difficulty === 'hardcore' ? '#ff44ff' : '#ffffaa');

    // Feature 81: Mirror Mode toggle button
    uiButton(W / 2 - 120, 368, 240, 40, `🪞 ЗЕРКАЛО: ${mirrorMode ? 'ВКЛ' : 'ВЫКЛ'}`, () => pressKey('KeyM'),
        { color: mirrorMode ? 'rgba(0,150,200,0.7)' : 'rgba(60,60,80,0.75)', border: mirrorMode ? '#44eeff' : 'rgba(150,150,180,0.5)',
          textColor: mirrorMode ? '#aaffff' : '#bbbbcc', size: 14, hint: 'M' });

    uiButton(20, H - 62, 170, 48, '← Назад', () => pressKey('Escape'), { hint: 'ESC' });
    uiButton(W - 210, H - 62, 190, 48, 'ДАЛЕЕ ▶', () => pressKey('Enter'),
        { color: 'rgba(40,150,60,0.92)', border: '#88ff99', size: 18, hint: 'ENTER' });
}

function renderLevelSelect() {
    drawBackground();

    drawTitle('ВЫБОР УРОВНЯ', 58, 28, '#ffcc00');

    const n = LEVELS.length;
    const cols = 9;
    const gap = 8;
    const boxW = 76, boxH = 66;
    const startX = (W - (cols * boxW + (cols - 1) * gap)) / 2;
    const startY = 80;

    for (let i = 0; i < n; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const rowCount = Math.min(cols, n - row * cols);
        const rowX = startX + (cols - rowCount) * (boxW + gap) / 2; // centre a shorter last row
        const bx = rowX + col * (boxW + gap);
        const by = startY + row * (boxH + gap);
        const locked = i >= unlockedLevels;
        const isSelected = i === selectedLevelIdx;
        const isBonusLvl = LEVELS[i] && LEVELS[i].isBonusLevel;
        const isBoss = LEVELS[i] && LEVELS[i].isBossLevel;

        // Feature 122: tap selects, tapping the selected unlocked level starts it
        uiButtons.push({ x: bx, y: by, w: boxW, h: boxH, action: () => {
            if (i === selectedLevelIdx && !locked) startGameFromLevel(i);
            else selectedLevelIdx = i;
        } });

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(bx + 3, by + 3, boxW, boxH, 10);
        ctx.fill();
        if (locked) ctx.fillStyle = 'rgba(40,40,60,0.85)';
        else if (isSelected) ctx.fillStyle = isBonusLvl ? 'rgba(160,80,220,0.92)' : 'rgba(80,180,80,0.9)';
        else ctx.fillStyle = isBonusLvl ? 'rgba(100,40,160,0.8)' : isBoss ? 'rgba(170,50,50,0.8)' : 'rgba(60,120,200,0.8)';
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 10);
        ctx.fill();
        if (isSelected) {
            ctx.strokeStyle = locked ? '#ff6666' : '#ffff00';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.save();
        ctx.textAlign = 'center';
        const cx = bx + boxW / 2;
        if (locked) {
            ctx.font = '22px monospace';
            ctx.fillStyle = '#888';
            ctx.fillText('🔒', cx, by + 34);
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = '#777';
            ctx.fillText(`${i + 1}`, cx, by + 56);
        } else {
            ctx.font = 'bold 28px monospace';
            ctx.fillStyle = '#fff';
            ctx.fillText(isBonusLvl ? '🪙' : isBoss ? '👑' : `${i + 1}`, cx, by + 36);
            // Feature 59: letter grade badge
            const savedGrade = levelGrades[i];
            const gc = { S: '#ffdd00', A: '#00ff88', B: '#55bbff', C: '#aaaaaa', D: '#ff4444' }[savedGrade] || 'rgba(255,255,255,0.35)';
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = gc;
            ctx.fillText(savedGrade || '—', cx, by + 58);
            // Feature 98: Challenge complete badge
            const chKey = `${i}_${getChallengeForLevel(i % CHALLENGE_DEFS.length).id}`;
            if (challengeCompleted[chKey]) {
                ctx.font = '11px monospace';
                ctx.fillText('🎯', bx + boxW - 10, by + 14);
            }
            // Feature 140: Perfect Clear star badge
            if (levelPerfectClears[i]) {
                ctx.font = '11px monospace';
                ctx.fillText('⭐', bx + 10, by + 14);
            }
        }
        ctx.restore();
    }

    // Selected level info
    const infoY = startY + 2 * (boxH + gap) + 26;
    const name = LEVEL_NAMES[selectedLevelIdx] || `Уровень ${selectedLevelIdx + 1}`;
    if (selectedLevelIdx < unlockedLevels) {
        const nameColor = selectedLevelIdx === COIN_CAVE_LEVEL_INDEX ? '#ffd700' : '#88ffaa';
        drawTitle(`${selectedLevelIdx + 1}. ${name}`, infoY, 20, nameColor);
        if (selectedLevelIdx === COIN_CAVE_LEVEL_INDEX) drawTitle('БОНУС: собери монеты за 30 секунд!', infoY + 22, 13, '#cc88ff');
    } else {
        drawTitle('🔒 Уровень заблокирован — пройди предыдущий', infoY, 15, '#ff6666');
    }
    const diffLabel = difficulty === 'easy' ? '😊 ЛЕГКО' : difficulty === 'hard' ? '😤 СЛОЖНО' : difficulty === 'hardcore' ? '💀 ХАРДКОР' : '😐 НОРМА';
    drawTitle(`Сложность: ${diffLabel}${mirrorMode ? '  ·  🪞 зеркало' : ''}`, infoY + 44, 12, '#aaddff');

    // Mushroom color selector (tap a dot)
    ctx.save();
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    const colorY = infoY + 92;
    ctx.fillText(`ЦВЕТ ГРИБА: ${getMushroomColors().name}`, W / 2, colorY - 22);
    const dotR = 14;
    const dotSpacing = 40;
    const dotsStartX = W / 2 - (MUSHROOM_COLORS.length - 1) * dotSpacing / 2;
    MUSHROOM_COLORS.forEach((col, i) => {
        const dx = dotsStartX + i * dotSpacing;
        uiButtons.push({ x: dx - 19, y: colorY - 19, w: 38, h: 38, action: () => {
            mushroomColorIdx = i;
            localStorage.setItem('mushroomColorIdx', String(mushroomColorIdx));
        } });
        if (i === mushroomColorIdx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(dx, colorY, dotR + 4, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = col.cap;
        ctx.beginPath();
        ctx.arc(dx, colorY, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.capLight;
        ctx.beginPath();
        ctx.arc(dx - 4, colorY - 4, 4, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();

    uiButton(20, H - 62, 170, 48, '← Назад', () => pressKey('Escape'), { hint: 'ESC' });
    if (selectedLevelIdx < unlockedLevels) {
        uiButton(W - 210, H - 62, 190, 48, '▶ ИГРАТЬ', () => pressKey('Enter'),
            { color: 'rgba(40,150,60,0.92)', border: '#88ff99', size: 18, hint: 'ENTER' });
    }
    if (!document.body.classList.contains('touch')) drawTitle('← → выбор · Z / X цвет', H - 32, 11, '#aaaaaa');
}

// === LEVEL TRANSITION ===
let levelTransitionTimer = 0;
const TRANSITION_HALF = 40; // frames for curtain to close / open
const TRANSITION_HOLD = 30; // frames to hold "УРОВЕНЬ X" text
const TRANSITION_TOTAL = TRANSITION_HALF * 2 + TRANSITION_HOLD;

function renderLevelTransition() {
    // Draw frozen gameplay beneath
    drawBackground();
    renderWeather();
    platforms.forEach(p => p.render());
    marios.forEach(m => m.render());
    if (player) player.render();

    const t = levelTransitionTimer;
    let curtain; // 0 = open, 1 = fully closed
    if (t <= TRANSITION_HALF) {
        curtain = t / TRANSITION_HALF;
    } else if (t <= TRANSITION_HALF + TRANSITION_HOLD) {
        curtain = 1;
    } else {
        curtain = 1 - (t - TRANSITION_HALF - TRANSITION_HOLD) / TRANSITION_HALF;
    }

    // Draw curtain bars (top half sweeps down, bottom half sweeps up)
    const barH = H / 2 * curtain;
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillRect(0, H - barH, W, barH);

    // Level label appears only when curtain is fully closed
    if (curtain > 0.95) {
        const alpha = Math.min((curtain - 0.95) / 0.05, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        drawTitle(`УРОВЕНЬ ${currentLevel + 1}`, H / 2 + 10, 38, '#ffcc00');
        const levelNames = LEVEL_NAMES;
        const name = levelNames[currentLevel] || `Уровень ${currentLevel + 1}`;
        drawTitle(name, H / 2 + 50, 20, '#aaffaa');
        ctx.restore();
    }
}

// === UPDATE ===
let levelCompleteTimer = 0;

function update() {
    pollGamepad(); // Feature 114: poll gamepad state each frame
    switch (gameState) {
        case 'MENU':
            if (isEnter() && !enterWasPressed) {
                initAudio();
                gameState = 'DIFFICULTY_SELECT';
            }
            // Feature 68: S key starts survival mode
            if (keys['KeyS'] && !keys['_sWas']) {
                initAudio();
                startSurvivalMode();
            }
            keys['_sWas'] = keys['KeyS'];
            // Feature 79: A key opens achievements screen
            if (keys['KeyA'] && !keys['_aMenuWas']) {
                gameState = 'ACHIEVEMENTS';
            }
            keys['_aMenuWas'] = keys['KeyA'];
            // Feature 86: D key opens Daily Challenge preview
            if (keys['KeyD'] && !keys['_dMenuWas']) {
                initAudio();
                const ch = getDailyChallenge();
                dailyChallengeLevelIdx = ch.lvlIdx;
                dailyChallengeModifiers = ch.mods;
                dailyChallengeDate = ch.dateStr;
                gameState = 'DAILY_CHALLENGE';
            }
            keys['_dMenuWas'] = keys['KeyD'];
            // Feature 96: R key starts Speed Run mode from level 0
            if (keys['KeyR'] && !keys['_rMenuWas']) {
                initAudio();
                speedRunMode = true;
                speedRunTotalTime = 0;
                speedRunNewRecord = false;
                survivalMode = false;
                dailyChallengeMode = false;
                resetRunStats();
                currentLevel = 0;
                totalScore = 0; nextMilestoneIdx = 0; milestoneBannerTimer = 0;
                player = null;
                loadLevel(currentLevel);
                player.lives = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : difficulty === 'hardcore' ? 1 : 3;
                player.score = 0;
                gameState = 'PLAYING';
            }
            keys['_rMenuWas'] = keys['KeyR'];
            // Feature 115: E key starts Endless Mode
            if (keys['KeyE'] && !keys['_eMenuWas']) {
                initAudio();
                startEndlessMode();
            }
            keys['_eMenuWas'] = keys['KeyE'];
            // Feature 108: T key opens all-time stats screen
            if (keys['KeyT'] && !keys['_tMenuWas']) {
                gameState = 'STATS';
            }
            keys['_tMenuWas'] = keys['KeyT'];
            // Feature 127: Q key starts Marathon Mode
            if (keys['KeyQ'] && !keys['_qMenuWas']) {
                initAudio();
                startMarathonMode();
            }
            keys['_qMenuWas'] = keys['KeyQ'];
            break;

        case 'STATS': // Feature 108
            if (isEscape() && !escapeWasPressed) {
                gameState = 'MENU';
            }
            break;

        case 'ACHIEVEMENTS':
            if (isEscape() && !escapeWasPressed) {
                gameState = 'MENU';
            }
            break;

        case 'DAILY_CHALLENGE':
            if (isEscape() && !escapeWasPressed) {
                gameState = 'MENU';
            }
            if (isEnter() && !enterWasPressed) {
                // Apply modifiers and start
                dailyChallengeMode = true;
                const hasMirror = dailyChallengeModifiers.includes('mirror');
                if (hasMirror) mirrorMode = true;
                // Start the level; other modifiers applied in loadLevel via dailyChallengeModifiers
                resetRunStats();
                survivalMode = false;
                currentLevel = dailyChallengeLevelIdx;
                totalScore = 0; nextMilestoneIdx = 0; milestoneBannerTimer = 0;
                player = null;
                stars = []; loadLevel(currentLevel);
                player.lives = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : difficulty === 'hardcore' ? 1 : 3;
                player.score = 0;
                // Apply x2_score modifier by giving player a permanent score boost
                if (dailyChallengeModifiers.includes('x2_score')) {
                    player.scoreBoostTimer = 99999; // effectively permanent for this level
                }
                gameState = 'PLAYING';
            }
            break;

        case 'DIFFICULTY_SELECT': {
            const opts = ['easy', 'normal', 'hard', 'hardcore'];
            const idx = opts.indexOf(difficulty);
            if (isLeft() && !leftWasPressed && idx > 0) {
                difficulty = opts[idx - 1];
                localStorage.setItem('mushroomDifficulty', difficulty);
            }
            if (isRight() && !rightWasPressed && idx < opts.length - 1) {
                difficulty = opts[idx + 1];
                localStorage.setItem('mushroomDifficulty', difficulty);
            }
            if (isEnter() && !enterWasPressed) {
                selectedLevelIdx = 0;
                gameState = 'LEVEL_SELECT';
            }
            if (isEscape() && !escapeWasPressed) {
                gameState = 'MENU';
            }
            // Feature 81: M key toggles mirror mode
            if (keys['KeyM'] && !keys['_mDiffWas']) {
                mirrorMode = !mirrorMode;
                localStorage.setItem('mushroomMirrorMode', String(mirrorMode));
                playSound('coin'); // brief feedback sound
            }
            keys['_mDiffWas'] = keys['KeyM'];
            break;
        }

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
                gameState = 'DIFFICULTY_SELECT';
            }
            // Z / X — cycle mushroom color
            if (keys['KeyZ'] && !keys['_zWas']) {
                mushroomColorIdx = (mushroomColorIdx - 1 + MUSHROOM_COLORS.length) % MUSHROOM_COLORS.length;
                localStorage.setItem('mushroomColorIdx', String(mushroomColorIdx));
            }
            if (keys['KeyX'] && !keys['_xWas']) {
                mushroomColorIdx = (mushroomColorIdx + 1) % MUSHROOM_COLORS.length;
                localStorage.setItem('mushroomColorIdx', String(mushroomColorIdx));
            }
            keys['_zWas'] = keys['KeyZ'];
            keys['_xWas'] = keys['KeyX'];
            break;

        case 'PLAYING':
            // Update moving platforms before entities so positions are current
            platforms.forEach(p => p.update());
            // Carry player on moving platform
            for (const p of platforms) {
                if (!p.moveAxis) continue;
                const dx = p.x - p._prevX;
                const dy = p.y - p._prevY;
                if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                    // Check if player is standing on this platform
                    const feet = player.y + player.h;
                    const onTop = feet >= p.y - 2 && feet <= p.y + 4 &&
                                  player.x + player.w > p.x && player.x < p.x + p.w;
                    if (onTop) {
                        player.x += dx;
                        player.y += dy;
                    }
                }
            }
            player.update();
            marios = marios.filter(m => m.update());
            particles = particles.filter(p => p.update());
            dashShadows = dashShadows.filter(ds => ds.update()); // Feature 152
            const particleCap = lowQuality ? 80 : 180; // Feature 124/126: bursts can pile up hundreds
            if (particles.length > particleCap) particles.splice(0, particles.length - particleCap);
            scorePopups = scorePopups.filter(p => p.update()); // Feature 88
            updateKillFeed(); // Feature 160
            coins = coins.filter(c => c.update());
            stars = stars.filter(s => s.update());
            shields = shields.filter(s => s.update());
            bombs = bombs.filter(b => b.update());
            springPads.forEach(sp => sp.update());
            if (bossMarco) { if (!bossMarco.update()) bossMarco = null; }
            checkPlayerMarioCollisions();
            checkPlayerBossCollision();
            updateCoinRain(); // Feature 111
            checkCoinCollisions();
            checkStarCollisions();
            checkShieldCollisions();
            checkBombCollisions();
            checkSpringCollisions();
            checkSpeedBoostCollisions();
            speedBoosts = speedBoosts.filter(s => s.update());
            magnets = magnets.filter(m => m.update());
            checkMagnetCollisions();
            freezes = freezes.filter(f => f.update());
            checkFreezeCollisions();
            ghosts = ghosts.filter(g => g.update()); // Feature 54
            checkGhostCollisions();
            scoreBoosts = scoreBoosts.filter(s => s.update()); // Feature 61
            checkScoreBoostCollisions();
            electricos = electricos.filter(e => e.update()); // Feature 72
            checkElectroCollisions();
            updateElectroField();
            slowMos = slowMos.filter(sm => sm.update()); // Feature 75
            checkSlowMoCollisions();
            rockets = rockets.filter(r => r.update()); // Feature 80
            magBootsList = magBootsList.filter(mb => mb.update()); // Feature 85
            checkMagBootsCollisions();
            giantPUs = giantPUs.filter(g => g.update()); // Feature 87
            checkGiantPUCollisions();
            checkRocketCollisions();
            jetpacks = jetpacks.filter(j => j.update()); // Feature 99
            checkJetpackCollisions();
            droppedPowerups = droppedPowerups.filter(dp => dp.update()); // Feature 77
            checkDroppedPowerupCollisions();
            fireballs = fireballs.filter(fb => fb.update());
            checkFireballCollisions();
            spores = spores.filter(s => s.update()); // Feature 101
            checkSporeCollisions();                   // Feature 101
            flashlights = flashlights.filter(fl => fl.update()); // Feature 105
            checkFlashlightCollisions();              // Feature 105
            healingMushrooms = healingMushrooms.filter(hm => hm.update()); // Feature 137
            checkHealingMushroomCollisions();         // Feature 137
            giftChests = giftChests.filter(gc => gc.update()); // Feature 143
            checkGiftChestCollisions();               // Feature 143
            bubbleShields = bubbleShields.filter(b => b.update()); // Feature 145
            checkBubbleShieldCollisions();            // Feature 145
            jumpBoosts = jumpBoosts.filter(jb => jb.update()); // Feature 148
            checkJumpBoostCollisions();               // Feature 148
            spikeBoots = spikeBoots.filter(sb => sb.update()); // Feature 163
            checkSpikeBootsCollisions();              // Feature 163
            lightningCoins = lightningCoins.filter(lc => lc.update()); // Feature 147
            checkLightningCoinCollisions();           // Feature 147
            explodingCoins = explodingCoins.filter(ec => ec.update()); // Feature 162
            checkExplodingCoinCollisions();           // Feature 162
            warpCoins = warpCoins.filter(wc => wc.update()); // Feature 165
            checkWarpCoinCollisions();                         // Feature 165
            explosiveBarrels = explosiveBarrels.filter(b => b.update()); // Feature 167
            checkBarrelCollisions();                           // Feature 167
            vortexCoins = vortexCoins.filter(vc => vc.update()); // Feature 169
            checkVortexCoinCollisions();                           // Feature 169
            reflectShields = reflectShields.filter(rs => rs.update()); // Feature 171
            checkReflectShieldCollisions();                            // Feature 171
            quakePowerUps = quakePowerUps.filter(q => q.update());    // Feature 173
            checkQuakePUCollisions();                                  // Feature 173
            dronePowerUps = dronePowerUps.filter(dp => dp.update()); // Feature 161
            checkDronePUCollisions();                 // Feature 161
            updateDroneCompanion();                   // Feature 161
            for (const [pA, pB] of portalPairs) { pA.update(); pB.update(); }
            checkPortalCollisions();
            checkpoints.forEach(cp => cp.update());
            checkSpikeCollisions(); // Feature 91
            updateWeather();
            updateWind(); // Feature 141
            if (currentLevel < 4) updateBirds(); // Feature 60
            updateAchievementToasts();

            if (shakeTimer > 0) shakeTimer--;
            if (bulletTimeTimer > 0) bulletTimeTimer--; // Feature 139
            if (comboDisplayTimer > 0) comboDisplayTimer--;
            if (comboCount > levelMaxCombo) levelMaxCombo = comboCount;
            if (coinFrenzyTimer > 0) { coinFrenzyTimer--; if (coinFrenzyTimer === 0) coinFrenzyActivated = false; } // Feature 73
            // Feature 76: check score milestones
            if (nextMilestoneIdx < SCORE_MILESTONES.length && totalScore >= SCORE_MILESTONES[nextMilestoneIdx]) {
                milestoneBannerText = MILESTONE_TEXTS[nextMilestoneIdx];
                milestoneBannerColor = MILESTONE_COLORS[nextMilestoneIdx];
                milestoneBannerTimer = 180;
                nextMilestoneIdx++;
            }
            if (milestoneBannerTimer > 0) milestoneBannerTimer--;
            levelTimer++;
            // Animate HUD score display
            if (hudScoreDisplay < player.score) {
                hudScoreDisplay = Math.min(player.score, hudScoreDisplay + Math.max(1, (player.score - hudScoreDisplay) * 0.18));
            }

            // Feature 128: detect when player beats high score mid-game
            if (!newRecordThisRun && runStartHighScore > 0 && totalScore > runStartHighScore) {
                newRecordThisRun = true;
                newRecordFlashTimer = 200; // ~3.3 seconds
                // Spawn gold star particles from around the player
                if (player) {
                    for (let i = 0; i < 10; i++) {
                        const p = new Particle(player.x + Math.random() * 40 - 20, player.y - 10, '★', '#ffd700');
                        p.vy = -3 - Math.random() * 2;
                        p.timer = 60 + Math.floor(Math.random() * 40);
                        particles.push(p);
                    }
                }
                playSound('star');
            }

            // Mute toggle with M key (only when not paused)
            if (keys['KeyM'] && !keys['_muteWas']) {
                setMuted(!soundMuted);
            }
            keys['_muteWas'] = keys['KeyM'];

            // Feature 69: Rage Mode — speed up remaining enemies when ≤3 left
            {
                const aliveNow = marios.filter(m => m.isAlive);
                const wasRage = rageModeActive;
                // Threshold scales with level size so small levels don't start in rage mode
                const rageAt = levelTotalMarios >= 6 ? 3 : levelTotalMarios >= 4 ? 2 : 1;
                rageModeActive = aliveNow.length <= rageAt && aliveNow.length > 0 && aliveNow.length < levelTotalMarios && !isBossLevel;
                if (rageModeActive && !wasRage) {
                    rageModeWarningTimer = 120; // show warning 2 sec
                    playSound('rage');
                }
                if (rageModeWarningTimer > 0) rageModeWarningTimer--;
                // Feature 151: last enemy banner
                if (aliveNow.length === 1 && lastEnemyBannerTimer === 0 && levelTotalMarios > 1) {
                    lastEnemyBannerTimer = 150; // show for 2.5s
                }
                if (lastEnemyBannerTimer > 0) lastEnemyBannerTimer--;
            }

            // Feature 68: Survival Mode — spawn new waves and track time
            if (survivalMode) {
                survivalTimer++;
                survivalWaveTimer--;
                if (survivalWaveTimer <= 0) {
                    survivalWave++;
                    survivalWaveTimer = SURVIVAL_WAVE_INTERVAL;
                    // Spawn a new wave of enemies (mix of types)
                    const waveSpeed = (2.2 + survivalWave * 0.3) * (difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.3 : difficulty === 'hardcore' ? 1.6 : 1);
                    const waveSize = 2 + Math.floor(survivalWave / 2);
                    const spawnXs = [80, 700, 380, 200, 600];
                    for (let i = 0; i < waveSize; i++) {
                        const sx = spawnXs[i % spawnXs.length];
                        const types = ['normal', 'fast', 'jumpy', 'armored'];
                        const t = types[Math.min(Math.floor(survivalWave / 2) + i % types.length, types.length - 1)];
                        marios.push(new Mario(sx, 420, waveSpeed, t));
                    }
                    particles.push(new Particle(W / 2 - 50, H / 2 - 80, `ВОЛНА ${survivalWave}!`, '#ffaa00'));
                    // Feature 71: Every 3 waves, spawn a parachute Mario
                    if (survivalWave % 3 === 0) {
                        const px = 100 + Math.floor(Math.random() * 600);
                        marios.push(new Mario(px, -60, waveSpeed * 0.6, 'parachute'));
                    }
                    // Respawn some coins each wave
                    const arena = SURVIVAL_ARENA;
                    if (coins.filter(c => !c.collected).length < 3) {
                        coins.push(...(arena.coinSpawns || []).slice(0, 3).map(c => new Coin(c.x, c.y)));
                    }
                }
            }

            // Feature 83: Kill streak decay — reset if no kill within time window
            if (killStreakCount > 0) {
                killStreakTimer++;
                if (killStreakTimer > KILL_STREAK_WINDOW) {
                    killStreakCount = 0;
                    killStreakTimer = 0;
                }
            }

            // Feature 82: Coin Cave countdown — level ends when timer hits 0 or all coins collected
            if (coinCaveMode) {
                coinCaveCountdown--;
                // Early finish if all coins collected
                if (coins.length === 0 && levelCoinsTotal > 0 && coinCaveCountdown > 0) {
                    coinCaveCountdown = 0;
                    particles.push(new Particle(W / 2 - 60, H / 2 - 60, '🪙 ВСЕ МОНЕТЫ!', '#ffd700'));
                }
                if (coinCaveCountdown <= 0) {
                    coinCaveCountdown = 0;
                    if (levelCoinsCollected > coinCaveBestCoins) {
                        coinCaveBestCoins = levelCoinsCollected;
                        localStorage.setItem('mushroomCoinCaveBest', String(coinCaveBestCoins));
                    }
                    // Grade by coins collected vs total
                    const pct = levelCoinsTotal > 0 ? levelCoinsCollected / levelCoinsTotal : 0;
                    currentLevelGrade = pct >= 0.9 ? 'S' : pct >= 0.7 ? 'A' : pct >= 0.5 ? 'B' : pct >= 0.25 ? 'C' : 'D';
                    levelGrades[currentLevel] = currentLevelGrade;
                    localStorage.setItem('mushroomLevelGrades', JSON.stringify(levelGrades));
                    levelCompletionTime = 30;
                    isNewLevelTimeRecord = false;
                    // coinCaveMode stays true until loadLevel resets it — prevents normal completion check below from also firing
                    gameState = 'LEVEL_COMPLETE';
                    levelCompleteTimer = 60;
                    levelClearFlash = 28; // Feature 136
                    playSound('levelup');
                }
            }

            // Check level complete (boss level needs boss defeated, regular needs all marios dead)
            const bossCleared = !isBossLevel || bossMarco === null;
            if (!survivalMode && !coinCaveMode && marios.filter(m => m.isAlive).length === 0 && marios.length === 0 && bossCleared) {
                // Time bonus: max 3000 pts at <5s, scales to 0 at 60s
                const elapsed = levelTimer / 60;
                const timeBonusMult = difficulty === 'easy' ? 2.0 : difficulty === 'hard' ? 0.5 : difficulty === 'hardcore' ? 0 : 1.0;
                const timeBonus = Math.max(0, Math.round(TIME_BONUS_MAX * timeBonusMult * (1 - elapsed / 60)));
                if (timeBonus > 0) {
                    player.score += timeBonus;
                    totalScore += timeBonus;
                    particles.push(new Particle(W / 2 - 60, H / 2 - 60, `ВРЕМЯ +${timeBonus}`, '#00ffcc'));
                }
                gameState = 'LEVEL_COMPLETE';
                levelCompleteTimer = 60; // brief pause before transition
                levelClearFlash = 28; // Feature 136: white screen flash
                playSound('levelup');
                haptic([25, 40, 25, 40, 50]); // Feature 124
                // Feature 86: Save daily challenge best score
                if (dailyChallengeMode && dailyChallengeDate) {
                    if (dailyChallengeDate !== dailyChallengeBestDate || totalScore > dailyChallengeBest) {
                        dailyChallengeBest = totalScore;
                        dailyChallengeBestDate = dailyChallengeDate;
                        localStorage.setItem('mushroomDailyBest', String(dailyChallengeBest));
                        localStorage.setItem('mushroomDailyBestDate', dailyChallengeBestDate);
                    }
                    dailyChallengeMode = false;
                    mirrorMode = localStorage.getItem('mushroomMirrorMode') === 'true'; // restore mirror setting
                }
                // Feature 79 & 81: Achievements on level complete
                if (levelDeathCount === 0) unlockAchievement('noDeaths');
                if ((levelTimer / 60) < 30) unlockAchievement('speedRunner');
                if (mirrorMode) unlockAchievement('mirrorHero'); // Feature 81
                // Feature 59: calculate and save letter grade
                levelCompletionTime = levelTimer / 60;
                currentLevelGrade = calcLevelGrade(levelDeathCount, levelCoinsCollected, levelCoinsTotal, levelCompletionTime);
                levelGrades[currentLevel] = currentLevelGrade;
                localStorage.setItem('mushroomLevelGrades', JSON.stringify(levelGrades));
                // Feature 96: Speed Run — accumulate total time
                if (speedRunMode) {
                    speedRunTotalTime += levelCompletionTime;
                }
                // Feature 98: Challenge Card — check if completed
                if (!challengeBonusAwarded) {
                    const ch = getChallengeForLevel(currentLevel % CHALLENGE_DEFS.length);
                    const key = `${currentLevel}_${ch.id}`;
                    if (!challengeCompleted[key] && ch.check()) {
                        challengeCompleted[key] = true;
                        localStorage.setItem('mushroomChallenges', JSON.stringify(challengeCompleted));
                        player.score += 500;
                        totalScore += 500;
                        particles.push(new Particle(W / 2 - 80, H / 2 - 40, '🎯 ЗАДАНИЕ +500!', '#44ffaa'));
                    }
                    challengeBonusAwarded = true;
                }
                // Feature 140: Perfect Clear bonus — no deaths AND time < 25s
                lastLevelWasPerfectClear = false;
                if (levelDeathCount === 0 && levelCompletionTime < 25 && !isBossLevel && !coinCaveMode) {
                    lastLevelWasPerfectClear = true;
                    levelPerfectClears[currentLevel] = true;
                    localStorage.setItem('mushroomPerfectClears', JSON.stringify(levelPerfectClears));
                    player.score += 1000;
                    totalScore += 1000;
                    particles.push(new Particle(W / 2 - 90, H / 2 - 80, '⭐ ИДЕАЛЬНО! +1000', '#ffdd00'));
                }
                // Save best level time
                if (!isBossLevel) {
                    const prev = levelBestTimes[currentLevel];
                    if (prev === undefined || prev === null || levelCompletionTime < prev) {
                        levelBestTimes[currentLevel] = parseFloat(levelCompletionTime.toFixed(1));
                        isNewLevelTimeRecord = true;
                        localStorage.setItem('mushroomLevelTimes', JSON.stringify(levelBestTimes));
                    } else {
                        isNewLevelTimeRecord = false;
                    }
                }
            }

            if (isEscape() && !escapeWasPressed) {
                gameState = 'PAUSED';
            }

            // Feature 134: Quick Restart — press R in-game to restart current level
            if (keys['KeyR'] && !keys['_qrWas']) {
                const prevLives = player ? player.lives : 3;
                loadLevel(currentLevel);
                if (player) player.lives = prevLives; // keep current lives
                particles.push(new Particle(W / 2 - 60, H / 2 - 60, '↺ РЕСТАРТ', '#ff8800'));
                playSound('stomp');
            }
            keys['_qrWas'] = keys['KeyR'];
            break;

        case 'LEVEL_COMPLETE':
            levelCompleteTimer--;
            if (levelCompleteTimer <= 0) {
                runStats.levelsCleared++;
                {
                    // Boss level is a mid-campaign milestone — the run continues to the next level
                    currentLevel++;

                    // Feature 127: Marathon Mode — jump to next marathon level instead of sequential
                    if (marathonMode) {
                        marathonLevelIdx++;
                        if (marathonLevelIdx >= MARATHON_LEVELS.length) {
                            // All marathon levels completed — go to victory
                            if (totalScore > marathonBestScore) {
                                marathonBestScore = totalScore;
                                localStorage.setItem('mushroomMarathonBest', String(marathonBestScore));
                            }
                            if (totalScore > highScore) {
                                highScore = totalScore;
                                localStorage.setItem('mushroomHighScore', String(highScore));
                            }
                            marathonMode = false;
                            submitScore(totalScore);
                            stopBGM();
                            gameState = 'VICTORY';
                            spawnConfetti();
                            playSound('victory');
                        } else {
                            currentLevel = MARATHON_LEVELS[marathonLevelIdx];
                            loadLevel(currentLevel);
                            levelTransitionTimer = 0;
                            gameState = 'LEVEL_TRANSITION';
                        }
                    } else {
                    // Unlock next level (up to LEVELS.length)
                    if (currentLevel < LEVELS.length && currentLevel >= unlockedLevels) {
                        unlockedLevels = currentLevel + 1;
                        localStorage.setItem('mushroomUnlockedLevels', String(unlockedLevels));
                    }
                    // Feature 82: After bonus level (last level) → go back to menu
                    if (currentLevel >= LEVELS.length) {
                        if (endlessMode) {
                            // Feature 115: Endless Mode — cycle back to level 0 with higher difficulty
                            endlessCycle++;
                            currentLevel = 0;
                            if (totalScore > endlessBestScore) {
                                endlessBestScore = totalScore;
                                localStorage.setItem('mushroomEndlessBest', String(endlessBestScore));
                            }
                            particles.push(new Particle(W / 2 - 90, H / 2 - 60, `🔄 ЦИКЛ ${endlessCycle}! Враги быстрее!`, '#ffaa00'));
                            loadLevel(currentLevel);
                            levelTransitionTimer = 0;
                            gameState = 'LEVEL_TRANSITION';
                        } else {
                            if (totalScore > highScore) {
                                highScore = totalScore;
                                localStorage.setItem('mushroomHighScore', String(highScore));
                            }
                            submitScore(totalScore);
                            stopBGM();
                            gameState = 'VICTORY';
                            spawnConfetti();
                            playSound('victory');
                        }
                    } else {
                        loadLevel(currentLevel);
                        levelTransitionTimer = 0;
                        // Feature 107: show shop between levels (skip in survival/daily/speedrun/endless)
                        if (!survivalMode && !dailyChallengeMode && !speedRunMode && !endlessMode) {
                            shopCoins += levelCoinsCollected;
                            shopSelectedIdx = 0;
                            gameState = 'SHOP';
                        } else {
                            gameState = 'LEVEL_TRANSITION';
                        }
                    }
                    } // end !marathonMode
                }
            }
            break;

        case 'VICTORY':
            // Continuously spawn new confetti so it never runs out
            if (confettiParticles.length < 60) {
                for (let i = 0; i < 3; i++) confettiParticles.push(new ConfettiParticle());
            }
            confettiParticles = confettiParticles.filter(p => p.update());
            // Feature 96: save speedrun total time record on victory
            if (speedRunMode && speedRunTotalTime > 0) {
                if (speedRunBestTotal === 0 || speedRunTotalTime < speedRunBestTotal) {
                    speedRunBestTotal = speedRunTotalTime;
                    speedRunNewRecord = true;
                    localStorage.setItem('mushroomSpeedRunBest', String(speedRunBestTotal.toFixed(2)));
                }
            }
            if (isEnter() && !enterWasPressed) {
                confettiParticles = [];
                speedRunMode = false;
                speedRunTotalTime = 0;
                allTimeStats.gamesPlayed++; // Feature 108
                allTimeStats.wins++;        // Feature 108
                mergeRunIntoAllTime();      // Feature 108
                gameState = 'MENU';
            }
            break;

        case 'LEVEL_TRANSITION':
            levelTransitionTimer++;
            if (levelTransitionTimer >= TRANSITION_TOTAL) {
                gameState = 'PLAYING';
            }
            break;

        // Feature 107: Between-level shop
        case 'SHOP': {
            if (keys['ArrowUp'] && !keys['_shopUpWas']) {
                shopSelectedIdx = (shopSelectedIdx - 1 + SHOP_ITEMS.length) % SHOP_ITEMS.length;
                playSound('coin');
            }
            keys['_shopUpWas'] = keys['ArrowUp'];
            if (keys['ArrowDown'] && !keys['_shopDownWas']) {
                shopSelectedIdx = (shopSelectedIdx + 1) % SHOP_ITEMS.length;
                playSound('coin');
            }
            keys['_shopDownWas'] = keys['ArrowDown'];
            if (isEnter() && !enterWasPressed) {
                const item = SHOP_ITEMS[shopSelectedIdx];
                if (shopCoins >= item.price) {
                    shopCoins -= item.price;
                    if (item.id === 'life') {
                        player.lives = Math.min(player.lives + 1, 9);
                        particles.push(new Particle(player.x, player.y - 20, '❤️ +1 Жизнь!', '#ff3333'));
                    } else if (item.id === 'shield') {
                        player.shieldActive = true;
                        particles.push(new Particle(player.x, player.y - 20, '🛡️ Щит!', '#4488ff'));
                    } else if (item.id === 'ammo') {
                        player.sporeAmmo = 3;
                        player.sporeAmmoTimer = 0;
                        particles.push(new Particle(player.x, player.y - 20, '🍄 Споры!', '#55dd33'));
                    } else if (item.id === 'magnet') {
                        player.magnetTimer = 600;
                        particles.push(new Particle(player.x, player.y - 20, '🧲 Магнит!', '#aaddff'));
                    } else if (item.id === 'skip') {
                        // Feature 130: skip to the level after next
                        const skipTarget = currentLevel + 1;
                        if (skipTarget < LEVELS.length) {
                            currentLevel = skipTarget;
                            loadLevel(currentLevel);
                            levelTransitionTimer = 0;
                            particles.push(new Particle(W / 2 - 80, H / 2 - 30, '⏭ УРОВЕНЬ ПРОПУЩЕН!', '#aabbff'));
                            gameState = 'LEVEL_TRANSITION';
                        } else {
                            shopCoins += item.price; // refund
                            particles.push(new Particle(W / 2 - 80, H / 2 - 30, 'Это последний уровень!', '#ff8800'));
                        }
                    }
                    playSound('powerup');
                }
            }
            if (isEscape() && !escapeWasPressed) {
                gameState = 'LEVEL_TRANSITION';
            }
            break;
        }

        case 'GAME_OVER':
            if (isEscape() && !escapeWasPressed) {
                gameOverToMenu();
                break;
            }
            if (isEnter() && !enterWasPressed) {
                if (totalScore > highScore) {
                    highScore = totalScore;
                    localStorage.setItem('mushroomHighScore', String(highScore));
                }
                speedRunMode = false; speedRunTotalTime = 0; // Feature 96: reset speedrun on death
                marathonMode = false; // Feature 127: reset marathon on death
                allTimeStats.gamesPlayed++; // Feature 108
                mergeRunIntoAllTime();      // Feature 108
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
                stopBGM();
                speedRunMode = false; speedRunTotalTime = 0; // Feature 96: reset on menu exit
                gameState = 'MENU';
                player = null;
            }
            // Feature 97: C key toggles colorblind mode
            if (keys['KeyC'] && !keys['_cPauseWas']) {
                colorblindMode = !colorblindMode;
                localStorage.setItem('mushroomColorblind', String(colorblindMode));
                applyColorblindMode();
                playSound('coin');
            }
            keys['_cPauseWas'] = keys['KeyC'];
            // Feature 112: Volume control — [ and ] keys
            if (keys['BracketLeft'] && !keys['_volDownWas']) {
                setSoundVolume(soundVolume - 0.1);
                playSound('coin');
            }
            keys['_volDownWas'] = keys['BracketLeft'];
            if (keys['BracketRight'] && !keys['_volUpWas']) {
                setSoundVolume(soundVolume + 0.1);
                playSound('coin');
            }
            keys['_volUpWas'] = keys['BracketRight'];
            keys['_rWas'] = keys['KeyR'];
            keys['_mWas'] = keys['KeyM'];
            break;
    }

    enterWasPressed = isEnter();
    escapeWasPressed = isEscape();
    leftWasPressed = isLeft();
    rightWasPressed = isRight();
}

// === RENDER ===
function render() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    uiButtons = [];
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

        case 'ACHIEVEMENTS':
            renderAchievements();
            break;

        case 'STATS': // Feature 108
            renderStats();
            break;

        case 'DAILY_CHALLENGE':
            renderDailyChallenge();
            break;

        case 'DIFFICULTY_SELECT':
            renderDifficultySelect();
            break;

        case 'LEVEL_SELECT':
            renderLevelSelect();
            break;

        case 'SHOP': // Feature 107
            renderShop();
            break;

        case 'PLAYING':
            drawBackground();
            renderWeather();
            renderWindEffect(); // Feature 141
            platforms.forEach(p => p.render());
            // Feature 154: Jump Boost platform glow — yellow outline on platforms when boost is active
            if (player && player.jumpBoostTimer > 0) {
                const glowAlpha = Math.min(0.5, (player.jumpBoostTimer / JUMP_BOOST_DURATION) * 0.6)
                                  * (0.75 + Math.sin(Date.now() * 0.012) * 0.25);
                ctx.save();
                ctx.strokeStyle = `rgba(255, 220, 40, ${glowAlpha})`;
                ctx.lineWidth = 2.5;
                for (const p of platforms) {
                    if (p.crumble && p.crumbleState !== 'normal') continue;
                    ctx.strokeRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
                }
                ctx.restore();
            }
            spikes.forEach(s => s.render()); // Feature 91
            coins.forEach(c => c.render());
            stars.forEach(s => s.render());
            shields.forEach(s => s.render());
            checkpoints.forEach(cp => cp.render());
            springPads.forEach(sp => sp.render());
            speedBoosts.forEach(sb => sb.render());
            magnets.forEach(m => m.render());
            freezes.forEach(f => f.render());
            ghosts.forEach(g => g.render()); // Feature 54
            scoreBoosts.forEach(s => s.render()); // Feature 61
            electricos.forEach(e => e.render()); // Feature 72
            slowMos.forEach(sm => sm.render()); // Feature 75
            rockets.forEach(r => r.render()); // Feature 80
            magBootsList.forEach(mb => mb.render()); // Feature 85
            giantPUs.forEach(g => g.render()); // Feature 87
            droppedPowerups.forEach(dp => dp.render()); // Feature 77
            for (const [pA, pB] of portalPairs) { pA.render(); pB.render(); }
            fireballs.forEach(fb => fb.render());
            bombs.forEach(b => b.render());
            marios.forEach(m => m.render());
            if (bossMarco) bossMarco.render();
            renderAfterimages(); // Feature 53: speed boost afterimage trail
            renderRocketTrail(); // Feature 80: rocket flame trail
            renderJetpackFlame(); // Feature 99: jetpack thrust flame
            renderMagBootsEffect(); // Feature 85: mag boots aura
            // Feature 163: Spike Boots — orange spiky aura at player's feet
            if (player && player.spikeBootsTimer > 0) {
                const frac = player.spikeBootsTimer / SPIKE_BOOTS_DURATION;
                const pulse = 0.5 + Math.sin(Date.now() * 0.015) * 0.3;
                const cx = player.x + player.w / 2;
                const by = player.y + player.h;
                ctx.save();
                ctx.globalAlpha = frac * pulse;
                ctx.strokeStyle = '#ff6600';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(cx, by, player.w * 0.7, 6, 0, 0, Math.PI * 2);
                ctx.stroke();
                // Small spikes below feet
                for (let i = 0; i < 5; i++) {
                    const sx = cx - player.w * 0.6 + i * (player.w * 0.3);
                    ctx.beginPath();
                    ctx.moveTo(sx, by);
                    ctx.lineTo(sx + 3, by + 7);
                    ctx.lineTo(sx + 6, by);
                    ctx.fillStyle = '#ffaa00';
                    ctx.fill();
                }
                ctx.restore();
            }
            jetpacks.forEach(j => j.render()); // Feature 99: jetpack items
            flashlights.forEach(fl => fl.render()); // Feature 105
            healingMushrooms.forEach(hm => hm.render()); // Feature 137
            giftChests.forEach(gc => gc.render());    // Feature 143
            bubbleShields.forEach(b => b.render());   // Feature 145
            jumpBoosts.forEach(jb => jb.render());    // Feature 148
            spikeBoots.forEach(sb => sb.render());    // Feature 163
            lightningCoins.forEach(lc => lc.render()); // Feature 147
            explodingCoins.forEach(ec => ec.render());  // Feature 162
            dronePowerUps.forEach(dp => dp.render());   // Feature 161
            warpCoins.forEach(wc => wc.render());        // Feature 165
            explosiveBarrels.forEach(b => b.render());   // Feature 167
            vortexCoins.forEach(vc => vc.render());      // Feature 169
            reflectShields.forEach(rs => rs.render());   // Feature 171
            quakePowerUps.forEach(q => q.render());       // Feature 173
            renderDroneCompanion();                      // Feature 161
            // Feature 149: Magma Floor — animated lava glow strip at bottom on volcano levels
            if (LEVELS[currentLevel] && LEVELS[currentLevel].isVolcano) {
                const lavaY = 462;
                const lavaH = H - lavaY;
                const t = Date.now() * 0.002;
                const grad = ctx.createLinearGradient(0, lavaY, 0, H);
                grad.addColorStop(0, `rgba(255, 80, 0, ${0.55 + Math.sin(t) * 0.1})`);
                grad.addColorStop(0.5, `rgba(255, 30, 0, ${0.75 + Math.sin(t * 1.3) * 0.1})`);
                grad.addColorStop(1, `rgba(200, 0, 0, 0.9)`);
                ctx.save();
                ctx.fillStyle = grad;
                ctx.fillRect(0, lavaY, W, lavaH);
                // Lava surface waves
                ctx.beginPath();
                ctx.moveTo(0, lavaY);
                for (let wx = 0; wx <= W; wx += 20) {
                    ctx.lineTo(wx, lavaY + Math.sin(wx * 0.04 + t * 3) * 4);
                }
                ctx.lineTo(W, lavaY);
                ctx.closePath();
                ctx.fillStyle = `rgba(255, 200, 50, 0.6)`;
                ctx.fill();
                // Ember dots
                for (let ei = 0; ei < 6; ei++) {
                    const ex = (((ei * 137 + t * 40) % W) + W) % W;
                    const ey = lavaY - 10 - ((t * 30 * (ei + 1)) % 60);
                    ctx.beginPath();
                    ctx.arc(ex, ey, 2, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 220, 100, ${0.7 - (lavaY - 10 - ey) / 60})`;
                    ctx.fill();
                }
                ctx.restore();
            }
            spores.forEach(s => s.render());         // Feature 101
            dashShadows.forEach(ds => ds.render()); // Feature 152 — render behind player
            player.render();
            particles.forEach(p => p.render());
            scorePopups.forEach(p => p.render()); // Feature 88
            // Feature 105: Flashlight darkness overlay (after entities, before HUD)
            if (player && player.flashlightTimer > 0) renderFlashlightEffect();
            // Feature 48: red flash overlay on player death
            if (deathFlashTimer > 0) {
                const flashAlpha = (deathFlashTimer / 35) * 0.55;
                ctx.save();
                ctx.globalAlpha = flashAlpha;
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(0, 0, W, H);
                ctx.globalAlpha = 1;
                ctx.restore();
                deathFlashTimer--;
            }
            // Feature 139: Bullet Time — blue desaturation vignette while slowed
            if (bulletTimeTimer > 0) {
                const btAlpha = Math.min(bulletTimeTimer / 20, 1) * 0.35;
                ctx.save();
                ctx.globalAlpha = btAlpha;
                ctx.fillStyle = '#1133aa';
                ctx.fillRect(0, 0, W, H);
                // Vignette border
                const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
                vig.addColorStop(0, 'rgba(0,0,80,0)');
                vig.addColorStop(1, 'rgba(0,20,120,0.5)');
                ctx.globalAlpha = btAlpha * 1.5;
                ctx.fillStyle = vig;
                ctx.fillRect(0, 0, W, H);
                ctx.restore();
            }
            // Feature 136: white flash on level complete
            if (levelClearFlash > 0) {
                const t = levelClearFlash;
                const alpha = t > 20 ? (28 - t) / 8 : t / 20;
                ctx.save();
                ctx.globalAlpha = Math.min(0.72, alpha);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
                if (t > 8 && t < 22) {
                    ctx.globalAlpha = Math.min(1, (22 - t) / 7 + (t - 8) / 7);
                    ctx.font = 'bold 38px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#004400';
                    ctx.fillText('УРОВЕНЬ ПРОЙДЕН!', W / 2, H / 2);
                }
                ctx.globalAlpha = 1;
                ctx.restore();
                levelClearFlash--;
            }
            drawHUD();
            renderAchievementToasts();
            // Feature 76: Score milestone banner
            if (milestoneBannerTimer > 0) {
                const fadeFrames = 25;
                const alpha = milestoneBannerTimer < fadeFrames ? milestoneBannerTimer / fadeFrames
                            : milestoneBannerTimer > 155 ? (180 - milestoneBannerTimer) / 25 : 1;
                const scale = 1 + Math.sin(milestoneBannerTimer * 0.08) * 0.04;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.textAlign = 'center';
                ctx.font = `bold ${Math.round(34 * scale)}px monospace`;
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.fillText(milestoneBannerText, W / 2 + 2, H / 2 - 58);
                ctx.fillStyle = milestoneBannerColor;
                ctx.fillText(milestoneBannerText, W / 2, H / 2 - 60);
                ctx.textAlign = 'left';
                ctx.restore();
            }
            // Feature 153: Ghost Enemy Off-Screen Indicator — arrows pointing to off-screen ghost_marios
            if (player) {
                const margin = 14;
                for (const m of marios) {
                    if (!m.isAlive || m.type !== 'ghost_mario') continue;
                    const mx = m.x + m.w / 2;
                    const my = m.y + m.h / 2;
                    if (mx >= 0 && mx <= W && my >= 0 && my <= H) continue; // on-screen
                    // Compute angle from screen center to enemy
                    const ang = Math.atan2(my - H / 2, mx - W / 2);
                    // Clamp to screen edge
                    const cos = Math.cos(ang), sin = Math.sin(ang);
                    let ex = W / 2 + cos * (W / 2 - margin);
                    let ey = H / 2 + sin * (H / 2 - margin);
                    // Clamp to actual screen bounds
                    if (Math.abs(cos) > Math.abs(sin) * (W / H)) {
                        const side = cos > 0 ? 1 : -1;
                        ex = side > 0 ? W - margin : margin;
                        ey = H / 2 + Math.tan(ang) * side * (W / 2 - margin);
                    } else {
                        const side = sin > 0 ? 1 : -1;
                        ey = side > 0 ? H - margin : margin;
                        ex = W / 2 + (Math.tan(Math.PI / 2 - ang) * side * (H / 2 - margin)) * (sin > 0 ? 1 : -1);
                    }
                    ex = Math.max(margin, Math.min(W - margin, ex));
                    ey = Math.max(margin, Math.min(H - margin, ey));
                    const pulse = 0.7 + Math.sin(Date.now() * 0.008 + m.x * 0.01) * 0.3;
                    ctx.save();
                    ctx.globalAlpha = pulse;
                    ctx.translate(ex, ey);
                    ctx.rotate(ang);
                    ctx.fillStyle = '#cc88ff';
                    ctx.strokeStyle = '#440066';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(10, 0);
                    ctx.lineTo(-6, -6);
                    ctx.lineTo(-6, 6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // Feature 114: Gamepad connected banner
            if (gamepadConnectedTimer > 0) {
                gamepadConnectedTimer--;
                const a114 = gamepadConnectedTimer < 40 ? gamepadConnectedTimer / 40 : 1;
                ctx.save();
                ctx.globalAlpha = a114;
                ctx.fillStyle = 'rgba(0,40,0,0.7)';
                ctx.beginPath();
                ctx.roundRect(W / 2 - 140, 110, 280, 28, 8);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.font = 'bold 13px monospace';
                ctx.fillStyle = '#44ff88';
                ctx.fillText('🎮 Геймпад подключён!', W / 2, 129);
                ctx.textAlign = 'left';
                ctx.restore();
            }
            // Feature 113: Level start tip
            if (levelTipTimer > 0) {
                levelTipTimer--;
                const fadeFrames = 40;
                const a113 = levelTipTimer < fadeFrames ? levelTipTimer / fadeFrames : Math.min(1, (LEVEL_TIP_DURATION - levelTipTimer) / 20);
                const tip = LEVEL_TIPS[currentLevel % LEVEL_TIPS.length];
                ctx.save();
                ctx.globalAlpha = a113;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.roundRect(W / 2 - 230, H / 2 + 36, 460, 30, 8);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.font = '13px monospace';
                ctx.fillStyle = '#ddeeFF';
                ctx.fillText(tip, W / 2, H / 2 + 56);
                ctx.textAlign = 'left';
                ctx.restore();
            }
            // Feature 111: Coin Rain active banner
            if (coinRainBannerTimer > 0) {
                const fadeFrames = 20;
                const a111 = coinRainBannerTimer < fadeFrames ? coinRainBannerTimer / fadeFrames : 1;
                ctx.save();
                ctx.globalAlpha = a111;
                ctx.textAlign = 'center';
                ctx.font = 'bold 24px monospace';
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillText('🪙 МОНЕТНЫЙ ДОЖДЬ!', W / 2 + 2, 52);
                ctx.fillStyle = '#ffd700';
                ctx.shadowColor = '#ff8800';
                ctx.shadowBlur = 10;
                ctx.fillText('🪙 МОНЕТНЫЙ ДОЖДЬ!', W / 2, 50);
                ctx.shadowBlur = 0;
                ctx.textAlign = 'left';
                ctx.restore();
            }
            // Feature 109: Ultra Mode activation banner
            if (ultraModeTimer > 0) {
                ultraModeTimer--;
                const fadeFrames = 30;
                const a = ultraModeTimer < fadeFrames ? ultraModeTimer / fadeFrames : 1;
                const sc = 1 + Math.sin(ultraModeTimer * 0.15) * 0.05;
                ctx.save();
                ctx.globalAlpha = a;
                ctx.textAlign = 'center';
                ctx.font = `bold ${Math.round(44 * sc)}px monospace`;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillText('🌟 ULTRA MODE! 🌟', W / 2 + 3, H / 2 - 98);
                ctx.fillStyle = '#ffee00';
                ctx.shadowColor = '#ffaa00';
                ctx.shadowBlur = 18;
                ctx.fillText('🌟 ULTRA MODE! 🌟', W / 2, H / 2 - 101);
                ctx.shadowBlur = 0;
                ctx.textAlign = 'left';
                ctx.restore();
            }
            break;

        case 'LEVEL_COMPLETE':
            renderLevelComplete();
            break;

        case 'LEVEL_TRANSITION':
            renderLevelTransition();
            break;

        case 'GAME_OVER':
            renderGameOver();
            break;

        case 'VICTORY':
            renderVictory();
            break;

        case 'PAUSED':
            drawBackground();
            platforms.forEach(p => p.render());
            spikes.forEach(s => s.render()); // Feature 91
            marios.forEach(m => m.render());
            if (bossMarco) bossMarco.render();
            player.render();
            drawHUD();

            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, W, H);

            // Pause panel (Feature 122: fits the screen, every option is a tappable button)
            ctx.fillStyle = 'rgba(20,30,60,0.94)';
            ctx.beginPath();
            ctx.roundRect(W / 2 - 180, 28, 360, 448, 16);
            ctx.fill();
            ctx.strokeStyle = 'rgba(100,150,255,0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();

            drawTitle('ПАУЗА', 70, 32, '#ffffff');
            drawTitle(`Счёт: ${player.score}  ·  Уровень ${currentLevel + 1}`, 96, 14, '#ffcc00');

            {
                const bw = 280, bh = 40, bx = W / 2 - bw / 2;
                uiButton(bx, 110, bw, bh, '▶ ПРОДОЛЖИТЬ', () => pressKey('Escape'),
                    { color: 'rgba(40,150,60,0.92)', border: '#88ff99', size: 16, hint: 'ESC' });
                uiButton(bx, 158, bw, bh, '↻ РЕСТАРТ', () => pressKey('KeyR'), { color: 'rgba(190,110,30,0.9)', size: 15, hint: 'R' });
                uiButton(bx, 206, bw, bh, '☰ В МЕНЮ', () => pressKey('KeyM'), { color: 'rgba(130,60,190,0.9)', size: 15, hint: 'M' });
                uiButton(bx, 254, bw, 34, `👁 Дальтоник: ${colorblindMode ? 'ВКЛ' : 'ВЫКЛ'}`, () => pressKey('KeyC'),
                    { color: colorblindMode ? 'rgba(0,160,190,0.85)' : 'rgba(60,60,80,0.8)', size: 13, hint: 'C' });
                // Feature 112: volume row  [−] ████░░ [+]
                const vy = 298;
                uiButton(bx, vy, 44, 34, '−', () => pressKey('BracketLeft'), { size: 20 });
                uiButton(bx + bw - 44, vy, 44, 34, '+', () => pressKey('BracketRight'), { size: 20 });
                const volBarX = bx + 54, volBarW = bw - 108;
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.beginPath(); ctx.roundRect(volBarX, vy + 8, volBarW, 8, 4); ctx.fill();
                ctx.fillStyle = soundMuted ? '#ff4444' : '#55ddff';
                ctx.beginPath(); ctx.roundRect(volBarX, vy + 8, Math.round(volBarW * soundVolume), 8, 4); ctx.fill();
                ctx.save();
                ctx.textAlign = 'center';
                ctx.font = '11px monospace';
                ctx.fillStyle = '#aabbcc';
                ctx.fillText(`${soundMuted ? '🔇' : '🔊'} Громкость ${Math.round(soundVolume * 100)}%`, W / 2, vy + 31);
                ctx.restore();
            }

            // Feature 118: Level minimap on pause screen (bottom section)
            {
                const mmW = 320, mmH = 120;
                const mmX = W / 2 - mmW / 2;
                const mmY = 344;
                const scaleX = mmW / W;
                const scaleY = mmH / H;

                // Minimap background
                ctx.save();
                ctx.fillStyle = 'rgba(5,10,25,0.88)';
                ctx.beginPath();
                ctx.roundRect(mmX, mmY, mmW, mmH, 8);
                ctx.fill();
                ctx.strokeStyle = 'rgba(80,120,200,0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(mmX, mmY, mmW, mmH, 8);
                ctx.stroke();

                ctx.font = '9px monospace';
                ctx.fillStyle = '#6677aa';
                ctx.fillText('КАРТА', mmX + 4, mmY + 9);

                // Clip to minimap bounds
                ctx.beginPath();
                ctx.roundRect(mmX + 1, mmY + 1, mmW - 2, mmH - 2, 7);
                ctx.clip();

                // Platforms
                platforms.forEach(p => {
                    ctx.fillStyle = 'rgba(60,120,60,0.8)';
                    ctx.fillRect(mmX + p.x * scaleX, mmY + p.y * scaleY, Math.max(p.w * scaleX, 2), Math.max(p.h * scaleY, 2));
                });
                // Spikes
                spikes.forEach(s => {
                    ctx.fillStyle = '#ff4444';
                    ctx.fillRect(mmX + s.x * scaleX, mmY + s.y * scaleY, Math.max(s.w * scaleX, 2), 2);
                });
                // Coins
                coins.filter(c => !c.collected).forEach(c => {
                    ctx.fillStyle = '#ffd700';
                    ctx.fillRect(mmX + c.x * scaleX, mmY + c.y * scaleY, 3, 3);
                });
                // Enemies
                marios.forEach(m => {
                    ctx.fillStyle = m.isAlive ? '#ff3333' : 'rgba(255,80,80,0.3)';
                    ctx.fillRect(mmX + m.x * scaleX, mmY + m.y * scaleY, Math.max(m.w * scaleX, 3), Math.max(m.h * scaleY, 3));
                });
                // Player
                if (player) {
                    ctx.fillStyle = '#00ff88';
                    const px = mmX + player.x * scaleX;
                    const py = mmY + player.y * scaleY;
                    ctx.fillRect(px, py, Math.max(player.w * scaleX, 4), Math.max(player.h * scaleY, 4));
                    // Player arrow marker
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(px + 1, py - 3, 2, 3);
                }
                ctx.restore();
            }
            break;
    }

    ctx.restore();
}

// === GAME LOOP ===
let lastTime = 0;
let accumulator = 0;
let lastLoopState = null;

function gameLoop(timestamp) {
    trackFrameTime(timestamp - lastTime); // Feature 124
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    // Feature 139: Bullet Time — slow physics accumulation after player death
    const timeMult = bulletTimeTimer > 0 ? 0.25 : 1.0;
    accumulator += dt * timeMult;

    // Feature 126: draw only when the simulation advanced — on 120 Hz displays (MacBook ProMotion)
    // every other frame used to redraw an identical picture
    let stepped = false;
    while (accumulator >= TICK) {
        update();
        accumulator -= TICK;
        stepped = true;
    }

    if (stepped) render();
    // Feature 121: on-screen controls are only shown during gameplay
    if (gameState !== lastLoopState) {
        lastLoopState = gameState;
        document.body.classList.toggle('playing', gameState === 'PLAYING');
        if (gameState !== 'PLAYING') updateTouchKeys([]);
    }
    requestAnimationFrame(gameLoop);
}

// === START ===
ctx.imageSmoothingEnabled = false;
requestAnimationFrame(gameLoop);
