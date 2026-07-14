const fs = require('fs');
const path = require('path');
const { Jimp, rgbaToInt } = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const SOURCE = path.join(ASSETS, 'farmer_user_reference.png');
const OUT_IMAGE = path.join(ASSETS, 'farmer_cleanFull.png');
const OUT_JSON = path.join(ASSETS, 'farmer_cleanFull.json');

const FRAME_SIZE = 512;
const COLUMNS = 8;
const ROWS = 7;
const SHEET_WIDTH = FRAME_SIZE * COLUMNS;
const SHEET_HEIGHT = FRAME_SIZE * ROWS;
const DISPLAY_WIDTH = 82;
const DISPLAY_HEIGHT = 126;
const DIRECTIONS = ['front', 'left', 'right', 'back', 'back_left', 'back_right'];

const IDLE_CELLS = {
    front: { col: 0 },
    right: { col: 1 },
    left: { col: 2 },
    back: { col: 3 },
    back_left: { col: 4 },
    back_right: { col: 5 }
};

function blank(width = FRAME_SIZE, height = FRAME_SIZE) {
    return new Jimp({ width, height, color: 0x00000000 });
}

function isGreenKey(r, g, b) {
    return g > 68 && g - r > 20 && g - b > 20;
}

function removeChromaGreen(image) {
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function scan(_x, _y, idx) {
        const r = this.bitmap.data[idx];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        const a = this.bitmap.data[idx + 3];

        if (isGreenKey(r, g, b)) {
            this.bitmap.data[idx + 3] = 0;
            return;
        }

        const edgeGreen = g > 55 && g - r > 14 && g - b > 14;
        if (edgeGreen) this.bitmap.data[idx + 1] = Math.min(g, Math.max(r, b) + 8);
    });
    return image;
}

function removeSmallComponents(image, minPixels = 120) {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const visited = new Uint8Array(width * height);
    const keep = new Uint8Array(width * height);
    const indexOf = (x, y) => y * width + x;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const start = indexOf(x, y);
            if (visited[start]) continue;
            visited[start] = 1;

            const alpha = image.bitmap.data[image.getPixelIndex(x, y) + 3];
            if (alpha <= 12) continue;

            const stack = [[x, y]];
            const pixels = [];
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let totalR = 0;
            let totalG = 0;
            let totalB = 0;

            while (stack.length) {
                const [cx, cy] = stack.pop();
                const pixel = indexOf(cx, cy);
                const pixelIndex = image.getPixelIndex(cx, cy);
                pixels.push(pixel);
                totalR += image.bitmap.data[pixelIndex];
                totalG += image.bitmap.data[pixelIndex + 1];
                totalB += image.bitmap.data[pixelIndex + 2];
                minX = Math.min(minX, cx);
                maxX = Math.max(maxX, cx);
                minY = Math.min(minY, cy);
                maxY = Math.max(maxY, cy);

                for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const next = indexOf(nx, ny);
                    if (visited[next]) continue;
                    visited[next] = 1;
                    const nextAlpha = image.bitmap.data[image.getPixelIndex(nx, ny) + 3];
                    if (nextAlpha > 12) stack.push([nx, ny]);
                }
            }

            const componentWidth = maxX - minX + 1;
            const componentHeight = maxY - minY + 1;
            const avgR = totalR / pixels.length;
            const avgG = totalG / pixels.length;
            const avgB = totalB / pixels.length;
            const avgMax = Math.max(avgR, avgG, avgB);
            const avgMin = Math.min(avgR, avgG, avgB);
            const dividerLike = componentWidth <= 9 && componentHeight >= 120 && avgMax > 135 && avgMax - avgMin < 55;

            if (pixels.length >= minPixels && !dividerLike) {
                pixels.forEach((pixel) => { keep[pixel] = 1; });
            }
        }
    }

    image.scan(0, 0, width, height, function scan(x, y, idx) {
        if (!keep[indexOf(x, y)]) this.bitmap.data[idx + 3] = 0;
    });
    return image;
}

