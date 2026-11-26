'use strict';
/* ==========================================================================
 * config/ads.js — WeChat Mini Game Traffic Master (流量主) Ad Unit Config
 *
 * Fill in your real adUnitId values from WeChat MP Console (mp.weixin.qq.com ->
 * 流量主 -> 广告管理) once your personal Mini Game reaches the Traffic Master
 * threshold.
 *
 * SECURITY / FAIL-CLOSED RULE:
 *   Inside a WeChat Mini Game runtime (wx present), leaving rewardedVideoUnitId
 *   empty causes Platform.showRewardedAd() to FAIL CLOSED (no reward granted,
 *   no simulated fallback). Web simulation is ONLY permitted outside WeChat in
 *   explicit browser preview mode.
 * ========================================================================== */
const AETHERIA_ADS_CONFIG = {
  rewardedVideoUnitId: '',
  interstitialUnitId: '',
  allowWebSimulation: true,
};

if (typeof globalThis !== 'undefined') {
  globalThis.AETHERIA_ADS_CONFIG = AETHERIA_ADS_CONFIG;
}
if (typeof module === 'object' && module.exports) {
  module.exports = AETHERIA_ADS_CONFIG;
}
