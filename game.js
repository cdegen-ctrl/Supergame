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
        if (gameState === 'MENU' || gameState === 'GAME_OVER' || gameState === 'VICTORY') {
            initAudio();
            keys['Enter'] = true;
            setTimeout(() => { keys['Enter'] = false; }, 120);
        } else if (gameState === 'PAUSED') {
            keys['Escape'] = true;
            setTimeout(() => { keys['Escape'] = false; }, 120);
        } else if (gameState === 'LEVEL_SELECT' || gameState === 'DIFFICULTY_SELECT') {
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

// Canvas click for mute icon (bottom-right corner ~40x30 area in canvas coordinates)
canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    if (cx > W - 50 && cy > H - 35 && gameState === 'PLAYING') {
        setMuted(!soundMuted);
    }
});

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
    constructor(x, y, w, h, moveAxis, moveRange, moveSpeed) {
        super(x, y, w, h);
        // Moving platform support
        this.moveAxis = moveAxis || null;   // 'x' | 'y' | null
        this.moveRange = moveRange || 0;
        this.moveSpeed = moveSpeed || 0;
        this.moveOrigin = moveAxis === 'x' ? x : y;
        this.moveDir = 1;
        this._prevX = x;
        this._prevY = y;
    }

    update() {
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

        // Moving platform indicator (glowing arrows)
        if (this.moveAxis) {
            ctx.save();
            ctx.globalAlpha = 0.75;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffee55';
            const label = this.moveAxis === 'x' ? '↔' : '↕';
            ctx.fillText(label, this.x + this.w / 2, this.y + this.h / 2 + 4);
            ctx.restore();
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
        // Wall jump
        this.wallSlideDir = 0;      // -1 = left wall, 0 = none, 1 = right wall
        this.wallJumpLockTimer = 0; // prevents re-triggering wall jump
        // Checkpoint respawn
        this.checkpointSpawn = null;
    }

    update() {
        // Wall jump lock countdown
        if (this.wallJumpLockTimer > 0) this.wallJumpLockTimer--;

        // horizontal movement
        const currentSpeed = this.speedBoostTimer > 0 ? PLAYER_SPEED * 2 : PLAYER_SPEED;
        if (isLeft()) {
            this.vx = -currentSpeed;
            this.facingRight = false;
        } else if (isRight()) {
            this.vx = currentSpeed;
            this.facingRight = true;
        } else {
            this.vx = 0;
        }

        // jump (only on press, not hold) — supports double jump + wall jump
        if (isJump() && !jumpWasPressed) {
            if (this.isGrounded) {
                this.vy = PLAYER_JUMP;
                this.isGrounded = false;
                this.jumpCount = 1;
                this.canDoubleJump = true;
                this.scaleX = 0.75;
                this.scaleY = 1.3;
                playSound('jump');
            } else if (this.canDoubleJump) {
                this.vy = PLAYER_JUMP * 0.85;
                this.canDoubleJump = false;
                this.jumpCount = 2;
                this.doubleJumpFlash = 12;
                this.scaleX = 0.7;
                this.scaleY = 1.35;
                playSound('jump');
            } else if (this.wallSlideDir !== 0 && this.wallJumpLockTimer <= 0) {
                // Wall jump! Launch away from wall
                this.vy = PLAYER_JUMP * 0.9;
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

        // gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;

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
        // star power-up timer
        if (this.starTimer > 0) this.starTimer--;
        // speed boost timer
        if (this.speedBoostTimer > 0) this.speedBoostTimer--;
        // magnet timer
        if (this.magnetTimer > 0) this.magnetTimer--;
        // freeze timer
        if (this.freezeTimer > 0) this.freezeTimer--;
        // shield break animation timer
        if (this.shieldBreakTimer > 0) this.shieldBreakTimer--;

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
                    this.jumpCount = 0;
                    this.canDoubleJump = false;
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
        deathFlashTimer = 35;
        shakeTimer = 20;
        shakeIntensity = 10;
        if (this.lives <= 0) {
            if (totalScore > highScore) {
                highScore = totalScore;
                localStorage.setItem('mushroomHighScore', String(highScore));
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
            comboCount = 0;
            comboDisplayTimer = 0;
            playSound('hurt');
        }
    }

    render() {
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

        // Build a color-customized sprite copy
        const mc = getMushroomColors();
        const coloredSprite = MUSHROOM_SPRITE.map(row => row.map(cell => {
            if (cell === C.mushroomCap) return mc.cap;
            if (cell === C.mushroomCapLight) return mc.capLight;
            return cell;
        }));

        if (!this.facingRight) {
            ctx.translate(drawX + spriteW, drawY);
            ctx.scale(-1, 1);
            drawPixelSprite(0, 0, px, coloredSprite);
        } else {
            drawPixelSprite(drawX, drawY, px, coloredSprite);
        }
        ctx.restore();
    }
}

class Mario extends Entity {
    // type: 'normal' | 'fast' | 'jumpy' | 'armored' | 'flying' | 'shooter'
    constructor(x, y, speed, type = 'normal') {
        super(x, y, 30, 36);
        this.type = type;
        this.speed = type === 'fast' ? speed * 1.9 : type === 'armored' ? speed * 0.85 : type === 'shooter' ? 0 : speed;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.isAlive = true;
        this.deathTimer = 0;
        this.squishScale = 1;
        this.animFrame = 0;
        this.animTimer = 0;
        this.armor = type === 'armored' ? 1 : 0;
        // jumpy: timer until next jump
        this.jumpTimer = type === 'jumpy' ? 60 + Math.floor(Math.random() * 80) : 9999;
        // flying: fixed altitude
        this.flyingY = type === 'flying' ? y : null;
        this.wingFlap = Math.random() * Math.PI * 2; // random phase
        // shooter: fire rate timer
        this.shootTimer = type === 'shooter' ? 120 + Math.floor(Math.random() * 120) : 9999;
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

        // Shooter type: stands still, aims and fires toward player
        if (this.type === 'shooter') {
            // Face the player
            if (player) {
                this.direction = player.x < this.x ? -1 : 1;
            }
            this.animTimer++;
            if (this.animTimer > 20) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 2; }
            // Apply gravity so it stays on platforms
            this.vy += GRAVITY;
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

        // Flying type: no gravity, fixed altitude
        if (this.type === 'flying') {
            this.wingFlap += 0.18;
            this.vx = this.speed * this.direction;
            this.x += this.vx;
            this.y = this.flyingY;
            this.vy = 0;
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
        if (this.armor > 0) {
            this.armor--;
            spawnDeathParticles(this.x, this.y, this.w / 2, this.h / 2);
            playSound('stomp');
            return false; // survived — armor absorbed hit
        }
        this.isAlive = false;
        this.deathTimer = 20;
        this.vx = 0;
        this.vy = 0;
        spawnDeathParticles(this.x, this.y, this.w, this.h);
        playSound('stomp');
        // 50% chance to drop a coin
        if (Math.random() < 0.5) {
            const dc = new Coin(this.x + this.w / 2 - 8, this.y + 4);
            dc.isDropped = true;
            dc.vx = (Math.random() - 0.5) * 4;
            dc.vy = -5 - Math.random() * 3;
            coins.push(dc);
        }
        return true; // killed
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
                ctx.fillStyle = '#000';
                ctx.fillText('⚡', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#ff6600';
                ctx.fillText('⚡', badgeX, badgeY);
            } else if (this.type === 'jumpy') {
                ctx.fillStyle = '#000';
                ctx.fillText('↑', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#44aaff';
                ctx.fillText('↑', badgeX, badgeY);
            } else if (this.type === 'armored') {
                ctx.fillStyle = '#000';
                ctx.fillText('🛡', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#aabbcc';
                ctx.fillText('🛡', badgeX, badgeY);
            } else if (this.type === 'flying') {
                ctx.fillStyle = '#000';
                ctx.fillText('✈', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#88ddff';
                ctx.fillText('✈', badgeX, badgeY);
            } else if (this.type === 'shooter') {
                ctx.fillStyle = '#000';
                ctx.fillText('🎯', badgeX + 1, badgeY + 1);
                ctx.fillStyle = '#ff8800';
                ctx.fillText('🎯', badgeX, badgeY);
            }
            ctx.textAlign = 'left';
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
    }
}

// === COINS ===
class Coin {
    constructor(x, y, bonus = 50) {
        this.x = x;
        this.y = y;
        this.w = bonus > 50 ? 20 : 16;
        this.h = bonus > 50 ? 20 : 16;
        this.bonus = bonus;
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
        if (player && player.magnetTimer > 0 && !this.isDropped) {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            const px = player.x + player.w / 2;
            const py = player.y + player.h / 2;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < MAGNET_RADIUS && dist > 1) {
                const spd = Math.min(10, (MAGNET_RADIUS - dist) / 18 + 2);
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
        const isDouble = this.bonus > 50;
        const r = isDouble ? 10 : 7;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 + bob;
        const glow = Math.abs(Math.sin(this.animTimer * 0.05)) * 0.4 + 0.6;
        const spin = isDouble ? Math.cos(this.animTimer * 0.09) : 1; // spin effect (scale x)

        ctx.save();
        // Outer glow
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = isDouble
            ? `rgba(255, 160, 0, ${glow * 0.4})`
            : `rgba(255, 220, 0, ${glow * 0.25})`;
        ctx.fill();
        // Coin body (with spin for double)
        ctx.translate(cx, cy);
        ctx.scale(Math.abs(spin), 1);
        ctx.translate(-cx, -cy);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = isDouble ? '#ff9900' : '#ffcc00';
        ctx.fill();
        ctx.strokeStyle = isDouble ? '#ffcc00' : '#e6a800';
        ctx.lineWidth = isDouble ? 2 : 1;
        ctx.stroke();
        // Shine
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,200,0.7)';
        ctx.fill();
        // Label
        ctx.font = `bold ${isDouble ? 9 : 8}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isDouble ? '#7a3c00' : '#b8860b';
        ctx.fillText(isDouble ? 'x2' : '$', cx, cy + r * 0.45);
        ctx.restore();
    }
}

let coins = [];

// === STAR POWER-UP ===
const STAR_DURATION = 600; // 10 seconds at 60fps
const SPEED_BOOST_DURATION = 300; // 5 seconds at 60fps
const MAGNET_DURATION = 420; // 7 seconds at 60fps
const MAGNET_RADIUS = 180;
const FREEZE_DURATION = 240; // 4 seconds at 60fps

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

function checkFireballCollisions() {
    if (!player) return;
    for (const fb of fireballs) {
        if (!fb.alive) continue;
        if (!aabb(player, fb)) continue;
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
        this.vy += GRAVITY;
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

// === RUN STATISTICS ===
let runStats = { enemiesKilled: 0, coinsCollected: 0, maxCombo: 0, levelsCleared: 0 };
function resetRunStats() {
    runStats = { enemiesKilled: 0, coinsCollected: 0, maxCombo: 0, levelsCleared: 0 };
}

// === ACHIEVEMENT SYSTEM ===
const achievementDefs = [
    { id: 'firstStomp',   label: '🦶 Первый стомп!',       desc: 'Раздавь первого Марио' },
    { id: 'starPower',    label: '⭐ Звёздная мощь!',      desc: 'Подбери звезду' },
    { id: 'comboMaster',  label: '🔥 Комбо-мастер!',       desc: 'Combo x5' },
    { id: 'coinCollector',label: '💰 Коллекционер!',       desc: 'Собери 10 монет за игру' },
    { id: 'shieldUser',   label: '🛡 Непробиваемый!',      desc: 'Щит поглотил удар' },
];

const achievementUnlocked = {};
let achievementToasts = []; // { label, timer }
let totalCoinsCollectedRun = 0;

function resetAchievements() {
    Object.keys(achievementUnlocked).forEach(k => delete achievementUnlocked[k]);
    achievementToasts = [];
    totalCoinsCollectedRun = 0;
}

function unlockAchievement(id) {
    if (achievementUnlocked[id]) return;
    achievementUnlocked[id] = true;
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
        const alpha = toast.timer < 40 ? toast.timer / 40 : toast.timer > 160 ? (180 - toast.timer) / 20 : 1;
        const y = 85 + i * 38;
        const tw = 220;
        const tx = W / 2 - tw / 2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(10, 20, 40, 0.88)';
        ctx.beginPath();
        ctx.roundRect(tx, y, tw, 30, 8);
        ctx.fill();
        ctx.strokeStyle = '#ffcc44';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tx, y, tw, 30, 8);
        ctx.stroke();
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffee88';
        ctx.fillText(toast.label, W / 2, y + 20);
        ctx.textAlign = 'left';
    });
    ctx.globalAlpha = 1;
    ctx.restore();
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
    },
    {
        // Level 4: Complex layout with moving platforms
        platforms: [
            { x: 0, y: 460, w: 160, h: 40 },
            { x: 240, y: 460, w: 160, h: 40 },
            { x: 480, y: 460, w: 160, h: 40 },
            { x: 680, y: 460, w: 120, h: 40 },
            { x: 50, y: 375, w: 120, h: 20 },
            { x: 250, y: 340, w: 120, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 1.2 },
            { x: 440, y: 375, w: 120, h: 20 },
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
    },
    {
        // Level 5: The gauntlet with moving platforms
        platforms: [
            { x: 0, y: 460, w: 120, h: 40 },
            { x: 180, y: 460, w: 120, h: 40 },
            { x: 360, y: 460, w: 120, h: 40 },
            { x: 540, y: 460, w: 120, h: 40 },
            { x: 700, y: 460, w: 100, h: 40 },
            { x: 80, y: 380, w: 100, h: 20, moveAxis: 'x', moveRange: 60, moveSpeed: 1.4 },
            { x: 260, y: 355, w: 100, h: 20 },
            { x: 440, y: 380, w: 100, h: 20, moveAxis: 'x', moveRange: 70, moveSpeed: 1.6 },
            { x: 620, y: 355, w: 100, h: 20 },
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
        checkpointSpawns: [{ x: 395, y: 415 }],
        flyingMarioSpawns: [{ x: 120, y: 195 }, { x: 520, y: 175 }],
        shooterMarioSpawns: [{ x: 350, y: 90 }],
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
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns: [{ x: 200, y: 165 }, { x: 550, y: 145 }],
        shooterMarioSpawns: [{ x: 450, y: 370 }],
    },
    {
        // Level 7: Chaos — all enemy types + max moving platforms
        platforms: [
            { x: 0, y: 460, w: 80, h: 40 },
            { x: 720, y: 460, w: 80, h: 40 },
            { x: 100, y: 420, w: 80, h: 20, moveAxis: 'x', moveRange: 70, moveSpeed: 2.0 },
            { x: 260, y: 380, w: 80, h: 20, moveAxis: 'y', moveRange: 40, moveSpeed: 1.5 },
            { x: 420, y: 420, w: 80, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 2.2 },
            { x: 580, y: 380, w: 80, h: 20, moveAxis: 'y', moveRange: 50, moveSpeed: 1.8 },
            { x: 50, y: 320, w: 80, h: 20, moveAxis: 'y', moveRange: 60, moveSpeed: 1.3 },
            { x: 200, y: 290, w: 80, h: 20, moveAxis: 'x', moveRange: 90, moveSpeed: 2.5 },
            { x: 380, y: 310, w: 80, h: 20, moveAxis: 'y', moveRange: 45, moveSpeed: 1.6 },
            { x: 560, y: 280, w: 80, h: 20, moveAxis: 'x', moveRange: 70, moveSpeed: 2.0 },
            { x: 120, y: 200, w: 110, h: 20, moveAxis: 'x', moveRange: 80, moveSpeed: 1.7 },
            { x: 380, y: 180, w: 110, h: 20, moveAxis: 'y', moveRange: 50, moveSpeed: 1.4 },
            { x: 620, y: 190, w: 110, h: 20, moveAxis: 'x', moveRange: 60, moveSpeed: 2.1 },
            { x: 300, y: 90, w: 200, h: 20 },
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
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns: [{ x: 150, y: 150 }, { x: 450, y: 135 }, { x: 620, y: 155 }],
        shooterMarioSpawns: [{ x: 100, y: 250 }, { x: 600, y: 230 }],
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
        checkpointSpawns: [{ x: 395, y: 425 }],
        flyingMarioSpawns: [{ x: 200, y: 140 }, { x: 500, y: 125 }, { x: 380, y: 155 }],
        shooterMarioSpawns: [{ x: 310, y: 85 }, { x: 530, y: 265 }],
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
    },
];

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
let levelTotalMarios = 0; // total enemies spawned at level start
let comboCount = 0;
let comboDisplayTimer = 0;
let levelTimer = 0;       // frames elapsed in current level
const TIME_BONUS_MAX = 3000; // max bonus at 0 seconds
const TIME_PER_FRAME = 1 / 60;
let enterWasPressed = false;
let escapeWasPressed = false;
let leftWasPressed = false;
let rightWasPressed = false;
let totalScore = 0;
let highScore = parseInt(localStorage.getItem('mushroomHighScore') || '0');
let hudScoreDisplay = 0; // animated score counter
let unlockedLevels = parseInt(localStorage.getItem('mushroomUnlockedLevels') || '1');
let selectedLevelIdx = 0;
let soundMuted = false;
let difficulty = localStorage.getItem('mushroomDifficulty') || 'normal';

// === LEVEL BEST TIMES ===
let levelBestTimes = [];
try { levelBestTimes = JSON.parse(localStorage.getItem('mushroomLevelTimes') || '[]'); } catch { levelBestTimes = []; }
let levelCompletionTime = 0;   // seconds spent on last completed level
let isNewLevelTimeRecord = false;

// === MUSHROOM COLOR CUSTOMIZATION ===
const MUSHROOM_COLORS = [
    { name: 'Красный',   cap: '#e02020', capLight: '#ff4444' },
    { name: 'Синий',     cap: '#2060e0', capLight: '#4488ff' },
    { name: 'Зелёный',   cap: '#20a030', capLight: '#44cc55' },
    { name: 'Жёлтый',    cap: '#ccaa00', capLight: '#ffdd22' },
    { name: 'Фиолетовый',cap: '#9020c0', capLight: '#cc55ee' },
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
            g.connect(audioCtx.destination);
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
    if (muted) {
        stopBGM();
    } else if (gameState === 'PLAYING' && audioCtx) {
        startBGM(getBGMThemeForLevel(currentLevel));
    }
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
    if (levelIndex >= 7) {
        const types = ['armored', 'armored', 'fast', 'jumpy', 'armored', 'fast', 'jumpy', 'armored', 'fast'];
        return types[spawnIdx % types.length];
    }
    const types = ['armored', 'fast', 'jumpy', 'fast', 'armored', 'fast'];
    return types[spawnIdx % types.length];
}

function loadLevel(index) {
    const lvlIndex = index < LEVELS.length ? index : (index % LEVELS.length);
    const lvl = LEVELS[lvlIndex];
    const speedMult = index >= LEVELS.length ? 1 + (index - LEVELS.length) * 0.15 : 1;

    platforms = lvl.platforms.map(p => new Platform(p.x, p.y, p.w, p.h, p.moveAxis, p.moveRange, p.moveSpeed));

    const diffMult = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.3 : 1;
    const speed = lvl.marioSpeed * speedMult * diffMult;
    marios = lvl.marioSpawns.map((s, i) => new Mario(s.x, s.y, speed, getMarioType(index, i)));

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
    fireballs = [];

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
    hudScoreDisplay = 0;
    levelTotalMarios = marios.length;
    coins = [
        ...(lvl.coinSpawns || []).map(c => new Coin(c.x, c.y)),
        ...(lvl.doubleCoinSpawns || []).map(c => new Coin(c.x, c.y, 100)),
    ];
    stars = (lvl.starSpawns || []).map(s => new Star(s.x, s.y));
    shields = (lvl.shieldSpawns || []).map(s => new Shield(s.x, s.y));
    bombs = (lvl.bombSpawns || []).map(b => new Bomb(b.x, b.y));
    springPads = (lvl.springSpawns || []).map(s => new SpringPad(s.x, s.y));
    speedBoosts = (lvl.speedBoostSpawns || []).map(s => new SpeedBoost(s.x, s.y));
    magnets = (lvl.magnetSpawns || []).map(m => new Magnet(m.x, m.y));
    freezes = (lvl.freezeSpawns || []).map(f => new Freeze(f.x, f.y));
    checkpoints = (lvl.checkpointSpawns || []).map(c => new Checkpoint(c.x, c.y));
    if (player) player.checkpointSpawn = null; // reset checkpoint on new level
    isBossLevel = !!lvl.isBossLevel;
    bossMarco = isBossLevel ? new BossMarco(620, 380) : null;
    initWeather(index);
    // Start BGM appropriate to this level's theme
    if (audioCtx && !soundMuted) startBGM(getBGMThemeForLevel(index));
}

function startGame() {
    resetAchievements();
    resetRunStats();
    startGameFromLevel(0);
}

function startGameFromLevel(level) {
    currentLevel = level;
    totalScore = 0;
    player = null;
    stars = [];
    loadLevel(level);
    player.lives = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : 3;
    player.score = 0;
    gameState = 'PLAYING';
}

// === COLLISION DETECTION ===
function checkCoinCollisions() {
    for (const coin of coins) {
        if (coin.collected) continue;
        if (aabb(player, coin)) {
            coin.collected = true;
            const pts = coin.bonus || 50;
            player.score += pts;
            totalScore += pts;
            totalCoinsCollectedRun++;
            runStats.coinsCollected++;
            if (totalCoinsCollectedRun >= 10) unlockAchievement('coinCollector');
            particles.push(new Particle(coin.x, coin.y - 5, `+${pts}`, pts > 50 ? '#ff9900' : '#ffcc00'));
            playSound('coin');
        }
    }
    coins = coins.filter(c => !c.collected);
}

function checkPlayerMarioCollisions() {
    if (player.invincibleTimer > 0 && player.starTimer <= 0) return;

    for (const mario of marios) {
        if (!mario.isAlive) continue;
        if (!aabb(player, mario)) continue;

        // Star power: kill on any contact
        if (player.starTimer > 0) {
            mario.stomp();
            comboCount++;
            const points = 100 * comboCount;
            player.score += points;
            totalScore += points;
            comboDisplayTimer = 100;
            const comboColors = ['#ffff00', '#ffaa00', '#ff6600', '#ff2200', '#ff00ff'];
            const pColor = comboColors[Math.min(comboCount - 1, 4)];
            const pText = comboCount > 1 ? `x${comboCount}  +${points}` : `+${points}`;
            particles.push(new Particle(mario.x, mario.y - 10, pText, pColor));
            shakeTimer = Math.min(6 + comboCount, 12);
            shakeIntensity = Math.min(3 + comboCount * 0.5, 7);
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
            if (killed) {
                runStats.enemiesKilled++;
                unlockAchievement('firstStomp');
                comboCount++;
                if (comboCount > runStats.maxCombo) runStats.maxCombo = comboCount;
                if (comboCount >= 5) unlockAchievement('comboMaster');
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
                // Armor absorbed — no score, just a bounce
                particles.push(new Particle(mario.x, mario.y - 10, 'БРОНЯ!', '#aaaaaa'));
                shakeTimer = 4;
                shakeIntensity = 3;
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
    // Sky gradient — changes based on level
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    let mountainColor, hillColorLight, hillColorDark, cloudAlpha;

    if (gameState === 'PLAYING' && currentLevel >= 6) {
        // Level 7-8: Night sky with stars
        skyGrad.addColorStop(0, '#05051a');
        skyGrad.addColorStop(0.5, '#0d0d2e');
        skyGrad.addColorStop(1, '#161630');
        mountainColor = '#1a1a3a';
        hillColorLight = '#0f2010';
        hillColorDark  = '#0a150b';
        cloudAlpha = 0.15;
    } else if (gameState === 'PLAYING' && currentLevel >= 4) {
        // Levels 5-6: Dusk/Twilight
        skyGrad.addColorStop(0, '#1a0530');
        skyGrad.addColorStop(0.5, '#3d1060');
        skyGrad.addColorStop(1, '#7a2060');
        mountainColor = '#3a2060';
        hillColorLight = '#2a1a40';
        hillColorDark  = '#1e1030';
        cloudAlpha = 0.25;
    } else {
        // Levels 1-4: Day sky
        skyGrad.addColorStop(0, '#3060c0');
        skyGrad.addColorStop(0.5, '#5c94fc');
        skyGrad.addColorStop(1, '#88bbff');
        mountainColor = '#4a6fa0';
        hillColorLight = '#3a7c2f';
        hillColorDark  = '#2d6025';
        cloudAlpha = 0.85;
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Night stars (level 7 only)
    if (gameState === 'PLAYING' && currentLevel >= 6) {
        ctx.save();
        const starSeed = 42; // deterministic
        for (let i = 0; i < 60; i++) {
            const sx = ((i * 137.508 + starSeed) % W);
            const sy = ((i * 97.31 + starSeed * 0.5) % (H * 0.65));
            const sr = 0.5 + (i % 3) * 0.5;
            const twinkle = 0.4 + Math.abs(Math.sin(Date.now() * 0.002 + i)) * 0.6;
            ctx.globalAlpha = twinkle;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Distant mountains (layer 1 — slowest parallax)
    const mo = prlx(-0.04);
    ctx.fillStyle = mountainColor;
    drawMountain(80 + mo, 460, 200, 180);
    drawMountain(300 + mo, 460, 280, 220);
    drawMountain(580 + mo, 460, 250, 190);
    drawMountain(750 + mo, 460, 180, 160);

    // Clouds (layer 2 — medium parallax) — dimmed at night/dusk
    const co = prlx(-0.08);
    ctx.save();
    ctx.globalAlpha = cloudAlpha;
    drawCloud3D(100 + co, 60, 60);
    drawCloud3D(350 + co, 90, 45);
    drawCloud3D(600 + co, 50, 55);
    drawCloud3D(750 + co, 110, 35);
    ctx.restore();

    // Hills (layer 3 — fastest parallax)
    const ho = prlx(-0.14);
    drawHill3D(100 + ho, 460, 160, 80, hillColorLight, hillColorDark);
    drawHill3D(500 + ho, 460, 200, 100, hillColorLight, hillColorDark);
    drawHill3D(300 + ho, 460, 140, 60,
        gameState === 'PLAYING' && currentLevel >= 4 ? hillColorDark : '#4a8c3f',
        gameState === 'PLAYING' && currentLevel >= 4 ? '#0a0a18'     : '#3a7c2f');
    drawHill3D(700 + ho, 460, 120, 50,
        gameState === 'PLAYING' && currentLevel >= 4 ? hillColorDark : '#4a8c3f',
        gameState === 'PLAYING' && currentLevel >= 4 ? '#0a0a18'     : '#3a7c2f');
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

    // Score (animated display)
    const scoreShown = Math.floor(hudScoreDisplay);
    ctx.fillStyle = C.textShadow;
    ctx.fillText(`SCORE: ${scoreShown}`, 22, 32);
    ctx.fillStyle = C.hud;
    ctx.fillText(`SCORE: ${scoreShown}`, 20, 30);

    // Lives — heart icons
    for (let i = 0; i < 3; i++) {
        ctx.font = '20px monospace';
        ctx.fillStyle = i < player.lives ? '#ff3333' : 'rgba(120,40,40,0.45)';
        ctx.fillText('♥', 20 + i * 22, 57);
    }

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

    // Freeze timer bar
    if (player && player.freezeTimer > 0) {
        const barW = 140;
        const barH = 10;
        const barX = W / 2 - barW / 2;
        const barY = 68
            + (player.starTimer > 0 ? 18 : 0)
            + (player.speedBoostTimer > 0 ? 18 : 0)
            + (player.magnetTimer > 0 ? 18 : 0);
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

    // Enemy progress bar (thin strip below top HUD row, hidden on boss level)
    if (levelTotalMarios > 0 && !isBossLevel) {
        const aliveCount = marios.filter(m => m.isAlive).length;
        const frac = aliveCount / levelTotalMarios;
        const barW = W - 4;
        const barH = 6;
        const barX = 2;
        const barY = 30;
        const isLast = aliveCount === 1;
        const pulse = isLast ? 0.7 + Math.abs(Math.sin(Date.now() * 0.012)) * 0.3 : 1;
        // Color: green → yellow → red based on remaining fraction
        const r = Math.round(frac < 0.5 ? 255 * (frac * 2) : 255);
        const g = Math.round(frac >= 0.5 ? 255 * ((1 - frac) * 2) : 255);
        ctx.save();
        ctx.globalAlpha = 0.85 * pulse;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = `rgb(${r},${g},30)`;
        ctx.fillRect(barX, barY, barW * frac, barH);
        // Bright top highlight
        ctx.globalAlpha = 0.3 * pulse;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(barX, barY, barW * frac, barH * 0.4);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Enemy counter (bottom-left area)
    if (levelTotalMarios > 0 && !isBossLevel) {
        const aliveCount = marios.filter(m => m.isAlive).length;
        const isLast = aliveCount === 1;
        const enemyColor = isLast ? '#ff4444' : '#ffffff';
        const pulse = isLast ? 1 + Math.sin(Date.now() * 0.008) * 0.12 : 1;
        ctx.save();
        ctx.font = `bold ${Math.round(13 * pulse)}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(`ВРАГИ: ${aliveCount}/${levelTotalMarios}`, 22, H - 15);
        ctx.fillStyle = enemyColor;
        ctx.fillText(`ВРАГИ: ${aliveCount}/${levelTotalMarios}`, 20, H - 17);
        ctx.restore();
    }

    // Mute icon (bottom-right, clickable area)
    ctx.save();
    ctx.font = '18px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = soundMuted ? 'rgba(255,80,80,0.85)' : 'rgba(255,255,255,0.7)';
    ctx.fillText(soundMuted ? '🔇' : '🔊', W - 10, H - 10);
    ctx.textAlign = 'left';
    ctx.restore();

    // Jump state indicator (double jump or wall jump)
    if (player && !player.isGrounded) {
        ctx.save();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        if (player.wallSlideDir !== 0 && player.wallJumpLockTimer <= 0) {
            ctx.fillStyle = 'rgba(255,220,80,0.92)';
            ctx.fillText('↑ ПРЫЖОК ОТ СТЕНЫ!', W / 2, H - 15);
        } else if (player.canDoubleJump) {
            ctx.fillStyle = 'rgba(100,200,255,0.8)';
            ctx.fillText('2x прыжок!', W / 2, H - 15);
        }
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
    drawTitle("←→ / AD — Движение  |  ↑ / W / SPACE — Прыжок", 428, 12, '#aaaaaa');
    drawTitle("На мобильном: кнопки ◀ ▶ ▲  |  M — звук", 447, 11, '#888888');

    // Mini leaderboard on menu
    const board = loadLeaderboard();
    if (board.length > 0) {
        ctx.save();
        const medals = ['🥇', '🥈', '🥉'];
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText('РЕКОРДЫ:', W / 2, 468);
        board.forEach((entry, i) => {
            ctx.font = '11px monospace';
            ctx.fillStyle = i === 0 ? '#ffcc00' : '#aaaaaa';
            ctx.fillText(`${medals[i]} ${entry.score}`, W / 2 - 80 + i * 80, 484);
        });
        ctx.textAlign = 'left';
        ctx.restore();
    }
}

function renderGameOver() {
    drawBackground();

    drawTitle("GAME OVER", 150, 42, '#ff4444');
    drawTitle(`Счёт: ${totalScore}`, 200, 22, '#ffcc00');

    if (totalScore >= highScore && highScore > 0) {
        drawTitle("НОВЫЙ РЕКОРД!", 230, 20, '#00ff00');
    }

    // Leaderboard top-3
    const board = loadLeaderboard();
    if (board.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(W / 2 - 130, 255, 260, board.length * 28 + 30, 10);
        ctx.fill();

        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffdd00';
        ctx.fillText('🏆 ТАБЛИЦА РЕКОРДОВ', W / 2, 275);

        const medals = ['🥇', '🥈', '🥉'];
        board.forEach((entry, i) => {
            ctx.font = '12px monospace';
            ctx.fillStyle = i === 0 ? '#ffcc00' : i === 1 ? '#cccccc' : '#cd7f32';
            ctx.fillText(`${medals[i] || (i + 1 + '.')} ${entry.score}   ${entry.date}`, W / 2, 298 + i * 26);
        });
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Run statistics panel
    ctx.save();
    const panelX = W / 2 - 160;
    const panelY = board.length > 0 ? 255 + board.length * 28 + 40 : 260;
    const statData = [
        ['⚔️', 'Убито врагов', runStats.enemiesKilled],
        ['💰', 'Монет собрано', runStats.coinsCollected],
        ['🔥', 'Макс. комбо',   runStats.maxCombo],
        ['🏁', 'Уровней пройдено', runStats.levelsCleared],
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, 320, statData.length * 24 + 24, 10);
    ctx.fill();
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaddff';
    ctx.fillText('📊 СТАТИСТИКА', W / 2, panelY + 16);
    statData.forEach(([icon, label, val], i) => {
        const sy = panelY + 16 + (i + 1) * 24;
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`${icon} ${label}:`, panelX + 12, sy);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffee88';
        ctx.fillText(String(val), panelX + 308, sy);
    });
    ctx.textAlign = 'left';
    ctx.restore();

    drawTitle("ENTER — Играть снова", H - 20, 18, C.text);
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

    drawTitle('🏆 ТЫ ПОБЕДИЛ! 🏆', 145, 40, '#ffee00');
    drawTitle('Финальный Марио повержен!', 198, 18, '#00ff88');
    drawTitle(`Счёт: ${totalScore}`, 232, 22, '#ffcc00');
    if (totalScore >= highScore && highScore > 0) drawTitle('НОВЫЙ РЕКОРД! 🎉', 262, 18, '#00ff44');

    // Big mushroom
    ctx.save();
    const mcols = getMushroomColors();
    const bigSprite = MUSHROOM_SPRITE.map(row => row.map(c => {
        if (c === C.mushroomCap) return mcols.cap;
        if (c === C.mushroomCapLight) return mcols.capLight;
        return c;
    }));
    const spx = 6;
    drawPixelSprite(W / 2 - (14 * spx) / 2, 285, spx, bigSprite);
    ctx.restore();

    // Stats
    const panelX = W / 2 - 160;
    const panelY = 385;
    const statData = [
        ['⚔️', 'Убито врагов', runStats.enemiesKilled],
        ['💰', 'Монет собрано', runStats.coinsCollected],
        ['🔥', 'Макс. комбо',   runStats.maxCombo],
        ['🏁', 'Уровней пройдено', runStats.levelsCleared],
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

    drawTitle('ENTER — В меню', H - 12, 16, C.text);
}

function renderLevelComplete() {
    drawBackground();
    platforms.forEach(p => p.render());

    drawTitle(`УРОВЕНЬ ${currentLevel + 1} ПРОЙДЕН!`, 200, 32, '#00ff00');
    drawTitle(`Счёт: ${player.score}`, 245, 20, '#ffcc00');

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
}

function renderDifficultySelect() {
    drawBackground();
    drawTitle('ВЫБОР СЛОЖНОСТИ', 90, 30, '#ffcc00');

    const opts = [
        {
            key: 'easy',
            name: 'ЛЕГКО',
            color: 'rgba(30,120,200,0.85)',
            selColor: 'rgba(60,180,255,0.92)',
            border: '#88ccff',
            icon: '😊',
            lines: ['Скорость врагов ×0.7', '5 жизней', 'Бонус времени ×2', 'Для новичков'],
        },
        {
            key: 'normal',
            name: 'НОРМАЛЬНО',
            color: 'rgba(30,130,60,0.85)',
            selColor: 'rgba(60,200,80,0.92)',
            border: '#88ffaa',
            icon: '😐',
            lines: ['Стандартная скорость', '3 жизни', 'Обычный бонус', 'Оригинальный баланс'],
        },
        {
            key: 'hard',
            name: 'СЛОЖНО',
            color: 'rgba(160,30,30,0.85)',
            selColor: 'rgba(230,60,60,0.92)',
            border: '#ff8888',
            icon: '😤',
            lines: ['Скорость врагов ×1.3', '2 жизни', 'Бонус времени ×0.5', 'Для мастеров'],
        },
    ];

    const cardW = 195;
    const cardH = 200;
    const gap = 18;
    const totalW = opts.length * cardW + (opts.length - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = 160;

    opts.forEach((opt, i) => {
        const bx = startX + i * (cardW + gap);
        const by = startY;
        const isSel = difficulty === opt.key;

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

    drawTitle('← → — Выбор   ENTER — Начать   ESC — Назад', 390, 13, '#aaaaaa');

    // Show current difficulty label
    const labels = { easy: 'ЛЁГКИЙ', normal: 'НОРМАЛЬНЫЙ', hard: 'СЛОЖНЫЙ' };
    drawTitle(`Выбрано: ${labels[difficulty] || difficulty}`, 420, 16, '#ffffaa');
}

function renderLevelSelect() {
    drawBackground();

    drawTitle('ВЫБОР УРОВНЯ', 90, 30, '#ffcc00');

    const n = LEVELS.length;
    const gap = n > 5 ? 10 : 16;
    const boxW = Math.min(120, Math.floor((W - 40 - gap * (n - 1)) / n));
    const boxH = 100;
    const totalW = n * boxW + (n - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = 165;

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
    const levelNames = ['Начало', 'Равнина', 'Пропасти', 'Лабиринт', 'Финал', 'Небо', 'Хаос', 'Кошмар', 'БОСС'];
    if (selectedLevelIdx < unlockedLevels) {
        drawTitle(levelNames[selectedLevelIdx] || `Уровень ${selectedLevelIdx + 1}`, 310, 18, '#88ffaa');
    }

    const diffLabel = difficulty === 'easy' ? '😊 ЛЕГКО' : difficulty === 'hard' ? '😤 СЛОЖНО' : '😐 НОРМА';
    drawTitle(`Сложность: ${diffLabel}  (ESC → изменить)`, 350, 12, '#aaddff');
    drawTitle('← → — Выбор   ENTER — Играть   ESC — Назад', 380, 13, '#aaaaaa');
    if (selectedLevelIdx >= unlockedLevels) {
        drawTitle('Уровень заблокирован! Пройди предыдущий.', 405, 12, '#ff6666');
    }

    // Mushroom color selector
    ctx.save();
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('ЦВЕТ ГРИБА:', W / 2, 430);
    const dotR = 14;
    const dotSpacing = 36;
    const dotsStartX = W / 2 - (MUSHROOM_COLORS.length - 1) * dotSpacing / 2;
    MUSHROOM_COLORS.forEach((col, i) => {
        const dx = dotsStartX + i * dotSpacing;
        const dy = 448;
        // Selected ring
        if (i === mushroomColorIdx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(dx, dy, dotR + 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = col.cap;
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fill();
        // Dot highlight
        ctx.fillStyle = col.capLight;
        ctx.beginPath();
        ctx.arc(dx - 4, dy - 4, 4, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.font = '10px monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText('Z / X — смена цвета', W / 2, 475);
    ctx.textAlign = 'left';
    ctx.restore();
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
        const levelNames = ['Начало', 'Равнина', 'Пропасти', 'Лабиринт', 'Финал', 'Небо', 'Хаос', 'Кошмар', 'БОСС'];
        const name = levelNames[currentLevel] || `Уровень ${currentLevel + 1}`;
        drawTitle(name, H / 2 + 50, 20, '#aaffaa');
        ctx.restore();
    }
}

// === UPDATE ===
let levelCompleteTimer = 0;

function update() {
    switch (gameState) {
        case 'MENU':
            if (isEnter() && !enterWasPressed) {
                initAudio();
                gameState = 'DIFFICULTY_SELECT';
            }
            break;

        case 'DIFFICULTY_SELECT': {
            const opts = ['easy', 'normal', 'hard'];
            const idx = opts.indexOf(difficulty);
            if (isLeft() && !leftWasPressed && idx > 0) {
                difficulty = opts[idx - 1];
                localStorage.setItem('mushroomDifficulty', difficulty);
            }
            if (isRight() && !rightWasPressed && idx < 2) {
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
            break;
        }

        case 'LEVEL_SELECT':
            if (isLeft() && !leftWasPressed && selectedLevelIdx > 0) {
                selectedLevelIdx--;
            }
            if (isRight() && !rightWasPressed && selectedLevelIdx < Math.min(LEVELS.length, unlockedLevels) - 1) {
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
            coins = coins.filter(c => c.update());
            stars = stars.filter(s => s.update());
            shields = shields.filter(s => s.update());
            bombs = bombs.filter(b => b.update());
            springPads.forEach(sp => sp.update());
            if (bossMarco) { if (!bossMarco.update()) bossMarco = null; }
            checkPlayerMarioCollisions();
            checkPlayerBossCollision();
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
            fireballs = fireballs.filter(fb => fb.update());
            checkFireballCollisions();
            checkpoints.forEach(cp => cp.update());
            updateWeather();
            updateAchievementToasts();

            if (shakeTimer > 0) shakeTimer--;
            if (comboDisplayTimer > 0) comboDisplayTimer--;
            levelTimer++;
            // Animate HUD score display
            if (hudScoreDisplay < player.score) {
                hudScoreDisplay = Math.min(player.score, hudScoreDisplay + Math.max(1, (player.score - hudScoreDisplay) * 0.18));
            }

            // Mute toggle with M key (only when not paused)
            if (keys['KeyM'] && !keys['_muteWas']) {
                setMuted(!soundMuted);
            }
            keys['_muteWas'] = keys['KeyM'];

            // Check level complete (boss level needs boss defeated, regular needs all marios dead)
            const bossCleared = !isBossLevel || bossMarco === null;
            if (marios.filter(m => m.isAlive).length === 0 && marios.length === 0 && bossCleared) {
                // Time bonus: max 3000 pts at <5s, scales to 0 at 60s
                const elapsed = levelTimer / 60;
                const timeBonusMult = difficulty === 'easy' ? 2.0 : difficulty === 'hard' ? 0.5 : 1.0;
                const timeBonus = Math.max(0, Math.round(TIME_BONUS_MAX * timeBonusMult * (1 - elapsed / 60)));
                if (timeBonus > 0) {
                    player.score += timeBonus;
                    totalScore += timeBonus;
                    particles.push(new Particle(W / 2 - 60, H / 2 - 60, `ВРЕМЯ +${timeBonus}`, '#00ffcc'));
                }
                gameState = 'LEVEL_COMPLETE';
                levelCompleteTimer = 60; // brief pause before transition
                playSound('levelup');
                // Save best level time
                levelCompletionTime = levelTimer / 60;
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
            break;

        case 'LEVEL_COMPLETE':
            levelCompleteTimer--;
            if (levelCompleteTimer <= 0) {
                runStats.levelsCleared++;
                if (isBossLevel) {
                    // Final boss defeated → Victory!
                    if (totalScore > highScore) {
                        highScore = totalScore;
                        localStorage.setItem('mushroomHighScore', String(highScore));
                    }
                    submitScore(totalScore);
                    stopBGM();
                    gameState = 'VICTORY';
                } else {
                    currentLevel++;
                    // Unlock next level (up to LEVELS.length)
                    if (currentLevel < LEVELS.length && currentLevel >= unlockedLevels) {
                        unlockedLevels = currentLevel + 1;
                        localStorage.setItem('mushroomUnlockedLevels', String(unlockedLevels));
                    }
                    loadLevel(currentLevel);
                    gameState = 'LEVEL_TRANSITION';
                    levelTransitionTimer = 0;
                }
            }
            break;

        case 'VICTORY':
            if (isEnter() && !enterWasPressed) {
                gameState = 'MENU';
            }
            break;

        case 'LEVEL_TRANSITION':
            levelTransitionTimer++;
            if (levelTransitionTimer >= TRANSITION_TOTAL) {
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
                stopBGM();
                gameState = 'MENU';
                player = null;
            }
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

        case 'DIFFICULTY_SELECT':
            renderDifficultySelect();
            break;

        case 'LEVEL_SELECT':
            renderLevelSelect();
            break;

        case 'PLAYING':
            drawBackground();
            renderWeather();
            platforms.forEach(p => p.render());
            coins.forEach(c => c.render());
            stars.forEach(s => s.render());
            shields.forEach(s => s.render());
            checkpoints.forEach(cp => cp.render());
            springPads.forEach(sp => sp.render());
            speedBoosts.forEach(sb => sb.render());
            magnets.forEach(m => m.render());
            freezes.forEach(f => f.render());
            fireballs.forEach(fb => fb.render());
            bombs.forEach(b => b.render());
            marios.forEach(m => m.render());
            if (bossMarco) bossMarco.render();
            player.render();
            particles.forEach(p => p.render());
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
            drawHUD();
            renderAchievementToasts();
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
            marios.forEach(m => m.render());
            if (bossMarco) bossMarco.render();
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
