export function clamp(value, minimum = 0, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, value));
}
export function turnThreshold(pageWidth) {
    return clamp(pageWidth * .18, 48, 80);
}
export function swipeIntent(horizontalDistance, verticalDistance, elapsed, hasSelection) {
    if (hasSelection || elapsed > 350)
        return 'cancel';
    if (verticalDistance > 8 && verticalDistance >= Math.abs(horizontalDistance) * .8)
        return 'cancel';
    if (Math.abs(horizontalDistance) < 10 || Math.abs(horizontalDistance) < verticalDistance * 1.4)
        return 'wait';
    return 'turn';
}
export function shouldCompleteTurn(gesture, horizontalPosition, verticalPosition, elapsed, pageWidth) {
    const distance = (gesture.horizontalPosition - horizontalPosition) * gesture.direction;
    const tappedCorner = gesture.corner && Math.hypot(gesture.horizontalPosition - horizontalPosition, gesture.verticalPosition - verticalPosition) < 6;
    const flicked = distance > 18 && distance / Math.max(1, elapsed) > .4;
    return tappedCorner || flicked || distance >= turnThreshold(pageWidth) * .6;
}
export function settleDuration(progress, complete, motionEnabled) {
    if (!motionEnabled)
        return 0;
    if (complete)
        return 420 + (1 - progress) * 360;
    return 180 + progress * 180;
}
