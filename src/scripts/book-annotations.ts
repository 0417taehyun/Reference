import { circlePath, starPath, strokeDuration, underlinePath } from '../lib/ink-geometry.mjs';
import { readSessionList, writeSession } from '../lib/session';
export type Note = {
    text: string;
    type: 'circle' | 'star';
};
export type Stroke = {
    path: SVGPathElement;
    top: number;
};
export type InkKind = 'underline' | 'circle' | 'star';
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export function isNote(value: unknown): value is Note {
    return !!value && typeof value === 'object' && 'text' in value && typeof value.text === 'string' && 'type' in value && ['circle', 'star'].includes(String(value.type));
}
export function parseNotes(text: string): Note[] {
    try {
        return filterNotes(JSON.parse(text));
    }
    catch {
        return [];
    }
}
export function filterNotes(value: unknown): Note[] {
    if (!Array.isArray(value))
        return [];
    return value.filter(isNote);
}
export function finishAnimation(animation: Animation) {
    try {
        animation.finish();
        animation.cancel();
    }
    catch { /* A detached animation may already have finished. */ }
}
export function textNodes(root: Element): Text[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
        nodes.push(node as Text);
        node = walker.nextNode();
    }
    return nodes;
}
export function phraseRange(root: Element, text: string): Range | null {
    const nodes = textNodes(root);
    const start = nodes.map(node => node.data).join('').indexOf(text);
    if (start < 0 || !text.length)
        return null;
    const offsets = textOffsets(nodes);
    const startIndex = nodes.findIndex((node, index) => start >= offsets[index] && start < offsets[index] + node.length);
    const end = start + text.length;
    const endIndex = nodes.findIndex((node, index) => end > offsets[index] && end <= offsets[index] + node.length);
    if (startIndex < 0 || endIndex < 0)
        return null;
    const range = document.createRange();
    range.setStart(nodes[startIndex], start - offsets[startIndex]);
    range.setEnd(nodes[endIndex], end - offsets[endIndex]);
    return range;
}
export function createStroke(svg: SVGSVGElement, origin: DOMRect, rectangle: DOMRect, kind: InkKind, index: number): Stroke | null {
    if (rectangle.width < 1 || rectangle.height < 1)
        return null;
    const horizontal = rectangle.left - origin.left, vertical = rectangle.top - origin.top;
    const factories = { underline: underlinePath, circle: circlePath, star: starPath };
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', factories[kind](horizontal, vertical, rectangle.width, rectangle.height, index));
    path.setAttribute('pathLength', '1');
    path.dataset.ink = kind;
    if (kind === 'star')
        configureStar(path, horizontal, vertical);
    svg.append(path);
    return { path, top: vertical };
}
export function configureStar(path: SVGPathElement, horizontal: number, vertical: number) {
    path.setAttribute('transform', `translate(${horizontal - 8},${vertical - 4}) scale(.68)`);
    path.setAttribute('vector-effect', 'non-scaling-stroke');
}
export function drawMark(mark: Element, index: number, svg: SVGSVGElement, origin: DOMRect): Stroke[] {
    return Array.from(mark.getClientRects()).map(rectangle => createStroke(svg, origin, rectangle, 'underline', index)).filter((stroke): stroke is Stroke => !!stroke);
}
export function drawNote(note: Note, index: number, prose: Element, svg: SVGSVGElement, origin: DOMRect): Stroke[] {
    const range = phraseRange(prose, note.text);
    if (!range)
        return [];
    const rectangles = Array.from(range.getClientRects());
    const selected = note.type === 'star' ? rectangles.slice(0, 1) : rectangles;
    return selected.map(rectangle => createStroke(svg, origin, rectangle, note.type, index)).filter((stroke): stroke is Stroke => !!stroke);
}
export class BookAnnotations {
    seen = new Set(readSessionList('book-ink-v3'));
    drawings = new Map<HTMLElement, Stroke[]>();
    animations = new Set<Animation>();
    timers = new Set<number>();
    playing = new Map<HTMLElement, string>();
    constructor(public play: (kind: 'pen', seconds: number, delay: number) => void, public stopAudio: () => void, public motionEnabled: () => boolean) { }
    remember(key: string) {
        this.seen.add(key);
        writeSession('book-ink-v3', JSON.stringify([...this.seen]));
    }
    finish(rememberInk = true) {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
        this.animations.forEach(finishAnimation);
        this.animations.clear();
        if (rememberInk)
            this.playing.forEach(key => this.remember(key));
        this.playing.clear();
        this.drawings.forEach((_strokes, page) => delete page.dataset.inkPlaying);
        this.stopAudio();
    }
    draw(page: HTMLElement): Stroke[] {
        const prose = page.querySelector<HTMLElement>('.prose');
        if (!prose)
            return [];
        prose.querySelector('.ink-layer')?.remove();
        const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
        svg.classList.add('ink-layer');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('width', String(prose.offsetWidth));
        svg.setAttribute('height', String(prose.scrollHeight));
        const origin = prose.getBoundingClientRect();
        const underlines = Array.from(prose.querySelectorAll('mark')).flatMap((mark, index) => drawMark(mark, index, svg, origin));
        const notes = parseNotes(page.dataset.annotations || '[]').flatMap((note, index) => drawNote(note, index, prose, svg, origin));
        const strokes = [...underlines, ...notes].sort((first, second) => first.top - second.top);
        prose.append(svg);
        prose.classList.add('annotation-ready');
        this.drawings.set(page, strokes);
        return strokes;
    }
    show(pages: HTMLElement[], animate = true) {
        this.finish();
        pages.reduce((delay, page) => this.showPage(page, animate, delay), 0);
    }
    showPage(page: HTMLElement, animate: boolean, delay: number): number {
        const strokes = this.drawings.get(page) || this.draw(page);
        const key = document.documentElement.lang + ':' + page.id;
        if (!strokes.length || this.seen.has(key) || !animate || !this.motionEnabled())
            return delay;
        this.playing.set(page, key);
        page.dataset.inkPlaying = 'true';
        const end = strokes.reduce((elapsed, stroke) => this.playStroke(stroke, elapsed), delay);
        const timer = window.setTimeout(() => { this.timers.delete(timer); this.completePage(page, key); }, end);
        this.timers.add(timer);
        return end;
    }
    completePage(page: HTMLElement, key: string) {
        this.remember(key);
        this.playing.delete(page);
        delete page.dataset.inkPlaying;
    }
    playStroke(stroke: Stroke, delay: number): number {
        const kind = stroke.path.dataset.ink!;
        const length = stroke.path.getTotalLength() * (kind === 'star' ? .68 : 1);
        const duration = strokeDuration(kind, length);
        const animation = stroke.path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, delay, fill: 'backwards', easing: 'linear' });
        this.animations.add(animation);
        void animation.finished.then(() => this.animations.delete(animation)).catch(() => { });
        this.play('pen', duration / 1000, delay / 1000);
        return delay + duration + 100;
    }
    clearDrawing(page: HTMLElement) {
        page.querySelector('.ink-layer')?.remove();
        page.querySelector('.prose')?.classList.remove('annotation-ready');
    }
    resize(pages: HTMLElement[]) {
        const animate = pages.some(page => this.playing.has(page));
        this.finish(false);
        this.drawings.forEach((_strokes, page) => this.clearDrawing(page));
        this.drawings.clear();
        pages.forEach(page => this.draw(page));
        this.show(pages, animate);
    }
}
export function createAnnotations(play: (kind: 'pen', seconds: number, delay: number) => void, stopAudio: () => void, motionEnabled: () => boolean) {
    return new BookAnnotations(play, stopAudio, motionEnabled);
}
export function textOffsets(nodes: Text[]): number[] {
    let offset = 0;
    return nodes.map(node => { const start = offset; offset += node.length; return start; });
}
