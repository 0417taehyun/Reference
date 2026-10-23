import { describe, it, expect } from 'vitest';
import { paperCurve, paperCurl, bookViews, paperPanelMatrix } from './book-geometry.mjs';
describe('paper surface', () => {
    it('lies flat on either side of the spine at rest', () => {
        for (const progressValue of [0, 1]) {
            const panels = paperCurve(progressValue, 420);
            expect(panels[0].x).toBe(0);
            expect(panels.every(panel => Math.abs(panel.z) < 1e-9)).toBe(true);
            const last = panels.at(-1);
            expect(last.x + Math.cos(last.angle) * last.width).toBeCloseTo(progressValue === 0 ? 420 : -420);
        }
    });
    it('bows above a rigid sheet while keeping the paper length unchanged', () => {
        const panels = paperCurve(0.3, 420);
        expect(new Set(panels.map(panel => panel.angle.toFixed(3))).size).toBeGreaterThan(20);
        expect(panels[14].z).toBeGreaterThan(420 * 0.4);
        expect(panels.reduce((count, panel) => count + panel.width, 0)).toBeCloseTo(420);
        const cover = paperCurve(0.3, 420, 28, true);
        expect(new Set(cover.map(panel => panel.angle)).size).toBe(1);
    });
    it('keeps every page reachable in desktop and phone layouts', () => {
        expect(bookViews(8, true)).toEqual([[0], [1, 2], [3, 4], [5, 6], [7]]);
        expect(bookViews(8, false).flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(bookViews(8, false, [3, 5])).toEqual([[0], [1], [2], [4], [6], [7]]);
        expect(bookViews(8, true, [3, 5])).toEqual([[0], [1, 2], [3, 4], [5, 6], [7]]);
    });
    it('peels a phone page from its edge, exposing its reverse and the next page', () => {
        const edges = [.2, .5, .8].map(progressValue => {
            const panels = paperCurl(progressValue, 360);
            expect(panels.some(panel => panel.angle > Math.PI / 2)).toBe(true);
            expect(panels.some(panel => panel.z > 0)).toBe(true);
            expect(panels.reduce((count, panel) => count + panel.width, 0)).toBeCloseTo(360);
            return Math.max(...panels.map(panel => panel.x));
        });
        expect(edges[0]).toBeGreaterThan(edges[1]);
        expect(edges[1]).toBeGreaterThan(edges[2]);
        expect(paperCurl(0, 360).every(panel => panel.angle === 0 && panel.z === 0)).toBe(true);
        expect(paperCurl(1, 360).every(panel => panel.angle === Math.PI && panel.x <= 0)).toBe(true);
    });
    it('projects adjacent paper edges to the same pixels throughout a turn', () => {
        [true, false].forEach(mobile => [.1, .3, .5, .7, .9].forEach(progress => assertProjectedEdges(mobile, progress)));
    });
});
export function projectedPoint(matrix, horizontal, vertical) {
    return [(matrix[0] * horizontal + matrix[4] * vertical + matrix[12]) / (matrix[3] * horizontal + matrix[7] * vertical + matrix[15]),
        (matrix[1] * horizontal + matrix[5] * vertical + matrix[13]) / (matrix[3] * horizontal + matrix[7] * vertical + matrix[15])];
}
export function assertProjectedEdge(curve, index, mobile, vertical) {
    const right = projectedPoint(paperPanelMatrix(curve[index], 358, 617, mobile), curve[index].width, vertical);
    const left = projectedPoint(paperPanelMatrix(curve[index + 1], 358, 617, mobile), 0, vertical);
    expect(right[0]).toBeCloseTo(left[0], 8);
    expect(right[1]).toBeCloseTo(left[1], 8);
}
export function assertProjectedEdges(mobile, progress) {
    const curve = mobile ? paperCurl(progress, 358) : paperCurve(progress, 358);
    curve.slice(0, -1).forEach((_panel, index) => [0, 617].forEach(vertical => assertProjectedEdge(curve, index, mobile, vertical)));
}
