export function underlinePath(horizontal, vertical, width, height, index) {
    const bottom = vertical + height + 1.2;
    const tilt = index % 2 ? .35 : -.35;
    return `M ${horizontal + .5} ${bottom} C ${horizontal + width * .2} ${bottom - .4} ${horizontal + width * .44} ${bottom + .55} ${horizontal + width * .62} ${bottom + tilt} S ${horizontal + width * .9} ${bottom + .25} ${horizontal + width + .5} ${bottom - .65}`;
}
export function circlePath(horizontal, vertical, width, height) {
    return `M ${horizontal + width * .58} ${vertical - 3} C ${horizontal - 10} ${vertical - 8} ${horizontal - 11} ${vertical + height + 6} ${horizontal + width * .48} ${vertical + height + 5} C ${horizontal + width + 13} ${vertical + height + 8} ${horizontal + width + 9} ${vertical - 7} ${horizontal + width * .4} ${vertical - 3}`;
}
export function starPath() {
    return 'M -.7 -10.5 Q -5.3 -1.3 -8.5 8.8 Q 1.2 2.4 10.1 -3.4 Q .2 -4.9 -10.4 -3.9 Q -2.9 1.6 6.5 9 Q 2.1 -1.1 -1.8 -11.3';
}
export function strokeDuration(kind, length) {
    if (kind === 'star')
        return 240;
    if (kind === 'underline')
        return Math.max(90, Math.min(420, length / .95));
    return Math.max(220, Math.min(420, length / .7));
}
