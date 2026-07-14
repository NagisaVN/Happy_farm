export class Pig {
    constructor(game, id) {
        this.game = game;
        this.id = id;
    }

    update() {
        // Phaser owns pig movement and interaction.
    }

    oink() {
        this.game.playSFX('plant');
    }

    triggerPush() {
        this.game.phaserWorld?.setAntigravity(this.game.antigravityActive);
        this.game.playSFX('bounce');
    }
}
