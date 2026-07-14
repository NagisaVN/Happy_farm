export class Farmer {
    constructor(game) {
        this.game = game;
        this.x = 0.45 * 1280;
        this.y = 0.40 * 720;
        this.targetX = this.x;
        this.targetY = this.y;
        this.state = 'IDLE';
        this.callback = null;
    }

    setTarget(tx, ty, callback = null) {
        this.targetX = tx;
        this.targetY = ty;
        this.callback = callback;

        const complete = () => {
            this.x = tx;
            this.y = ty;
            this.state = 'IDLE';
            const cb = this.callback;
            this.callback = null;
            if (cb) cb();
        };

        if (this.game.phaserWorld?.isReady()) {
            this.state = 'WALK';
            this.game.phaserWorld.moveFarmerTo(tx, ty, complete);
            return;
        }

        this.x = tx;
        this.y = ty;
        complete();
    }

    setState(newState) {
        this.state = newState;
        this.game.phaserWorld?.setFarmerState(newState);
    }

    update() {
        // Phaser tweens own movement and frame timing after migration.
    }

    draw() {
        // Phaser renders the farmer sprite.
    }

    updateDOMPosition() {
        // Kept for compatibility with older callers.
    }

    triggerPush() {
        this.game.phaserWorld?.pushFarmer();
        this.game.playSFX('bounce');
    }
}
