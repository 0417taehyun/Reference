import { bookViews, paperCurve, paperCurl, paperPanelMatrix } from '../lib/book-geometry.mjs';
import { createBookAudio } from './book-audio';
import { createAnnotations } from './book-annotations';
import { clamp, swipeIntent, shouldCompleteTurn, settleDuration, turnThreshold } from '../lib/book-interaction.mjs';
import { readSession, writeSession } from '../lib/session';
import { syncToggleButtons } from '../lib/book-dom';
export type Turn = {
    direction: 1 | -1;
    target: number;
    progress: number;
    mesh: HTMLElement;
    panels: HTMLElement[];
    shadow: HTMLElement;
    hard: boolean;
    mobile: boolean;
    resolve?: () => void;
};
export class BookController {
    pages: HTMLElement[];
    desktopMediaQuery: MediaQueryList;
    reducedMotionMediaQuery: MediaQueryList;
    motionEnabled: boolean;
    audio: ReturnType<typeof createBookAudio>;
    ink: ReturnType<typeof createAnnotations>;
    counter: HTMLElement | null;
    guide: HTMLElement | null;
    guideCompleted = readSession('book-corner-guide-v1') === 'done';
    frame: HTMLDivElement;
    leftCorner: HTMLButtonElement;
    rightCorner: HTMLButtonElement;
    profiles: number[];
    views: number[][];
    current: number;
    view: number;
    width: number;
    height: number;
    animationFrame: number;
    resizeFrame: number;
    drag: {
        pointerId: number;
        horizontalPosition: number;
        verticalPosition: number;
        time: number;
        touch: boolean;
        direction: 1 | -1;
        corner: boolean;
        locked: boolean;
    } | null;
    turn: Turn | null;
    constructor(public host: HTMLElement) {
        this.pages = Array.from(this.host.querySelectorAll<HTMLElement>('[data-page]'));
        this.desktopMediaQuery = matchMedia('(min-width: 64rem)');
        this.reducedMotionMediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
        this.motionEnabled = readSession('book-motion') !== 'off';
        this.audio = createBookAudio();
        this.ink = createAnnotations(this.audio.play.bind(this.audio), this.audio.stop.bind(this.audio), () => this.motionEnabled);
        this.counter = document.querySelector<HTMLElement>('[data-book-counter]');
        this.guide = this.host.querySelector<HTMLElement>('[data-book-guide]');
        this.frame = document.createElement('div');
        this.frame.className = 'book';
        this.frame.append(...this.pages);
        if (this.guide)
            this.frame.append(this.guide);
        this.host.append(this.frame);
        this.leftCorner = this.corner(-1);
        this.rightCorner = this.corner(1);
        this.profiles = this.pages.flatMap((page, index) => page.dataset.page === 'profile' ? [index] : []);
        this.views = bookViews(this.pages.length, this.desktopMediaQuery.matches, this.profiles);
        this.current = 0;
        this.view = 0;
        this.width = 360;
        this.height = 620;
        this.animationFrame = 0;
        this.resizeFrame = 0;
        this.drag = null;
        this.turn = null;
        this.bindEvents();
        this.syncMotion();
        this.current = Math.max(0, this.indexForHash(location.hash));
        void document.fonts.ready.then(this.initializeLayout.bind(this));
    }
    previousWidth = 0;
    previousHeight = 0;
    bindEvents() {
        this.frame.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        this.frame.addEventListener('pointermove', this.handlePointerMove.bind(this));
        this.frame.addEventListener('pointerup', this.handlePointerUp.bind(this));
        this.frame.addEventListener('pointercancel', this.cancelGesture.bind(this));
        this.frame.addEventListener('lostpointercapture', this.cancelGesture.bind(this));
        [this.leftCorner, this.rightCorner].forEach(button => button.addEventListener('click', this.handleCornerClick.bind(this)));
        document.querySelectorAll('[data-motion-toggle]').forEach(button => button.addEventListener('click', this.toggleMotion.bind(this)));
        document.addEventListener('click', this.handleLink.bind(this));
        document.addEventListener('keydown', this.handleKey.bind(this));
        window.addEventListener('hashchange', () => void this.resolveHash(location.hash));
    }
    handlePointerDown(event: PointerEvent) {
        if (event.button !== 0 || !event.isPrimary || this.turn)
            return;
        const target = event.target as Element;
        const button = target.closest<HTMLElement>('.page-corner');
        if (!button && !this.allowsBodySwipe(event, target))
            return;
        const direction = Number(button?.dataset.direction || 1) as 1 | -1;
        if (button && !this.startCorner(event, direction))
            return;
        this.drag = { pointerId: event.pointerId, horizontalPosition: event.clientX, verticalPosition: event.clientY, time: performance.now(), touch: event.pointerType === 'touch', direction, corner: !!button, locked: !!button };
    }
    allowsBodySwipe(event: PointerEvent, target: Element) {
        return !this.desktopMediaQuery.matches && event.pointerType === 'touch' && !!target.closest('.page') &&
            !target.closest('a,button,input,textarea,select,[contenteditable="true"]') &&
            event.clientX >= 24 && event.clientX <= innerWidth - 24 && window.getSelection()?.type !== 'Range';
    }
    startCorner(event: PointerEvent, direction: 1 | -1) {
        if (this.motionEnabled && !this.begin(direction, this.view + direction))
            return false;
        event.preventDefault();
        this.frame.setPointerCapture(event.pointerId);
        return true;
    }
    handlePointerMove(event: PointerEvent) {
        if (!this.drag || this.drag.pointerId !== event.pointerId)
            return;
        if (!this.drag.locked && !this.lockSwipe(event))
            return;
        event.preventDefault();
        const direction = this.drag!.direction;
        const distance = (this.drag!.horizontalPosition - event.clientX) * direction;
        this.paint(clamp(distance / (this.width * (this.desktopMediaQuery.matches ? .72 : 1)), 0, .995));
        this.completeWhileHeld(event, distance, direction);
    }
    lockSwipe(event: PointerEvent) {
        if (!this.drag)
            return false;
        const horizontalDistance = event.clientX - this.drag.horizontalPosition;
        const intent = swipeIntent(horizontalDistance, Math.abs(event.clientY - this.drag.verticalPosition), performance.now() - this.drag.time, window.getSelection()?.type === 'Range');
        if (intent === 'cancel')
            return this.discardGesture();
        if (intent === 'wait')
            return false;
        this.drag.direction = horizontalDistance < 0 ? 1 : -1;
        if (!this.views[this.view + this.drag.direction])
            return this.discardGesture();
        if (this.motionEnabled && !this.begin(this.drag.direction, this.view + this.drag.direction))
            return this.discardGesture();
        this.drag.locked = true;
        this.frame.setPointerCapture(event.pointerId);
        return true;
    }
    discardGesture() { this.drag = null; return false; }
    releasePointer(pointerId: number) {
        if (this.frame.hasPointerCapture(pointerId))
            this.frame.releasePointerCapture(pointerId);
    }
    completeWhileHeld(event: PointerEvent, distance: number, direction: 1 | -1) {
        if (this.drag?.touch || distance < this.turnThreshold())
            return;
        this.drag = null;
        this.releasePointer(event.pointerId);
        if (this.motionEnabled)
            return this.settle(true);
        this.step(direction);
    }
    handlePointerUp(event: PointerEvent) {
        if (!this.drag || this.drag.pointerId !== event.pointerId)
            return;
        const gesture = this.drag;
        this.drag = null;
        if (!gesture.locked)
            return;
        const complete = shouldCompleteTurn(gesture, event.clientX, event.clientY, performance.now() - gesture.time, this.width);
        if (!this.motionEnabled)
            return this.completeWithoutMotion(complete, gesture.direction);
        this.settle(complete);
    }
    completeWithoutMotion(complete: boolean, direction: 1 | -1) {
        if (complete)
            this.step(direction);
    }
    cancelGesture(event: PointerEvent) {
        if (event.type === 'lostpointercapture' && event.target !== this.frame)
            return;
        if (!this.drag || this.drag.pointerId !== event.pointerId)
            return;
        this.drag = null;
        this.settle(false);
    }
    handleCornerClick(event: MouseEvent) {
        if (event.detail !== 0)
            return;
        this.step(Number((event.currentTarget as HTMLElement).dataset.direction) as 1 | -1);
    }
    toggleMotion() {
        this.motionEnabled = !this.motionEnabled;
        writeSession('book-motion', this.motionEnabled ? 'on' : 'off');
        this.syncMotion();
        this.drag = null;
        if (this.turn)
            return this.finishActiveTurn();
        this.ink.show(this.views[this.view].map(index => this.pages[index]), this.motionEnabled);
    }
    finishActiveTurn() {
        cancelAnimationFrame(this.animationFrame);
        this.finish(true);
    }
    handleLink(event: MouseEvent) {
        const anchor = (event.target as Element)?.closest<HTMLAnchorElement>('a[href^="#"]');
        if (!anchor || anchor.hash === '#')
            return;
        event.preventDefault();
        void this.resolveHash(anchor.hash);
    }
    handleKey(event: KeyboardEvent) {
        if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || (event.target as Element)?.closest('input,textarea,select,[contenteditable="true"]'))
            return;
        const targets: Record<string, number | undefined> = {
            ArrowRight: this.views[this.view + 1]?.[0], PageDown: this.views[this.view + 1]?.[0],
            ArrowLeft: this.views[this.view - 1]?.[0], PageUp: this.views[this.view - 1]?.[0], Home: 0, End: this.pages.length - 1,
        };
        if (!Object.hasOwn(targets, event.key))
            return;
        event.preventDefault();
        const index = targets[event.key];
        if (index !== undefined)
            void this.goTo(index);
    }
    initializeLayout() {
        this.layout(true);
        this.previousWidth = this.host.clientWidth;
        this.previousHeight = this.host.clientHeight;
        new ResizeObserver(this.handleResize.bind(this)).observe(this.host);
    }
    handleResize() {
        if (this.host.clientWidth === this.previousWidth && this.host.clientHeight === this.previousHeight)
            return;
        this.previousWidth = this.host.clientWidth;
        this.previousHeight = this.host.clientHeight;
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = requestAnimationFrame(() => this.layout());
    }
    corner(direction: 1 | -1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `page-corner page-corner--${direction === 1 ? 'right' : 'left'} no-print`;
        button.setAttribute('aria-label', (direction === 1 ? this.host.dataset.labelNext : this.host.dataset.labelPrevious) || 'Turn page');
        button.setAttribute(direction === 1 ? 'data-book-next' : 'data-book-prev', '');
        button.dataset.direction = String(direction);
        this.frame.append(button);
        return button;
    }
    readableIndex(index: number) {
        return !this.desktopMediaQuery.matches && this.profiles.includes(index) ? index + 1 : index;
    }
    shift(index: number) {
        if (!this.desktopMediaQuery.matches || index === 0)
            return -this.width / 2;
        return index === this.views.length - 1 ? this.width / 2 : 0;
    }
    side(index: number, viewIndex: number) {
        return !this.desktopMediaQuery.matches || (this.views[viewIndex].length === 1 && index === 0) ? 1 : this.views[viewIndex].indexOf(index);
    }
    place(index: number, position: number) {
        const page = this.pages[index];
        if (!page)
            return;
        page.style.left = `${position * this.width}px`;
        page.hidden = false;
        page.dataset.side = position === 0 ? 'left' : 'right';
    }
    hashFor(index: number) {
        const shown = this.views[index].map(index => this.pages[index]);
        const reference = shown.find(page => page.dataset.ref);
        if (reference)
            return `#ref-${reference.dataset.ref}`;
        if (shown.some(page => page.dataset.page === 'contents' || page.dataset.page === 'intro'))
            return '#contents';
        if (shown.some(page => page.dataset.page === 'back'))
            return '#end';
        return '';
    }
    updateControls() {
        this.leftCorner.disabled = this.view === 0;
        this.rightCorner.disabled = this.view === this.views.length - 1;
        this.leftCorner.hidden = this.view === 0;
        this.rightCorner.hidden = this.view === this.views.length - 1;
        this.leftCorner.style.left = `${this.desktopMediaQuery.matches ? 0 : this.width}px`;
        this.rightCorner.style.left = `${this.width * 2 - 56}px`;
        if (this.counter)
            this.counter.textContent = `${this.view + 1} / ${this.views.length}`;
        const hash = this.hashFor(this.view);
        document.querySelectorAll<HTMLAnchorElement>('[data-lang-link]').forEach(anchor => anchor.href = (anchor.dataset.langLink || '/') + hash);
        history.replaceState(null, '', location.pathname + location.search + hash);
    }
    render(animateInk = true, updateInk = true) {
        for (const [index, page] of this.pages.entries()) {
            page.hidden = true;
            page.inert = !this.views[this.view].includes(index);
            page.setAttribute('aria-hidden', String(page.inert));
        }
        this.views[this.view].forEach(index => this.place(index, this.side(index, this.view)));
        this.frame.style.transform = `translateX(${this.shift(this.view)}px)`;
        this.host.dataset.mode = this.desktopMediaQuery.matches ? 'desktop' : 'mobile';
        this.host.dataset.state = 'read';
        this.host.dataset.ready = '';
        delete this.host.dataset.turnProgress;
        this.updateControls();
        this.updateGuide();
        if (updateInk)
            this.ink.show(this.views[this.view].map(index => this.pages[index]), animateInk);
    }
    clonePage(source: HTMLElement, offset: number) {
        const clone = source.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        clone.removeAttribute('data-page');
        clone.removeAttribute('data-ref');
        clone.removeAttribute('hidden');
        clone.removeAttribute('inert');
        clone.classList.add('page-clone');
        clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        Object.assign(clone.style, { left: `${-offset}px`, top: '0', width: `${this.width}px`, height: `${this.height}px` });
        return clone;
    }
    createFace(source: HTMLElement, reverse: boolean, index: number, segments: number, mobile: boolean, bleed: number) {
        const face = document.createElement('div');
        face.className = `paper-face${reverse ? ' paper-face--back' : ''}`;
        face.style.setProperty('--face-base', this.faceColor(source, mobile, reverse));
        if (mobile && reverse)
            return face;
        const offset = reverse ? this.width - (index + 1) * this.width / segments - bleed : index * this.width / segments;
        face.append(this.clonePage(source, offset));
        return face;
    }
    faceColor(source: HTMLElement, mobile: boolean, reverse: boolean) {
        if (mobile && reverse)
            return '#eee1c8';
        if (source.matches('.page--cover, .page--back'))
            return '#503d2d';
        return 'var(--page)';
    }
    createPanel(front: HTMLElement, back: HTMLElement, index: number, segments: number, mobile: boolean) {
        const panel = document.createElement('div');
        const bleed = index === segments - 1 ? 0 : 1.5;
        panel.className = 'paper-panel';
        panel.style.width = `${this.width / segments + bleed}px`;
        panel.append(this.createFace(front, false, index, segments, mobile, bleed), this.createFace(back, true, index, segments, mobile, bleed));
        return panel;
    }
    restoreCloneScroll(face: HTMLElement, front: HTMLElement, back: HTMLElement) {
        const body = face.querySelector('.page-body');
        if (!body)
            return;
        body.scrollTop = (face.classList.contains('paper-face--back') ? back : front).querySelector('.page-body')?.scrollTop || 0;
    }
    preparePages(direction: 1 | -1, front: HTMLElement, back: HTMLElement, targetPages: number[]) {
        if (this.desktopMediaQuery.matches)
            return this.prepareDesktopPages(direction, front, back, targetPages);
        // Keep the finger's original element alive until pointerup.
        if (direction === 1)
            this.place(targetPages[0], 1);
    }
    prepareDesktopPages(direction: 1 | -1, front: HTMLElement, back: HTMLElement, targetPages: number[]) {
        const reverse = direction === -1;
        const hiddenPage = reverse ? back : front;
        hiddenPage.hidden = true;
        if (targetPages.length !== 2)
            return;
        this.place(targetPages[reverse ? 0 : 1], reverse ? 0 : 1);
    }
    begin(direction: 1 | -1, target: number) {
        if (this.turn || target < 0 || target >= this.views.length || target === this.view)
            return false;
        this.ink.finish();
        this.hideGuide();
        const sourcePages = this.views[this.view], targetPages = this.views[target];
        const front = this.pages[direction === 1 ? sourcePages.at(-1)! : targetPages.at(-1)!];
        const back = this.pages[direction === 1 ? targetPages[0] : sourcePages[0]];
        const mobile = !this.desktopMediaQuery.matches;
        const mesh = document.createElement('div');
        mesh.className = `paper-turn${mobile ? ' paper-turn--mobile' : ''}`;
        mesh.inert = true;
        mesh.setAttribute('aria-hidden', 'true');
        const segments = 28;
        const panels = Array.from({ length: segments }, (_value, index) => this.createPanel(front, back, index, segments, mobile));
        mesh.append(...panels);
        const shadow = document.createElement('div');
        shadow.className = 'turn-shadow';
        shadow.setAttribute('aria-hidden', 'true');
        this.frame.append(shadow, mesh);
        mesh.querySelectorAll<HTMLElement>('.paper-face').forEach(face => this.restoreCloneScroll(face, front, back));
        this.preparePages(direction, front, back, targetPages);
        this.turn = { direction, target, progress: 0, mesh, panels, shadow, mobile,
            hard: [front.dataset.page, back.dataset.page].some(pageType => pageType === 'cover' || pageType === 'back') };
        this.host.dataset.state = 'user_fold';
        this.host.dataset.turning = '';
        this.audio.play('turn', .55);
        this.paint(0);
        return true;
    }
    paintPanel(point: ReturnType<typeof paperCurve>[number], index: number, shades: number[]) {
        const panel = this.turn!.panels[index];
        panel.style.transform = `matrix3d(${paperPanelMatrix(point, this.width, this.height, this.turn!.mobile).join(',')})`;
        panel.style.setProperty('--shade-left', String((shades[Math.max(0, index - 1)] + shades[index]) / 2));
        panel.style.setProperty('--shade-right', String((shades[index] + shades[Math.min(shades.length - 1, index + 1)]) / 2));
        const front = panel.children[0] as HTMLElement, back = panel.children[1] as HTMLElement;
        const reverse = Math.cos(point.angle) < 0;
        front.hidden = reverse;
        back.hidden = !reverse;
    }
    shadowStyle(curve: ReturnType<typeof paperCurve>, progress: number, curveProgress: number, curl: boolean) {
        const lift = Math.sin(Math.PI * (curl ? progress : curveProgress));
        if (curl)
            return `left:${this.width + Math.max(...curve.map(point => point.x)) - 8}px;width:32px;opacity:${lift * .2};filter:blur(7px);`;
        return `left:${this.width + Math.min(0, Math.cos(Math.PI * curveProgress) * this.width)}px;width:${Math.max(8, this.width * Math.abs(Math.cos(Math.PI * curveProgress)))}px;opacity:${lift * .23};filter:blur(${8 + lift * 24}px);`;
    }
    paint(value: number) {
        if (!this.turn)
            return;
        this.turn.progress = value;
        const progress = this.turn.direction === 1 ? value : 1 - value;
        const curveProgress = progress * (this.turn.mobile ? .5 : 1);
        const curl = this.turn.mobile && !this.turn.hard;
        const curve = curl ? paperCurl(progress, this.width, this.turn.panels.length) : paperCurve(curveProgress, this.width, this.turn.panels.length, this.turn.hard);
        const shades = curve.map(point => .035 + Math.abs(Math.sin(point.angle)) * .19);
        curve.forEach((point, index) => this.paintPanel(point, index, shades));
        this.turn.shadow.style.cssText = this.shadowStyle(curve, progress, curveProgress, curl);
        this.frame.style.transform = `translateX(${this.shift(this.view) + (this.shift(this.turn.target) - this.shift(this.view)) * value}px)`;
        this.host.dataset.turnProgress = value.toFixed(3);
    }
    finish(complete: boolean) {
        if (!this.turn)
            return;
        const finished = this.turn;
        finished.mesh.remove();
        finished.shadow.remove();
        if (complete) {
            this.dismissGuide();
            this.view = finished.target;
            this.current = this.views[this.view][0];
        }
        this.turn = null;
        delete this.host.dataset.turning;
        this.render(complete);
        finished.resolve?.();
    }
    settlement: {
        from: number;
        destination: number;
        duration: number;
        started: number;
        complete: boolean;
    } | null = null;
    settle(complete: boolean) {
        if (!this.turn)
            return;
        cancelAnimationFrame(this.animationFrame);
        const from = this.turn.progress;
        this.settlement = { from, destination: complete ? 1 : 0, duration: settleDuration(from, complete, this.motionEnabled), started: performance.now(), complete };
        this.host.dataset.state = 'flipping';
        this.animationFrame = requestAnimationFrame(this.tick.bind(this));
    }
    tick(now: number) {
        if (!this.turn || !this.settlement)
            return;
        const { from, destination, duration, started, complete } = this.settlement;
        const progress = duration ? Math.min(1, (now - started) / duration) : 1;
        const eased = 1 - (1 - progress) ** 2;
        this.paint(from + (destination - from) * eased);
        if (progress < 1) {
            this.animationFrame = requestAnimationFrame(this.tick.bind(this));
            return;
        }
        this.animationFrame = 0;
        this.settlement = null;
        this.finish(complete);
    }
    goTo(index: number, animate = true): Promise<void> {
        index = this.readableIndex(index);
        const target = this.views.findIndex(viewIndex => viewIndex.includes(index));
        if (this.turn || target < 0 || target === this.view)
            return Promise.resolve();
        if (!animate || !this.motionEnabled) {
            this.dismissGuide();
            this.ink.finish();
            this.view = target;
            this.current = index;
            this.render(false);
            return Promise.resolve();
        }
        if (!this.begin(target > this.view ? 1 : -1, target))
            return Promise.resolve();
        return new Promise(resolve => { this.turn!.resolve = resolve; this.settle(true); });
    }
    step(direction: 1 | -1) {
        const target = this.views[this.view + direction];
        if (target)
            void this.goTo(target[0]);
    }
    turnThreshold() {
        return turnThreshold(this.width);
    }
    syncMotion() {
        document.documentElement.dataset.motion = this.motionEnabled ? 'on' : 'off';
        syncToggleButtons('[data-motion-toggle]', '[data-motion-label]', this.motionEnabled);
    }
    hideGuide() {
        this.leftCorner.removeAttribute('data-guide');
        this.rightCorner.removeAttribute('data-guide');
        if (this.guide)
            this.guide.hidden = true;
    }
    updateGuide() {
        this.hideGuide();
        if (!this.guide || this.guideCompleted || this.turn)
            return;
        const backward = this.view === this.views.length - 1;
        const corner = backward ? this.leftCorner : this.rightCorner;
        corner.dataset.guide = '';
        this.guide.dataset.side = backward ? 'left' : 'right';
        this.guide.style.left = `${backward ? Number.parseFloat(this.leftCorner.style.left) + 20 : this.width * 2 - 20}px`;
        this.guide.hidden = false;
    }
    dismissGuide() {
        this.guideCompleted = true;
        writeSession('book-corner-guide-v1', 'done');
        this.hideGuide();
    }
    indexForHash(hash: string) {
        let identifier: string;
        try {
            identifier = decodeURIComponent(hash.replace(/^#/, ''));
        }
        catch {
            return -1;
        }
        if (!identifier || identifier === 'cover')
            return 0;
        if (identifier === 'end')
            return this.pages.length - 1;
        const element = document.getElementById(identifier);
        return element ? this.pages.indexOf(element.closest('[data-page]') as HTMLElement) : -1;
    }
    async resolveHash(hash: string) {
        const index = this.indexForHash(hash);
        if (index < 0)
            return;
        await this.goTo(index);
        const mark = document.getElementById(hash.slice(1));
        if (mark?.tagName === 'MARK') {
            mark.scrollIntoView({ block: 'center', behavior: this.reducedMotionMediaQuery.matches ? 'instant' : 'smooth' });
            mark.classList.add('is-flash');
            window.setTimeout(() => mark.classList.remove('is-flash'), 1400);
        }
    }
    layout(initial = false) {
        if (this.turn) {
            cancelAnimationFrame(this.animationFrame);
            // A changing viewport can end a drag, but must not undo a requested page.
            const complete = !this.drag || this.turn.progress >= .5;
            this.drag = null;
            this.finish(complete);
        }
        this.views = bookViews(this.pages.length, this.desktopMediaQuery.matches, this.profiles);
        this.current = this.readableIndex(this.current);
        this.view = Math.max(0, this.views.findIndex(viewIndex => viewIndex.includes(this.current)));
        const ratio = this.desktopMediaQuery.matches ? 450 / 640 : 360 / 620;
        this.width = Math.min(this.host.clientWidth / (this.desktopMediaQuery.matches ? 2 : 1), this.host.clientHeight * ratio, this.desktopMediaQuery.matches ? 560 : 600);
        this.height = this.width / ratio;
        this.frame.style.cssText = `width:${this.width * 2}px;height:${this.height}px;left:${(this.host.clientWidth - this.width * 2) / 2}px;top:${(this.host.clientHeight - this.height) / 2}px;--page-width:${this.width}px;--page-height:${this.height}px;`;
        this.render(initial, initial);
        if (!initial)
            this.ink.resize(this.views[this.view].map(index => this.pages[index]));
    }
}
export function initBook(host: HTMLElement) {
    if (!host.querySelector('[data-page]'))
        return;
    return new BookController(host);
}
