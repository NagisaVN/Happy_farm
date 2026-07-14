import Phaser from 'phaser';
import { CROP_CONFIGS } from '../../Seed.js';
import { PHASER_GAME_HEIGHT, PHASER_GAME_WIDTH } from '../config.js';

const GRID_COLS = 7;
const GRID_ROWS = 4;
const GRID_IMAGE_WIDTH = 610;
const FARM_GRID_ASSET_WIDTH = 950;
const FARM_GRID_ASSET_HEIGHT = 458;
const TILE_STEP_X = 48;
const TILE_STEP_Y = 23.5;
const TILE_RADIUS_X = TILE_STEP_X;
const TILE_RADIUS_Y = TILE_STEP_Y;
const GRID_ORIGIN_OFFSET_X = 109;
const GRID_ORIGIN_OFFSET_Y = 193;
const CROP_OFFSETS = {
    sprout: 0,
    growing: 0,
    mature: 0,
    harvestHint: -70,
    timerSprout: -30,
    timerGrowing: -45
};
const FARMER_DISPLAY_SIZE = { width: 82, height: 126 };
const FARMER_DIRECTION_EPSILON = 2;
const FARMER_DIRECTIONS = ['front', 'left', 'right', 'back', 'back_left', 'back_right'];
const FARMER_ANIMATIONS = {
    idle: Object.fromEntries(FARMER_DIRECTIONS.map((direction) => [direction, `idle_${direction}`])),
    walk: Object.fromEntries(FARMER_DIRECTIONS.map((direction) => [direction, `walk_${direction}`]))
};

export default class MainScene extends Phaser.Scene {
    constructor(bridge) {
        super({ key: 'MainScene' });
        this.bridge = bridge;
        this.owner = bridge.owner;
        this.tileObjects = new Map();
        this.animalObjects = [];
        this.feedTray = null;
        this.lastTimerRefresh = 0;
        this.farmerMoveTween = null;
        this.farmerActionTween = null;
        this.currentAction = 'idle';
        this.currentDirection = 'right';
        this.lastDirection = 'right';
        this.animations = FARMER_ANIMATIONS;
        this.cursors = null;
        this.wasdKeys = null;
    }


    
    create() {
        this.createFarmerAnimations();
        this.createBackgroundEffects();
        this.createFarmGrid();
        this.createFarmer();
        this.createFarmerControls();
        this.createAnimals();
        this.createBuildings();
        this.bridge.setMainScene(this);
        this.syncAll();
        this.scene.launch('UIScene');
    }



    update(time, delta) {
        this.updateClouds();
        this.updateFarmerKeyboardMovement(delta);
        this.updateDepths();
        this.syncBuildings();

        if (time - this.lastTimerRefresh > 500) {
            this.lastTimerRefresh = time;
            this.refreshTimerTexts();
        }
    }

    createFarmerAnimations() {
        if (this.anims.exists(this.animations.idle.front)) return;

        FARMER_DIRECTIONS.forEach((direction) => {
            this.anims.create({
                key: this.animations.idle[direction],
                frames: [{ key: 'farmer-clean-full', frame: `idle_${direction}` }],
                frameRate: 1,
                repeat: -1
            });

            this.anims.create({
                key: this.animations.walk[direction],
                frames: Array.from({ length: 8 }, (_, index) => ({
                    key: 'farmer-clean-full',
                    frame: `walk_${direction}_${String(index).padStart(2, '0')}`
                })),
                frameRate: 9,
                repeat: -1
            });
        });
    }

    createBuildings() {
        this.buildingSprites = {
            'farmhouse-overlay': this.add.image(0, 0, 'farmhouse').setOrigin(0, 0),
            'barn-overlay': this.add.image(0, 0, 'barn').setOrigin(0, 0),
            'shop-building': this.add.image(0, 0, 'shop').setOrigin(0, 0),
            'pet-building': this.add.image(0, 0, 'pet').setOrigin(0, 0)
        };

        // The DOM cow pen sits below the Phaser canvas so cows remain visible.
        // This transparent zone preserves clicking the pen in normal play.
        this.cowPenHitArea = this.add.zone(0, 0, 120, 90).setOrigin(0, 0);
        this.cowPenHitArea.setInteractive({ useHandCursor: true });
        this.cowPenHitArea.on('pointerdown', (_pointer, _localX, _localY, event) => {
            if (this.owner.isDesignMode) return;
            this.bridge.suppressNextStageClick();
            event?.stopPropagation?.();
            this.owner.handleAnimalBuildingClick?.('cow');
        });
    }

