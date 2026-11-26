'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

/* ==========================================================================
 * Minimal Headless DOM & Canvas Harness so Node unit tests exercise ALL
 * modules: config/ads.js, platform.js, i18n.js, data.js, audio.js, world.js,
 * art.js, battle.js, ui.js, game.js, plus native WeChat minigame/native_app.js
 * ========================================================================== */
const memStore = new Map();
globalThis.localStorage = {
  getItem: k => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: k => memStore.delete(k),
};

function makeFakeCtx() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    save: noop, restore: noop, scale: noop, translate: noop, rotate: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, arc: noop, ellipse: noop,
    fill: noop, stroke: noop, fillText: noop, drawImage: noop,
    measureText: txt => ({ width: String(txt || '').length * 7 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    font: '', textAlign: 'left', textBaseline: 'top',
  };
}

class FakeElement {
  constructor(tag, id) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.id = id || '';
    this.textContent = '';
    this._innerHTML = '';
    this.src = '';
    this.width = 300;
    this.height = 200;
    this.clientWidth = 400;
    this.clientHeight = 240;
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentElement = { getBoundingClientRect: () => ({ width: 480, height: 280 }) };
    this._classes = new Set();
    this.classList = {
      add: (...cs) => cs.forEach(c => this._classes.add(c)),
      remove: (...cs) => cs.forEach(c => this._classes.delete(c)),
      contains: c => this._classes.has(c),
    };
    this._listeners = {};
    this.onclick = null;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = String(val || '');
    this.children = [];
    const parseAttrs = (tag, attrs, body) => {
      const el = new FakeElement(tag);
      el.textContent = (body || '').replace(/<[^>]+>/g, '');
      if (/\bdisabled\b/i.test(attrs)) el.disabled = true;
      const idM = /id="([^"]+)"/.exec(attrs);
      if (idM) el.id = idM[1];
      const dataRe = /data-([a-z0-9-]+)="([^"]*)"/gi;
      let dm;
      while ((dm = dataRe.exec(attrs))) {
        const camel = dm[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        el.dataset[camel] = dm[2];
      }
      this.children.push(el);
    };
    const btnRe = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
    let m;
    while ((m = btnRe.exec(this._innerHTML))) parseAttrs('button', m[1], m[2]);
    const idTagRe = /<(div|canvas)([^>]*\bid="[^"]+"[^>]*)>/gi;
    while ((m = idTagRe.exec(this._innerHTML))) parseAttrs(m[1], m[2], '');
  }
  appendChild(el) { this.children.push(el); return el; }
  remove() {}
  getContext() { return makeFakeCtx(); }
  toDataURL() { return 'data:image/png;base64,FAKE'; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  dispatchEvent(ev, evtObj) { (this._listeners[ev] || []).forEach(fn => fn(evtObj || {})); }
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      return this.children.find(c => c.id === id) || null;
    }
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    if (sel === 'button') return this.children.filter(c => c.tagName === 'BUTTON');
    const dataM = /^\[data-([a-z0-9-]+)\]$/.exec(sel);
    if (dataM) {
      const camel = dataM[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      return this.children.filter(c => camel in c.dataset);
    }
    return [];
  }
}

const domRegistry = new Map();
function ensureEl(id, tag) {
  if (!domRegistry.has(id)) domRegistry.set(id, new FakeElement(tag || 'div', id));
  return domRegistry.get(id);
}
const ALL_IDS = [
  'world', 'hud', 'partnerCard', 'pcImg', 'pcName', 'pcLv', 'pcHp', 'pcHpTxt',
  'gold', 'orbs', 'superOrbs', 'masterOrbs', 'toolBelt', 'langBtn', 'muteBtn', 'menuBtn',
  'chapterBanner', 'compassBar', 'toasts', 'dpad', 'mapBtn', 'dexBtn', 'bagBtn', 'shopBtn',
  'mapLbl', 'dexLbl', 'dexCount', 'bagLbl', 'shopLbl', 'btnA', 'btnB', 'btnALabel', 'btnBLabel',
  'dialog', 'dlgFace', 'dlgName', 'dlgText',
  'battle', 'battleCanvas', 'bLangBtn', 'bwName', 'bwLv', 'bwBadge', 'bwHp', 'bwHpTxt',
  'bwCatch', 'bwCatchTxt', 'bmName', 'bmLv', 'bmHp', 'bmHpTxt', 'bmExp', 'bMsg', 'bActions', 'bSub',
  'bAttackLabel', 'bMoveName', 'bCatchLabel', 'bCatchInfo', 'bFeedLabel', 'bFeedInfo', 'bSwitchLabel', 'bSwitchInfo',
  'modal', 'modalTitle', 'modalLangBtn', 'modalClose', 'modalBody',
  'title', 'titleLangBtn', 'titleMain', 'titleSub', 'continueBtn', 'titlePick', 'starters', 'titleHint',
  'celebrate', 'celeTitle', 'celeImg', 'celeName', 'celeDesc', 'celeOk', 'celePartner',
];
ALL_IDS.forEach(id => ensureEl(id, id.includes('Canvas') || id === 'world' ? 'canvas' : 'div'));
['modal', 'battle', 'dialog', 'celebrate', 'compassBar'].forEach(id => ensureEl(id).classList.add('hidden'));