function trimAlpha(image, threshold = 14) {
    let minX = image.bitmap.width;
    let minY = image.bitmap.height;
    let maxX = -1;
    let maxY = -1;

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function scan(x, y, idx) {
        if (this.bitmap.data[idx + 3] <= threshold) return;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    });

    if (maxX < minX || maxY < minY) return image;
    const pad = 5;
    return image.crop({
        x: Math.max(0, minX - pad),
        y: Math.max(0, minY - pad),
        w: Math.min(image.bitmap.width - Math.max(0, minX - pad), maxX - minX + 1 + pad * 2),
        h: Math.min(image.bitmap.height - Math.max(0, minY - pad), maxY - minY + 1 + pad * 2)
    });
}

function resizeContain(image, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / image.bitmap.width, maxHeight / image.bitmap.height);
    return image.resize({
        w: Math.max(1, Math.round(image.bitmap.width * scale)),
        h: Math.max(1, Math.round(image.bitmap.height * scale))
    });
}

function fitToFrame(subject, options = {}) {
    const image = resizeContain(trimAlpha(subject.clone()), options.maxWidth ?? 350, options.maxHeight ?? 455);
    const frame = blank();
    const x = Math.round((FRAME_SIZE - image.bitmap.width) / 2 + (options.offsetX ?? 0));
    const y = Math.round((options.footY ?? 488) - image.bitmap.height);
    frame.composite(image, x, y);
    return frame;
}

function cleanCrop(source, crop, options = {}) {
    const image = source.clone().crop(crop);
    removeChromaGreen(image);
    removeSmallComponents(image, options.minPixels ?? 120);
    return fitToFrame(image, options);
}

function flipFrame(frame) {
    return frame.clone().flip({ horizontal: true, vertical: false });
}

function copyRegion(source, target, region, dx = 0, dy = 0) {
    const piece = source.clone().crop(region);
    target.composite(piece, region.x + dx, region.y + dy);
}

function syntheticWalkFromIdle(idleFrame, direction) {
    const isBack = direction.startsWith('back');
    const hipY = isBack ? 322 : 315;
    const centerX = direction.endsWith('left') ? 247 : direction.endsWith('right') ? 265 : 256;
    const upperRegion = { x: 0, y: 0, w: FRAME_SIZE, h: hipY + 38 };
    const leftLegRegion = { x: 0, y: hipY, w: centerX, h: FRAME_SIZE - hipY };
    const rightLegRegion = { x: centerX, y: hipY, w: FRAME_SIZE - centerX, h: FRAME_SIZE - hipY };
    const poses = [
        { bodyY: 0, lx: 0, ly: 0, rx: 0, ry: 0 },
        { bodyY: -2, lx: -5, ly: 10, rx: 4, ry: -6 },
        { bodyY: 3, lx: -2, ly: 4, rx: 2, ry: 1 },
        { bodyY: -2, lx: 4, ly: -6, rx: 5, ry: 10 },
        { bodyY: 0, lx: 0, ly: 0, rx: 0, ry: 0 },
        { bodyY: -1, lx: -4, ly: 8, rx: 3, ry: -5 },
        { bodyY: 2, lx: -1, ly: 3, rx: 1, ry: 2 },
        { bodyY: -1, lx: 3, ly: -5, rx: 4, ry: 8 }
    ];

    return poses.map((pose) => {
        const frame = blank();
        copyRegion(idleFrame, frame, upperRegion, 0, pose.bodyY);
        copyRegion(idleFrame, frame, leftLegRegion, pose.lx, pose.ly);
        copyRegion(idleFrame, frame, rightLegRegion, pose.rx, pose.ry);
        return frame;
    });
}

function atlasFrame(name, index) {
    const x = (index % COLUMNS) * FRAME_SIZE;
    const y = Math.floor(index / COLUMNS) * FRAME_SIZE;
    return {
        filename: name,
        frame: { x, y, w: FRAME_SIZE, h: FRAME_SIZE },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
        sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE }
    };
}

