import { describe, it, expect, vi } from 'vitest';
import { shouldCompleteTurn, settleDuration, swipeIntent, turnThreshold } from './book-interaction.mjs';
import { strokeDuration } from './ink-geometry.mjs';
import { BookController } from '../scripts/book';
describe('page gesture decisions', () => {
    it('separates horizontal intent, native scrolling and text selection', () => {
        expect(swipeIntent(4, 2, 50, false)).toBe('wait');
        expect(swipeIntent(40, 4, 80, false)).toBe('turn');
        expect(swipeIntent(4, 40, 80, false)).toBe('cancel');
        expect(swipeIntent(40, 4, 400, false)).toBe('cancel');
        expect(swipeIntent(40, 4, 80, true)).toBe('cancel');
    });
    it('completes a short deliberate swipe or flick, but restores an insufficient pull', () => {
        const gesture = { horizontalPosition: 200, verticalPosition: 100, direction: 1, corner: false };
        expect(shouldCompleteTurn(gesture, 155, 103, 500, 360)).toBe(true);
        expect(shouldCompleteTurn(gesture, 178, 103, 40, 360)).toBe(true);
        expect(shouldCompleteTurn(gesture, 178, 103, 500, 360)).toBe(false);
        expect(shouldCompleteTurn({ ...gesture, corner: true }, 200, 100, 50, 360)).toBe(true);
        expect(turnThreshold(100)).toBe(48);
        expect(turnThreshold(1000)).toBe(80);
    });
    it('uses shared pacing and proportional pen strokes', () => {
        expect(settleDuration(0, true, true)).toBe(780);
        expect(settleDuration(.5, true, true)).toBe(600);
        expect(settleDuration(.5, false, true)).toBe(270);
        expect(settleDuration(.5, true, false)).toBe(0);
        expect(strokeDuration('underline', 100)).toBeLessThan(strokeDuration('underline', 300));
        expect(strokeDuration('underline', 1000)).toBe(420);
        expect(strokeDuration('star', 10)).toBe(240);
    });
    it('keeps a touch gesture alive when capture transfers from text to the book', () => {
        const controller = Object.create(BookController.prototype);
        const gesture = { pointerId: 7 };
        controller.drag = gesture;
        controller.frame = {};
        controller.settle = vi.fn();
        controller.cancelGesture({ type: 'lostpointercapture', target: {}, pointerId: 7 });
        expect(controller.drag).toBe(gesture);
        controller.cancelGesture({ type: 'lostpointercapture', target: controller.frame, pointerId: 7 });
        expect(controller.drag).toBeNull();
        expect(controller.settle).toHaveBeenCalledWith(false);
    });
});
