import { describe, expect, it, vi } from 'vitest';
import { BookScrollHints, hasMoreBelow } from './book-scroll';

describe('page scroll hints', () => {
    it('shows more-content cues only for a measurable page with content remaining, including Safari overscroll and fractional edges', () => {
        expect(hasMoreBelow({ scrollHeight: 300, clientHeight: 400, scrollTop: 0 })).toBe(false);
        expect(hasMoreBelow({ scrollHeight: 900, clientHeight: 0, scrollTop: 0 })).toBe(false);
        expect(hasMoreBelow({ scrollHeight: 900, clientHeight: 400, scrollTop: -20 })).toBe(true);
        expect(hasMoreBelow({ scrollHeight: 900, clientHeight: 400, scrollTop: 250 })).toBe(true);
        expect(hasMoreBelow({ scrollHeight: 900, clientHeight: 400, scrollTop: 498.5 })).toBe(false);
        expect(hasMoreBelow({ scrollHeight: 900, clientHeight: 400, scrollTop: 520 })).toBe(false);
        expect(hasMoreBelow({ scrollHeight: 900, clientHeight: 900, scrollTop: 0 })).toBe(false);
    });
    it('learns the gesture from the visible page and preserves separate page scroll positions', () => {
        const controller = Object.create(BookScrollHints.prototype);
        controller.learned = false;
        controller.show = vi.fn();
        controller.update = vi.fn();
        const entry = { page: { hidden: true, inert: false }, body: { scrollTop: 200 } };
        controller.handleScroll(entry);
        expect(controller.learned).toBe(false);
        entry.page.hidden = false;
        entry.page.inert = true;
        controller.handleScroll(entry);
        expect(controller.learned).toBe(false);
        entry.page.inert = false;
        controller.handleScroll(entry);
        expect(controller.learned).toBe(true);
        expect(controller.show).toHaveBeenCalledOnce();
        expect(entry.body.scrollTop).toBe(200);
    });
    it('continues within the current page with reading overlap and respects motion settings', () => {
        const controller = Object.create(BookScrollHints.prototype);
        const entry = { body: { clientHeight: 400, focus: vi.fn(), scrollBy: vi.fn() } };
        controller.motionEnabled = () => true;
        controller.scrollFurther(entry, { detail: 0 });
        expect(entry.body.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(entry.body.scrollBy).toHaveBeenLastCalledWith({ top: 280, behavior: 'smooth' });
        controller.motionEnabled = () => false;
        controller.scrollFurther(entry, { detail: 1 });
        expect(entry.body.scrollBy).toHaveBeenLastCalledWith({ top: 280, behavior: 'instant' });
        expect(entry.body.focus).toHaveBeenCalledOnce();
    });
});
