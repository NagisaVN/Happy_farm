export class Dog {
    constructor(game) {
        this.game = game;
    }

    update() {
        // Phaser owns dog visibility and movement after the migration.
    }

    bark() {
        this.game.playSFX('bark');
    }

    triggerPush() {
        this.game.phaserWorld?.setAntigravity(this.game.antigravityActive);
        this.game.playSFX('bounce');
    }
}
