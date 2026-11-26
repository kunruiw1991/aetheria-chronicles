'use strict';
/* ==========================================================================
 * platform.js — WeChat Personal Mini Game IAA & Web Sandbox Platform Bridge
 *
 * Wraps WeChat Mini Game APIs:
 *   - wx.getStorageSync / wx.setStorageSync / wx.removeStorageSync
 *   - wx.createRewardedVideoAd (singleton-safe, single in-flight lock, fail-closed)
 *   - wx.createInterstitialAd (cooldown consumed only on successful display)
 *   - wx.showShareMenu / wx.onShareAppMessage / wx.onShareTimeline
 *   - wx.vibrateShort
 *
 * Offline Limitation Note:
 *   Local storage saves (wx.setStorageSync / localStorage) are client-side and
 *   inherently mutable without an authoritative backend server.
 * ========================================================================== */
const Platform = (() => {
  const isWeChatEnv = () => (
    typeof wx !== 'undefined' &&
    wx !== null &&
    (typeof wx.getSystemInfoSync === 'function' || typeof wx.getWindowInfo === 'function')
  );
  const SAVE_KEY = 'aetheria_chronicles_save_v1';
  const SETTING_PREFIX = 'aetheria_cfg_';
  const INTERSTITIAL_COOLDOWN_MS = 120000;

  let lastInterstitialAt = 0;
  let rewardAdInFlight = false;
  let interstitialInFlight = false;

  function getAdsConfig() {
    if (typeof globalThis !== 'undefined' && globalThis.AETHERIA_ADS_CONFIG) {
      return globalThis.AETHERIA_ADS_CONFIG;
    }
    return { rewardedVideoUnitId: '', interstitialUnitId: '', allowWebSimulation: true };
  }

  function getRewardedAdUnitId() {
    const override = typeof globalThis !== 'undefined' ? globalThis.AETHERIA_REWARD_AD_ID : '';
    const cfg = getAdsConfig();
    const id = (override !== undefined && override !== null && override !== '')
      ? override
      : (cfg.rewardedVideoUnitId || '');
    return typeof id === 'string' ? id.trim() : '';
  }

  function getInterstitialAdUnitId() {
    const override = typeof globalThis !== 'undefined' ? globalThis.AETHERIA_INTERSTITIAL_AD_ID : '';
    const cfg = getAdsConfig();
    const id = (override !== undefined && override !== null && override !== '')
      ? override
      : (cfg.interstitialUnitId || '');
    return typeof id === 'string' ? id.trim() : '';
  }

  function isWebSimulationAllowed() {
    if (isWeChatEnv()) return false;
    const cfg = getAdsConfig();
    return cfg.allowWebSimulation !== false && typeof window !== 'undefined';
  }

  function getEnvName() {
    return isWeChatEnv() ? 'wechat-minigame-iaa' : 'web-iaa-sandbox';
  }

  function loadSave() {
    try {
      const raw = isWeChatEnv()
        ? wx.getStorageSync(SAVE_KEY)
        : (typeof localStorage !== 'undefined' ? localStorage.getItem(SAVE_KEY) : null);
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
      return null;
    }
  }

  function writeSave(data) {
    try {
      const str = JSON.stringify(data);
      if (isWeChatEnv()) {
        wx.setStorageSync(SAVE_KEY, str);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAVE_KEY, str);
      } else {
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSave() {
    try {
      if (isWeChatEnv()) wx.removeStorageSync(SAVE_KEY);
      else if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadSetting(key) {
    try {
      return isWeChatEnv()
        ? wx.getStorageSync(SETTING_PREFIX + key)
        : (typeof localStorage !== 'undefined' ? localStorage.getItem(SETTING_PREFIX + key) : null);
    } catch (_) {
      return null;
    }
  }

  function saveSetting(key, val) {
    try {
      if (isWeChatEnv()) wx.setStorageSync(SETTING_PREFIX + key, String(val));
      else if (typeof localStorage !== 'undefined') localStorage.setItem(SETTING_PREFIX + key, String(val));
      return true;
    } catch (_) {
      return false;
    }
  }

  function vibrateShort() {
    try {
      if (isWeChatEnv() && typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' });
      else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(14);
    } catch (_) {}
  }

  function initShareMenu(getSharePayload) {
    try {
      if (!isWeChatEnv()) return false;
      if (typeof wx.showShareMenu === 'function') {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
      }
      if (typeof getSharePayload === 'function') {
        if (typeof wx.onShareAppMessage === 'function') {
          wx.onShareAppMessage(() => getSharePayload('appMessage'));
        }
        if (typeof wx.onShareTimeline === 'function') {
          wx.onShareTimeline(() => getSharePayload('timeline'));
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Rewarded Video Ad (微信流量主 · 激励视频广告)
   * - Enforces a single in-flight session (rewardAdInFlight lock).
   * - Inside WeChat: FAILS CLOSED if adUnitId or wx.createRewardedVideoAd is missing
   *   or creation/show fails (zero progress granted; never falls back to simulation).
   * - Cleans up onClose / onError listeners on every outcome and settles exactly once.
   * - Outside WeChat: only uses onWebAdPlayer when explicit browser simulation is enabled.
   */
  function showRewardedAd(product, onReward, onIncomplete, onWebAdPlayer) {
    if (rewardAdInFlight) {
      if (onIncomplete) onIncomplete('busy');
      return false;
    }

    const productId = product && product.id;

    if (isWeChatEnv()) {
      const adUnitId = getRewardedAdUnitId();
      if (!adUnitId || typeof wx.createRewardedVideoAd !== 'function') {
        if (onIncomplete) onIncomplete('ad_unavailable');
        return false;
      }

      let ad = null;
      try {
        ad = wx.createRewardedVideoAd({ adUnitId });
      } catch (err) {
        if (onIncomplete) onIncomplete(err || 'ad_create_error');
        return false;
      }
      if (!ad || typeof ad.show !== 'function' || typeof ad.onClose !== 'function') {
        if (onIncomplete) onIncomplete('ad_unavailable');
        return false;
      }

      rewardAdInFlight = true;
      let settled = false;

      const cleanup = () => {
        try { if (typeof ad.offClose === 'function') ad.offClose(handleClose); } catch (_) {}
        try { if (typeof ad.offError === 'function') ad.offError(handleError); } catch (_) {}
      };

      const settle = (completed, payload) => {
        if (settled) return;
        settled = true;
        rewardAdInFlight = false;
        cleanup();
        if (completed) {
          if (onReward) onReward(payload);
        } else if (onIncomplete) {
          onIncomplete(payload);
        }
      };

      const handleClose = res => {
        if (!res || res.isEnded) {
          settle(true, { mode: 'wechat-reward-ad', productId });
        } else {
          settle(false, 'incomplete');
        }
      };

      const handleError = err => {
        settle(false, err || 'ad_error');
      };

      ad.onClose(handleClose);
      if (typeof ad.onError === 'function') ad.onError(handleError);

      try {
        Promise.resolve(ad.show()).catch(() => {
          if (settled) return;
          if (typeof ad.load !== 'function') {
            settle(false, 'ad_show_error');
            return;
          }
          return Promise.resolve(ad.load())
            .then(() => {
              if (settled) return;
              return ad.show();
            })
            .catch(err => {
              settle(false, err || 'ad_show_error');
            });
        });
      } catch (err) {
        settle(false, err || 'ad_show_error');
        return false;
      }
      return true;
    }

    if (!isWebSimulationAllowed() || typeof onWebAdPlayer !== 'function') {
      if (onIncomplete) onIncomplete('ad_unavailable');
      return false;
    }

    rewardAdInFlight = true;
    let settled = false;
    const settleSim = (completed, reason) => {
      if (settled) return;
      settled = true;
      rewardAdInFlight = false;
      if (completed) {
        if (onReward) onReward({ mode: 'web-ad-sandbox', productId });
      } else if (onIncomplete) {
        onIncomplete(reason || 'incomplete');
      }
    };

    try {
      onWebAdPlayer(
        product,
        () => settleSim(true),
        reason => settleSim(false, reason || 'incomplete')
      );
    } catch (err) {
      settleSim(false, err || 'ad_sim_error');
      return false;
    }
    return true;
  }

  /**
   * Interstitial Ad (微信流量主 · 插屏广告)
   * - Respects 120s cooldown.
   * - Consumes cooldown and resolves true ONLY if ad.show() succeeds.
   * - Attaches and detaches onError listener cleanly.
   */
  function showInterstitialAd() {
    const now = Date.now();
    if (interstitialInFlight || now - lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) {
      return Promise.resolve(false);
    }
    const adUnitId = getInterstitialAdUnitId();
    if (!isWeChatEnv() || typeof wx.createInterstitialAd !== 'function' || !adUnitId) {
      return Promise.resolve(false);
    }

    let ad = null;
    try {
      ad = wx.createInterstitialAd({ adUnitId });
    } catch (_) {
      return Promise.resolve(false);
    }
    if (!ad || typeof ad.show !== 'function') return Promise.resolve(false);

    interstitialInFlight = true;
    let hadError = false;
    const handleError = () => { hadError = true; };
    const cleanup = () => {
      interstitialInFlight = false;
      try { if (typeof ad.offError === 'function') ad.offError(handleError); } catch (_) {}
    };

    if (typeof ad.onError === 'function') ad.onError(handleError);

    try {
      return Promise.resolve(ad.show())
        .then(() => {
          cleanup();
          if (hadError) return false;
          lastInterstitialAt = Date.now();
          return true;
        })
        .catch(() => {
          cleanup();
          return false;
        });
    } catch (_) {
      cleanup();
      return Promise.resolve(false);
    }
  }

  function isRewardedAdInFlight() { return rewardAdInFlight; }

  function _resetForTest() {
    lastInterstitialAt = 0;
    rewardAdInFlight = false;
    interstitialInFlight = false;
  }

  return {
    get isWeChat() { return isWeChatEnv(); },
    getEnvName,
    getRewardedAdUnitId,
    getInterstitialAdUnitId,
    isWebSimulationAllowed,
    isRewardedAdInFlight,
    loadSave,
    writeSave,
    clearSave,
    loadSetting,
    saveSetting,
    vibrateShort,
    initShareMenu,
    showRewardedAd,
    showInterstitialAd,
    _resetForTest,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.Platform = Platform;
if (typeof module === 'object' && module.exports) module.exports = Platform;
