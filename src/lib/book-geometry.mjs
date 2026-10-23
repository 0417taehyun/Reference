/** Arc-length-preserving paper surface. Each sample is a narrow CSS 3D panel. */
export function paperCurve(progress, width, segments = 28, hard = false) {
    const progressValue = Math.max(0, Math.min(1, progress));
    const step = width / segments;
    const bend = hard ? 0 : Math.sin(Math.PI * progressValue) * 0.9;
    let horizontalPosition = 0;
    let depth = 0;
    return Array.from({ length: segments }, (_, index) => {
        const angle = Math.PI * progressValue + bend * Math.cos(Math.PI * (index + 0.5) / segments);
        const panel = { x: horizontalPosition, z: depth, angle, width: step };
        horizontalPosition += Math.cos(angle) * step;
        depth += Math.sin(angle) * step;
        return panel;
    });
}
/** A moving cylindrical fold: the unread page is revealed behind the edge. */
export function paperCurl(progress, width, segments = 28) {
    const progressValue = Math.max(0, Math.min(1, progress));
    const radius = Math.sin(Math.PI * progressValue) * width * .1;
    const start = width * (1 - progressValue) - radius;
    const step = width / segments;
    let horizontalPosition = 0, depth = 0;
    return Array.from({ length: segments }, (_, index) => {
        const angle = curlAngle(progressValue, (index + .5) * step, start, radius);
        const panel = { x: horizontalPosition, z: depth, angle, width: step };
        horizontalPosition += Math.cos(angle) * step;
        depth += Math.sin(angle) * step;
        return panel;
    });
}
/** Project the curved leaf into one plane, avoiding inter-layer WebKit seams. */
export function paperPanelMatrix(panel, width, height, mobile) {
    const distance = Math.max(1500, width * 5);
    const originHorizontal = mobile ? width : 0;
    const originVertical = height * .45;
    const sine = Math.sin(panel.angle), cosine = Math.cos(panel.angle);
    const perspectiveScale = 1 - panel.z / distance;
    return [
        (cosine - originHorizontal * sine / distance) / perspectiveScale, -originVertical * sine / distance / perspectiveScale, 0, -sine / distance / perspectiveScale,
        0, 1 / perspectiveScale, 0, 0,
        0, 0, 1, 0,
        (panel.x - originHorizontal * panel.z / distance) / perspectiveScale, -originVertical * panel.z / distance / perspectiveScale, 0, 1,
    ];
}
export function bookViews(count, desktop, profiles = []) {
    if (!desktop)
        return Array.from({ length: count }, (_, index) => [index]).filter(([index]) => !profiles.includes(index));
    const views = [[0]];
    for (let index = 1; index < count; index += 2)
        views.push(index + 1 < count ? [index, index + 1] : [index]);
    return views;
}
export function curlAngle(progress, position, start, radius) {
    if (progress === 0)
        return 0;
    if (progress === 1)
        return Math.PI;
    return Math.max(0, Math.min(Math.PI, (position - start) / radius));
}