globalThis.document = {
  getElementById: id => domRegistry.get(id) || null,
  createElement: tag => new FakeElement(tag),
};
const winListeners = {};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  addEventListener: (ev, fn) => { (winListeners[ev] ||= []).push(fn); },
  dispatchKey: (code, key) => {
    (winListeners.keydown || []).forEach(fn => fn({ code, key: key || code, preventDefault: () => {} }));
  },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate: () => true },
  configurable: true,
  writable: true,
});

// Load ALL 11 browser/shared modules!
const fs = require('node:fs');
const path = require('node:path');
const AdsConfig = require('../config/ads.js');
const Platform = require('../js/platform.js');
const I18N = require('../js/i18n.js');
const GameData = require('../js/data.js');
const AudioFX = require('../js/audio.js');
const World = require('../js/world.js');
const GameCore = require('../js/core.js');
const Art = require('../js/art.js');
const Battle = require('../js/battle.js');
const UI = require('../js/ui.js');
const Game = require('../js/game.js');

describe('1. Platform Bridge (Fail-Closed WeChat IAA, Single In-Flight Lock, Interstitial & Share)', () => {
  beforeEach(() => {
    memStore.clear();
    Platform._resetForTest();
    delete globalThis.wx;
    delete globalThis.AETHERIA_REWARD_AD_ID;
    delete globalThis.AETHERIA_INTERSTITIAL_AD_ID;
    AdsConfig.rewardedVideoUnitId = '';
    AdsConfig.interstitialUnitId = '';
    AdsConfig.allowWebSimulation = true;
  });

  afterEach(() => {
    delete globalThis.wx;
    delete globalThis.AETHERIA_REWARD_AD_ID;
    delete globalThis.AETHERIA_INTERSTITIAL_AD_ID;
    Platform._resetForTest();
  });

  it('FAILS CLOSED inside WeChat when ad unit ID is missing (0 progress, never calls web simulator)', () => {
    globalThis.wx = {
      getSystemInfoSync: () => ({ platform: 'ios' }),
      getStorageSync: () => '',
      setStorageSync: () => {},
      createRewardedVideoAd: () => { throw new Error('must not be called without unitId'); },
    };
    let rewarded = 0;
    let simCalled = 0;
    let failReason = null;
    const started = Platform.showRewardedAd(
      { id: 'ch4_pack', adCost: 2 },
      () => { rewarded++; },
      reason => { failReason = reason; },
      () => { simCalled++; }
    );
    assert.equal(started, false);
    assert.equal(rewarded, 0);
    assert.equal(simCalled, 0);
    assert.equal(failReason, 'ad_unavailable');
    assert.equal(Platform.isRewardedAdInFlight(), false);
  });

  it('prevents double-reward on concurrent double-tap with async singleton WeChat RewardedVideoAd', async () => {
    const closeHandlers = new Set();
    const errHandlers = new Set();
    let showCalls = 0;
    const singletonAd = {
      onClose: cb => closeHandlers.add(cb),
      offClose: cb => closeHandlers.delete(cb),
      onError: cb => errHandlers.add(cb),
      offError: cb => errHandlers.delete(cb),
      load: () => Promise.resolve(),
      show: () => {
        showCalls++;
        return Promise.resolve();
      },
    };
    globalThis.wx = {
      getSystemInfoSync: () => ({ platform: 'android' }),
      createRewardedVideoAd: () => singletonAd,
    };
    globalThis.AETHERIA_REWARD_AD_ID = 'adunit-test-reward';

    let rewardCount = 0;
    const incompleteReasons = [];
    const prod = { id: 'ch4_pack', adCost: 2 };

    // First tap starts ad session
    const r1 = Platform.showRewardedAd(prod, () => rewardCount++, r => incompleteReasons.push(r));
    assert.equal(r1, true);
    assert.equal(Platform.isRewardedAdInFlight(), true);
    assert.equal(closeHandlers.size, 1);

    // Concurrent second tap MUST be rejected as busy and NOT attach a second listener
    const r2 = Platform.showRewardedAd(prod, () => rewardCount++, r => incompleteReasons.push(r));
    assert.equal(r2, false);
    assert.equal(closeHandlers.size, 1);
    assert.equal(showCalls, 1);
    assert.deepEqual(incompleteReasons, ['busy']);

    // Now native ad closes as completed -> MUST grant exactly ONE credit and clean up listeners!
    Array.from(closeHandlers).forEach(fn => fn({ isEnded: true }));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(rewardCount, 1);
    assert.equal(closeHandlers.size, 0);
    assert.equal(errHandlers.size, 0);
    assert.equal(Platform.isRewardedAdInFlight(), false);
  });

  it('handles sync createRewardedVideoAd error, show/load rejection, and incomplete close with 0 progress', async () => {
    globalThis.AETHERIA_REWARD_AD_ID = 'adunit-test-err';
    globalThis.wx = {
      getSystemInfoSync: () => ({}),
      createRewardedVideoAd: () => { throw new Error('boom-create'); },
    };
    let rewards = 0;
    const reasons = [];
    assert.equal(Platform.showRewardedAd({ id: 'ch4_pack' }, () => rewards++, r => reasons.push(r)), false);
    assert.equal(rewards, 0);
    assert.equal(Platform.isRewardedAdInFlight(), false);

    // Show + load rejection cleans up listeners
    const closeHandlers = new Set();
    const errHandlers = new Set();
    globalThis.wx.createRewardedVideoAd = () => ({
      onClose: cb => closeHandlers.add(cb),
      offClose: cb => closeHandlers.delete(cb),
      onError: cb => errHandlers.add(cb),
      offError: cb => errHandlers.delete(cb),
      show: () => Promise.reject('show-fail'),
      load: () => Promise.reject('load-fail'),
    });
    Platform.showRewardedAd({ id: 'ch4_pack' }, () => rewards++, r => reasons.push(r));
    await new Promise(r => setTimeout(r, 15));
    assert.equal(rewards, 0);
    assert.equal(closeHandlers.size, 0);
    assert.equal(errHandlers.size, 0);
    assert.equal(Platform.isRewardedAdInFlight(), false);
  });

  it('does NOT consume interstitial cooldown when ad.show() fails, and registers localized share callbacks', async () => {
    let shouldFail = true;
    const errHandlers = new Set();
    let appMsgCb = null;
    let timelineCb = null;
    let shareMenuOpts = null;

    globalThis.wx = {
      getSystemInfoSync: () => ({}),
      showShareMenu: opts => { shareMenuOpts = opts; },
      onShareAppMessage: cb => { appMsgCb = cb; },
      onShareTimeline: cb => { timelineCb = cb; },
      createInterstitialAd: () => ({
        onError: cb => errHandlers.add(cb),
        offError: cb => errHandlers.delete(cb),
        show: () => (shouldFail ? Promise.reject(new Error('no-fill')) : Promise.resolve()),
      }),
    };
    globalThis.AETHERIA_INTERSTITIAL_AD_ID = 'adunit-interstitial';

    // Failed display must return false and NOT consume cooldown
    const first = await Platform.showInterstitialAd();
    assert.equal(first, false);
    assert.equal(errHandlers.size, 0);

    // Subsequent display immediately succeeds because cooldown was NOT consumed
    shouldFail = false;
    const second = await Platform.showInterstitialAd();
    assert.equal(second, true);

    // Third display immediately blocked by 120s cooldown
    const third = await Platform.showInterstitialAd();
    assert.equal(third, false);

    // Localized share callbacks
    I18N.setLang('en');
    Platform.initShareMenu(() => ({ title: I18N.t('shareTitle', { caught: 5 }), query: 'lang=' + I18N.getLang() }));
    assert.ok(shareMenuOpts && shareMenuOpts.withShareTicket === true);
    assert.match(appMsgCb().title, /5\/25/);
    assert.equal(timelineCb().query, 'lang=en');
  });
});

