'use strict';
/* ==========================================================================
 * platform.js — WeChat Personal Mini Game IAA (Ad Monetization) & Web Bridge
 * Zero Company Cost · 100% Compliant with WeChat Personal Mini Game Rules
 * Wraps: wx.getStorageSync / wx.createRewardedVideoAd / wx.createInterstitialAd
 *        / wx.showShareMenu / wx.vibrateShort with Web Sandbox fallback.
 * ========================================================================== */
const Platform = (() => {
  const isWeChatEnv = () => (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function');
  const SAVE_KEY = 'aetheria_chronicles_save_v1';
  const SETTING_PREFIX = 'aetheria_cfg_';
  let lastInterstitialAt = 0;

  function getEnvName() {
    return isWeChatEnv() ? 'wechat-minigame-iaa' : 'web-iaa-sandbox';
  }

  function loadSave() {
    try {
      const raw = isWeChatEnv() ? wx.getStorageSync(SAVE_KEY) : localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
      return null;
    }
  }

  function writeSave(data) {
    try {
      const str = JSON.stringify(data);
      if (isWeChatEnv()) wx.setStorageSync(SAVE_KEY, str);
      else localStorage.setItem(SAVE_KEY, str);
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSave() {
    try {
      if (isWeChatEnv()) wx.removeStorageSync(SAVE_KEY);
      else localStorage.removeItem(SAVE_KEY);
    } catch (_) {}
  }

  function loadSetting(key) {
    try {
      return isWeChatEnv() ? wx.getStorageSync(SETTING_PREFIX + key) : localStorage.getItem(SETTING_PREFIX + key);
    } catch (_) {
      return null;
    }
  }

  function saveSetting(key, val) {
    try {
      if (isWeChatEnv()) wx.setStorageSync(SETTING_PREFIX + key, String(val));
      else localStorage.setItem(SETTING_PREFIX + key, String(val));
    } catch (_) {}
  }

  function vibrateShort() {
    try {
      if (isWeChatEnv() && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      else if (navigator.vibrate) navigator.vibrate(14);
    } catch (_) {}
  }

  function initShareMenu() {
    try {
      if (isWeChatEnv() && typeof wx.showShareMenu === 'function') {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
      }
    } catch (_) {}
  }

  /**
   * Rewarded Video Ad (微信流量主 · 激励视频广告)
   * Properly detaches offClose so WeChat's singleton RewardedVideoAd never stacks callbacks.
   * On Web preview, calls onWebAdPlayer so players see a realistic simulated ad screen.
   */
  function showRewardedAd(product, onReward, onIncomplete, onWebAdPlayer) {
    const adUnitId = globalThis.AETHERIA_REWARD_AD_ID;
    if (isWeChatEnv() && typeof wx.createRewardedVideoAd === 'function' && adUnitId) {
      const ad = wx.createRewardedVideoAd({ adUnitId });
      const handleClose = res => {
        if (typeof ad.offClose === 'function') ad.offClose(handleClose);
        if (!res || res.isEnded) onReward && onReward({ mode: 'wechat-reward-ad', productId: product && product.id });
        else onIncomplete && onIncomplete('incomplete');
      };
      ad.onClose(handleClose);
      ad.show().catch(() => ad.load().then(() => ad.show()).catch(err => {
        if (typeof ad.offClose === 'function') ad.offClose(handleClose);
        onIncomplete && onIncomplete(err);
      }));
      return;
    }
    if (onWebAdPlayer) {
      onWebAdPlayer(
        product,
        () => onReward && onReward({ mode: 'web-ad-sandbox', productId: product && product.id }),
        () => onIncomplete && onIncomplete('incomplete')
      );
    } else {
      onReward && onReward({ mode: 'web-ad-sandbox', productId: product && product.id });
    }
  }

  /**
   * Interstitial Ad (微信流量主 · 插屏广告)
   * Respects a 120s cooldown so transitions feel smooth and non-intrusive.
   */
  function showInterstitialAd() {
    const adUnitId = globalThis.AETHERIA_INTERSTITIAL_AD_ID;
    const now = Date.now();
    if (now - lastInterstitialAt < 120000) return false;
    if (isWeChatEnv() && typeof wx.createInterstitialAd === 'function' && adUnitId) {
      lastInterstitialAt = now;
      const ad = wx.createInterstitialAd({ adUnitId });
      ad.show().catch(() => {});
      return true;
    }
    return false;
  }

  return {
    get isWeChat() { return isWeChatEnv(); },
    getEnvName,
    loadSave,
    writeSave,
    clearSave,
    loadSetting,
    saveSetting,
    vibrateShort,
    initShareMenu,
    showRewardedAd,
    showInterstitialAd,
  };
})();
if (typeof module === 'object' && module.exports) module.exports = Platform;
