'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Setup lightweight browser globals before requiring modules
const memStore = new Map();
globalThis.localStorage = {
  getItem: k => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: k => memStore.delete(k),
};
globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate: () => true },
  configurable: true,
  writable: true,
});

const Platform = require('../js/platform.js');
globalThis.Platform = Platform;
const I18N = require('../js/i18n.js');
globalThis.I18N = I18N;
const GameData = require('../js/data.js');
globalThis.GameData = GameData;
const AudioFX = require('../js/audio.js');
globalThis.AudioFX = AudioFX;
const World = require('../js/world.js');
globalThis.World = World;

describe('Platform Bridge (Web Sandbox + WeChat Personal IAA)', () => {
  beforeEach(() => {
    memStore.clear();
    delete globalThis.wx;
    delete globalThis.AETHERIA_REWARD_AD_ID;
    delete globalThis.AETHERIA_INTERSTITIAL_AD_ID;
  });

  afterEach(() => {
    delete globalThis.wx;
    delete globalThis.AETHERIA_REWARD_AD_ID;
    delete globalThis.AETHERIA_INTERSTITIAL_AD_ID;
  });

  it('handles Web localStorage save/load/clear/settings, share no-op & vibration', () => {
    assert.equal(Platform.isWeChat, false);
    assert.equal(Platform.getEnvName(), 'web-iaa-sandbox');
    assert.equal(Platform.loadSave(), null);
    assert.equal(Platform.writeSave({ gold: 123 }), true);
    assert.deepEqual(Platform.loadSave(), { gold: 123 });
    Platform.clearSave();
    assert.equal(Platform.loadSave(), null);

    Platform.saveSetting('lang', 'en');
    assert.equal(Platform.loadSetting('lang'), 'en');
    Platform.vibrateShort();
    Platform.initShareMenu();
    assert.equal(Platform.showInterstitialAd(), false);
  });

  it('handles corrupted storage & throwing storage/share/vibrate gracefully', () => {
    memStore.set('aetheria_chronicles_save_v1', '{bad-json');
    assert.equal(Platform.loadSave(), null);

    const origSet = localStorage.setItem;
    const origRem = localStorage.removeItem;
    const origGet = localStorage.getItem;
    localStorage.setItem = () => { throw new Error('quota'); };
    localStorage.removeItem = () => { throw new Error('denied'); };
    localStorage.getItem = () => { throw new Error('denied'); };
    assert.equal(Platform.writeSave({ a: 1 }), false);
    Platform.clearSave();
    Platform.saveSetting('x', 'y');
    assert.equal(Platform.loadSetting('x'), null);
    localStorage.setItem = origSet;
    localStorage.removeItem = origRem;
    localStorage.getItem = origGet;

    const savedNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: () => { throw new Error('no vib'); } },
      configurable: true,
    });
    Platform.vibrateShort();
    Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true });
  });

  it('handles Web IAA sandbox rewarded ad (with & without simulated player callback)', () => {
    const prod = { id: 'ch4_pack', adCost: 2 };
    let res = null;
    Platform.showRewardedAd(prod, r => { res = r; });
    assert.deepEqual(res, { mode: 'web-ad-sandbox', productId: 'ch4_pack' });

    let rewarded = false, skipped = false;
    Platform.showRewardedAd(prod, () => { rewarded = true; }, () => { skipped = true; }, (p, ok) => ok());
    assert.equal(rewarded, true);
    Platform.showRewardedAd(prod, () => {}, () => { skipped = true; }, (p, ok, cancel) => cancel());
    assert.equal(skipped, true);
  });

  it('handles WeChat Personal IAA runtime (singleton RewardedAd non-stacking offClose, Interstitial cooldown, ShareMenu)', async () => {
    const wxStore = new Map();
    let vibCalled = false;
    let shareCalled = false;
    let interstitialCount = 0;

    // REAL WeChat-spec SINGLETON RewardedVideoAd to verify offClose prevents callback stacking!
    const closeHandlers = new Set();
    let adOutcome = 'ended';
    let adShowFailsOnce = false;
    const singletonAd = {
      onClose: cb => closeHandlers.add(cb),
      offClose: cb => closeHandlers.delete(cb),
      load: () => (adOutcome === 'loadfail' ? Promise.reject('net') : Promise.resolve()),
      show: () => {
        if (adShowFailsOnce) { adShowFailsOnce = false; return Promise.reject('need-load'); }
        if (adOutcome === 'loadfail') return Promise.reject('fail');
        setTimeout(() => {
          Array.from(closeHandlers).forEach(fn => fn({ isEnded: adOutcome === 'ended' }));
        }, 5);
        return Promise.resolve();
      },
    };

    globalThis.wx = {
      getSystemInfoSync: () => ({ platform: 'ios' }),
      getStorageSync: k => wxStore.get(k),
      setStorageSync: (k, v) => wxStore.set(k, v),
      removeStorageSync: k => wxStore.delete(k),
      vibrateShort: () => { vibCalled = true; },
      showShareMenu: () => { shareCalled = true; },
      createRewardedVideoAd: () => singletonAd,
      createInterstitialAd: () => ({
        show: () => { interstitialCount++; return Promise.resolve(); },
      }),
    };

    assert.equal(Platform.isWeChat, true);
    assert.equal(Platform.getEnvName(), 'wechat-minigame-iaa');
    Platform.writeSave({ ch: 4 });
    assert.deepEqual(Platform.loadSave(), { ch: 4 });
    wxStore.set('aetheria_chronicles_save_v1', { directObj: true });
    assert.deepEqual(Platform.loadSave(), { directObj: true });
    Platform.clearSave();
    Platform.saveSetting('lang', 'zh');
    assert.equal(Platform.loadSetting('lang'), 'zh');
    Platform.vibrateShort();
    assert.equal(vibCalled, true);
    Platform.initShareMenu();
    assert.equal(shareCalled, true);

    // Throwing showShareMenu handled safely
    globalThis.wx.showShareMenu = () => { throw new Error('denied'); };
    Platform.initShareMenu();

    // Singleton Rewarded Video Ad: watch TWICE -> must grant EXACTLY 2 rewards (not 3!) and leave 0 lingering listeners
    globalThis.AETHERIA_REWARD_AD_ID = 'ad_reward_1';
    let rewardCount = 0;
    await new Promise(resolve => Platform.showRewardedAd({ id: 'ch4_pack' }, () => { rewardCount++; resolve(); }));
    await new Promise(resolve => Platform.showRewardedAd({ id: 'ch4_pack' }, () => { rewardCount++; resolve(); }));
    assert.equal(rewardCount, 2, 'Singleton RewardedVideoAd must not stack onClose listeners');
    assert.equal(closeHandlers.size, 0, 'All onClose listeners must be detached after ad closes');

    // Incomplete ad view -> triggers onIncomplete, 0 reward
    adOutcome = 'incomplete';
    await new Promise(resolve => Platform.showRewardedAd({ id: 'ch4_pack' }, () => {}, reason => { assert.equal(reason, 'incomplete'); resolve(); }));
    assert.equal(closeHandlers.size, 0);

    // Retry load -> succeeds
    adOutcome = 'ended';
    adShowFailsOnce = true;
    await new Promise(resolve => Platform.showRewardedAd({ id: 'ch4_pack' }, () => { rewardCount++; resolve(); }));
    assert.equal(rewardCount, 3);

    // Load fails -> triggers onIncomplete and cleans up listener
    adOutcome = 'loadfail';
    await new Promise(resolve => Platform.showRewardedAd({ id: 'ch4_pack' }, () => {}, err => { assert.equal(err, 'net'); resolve(); }));
    assert.equal(closeHandlers.size, 0);

    // Interstitial Ad with 120s cooldown
    globalThis.AETHERIA_INTERSTITIAL_AD_ID = 'ad_inter_1';
    assert.equal(Platform.showInterstitialAd(), true);
    assert.equal(Platform.showInterstitialAd(), false, 'Second interstitial inside 120s cooldown must be skipped');
    assert.equal(interstitialCount, 1);
  });
});