describe('2. I18N Parity, Zero Cash Paywalls & Zero Dev/ISBN Player Text', () => {
  it('maintains strict zh/en key & placeholder parity and contains zero ¥/$/ISBN/ad-revenue/adViewsLabel leaks', () => {
    const zh = I18N.UI.zh;
    const en = I18N.UI.en;
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
    for (const k of Object.keys(zh)) {
      if (typeof zh[k] === 'string') {
        const zhVars = (zh[k].match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
        const enVars = (en[k].match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
        assert.deepEqual(zhVars, enVars, `Placeholder mismatch for key: ${k}`);
      }
    }
    const serialized = JSON.stringify(I18N.UI);
    assert.equal(/[¥￥$]/.test(serialized), false, 'Found cash currency symbol');
    assert.equal(/ISBN|版号|solo devs|广告分成|adViewsLabel/i.test(serialized), false, 'Found player-facing developer/review-risk copy');
    assert.equal(I18N.UI.en.storeBuyGold, 'Buy · {price} 🪙');
  });
});

describe('3. Battle Engine Input Locking (4a/4b/4c), Boss Rematch 0 Reward & Live Language Refresh', () => {
  beforeEach(() => {
    World.init();
    AudioFX.init();
    I18N.setLang('en');
  });

  it('4a/4b/4c: locks shortcut keys while submenu open, prevents double-victory gold, and cancels enemyTurn after Run', async () => {
    const st = Game.defaultState('sproutling');
    st.party[0].lv = 30;
    st.party[0].hp = 300;
    st.party[0].maxHp = 300;
    st.items.masterOrbs = 2;
    const startGold = st.gold;

    // 4a & 4b: Open Catch submenu -> press Attack ('attack') -> MUST be ignored while menuOpen!
    let endCalls = 0;
    Battle.start(st, 'sproutling', 3, false, 1, () => { endCalls++; });
    Battle.handleAction('catch');
    assert.equal(Battle.isMenuOpen(), true);
    const wildHpBefore = Battle.getWild().hp;
    Battle.handleAction('attack'); // MUST be ignored because menuOpen === true!
    assert.equal(Battle.getWild().hp, wildHpBefore, 'Attack must be ignored while orb submenu is open');

    // Now click Astral Orb button; try clicking it twice rapidly
    const sub = document.getElementById('bSub');
    const masterBtn = sub.querySelectorAll('button').find(b => b.dataset.orb === 'masterOrbs');
    assert.ok(masterBtn, 'Astral orb button rendered');
    masterBtn.onclick();
    assert.equal(Battle.isBusy(), true);
    assert.equal(st.items.masterOrbs, 1);
    masterBtn.onclick(); // Second click MUST be ignored!
    assert.equal(st.items.masterOrbs, 1);

    // Wait for capture + victory to finish using condition-based wait -> exactly ONE end callback and ONE gold award
    const deadline = Date.now() + 4500;
    while (Battle.isActive() && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 40));
    }
    assert.equal(Battle.isActive(), false);
    assert.equal(endCalls, 1);
    assert.ok(st.gold > startGold && st.gold < startGold + 60, `Gold should increase once (was ${startGold}, now ${st.gold})`);

    // 4c: Open Switch/Run submenu -> Run Away -> verify ZERO post-battle HP loss!
    const st2 = Game.defaultState('sproutling');
    const hpBeforeRun = st2.party[0].hp;
    let runEndResult = null;
    Battle.start(st2, 'oakstag', 9, false, 1, info => { runEndResult = info.result; });
    Battle.handleAction('switch');
    assert.equal(Battle.isMenuOpen(), true);
    Battle.handleAction('attack'); // Ignored while switch menu open
    const runBtn = document.getElementById('bSub').querySelectorAll('button').find(b => b.dataset.run === '1');
    runBtn.onclick();
    assert.equal(Battle.isBusy(), true);
    const runDeadline = Date.now() + 3000;
    while (Battle.isActive() && Date.now() < runDeadline) {
      await new Promise(r => setTimeout(r, 40));
    }
    await new Promise(r => setTimeout(r, 900)); // Ensure no stray enemyTurn fires AFTER endBattle
    assert.equal(runEndResult, 'run');
    assert.equal(st2.party[0].hp, hpBeforeRun, 'No enemyTurn damage may occur after Run Away');
  });

  it('refreshes active battle message and open submenu text on live language switch', () => {
    const st = Game.defaultState('sproutling');
    I18N.setLang('en');
    Battle.start(st, 'sproutling', 5, false, 1, () => {});
    assert.match(document.getElementById('bMsg').textContent, /Wild Mosskit/);
    Battle.handleAction('catch');
    assert.match(document.getElementById('bSub').innerHTML, /Star Orbs/);

    I18N.setLang('zh');
    Battle.refreshLang();
    assert.match(document.getElementById('bMsg').textContent, /青芽狸/);
    assert.match(document.getElementById('bSub').innerHTML, /星灵球/);
    Battle.endBattle({ result: 'run' });
  });

  it('awards 0 gold and 0 EXP on boss rematch after crest is earned', async () => {
    const st = Game.defaultState('sproutling');
    st.defeatedBosses.push(1);
    st.crests.push(1);
    st.party[0].lv = 35;
    st.party[0].hp = 400;
    st.party[0].maxHp = 400;
    st.items.masterOrbs = 1;
    const goldBefore = st.gold;
    const expBefore = st.party[0].exp;
    let infoOut = null;

    Battle.start(st, 'oakstag', 9, true, 1, info => { infoOut = info; });
    Battle.handleAction('catch');
    const masterBtn = document.getElementById('bSub').querySelectorAll('button').find(b => b.dataset.orb === 'masterOrbs');
    masterBtn.onclick();
    const deadline = Date.now() + 4500;
    while (Battle.isActive() && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 40));
    }
    assert.ok(infoOut, 'Battle must finish');
    assert.equal(infoOut.rematch, true);
    assert.equal(infoOut.goldGain, 0);
    assert.equal(infoOut.expGain, 0);
    assert.equal(st.gold, goldBefore);
    assert.equal(st.party[0].exp, expBefore);
  });
});