function put(sheet, frame, index) {
    sheet.composite(frame, (index % COLUMNS) * FRAME_SIZE, Math.floor(index / COLUMNS) * FRAME_SIZE);
}

function validate(sheet, frames) {
    if (sheet.bitmap.width !== SHEET_WIDTH || sheet.bitmap.height !== SHEET_HEIGHT) {
        throw new Error(`Bad sheet size ${sheet.bitmap.width}x${sheet.bitmap.height}`);
    }
    if (Object.keys(frames).length !== 54) {
        throw new Error(`Expected 54 frames, got ${Object.keys(frames).length}`);
    }
    const corners = [
        sheet.getPixelColor(0, 0),
        sheet.getPixelColor(SHEET_WIDTH - 1, 0),
        sheet.getPixelColor(0, SHEET_HEIGHT - 1),
        sheet.getPixelColor(SHEET_WIDTH - 1, SHEET_HEIGHT - 1)
    ].map((color) => color & 0xff);
    if (corners.some(Boolean)) throw new Error(`Sheet corners are not transparent: ${corners.join(',')}`);
}

(async () => {
    const source = await Jimp.read(SOURCE);
    const sheet = blank(SHEET_WIDTH, SHEET_HEIGHT);
    const frames = {};

    const topCellWidth = source.bitmap.width / 6;
    const bottomCellWidth = source.bitmap.width / 8;
    const idleRowHeight = 560;
    const walkRowY = 596;

    const idleFrames = {};
    for (const direction of DIRECTIONS) {
        const { col } = IDLE_CELLS[direction];
        idleFrames[direction] = cleanCrop(source, {
            x: Math.round(col * topCellWidth + 4),
            y: 4,
            w: Math.round(topCellWidth - 8),
            h: idleRowHeight - 8
        }, {
            maxWidth: 350,
            maxHeight: 455,
            footY: 488,
            minPixels: 150
        });
    }

    const walkRight = Array.from({ length: 8 }, (_unused, index) => cleanCrop(source, {
        x: Math.round(index * bottomCellWidth + 4),
        y: walkRowY,
        w: Math.round(bottomCellWidth - 8),
        h: source.bitmap.height - walkRowY - 8
    }, {
        maxWidth: 355,
        maxHeight: 455,
        footY: 488,
        minPixels: 115
    }));

    let index = 0;
    for (const direction of DIRECTIONS) {
        const name = `idle_${direction}`;
        put(sheet, idleFrames[direction], index);
        frames[name] = atlasFrame(name, index);
        index++;
    }

    for (const direction of DIRECTIONS) {
        const walkFrames = direction === 'right'
            ? walkRight
            : direction === 'left'
                ? walkRight.map(flipFrame)
                : syntheticWalkFromIdle(idleFrames[direction], direction);

        walkFrames.forEach((frame, frameIndex) => {
            const name = `walk_${direction}_${String(frameIndex).padStart(2, '0')}`;
            put(sheet, frame, index);
            frames[name] = atlasFrame(name, index);
            index++;
        });
    }

    validate(sheet, frames);
    await sheet.write(OUT_IMAGE);
    fs.writeFileSync(OUT_JSON, `${JSON.stringify({
        frames,
        meta: {
            app: 'Happy Farm user-reference farmer builder',
            version: '2.0',
            image: 'farmer_cleanFull.png',
            format: 'RGBA8888',
            size: { w: SHEET_WIDTH, h: SHEET_HEIGHT },
            scale: '1',
            frameSize: { w: FRAME_SIZE, h: FRAME_SIZE },
            displaySize: { w: DISPLAY_WIDTH, h: DISPLAY_HEIGHT }
        }
    }, null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUT_IMAGE)} and ${path.relative(ROOT, OUT_JSON)}`);
})();