describe('I18N Bilingual Localization & Strict CN/EN Parity', () => {
  it('enforces 100% key and {placeholder} parity between UI.zh and UI.en with zero cash paywall symbols', () => {
    const zhKeys = Object.keys(I18N.UI.zh).sort();
    const enKeys = Object.keys(I18N.UI.en).sort();
    assert.deepEqual(zhKeys, enKeys, 'UI.zh and UI.en must have identical key sets');
    assert.deepEqual(Object.keys(I18N.UI.zh.elemNames).sort(), Object.keys(I18N.UI.en.elemNames).sort());

    const extractPlaceholders = s => (typeof s === 'string' ? (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort() : []);
    zhKeys.forEach(k => {
      const zv = I18N.UI.zh[k];
      const ev = I18N.UI.en[k];
      assert.deepEqual(extractPlaceholders(zv), extractPlaceholders(ev), `Placeholder mismatch on key "${k}"`);
      if (typeof zv === 'string') {
        assert.equal(zv.includes('¥'), false, `Personal IAA build should not have ¥ price in zh.${k}`);
        assert.equal(ev.includes('$'), false, `Personal IAA build should not have $ price in en.${k}`);
      }
    });

    memStore.clear();
    I18N.setLang('zh');
    assert.equal(I18N.getLang(), 'zh');
    assert.equal(I18N.t('chapterPrefix', { n: 3 }), '第 3 章');
    assert.equal(I18N.toggleLang(), 'en');
    assert.equal(I18N.t('chapterPrefix', { n: 3 }), 'Chapter 3');
    assert.equal(I18N.t('nonexistent_key_xyz'), 'nonexistent_key_xyz');

    I18N.init();
    assert.equal(I18N.getLang(), 'en');
    assert.equal(I18N.toggleLang(), 'zh');
    I18N.init();
    assert.equal(I18N.getLang(), 'zh');

    assert.equal(I18N.pick(null), '');
    assert.equal(I18N.pick('plain'), 'plain');
    assert.equal(I18N.pick({ zh: '中文', en: 'English' }), '中文');
    assert.equal(I18N.pick({ en: 'OnlyEN' }), 'OnlyEN');
    assert.equal(I18N.pick({}), '');
  });
});

describe('GameData Registry & IAA Integrity', () => {
  it('has 5 chapters (1-3 free, 4-5 ad-unlock), 25 original critters, 5 heroes, 7 tools, zero cash prices', () => {
    assert.equal(GameData.CHAPTERS.length, 5);
    assert.deepEqual(GameData.CHAPTERS.filter(c => c.free).map(c => c.id), [1, 2, 3]);
    assert.deepEqual(GameData.CHAPTERS.filter(c => !c.free).map(c => c.id), [4, 5]);
    GameData.CHAPTERS.filter(c => !c.free).forEach(c => {
      assert.ok(c.adCost >= 1);
      assert.equal(c.priceCNY, undefined);
      assert.equal(c.priceUSD, undefined);
    });
    assert.equal(GameData.getChapter(999).id, 1);

    assert.equal(GameData.CRITTERS.length, 25);
    for (let ch = 1; ch <= 5; ch++) {
      const list = GameData.CRITTERS.filter(c => c.chapter === ch);
      assert.equal(list.length, 5);
      assert.equal(list.filter(c => c.boss).length, 1);
    }
    assert.equal(GameData.CRITTERS.filter(c => c.starter).length, 3);
    assert.equal(GameData.HEROES.length, 5);
    assert.equal(GameData.TOOLS.length, 7);

    GameData.PRODUCTS.forEach(p => {
      assert.ok(p.adCost >= 1, `Product ${p.id} must specify adCost`);
      assert.equal(p.priceCNY, undefined, `Personal IAA product ${p.id} must not have cash priceCNY`);
      if (p.grants.chapters) p.grants.chapters.forEach(cid => assert.ok(GameData.getChapter(cid)));
      if (p.grants.heroes) p.grants.heroes.forEach(hid => assert.ok(GameData.HERO_BY_ID[hid]));
      if (p.grants.tools) p.grants.tools.forEach(tid => assert.ok(GameData.TOOL_BY_ID[tid]));
    });

    assert.equal(GameData.typeMultiplier('grass', 'water'), 1.45);
    assert.equal(GameData.typeMultiplier('water', 'grass'), 0.72);
    assert.equal(GameData.typeMultiplier('fire', 'fire'), 1.0);
  });
});

describe('AudioFX Synth Engine', () => {
  it('handles mute/unmute, BGM tracks, stopBgm, and all SFX safely', async () => {
    class MockOsc {
      constructor() { this.frequency = { setValueAtTime() {} }; }
      connect() {} start() {} stop() {}
    }
    class MockGain {
      constructor() { this.gain = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
      connect() {}
    }
    globalThis.AudioContext = class {
      constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
      resume() { this.state = 'running'; return Promise.resolve(); }
      createOscillator() { return new MockOsc(); }
      createGain() { return new MockGain(); }
    };

    AudioFX.setMuted(false);
    assert.equal(AudioFX.isMuted(), false);
    AudioFX.init();
    AudioFX.ensure();
    Object.values(AudioFX.sfx).forEach(fn => fn());
    AudioFX.playBgm('meadow');
    AudioFX.playBgm('meadow');
    AudioFX.playBgm('battle');
    await new Promise(r => setTimeout(r, 200));
    AudioFX.playBgm('unknown_track');
    AudioFX.stopBgm();

    AudioFX.setMuted(true);
    assert.equal(AudioFX.isMuted(), true);
    assert.equal(AudioFX.ensure(), null);
    AudioFX.sfx.tap();
    AudioFX.setMuted(false);
  });
});

describe('World Generation, Dungeons, Seal Gates & Respawn Safety', () => {
  it('achieves 100% reachability across all 5 chapters when unlocked & safe fountain respawns', () => {
    const audit = World.init();
    assert.deepEqual(audit.unreachable, []);
    assert.ok(audit.reachableTiles > 10000);
    assert.equal(World.getMap().id, 'overworld');
    assert.equal(World.getT(World.getOverworld(), -1, -1), World.T.DEEP);
    assert.equal(World.getZ(World.getOverworld(), -1, -1), 1);

    // Every chapter's faint respawn tile (healSpot.x, healSpot.y + 1) MUST be walkable!
    const fullState = { unlockedChapters: [1, 2, 3, 4, 5], tools: ['skiff'] };
    GameData.CHAPTERS.forEach(ch => {
      const rx = ch.healSpot.x, ry = ch.healSpot.y + 1;
      const check = World.isWalkable(rx, ry, fullState);
      assert.equal(check.ok, true, `Ch.${ch.id} faint respawn (${rx},${ry}) is blocked: ${check.reason}`);
    });
  });

  it('hermetically seals Chapters 4 & 5 when locked AND seals Chapter 4 even if ONLY Chapter 5 is unlocked', () => {
    World.init();
    const ow = World.getOverworld();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const runBfs = unlockedChapters => {
      const st = { unlockedChapters, tools: ['skiff'] };
      const vis = new Uint8Array(ow.w * ow.h);
      const q = [[34, 92]];
      vis[92 * ow.w + 34] = 1;
      let head = 0;
      const zones = new Set();
      while (head < q.length) {
        const [cx, cy] = q[head++];
        zones.add(World.getZ(ow, cx, cy));
        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (!World.inb(ow, nx, ny) || vis[ny * ow.w + nx]) continue;
          if (World.isWalkable(nx, ny, st).ok) {
            vis[ny * ow.w + nx] = 1;
            q.push([nx, ny]);
          }
        }
      }
      return { vis, zones: Array.from(zones).sort() };
    };

    // Case 1: Only Free Chapters [1,2,3]
    const rFree = runBfs([1, 2, 3]);
    assert.deepEqual(rFree.zones, [1, 2, 3]);
    ow.portals.filter(p => p.chapter <= 3).forEach(p => {
      const near = dirs.some(([dx, dy]) => rFree.vis[(p.y + dy) * ow.w + (p.x + dx)]) || rFree.vis[p.y * ow.w + p.x];
      assert.equal(near, true, `Portal ${p.target} unreachable in free play`);
    });

    // Case 2: Unlock ONLY Ch.5 ([1,2,3,5]) -> Ch.4 MUST remain sealed!
    const rCh5Only = runBfs([1, 2, 3, 5]);
    assert.deepEqual(rCh5Only.zones, [1, 2, 3, 5], 'Unlocking only Ch.5 must NEVER leak into locked Ch.4!');

    // Case 3: Unlock ONLY Ch.4 ([1,2,3,4]) -> Ch.5 MUST remain sealed!
    const rCh4Only = runBfs([1, 2, 3, 4]);
    assert.deepEqual(rCh4Only.zones, [1, 2, 3, 4], 'Unlocking only Ch.4 must NEVER leak into locked Ch.5!');
  });

  it('verifies all 5 dungeons, bosses, shallow water skiff check, and all 4 border gates', () => {
    World.init();
    const lockedState = { unlockedChapters: [1, 2, 3], tools: ['boots'] };
    const unlockedState = { unlockedChapters: [1, 2, 3, 4, 5], tools: ['boots', 'skiff'] };

    assert.equal(World.isWalkable(-5, -5, lockedState).reason, 'oob');
    assert.equal(World.isWalkable(1, 1, lockedState).reason, 'solid');
    assert.equal(World.isWalkable(78, 70, lockedState).reason, 'water');
    assert.equal(World.isWalkable(78, 70, unlockedState).surf, true);

    // All 4 inter-chapter gates
    assert.equal(World.isWalkable(39, 65, lockedState).chapter, 4);   // South Pass
    assert.equal(World.isWalkable(74, 47, lockedState).chapter, 4);   // East Bridge
    assert.equal(World.isWalkable(47, 28, lockedState).chapter, 4);   // West Skybridge Ch.4 side
    assert.equal(World.isWalkable(47, 27, lockedState).chapter, 5);   // West Skybridge Ch.5 side
    assert.equal(World.isWalkable(103, 27, lockedState).chapter, 5);  // East Skybridge
    assert.equal(World.isWalkable(39, 65, unlockedState).ok, true);
    assert.equal(World.isWalkable(74, 47, unlockedState).ok, true);
    assert.equal(World.isWalkable(47, 28, unlockedState).ok, true);
    assert.equal(World.isWalkable(47, 27, unlockedState).ok, true);
    assert.equal(World.isWalkable(103, 27, unlockedState).ok, true);

    assert.equal(World.isWalkable(32, 91, lockedState).reason, 'npc');
    assert.equal(World.isWalkable(18, 95, lockedState).reason, 'chest');
    assert.equal(World.isWalkable(27, 88, lockedState).reason, 'obj');

    GameData.CHAPTERS.forEach(ch => {
      const dun = World.getDungeon(ch.dungeon.id);
      assert.ok(dun);
      World.setActiveMap(ch.dungeon.id);
      assert.equal(World.getMap().isDungeon, true);
      assert.equal(World.isWalkable(dun.boss.x, dun.boss.y, unlockedState).reason, 'boss');
    });
    World.setActiveMap('overworld');
    assert.equal(World.getMap().id, 'overworld');
  });
});