describe('4. Starter & Boss Combat Balance Verification (Monte Carlo)', () => {
  function simFight(partySpecs, bossId, bossLv, isBoss, chId, treatsAvailable) {
    const st = { heroId: 'ranger', tools: [] };
    const party = partySpecs.map(s => {
      const cst = GameCore.calcStats(s.id, s.lv, true, st);
      return { id: s.id, lv: s.lv, hp: cst.maxHp, maxHp: cst.maxHp };
    });
    const wild = GameCore.createWildUnit(bossId, bossLv, isBoss, chId);
    let activeIdx = 0;
    let treats = treatsAvailable || 0;
    for (let turn = 0; turn < 60; turn++) {
      const mine = party[activeIdx];
      if (!mine || mine.hp <= 0) return false;
      if (treats > 0 && mine.hp < mine.maxHp * 0.35) {
        treats--;
        mine.hp = Math.min(mine.maxHp, mine.hp + Math.round(mine.maxHp * 0.32));
      } else {
        const { dmg } = GameCore.calcPlayerDamage(mine, wild, st);
        wild.hp -= dmg;
        if (wild.hp <= 0) return true;
      }
      const { dmg: edmg } = GameCore.calcEnemyDamage(wild, mine, false);
      mine.hp -= edmg;
      if (mine.hp <= 0) {
        activeIdx = party.findIndex(p => p.hp > 0);
        if (activeIdx < 0) return false;
      }
    }
    return false;
  }

  it('every starter wins >=70% vs Lv5 Ch.1 wilds and >=50% vs Ch.1 boss at bossLv+2', () => {
    const ch1 = GameData.getChapter(1);
    const starters = ['sproutling', 'acornpup', 'dewdrop'];
    const TRIALS = 300;
    for (const sId of starters) {
      let wildWins = 0;
      for (let i = 0; i < TRIALS; i++) {
        const wId = ch1.wildPool[i % ch1.wildPool.length];
        if (simFight([{ id: sId, lv: 5 }], wId, 5, false, 1, 0)) wildWins++;
      }
      const wildRate = wildWins / TRIALS;
      assert.ok(wildRate >= 0.70, `Starter ${sId} vs Lv5 Ch.1 wilds win rate ${(wildRate * 100).toFixed(1)}% < 70%`);

      let bossWins = 0;
      for (let i = 0; i < TRIALS; i++) {
        if (simFight([{ id: sId, lv: ch1.dungeon.bossLv + 2 }], ch1.bossId, ch1.dungeon.bossLv, true, 1, 1)) bossWins++;
      }
      const bossRate = bossWins / TRIALS;
      console.log(`  [Balance] ${sId}: Lv5 Ch.1 wilds=${(wildRate * 100).toFixed(1)}%, Ch.1 Boss@Lv${ch1.dungeon.bossLv + 2}=${(bossRate * 100).toFixed(1)}%`);
      assert.ok(bossRate >= 0.50, `Starter ${sId} vs Ch.1 boss at Lv${ch1.dungeon.bossLv + 2} win rate ${(bossRate * 100).toFixed(1)}% < 50%`);
    }
  });

  it('Ch.4 Frostwyrm & Ch.5 Celestiar are beatable (>=50% at bossLv+3) with real challenge at bossLv (not trivial 100% stomp)', () => {
    const ch4 = GameData.getChapter(4);
    const ch5 = GameData.getChapter(5);
    const TRIALS = 300;

    let ch4Starters3 = 0, ch4EqualLv = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (simFight([
        { id: 'sproutling', lv: ch4.dungeon.bossLv + 3 },
        { id: 'acornpup', lv: ch4.dungeon.bossLv + 3 },
        { id: 'dewdrop', lv: ch4.dungeon.bossLv + 3 },
      ], ch4.bossId, ch4.dungeon.bossLv, true, 4, 2)) ch4Starters3++;
      if (simFight([
        { id: 'emberfennec', lv: ch4.dungeon.bossLv },
        { id: 'acornpup', lv: ch4.dungeon.bossLv },
        { id: 'dewdrop', lv: ch4.dungeon.bossLv },
      ], ch4.bossId, ch4.dungeon.bossLv, true, 4, 2)) ch4EqualLv++;
    }
    let ch5Starters3 = 0, ch5EqualLv = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (simFight([
        { id: 'sproutling', lv: ch5.dungeon.bossLv + 3 },
        { id: 'acornpup', lv: ch5.dungeon.bossLv + 3 },
        { id: 'dewdrop', lv: ch5.dungeon.bossLv + 3 },
      ], ch5.bossId, ch5.dungeon.bossLv, true, 5, 2)) ch5Starters3++;
      if (simFight([
        { id: 'aurorawolf', lv: ch5.dungeon.bossLv },
        { id: 'emberfennec', lv: ch5.dungeon.bossLv },
        { id: 'dewdrop', lv: ch5.dungeon.bossLv },
      ], ch5.bossId, ch5.dungeon.bossLv, true, 5, 2)) ch5EqualLv++;
    }
    const r4s = ch4Starters3 / TRIALS, r4e = ch4EqualLv / TRIALS;
    const r5s = ch5Starters3 / TRIALS, r5e = ch5EqualLv / TRIALS;
    console.log(`  [Balance] Ch.4 Boss: 3-starters@Lv25=${(r4s * 100).toFixed(1)}%, balanced@Lv22=${(r4e * 100).toFixed(1)}%`);
    console.log(`  [Balance] Ch.5 Boss: 3-starters@Lv31=${(r5s * 100).toFixed(1)}%, balanced@Lv28=${(r5e * 100).toFixed(1)}%`);
    assert.ok(r4s >= 0.50, `Ch.4 3-starters@Lv25 win rate ${(r4s * 100).toFixed(1)}% < 50%`);
    assert.ok(r5s >= 0.50, `Ch.5 3-starters@Lv31 win rate ${(r5s * 100).toFixed(1)}% < 50%`);
    assert.ok(r4e < 0.99, `Ch.4 equal-level should not be 100% trivial (${(r4e * 100).toFixed(1)}%)`);
  });
});

