import Phaser from 'phaser';

export const PHASER_GAME_WIDTH = 1280;
export const PHASER_GAME_HEIGHT = 720;

export function createPhaserConfig(parent, scenes) {
    return {
        type: Phaser.AUTO,
        parent,
        width: PHASER_GAME_WIDTH,
        height: PHASER_GAME_HEIGHT,
        transparent: true,
        backgroundColor: 'rgba(0,0,0,0)',
        scene: scenes,
        physics: {
            default: 'arcade',
            arcade: {
                debug: false
            }
        },
        scale: {
            mode: Phaser.Scale.NONE,
            width: PHASER_GAME_WIDTH,
            height: PHASER_GAME_HEIGHT
        },
        render: {
            pixelArt: false,
            antialias: true,
            antialiasGL: true,
            roundPixels: false
        }
    };
}
