import fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
function resizeBuffer(png, targetWidth, targetHeight) {
    if (png.width === targetWidth && png.height === targetHeight)
        return png.data;
    const data = new Uint8Array(targetWidth * targetHeight * 4);
    data.fill(0);
    const rowBytes = png.width * 4;
    for (let y = 0; y < png.height; y += 1)
        data.set(png.data.subarray(y * rowBytes, (y * rowBytes) + rowBytes), y * targetWidth * 4);
    return data;
}
export async function compareImages(baselinePath, actualPath, diffPath, threshold) {
    const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    const actual = PNG.sync.read(fs.readFileSync(actualPath));
    const width = Math.max(baseline.width, actual.width);
    const height = Math.max(baseline.height, actual.height);
    const diff = new PNG({ width, height });
    const diffCount = pixelmatch(resizeBuffer(baseline, width, height), resizeBuffer(actual, width, height), diff.data, width, height, { threshold, includeAA: true });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    return { diffCount, diffPercent: Math.round(((diffCount / (width * height || 1)) * 100) * 100) / 100, width, height, baselineWidth: baseline.width, baselineHeight: baseline.height };
}