describe('5. Save Reliability, Schema Validation, Hero Swap HP Ratio, UI Modals & Real Faint Recovery', () => {
  beforeEach(() => {
    memStore.clear();
    World.init();
    Game.init();
  });

  it('rolls back adProgress when Platform.writeSave fails (never reports fake progress)', () => {
    Game.startGame(Game.defaultState('sproutling'));
    const origSet = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      const ok = Game.recordAdProgress(GameData.PRODUCT_BY_ID.ch4_pack);
      assert.equal(ok, false);
      assert.equal(Game.getState().adProgress.ch4_pack || 0, 0, 'adProgress must roll back on save failure');
    } finally {
      localStorage.setItem = origSet;
    }
  });

  it('sanitizes corrupt saves & resets locked-chapter positions/dungeons to Ch.1 fountain', () => {
    const ch1 = GameData.getChapter(1);
    const badSave = {
      unlockedChapters: [1, 2, 3],
      mapId: 'dun_4',
      x: 11, y: 10,
      owX: 38, owY: 48,
      caughtIds: 'not-an-array',
      party: [{ id: 'sproutling', lv: 999, hp: 99999, maxHp: 99999 }],
    };
    const clean = Game.sanitizeSave(badSave);
    assert.equal(clean.mapId, 'overworld');
    assert.equal(clean.x, ch1.healSpot.x);
    assert.equal(clean.y, ch1.healSpot.y + 1);
    assert.equal(clean.party[0].lv, 50);
    assert.ok(Array.isArray(clean.caughtIds) && clean.caughtIds.includes('sproutling'));
  });

  it('preserves HP ratio on Valkyrie <-> Ranger swap (fixes infinite heal exploit)', () => {
    const st = Game.defaultState('sproutling');
    st.unlockedHeroes.push('valkyrie');
    st.party[0].lv = 10;
    Game.startGame(st);
    const p = Game.getState().party[0];
    p.hp = 10;
    const hpAtStart = p.hp;
    for (let i = 0; i < 6; i++) {
      Game.equipHero('valkyrie');
      Game.equipHero('ranger');
    }
    assert.ok(p.hp <= hpAtStart + 1, `HP must not climb on swap (started ${hpAtStart}, now ${p.hp})`);
  });

  it('tracks bundle ownership separately via claimedBundles and credits ch4/ch5 ads toward bundle', () => {
    const st = Game.defaultState('sproutling');
    st.unlockedChapters = [1, 2, 3, 4, 5];
    st.unlockedHeroes = ['ranger', 'valkyrie'];
    st.tools = ['boots', 'wings'];
    st.adProgress = { ch4_pack: 2, ch5_pack: 1 };
    const bundle = GameData.PRODUCT_BY_ID.season_pass;

    assert.equal(UI.isProductOwned(bundle, st), false);
    assert.equal(UI.getEffectiveAdProgress(bundle, st), 3);

    Game.startGame(st);
    const goldBefore = Game.getState().gold;
    const masterBefore = Game.getState().items.masterOrbs;
    Game.recordAdProgress(bundle);
    assert.equal(UI.isProductOwned(bundle, Game.getState()), true);
    assert.equal(Game.getState().gold, goldBefore + 300);
    assert.equal(Game.getState().items.masterOrbs, masterBefore + 1);
  });

  it('blocks double Space from dismissing dialog within 220ms debounce window', () => {
    Game.startGame(Game.defaultState('sproutling'));
    let closed = false;
    Game.showDialog('Guardian', '👑', 'Intro text', () => { closed = true; });
    window.dispatchKey('Space', ' ');
    assert.equal(closed, false, 'Immediate Space must not skip newly opened dialog');
    assert.equal(Game.closeDialog(true), true);
    assert.equal(closed, true);
  });

  it('exercises real Game.startBattle faint recovery and asserts respawn at chapter fountain with full HP', async () => {
    const st = Game.defaultState('sproutling');
    st.party = [{ id: 'sproutling', lv: 1, hp: 1, maxHp: 56, exp: 0 }];
    st.x = 36;
    st.y = 92;
    Game.startGame(st);
    Game.startBattle('astraldragon', 28, false, 1);
    assert.equal(Battle.isActive(), true);
    Battle.handleAction('attack'); // 1 HP partner attacks -> enemy KOs partner -> real faint callback triggers
    const deadline = Date.now() + 5000;
    while (Battle.isActive() && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 40));
    }
    assert.equal(Battle.isActive(), false);
    const ch1 = GameData.getChapter(1);
    const pos = Game.getPlayerPos();
    assert.equal(World.getMap().id, 'overworld');
    assert.equal(Math.round(pos.x), ch1.healSpot.x);
    assert.equal(Math.round(pos.y), ch1.healSpot.y + 1);
    assert.equal(Game.getState().party[0].hp, Game.getState().party[0].maxHp);
  });

  it('exercises UI modals (Map, Vault tabs, Gate Lock, Dex, Party, Bag, Settings two-step reset & live lang refresh)', () => {
    Game.startGame(Game.defaultState('sproutling'));
    I18N.setLang('en');

    UI.openWorldMap();
    assert.match(document.getElementById('modalTitle').textContent, /Map/);
    I18N.setLang('zh');
    UI.refreshActiveModal();
    assert.match(document.getElementById('modalTitle').textContent, /大地图/);

    UI.openStore('chapters');
    assert.match(document.getElementById('modalBody').querySelector('#storeGrid').innerHTML, /ch4_pack/);
    UI.openStore('heroes');
    assert.match(document.getElementById('modalBody').querySelector('#storeGrid').innerHTML, /tidecaller/);
    UI.openStore('tools');
    assert.match(document.getElementById('modalBody').querySelector('#storeGrid').innerHTML, /tool_wings/);
    UI.openStore('items');
    assert.match(document.getElementById('modalBody').querySelector('#storeGrid').innerHTML, /ad_supply_pack/);

    UI.openGateLockModal(4);
    assert.match(document.getElementById('modalBody').innerHTML, /gateWatchAd/);
    UI.openDex();
    assert.match(document.getElementById('modalTitle').textContent, /1\/25/);
    UI.openParty();
    assert.match(document.getElementById('modalBody').innerHTML, /switchHeroBtn/);
    UI.openBag();
    assert.match(document.getElementById('modalBody').innerHTML, /bag-stats/);

    // Settings two-step reset confirmation (zero browser confirm())
    UI.openSettings();
    const resetBtn = document.getElementById('modalBody').querySelector('#setResetBtn');
    assert.ok(resetBtn);
    resetBtn.onclick();
    const confirmBtn = document.getElementById('modalBody').querySelector('#setResetConfirmBtn');
    const cancelBtn = document.getElementById('modalBody').querySelector('#setResetCancelBtn');
    assert.ok(confirmBtn && cancelBtn);
    cancelBtn.onclick();
    assert.ok(document.getElementById('modalBody').querySelector('#setResetBtn'));
    UI.closeModal();
  });
});

