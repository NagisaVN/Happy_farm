import { Animation } from './Animation.js';

export class Farmer {
    constructor(game) {
        this.game = game;
        this.el = document.getElementById('farmer');
        this.canvas = document.getElementById('farmer-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Initial Position (relative to 1280x720 canvas in pixels)
        // Default starting position: 45% left, 40% top
        this.x = 0.45 * 1280;
        this.y = 0.40 * 720;

        this.targetX = this.x;
        this.targetY = this.y;

        this.speed = 1.5; // 1.5 pixels per frame

        this.state = 'IDLE'; // IDLE, WALK, DIG, PLANT, HARVEST
        this.direction = 'FRONT'; // FRONT, BACK, LEFT, RIGHT, FRONT_LEFT, FRONT_RIGHT, BACK_LEFT, BACK_RIGHT

        this.currentFrame = 0;
        this.frameTimer = 0;
        
        // Animation config for frame limits and tick speeds
        this.animConfigs = {
            IDLE: { frames: 2, speed: 20 },      // Slow breathing
            WALK: { frames: 8, speed: 8 },       // Slower walk cycle matching speed
            DIG: { frames: 6, speed: 8 },        // Digging chops
            PLANT: { frames: 6, speed: 8 },      // Planting bends
            HARVEST: { frames: 6, speed: 8 }     // Harvesting swings
        };

        this.animation = new Animation();
        this.callback = null;

        // Visual shadow element
        this.createShadow();
        this.updateDOMPosition();

        // Click handler to trigger push under Anti-Gravity
        this.el.addEventListener('click', (e) => {
            if (this.game.antigravityActive) {
                e.stopPropagation();
                this.triggerPush();
            }
        });
    }

    createShadow() {
        // Check if shadow already exists, otherwise create it
        let shadow = this.el.querySelector('.farmer-shadow');
        if (!shadow) {
            shadow = document.createElement('div');
            shadow.className = 'farmer-shadow';
            // Insert it under the sprite container
            const spriteContainer = this.el.querySelector('.farmer-sprite');
            if (spriteContainer) {
                spriteContainer.insertBefore(shadow, spriteContainer.firstChild);
            }
        }
    }

    setTarget(tx, ty, callback = null) {
        this.targetX = tx;
        this.targetY = ty;
        this.callback = callback;
        
        if (Math.abs(this.targetX - this.x) > 5 || Math.abs(this.targetY - this.y) > 5) {
            this.setState('WALK');
        } else {
            this.setState('IDLE');
            if (this.callback) {
                const cb = this.callback;
                this.callback = null;
                cb();
            }
        }
    }

    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        this.currentFrame = 0;
        this.frameTimer = 0;

        // Update the bubble text or status
        let bubbleText = 'Zzz...';
        if (newState === 'WALK') bubbleText = 'Đang đi...';
        else if (newState === 'DIG') bubbleText = 'Đang cuốc...';
        else if (newState === 'PLANT') bubbleText = 'Đang gieo...';
        else if (newState === 'HARVEST') bubbleText = 'Gieo gặt!';
        
        const bubble = this.el.querySelector('.bubble-text');
        if (bubble) bubble.textContent = bubbleText;
    }

    updateDirection() {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;

        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

        // Diagonal thresholds
        const threshold = 15;

        if (dx > threshold && dy > threshold) {
            this.direction = 'FRONT_RIGHT';
        } else if (dx < -threshold && dy > threshold) {
            this.direction = 'FRONT_LEFT';
        } else if (dx > threshold && dy < -threshold) {
            this.direction = 'BACK_RIGHT';
        } else if (dx < -threshold && dy < -threshold) {
            this.direction = 'BACK_LEFT';
        } else if (Math.abs(dx) > Math.abs(dy)) {
            this.direction = dx > 0 ? 'RIGHT' : 'LEFT';
        } else {
            this.direction = dy > 0 ? 'FRONT' : 'BACK';
        }
    }

    update() {
        // 1. Handle Movement (Interpolation towards target)
        if (this.state === 'WALK') {
            this.updateDirection();
            
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > this.speed) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
                
                // Spawn footstep dirt particles occasionally
                if (Math.random() < 0.15) {
                    this.game.createParticles(this.x, this.y + 15, 1, 'dirt');
                }
            } else {
                this.x = this.targetX;
                this.y = this.targetY;
                this.setState('IDLE');
                
                if (this.callback) {
                    const cb = this.callback;
                    this.callback = null;
                    cb();
                }
            }
            this.updateDOMPosition();
        }

        // 2. Animate Sprite (Update Frame Index)
        const config = this.animConfigs[this.state];
        if (config) {
            this.frameTimer++;
            if (this.frameTimer >= config.speed) {
                this.frameTimer = 0;
                this.currentFrame = (this.currentFrame + 1) % config.frames;
            }
        }
    }

    updateDOMPosition() {
        // Convert pixel positions to CSS percentages of the 1280x720 viewport
        const leftPct = (this.x / 1280) * 100;
        const topPct = (this.y / 720) * 100;
        this.el.style.left = `${leftPct.toFixed(2)}%`;
        this.el.style.top = `${topPct.toFixed(2)}%`;

        // Update sorting z-index based on vertical y position (isometric layering)
        this.el.style.zIndex = Math.floor(this.y) + 50;
    }

    draw() {
        this.animation.draw(this.ctx, this.state, this.direction, this.currentFrame);
    }

    triggerPush() {
        const canvas = this.canvas;
        if (canvas) {
            canvas.classList.add('antigravity-pushed');
            this.game.playSFX('bounce');
            canvas.addEventListener('animationend', () => {
                canvas.classList.remove('antigravity-pushed');
            }, { once: true });
        }
    }
}
