export class Dog {
    constructor(game) {
        this.game = game;
        
        // Initial Position (near the farmhouse / pet house)
        // Farmhouse bounds correspond to x in [200, 450], y in [150, 300] on the 1280x720 stage
        this.x = 320;
        this.y = 200;
        
        this.targetX = this.x;
        this.targetY = this.y;
        
        this.speed = 0.8; // pixels per frame (slower than farmer's 1.5)
        
        this.state = 'IDLE'; // IDLE, WALK, BARKING
        this.stateTimer = 60 + Math.random() * 120; // frame counts before next action
        
        this.barkTimeout = null;
        
        this.createDOMElement();
        this.updateDOMPosition();
    }
    
    createDOMElement() {
        // Create the element
        this.el = document.createElement('div');
        this.el.id = 'pet-dog';
        this.el.className = 'pet-dog-character idle';
        this.el.innerHTML = `
            <div class="dog-sprite">
                <div class="dog-shadow"></div>
                <div class="dog-emoji">🐕</div>
            </div>
            <div class="action-bubble dog-bubble">
                <span class="bubble-text">Gâu gâu!</span>
            </div>
        `;
        
        // Append to #game-world-objects
        const parent = document.getElementById('game-world-objects');
        if (parent) {
            parent.appendChild(this.el);
        }
        
        // Click handler to bark
        this.el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent farmer movement
            if (this.game.antigravityActive) {
                this.triggerPush();
            } else {
                this.bark();
            }
        });
    }
    
    update() {
        // Check if Shiba is active
        const shibaActive = this.game.inventory && 
                            this.game.inventory.state && 
                            this.game.inventory.state.pets && 
                            this.game.inventory.state.pets.shiba && 
                            this.game.inventory.state.pets.shiba.active;
                            
        if (!shibaActive) {
            this.el.style.display = 'none';
            return;
        } else {
            this.el.style.display = 'block';
        }
        
        if (this.state === 'BARKING') {
            return; // Stay in place while barking
        }
        
        if (this.state === 'WALK') {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > this.speed) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
                
                // Flip direction class based on horizontal movement direction
                if (dx > 0.5) {
                    this.el.classList.add('flip');
                } else if (dx < -0.5) {
                    this.el.classList.remove('flip');
                }
            } else {
                this.x = this.targetX;
                this.y = this.targetY;
                this.setState('IDLE');
            }
            this.updateDOMPosition();
        } else if (this.state === 'IDLE') {
            // Countdown to next walk target
            this.stateTimer--;
            if (this.stateTimer <= 0) {
                // Select a random point near the farmhouse
                // Farmhouse boundaries: x in [200, 450], y in [150, 300]
                const randomX = 200 + Math.random() * 250;
                const randomY = 150 + Math.random() * 150;
                this.setTarget(randomX, randomY);
            }
        }
    }
    
    setState(newState) {
        if (this.state === newState) return;
        
        // Remove current state classes
        this.el.classList.remove('idle', 'walking', 'barking');
        
        this.state = newState;
        
        if (newState === 'IDLE') {
            this.el.classList.add('idle');
            // Wait between 2 to 5 seconds before walking again (assuming 60fps)
            this.stateTimer = 120 + Math.random() * 180;
        } else if (newState === 'WALK') {
            this.el.classList.add('walking');
        } else if (newState === 'BARKING') {
            this.el.classList.add('barking');
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
        
        // Layering depth (zIndex): slightly behind farmer (y + 50)
        this.el.style.zIndex = Math.floor(this.y) + 48;
    }
    
    bark() {
        this.setState('BARKING');
        
        // Play bark sound
        this.game.playSFX('bark');
        
        // Sparkle particles at the dog's mouth/face
        this.game.createParticles(this.x, this.y - 15, 12, 'spark');
        
        // Set speech bubble text
        const bubbleTextEl = this.el.querySelector('.bubble-text');
        if (bubbleTextEl) {
            const barkPhrases = ['Gâu gâu!', 'Woof woof!', 'Gâu!', 'Ẳng ẳng!'];
            bubbleTextEl.textContent = barkPhrases[Math.floor(Math.random() * barkPhrases.length)];
        }
        
        if (this.barkTimeout) {
            clearTimeout(this.barkTimeout);
        }
        
        this.barkTimeout = setTimeout(() => {
            this.setState('IDLE');
        }, 1500);
    }
    
    triggerPush() {
        const emojiEl = this.el.querySelector('.dog-emoji');
        if (emojiEl) {
            emojiEl.classList.add('antigravity-pushed');
            this.game.playSFX('bounce');
            emojiEl.addEventListener('animationend', () => {
                emojiEl.classList.remove('antigravity-pushed');
            }, { once: true });
        }
    }
}
