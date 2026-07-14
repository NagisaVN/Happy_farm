export class Chicken {
    constructor(game, id, emoji) {
        this.game = game;
        this.id = id;
        this.emoji = emoji;
    }

    update() {
        // Phaser owns chicken movement after the migration.
    }

    peck() {
        this.game.playSFX('plant');
    }

    triggerPush() {
        this.game.phaserWorld?.setAntigravity(this.game.antigravityActive);
        this.game.playSFX('bounce');
    }
}
