'use strict';
/* ==========================================================================
 * game.js — Native WeChat Mini Game (微信小游戏) Root Entry Point
 *
 * Pure Canvas-only runtime (zero DOM, zero HTML, zero CSS, zero window.confirm).
 * Open the repository root directly in WeChat DevTools (compileType: "game").
 * ========================================================================== */
const NativeApp = require('./minigame/native_app');

if (typeof wx !== 'undefined' && wx && typeof wx.createCanvas === 'function') {
  NativeApp.boot();
}

if (typeof module === 'object' && module.exports) {
  module.exports = NativeApp;
}
