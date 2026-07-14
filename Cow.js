export class Cow {
    constructor(game, id) {
        this.game = game;
        this.id = id;
    }

    update() {
        // Phaser owns cow movement after the migration.
    }

    moo() {
        this.game.playSFX('dig');
    }

    triggerPush() {
        this.game.phaserWorld?.setAntigravity(this.game.antigravityActive);
        this.game.playSFX('bounce');
    }
}
