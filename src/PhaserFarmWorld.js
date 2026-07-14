import Phaser from 'phaser';
import { createPhaserConfig } from './config.js';
import BootScene from './scenes/BootScene.js';
import MainScene from './scenes/MainScene.js';
import UIScene from './scenes/UIScene.js';

export class PhaserFarmWorld {
    constructor(owner) {
        this.owner = owner;
        this.mainScene = null;
        this.readyState = false;
        this.suppressedStageClick = false;
        this.ready = new Promise((resolve) => {
            this.resolveReady = resolve;
        });

        this.parent = this.ensureMount();
        this.game = new Phaser.Game(createPhaserConfig(this.parent, [
            new BootScene(this),
            new MainScene(this),
            new UIScene(this)
        ]));
    }

    ensureMount() {
        const worldObjects = document.getElementById('game-world-objects');
        const stage = document.getElementById('farm-stage');
        if (!worldObjects) {
            throw new Error('Missing #game-world-objects for Phaser mount.');
        }

        let mount = document.getElementById('phaser-game-root');
        if (!mount) {
            mount = document.createElement('div');
            mount.id = 'phaser-game-root';
            worldObjects.prepend(mount);
        }

        stage?.classList.add('phaser-enabled');
        return mount;
    }

    setLoadProgress(value) {
        const bar = this.owner.dom?.loadingProgress || document.getElementById('loading-progress');
        if (bar) {
            const percent = Math.round(value * 100);
            bar.style.width = `${Math.max(percent, Number.parseFloat(bar.style.width) || 0)}%`;
        }
    }

    setMainScene(scene) {
        this.mainScene = scene;
        this.readyState = true;
        this.resolveReady?.();
    }

    isReady() {
        return this.readyState && Boolean(this.mainScene);
    }

    syncAll() {
        this.mainScene?.syncAll();
    }

    syncTile(id) {
        this.mainScene?.syncTile(id);
    }

    syncAnimals() {
        this.mainScene?.syncAnimals();
    }

    showFeedTray(animalId) {
        this.mainScene?.showFeedTray(animalId);
    }

    closeFeedTray() {
        this.mainScene?.closeFeedTray();
    }

    refreshGridLayout() {
        this.mainScene?.refreshGridLayout();
    }

    selectTile(id) {
        this.mainScene?.setSelectedTile(id);
    }

    clearSelectedTile() {
        this.mainScene?.clearSelectedTile();
    }

    getPlotWorldPosition(id) {
        return this.mainScene?.getTileWorldPosition(id) || { x: 0, y: 0 };
    }

    moveFarmerTo(x, y, callback) {
        this.mainScene?.moveFarmerTo(x, y, callback);
    }

    setFarmerState(state) {
        this.mainScene?.setFarmerState(state);
    }

    createParticles(x, y, count, type) {
        this.mainScene?.createParticles(x, y, count, type);
    }

    pushFarmer() {
        this.mainScene?.pushFarmer();
    }

    pushTile(id) {
        this.mainScene?.pushTile(id);
    }

    setAntigravity(active) {
        this.mainScene?.setAntigravity(active);
    }

    suppressNextStageClick() {
        this.suppressedStageClick = true;
        window.setTimeout(() => {
            this.suppressedStageClick = false;
        }, 250);
    }

    consumeSuppressedStageClick() {
        if (!this.suppressedStageClick) return false;
        this.suppressedStageClick = false;
        return true;
    }

    destroy() {
        this.game?.destroy(true);
        this.readyState = false;
        this.mainScene = null;
        document.getElementById('farm-stage')?.classList.remove('phaser-enabled');
    }
}