    syncBuildings() {
        if (!this.buildingSprites) return;
        Object.keys(this.buildingSprites).forEach((id) => {
            const sprite = this.buildingSprites[id];
            const el = document.getElementById(id);
            if (el) {
                const style = window.getComputedStyle(el);
                const x = parseFloat(style.left);
                const y = parseFloat(style.top);
                
                // Keep ratio using CSS fixed width (convert to Phaser display width)
                // In CSS width is usually '250px'. We can read clientWidth.
                const cssWidth = el.clientWidth;
                if (cssWidth > 0) {
                    const aspect = sprite.width / sprite.height;
                    const displayWidth = cssWidth; // Since Phaser is mapped 1:1 to logical resolution
                    const displayHeight = cssWidth / aspect;
                    sprite.setDisplaySize(displayWidth, displayHeight);
                    sprite.setPosition(x, y);
                    // Base of building is roughly at y + displayHeight
                    sprite.setDepth(y + displayHeight + 70);
                }
            }
        });

        const cowPen = document.getElementById('cow-pen');
        if (cowPen && this.cowPenHitArea) {
            const style = window.getComputedStyle(cowPen);
            const x = Number.parseFloat(style.left);
            const y = Number.parseFloat(style.top);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                this.cowPenHitArea.setPosition(x, y);
                this.cowPenHitArea.setDepth(y + 140);
            }
        }
    }

    createFarmerControls() {
        if (!this.input.keyboard) return;

        this.wasdKeys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
    }

    createBackgroundEffects() {
        this.clouds = [];

        for (let i = 0; i < 9; i++) {
            const cloud = this.add.container(
                Phaser.Math.Between(-120, PHASER_GAME_WIDTH + 120),
                Phaser.Math.Between(20, 210)
            );
            cloud.setDepth(-20);
            cloud.setAlpha(Phaser.Math.FloatBetween(0.14, 0.28));
            cloud.setData('speed', Phaser.Math.FloatBetween(0.04, 0.12));

            const puffCount = Phaser.Math.Between(4, 6);
            for (let p = 0; p < puffCount; p++) {
                const puff = this.add.ellipse(
                    Phaser.Math.Between(-48, 48),
                    Phaser.Math.Between(-16, 18),
                    Phaser.Math.Between(58, 115),
                    Phaser.Math.Between(28, 58),
                    0xffffff,
                    0.9
                );
                cloud.add(puff);
            }

            this.clouds.push(cloud);
        }
    }

    updateClouds() {
        if (!this.clouds) return;

        this.clouds.forEach((cloud) => {
            cloud.x += cloud.getData('speed');
            if (cloud.x > PHASER_GAME_WIDTH + 180) {
                cloud.x = -180;
                cloud.y = Phaser.Math.Between(20, 210);
            }
        });
    }

    createFarmGrid() {
        const metrics = this.getGridMetrics();

        this.gridImage = this.add.image(metrics.imageX, metrics.imageY, 'farm-grid');
        this.gridImage.setOrigin(0, 0);
        this.gridImage.setDisplaySize(metrics.imageWidth, metrics.imageHeight);
        this.gridImage.setDepth(10);

        for (let id = 0; id < GRID_COLS * GRID_ROWS; id++) {
            const { x, y } = this.getTileWorldPosition(id);
            const container = this.add.container(x, y).setDepth(y + 25);
            const base = this.add.graphics();
            const zone = this.add.zone(x, y, TILE_RADIUS_X * 2, TILE_RADIUS_Y * 2);
            const diamondHitArea = new Phaser.Geom.Polygon([
                { x: TILE_RADIUS_X, y: 0 },
                { x: TILE_RADIUS_X * 2, y: TILE_RADIUS_Y },
                { x: TILE_RADIUS_X, y: TILE_RADIUS_Y * 2 },
                { x: 0, y: TILE_RADIUS_Y }
            ]);
            zone.setData('id', id);

            zone.on('pointerdown', (_pointer, _localX, _localY, event) => {
                this.bridge.suppressNextStageClick();
                event?.stopPropagation?.();
                this.owner.handlePlotClick(id);
            });

            zone.on('pointerover', () => {
                const tile = this.tileObjects.get(id);
                if (!tile) return;
                tile.hovered = true;
                this.drawTileBase(tile);
            });

            zone.on('pointerout', () => {
                const tile = this.tileObjects.get(id);
                if (!tile) return;
                tile.hovered = false;
                this.drawTileBase(tile);
            });

            container.add(base);
            const tile = {
                id,
                container,
                base,
                zone,
                diamondHitArea,
                crop: null,
                timer: null,
                harvestHint: null,
                lockVisual: null,
                selected: false,
                hovered: false
            };

            this.tileObjects.set(id, tile);
            this.syncTileInteractivity(tile);
            this.drawTileBase(tile);
        }
    }

    syncTileInteractivity(tile) {
        const isUnlocked = this.owner.isPlotUnlocked?.(tile.id) ?? true;
        const isNextUnlock = this.owner.isNextLandPlot?.(tile.id) ?? false;
        if (tile.zone.input) tile.zone.disableInteractive();

        if (isUnlocked || isNextUnlock) {
            tile.zone.setInteractive(tile.diamondHitArea, Phaser.Geom.Polygon.Contains);
            tile.zone.input.cursor = 'pointer';
        }
    }

    refreshGridLayout() {
        const metrics = this.getGridMetrics();
        if (this.gridImage) {
            this.gridImage.setPosition(metrics.imageX, metrics.imageY);
            this.gridImage.setDisplaySize(metrics.imageWidth, metrics.imageHeight);
        }

        this.tileObjects.forEach((tile, id) => {
            const { x, y } = this.getTileWorldPosition(id);
            tile.container.setPosition(x, y);
            tile.zone.setPosition(x, y);
            tile.container.setDepth(y + 25);
        });
    }

    getGridMetrics() {
        const layout = this.owner.inventory?.state?.layout?.farmGrid || { left: 48, top: 54 };
        const imageX = (Number.parseFloat(layout.left) / 100) * PHASER_GAME_WIDTH;
        const imageY = (Number.parseFloat(layout.top) / 100) * PHASER_GAME_HEIGHT;
        const imageScale = GRID_IMAGE_WIDTH / FARM_GRID_ASSET_WIDTH;

        return {
            imageX,
            imageY,
            imageWidth: GRID_IMAGE_WIDTH,
            imageHeight: FARM_GRID_ASSET_HEIGHT * imageScale * 1.15,
            originX: imageX + GRID_ORIGIN_OFFSET_X,
            originY: imageY + GRID_ORIGIN_OFFSET_Y
        };
    }

    getTileWorldPosition(id) {
        const row = Math.floor(id / GRID_COLS);
        const col = id % GRID_COLS;
        const metrics = this.getGridMetrics();

        return {
            x: metrics.originX + (col + row) * TILE_STEP_X,
            y: metrics.originY + (row - col) * TILE_STEP_Y
        };
    }

    drawDiamond(graphics, x, y, radiusX = TILE_RADIUS_X, radiusY = TILE_RADIUS_Y) {
        graphics.beginPath();
        graphics.moveTo(x, y - radiusY);
        graphics.lineTo(x + radiusX, y);
        graphics.lineTo(x, y + radiusY);
        graphics.lineTo(x - radiusX, y);
        graphics.closePath();
    }

    drawTileBase(tile) {
        const plot = this.owner.inventory?.state?.plots?.[tile.id];
        const isUnlocked = this.owner.isPlotUnlocked?.(tile.id) ?? true;
        const isNextUnlock = this.owner.isNextLandPlot?.(tile.id) ?? false;
        const isDigging = plot?.state === 'digging';
        const isSelected = tile.selected;
        const isHovered = tile.hovered;

        tile.base.clear();

        if (!isUnlocked) {
            const fillColor = isNextUnlock ? 0x4a351c : 0x14120f;
            const fillAlpha = isHovered || isSelected ? 0.62 : 0.46;
            tile.base.fillStyle(fillColor, fillAlpha);
            this.drawDiamond(tile.base, 0, 0);
            tile.base.fillPath();

            tile.base.lineStyle(
                isNextUnlock ? 3 : 1.5,
                isNextUnlock ? 0xf5b041 : 0x4f463a,
                isNextUnlock ? 0.95 : 0.72
            );
            this.drawDiamond(tile.base, 0, 0);
            tile.base.strokePath();
            return;
        }

        if (isDigging || isSelected || isHovered) {
            const color = isSelected ? 0xf1c40f : isDigging ? 0x6b3d1e : 0x8b4513;
            const alpha = isSelected ? 0.18 : isDigging ? 0.18 : 0.08;
            tile.base.fillStyle(color, alpha);
            this.drawDiamond(tile.base, 0, 0);
            tile.base.fillPath();
        }

        if (isSelected || isHovered) {
            tile.base.lineStyle(isSelected ? 2 : 1.5, isSelected ? 0xf1c40f : 0xffffff, isSelected ? 0.95 : 0.62);
            this.drawDiamond(tile.base, 0, 0);
            tile.base.strokePath();
        }
    }

    syncAll() {
        this.refreshGridLayout();
        for (let id = 0; id < GRID_COLS * GRID_ROWS; id++) {
            this.syncTile(id);
        }
        this.syncAnimals();
    }

    syncTile(id) {
        const tile = this.tileObjects.get(id);
        const plot = this.owner.inventory?.state?.plots?.[id];
        if (!tile || !plot) return;

        this.destroyTileVisuals(tile);
        this.syncTileInteractivity(tile);
        this.drawTileBase(tile);

        if (!(this.owner.isPlotUnlocked?.(id) ?? true)) {
            tile.lockVisual = this.createLockedTileVisual(tile);
            return;
        }

        if (plot.state === 'empty') return;

        const cropCfg = CROP_CONFIGS[plot.cropType];
        const cropDepth = tile.container.y + 40;

        if (plot.state === 'digging') {
            const dust = this.add.ellipse(0, -2, 40, 18, 0x6b3d1e, 0.35);
            tile.container.add(dust);
            tile.crop = dust;
            return;
        }

        if (!cropCfg) return;

        if (plot.state === 'sprouting') {
            tile.crop = this.add.image(0, CROP_OFFSETS.sprout, `${plot.cropType}-sprout`).setOrigin(0.5, 0.86);
            tile.crop.setDisplaySize(52, 28);
        } else if (plot.state === 'growing') {
            if (plot.cropType === 'carrot') {
                tile.crop = this.add.image(0, CROP_OFFSETS.growing, 'carrot-growing').setOrigin(0.5, 0.89);
                tile.crop.setDisplaySize(72, 61);
            } else if (plot.cropType === 'tomato') {
                tile.crop = this.add.image(0, CROP_OFFSETS.growing + 7, 'tomato-growing').setOrigin(0.5, 0.86);
                tile.crop.setDisplaySize(78, 78);
            } else if (plot.cropType === 'corn') {
                tile.crop = this.add.image(0, CROP_OFFSETS.growing + 7, 'corn-growing').setOrigin(0.5, 0.88);
                tile.crop.setDisplaySize(80, 80);
            } else if (plot.cropType === 'pumpkin') {
                tile.crop = this.add.image(0, CROP_OFFSETS.growing + 7, 'pumpkin-growing').setOrigin(0.5, 0.87);
                tile.crop.setDisplaySize(88, 88);
            } else {
                tile.crop = this.add.text(0, CROP_OFFSETS.growing, cropCfg.icon, {
                    fontFamily: 'Arial',
                    fontSize: '28px',
                    stroke: '#3d2715',
                    strokeThickness: 3
                }).setOrigin(0.5, 1);
            }
        } else if (plot.state === 'mature') {
            if (plot.cropType === 'carrot') {
                tile.crop = this.add.image(0, CROP_OFFSETS.mature, 'carrot-mature').setOrigin(0.5, 0.9);
                tile.crop.setDisplaySize(82, 67);
            } else if (plot.cropType === 'tomato') {
                tile.crop = this.add.image(0, CROP_OFFSETS.mature + 7, 'tomato-mature').setOrigin(0.5, 0.87);
                tile.crop.setDisplaySize(84, 84);
            } else if (plot.cropType === 'corn') {
                tile.crop = this.add.image(0, CROP_OFFSETS.mature + 7, 'corn-mature').setOrigin(0.5, 0.89);
                tile.crop.setDisplaySize(86, 86);
            } else if (plot.cropType === 'pumpkin') {
                tile.crop = this.add.image(0, CROP_OFFSETS.mature + 7, 'pumpkin-mature').setOrigin(0.5, 0.88);
                tile.crop.setDisplaySize(90, 90);
            } else {
                tile.crop = this.add.text(0, CROP_OFFSETS.mature, cropCfg.icon, {
                    fontFamily: 'Arial',
                    fontSize: '34px',
                    stroke: '#3d2715',
                    strokeThickness: 3
                }).setOrigin(0.5, 1);
            }

            tile.harvestHint = this.createHarvestHint(tile);
        }

        if (tile.crop) {
            tile.crop.setDepth(cropDepth);
            tile.container.add(tile.crop);
        }

        if (plot.state === 'sprouting' || plot.state === 'growing') {
            const isCarrot = plot.cropType === 'carrot';
            const defaultTimerY = plot.state === 'sprouting'
                ? (isCarrot ? -42 : CROP_OFFSETS.timerSprout)
                : (isCarrot ? -68 : CROP_OFFSETS.timerGrowing);
            const cropTopY = tile.crop && typeof tile.crop.displayHeight === 'number'
                ? tile.crop.y - (tile.crop.displayHeight * Number(tile.crop.originY ?? 0.5))
                : defaultTimerY + 12;
            const timerY = Math.min(defaultTimerY, cropTopY - 12);
            tile.timer = this.add.text(0, timerY, this.getPlotTimeLabel(plot), {
                fontFamily: 'Outfit, Arial',
                fontSize: '12px',
                fontStyle: '700',
                color: '#f39c12',
                backgroundColor: 'rgba(20, 15, 10, 0.82)',
                padding: { x: 7, y: 4 }
            }).setOrigin(0.5);
            tile.timer.setDepth(cropDepth + 2);
            tile.container.add(tile.timer);
        }
    }

    destroyTileVisuals(tile) {
        [tile.crop, tile.timer, tile.harvestHint, tile.lockVisual].forEach((item) => {
            if (item) item.destroy();
        });
        tile.crop = null;
        tile.timer = null;
        tile.harvestHint = null;
        tile.lockVisual = null;
    }

    createLockedTileVisual(tile) {
        const isNextUnlock = this.owner.isNextLandPlot?.(tile.id) ?? false;
        if (!isNextUnlock) return null;

        const lock = this.add.container(0, -4);

        const sign = this.add.graphics();
        sign.fillStyle(0x5b3219, 1);
        sign.fillRoundedRect(-3, 2, 6, 22, 2);
        sign.fillStyle(0x8b5428, 1);
        sign.fillRoundedRect(-34, -18, 68, 24, 4);
        sign.lineStyle(2, 0xf0b34f, 1);
        sign.strokeRoundedRect(-34, -18, 68, 24, 4);

        const label = this.add.text(0, -6, 'MỞ RỘNG', {
            fontFamily: 'Outfit, Arial',
            fontSize: '11px',
            fontStyle: '900',
            color: '#fff2b2',
            stroke: '#3a1d0c',
            strokeThickness: 2
        }).setOrigin(0.5);

        lock.add([sign, label]);

        lock.setDepth(tile.container.y + 45);
        tile.container.add(lock);
        return lock;
    }

    createHarvestHint(tile) {
        const cropTopY = tile.crop && typeof tile.crop.displayHeight === 'number'
            ? tile.crop.y - (tile.crop.displayHeight * Number(tile.crop.originY ?? 0.5))
            : CROP_OFFSETS.harvestHint + 18;
        const hintY = Math.min(CROP_OFFSETS.harvestHint, cropTopY - 18);
        const hint = this.add.container(0, hintY);
        const sickle = this.add.image(0, 0, 'harvest-sickle');
        sickle.setDisplaySize(52, 52);
        hint.add(sickle);
        tile.container.add(hint);

        const harvestTween = this.tweens.add({
            targets: sickle,
            angle: { from: -18, to: 14 },
            y: { from: 2, to: -3 },
            duration: 650,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1
        });
        hint.once(Phaser.GameObjects.Events.DESTROY, () => harvestTween.remove());

        return hint;
    }

    refreshTimerTexts() {
        this.tileObjects.forEach((tile) => {
            if (!tile.timer) return;
            const plot = this.owner.inventory?.state?.plots?.[tile.id];
            if (!plot) return;
            tile.timer.setText(this.getPlotTimeLabel(plot));
        });
    }

    getPlotTimeLabel(plot) {
        const remaining = Math.max(0, plot.growthDuration - (Date.now() - plot.plantTime));
        return this.owner.formatTime(Math.ceil(remaining / 1000));
    }

    setSelectedTile(id) {
        this.tileObjects.forEach((tile) => {
            tile.selected = tile.id === id;
            this.drawTileBase(tile);
        });
    }

    clearSelectedTile() {
        this.tileObjects.forEach((tile) => {
            tile.selected = false;
            this.drawTileBase(tile);
        });
    }

    createFarmer() {
        const homeX = (this.owner.farmerHomePos.left / 100) * PHASER_GAME_WIDTH;
        const homeY = (this.owner.farmerHomePos.top / 100) * PHASER_GAME_HEIGHT;

        this.farmer = this.add.container(homeX, homeY);
        this.farmer.setDepth(homeY + 70);

        const shadow = this.add.ellipse(0, 0, 48, 13, 0x000000, 0.32);
        this.farmerSprite = this.add.sprite(0, 0, 'farmer-clean-full', 'idle_front');
        this.farmerSprite.setOrigin(0.5, 1);
        this.applyFarmerSize();

        this.farmerBubble = this.add.container(0, -132);
        const bubbleBg = this.add.graphics();
        const bubbleText = this.add.text(0, 0, 'Xong viec roi!', {
            fontFamily: 'Outfit, Arial',
            fontSize: '12px',
            fontStyle: '700',
            color: '#4a3728'
        }).setOrigin(0.5);
        bubbleBg.fillStyle(0xffffff, 0.96);
        bubbleBg.lineStyle(2, 0x4a3728, 1);
        bubbleBg.fillRoundedRect(-51, -14, 102, 28, 10);
        bubbleBg.strokeRoundedRect(-51, -14, 102, 28, 10);
        this.farmerBubble.add([bubbleBg, bubbleText]);
        this.farmerBubble.setData('text', bubbleText);

        this.farmer.add([shadow, this.farmerSprite, this.farmerBubble]);
        this.playIdleFromLastDirection();
    }

    moveFarmerTo(targetX, targetY, callback = null) {
        if (!this.farmer) return;

        if (this.farmerMoveTween) {
            this.farmerMoveTween.stop();
            this.farmerMoveTween = null;
        }
        this.farmerActionTween?.stop();
        this.farmerActionTween = null;

        const distance = Phaser.Math.Distance.Between(this.farmer.x, this.farmer.y, targetX, targetY);
        if (distance < 3) {
            this.playIdleFromLastDirection();
            callback?.();
            return;
        }

        const dx = targetX - this.farmer.x;
        const dy = targetY - this.farmer.y;
        this.setFarmerMovementDirection(dx, dy);
        this.setFarmerState('WALK');

        this.farmerMoveTween = this.tweens.add({
            targets: this.farmer,
            x: targetX,
            y: targetY,
            duration: Phaser.Math.Clamp((distance / 90) * 1000, 350, 5200),
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.farmer.setDepth(this.farmer.y + 70);
                if (Math.random() < 0.04) {
                    this.createParticles(this.farmer.x, this.farmer.y + 5, 1, 'dirt');
                }
            },
            onComplete: () => {
                this.farmerMoveTween = null;
                this.playIdleFromLastDirection();
                callback?.();
            }
        });
    }

    updateFarmerKeyboardMovement(delta = 16.67) {
        if (!this.farmer || !this.cursors || !this.wasdKeys) return;

        const velocity = new Phaser.Math.Vector2(0, 0);
        const left = this.cursors.left.isDown || this.wasdKeys.left.isDown;
        const right = this.cursors.right.isDown || this.wasdKeys.right.isDown;
        const up = this.cursors.up.isDown || this.wasdKeys.up.isDown;
        const down = this.cursors.down.isDown || this.wasdKeys.down.isDown;

        if (left) velocity.x -= 1;
        if (right) velocity.x += 1;
        if (up) velocity.y -= 1;
        if (down) velocity.y += 1;

        if (velocity.lengthSq() === 0) {
            if (this.currentAction === 'walk' && !this.farmerMoveTween) {
                this.playIdleFromLastDirection();
            }
            return;
        }

        if (this.farmerMoveTween) {
            this.farmerMoveTween.stop();
            this.farmerMoveTween = null;
        }

        this.farmerActionTween?.stop();
        this.farmerActionTween = null;
        this.farmerSprite.setAngle(0);
        this.farmerSprite.setY(0);
        this.farmerSprite.setScale(1, 1);
        this.farmerBubble?.setVisible(false);

        const previousDirection = this.currentDirection;
        this.setFarmerMovementDirection(velocity.x, velocity.y);

        const step = velocity.normalize().scale(160 * (delta / 1000));
        this.farmer.x = Phaser.Math.Clamp(this.farmer.x + step.x, 0, PHASER_GAME_WIDTH);
        this.farmer.y = Phaser.Math.Clamp(this.farmer.y + step.y, 0, PHASER_GAME_HEIGHT);
        this.farmer.setDepth(this.farmer.y + 70);

        if (this.currentAction !== 'walk' || this.currentDirection !== previousDirection) {
            this.setFarmerState('WALK');
        }
    }

    resolveFarmerDirection(dx, dy, epsilon = FARMER_DIRECTION_EPSILON) {
        const movingLeft = dx < -epsilon;
        const movingRight = dx > epsilon;

        if (movingLeft) return 'left';
        if (movingRight) return 'right';
        return this.getHorizontalFarmerDirection(this.lastDirection);
    }

    getHorizontalFarmerDirection(direction) {
        if (direction === 'left' || direction === 'back_left') return 'left';
        if (direction === 'right' || direction === 'back_right') return 'right';
        return this.currentDirection === 'left' ? 'left' : 'right';
    }

    setFarmerMovementDirection(dx, dy) {
        if (Math.abs(dx) <= FARMER_DIRECTION_EPSILON && Math.abs(dy) <= FARMER_DIRECTION_EPSILON) {
            return;
        }

        const direction = this.getHorizontalFarmerDirection(this.resolveFarmerDirection(dx, dy));
        this.currentDirection = direction;
        this.lastDirection = direction;
    }

    playFarmerAnimation(action, direction) {
        if (!this.farmerSprite) return;

        const safeDirection = action === 'walk' || action === 'idle'
            ? this.getHorizontalFarmerDirection(direction)
            : FARMER_DIRECTIONS.includes(direction)
                ? direction
                : this.lastDirection;
        const animationKey = this.animations[action]?.[safeDirection] || this.animations.idle.front;

        this.currentAction = action;
        this.currentDirection = safeDirection;
        this.farmerSprite.play(animationKey, true);
        this.applyFarmerSize();
    }

    playIdleFromLastDirection() {
        this.playFarmerAnimation('idle', this.lastDirection);
    }

    setFarmerState(state) {
        if (!this.farmerSprite) return;

        this.farmerActionTween?.stop();
        this.farmerActionTween = null;
        this.farmerSprite.setAngle(0);
        this.farmerSprite.setY(0);
        this.farmerSprite.setScale(1, 1);

        const bubbleText = this.farmerBubble?.getData('text');
        if (bubbleText) {
            const labels = {
                IDLE: 'Xong viec roi!',
                WALK: 'Dang di...',
                DIG: 'Dang cuoc...',
                PLANT: 'Dang gieo...',
                HARVEST: 'Thu hoach!'
            };
            bubbleText.setText(labels[state] || labels.IDLE);
        }
        this.farmerBubble?.setVisible(state !== 'WALK');

        if (state === 'WALK') {
            this.playFarmerAnimation('walk', this.currentDirection || this.lastDirection);
            return;
        }

        this.playIdleFromLastDirection();

        if (state === 'DIG' || state === 'HARVEST') {
            this.currentAction = state.toLowerCase();
            this.farmerActionTween = this.tweens.add({
                targets: this.farmerSprite,
                angle: state === 'DIG' ? 10 : -12,
                duration: 160,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else if (state === 'PLANT') {
            this.currentAction = 'plant';
            this.farmerActionTween = this.tweens.add({
                targets: this.farmerSprite,
                y: 8,
                angle: 8,
                duration: 190,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    applyFarmerSize() {
        this.farmerSprite.setDisplaySize(FARMER_DISPLAY_SIZE.width, FARMER_DISPLAY_SIZE.height);
    }

    createAnimals() {
        const cowPenBounds = this.getCowPenWanderBounds();
        const chickenBounds = this.getChickenWanderBounds();
        this.animalObjects = [
            this.createAnimal('dog', '🐕', 320, 210, { x: 200, y: 150, width: 250, height: 150 }, () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'bark');
                this.createParticles(320, 190, 10, 'spark');
            }),
            this.createAnimal('chicken-1', '🐓', chickenBounds.x + chickenBounds.width * 0.25, chickenBounds.y + chickenBounds.height * 0.25, chickenBounds, () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'plant');
                if (!this.owner.antigravityActive) this.owner.handleAnimalClick?.('chicken-1');
            }),
            this.createAnimal('chicken-2', '🐔', chickenBounds.x + chickenBounds.width * 0.65, chickenBounds.y + chickenBounds.height * 0.55, chickenBounds, () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'plant');
                if (!this.owner.antigravityActive) this.owner.handleAnimalClick?.('chicken-2');
            }),
            this.createAnimal('chicken-3', '🐤', chickenBounds.x + chickenBounds.width * 0.12, chickenBounds.y + chickenBounds.height * 0.72, chickenBounds, () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'plant');
                if (!this.owner.antigravityActive) this.owner.handleAnimalClick?.('chicken-3');
            }),
            this.createAnimal('cow-1', '🐄',
                cowPenBounds.x + (cowPenBounds.width * 0.28),
                cowPenBounds.y + (cowPenBounds.height * 0.25),
                cowPenBounds, () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'dig');
                if (!this.owner.antigravityActive) this.owner.handleAnimalClick?.('cow-1');
            }),
            this.createAnimal('cow-2', '🐄',
                cowPenBounds.x + (cowPenBounds.width * 0.75),
                cowPenBounds.y + (cowPenBounds.height * 0.7),
                cowPenBounds, () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'dig');
                if (!this.owner.antigravityActive) this.owner.handleAnimalClick?.('cow-2');
            }),
            this.createAnimal('pig-1', '🐖', ...this.getAnimalStartPosition(this.getPigPenWanderBounds(), 0.3, 0.3), this.getPigPenWanderBounds(), () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'plant');
                if (!this.owner.antigravityActive) this.owner.handleAnimalClick?.('pig-1');
            }),
            this.createAnimal('pig-2', '🐖', ...this.getAnimalStartPosition(this.getPigPenWanderBounds(), 0.72, 0.68), this.getPigPenWanderBounds(), () => {
                this.owner.playSFX(this.owner.antigravityActive ? 'bounce' : 'plant');
                if (!this.owner.antigravityActive) this.owner.handleAnimalClick?.('pig-2');
            })
        ];
    }

    getAnimalStartPosition(bounds, xRatio, yRatio) {
        return [bounds.x + bounds.width * xRatio, bounds.y + bounds.height * yRatio];
    }

    getCowPenWanderBounds() {
        const fallback = { x: 928, y: 187, width: 56, height: 20 };
        const pen = typeof document !== 'undefined' ? document.getElementById('cow-pen') : null;
        if (!pen) return fallback;

        const style = window.getComputedStyle(pen);
        const left = Number.parseFloat(style.left);
        const top = Number.parseFloat(style.top);
        const width = pen.clientWidth || 120;
        const height = pen.clientHeight || 90;
        if (!Number.isFinite(left) || !Number.isFinite(top)) return fallback;

        // Keep the cows' ground points inside the diamond-shaped grass area.
        return {
            x: left + (width * 0.27),
            y: top + (height * 0.63),
            width: width * 0.46,
            height: height * 0.22
        };
    }

    getChickenWanderBounds() {
        const coop = typeof document !== 'undefined' ? document.getElementById('chicken-coop') : null;
        if (!coop) return { x: 285, y: 375, width: 175, height: 100 };
        const style = window.getComputedStyle(coop);
        const left = Number.parseFloat(style.left);
        const top = Number.parseFloat(style.top);
        if (!Number.isFinite(left) || !Number.isFinite(top)) return { x: 285, y: 375, width: 175, height: 100 };
        return { x: Math.max(285, left + 45), y: top - 28, width: 175, height: 100 };
    }

    getPigPenWanderBounds() {
        const fallback = { x: 1000, y: 455, width: 100, height: 60 };
        const pen = typeof document !== 'undefined' ? document.getElementById('pig-pen') : null;
        if (!pen) return fallback;
        const style = window.getComputedStyle(pen);
        const left = Number.parseFloat(style.left);
        const top = Number.parseFloat(style.top);
        const width = pen.clientWidth || 96;
        const height = pen.clientHeight || 68;
        if (!Number.isFinite(left) || !Number.isFinite(top)) return fallback;
        return { x: left - width * 0.45, y: top - height * 0.25, width: width * 0.9, height: height * 0.55 };
    }

    createAnimal(key, icon, x, y, bounds, onClick) {
        const animal = this.add.container(x, y);
        animal.setDepth(y + 45);
        animal.setData('bounds', bounds);
        animal.setData('key', key);

        const isChicken = key.startsWith('chicken');
        const isLargeAnimal = key.startsWith('cow') || key.startsWith('pig');
        const shadow = this.add.ellipse(0, 12, isChicken ? 30 : (isLargeAnimal ? 40 : 34), 10, 0x000000, 0.28);
        const visual = isChicken
            ? this.createChickenVisual(key)
            : this.add.text(0, 0, icon, {
                fontFamily: 'Arial',
                fontSize: isLargeAnimal ? '34px' : '28px'
            }).setOrigin(0.5, 1);
        animal.add([shadow, visual]);
        animal.setSize(48, 48);
        animal.setInteractive({ useHandCursor: true });
        animal.on('pointerdown', (_pointer, _localX, _localY, event) => {
            this.bridge.suppressNextStageClick();
            event?.stopPropagation?.();
            if (this.owner.antigravityActive) {
                this.pushObject(animal);
            }
            onClick?.();
        });

        this.wanderAnimal(animal);
        return animal;
    }

    createChickenVisual(key) {
        const graphics = this.add.graphics();
        const isChick = key === 'chicken-3';
        const bodyColor = isChick ? 0xf7d84a : 0xfff8e7;
        const wingColor = isChick ? 0xe7b92f : 0xe8dfca;
        const outlineColor = 0x6b4b2a;

        // Legs sit directly above the ground shadow so the chicken no longer
        // looks like a detached head on platforms with compact emoji glyphs.
        graphics.lineStyle(2, 0xe49b24, 1);
        graphics.beginPath();
        graphics.moveTo(-5, 1);
        graphics.lineTo(-5, 8);
        graphics.moveTo(4, 1);
        graphics.lineTo(4, 8);
        graphics.strokePath();
        graphics.lineStyle(1.5, 0xe49b24, 1);
        graphics.beginPath();
        graphics.moveTo(-9, 8);
        graphics.lineTo(-2, 8);
        graphics.moveTo(0, 8);
        graphics.lineTo(8, 8);
        graphics.strokePath();

        graphics.lineStyle(1.5, outlineColor, 0.9);
        graphics.fillStyle(bodyColor, 1);
        graphics.fillEllipse(-2, -7, isChick ? 25 : 30, isChick ? 22 : 25);
        graphics.strokeEllipse(-2, -7, isChick ? 25 : 30, isChick ? 22 : 25);

        graphics.fillStyle(wingColor, 1);
        graphics.fillEllipse(-7, -7, isChick ? 12 : 15, isChick ? 10 : 13);
        graphics.strokeEllipse(-7, -7, isChick ? 12 : 15, isChick ? 10 : 13);

        graphics.fillStyle(bodyColor, 1);
        graphics.fillCircle(9, -18, isChick ? 8 : 9);
        graphics.strokeCircle(9, -18, isChick ? 8 : 9);

        graphics.fillStyle(0xe74c3c, 1);
        if (!isChick) {
            graphics.fillCircle(5, -27, 3.2);
            graphics.fillCircle(10, -28, 3.5);
            graphics.fillCircle(13, -25, 3);
            graphics.fillCircle(9, -10, 3);
        }

        graphics.fillStyle(0xf39c12, 1);
        graphics.fillTriangle(16, -20, 24, -17, 16, -14);
        graphics.lineStyle(1, outlineColor, 0.8);
        graphics.strokeTriangle(16, -20, 24, -17, 16, -14);

        graphics.fillStyle(0x2d241d, 1);
        graphics.fillCircle(12, -21, 1.5);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(12.5, -21.5, 0.45);

        return graphics;
    }

    wanderAnimal(animal) {
        if (animal.getData('feedPaused')) return;
        const isCow = animal.getData('key')?.startsWith('cow');
        const isPig = animal.getData('key')?.startsWith('pig');
        const bounds = isCow ? this.getCowPenWanderBounds() : isPig ? this.getPigPenWanderBounds() : animal.getData('bounds');
        if (isCow || isPig) animal.setData('bounds', bounds);
        const tx = bounds.x + Math.random() * bounds.width;
        const ty = bounds.y + Math.random() * bounds.height;
        const distance = Phaser.Math.Distance.Between(animal.x, animal.y, tx, ty);

        this.tweens.add({
            targets: animal,
            x: tx,
            y: ty,
            duration: Phaser.Math.Clamp(distance * Phaser.Math.Between(18, 34), 900, 6200),
            delay: Phaser.Math.Between(500, 2200),
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                animal.setDepth(animal.y + 45);
            },
            onComplete: () => {
                this.time.delayedCall(Phaser.Math.Between(700, 2400), () => {
                    if (!animal.getData('feedPaused')) this.wanderAnimal(animal);
                });
            }
        });
    }

    syncAnimals() {
        const shibaActive = Boolean(this.owner.inventory?.state?.pets?.shiba?.active);
        const animalsEnabled = this.owner.systemSettings?.ENABLE_ANIMAL !== false;
        this.animalObjects.forEach((animal) => {
            const key = animal.getData('key');
            animal.setVisible(key.startsWith('dog') ? shibaActive : animalsEnabled);
            if (key.startsWith('dog')) return;
            const info = this.owner.inventory?.getAnimalStatusInfo?.(key);
            const hint = animal.getData('harvestHint');
            if (info?.status === 'ready' && !hint) {
                animal.setData('harvestHint', this.createAnimalHarvestHint(animal, key));
            } else if (info?.status !== 'ready' && hint) {
                hint.destroy();
                animal.setData('harvestHint', null);
            }
        });
    }

    createAnimalHarvestHint(animal, animalId) {
        const hint = this.add.container(0, -54);
        const bubble = this.add.circle(0, 0, 23, 0xfff3c4, 0.96).setStrokeStyle(3, 0xe2a52e, 1);
        const sickle = this.add.image(0, 0, 'harvest-sickle').setDisplaySize(38, 38);
        hint.add([bubble, sickle]);
        hint.setSize(48, 48).setInteractive({ useHandCursor: true });
        hint.on('pointerdown', (_pointer, _x, _y, event) => {
            this.bridge.suppressNextStageClick();
            event?.stopPropagation?.();
            this.owner.handleAnimalClick?.(animalId);
        });
        animal.add(hint);
        const tween = this.tweens.add({
            targets: sickle,
            angle: { from: -18, to: 14 },
            y: { from: 2, to: -3 },
            duration: 650,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1
        });
        hint.once(Phaser.GameObjects.Events.DESTROY, () => tween.remove());
        return hint;
    }

    showFeedTray(animalId) {
        const animal = this.animalObjects.find(item => item.getData('key') === animalId);
        const info = this.owner.inventory?.getAnimalStatusInfo?.(animalId);
        if (!animal || info?.status !== 'hungry') return;
        this.closeFeedTray();

        animal.setData('feedPaused', true);
        this.tweens.killTweensOf(animal);

        const side = animal.x > 900 ? -1 : 1;
        const tray = this.add.container(animal.x + side * 92, animal.y - 58).setDepth(10000);
        const shadow = this.add.graphics();
        shadow.fillStyle(0x000000, 0.25).fillRoundedRect(-70, -38, 144, 86, 16);
        const panel = this.add.graphics();
        panel.fillStyle(0x3b2a1d, 0.97).fillRoundedRect(-72, -42, 144, 86, 16);
        panel.fillStyle(0x5b4028, 0.95).fillRoundedRect(-67, -37, 134, 76, 12);
        panel.lineStyle(3, info.feedCount > 0 ? 0xf3c95c : 0x8e7869, 1).strokeRoundedRect(-72, -42, 144, 86, 16);
        panel.fillStyle(0x3b2a1d, 1);
        if (side > 0) panel.fillTriangle(-71, 9, -88, 20, -71, 29);
        else panel.fillTriangle(71, 9, 88, 20, 71, 29);

        const title = this.add.text(0, -29, 'CHO ĂN', {
            fontFamily: 'Outfit, Arial', fontSize: '12px', color: '#ffe7a0', fontStyle: 'bold'
        }).setOrigin(0.5);

        const closeControl = this.add.container(-50, -29);
        const closeBack = this.add.circle(0, 0, 13, 0x6f4030, 1)
            .setStrokeStyle(2, 0xe9b77c, 0.9);
        const closeIcon = this.add.text(0, -1, '×', {
            fontFamily: 'Arial', fontSize: '18px', color: '#fff1dc', fontStyle: 'bold'
        }).setOrigin(0.5);
        closeControl.add([closeBack, closeIcon]);
        closeControl.setSize(30, 30).setInteractive({ useHandCursor: true });
        closeControl.on('pointerdown', (_pointer, _x, _y, event) => {
            this.bridge.suppressNextStageClick();
            event?.stopPropagation?.();
            this.closeFeedTray();
        });

        const countBadge = this.add.container(48, -29);
        const countBack = this.add.circle(0, 0, 15, info.feedCount > 0 ? 0xe09b24 : 0x76665d, 1)
            .setStrokeStyle(2, 0xffe39a, 0.9);
        const countText = this.add.text(0, 0, `x${info.feedCount}`, {
            fontFamily: 'Outfit, Arial', fontSize: '11px', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        countBadge.add([countBack, countText]);

        const hint = this.add.text(side * 28, 8, info.feedCount > 0
            ? (side > 0 ? '←  KÉO\nVÀO CON VẬT' : 'KÉO  →\nVÀO CON VẬT')
            : 'HẾT THỨC ĂN', {
            fontFamily: 'Outfit, Arial',
            fontSize: '9px',
            align: 'center',
            color: info.feedCount > 0 ? '#f8e6bd' : '#c2ada1',
            fontStyle: 'bold',
            lineSpacing: 2
        }).setOrigin(0.5);

        const bagHomeX = tray.x - side * 34;
        const bagHomeY = tray.y + 8;
        const bag = this.add.container(bagHomeX, bagHomeY).setDepth(10001);
        const bagShadow = this.add.ellipse(2, 21, 42, 13, 0x000000, 0.25);
        const bagOuter = this.add.circle(0, 0, 27, info.feedCount > 0 ? 0xf4c95d : 0x756b65, 1)
            .setStrokeStyle(3, info.feedCount > 0 ? 0xffedaf : 0x9b8f88, 1);
        const bagInner = this.add.circle(0, 0, 21, info.feedCount > 0 ? 0xfff0bd : 0x938984, 1);
        const bagIcon = this.add.text(0, 1, info.feedMeta?.icon || '🌾', {
            fontFamily: 'Arial', fontSize: '29px'
        }).setOrigin(0.5).setAlpha(info.feedCount > 0 ? 1 : 0.45);
        bag.add([bagShadow, bagOuter, bagInner, bagIcon]);
        bag.setSize(58, 58).setInteractive({ useHandCursor: info.feedCount > 0, draggable: info.feedCount > 0 });

        tray.add([shadow, panel, title, closeControl, countBadge, hint]);
        tray.setData('animal', animal);
        tray.setData('bag', bag);
        this.feedTray = tray;

        if (info.feedCount <= 0) {
            bag.on('pointerdown', () => this.owner.showToast?.(`Không còn ${info.feedMeta?.name || 'thức ăn'}. Hãy dùng Máy trộn.`));
            return;
        }

        this.input.setDraggable(bag);
        bag.on('pointerdown', (_pointer, _x, _y, event) => {
            event?.stopPropagation?.();
        });
        bag.on('dragstart', () => bag.setScale(1.12));
        bag.on('drag', (pointer) => {
            bag.x = pointer.worldX;
            bag.y = pointer.worldY;
        });
        bag.on('dragend', (pointer) => {
            const targetBounds = new Phaser.Geom.Rectangle(animal.x - 36, animal.y - 52, 72, 72);
            if (targetBounds.contains(pointer.worldX, pointer.worldY)) {
                this.owner.feedSelectedAnimal?.(animalId);
                return;
            }
            this.tweens.add({ targets: bag, x: bagHomeX, y: bagHomeY, scale: 1, duration: 180, ease: 'Back.Out' });
        });
    }

    closeFeedTray() {
        if (!this.feedTray) return;
        const animal = this.feedTray.getData('animal');
        this.feedTray.getData('bag')?.destroy();
        this.feedTray.destroy(true);
        this.feedTray = null;
        if (animal?.active) {
            animal.setData('feedPaused', false);
            this.wanderAnimal(animal);
        }
    }

    updateDepths() {
        if (this.farmer) {
            this.farmer.setDepth(this.farmer.y + 70);
        }
    }

    createParticles(x, y, count = 8, type = 'spark') {
        const colors = type === 'dirt'
            ? [0x784212, 0x935116, 0xb55d14, 0x5c330a]
            : [0xf1c40f, 0xf39c12, 0xfcf3cf, 0xe67e22, 0xffffff];

        for (let i = 0; i < count; i++) {
            const size = Phaser.Math.Between(4, 9);
            const particle = this.add.circle(x, y, size / 2, Phaser.Utils.Array.GetRandom(colors), 0.95);
            particle.setDepth(y + 120);

            const angle = Math.random() * Math.PI * 2;
            const velocity = Phaser.Math.Between(28, 96);
            const tx = this.owner.antigravityActive ? Phaser.Math.Between(-20, 20) : Math.cos(angle) * velocity;
            const ty = this.owner.antigravityActive ? Phaser.Math.Between(-180, -90) : Math.sin(angle) * velocity - (type === 'dirt' ? 30 : 58);

            this.tweens.add({
                targets: particle,
                x: x + tx,
                y: y + ty,
                alpha: 0,
                scale: 0.55,
                duration: this.owner.antigravityActive ? 2100 : 650,
                ease: 'Cubic.easeOut',
                onComplete: () => particle.destroy()
            });
        }
    }

    pushTile(id) {
        const tile = this.tileObjects.get(id);
        if (tile?.crop) this.pushObject(tile.crop);
    }

    pushFarmer() {
        if (this.farmerSprite) this.pushObject(this.farmerSprite);
    }

    pushObject(object) {
        this.tweens.add({
            targets: object,
            y: object.y - 44,
            angle: Phaser.Math.Between(-8, 8),
            duration: 260,
            yoyo: true,
            ease: 'Sine.easeOut'
        });
    }

    setAntigravity(active) {
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
        this.tileObjects.forEach((tile) => {
            if (tile.crop) tile.crop.setAlpha(active ? 0.92 : 1);
        });
    }
}
