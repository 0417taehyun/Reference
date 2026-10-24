import { strokeDuration } from '../lib/ink-geometry.mjs';
import { SVG_NAMESPACE, drawMark, type Stroke } from './book-annotations';

/** Reading sweep: the stage eases open while a soft mask reads each quote in from the top. */
export const SWEEP = {
    open: { duration: 480, delay: 0, easing: 'cubic-bezier(.32, .72, 0, 1)' },
    rule: { duration: 420, easing: 'cubic-bezier(.23, 1, .32, 1)' },
    quote: { duration: 900, delay: 60, stagger: 160, easing: 'cubic-bezier(.33, 0, .2, 1)' },
    ink: 480,
    leave: 120,
    fade: 160,
    close: { duration: 340, delay: 64, easing: 'cubic-bezier(.4, 0, .2, 1)' },
};
export type Timing = { duration: number; delay: number; easing: string };

/** Keyword chips on the intro page open the matching quotes below them without turning the page. */
export class KeywordIndex {
    chips: HTMLButtonElement[];
    panels: HTMLElement[];
    stage: HTMLElement;
    body: HTMLElement | null;
    open: HTMLElement | null = null;
    running = new Set<Animation>();
    token = 0;
    drawnWidth = 0;
    constructor(public root: HTMLElement, public motionEnabled: () => boolean) {
        this.chips = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-keyword-chip]'));
        this.panels = Array.from(root.querySelectorAll<HTMLElement>('[data-keyword-panel]'));
        this.stage = root.querySelector<HTMLElement>('[data-keyword-stage]')!;
        this.body = root.closest<HTMLElement>('.page-body');
        this.chips.forEach(chip => chip.addEventListener('click', () => this.toggle(chip)));
        root.addEventListener('keydown', this.handleKey.bind(this));
        new ResizeObserver(this.handleResize.bind(this)).observe(this.stage);
    }
    panelFor(chip: HTMLButtonElement) {
        return this.panels.find(panel => panel.id === chip.getAttribute('aria-controls')) || null;
    }
    chipFor(panel: HTMLElement) {
        return this.chips.find(chip => chip.getAttribute('aria-controls') === panel.id) || null;
    }
    toggle(chip: HTMLButtonElement) {
        const panel = this.panelFor(chip);
        if (!panel)
            return;
        if (panel === this.open)
            return this.close();
        void this.show(chip, panel);
    }
    play(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        const animation = element.animate(keyframes, options);
        this.running.add(animation);
        return animation;
    }
    stopAll() {
        this.running.forEach(animation => animation.cancel());
        this.running.clear();
        this.stage.style.removeProperty('height');
        delete this.stage.dataset.sizing;
    }
    size(from: number, target: number, timing: Timing, hold = false) {
        this.stage.dataset.sizing = '';
        // The shrinking margin keeps the final scroll height available while the stage grows.
        const keyframes = [{ height: `${from}px`, marginBottom: `${Math.max(0, target - from)}px` }, { height: `${target}px`, marginBottom: '0px' }];
        const animation = this.play(this.stage, keyframes, { ...timing, fill: 'both' });
        if (!hold)
            void animation.finished.then(() => this.settle(animation)).catch(() => { });
        return animation;
    }
    settle(animation: Animation) {
        if (!this.running.delete(animation))
            return;
        animation.cancel();
        delete this.stage.dataset.sizing;
    }
    async show(chip: HTMLButtonElement, panel: HTMLElement) {
        const animate = this.motionEnabled();
        const token = ++this.token;
        const from = this.stage.getBoundingClientRect().height;
        const leaving = this.panels.find(other => other !== panel && other.hasAttribute('data-open'));
        this.stopAll();
        this.open = panel;
        this.chips.forEach(other => other.setAttribute('aria-expanded', String(other === chip)));
        if (leaving && animate)
            await this.leave(leaving, from);
        if (token !== this.token)
            return;
        this.panels.forEach(other => other.toggleAttribute('data-open', other === panel));
        this.stopAll();
        if (animate)
            this.enter(panel, from, this.stage.getBoundingClientRect().height);
        this.draw(panel, animate);
        this.reveal(animate);
    }
    leave(panel: HTMLElement, height: number) {
        this.stage.style.height = `${height}px`;
        this.stage.dataset.sizing = '';
        return this.play(panel, [{ opacity: 1 }, { opacity: 0 }], { duration: SWEEP.leave, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => { });
    }
    enter(panel: HTMLElement, from: number, target: number) {
        this.size(from, target, SWEEP.open);
        this.play(panel, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { pseudoElement: '::before', ...SWEEP.rule, fill: 'backwards' });
        panel.querySelectorAll<HTMLElement>('.keyword-quote').forEach((quote, order) => this.play(quote, [
            { '--sweep': '0%', transform: 'translateY(6px)' },
            { '--sweep': '140%', transform: 'none' },
        ], { duration: SWEEP.quote.duration, delay: SWEEP.quote.delay + order * SWEEP.quote.stagger, easing: SWEEP.quote.easing, fill: 'backwards' }));
    }
    close() {
        if (!this.open)
            return;
        const token = ++this.token;
        const from = this.stage.getBoundingClientRect().height;
        this.stopAll();
        this.open = null;
        this.chips.forEach(chip => chip.setAttribute('aria-expanded', 'false'));
        if (!this.motionEnabled())
            return this.hideAll();
        const animations = [
            this.play(this.stage, [{ opacity: 1 }, { opacity: 0 }], { duration: SWEEP.fade, easing: 'linear', fill: 'forwards' }),
            this.size(from, 0, SWEEP.close, true),
        ];
        void Promise.all(animations.map(animation => animation.finished)).then(() => this.finishClose(token)).catch(() => { });
    }
    finishClose(token: number) {
        if (token !== this.token)
            return;
        this.hideAll();
        this.stopAll();
    }
    hideAll() {
        this.panels.forEach(panel => panel.removeAttribute('data-open'));
    }
    handleKey(event: KeyboardEvent) {
        if (event.key !== 'Escape' || !this.open)
            return;
        const chip = this.chipFor(this.open);
        this.close();
        chip?.focus();
    }
    handleResize() {
        const width = this.stage.clientWidth;
        if (!this.open || !width || Math.abs(width - this.drawnWidth) < .5)
            return;
        this.draw(this.open, false);
    }
    draw(panel: HTMLElement, animate: boolean) {
        this.drawnWidth = this.stage.clientWidth;
        panel.querySelectorAll<HTMLElement>('.keyword-quote-text').forEach((quote, order) => this.drawQuote(quote, order, animate));
    }
    drawQuote(quote: HTMLElement, order: number, animate: boolean) {
        quote.querySelector('.ink-layer')?.remove();
        const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
        svg.classList.add('ink-layer');
        svg.setAttribute('aria-hidden', 'true');
        // The quote and its marks share the entrance transform, so their offsets stay exact.
        const origin = quote.getBoundingClientRect();
        const strokes = Array.from(quote.querySelectorAll('mark')).flatMap((mark, index) => drawMark(mark, index, svg, origin));
        quote.append(svg);
        quote.classList.add('annotation-ready');
        // Each underline is drawn once the sweep has passed its quote.
        if (animate)
            strokes.reduce((delay, stroke) => this.playStroke(stroke, delay), SWEEP.ink + order * SWEEP.quote.stagger);
    }
    playStroke(stroke: Stroke, delay: number) {
        const duration = strokeDuration('underline', stroke.path.getTotalLength());
        this.play(stroke.path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, delay, fill: 'backwards', easing: 'cubic-bezier(.3,.1,.3,1)' });
        return delay + duration + 40;
    }
    reveal(animate: boolean) {
        if (!this.body)
            return;
        // Bring the chips to the top only when the quotes would start in the lower half of the page.
        const viewport = this.body.getBoundingClientRect();
        if (this.stage.getBoundingClientRect().top - viewport.top <= this.body.clientHeight * .5)
            return;
        const top = this.body.scrollTop + this.root.getBoundingClientRect().top - viewport.top - 4;
        this.body.scrollTo({ top, behavior: animate ? 'smooth' : 'instant' });
    }
}
export function initKeywordIndex(host: HTMLElement, motionEnabled: () => boolean) {
    const root = host.querySelector<HTMLElement>('[data-keyword-index]');
    return root ? new KeywordIndex(root, motionEnabled) : null;
}
