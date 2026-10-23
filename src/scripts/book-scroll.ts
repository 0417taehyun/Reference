import { readSession, writeSession } from '../lib/session';

export type ScrollHint = {
    page: HTMLElement;
    body: HTMLElement;
    button: HTMLButtonElement;
    label: HTMLElement;
};

export function hasMoreBelow(body: Pick<HTMLElement, 'scrollHeight' | 'clientHeight' | 'scrollTop'>): boolean {
    return body.clientHeight > 0 && body.scrollHeight - body.clientHeight - Math.max(0, body.scrollTop) > 2;
}

export class BookScrollHints {
    entries: ScrollHint[];
    learned = readSession('book-scroll-guide-v1') === 'done';
    drawn = new WeakSet<HTMLButtonElement>();

    constructor(public host: HTMLElement, pages: HTMLElement[], public motionEnabled: () => boolean) {
        this.entries = pages.flatMap(page => this.connect(page));
    }
    connect(page: HTMLElement): ScrollHint[] {
        const body = page.querySelector<HTMLElement>('.page-body');
        const footer = page.querySelector<HTMLElement>('.page-foot');
        if (!body || !footer)
            return [];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'page-scroll-hint no-print';
        button.hidden = true;
        button.setAttribute('aria-label', this.host.dataset.labelScrollMore || 'Scroll to read more');
        button.innerHTML = '<span data-scroll-hint-label></span><svg viewBox="0 0 20 30" fill="none" aria-hidden="true"><path d="M9 2C8 9 11 17 10 26M3 19C5 21 8 25 10 27C12 25 15 21 18 19" pathLength="1" /></svg>';
        const label = button.querySelector<HTMLElement>('[data-scroll-hint-label]')!;
        label.textContent = button.getAttribute('aria-label');
        body.tabIndex = 0;
        body.setAttribute('role', 'region');
        body.setAttribute('aria-label', this.host.dataset.labelScrollRegion || 'Page content');
        footer.append(button);
        const entry = { page, body, button, label };
        body.addEventListener('scroll', () => this.handleScroll(entry), { passive: true });
        button.addEventListener('click', event => this.scrollFurther(entry, event));
        button.addEventListener('animationend', this.finishDrawing);
        button.addEventListener('animationcancel', this.finishDrawing);
        new ResizeObserver(() => this.update(entry)).observe(body);
        return [entry];
    }
    finishDrawing(event: AnimationEvent) {
        (event.currentTarget as HTMLElement).removeAttribute('data-scroll-draw');
    }
    update(entry: ScrollHint) {
        if (entry.page.hidden || entry.page.inert)
            return;
        const more = hasMoreBelow(entry.body);
        entry.body.toggleAttribute('data-scroll-more', more);
        entry.button.hidden = !more;
        entry.label.hidden = this.learned;
        if (more)
            this.draw(entry.button);
    }
    draw(button: HTMLButtonElement) {
        if (this.drawn.has(button))
            return;
        this.drawn.add(button);
        if (this.motionEnabled())
            button.setAttribute('data-scroll-draw', '');
    }
    show() {
        this.entries.forEach(entry => this.update(entry));
    }
    handleScroll(entry: ScrollHint) {
        if (!this.learned && !entry.page.hidden && !entry.page.inert && entry.body.scrollTop > 8) {
            this.learned = true;
            writeSession('book-scroll-guide-v1', 'done');
            this.show();
            return;
        }
        this.update(entry);
    }
    scrollFurther(entry: ScrollHint, event: MouseEvent) {
        if (event.detail === 0)
            entry.body.focus({ preventScroll: true });
        entry.body.scrollBy({ top: entry.body.clientHeight * .7, behavior: this.motionEnabled() ? 'smooth' : 'instant' });
    }
}
