const { Jimp } = require('jimp');

(async () => {
    try {
        const image = await Jimp.read('assets/farmer_clean.png');
        const width = image.width;
        const height = image.height;

        // Calculate horizontal projections of colored pixels (non-white)
        // A pixel is considered colored if r < 245 || g < 245 || b < 245
        const rowStats = new Array(height).fill(0);
        for (let y = 0; y < height; y++) {
            for (let x = 600; x < width; x++) { // Focus on right side
                const color = image.getPixelColor(x, y);
                const r = (color >> 24) & 0xff;
                const g = (color >> 16) & 0xff;
                const b = (color >> 8) & 0xff;
                if (r < 245 || g < 245 || b < 245) {
                    rowStats[y]++;
                }
            }
        }

        // Print row ranges with non-zero colored pixels
        let inRow = false;
        let startY = 0;
        const rows = [];
        for (let y = 0; y < height; y++) {
            const isColored = rowStats[y] > 5; // threshold to ignore tiny noise
            if (isColored && !inRow) {
                inRow = true;
                startY = y;
            } else if (!isColored && inRow) {
                inRow = false;
                rows.push({ start: startY, end: y });
            }
        }
        if (inRow) {
            rows.push({ start: startY, end: height - 1 });
        }

        console.log('Detected Rows on the right side:');
        rows.forEach((r, i) => console.log(`Row ${i + 1}: y = ${r.start} to ${r.end} (height ${r.end - r.start})`));

        // Let's analyze the columns in Row 3 (the last detected row, which should be the walking sequence)
        if (rows.length >= 3) {
            const walkRow = rows[rows.length - 1];
            const colStats = new Array(width).fill(0);
            for (let x = 600; x < width; x++) {
                for (let y = walkRow.start; y <= walkRow.end; y++) {
                    const color = image.getPixelColor(x, y);
                    const r = (color >> 24) & 0xff;
                    const g = (color >> 16) & 0xff;
                    const b = (color >> 8) & 0xff;
                    if (r < 245 || g < 245 || b < 245) {
                        colStats[x]++;
                    }
                }
            }

            let inCol = false;
            let startX = 0;
            const cols = [];
            for (let x = 600; x < width; x++) {
                const isColored = colStats[x] > 2; // threshold
                if (isColored && !inCol) {
                    inCol = true;
                    startX = x;
                } else if (!isColored && inCol) {
                    inCol = false;
                    cols.push({ start: startX, end: x });
                }
            }
            if (inCol) {
                cols.push({ start: startX, end: width - 1 });
            }

            console.log('Detected Columns in the walking row:');
            cols.forEach((c, i) => console.log(`Col ${i + 1}: x = ${c.start} to ${c.end} (width ${c.end - c.start})`));
        }

    } catch (e) {
        console.error('Error:', e);
    }
})();
