import Phaser from 'phaser';
import farmGridUrl from '../../assets/farm_grid_clean.png';
import sproutUrl from '../../assets/sprout_clean.png';
import carrotGrowingUrl from '../../assets/carrot_growing_clean.png';
import carrotMatureUrl from '../../assets/carrot_mature_clean.png';
import tomatoGrowingUrl from '../../assets/cachuagiaidoan2.png';
import tomatoMatureUrl from '../../assets/caycachuagiaidoan3.png';
import cornGrowingUrl from '../../assets/cayngogiaidoan2.png';
import cornMatureUrl from '../../assets/cayngogiaidoan3.png';
import pumpkinGrowingUrl from '../../assets/caybigiaidoan2_clean.png';
import pumpkinMatureUrl from '../../assets/caybigiaidoan3_clean.png';
import harvestSickleUrl from '../../assets/luoihai_clean.png';
import farmerCleanFullUrl from '../../assets/farmer_cleanFull.png';
import farmerCleanFullAtlasUrl from '../../assets/farmer_cleanFull.json?url';
import farmhouseUrl from '../../assets/farmhouse_clean.png';
import barnUrl from '../../assets/barn_clean.png';
import shopUrl from '../../assets/shop_clean.png';
import petUrl from '../../assets/pet_clean.png';
import { CROP_CONFIGS } from '../../Seed.js';

const CROP_IMAGE_FALLBACKS = {
    carrot: { sprout: sproutUrl, growing: carrotGrowingUrl, mature: carrotMatureUrl },
    tomato: { sprout: sproutUrl, growing: tomatoGrowingUrl, mature: tomatoMatureUrl },
    corn: { sprout: sproutUrl, growing: cornGrowingUrl, mature: cornMatureUrl },
    pumpkin: { sprout: sproutUrl, growing: pumpkinGrowingUrl, mature: pumpkinMatureUrl }
};

export default class BootScene extends Phaser.Scene {
    constructor(bridge) {
        super({ key: 'BootScene' });
        this.bridge = bridge;
    }

    preload() {
        this.load.image('farm-grid', farmGridUrl);
        Object.entries(CROP_IMAGE_FALLBACKS).forEach(([cropCode, fallback]) => {
            const config = CROP_CONFIGS[cropCode] || {};
            this.load.image(`${cropCode}-sprout`, config.sproutImageUrl || fallback.sprout);
            this.load.image(`${cropCode}-growing`, config.growingImageUrl || fallback.growing);
            this.load.image(`${cropCode}-mature`, config.matureImageUrl || fallback.mature);
        });
        this.load.image('harvest-sickle', harvestSickleUrl);
        this.load.atlas('farmer-clean-full', farmerCleanFullUrl, farmerCleanFullAtlasUrl);
        this.load.image('farmhouse', farmhouseUrl);
        this.load.image('barn', barnUrl);
        this.load.image('shop', shopUrl);
        this.load.image('pet', petUrl);

        this.load.on('progress', (value) => {
            this.bridge?.setLoadProgress(value);
        });
    }

    create() {
        this.scene.start('MainScene');
    }
}
