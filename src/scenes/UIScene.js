import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor(bridge) {
        super({ key: 'UIScene', active: false });
        this.bridge = bridge;
    }

    create() {
        const mainScene = this.scene.get('MainScene');
        mainScene.events.on('resourcesUpdated', () => {
            this.bridge.owner.renderHUD();
        });
        mainScene.events.on('cropMatured', () => {
            this.bridge.owner.updateHarvestAllBadge();
        });
    }
}