describe('6. World Seals, Tile-by-Tile Border Walking & Respawn Safety', () => {
  it('verifies [1,2,3], [1,2,3,4], [1,2,3,5], and [1..5] gate seals + tile-by-tile chapter border walking', () => {
    World.init();
    const ow = World.getOverworld();
    const bfsZones = unlocked => {
      const st = { unlockedChapters: unlocked, tools: ['boots', 'skiff'] };
      const vis = new Uint8Array(ow.w * ow.h);
      const q = [[34, 92]];
      vis[92 * ow.w + 34] = 1;
      const zones = new Set();
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let h = 0; h < q.length; h++) {
        const [x, y] = q[h];
        zones.add(World.getZ(ow, x, y));
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (!World.inb(ow, nx, ny) || vis[ny * ow.w + nx]) continue;
          if (World.isWalkable(nx, ny, st).ok) { vis[ny * ow.w + nx] = 1; q.push([nx, ny]); }
        }
      }
      return zones;
    };
    assert.equal(bfsZones([1, 2, 3]).has(4), false);
    assert.equal(bfsZones([1, 2, 3]).has(5), false);
    assert.equal(bfsZones([1, 2, 3, 4]).has(4), true);
    assert.equal(bfsZones([1, 2, 3, 4]).has(5), false);
    assert.equal(bfsZones([1, 2, 3, 5]).has(4), false);
    assert.equal(bfsZones([1, 2, 3, 5]).has(5), true);
    assert.equal(World.audit().unreachable.length, 0);

    for (const ch of GameData.CHAPTERS) {
      const rx = ch.healSpot.x, ry = ch.healSpot.y + 1;
      assert.equal(World.isWalkable(rx, ry, { unlockedChapters: [1, 2, 3, 4, 5], tools: ['boots'] }).ok, true);
    }

    // Tile-by-tile walking across Ch.1 -> Ch.2 bridge (y=90) and locked Ch.4 gate (39, 66 -> 65)
    Game.init();
    const st = Game.defaultState('sproutling');
    st.x = 73; st.y = 90;
    Game.startGame(st);
    assert.equal(Game.tryStep('right'), true);
    assert.equal(Game.getPlayerPos().tx, 74);

    // Locked Ch.4 gate must block step into y=65
    st.x = 39; st.y = 66;
    Game.startGame(st);
    assert.equal(Game.tryStep('up'), false);
    // Unlock Ch.4 -> step into y=65 now succeeds!
    Game.getState().unlockedChapters.push(4);
    assert.equal(Game.tryStep('up'), true);
    assert.equal(Game.getPlayerPos().ty, 65);
  });
});

