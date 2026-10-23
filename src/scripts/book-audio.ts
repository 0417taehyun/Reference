import { readSession, writeSession } from '../lib/session';
import { syncToggleButtons } from '../lib/book-dom';
export type SoundKind = 'turn' | 'pen';
export async function fetchSample(url: string): Promise<ArrayBuffer | null> {
    try {
        const response = await fetch(url);
        return response.ok ? response.arrayBuffer() : null;
    }
    catch {
        return null;
    }
}
export async function decodeSample(context: AudioContext | null, bytes: ArrayBuffer | null): Promise<AudioBuffer | null> {
    if (!context || !bytes)
        return null;
    try {
        return await context.decodeAudioData(bytes);
    }
    catch {
        return null;
    }
}
export function stopVoice(source: AudioBufferSourceNode) {
    try {
        source.stop();
    }
    catch { /* An already-ended source is harmless. */ }
}
export class BookAudio {
    context: AudioContext | null = null;
    enabled = readSession('book-sound-v2') !== 'off';
    voices = new Set<AudioBufferSourceNode>();
    playbackVersion = 0;
    pageTurn: AudioBuffer | null = null;
    penStrokes: AudioBuffer | null = null;
    penIndex = 0;
    decoding: Promise<void> | null = null;
    samples = Promise.all(['/audio/page-turn.wav', '/audio/pen-strokes.wav'].map(fetchSample));
    constructor() {
        document.querySelectorAll('[data-sound-toggle]').forEach(button => button.addEventListener('click', () => void this.setEnabled(!this.enabled)));
        document.addEventListener('pointerdown', this.unlock.bind(this), { passive: true, capture: true });
        document.addEventListener('keydown', this.unlock.bind(this));
        document.addEventListener('visibilitychange', this.handleVisibility.bind(this));
        this.sync();
    }
    handleVisibility() {
        if (document.hidden)
            this.stop();
    }
    sync() {
        syncToggleButtons('[data-sound-toggle]', '[data-sound-label]', this.enabled);
        document.documentElement.dataset.sound = this.enabled ? 'on' : 'off';
    }
    async decodeSamples() {
        const bytes = await this.samples;
        const decoded = await Promise.all(bytes.map(sample => decodeSample(this.context, sample)));
        [this.pageTurn, this.penStrokes] = decoded;
    }
    async unlock() {
        if (!this.enabled)
            return;
        try {
            await this.prepareContext();
        }
        catch {
            this.enabled = false;
            this.sync();
        }
    }
    async prepareContext() {
        this.context ??= new AudioContext();
        const ready = this.context.resume().catch(() => { });
        this.decoding ??= this.decodeSamples();
        await Promise.all([ready, this.decoding]);
    }
    async setEnabled(value: boolean) {
        this.enabled = value;
        writeSession('book-sound-v2', value ? 'on' : 'off');
        if (!value)
            this.stop();
        this.sync();
        if (value)
            await this.unlock();
    }
    stop() {
        this.playbackVersion++;
        this.voices.forEach(stopVoice);
        this.voices.clear();
    }
    async playWhenReady(version: number, seconds: number) {
        await this.unlock();
        if (this.context?.state !== 'running' || !this.pageTurn || version !== this.playbackVersion)
            return;
        this.play('turn', seconds);
    }
    play(kind: SoundKind, seconds = .45, delay = 0) {
        if (!this.enabled || document.hidden)
            return;
        const buffer = kind === 'turn' ? this.pageTurn : this.penStrokes;
        if (!this.context || this.context.state !== 'running' || !buffer)
            return this.deferTurn(kind, seconds);
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = buffer;
        source.connect(gain).connect(this.context.destination);
        if (kind === 'turn')
            this.playPage(source, gain);
        if (kind === 'pen')
            this.playPen(source, gain, seconds, delay);
        this.voices.add(source);
        source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
    }
    deferTurn(kind: SoundKind, seconds: number) {
        if (kind === 'turn')
            void this.playWhenReady(this.playbackVersion, seconds);
    }
    playPage(source: AudioBufferSourceNode, gain: GainNode) {
        source.playbackRate.value = .96 + Math.random() * .08;
        gain.gain.value = .23;
        source.start();
    }
    playPen(source: AudioBufferSourceNode, gain: GainNode, seconds: number, delay: number) {
        const offset = this.penIndex++ % 2 ? .66 : 0;
        const duration = Math.min(.42, seconds);
        const start = this.context!.currentTime + delay;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.3, start + .008);
        gain.gain.setValueAtTime(.3, start + Math.max(.008, duration - .025));
        gain.gain.linearRampToValueAtTime(0, start + duration);
        source.start(start, offset, duration);
    }
}
export function createBookAudio() { return new BookAudio(); }
