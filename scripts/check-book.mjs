export async function verifyCurve(page, snapshot) {
    await shot(page, snapshot);
    const shape = await page.locator('.paper-panel').evaluateAll(panels => panels.map(element => element.style.transform));
    assert.ok(new Set(shape).size > 20, 'moving leaf has independent curved panels');
    assert.ok(await page.locator('.paper-panel').evaluateAll(panels => panels.some(element => element.getBoundingClientRect().height > element.offsetHeight * 1.01)), 'paper visibly bows toward the reader');
    assert.ok(await page.locator('.paper-panel').evaluateAll(panels => panels.every(element => [...element.children].filter(face => !face.hidden).length === 1)), 'the hidden paper face never leaks through');
    assert.equal(await page.locator('.paper-turn--mobile .paper-face--back .page-clone').count(), 0, 'the mobile reverse is paper, without mirrored next-page text');
    await shot(page, snapshot);
}
export async function moveTouch(page, devtoolsSession, direction, distance, snapshot, horizontalPosition, verticalPosition, index) {
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: horizontalPosition - direction * distance * index / 5, y: verticalPosition + index * 3 }] });
    if (snapshot && index === 3)
        await verifyCurve(page, snapshot);
    await page.waitForTimeout(65);
}
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from 'playwright-core';
const base = process.env.BOOK_QA_URL || 'http://127.0.0.1:4321';
const output = process.env.BOOK_QA_OUTPUT || join(tmpdir(), 'reference-book-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let checks = 0;
export function pass(label) { checks++; console.log('PASS', label); }
const visible = '.book > [data-page]:not([hidden])';
export async function context(options = {}) {
    const browserContext = await browser.newContext(options);
    await browserContext.addInitScript(() => {
        window.foley = { contexts: 0, starts: 0, audible: 0 };
        window.soundSources = [];
        window.stoppedSources = 0;
        const NativeContext = window.AudioContext;
        window.AudioContext = class extends NativeContext {
            constructor(...argumentsList) { super(...argumentsList); window.foley.contexts++; }
        };
        const original = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...argumentsList) {
            window.foley.starts++;
            if (this.buffer && this.buffer.getChannelData(0).some(count => Math.abs(count) > .001))
                window.foley.audible++;
            window.soundSources.push({ channels: this.buffer?.numberOfChannels, length: this.buffer?.duration, when: argumentsList[0], offset: argumentsList[1], duration: argumentsList[2] });
            return original.apply(this, argumentsList);
        };
        const stop = AudioBufferSourceNode.prototype.stop;
        AudioBufferSourceNode.prototype.stop = function (...argumentsList) { window.stoppedSources++; return stop.apply(this, argumentsList); };
    });
    const page = await browserContext.newPage();
    page.on('pageerror', element => errors.push(String(element)));
    return { c: browserContext, p: page };
}
export async function load(page, path = '/') {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-ready]');
    await page.addStyleTag({ content: 'astro-dev-toolbar {display:none!important}' });
}
export async function settled(page, counter) {
    try {
        await page.waitForFunction(counter => document.querySelector('[data-book-counter]').textContent === counter && document.querySelector('[data-book-host]').dataset.state === 'read', counter);
    }
    catch (error) {
        console.log('Unexpected book state:', await page.evaluate(() => ({
            counter: document.querySelector('[data-book-counter]')?.textContent,
            state: { ...document.querySelector('[data-book-host]')?.dataset },
            visible: [...document.querySelectorAll('.book > [data-page]:not([hidden])')].map(element => element.id),
        })));
        await shot(page, 'unexpected-state');
        throw error;
    }
    assert.equal(await page.locator('.paper-turn').count(), 0, 'temporary paper is removed at rest');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'viewport has no horizontal overflow');
}
export async function shot(page, name) { await page.screenshot({ path: join(output, name + '.png'), scale: 'css' }); }
export async function navigateToContents(page) {
    await page.evaluate(() => {
        history.replaceState(null, '', location.pathname + location.search);
        location.hash = '#contents';
    });
}
export async function verifyOnboarding() {
    const { c: browserContext, p: page } = await context({ ...devices['iPhone 13'] });
    const devtoolsSession = await browserContext.newCDPSession(page);
    await load(page, '/ko/');
    assert.ok(await page.locator('[data-book-guide]').isVisible());
    assert.equal(await page.locator('#cover .page-head, #cover [data-book-open], #cover .cover-count').count(), 0);
    assert.doesNotMatch(await page.locator('#cover').innerText(), /2026|추천사 2편|조용히 펼치기/);
    await gesture(page, devtoolsSession, 1, 22);
    await settled(page, '1 / 6');
    assert.ok(await page.locator('[data-book-guide]').isVisible(), 'an insufficient pull keeps the guidance');
    await gesture(page, devtoolsSession, 1, 40, true);
    await settled(page, '1 / 6');
    assert.ok(await page.locator('[data-book-guide]').isVisible(), 'a cancelled gesture keeps the guidance');
    await gesture(page, devtoolsSession, 1, 90);
    await settled(page, '2 / 6');
    assert.ok(await page.locator('[data-book-guide]').isHidden());
    const themes = page.locator('[data-page="intro"] [aria-labelledby="themes-title"]');
    assert.equal(await themes.locator('a, button').count(), 0, 'theme counts do not navigate');
    assert.match(await themes.innerText(), /2명 중 [12]명/);
    assert.doesNotMatch(await page.locator('[data-page="intro"]').innerText(), /아래 추천사|직장 동료|테마를 누르면/);
    await themes.locator('li').first().tap();
    await settled(page, '2 / 6');
    await page.keyboard.press('Home');
    await settled(page, '1 / 6');
    assert.ok(await page.locator('[data-book-guide]').isHidden());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-ready]');
    assert.ok(await page.locator('[data-book-guide]').isHidden(), 'completed guidance stays dismissed after reload');
    await browserContext.close();
    pass('onboarding points to the corner, survives insufficient/cancelled drags, and stays dismissed after a successful turn');
}
export async function gesture(page, devtoolsSession, direction = 1, distance = 90, cancel = false, snapshot = '', start) {
    const cornerBounds = await page.locator(direction === 1 ? '.page-corner--right' : '.page-corner--left').boundingBox();
    assert.ok(cornerBounds, 'corner handle is available');
    const horizontalPosition = start?.x ?? cornerBounds.x + (direction === 1 ? 38 : 18), verticalPosition = start?.y ?? cornerBounds.y + 14;
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: horizontalPosition, y: verticalPosition }] });
    for (let index = 1; index <= 5; index++)
        await moveTouch(page, devtoolsSession, direction, distance, snapshot, horizontalPosition, verticalPosition, index);
    if (!cancel && distance >= 90) {
        await page.waitForTimeout(120);
        assert.equal(await page.locator('[data-book-host]').getAttribute('data-state'), 'user_fold', 'touch paper stays with the held finger until release');
    }
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
}
export async function runChecks() {
    const { c: browserContext, p: page } = await context({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await browserContext.addInitScript(() => {
        sessionStorage.setItem('book-sound', 'off');
        sessionStorage.setItem('book-ink', '["ko:ref-01-park-jihoon"]');
        sessionStorage.setItem('book-ink-v2', '["ko:ref-01-park-jihoon"]');
    });
    const devtoolsSession = await browserContext.newCDPSession(page);
    await load(page, '/ko/');
    assert.equal(await page.locator('header nav > a, header nav > button').count(), 3);
    assert.equal(await page.locator('header nav > a').count(), 1, 'only the language link remains');
    assert.equal(await page.locator('.book-nav, .book-arrow, [data-book-progress]').count(), 0);
    assert.ok(await page.locator('[data-book-guide]').isVisible());
    assert.equal(await page.locator('[data-theme-toggle]').count(), 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page').trim()), '#f5eddd');
    assert.deepEqual(await page.evaluate(() => window.foley), { contexts: 0, starts: 0, audible: 0 });
    assert.equal(await page.locator('[data-sound-toggle]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-motion-toggle]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await shot(page, 'phone-cover');
    pass('warm paper, default-on sound and effects, including the reported OS motion setting and previous stored state');
    await page.locator('[data-sound-toggle]').tap();
    await page.locator('.page-corner--right').tap();
    await settled(page, '2 / 6');
    assert.ok(await page.locator('[data-book-guide]').isHidden());
    assert.equal(await page.evaluate(() => window.foley.audible), 0);
    const cornerBounds = await page.locator('.page-corner--right').boundingBox();
    await page.mouse.move(cornerBounds.x + 40, cornerBounds.y + 12);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.paper-turn').count(), 0);
    pass('hover never moves the paper');
    await gesture(page, devtoolsSession, 1, 90, false, 'phone-paper-curve');
    await settled(page, '3 / 6');
    pass('touch follows the held finger, then finishes a short swipe on release without a second turn');
    await gesture(page, devtoolsSession, -1);
    await settled(page, '2 / 6');
    await gesture(page, devtoolsSession, 1, 22);
    await settled(page, '2 / 6');
    await gesture(page, devtoolsSession, 1, 40, true);
    await settled(page, '2 / 6');
    pass('backward, short, and cancelled gestures settle correctly');
    await navigateToContents(page);
    await settled(page, '3 / 6');
    await page.locator('[data-page="contents"] a').first().tap();
    await settled(page, '4 / 6');
    const body = page.locator('.book > [data-page="body"]:not([hidden])');
    assert.ok(await body.locator('.reader-profile').isVisible(), 'the author and recommendation share one phone page');
    assert.match(await body.locator('.reader-profile').innerText(), /박지훈/);
    for (const profile of await page.locator('.book > [data-page="profile"]').all())
        assert.ok(await profile.isHidden(), 'separate profiles are skipped on phones');
    pass('phone navigation combines each author with their recommendation');
    const timing = await body.locator('.ink-layer [data-ink="underline"]').evaluateAll(paths => paths.map(path => ({
        length: path.getTotalLength(),
        timing: path.getAnimations()[0]?.effect.getTiming(),
    })).filter(stroke => stroke.timing));
    timing.sort((firstStroke, cornerBounds) => firstStroke.length - cornerBounds.length);
    assert.ok(timing.at(-1).timing.duration > timing[0].timing.duration, 'long underlines take longer than short ones');
    assert.equal(Math.min(...timing.map(proseBounds => proseBounds.timing.delay)), 0, 'first ink begins without a staged pause');
    assert.ok(timing.every(proseBounds => proseBounds.timing.easing === 'linear'), 'a continuous stroke does not restart its acceleration');
    assert.ok(await body.locator('.ink-layer [data-ink="underline"]').count() > 2);
    assert.equal(await body.locator('.ink-layer [data-ink="circle"]').count(), 1);
    assert.equal(await body.locator('.ink-layer [data-ink="star"]').count(), 1);
    assert.ok(await body.locator('.ink-layer [data-ink="star"]').evaluate(star => {
        const mark = star.getBoundingClientRect();
        const viewport = star.closest('.page-body').getBoundingClientRect();
        const circle = star.parentElement.querySelector('[data-ink="circle"]').getBoundingClientRect();
        return mark.left >= viewport.left && mark.right <= viewport.right && mark.left + mark.width / 2 < circle.left && mark.top + mark.height / 2 < circle.top + circle.height / 2;
    }), 'handwritten star sits above-left of the circle, inside the scrolling viewport');
    assert.ok(await body.evaluate(element => element.getAnimations({ subtree: true }).length > 0));
    await page.waitForFunction(() => [...document.querySelectorAll('.book > [data-page="body"]:not([hidden]) .ink-layer path')].some(path => {
        const offset = parseFloat(getComputedStyle(path).strokeDashoffset);
        return offset > 0 && offset < 1;
    }), null, { timeout: 500 });
    pass('first read immediately draws underlines and a circle with its handwritten star, even with OS reduce-motion enabled');
    await navigateToContents(page);
    await settled(page, '3 / 6');
    await page.locator('[data-page="contents"] a').first().tap();
    await settled(page, '4 / 6');
    assert.equal(await body.evaluate(element => element.getAnimations({ subtree: true }).length), 0);
    assert.equal(await body.getAttribute('data-ink-playing'), null);
    await shot(page, 'phone-annotations');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-ready]');
    assert.equal(await body.evaluate(element => element.getAnimations({ subtree: true }).length), 0);
    pass('returning to or reloading a page preserves finished ink without replay');
    await page.setViewportSize({ width: 375, height: 667 });
    await load(page, '/?case=reading#ref-01-park-jihoon');
    const scroll = page.locator('.book > [data-page="body"]:not([hidden]) .page-body');
    assert.ok(await scroll.evaluate(element => element.scrollHeight > element.clientHeight));
    const scrollBounds = await scroll.boundingBox(), horizontalPosition = scrollBounds.x + scrollBounds.width / 2, verticalPosition = scrollBounds.y + scrollBounds.height - 50;
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: horizontalPosition, y: verticalPosition }] });
    for (let index = 1; index <= 6; index++) {
        await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: horizontalPosition, y: verticalPosition - index * 22 }] });
        await page.waitForTimeout(30);
    }
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await scroll.evaluate(element => element.scrollTop > 0));
    await settled(page, '4 / 6');
    pass('long recommendations scroll natively on a small iPhone');
    await page.waitForTimeout(700); // Let native momentum scrolling finish before the next gesture.
    const thumb = { x: scrollBounds.x + scrollBounds.width * .72, y: scrollBounds.y + scrollBounds.height * .65 };
    await gesture(page, devtoolsSession, 1, 100, false, 'phone-thumb-curl', thumb);
    await settled(page, '5 / 6');
    assert.match(await body.locator('.reader-profile').innerText(), /Soyeon Kim/);
    await gesture(page, devtoolsSession, -1, 100, false, '', { ...thumb, x: scrollBounds.x + scrollBounds.width * .28 });
    await settled(page, '4 / 6');
    assert.ok(await scroll.evaluate(element => element.scrollTop > 0), 'returning preserves the recommendation scroll position');
    await gesture(page, devtoolsSession, 1, 22, false, '', thumb);
    await settled(page, '4 / 6');
    await gesture(page, devtoolsSession, 1, 80, true, '', thumb);
    await settled(page, '4 / 6');
    await scroll.evaluate(element => element.scrollTop = 0);
    const linkedin = body.locator('.reader-profile a');
    await page.evaluate(() => {
        window.authorLinkTapped = false;
        document.querySelector('.book > [data-page="body"]:not([hidden]) .reader-profile a').addEventListener('click', element => { element.preventDefault(); window.authorLinkTapped = true; });
    });
    await linkedin.tap();
    assert.equal(await page.evaluate(() => window.authorLinkTapped), true, 'author links remain tappable');
    await settled(page, '4 / 6');
    await page.evaluate(() => {
        const paragraph = document.querySelector('.book > [data-page="body"]:not([hidden]) .prose p');
        getSelection().selectAllChildren(paragraph);
    });
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] });
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: thumb.x - 70, y: thumb.y }] });
    assert.equal(await page.locator('.paper-turn').count(), 0, 'an existing text selection prevents swipe navigation');
    await devtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => getSelection().removeAllRanges());
    pass('thumb swipes turn both ways, short and cancelled swipes restore the page, and links remain tappable');
    const proseBounds = await page.locator(visible + ' .prose').boundingBox();
    await page.mouse.move(proseBounds.x + 15, proseBounds.y + 35);
    await page.mouse.down();
    await page.mouse.move(proseBounds.x + 160, proseBounds.y + 35, { steps: 10 });
    await page.mouse.up();
    assert.equal(await page.locator('.paper-turn').count(), 0);
    pass('dragging the reading area does not turn pages');
    await page.setViewportSize({ width: 430, height: 932 });
    await settled(page, '4 / 6');
    await shot(page, 'phone-large');
    await page.setViewportSize({ width: 1440, height: 900 });
    await settled(page, '3 / 5');
    await page.keyboard.press('Home');
    await settled(page, '1 / 5');
    await page.locator('.page-corner--right').click();
    await page.waitForSelector('.paper-turn');
    await page.setViewportSize({ width: 1440, height: 880 });
    await settled(page, '2 / 5');
    await shot(page, 'desktop-spread');
    const corner = await page.locator('.page-corner--right').boundingBox();
    await page.mouse.move(corner.x + 38, corner.y + 12);
    await page.mouse.down();
    await page.mouse.move(corner.x + 2, corner.y + 30, { steps: 8 });
    await shot(page, 'desktop-paper-curve');
    await page.mouse.move(corner.x - 47, corner.y + 40, { steps: 8 });
    await settled(page, '3 / 5'); // Still held: the remaining turn must complete on its own.
    await page.mouse.up();
    await settled(page, '3 / 5');
    const left = await page.locator('.page-corner--left').boundingBox();
    await page.mouse.move(left.x + 18, left.y + 14);
    await page.mouse.down();
    await page.mouse.move(left.x + 103, left.y + 30, { steps: 10 });
    await settled(page, '2 / 5');
    await page.mouse.up();
    await settled(page, '2 / 5');
    await page.keyboard.press('ArrowRight');
    await settled(page, '3 / 5');
    await page.keyboard.press('ArrowLeft');
    await settled(page, '2 / 5');
    await page.keyboard.press('End');
    await settled(page, '5 / 5');
    pass('short desktop drags in both directions finish while held; release never turns a second page; keyboard and bounds remain intact');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.book > [data-page]').count(), 8);
    for (const printedPage of await page.locator('.book > [data-page]').all())
        assert.ok(await printedPage.isVisible());
    pass('printing includes every original page');
    await browserContext.close();
    const sound = await context({ ...devices['iPhone 13'] });
    await load(sound.p);
    await sound.p.locator('.page-corner--right').tap();
    await settled(sound.p, '2 / 6');
    assert.ok(await sound.p.evaluate(() => window.foley.contexts === 1 && window.foley.audible > 0));
    await navigateToContents(sound.p);
    await settled(sound.p, '3 / 6');
    await sound.p.locator('[data-page="contents"] a').first().tap();
    await settled(sound.p, '4 / 6');
    await sound.p.waitForTimeout(800);
    const during = await sound.p.evaluate(() => window.foley.starts);
    assert.ok(during >= 4, 'ink has its own audio after paper settles');
    const pens = await sound.p.evaluate(() => window.soundSources.filter(source => source.channels === 1));
    assert.ok(pens.length > 3 && pens.every(proseBounds => Math.abs(proseBounds.length - 1.2) < .01), 'pen audio comes from the real recording');
    assert.ok(new Set(pens.map(proseBounds => proseBounds.offset)).size === 2, 'the two recorded strokes alternate');
    assert.ok(pens.every(proseBounds => proseBounds.duration >= .09 && proseBounds.duration <= .42), 'each sound lasts only as long as its pen stroke');
    const stops = await sound.p.evaluate(() => window.stoppedSources);
    await navigateToContents(sound.p);
    await settled(sound.p, '3 / 6');
    assert.ok(await sound.p.evaluate(() => window.stoppedSources) > stops, 'leaving cancels scheduled pen sounds');
    const away = await sound.p.evaluate(() => window.foley.starts);
    await sound.p.waitForTimeout(1200);
    assert.equal(await sound.p.evaluate(() => window.foley.starts), away);
    await sound.p.locator('[data-sound-toggle]').tap();
    await sound.p.locator('[data-page="contents"] a').last().tap();
    await settled(sound.p, '5 / 6');
    await sound.p.waitForTimeout(600);
    assert.equal(await sound.p.evaluate(() => window.foley.starts), away);
    pass('ordinary opening plays default-on non-silent foley; navigation cancels old ink sounds; mute stops future sounds');
    await sound.c.close();
    const deep = await context({ ...devices['iPhone 13'] });
    await load(deep.p, '/?profile=1#ref-01-park-jihoon-profile');
    await settled(deep.p, '4 / 6');
    assert.ok(await deep.p.locator(visible + ' .reader-profile').isVisible());
    assert.ok(deep.p.url().endsWith('#ref-01-park-jihoon'), 'old profile links resolve to the combined recommendation');
    await deep.p.setViewportSize({ width: 1440, height: 900 });
    await settled(deep.p, '3 / 5');
    assert.ok(await deep.p.locator('.book > [data-page="profile"]:not([hidden])').isVisible());
    assert.ok(await deep.p.locator(visible + ' .reader-profile').isHidden());
    await shot(deep.p, 'desktop-reference-spread');
    await deep.p.setViewportSize({ width: 390, height: 844 });
    await settled(deep.p, '4 / 6');
    pass('profile deep links and phone/desktop resizing keep the same recommendation without duplicate author blocks');
    await load(deep.p, '/?direct=1#ref-02-kim-soyeon');
    await deep.p.waitForTimeout(1400);
    assert.equal(await deep.p.evaluate(() => window.foley.contexts), 0, 'a direct link never queues pen audio before interaction');
    await deep.p.locator('[data-book-next]').last().tap();
    await settled(deep.p, '6 / 6');
    assert.equal(await deep.p.evaluate(() => window.foley.starts), 1, 'first interaction plays its page turn without a burst of old pen sounds');
    pass('direct links draw immediately and begin default-on audio at the first interaction, without queued old sounds');
    await deep.c.close();
    const reduced = await context({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
    await reduced.c.addInitScript(() => sessionStorage.setItem('book-motion', 'off'));
    await load(reduced.p, '/?reduce=1#ref-01-park-jihoon');
    assert.equal(await reduced.p.locator('.prose').evaluateAll(elements => elements.flatMap(element => element.getAnimations({ subtree: true })).length), 0);
    await reduced.p.locator('[data-book-prev]').last().tap();
    await settled(reduced.p, '3 / 6');
    const reducedDevtoolsSession = await reduced.c.newCDPSession(reduced.p);
    const reducedCornerBounds = await reduced.p.locator('.page-corner--right').boundingBox();
    await reducedDevtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: reducedCornerBounds.x + 35, y: reducedCornerBounds.y + 15 }] });
    await reducedDevtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: reducedCornerBounds.x - 130, y: reducedCornerBounds.y + 25 }] });
    assert.equal(await reduced.p.locator('.paper-turn').count(), 0);
    await reducedDevtoolsSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settled(reduced.p, '4 / 6');
    assert.equal(await reduced.p.locator('[data-motion-toggle]').getAttribute('aria-pressed'), 'false');
    await reduced.p.setViewportSize({ width: 375, height: 667 });
    await reduced.p.waitForTimeout(100);
    await reduced.p.locator('[data-motion-toggle]').tap();
    const reducedBody = reduced.p.locator('.book > [data-page="body"]:not([hidden])');
    assert.ok(await reducedBody.evaluate(element => element.getAnimations({ subtree: true }).length > 0), 'a page skipped while effects were disabled still gets its first drawing');
    await gesture(reduced.p, reducedDevtoolsSession, 1, 170, false, 'phone-os-reduce-curve');
    await settled(reduced.p, '5 / 6');
    await reduced.p.locator('[data-motion-toggle]').tap();
    await reduced.p.reload({ waitUntil: 'networkidle' });
    assert.equal(await reduced.p.locator('[data-motion-toggle]').getAttribute('aria-pressed'), 'false');
    pass('site pause retains navigation; re-enabling effects restores drawing and curved touch turning; explicit pause survives reload');
    await reduced.c.close();
    await verifyOnboarding();
    const fallback = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const fallbackPage = await fallback.newPage();
    await fallbackPage.goto(base + '/ko/');
    assert.equal(await fallbackPage.locator('[data-page]').count(), 8);
    for (const page of await fallbackPage.locator('[data-page]').all())
        assert.ok(await page.isVisible());
    assert.equal(await fallbackPage.locator('[data-book-open], .cover-fallback').count(), 0);
    pass('no-JavaScript reading keeps every page visible without cover buttons');
    await fallback.close();
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log(`${checks} browser checks passed. Screenshots: ${output}`);
}
try {
    await runChecks();
}
finally {
    await browser.close();
}
