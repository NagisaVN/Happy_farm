export class Animation {
    constructor() {
        this.images = {};
        this.loaded = false;
        this.loadSprites();
    }

    loadSprites() {
        const sources = {
            idle: 'assets/farmer_idle.png',
            action: 'assets/farmer_action.png',
            back: 'assets/farmer_back.png',
            walk: 'assets/farmer_walk_spritesheet.png'
        };

        let loadedCount = 0;
        const total = Object.keys(sources).length;

        for (const [key, src] of Object.entries(sources)) {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                loadedCount++;
                if (loadedCount === total) {
                    this.loaded = true;
                }
            };
            img.onerror = (e) => {
                console.error(`Error loading sprite: ${src}`, e);
            };
            this.images[key] = img;
        }
    }

    /**
     * Draws the active animation frame on the canvas context.
     * @param {CanvasRenderingContext2D} ctx 
     * @param {string} state - IDLE, WALK, DIG, PLANT, HARVEST
     * @param {string} direction - FRONT, BACK, LEFT, RIGHT, FRONT_LEFT, FRONT_RIGHT, BACK_LEFT, BACK_RIGHT
     * @param {number} frameIndex 
     */
    draw(ctx, state, direction, frameIndex) {
        if (!this.loaded) return;

        ctx.clearRect(0, 0, 176, 342);

        const isLeft = direction.includes('LEFT') || direction === 'LEFT';
        const isBack = direction === 'BACK';
        const isFront = direction === 'FRONT';

        ctx.save();

        // If facing Left, flip horizontally
        if (isLeft) {
            ctx.translate(176, 0);
            ctx.scale(-1, 1);
        }

        switch (state) {
            case 'IDLE': {
                // 2-frame breathing animation
                const img = isBack ? this.images.back : this.images.idle;
                if (frameIndex === 0) {
                    ctx.drawImage(img, 0, 0, 176, 293, 0, 0, 176, 293);
                } else {
                    // Squash slightly (breathing)
                    ctx.drawImage(img, 0, 4, 176, 289, 0, 4, 176, 289);
                }
                break;
            }

            case 'WALK': {
                if (isBack) {
                    // Back walk: bob back frame up and down
                    const bobY = frameIndex % 2 === 0 ? 0 : 6;
                    ctx.drawImage(this.images.back, 0, bobY, 176, 293 - bobY, 0, bobY, 176, 293 - bobY);
                } else if (isFront) {
                    // Front walk: bob front frame up and down
                    const bobY = frameIndex % 2 === 0 ? 0 : 6;
                    ctx.drawImage(this.images.idle, 0, bobY, 176, 293 - bobY, 0, bobY, 176, 293 - bobY);
                } else {
                    // Side walk: cycle through the 8-frame spritesheet
                    const idx = frameIndex % 8;
                    ctx.drawImage(this.images.walk, idx * 176, 0, 176, 293, 0, 0, 176, 293);
                }
                break;
            }

            case 'DIG': {
                // Dig: use the action/pitchfork image and rotate/translate it in a digging motion
                const angle = (frameIndex % 6) * (Math.PI / 30); // 0 to 18 degrees rotation
                ctx.translate(88, 300); // pivot near feet
                ctx.rotate(angle);
                ctx.translate(-88, -300);
                ctx.drawImage(this.images.action, 0, 0, 176, 293, 0, 0, 176, 293);
                break;
            }

            case 'PLANT': {
                // Plant: use the idle image and bend forward (tilt and translate down)
                const bendY = (frameIndex % 6) * 3; // 0 to 15px translate down
                const angle = (frameIndex % 6) * (Math.PI / 45); // 0 to 12 degrees
                ctx.translate(88, 300);
                ctx.rotate(angle);
                ctx.translate(-88, -300);
                ctx.drawImage(this.images.idle, 0, bendY, 176, 293 - bendY, 0, bendY, 176, 293 - bendY);
                break;
            }

            case 'HARVEST': {
                // Harvest: use the action/pitchfork image and swing it
                const angle = -(frameIndex % 6) * (Math.PI / 36); // Swing backward
                ctx.translate(88, 300);
                ctx.rotate(angle);
                ctx.translate(-88, -300);
                ctx.drawImage(this.images.action, 0, 0, 176, 293, 0, 0, 176, 293);
                break;
            }

            default:
                ctx.drawImage(this.images.idle, 0, 0, 176, 293, 0, 0, 176, 293);
                break;
        }

        ctx.restore();
    }
}
