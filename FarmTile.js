import { CROP_CONFIGS } from './Seed.js';

export class FarmTile {
    constructor(game, id) {
        this.game = game;
        this.id = id;
        this.el = document.getElementById(`plot-${id}`);
        if (!this.el) {
            // Dynamically create element if grid is being built
            this.el = document.createElement('div');
            this.el.id = `plot-${id}`;
            document.getElementById('farm-grid').appendChild(this.el);
        }

        // Apply z-indexing based on isometric grid row & column
        const row = Math.floor(id / 7);
        const col = id % 7;
        this.el.style.zIndex = row * 10 - col + 20;

        // Bind DOM click
        this.el.addEventListener('click', (e) => {
            if (this.game.isDesignMode || this.game.hasDragged) return;
            // If clicked on the scythe basket icon itself, stop propagation and harvest
            if (e.target.closest('.harvest-basket')) {
                e.stopPropagation();
                this.game.harvestPlot(this.id);
                return;
            }
            if (this.game.antigravityActive) {
                const plot = this.plotState;
                if (plot && plot.state !== 'empty' && plot.state !== 'digging') {
                    e.stopPropagation();
                    this.triggerPush();
                    return;
                }
            }
            this.game.handlePlotClick(this.id);
        });
    }

    // Returns state block of this plot from Inventory/State
    get plotState() {
        return this.game.inventory.state.plots[this.id];
    }

    update(now) {
        const plot = this.plotState;
        if (plot.state === 'empty' || plot.state === 'mature' || plot.state === 'digging') return;

        const elapsed = now - plot.plantTime;
        const remaining = plot.growthDuration - elapsed;

        if (remaining <= 0) {
            plot.state = 'mature';
            this.render();
            
            // If crop detail panel is active on this plot, refresh it
            if (this.game.dom.cropDetailPanel.classList.contains('active-plot-' + this.id)) {
                this.game.showCropDetail(plot);
            }
        } 
        else if (elapsed > plot.growthDuration * 0.5 && plot.state === 'sprouting') {
            plot.state = 'growing';
            this.render();
        }

        // Update timer bubble
        const bubbleText = document.getElementById(`timer-text-${this.id}`);
        if (bubbleText) {
            const sec = Math.ceil(remaining / 1000);
            bubbleText.innerHTML = `⏳ ${this.game.formatTime(sec)}`;
        }

        // Update crop detail timer if open
        if (this.game.dom.cropDetailPanel.classList.contains('active-plot-' + this.id)) {
            const sec = Math.ceil(remaining / 1000);
            this.game.dom.detailCropTimer.textContent = `⏳ ${this.game.formatTime(sec)}`;
        }
    }

    render() {
        const plot = this.plotState;
        this.el.className = `plot ${plot.state}`;

        // Clear existing upright
        const oldUpright = this.el.querySelector('.plot-upright');
        if (oldUpright) oldUpright.remove();

        if (plot.state === 'empty') {
            this.el.innerHTML = '';
            return;
        }

        const cropCfg = CROP_CONFIGS[plot.cropType];
        if (!cropCfg) return;

        const upright = document.createElement('div');
        upright.className = 'plot-upright';

        // 1. Render Sprout or Mature image
        let sprite;
        if (plot.state === 'sprouting' || plot.state === 'growing') {
            sprite = document.createElement('img');
            sprite.className = `crop-sprite ${plot.state}`;
            if (plot.state === 'growing' && plot.cropType === 'carrot') {
                sprite.src = 'assets/carrot_growing_clean.png';
            } else {
                sprite.src = 'assets/sprout_clean.png';
            }
            sprite.alt = 'Sprout';
        } else if (plot.state === 'mature') {
            if (plot.cropType === 'carrot') {
                sprite = document.createElement('img');
                sprite.className = 'crop-sprite mature-crop';
                sprite.src = 'assets/carrot_mature_clean.png';
                sprite.alt = 'Mature Carrot';
            } else {
                sprite = document.createElement('span');
                sprite.className = 'crop-sprite mature-crop';
                sprite.style.fontSize = '3.2rem';
                sprite.style.display = 'block';
                sprite.style.textAlign = 'center';
                sprite.textContent = cropCfg.icon;
            }
        }
        if (sprite) upright.appendChild(sprite);

        // 2. Render countdown bubble
        if (plot.state === 'sprouting' || plot.state === 'growing') {
            const elapsed = Date.now() - plot.plantTime;
            const remaining = Math.max(0, plot.growthDuration - elapsed);
            
            const timer = document.createElement('div');
            timer.id = `timer-bubble-${this.id}`;
            timer.className = 'crop-timer-bubble';
            
            const timerText = document.createElement('span');
            timerText.id = `timer-text-${this.id}`;
            timerText.className = 'bubble-timer-text';
            timerText.innerHTML = `⏳ ${this.game.formatTime(Math.ceil(remaining / 1000))}`;
            timer.appendChild(timerText);

            // Fetch inventory fertilizer counts
            const midCount = this.game.inventory.state.inventory.fertilizers?.mid || 0;
            const highCount = this.game.inventory.state.inventory.fertilizers?.high || 0;

            if (midCount > 0 || highCount > 0) {
                timer.classList.add('has-fertilizers');
                
                const fertList = document.createElement('div');
                fertList.className = 'bubble-fertilizer-list';
                
                if (midCount > 0) {
                    const btnMid = document.createElement('button');
                    btnMid.className = 'bubble-fert-btn mid';
                    btnMid.innerHTML = `⚡ Trung (x${midCount})`;
                    btnMid.title = 'Bón phân Trung cấp (Nhanh 50%)';
                    btnMid.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.game.useFertilizerOnPlot(this.id, 'mid');
                    });
                    fertList.appendChild(btnMid);
                }
                
                if (highCount > 0) {
                    const btnHigh = document.createElement('button');
                    btnHigh.className = 'bubble-fert-btn high';
                    btnHigh.innerHTML = `⭐ Cao (x${highCount})`;
                    btnHigh.title = 'Bón phân Cao cấp (Chín ngay)';
                    btnHigh.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.game.useFertilizerOnPlot(this.id, 'high');
                    });
                    fertList.appendChild(btnHigh);
                }
                
                timer.appendChild(fertList);
            }

            upright.appendChild(timer);
        }

        // 3. Render harvest scythe scythe basket
        if (plot.state === 'mature') {
            const basket = document.createElement('div');
            basket.className = 'harvest-basket';
            basket.innerHTML = `
                <svg viewBox="0 0 100 100" width="28" height="28" style="pointer-events: none;">
                    <path d="M30 80 L70 40" stroke="#8b5a2b" stroke-width="6" stroke-linecap="round" />
                    <circle cx="70" cy="40" r="5" fill="#5c5c5c" />
                    <path d="M70 40 Q40 20 20 30 Q40 10 75 30 Z" fill="#d5dbdb" stroke="#7f8c8d" stroke-width="1.5" />
                </svg>
            `;
            upright.appendChild(basket);
        }

        this.el.appendChild(upright);
    }
    
    triggerPush() {
        const cropEl = this.el.querySelector('.crop-sprite');
        if (cropEl) {
            cropEl.classList.add('antigravity-pushed');
            this.game.playSFX('bounce');
            cropEl.addEventListener('animationend', () => {
                cropEl.classList.remove('antigravity-pushed');
            }, { once: true });
        }
    }
}
