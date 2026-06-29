export class Cow {
    constructor(game, id) {
        this.game = game;
        this.id = id;
        this.emoji = '🐄';
        
        // Initial Position (relative to cow pen)
        // Default cow pen: left 70%, top 18% -> x: 896, y: 130
        this.x = 896 + Math.random() * 80 - 40;
        this.y = 130 + Math.random() * 30 - 15;
        
        this.targetX = this.x;
        this.targetY = this.y;
        
        this.speed = 0.2 + Math.random() * 0.2; // Cows walk very slowly: 0.2 to 0.4
        
        this.state = 'IDLE'; // IDLE, WALK, MOOING
        this.stateTimer = 60 + Math.random() * 120;
        
        this.mooTimeout = null;
        
        this.createDOMElement();
        this.updateDOMPosition();
    }
    
    createDOMElement() {
        this.el = document.createElement('div');
        this.el.id = `cow-${this.id}`;
        this.el.className = 'cow-character idle';
        this.el.innerHTML = `
            <div class="cow-sprite">
                <div class="cow-shadow"></div>
                <div class="cow-emoji">${this.emoji}</div>
            </div>
            <div class="action-bubble cow-bubble">
                <span class="bubble-text">Mooo!</span>
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
                this.moo();
            }
        });
    }
    
    update() {
        if (this.state === 'MOOING') {
            return;
        }
        
        if (this.state === 'WALK') {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > this.speed) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
                
                if (dx > 0.2) {
                    this.el.classList.add('flip');
                } else if (dx < -0.2) {
                    this.el.classList.remove('flip');
                }
            } else {
                this.x = this.targetX;
                this.y = this.targetY;
                this.setState('IDLE');
            }
            this.updateDOMPosition();
        } else if (this.state === 'IDLE') {
            this.stateTimer--;
            if (this.stateTimer <= 0) {
                // Find pen position in real-time
                const penEl = document.getElementById('cow-pen');
                let penLeft = 70;
                let penTop = 18;
                if (penEl) {
                    penLeft = parseFloat(penEl.style.left) || penLeft;
                    penTop = parseFloat(penEl.style.top) || penTop;
                }
                const penCenterX = (penLeft / 100) * 1280 + 60;
                const penCenterY = (penTop / 100) * 720 + 65;
                
                // Choose random spot inside pen
                const randomX = penCenterX + (Math.random() * 80 - 40);
                const randomY = penCenterY + (Math.random() * 30 - 15);
                this.setTarget(randomX, randomY);
            }
        }
    }
    
    setState(newState) {
        if (this.state === newState) return;
        
        this.el.classList.remove('idle', 'walking', 'mooing');
        this.state = newState;
        
        if (newState === 'IDLE') {
            this.el.classList.add('idle');
            this.stateTimer = 180 + Math.random() * 240; // Idle for longer
        } else if (newState === 'WALK') {
            this.el.classList.add('walking');
        } else if (newState === 'MOOING') {
            this.el.classList.add('mooing');
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
        
        // Z-Index sorting (isometric) - slightly below the fence posts
        this.el.style.zIndex = Math.floor(this.y) + 40;
    }
    
    moo() {
        this.setState('MOOING');
        
        // Cow sound (low pitch osc bark / custom sound)
        this.game.playSFX('dig'); // Cow's low moo
        this.game.createParticles(this.x, this.y - 10, 8, 'spark');
        
        const bubbleTextEl = this.el.querySelector('.bubble-text');
        if (bubbleTextEl) {
            const cowPhrases = ['Mooo!', 'Ụ bò!', 'Muuuuuu!', 'Muuu!'];
            bubbleTextEl.textContent = cowPhrases[Math.floor(Math.random() * cowPhrases.length)];
        }
        
        if (this.mooTimeout) {
            clearTimeout(this.mooTimeout);
        }
        
        this.mooTimeout = setTimeout(() => {
            this.setState('IDLE');
        }, 1500);
    }
    
    triggerPush() {
        const emojiEl = this.el.querySelector('.cow-emoji');
        if (emojiEl) {
            emojiEl.classList.add('antigravity-pushed');
            this.game.playSFX('bounce');
            emojiEl.addEventListener('animationend', () => {
                emojiEl.classList.remove('antigravity-pushed');
            }, { once: true });
        }
    }
}
