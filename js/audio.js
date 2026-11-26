'use strict';
/* ==========================================================================
 * audio.js — Procedural Web Audio Fantasy Synth BGM & SFX
 * Lightweight (zero MP3 downloads — ideal for WeChat Mini Game 4MB limit).
 * ========================================================================== */
const AudioFX = (() => {
  let ctx = null;
  let muted = false;
  let bgmTimer = null;
  let currentTrack = null;
  let stepIdx = 0;

  const TRACKS = {
    meadow:    { tempo: 240, wave: 'triangle', notes: [523, 659, 784, 659, 880, 784, 659, 587, 523, 587, 659, 784, 659, 587, 523, 0] },
    coral:     { tempo: 230, wave: 'sine',     notes: [587, 740, 880, 988, 880, 740, 659, 587, 523, 659, 784, 880, 740, 659, 587, 0] },
    desert:    { tempo: 220, wave: 'triangle', notes: [440, 466, 554, 659, 554, 466, 440, 0,   440, 554, 659, 698, 659, 554, 466, 440] },
    frost:     { tempo: 260, wave: 'sine',     notes: [659, 784, 988, 1175, 988, 784, 740, 659, 587, 740, 880, 988, 880, 740, 659, 0] },
    starlight: { tempo: 250, wave: 'sine',     notes: [784, 988, 1175, 1319, 1175, 988, 880, 784, 659, 880, 988, 1319, 1175, 988, 784, 0] },
    battle:    { tempo: 165, wave: 'square',   notes: [330, 392, 440, 494, 523, 494, 440, 392, 330, 440, 523, 587, 523, 440, 392, 330] },
    dungeon:   { tempo: 260, wave: 'triangle', notes: [330, 392, 494, 440, 392, 330, 294, 330, 392, 440, 523, 494, 440, 392, 330, 0] },
  };

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur, type, vol, delay) {
    const c = ensure();
    if (!c || !freq) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.08, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playBgm(trackName) {
    if (currentTrack === trackName && bgmTimer) return;
    currentTrack = trackName;
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    const tr = TRACKS[trackName];
    if (!tr) return;
    stepIdx = 0;
    bgmTimer = setInterval(() => {
      if (muted || !ctx || ctx.state !== 'running') return;
      const n = tr.notes[stepIdx % tr.notes.length];
      stepIdx++;
      if (n > 0) tone(n, tr.tempo / 1000 * 0.85, tr.wave, tr.wave === 'square' ? 0.028 : 0.042, 0);
    }, tr.tempo);
  }

  function stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    currentTrack = null;
  }

  function setMuted(m) {
    muted = !!m;
    try { Platform.saveSetting('muted', muted ? '1' : '0'); } catch (_) {}
  }
  function isMuted() { return muted; }
  function init() {
    muted = Platform.loadSetting('muted') === '1';
  }

  const sfx = {
    step()    { tone(180 + Math.random() * 40, 0.04, 'triangle', 0.025); },
    tap()     { tone(620, 0.06, 'sine', 0.07); },
    open()    { tone(523, 0.08, 'triangle', 0.08, 0); tone(659, 0.08, 'triangle', 0.08, 0.06); tone(784, 0.14, 'triangle', 0.08, 0.12); },
    chest()   { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.09, i * 0.07)); },
    heal()    { [523, 659, 784, 988, 1046].forEach((f, i) => tone(f, 0.18, 'sine', 0.08, i * 0.08)); },
    hit()     { tone(220, 0.09, 'sawtooth', 0.08, 0); tone(140, 0.11, 'square', 0.06, 0.04); },
    superHit(){ tone(440, 0.08, 'square', 0.08, 0); tone(660, 0.12, 'sawtooth', 0.08, 0.06); },
    throwOrb(){ tone(420, 0.07, 'sine', 0.07, 0); tone(640, 0.11, 'sine', 0.07, 0.06); },
    catchOk() { [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.10, i * 0.09)); },
    unlock()  { [440, 554, 659, 880, 1109, 1319].forEach((f, i) => tone(f, 0.24, 'triangle', 0.10, i * 0.08)); },
    locked()  { tone(240, 0.12, 'sawtooth', 0.06, 0); tone(190, 0.16, 'sawtooth', 0.06, 0.1); },
    warp()    { [392, 523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.14, 'sine', 0.08, i * 0.05)); },
    levelUp() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.06, i * 0.08)); },
  };

  return { init, ensure, playBgm, stopBgm, setMuted, isMuted, sfx };
})();
if (typeof module === 'object' && module.exports) module.exports = AudioFX;
