export class Chicken {
    constructor(game, id, emoji) {
        this.game = game;
        this.id = id;
        this.emoji = emoji;
        
        // Initial Position (relative to chicken coop)
        // Default coop: left 10%, top 56% -> x: 128, y: 403
        this.x = 128 + Math.random() * 80 - 40;
        this.y = 403 + Math.random() * 60 - 30;
        
        this.targetX = this.x;
        this.targetY = this.y;
        
        this.speed = 0.4 + Math.random() * 0.3; // speed: 0.4 to 0.7
        
        this.state = 'IDLE'; // IDLE, WALK, PECKING
        this.stateTimer = 30 + Math.random() * 60; // frames
        
        this.peckTimeout = null;
        
        this.createDOMElement();
        this.updateDOMPosition();
    }
    
    createDOMElement() {
        this.el = document.createElement('div');
        this.el.id = `chicken-${this.id}`;
        this.el.className = 'chicken-character idle';
        this.el.innerHTML = `
            <div class="chicken-sprite">
                <div class="chicken-shadow"></div>
                <div class="chicken-emoji">${this.emoji}</div>
            </div>
            <div class="action-bubble chicken-bubble">
                <span class="bubble-text">Cục tác!</span>
            </div>
        `;
        
        const parent = document.getElementById('game-world-objects');
        if (parent) {
            parent.appendChild(this.el);
        }
        
        this.el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.game.antigravityActive) {
                this.triggerPush();
            } else {
                this.peck();
            }
        });
    }
    
    update() {
        if (this.state === 'PECKING') {
            return;
        }
        
        if (this.state === 'WALK') {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > this.speed) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
                
                if (dx > 0.3) {
                    this.el.classList.add('flip');
                } else if (dx < -0.3) {
                    this.el.classList.remove('flip');
                }
            } else {
                this.x = this.targetX;
                this.y = this.targetY;
                
                // Randomly choose to peck or idle
                this.setState(Math.random() < 0.4 ? 'PECKING' : 'IDLE');
                if (this.state === 'PECKING') {
                    this.game.playSFX('plant'); // small rustling sound
                    setTimeout(() => {
                        this.setState('IDLE');
                    }, 1000 + Math.random() * 1000);
                }
            }
            this.updateDOMPosition();
        } else if (this.state === 'IDLE') {
            this.stateTimer--;
            if (this.stateTimer <= 0) {
                // Find coop position in real-time
                const coopEl = document.getElementById('chicken-coop');
                let coopLeft = 10;
                let coopTop = 56;
                if (coopEl) {
                    coopLeft = parseFloat(coopEl.style.left) || coopLeft;
                    coopTop = parseFloat(coopEl.style.top) || coopTop;
                }
                const coopCenterX = (coopLeft / 100) * 1280 + 50;
                const coopCenterY = (coopTop / 100) * 720 + 70;
                
                // Choose a random position near coop
                const randomX = coopCenterX + (Math.random() * 120 - 60);
                const randomY = coopCenterY + (Math.random() * 80 - 40);
                this.setTarget(randomX, randomY);
            }
        }
    }
    
    setState(newState) {
        if (this.state === newState) return;
        
        this.el.classList.remove('idle', 'walking', 'pecking');
        this.state = newState;
        
        if (newState === 'IDLE') {
            this.el.classList.add('idle');
            this.stateTimer = 90 + Math.random() * 150;
        } else if (newState === 'WALK') {
            this.el.classList.add('walking');
        } else if (newState === 'PECKING') {
            this.el.classList.add('pecking');
        }
    }
    
    setTarget(tx, ty) {
        this.targetX = tx;
        this.targetY = ty;
        this.setState('WALK');
    }
    
    updateDOMPosition() {
        const leftPct = (this.x / 1280) * 100;
        const topPct = (this.y / 720) * 100;
        this.el.style.left = `${leftPct.toFixed(2)}%`;
        this.el.style.top = `${topPct.toFixed(2)}%`;
        
        // Z-Index sorting (isometric)
        this.el.style.zIndex = Math.floor(this.y) + 45;
    }
    
    peck() {
        this.setState('PECKING');
        
        // Sound and particles
        this.game.playSFX('plant');
        this.game.createParticles(this.x, this.y + 10, 5, 'dirt');
        
        const bubbleTextEl = this.el.querySelector('.bubble-text');
        if (bubbleTextEl) {
            const chickenPhrases = ['Cục tác!', 'Cục ta cục tác!', 'Chiếp chiếp!', 'Ó ó o!'];
            bubbleTextEl.textContent = chickenPhrases[Math.floor(Math.random() * chickenPhrases.length)];
        }
        
        if (this.peckTimeout) {
            clearTimeout(this.peckTimeout);
        }
        
        this.peckTimeout = setTimeout(() => {
            this.setState('IDLE');
        }, 1500);
    }
    
    triggerPush() {
        const emojiEl = this.el.querySelector('.chicken-emoji');
        if (emojiEl) {
            emojiEl.classList.add('antigravity-pushed');
            this.game.playSFX('bounce');
            emojiEl.addEventListener('animationend', () => {
                emojiEl.classList.remove('antigravity-pushed');
            }, { once: true });
        }
    }
}