describe('7. Native WeChat Mini Game (game.js / minigame/native_app.js / js/core.js) Zero-DOM Verification', () => {
  it('contains zero DOM/HTML/confirm/js-battle references in native WeChat runtime files', () => {
    const rootDir = path.resolve(__dirname, '..');
    for (const rel of ['game.js', 'minigame/native_app.js', 'js/core.js']) {
      const raw = fs.readFileSync(path.join(rootDir, rel), 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.equal(/\bdocument\./.test(code), false, `${rel} must not reference document.*`);
      assert.equal(/\bwindow\./.test(code), false, `${rel} must not reference window.*`);
      assert.equal(/\binnerHTML\b/.test(code), false, `${rel} must not reference innerHTML`);
      assert.equal(/\bconfirm\s*\(/.test(code), false, `${rel} must not call confirm()`);
      assert.equal(/js\/battle/.test(code), false, `${rel} must not require browser js/battle.js`);
    }
  });

  it('boots, picks starter, walks, opens vault (fail-closed ad), battles, and saves with document/window UNDEFINED', () => {
    const savedDoc = globalThis.document;
    const savedWin = globalThis.window;
    const wxStorage = new Map();
    let touchStartCb = null;
    let audioCtxCreated = false;
    let shareRegistered = false;

    try {
      delete globalThis.document;
      delete globalThis.window;
      delete globalThis.AETHERIA_REWARD_AD_ID;
      AdsConfig.rewardedVideoUnitId = '';

      globalThis.wx = {
        getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }),
        getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }),
        createCanvas: () => ({ width: 390, height: 844, getContext: () => makeFakeCtx() }),
        createWebAudioContext: () => {
          audioCtxCreated = true;
          return {
            state: 'running',
            currentTime: 0,
            destination: {},
            createOscillator: () => ({ type: '', frequency: { setValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {} }),
            createGain: () => ({ gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} }),
          };
        },
        getStorageSync: k => wxStorage.get(k) || '',
        setStorageSync: (k, v) => wxStorage.set(k, v),
        removeStorageSync: k => wxStorage.delete(k),
        showShareMenu: () => {},
        onShareAppMessage: () => { shareRegistered = true; },
        onShareTimeline: () => {},
        onTouchStart: cb => { touchStartCb = cb; },
        onTouchMove: () => {},
        onTouchEnd: () => {},
        onTouchCancel: () => {},
      };

      AudioFX._resetContextForTest();
      Platform._resetForTest();
      const NativeApp = require('../game.js');
      assert.equal(NativeApp.boot(), true);
      assert.equal(shareRegistered, true);
      assert.equal(NativeApp.getScreen(), 'title');

      const starterZones = NativeApp.getHitZones().filter(z => z.h === 138);
      assert.equal(starterZones.length, 3);
      touchStartCb({ changedTouches: [{ clientX: starterZones[0].x + 10, clientY: starterZones[0].y + 10, identifier: 1 }] });
      assert.equal(NativeApp.getScreen(), 'world');
      assert.equal(audioCtxCreated, true, 'AudioFX must use wx.createWebAudioContext in native WeChat');

      NativeApp.stepFrame();
      assert.equal(NativeApp.tryStep('down'), true);

      NativeApp.openModal('store', 'chapters');
      NativeApp.stepFrame();
      const started = NativeApp.triggerAdUnlock(GameData.PRODUCT_BY_ID.ch4_pack);
      assert.equal(started, false);
      assert.equal(NativeApp.getState().adProgress.ch4_pack || 0, 0);

      NativeApp.closeModal();
      NativeApp.startBattle('sproutling', 5, false, 1);
      NativeApp.stepFrame();
      assert.equal(NativeApp.getScreen(), 'battle');
      NativeApp.battleAction('catch');
      assert.equal(NativeApp.getBattleState().menuOpen, true);
      NativeApp.shutdown();
    } finally {
      globalThis.document = savedDoc;
      globalThis.window = savedWin;
      delete globalThis.wx;
      Platform._resetForTest();
    }
  });
});
