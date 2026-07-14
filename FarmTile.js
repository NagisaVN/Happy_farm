export class FarmTile {
    constructor(game, id) {
        this.game = game;
        this.id = id;
    }

    get plotState() {
        return this.game.inventory.state.plots[this.id];
    }

    update(now) {
        const plot = this.plotState;
        if (!this.game.isPlotUnlocked(this.id)) return;
        if (plot.state === 'empty' || plot.state === 'mature' || plot.state === 'digging') return;

        const elapsed = now - plot.plantTime;
        const remaining = plot.growthDuration - elapsed;

        if (remaining <= 0) {
            plot.state = 'mature';
            this.render();
            this.game.updateHarvestAllBadge();

            if (this.game.dom.cropDetailPanel.classList.contains(`active-plot-${this.id}`)) {
                this.game.showCropDetail(plot);
            }
        } else if (elapsed > plot.growthDuration * 0.5 && plot.state === 'sprouting') {
            plot.state = 'growing';
            this.render();
        }

        if (this.game.dom.cropDetailPanel.classList.contains(`active-plot-${this.id}`)) {
            const sec = Math.ceil(Math.max(0, remaining) / 1000);
            this.game.dom.detailCropTimer.textContent = this.game.formatTime(sec);
        }
    }

    render() {
        this.game.phaserWorld?.syncTile(this.id);
    }

    triggerPush() {
        this.game.phaserWorld?.pushTile(this.id);
        this.game.playSFX('bounce');
    }
}
