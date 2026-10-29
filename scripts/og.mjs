import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { circlePath, underlinePath } from '../src/lib/ink-geometry.mjs';
export const OG_SIZE = { width: 1200, height: 630 };
// The pen geometry is tuned for the site's largest body text, so marks are measured at that size and scaled back up.
export const SITE_FONT_SIZE = 17;
/** Runs in the page: measures each [data-ink] line box relative to the ink layer, in site-sized units. */
export function measureInk(siteFontSize) {
    const origin = document.querySelector('[data-ink-layer]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-ink]')].flatMap((element) => {
        const scale = parseFloat(getComputedStyle(element).fontSize) / siteFontSize;
        return [...element.getClientRects()].map(rectangle => ({
            kind: element.dataset.ink, scale, horizontal: (rectangle.left - origin.left) / scale, vertical: (rectangle.top - origin.top) / scale, width: rectangle.width / scale, height: rectangle.height / scale,
        }));
    });
}
export function inkStroke(mark, index) {
    const factories = { underline: underlinePath, circle: circlePath };
    return { kind: mark.kind, scale: mark.scale, path: factories[mark.kind](mark.horizontal, mark.vertical, mark.width, mark.height, index) };
}
/** Runs in the page: draws the strokes computed in Node with the site's pen geometry. */
export function drawInk(strokes) {
    document.querySelector('[data-ink-layer]').innerHTML = strokes.map(stroke => `<path data-ink="${stroke.kind}" transform="scale(${stroke.scale})" d="${stroke.path}" />`).join('');
}
export async function renderOg(output = resolve('public/og.png')) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: OG_SIZE });
        await page.goto(pathToFileURL(resolve('scripts/og.html')).href);
        await page.evaluate(() => document.fonts.ready);
        const marks = await page.evaluate(measureInk, SITE_FONT_SIZE);
        await page.evaluate(drawInk, marks.map(inkStroke));
        await page.screenshot({ path: output });
        return output;
    }
    finally {
        await browser.close();
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    console.log(`Saved ${await renderOg()}`);
