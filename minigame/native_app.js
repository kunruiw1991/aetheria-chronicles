'use strict';
/* ==========================================================================
 * minigame/native_app.js — Pure Canvas Native WeChat Mini Game Runtime
 *
 * Zero DOM / HTML / CSS dependencies. Uses exclusively:
 *   - wx.createCanvas() (main screen & offscreen world map)
 *   - wx.getWindowInfo() / wx.getSystemInfoSync()
 *   - wx.onTouchStart / onTouchMove / onTouchEnd / onTouchCancel
 *   - Shared game core: config/ads.js, platform.js, i18n.js, data.js,
 *     audio.js, world.js, art.js, battle.js (calc helpers)
 * ========================================================================== */
require('../config/ads');
const Platform = require('../js/platform');
const I18N = require('../js/i18n');
const GameData = require('../js/data');
const AudioFX = require('../js/audio');
const World = require('../js/world');
const Art = require('../js/art');
const BattleCore = require('../js/battle');

const NativeApp = (() => {
  const D = GameData;

  let canvas = null;
  let ctx = null;
  let vw = 390;
  let vh = 844;
  let dpr = 1;
  let mapCanvas = null;

  let booted = false;
  let screen = 'title'; // 'title' | 'world' | 'battle' | 'modal'
  let modalType = null; // 'map' | 'store' | 'gate' | 'dex' | 'party' | 'bag' | 'settings'
  let modalArg = null;
  let storeTab = 'chapters';
  let modalScroll = 0;
  let resetConfirm = false;

  let state = null;
  let time = 0;
  let rafId = null;

  const player = {
    x: 34, y: 92, tx: 34, ty: 92,
    moving: false, dir: 'down', walkPhase: 0,
    stepsSinceEncounter: 0, owX: 34, owY: 92,
  };

  let currentChapterId = 1;
  let dpadDir = null;
  let dpadTouchId = null;
  let dashHeld = false;
  let lastGateWarn = -9999;

  // Dialog & Toast
  let dialog = null; // { speaker, emoji, text, openedAt, onDone }
  let toasts = []; // [{ text, expiresAt }]

  // Native Canvas Battle State
  let bState = null; // { wild, isBoss, chapterId, busy, menuOpen, subMenu, fedCount, shieldActive, victoryTriggered, msgSpec }
  const battleTimers = new Set();

  // Hit-tested interactive regions rebuilt every frame
  let hitZones = [];
  let dpadRect = { cx: 64, cy: 760, r: 44 };

  function nowMs() {
    return Date.now();
  }

  function clearBattleTimers() {
    battleTimers.forEach(id => clearTimeout(id));
    battleTimers.clear();
  }

  function schedBattle(fn, ms) {
    const id = setTimeout(() => {
      battleTimers.delete(id);
      if (!bState || screen !== 'battle') return;
      fn();
    }, ms);
    battleTimers.add(id);
    return id;
  }

  function defaultState(starterId) {
    const cr = D.CRITTER_BY_ID[starterId] || D.CRITTERS[0];
    const lv = 5;
    const maxHp = cr.hp + lv * 6;
    return {
      version: 2,
      heroId: 'ranger',
      unlockedHeroes: ['ranger'],
      unlockedChapters: [1, 2, 3],
      crests: [],
      tools: ['boots'],
      gold: 80,
      items: { orbs: 8, superOrbs: 2, masterOrbs: 0, treats: 5 },
      party: [{ id: cr.id, lv, hp: maxHp, maxHp, exp: 0 }],
      activePartnerIdx: 0,
      caughtIds: [cr.id],
      openedChests: [],
      claimedNpcs: [],
      defeatedBosses: [],
      claimedBundles: [],
      adProgress: {},
      adViewsTotal: 0,
      mapId: 'overworld',
      x: 34, y: 92,
      owX: 34, owY: 92,
    };
  }

  function clampInt(n, min, max, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, Math.round(v)));
  }

  function sanitizeSave(raw) {
    const base = defaultState('sproutling');
    if (!raw || typeof raw !== 'object') return base;
    const validCh = new Set(D.CHAPTERS.map(c => c.id));
    const validH = new Set(D.HEROES.map(h => h.id));
    const validT = new Set(D.TOOLS.map(t => t.id));
    const validC = new Set(D.CRITTERS.map(c => c.id));
    const validB = new Set(D.PRODUCTS.filter(p => p.isBundle).map(p => p.id));

    const uniq = (arr, set) => {
      if (!Array.isArray(arr)) return [];
      const out = [];
      arr.forEach(v => { if ((!set || set.has(v)) && !out.includes(v)) out.push(v); });
      return out;
    };

    const unlockedChapters = uniq(raw.unlockedChapters, validCh);
    [1, 2, 3].forEach(c => { if (!unlockedChapters.includes(c)) unlockedChapters.push(c); });
    const unlockedHeroes = uniq(raw.unlockedHeroes, validH);
    if (!unlockedHeroes.includes('ranger')) unlockedHeroes.unshift('ranger');
    const heroId = unlockedHeroes.includes(raw.heroId) ? raw.heroId : 'ranger';
    const tools = uniq(raw.tools, validT);
    if (!tools.includes('boots')) tools.unshift('boots');
    const crests = uniq(raw.crests, validCh);
    const defeatedBosses = uniq((Array.isArray(raw.defeatedBosses) ? raw.defeatedBosses : []).concat(crests), validCh);
    const claimedBundles = uniq(raw.claimedBundles, validB);
    const caughtIds = uniq(raw.caughtIds, validC);

    const party = [];
    if (Array.isArray(raw.party)) {
      raw.party.slice(0, 25).forEach(p => {
        if (!p || !validC.has(p.id)) return;
        const lv = clampInt(p.lv, 1, 50, 5);
        const cr = D.CRITTER_BY_ID[p.id];
        const maxHp = Math.max(1, clampInt(p.maxHp, 1, 9999, cr.hp + lv * 6));
        const hp = clampInt(p.hp, 0, maxHp, maxHp);
        party.push({ id: p.id, lv, hp, maxHp, exp: clampInt(p.exp, 0, 99999, 0) });
        if (!caughtIds.includes(p.id)) caughtIds.push(p.id);
      });
    }
    if (!party.length) {
      party.push(base.party[0]);
      if (!caughtIds.includes(base.party[0].id)) caughtIds.push(base.party[0].id);
    }
    if (party.every(p => p.hp <= 0)) party[0].hp = party[0].maxHp;

    const rawItems = (raw.items && typeof raw.items === 'object') ? raw.items : {};
    const adProgress = {};
    if (raw.adProgress && typeof raw.adProgress === 'object') {
      Object.keys(raw.adProgress).forEach(k => {
        if (D.PRODUCT_BY_ID[k]) adProgress[k] = clampInt(raw.adProgress[k], 0, 20, 0);
      });
    }

    const sanitized = {
      version: 2,
      heroId,
      unlockedHeroes,
      unlockedChapters,
      crests,
      tools,
      gold: clampInt(raw.gold, 0, 999999, 80),
      items: {
        orbs: clampInt(rawItems.orbs, 0, 999, 8),
        superOrbs: clampInt(rawItems.superOrbs, 0, 999, 2),
        masterOrbs: clampInt(rawItems.masterOrbs, 0, 999, 0),
        treats: clampInt(rawItems.treats, 0, 999, 5),
      },
      party,
      activePartnerIdx: clampInt(raw.activePartnerIdx, 0, party.length - 1, 0),
      caughtIds,
      openedChests: uniq(Array.isArray(raw.openedChests) ? raw.openedChests.filter(x => typeof x === 'string') : []),
      claimedNpcs: uniq(Array.isArray(raw.claimedNpcs) ? raw.claimedNpcs.filter(x => typeof x === 'string') : []),
      defeatedBosses,
      claimedBundles,
      adProgress,
      adViewsTotal: clampInt(raw.adViewsTotal, 0, 99999, 0),
      mapId: typeof raw.mapId === 'string' ? raw.mapId : 'overworld',
      x: clampInt(raw.x, 0, D.MAP_W - 1, 34),
      y: clampInt(raw.y, 0, D.MAP_H - 1, 92),
      owX: clampInt(raw.owX, 0, D.MAP_W - 1, 34),
      owY: clampInt(raw.owY, 0, D.MAP_H - 1, 92),
    };

    const ch1 = D.getChapter(1);
    const safeX = ch1.healSpot.x;
    const safeY = ch1.healSpot.y + 1;
    const ow = World.getOverworld();
    World.setActiveMap('overworld');
    if (!sanitized.unlockedChapters.includes(World.getZ(ow, sanitized.owX, sanitized.owY)) ||
        !World.isWalkable(sanitized.owX, sanitized.owY, sanitized).ok) {
      sanitized.owX = safeX;
      sanitized.owY = safeY;
    }
    if (sanitized.mapId !== 'overworld') {
      const dun = World.getDungeon(sanitized.mapId);
      if (!dun || !sanitized.unlockedChapters.includes(dun.chapterId)) {
        sanitized.mapId = 'overworld';
        sanitized.x = safeX;
        sanitized.y = safeY;
      }
    } else if (!sanitized.unlockedChapters.includes(World.getZ(ow, sanitized.x, sanitized.y)) ||
               !World.isWalkable(sanitized.x, sanitized.y, sanitized).ok) {
      sanitized.x = safeX;
      sanitized.y = safeY;
    }
    return sanitized;
  }

  function syncPartyStats() {
    if (!state || !state.party) return;
    const hero = D.HERO_BY_ID[state.heroId];
    const hpMult = (hero && hero.perk && hero.perk.hpMult) ? hero.perk.hpMult : 1;
    state.party.forEach(p => {
      const base = D.CRITTER_BY_ID[p.id] || D.CRITTERS[0];
      const newMax = Math.round((base.hp + p.lv * 6) * hpMult);
      const oldMax = p.maxHp || newMax;
      const ratio = oldMax > 0 ? (p.hp / oldMax) : 1;
      p.maxHp = newMax;
      p.hp = p.hp <= 0 ? 0 : Math.max(1, Math.min(newMax, Math.round(ratio * newMax)));
    });
  }

  function toast(text) {
    toasts.push({ text, expiresAt: nowMs() + 2600 });
    if (toasts.length > 3) toasts.shift();
  }

  function saveState() {
    if (!state) return false;
    state.mapId = World.getMap().id;
    state.x = Math.round(player.tx);
    state.y = Math.round(player.ty);
    state.owX = player.owX;
    state.owY = player.owY;
    return Platform.writeSave(state);
  }

  function getEffectiveAdProgress(prod) {
    if (!prod || prod.repeatable) return 0;
    const prog = (state && state.adProgress) || {};
    let total = prog[prod.id] || 0;
    if (Array.isArray(prod.creditFrom)) {
      prod.creditFrom.forEach(src => { total += (prog[src] || 0); });
    }
    return Math.min(prod.adCost || 1, total);
  }

  function isProductOwned(p) {
    if (!p || p.repeatable) return false;
    if (p.isBundle) return Array.isArray(state.claimedBundles) && state.claimedBundles.includes(p.id);
    const g = p.grants || {};
    const chOk = !g.chapters || g.chapters.every(cid => state.unlockedChapters.includes(cid));
    const heroOk = !g.heroes || g.heroes.every(hid => state.unlockedHeroes.includes(hid));
    const toolOk = !g.tools || g.tools.every(tid => state.tools.includes(tid));
    return chOk && heroOk && toolOk;
  }

  function applyProductGrants(prod) {
    const g = prod.grants || {};
    if (g.chapters) g.chapters.forEach(cid => { if (!state.unlockedChapters.includes(cid)) state.unlockedChapters.push(cid); });
    if (g.heroes) {
      g.heroes.forEach(hid => {
        if (!state.unlockedHeroes.includes(hid)) state.unlockedHeroes.push(hid);
        state.heroId = hid;
      });
      syncPartyStats();
    }
    if (g.tools) g.tools.forEach(tid => { if (!state.tools.includes(tid)) state.tools.push(tid); });
    if (g.items) {
      Object.keys(g.items).forEach(k => {
        if (k === 'gold') state.gold += g.items[k];
        else state.items[k] = (state.items[k] || 0) + g.items[k];
      });
    }
    if (prod.isBundle) {
      state.claimedBundles = state.claimedBundles || [];
      if (!state.claimedBundles.includes(prod.id)) state.claimedBundles.push(prod.id);
    }
  }

  function triggerAdUnlock(prod) {
    return Platform.showRewardedAd(
      prod,
      () => {
        const snap = JSON.parse(JSON.stringify(state));
        state.adViewsTotal = (state.adViewsTotal || 0) + 1;
        let unlockedNow = false;
        if (prod.repeatable) {
          applyProductGrants(prod);
          unlockedNow = true;
        } else {
          state.adProgress = state.adProgress || {};
          state.adProgress[prod.id] = (state.adProgress[prod.id] || 0) + 1;
          const done = getEffectiveAdProgress(prod);
          if (done >= (prod.adCost || 1)) {
            applyProductGrants(prod);
            unlockedNow = true;
          }
        }
        if (!saveState()) {
          state = snap;
          AudioFX.sfx.locked();
          toast(I18N.t('saveFailedToast'));
          return;
        }
        if (unlockedNow) {
          AudioFX.sfx.unlock();
          toast(I18N.t('unlockedToast', { name: I18N.pick(prod.name) }));
          if (modalType === 'gate' && state.unlockedChapters.includes(modalArg)) {
            screen = 'world';
            modalType = null;
          }
        } else {
          AudioFX.sfx.tap();
          toast(I18N.t('adProgressToast', { done: getEffectiveAdProgress(prod), cost: prod.adCost }));
        }
      },
      reason => {
        AudioFX.sfx.locked();
        if (reason === 'ad_unavailable' || reason === 'ad_create_error' || reason === 'ad_show_error' || reason === 'ad_error') {
          toast(I18N.t('adUnavailableToast'));
        } else if (reason === 'busy') {
          toast(I18N.t('adBusyToast'));
        } else {
          toast(I18N.t('adIncompleteToast'));
        }
      }
    );
  }

  /* ---------------- Game Flow ---------------- */
  function startGame(loaded) {
    state = sanitizeSave(loaded);
    syncPartyStats();
    World.setActiveMap(state.mapId || 'overworld');
    player.x = player.tx = state.x;
    player.y = player.ty = state.y;
    player.owX = state.owX;
    player.owY = state.owY;
    player.moving = false;
    screen = 'world';
    modalType = null;
    updateChapterContext(true);
    saveState();
  }

  function updateChapterContext(playMusic) {
    const m = World.getMap();
    const chId = m.isDungeon ? m.chapterId : World.getZ(m, Math.round(player.x), Math.round(player.y));
    const changed = chId !== currentChapterId;
    currentChapterId = chId;
    const ch = D.getChapter(chId);
    if (playMusic || changed) AudioFX.playBgm(m.isDungeon ? 'dungeon' : ch.bgm);
  }

  function dirDelta(dir) {
    if (dir === 'up') return [0, -1];
    if (dir === 'down') return [0, 1];
    if (dir === 'left') return [-1, 0];
    if (dir === 'right') return [1, 0];
    return [0, 0];
  }

  function tryStep(dir) {
    player.dir = dir;
    const [dx, dy] = dirDelta(dir);
    const nx = Math.round(player.x) + dx;
    const ny = Math.round(player.y) + dy;
    const check = World.isWalkable(nx, ny, state);
    if (!check.ok) {
      if (check.reason === 'gate' && nowMs() - lastGateWarn > 1400) {
        lastGateWarn = nowMs();
        AudioFX.sfx.locked();
        openModal('gate', check.chapter);
      } else if (check.reason === 'water' && nowMs() - lastGateWarn > 2200) {
        lastGateWarn = nowMs();
        toast(I18N.t('waterBlocked'));
      }
      return false;
    }
    player.tx = nx;
    player.ty = ny;
    player.moving = true;
    AudioFX.sfx.step();
    return true;
  }

  function onStepComplete() {
    const m = World.getMap();
    const px = Math.round(player.x), py = Math.round(player.y);
    updateChapterContext(false);

    const obj = World.hasObjAt(m, px, py);
    if (obj && obj.action === 'enter_dungeon') {
      player.owX = px;
      player.owY = py + 1;
      World.setActiveMap(obj.data.dungeonId);
      player.x = player.tx = 11;
      player.y = player.ty = 13;
      player.dir = 'up';
      AudioFX.sfx.warp();
      toast('🌀 ' + I18N.pick(obj.label));
      updateChapterContext(true);
      saveState();
      return;
    }
    if (obj && obj.action === 'exit_dungeon') {
      World.setActiveMap('overworld');
      player.x = player.tx = obj.data.tx;
      player.y = player.ty = obj.data.ty;
      player.dir = 'down';
      AudioFX.sfx.warp();
      Platform.showInterstitialAd();
      updateChapterContext(true);
      saveState();
      return;
    }

    if (World.getT(m, px, py) === World.T.TALL) {
      player.stepsSinceEncounter++;
      if (player.stepsSinceEncounter >= 4 && Math.random() < 0.24) {
        player.stepsSinceEncounter = 0;
        const ch = D.getChapter(currentChapterId);
        const pool = m.isDungeon ? ch.dungeon.wildPool : ch.wildPool;
        const chosenId = pool[Math.floor(Math.random() * pool.length)];
        const [minLv, maxLv] = ch.lvRange;
        const lv = minLv + Math.floor(Math.random() * (maxLv - minLv + 1)) + (m.isDungeon ? 2 : 0);
        startBattle(chosenId, lv, false, ch.id);
      }
    }
  }

  function showDialog(speaker, emoji, text, onDone) {
    dialog = { speaker, emoji: emoji || '💬', text, openedAt: nowMs(), onDone: onDone || null };
  }

  function closeDialog(force) {
    if (!dialog) return false;
    if (!force && nowMs() - dialog.openedAt < 220) return false;
    const cb = dialog.onDone;
    dialog = null;
    if (cb) cb();
    return true;
  }

  function interact() {
    if (dialog) { closeDialog(false); return; }
    if (screen !== 'world') return;

    const m = World.getMap();
    const px = Math.round(player.x), py = Math.round(player.y);
    const [dx, dy] = dirDelta(player.dir);
    const targets = [[px + dx, py + dy], [px, py]];

    for (let i = 0; i < targets.length; i++) {
      const [tx, ty] = targets[i];
      if (m.boss && m.boss.x === tx && m.boss.y === ty) {
        const cr = D.CRITTER_BY_ID[m.boss.critterId];
        showDialog(I18N.pick(cr.name), '👑', I18N.pick(cr.desc), () => {
          startBattle(m.boss.critterId, m.boss.lv, true, m.boss.chapter);
        });
        return;
      }
      const chest = World.hasChestAt(m, tx, ty);
      if (chest) {
        if (state.openedChests.includes(chest.id)) { toast(I18N.t('chestEmpty')); return; }
        state.openedChests.push(chest.id);
        const parts = [];
        const goldMult = state.tools.includes('magnet') ? 1.35 : 1;
        Object.keys(chest.loot).forEach(k => {
          let amt = chest.loot[k];
          if (k === 'gold') { amt = Math.round(amt * goldMult); state.gold += amt; parts.push(amt + ' 🪙'); }
          else { state.items[k] = (state.items[k] || 0) + amt; parts.push(amt + ' ' + k); }
        });
        AudioFX.sfx.chest();
        toast(I18N.t('chestFound', { loot: parts.join(' + ') }));
        saveState();
        return;
      }
      const npc = World.hasNpcAt(m, tx, ty);
      if (npc) {
        AudioFX.sfx.tap();
        showDialog(I18N.pick(npc.name), '🗣️', I18N.pick(npc.lines), () => {
          if (npc.gift && !state.claimedNpcs.includes(npc.id)) {
            state.claimedNpcs.push(npc.id);
            Object.keys(npc.gift).forEach(k => {
              if (k === 'gold') state.gold += npc.gift[k];
              else state.items[k] = (state.items[k] || 0) + npc.gift[k];
            });
            AudioFX.sfx.chest();
            saveState();
          }
          if (npc.questTool && !state.tools.includes(npc.questTool)) {
            state.tools.push(npc.questTool);
            const tl = D.TOOL_BY_ID[npc.questTool];
            AudioFX.sfx.unlock();
            toast(I18N.t('unlockedToast', { name: tl.emoji + ' ' + I18N.pick(tl.name) }));
            saveState();
          }
          if (npc.role === 'shop') openModal('store', 'chapters');
          if (npc.role === 'gate4' && !state.unlockedChapters.includes(4)) openModal('gate', 4);
          if (npc.role === 'gate5' && !state.unlockedChapters.includes(5)) openModal('gate', 5);
        });
        return;
      }
      const obj = World.hasObjAt(m, tx, ty);
      if (obj && obj.action) {
        if (obj.action === 'heal') {
          state.party.forEach(p => { p.hp = p.maxHp; });
          AudioFX.sfx.heal();
          toast(I18N.t('healMsg'));
          saveState();
          return;
        }
        if (obj.action === 'shop') { openModal('store', 'chapters'); return; }
        if (obj.action === 'waystone') { openModal('map'); return; }
        if (obj.action === 'sign') { showDialog('🪧', '🪧', I18N.pick(obj.data.text)); return; }
      }
      const tile = World.getT(m, tx, ty);
      if (tile === World.T.GATE_CH4 && !state.unlockedChapters.includes(4)) { openModal('gate', 4); return; }
      if (tile === World.T.GATE_CH5 && !state.unlockedChapters.includes(5)) { openModal('gate', 5); return; }
    }
  }

  /* ---------------- Canvas-Native Battle Engine ---------------- */
  function getActiveMine() {
    let p = state.party[state.activePartnerIdx] || state.party[0];
    if (!p || p.hp <= 0) {
      const idx = state.party.findIndex(x => x.hp > 0);
      if (idx >= 0) { state.activePartnerIdx = idx; p = state.party[idx]; }
    }
    return p;
  }

  function startBattle(critterId, lv, isBoss, chId) {
    clearBattleTimers();
    player.moving = false;
    const st = BattleCore.calcStats(critterId, lv, false, state);
    const bossHpMult = isBoss ? 1.15 : 1.0;
    const hero = D.HERO_BY_ID[state.heroId];
    bState = {
      wild: { id: critterId, lv, maxHp: Math.round(st.maxHp * bossHpMult), hp: Math.round(st.maxHp * bossHpMult), atk: st.atk, spd: st.spd },
      isBoss: !!isBoss,
      chapterId: chId || currentChapterId,
      busy: false,
      menuOpen: false,
      subMenu: null,
      fedCount: 0,
      shieldActive: !!(hero && hero.perk && hero.perk.startShield),
      victoryTriggered: false,
      msgText: I18N.t(isBoss ? 'battleBossAppeared' : 'battleWildAppeared', {
        name: I18N.pick(D.CRITTER_BY_ID[critterId].name),
        lv,
      }),
    };
    screen = 'battle';
    AudioFX.playBgm('battle');
  }

  function nativeCatchChance(orbMult) {
    const base = D.CRITTER_BY_ID[bState.wild.id].catchBase;
    const hpBonus = (1 - Math.max(0, bState.wild.hp / bState.wild.maxHp)) * 0.42;
    const feedBonus = Math.min(0.45, bState.fedCount * 0.25);
    const hero = D.HERO_BY_ID[state.heroId];
    const heroBonus = (hero && hero.perk && hero.perk.catchBonus) ? hero.perk.catchBonus : 0;
    const toolBonus = state.tools.includes('prismstaff') ? 0.25 : 0;
    return Math.max(0.08, Math.min(0.98, (base + hpBonus + feedBonus + heroBonus + toolBonus) * (orbMult || 1)));
  }

  function battleAction(act) {
    if (!bState || bState.busy || bState.menuOpen) return;
    AudioFX.sfx.tap();
    if (act === 'attack') {
      bState.busy = true;
      const mine = getActiveMine();
      const mCr = D.CRITTER_BY_ID[mine.id];
      const { dmg, mult } = BattleCore.calcPlayerDamage(mine, bState.wild, state);
      bState.wild.hp = Math.max(0, bState.wild.hp - dmg);
      bState.msgText = I18N.t('battleUsedSkill', { a: I18N.pick(mCr.name), skill: I18N.pick(mCr.skill), dmg }) +
        (mult > 1.15 ? I18N.t('battleSuperEffective') : (mult < 0.9 ? I18N.t('battleNotEffective') : ''));
      schedBattle(() => {
        if (bState.wild.hp <= 0) finishNativeVictory(false);
        else nativeEnemyTurn();
      }, 600);
    } else if (act === 'catch') {
      if (state.items.orbs + state.items.superOrbs + state.items.masterOrbs <= 0) {
        bState.msgText = I18N.t('battleNoOrbs');
        return;
      }
      bState.menuOpen = true;
      bState.subMenu = 'orb';
    } else if (act === 'feed') {
      if (state.items.treats <= 0) { bState.msgText = I18N.t('battleNoTreats'); return; }
      bState.busy = true;
      state.items.treats--;
      bState.fedCount++;
      const mine = getActiveMine();
      mine.hp = Math.min(mine.maxHp, mine.hp + Math.round(mine.maxHp * 0.32));
      bState.msgText = I18N.t('battleFed', { name: I18N.pick(D.CRITTER_BY_ID[bState.wild.id].name) });
      schedBattle(() => nativeEnemyTurn(), 600);
    } else if (act === 'switch') {
      bState.menuOpen = true;
      bState.subMenu = 'switch';
    }
  }

  function battleThrowOrb(key, mult) {
    if (!bState || bState.busy || state.items[key] <= 0) return;
    bState.menuOpen = false;
    bState.subMenu = null;
    bState.busy = true;
    state.items[key]--;
    bState.msgText = I18N.t('battleThrowOrb', { orb: I18N.t(key) });
    schedBattle(() => {
      const chance = mult >= 99 ? 1.0 : nativeCatchChance(mult);
      if (Math.random() < chance) {
        bState.msgText = I18N.t('battleCaught', { name: I18N.pick(D.CRITTER_BY_ID[bState.wild.id].name) });
        schedBattle(() => finishNativeVictory(true), 600);
      } else {
        bState.msgText = I18N.t('battleBrokeFree', { name: I18N.pick(D.CRITTER_BY_ID[bState.wild.id].name) });
        schedBattle(() => nativeEnemyTurn(), 600);
      }
    }, 550);
  }

  function nativeEnemyTurn() {
    if (!bState) return;
    const mine = getActiveMine();
    const wCr = D.CRITTER_BY_ID[bState.wild.id];
    const { dmg } = BattleCore.calcEnemyDamage(bState.wild, mine, bState.shieldActive);
    if (bState.shieldActive) bState.shieldActive = false;
    mine.hp = Math.max(0, mine.hp - dmg);
    bState.msgText = I18N.t('battleUsedSkill', { a: I18N.pick(wCr.name), skill: I18N.pick(wCr.skill), dmg });
    schedBattle(() => {
      if (mine.hp <= 0) {
        const nextIdx = state.party.findIndex(x => x.hp > 0);
        if (nextIdx >= 0) {
          state.activePartnerIdx = nextIdx;
          bState.busy = false;
        } else {
          bState.msgText = I18N.t('battleAllFainted');
          schedBattle(() => endNativeBattle('fainted'), 650);
        }
      } else {
        bState.busy = false;
      }
    }, 600);
  }

  function finishNativeVictory(caught) {
    if (!bState || bState.victoryTriggered) return;
    bState.victoryTriggered = true;
    bState.busy = true;
    bState.menuOpen = false;
    bState.subMenu = null;
    const alreadyDefeated = bState.isBoss && (state.defeatedBosses.includes(bState.chapterId) || state.crests.includes(bState.chapterId));
    const hero = D.HERO_BY_ID[state.heroId];
    const expMult = (hero && hero.perk && hero.perk.expMult) ? hero.perk.expMult : 1;
    let goldMult = (hero && hero.perk && hero.perk.goldMult) ? hero.perk.goldMult : 1;
    if (state.tools.includes('magnet')) goldMult *= 1.35;
    const expGain = alreadyDefeated ? 0 : Math.round((16 + bState.wild.lv * 6) * (bState.isBoss ? 2.5 : 1) * expMult);
    const goldGain = alreadyDefeated ? 0 : Math.round((12 + bState.wild.lv * 4) * (bState.isBoss ? 3.5 : 1) * goldMult);
    state.gold += goldGain;
    const mine = getActiveMine();
    mine.exp += expGain;
    while (mine.exp >= mine.lv * 30 && mine.lv < 50) {
      mine.exp -= mine.lv * 30;
      mine.lv++;
      const nst = BattleCore.calcStats(mine.id, mine.lv, true, state);
      mine.maxHp = nst.maxHp;
      mine.hp = nst.maxHp;
    }
    bState.msgText = alreadyDefeated ? I18N.t('battleWinRematch') : I18N.t('battleWin', { exp: expGain, gold: goldGain });
    schedBattle(() => endNativeBattle(caught ? 'caught' : 'win'), 650);
  }

  function endNativeBattle(result) {
    if (!bState) return;
    const snap = bState;
    bState = null;
    clearBattleTimers();
    screen = 'world';
    if (result === 'fainted') {
      const ch = D.getChapter(currentChapterId);
      state.party.forEach(p => { p.hp = p.maxHp; });
      World.setActiveMap('overworld');
      player.x = player.tx = ch.healSpot.x;
      player.y = player.ty = ch.healSpot.y + 1;
      player.owX = player.x;
      player.owY = player.y;
      toast(I18N.t('battleAllFainted'));
    } else if (result === 'caught') {
      if (!state.caughtIds.includes(snap.wild.id)) state.caughtIds.push(snap.wild.id);
      const ex = state.party.find(p => p.id === snap.wild.id);
      if (!ex) {
        const st = BattleCore.calcStats(snap.wild.id, snap.wild.lv, true, state);
        state.party.push({ id: snap.wild.id, lv: snap.wild.lv, hp: st.maxHp, maxHp: st.maxHp, exp: 0 });
      }
      toast(I18N.t('battleCaught', { name: I18N.pick(D.CRITTER_BY_ID[snap.wild.id].name) }));
    }
    if ((result === 'win' || result === 'caught') && snap.isBoss) {
      const ch = D.getChapter(snap.chapterId);
      if (!state.defeatedBosses.includes(ch.id)) state.defeatedBosses.push(ch.id);
      if (!state.crests.includes(ch.id)) {
        state.crests.push(ch.id);
        toast(I18N.t('crestEarned', { name: ch.crest.emoji + ' ' + I18N.pick(ch.crest) }));
      }
    }
    updateChapterContext(true);
    saveState();
  }

  /* ---------------- Modals ---------------- */
  function openModal(type, arg) {
    modalType = type;
    modalArg = arg || null;
    if (type === 'store' && arg) storeTab = arg;
    modalScroll = 0;
    resetConfirm = false;
    screen = 'modal';
    AudioFX.sfx.open();
  }

  function closeModal() {
    modalType = null;
    modalArg = null;
    resetConfirm = false;
    screen = state ? 'world' : 'title';
  }

  /* ---------------- Canvas Drawing Primitives ---------------- */
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  function drawBtn(x, y, w, h, label, bg, fg, onClick, fontSize) {
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = `bold ${fontSize || 13}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2, w - 10);
    if (onClick) hitZones.push({ x, y, w, h, onClick });
  }

  function renderTitle() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, vw, vh);
    const pad = 16;
    const cardW = Math.min(vw - pad * 2, 420);
    const cardX = (vw - cardW) / 2;
    const cardY = Math.max(40, vh * 0.1);
    const cardH = Math.min(vh - cardY - 24, 540);
    ctx.fillStyle = '#fcf9f0';
    roundRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    drawBtn(cardX + cardW - 84, cardY + 12, 72, 30, '🌐 ' + I18N.t('langLabel'), '#1e293b', '#fff', () => {
      I18N.toggleLang();
    }, 12);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(I18N.t('gameTitle'), vw / 2, cardY + 66, cardW - 24);
    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(I18N.t('gameSubtitle'), vw / 2, cardY + 92, cardW - 24);

    let yCur = cardY + 116;
    const saved = Platform.loadSave();
    if (saved && Array.isArray(saved.party) && saved.party.length) {
      const cnt = Array.isArray(saved.caughtIds) ? saved.caughtIds.length : saved.party.length;
      drawBtn(cardX + 24, yCur, cardW - 48, 42, `▶ ${I18N.t('continueSave')} (${cnt}/${D.CRITTERS.length})`, '#16a34a', '#fff', () => {
        AudioFX.ensure();
        startGame(saved);
      }, 14);
      yCur += 54;
    }

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(I18N.t('pickStarter'), vw / 2, yCur + 12);
    yCur += 32;

    const starters = D.CRITTERS.filter(c => c.starter);
    const gap = 8;
    const cw = (cardW - 32 - gap * 2) / 3;
    starters.forEach((cr, idx) => {
      const sx = cardX + 16 + idx * (cw + gap);
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, sx, yCur, cw, 138, 14);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      Art.drawCritter(ctx, cr.id, sx + cw / 2, yCur + 48, Math.min(72, cw - 12), time + idx, false);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(I18N.pick(cr.name), sx + cw / 2, yCur + 100, cw - 6);
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.fillText(I18N.pick(cr.skill), sx + cw / 2, yCur + 120, cw - 6);
      hitZones.push({
        x: sx, y: yCur, w: cw, h: 138,
        onClick: () => { AudioFX.ensure(); AudioFX.sfx.unlock(); startGame(defaultState(cr.id)); },
      });
    });
  }

  function renderWorldAndHud() {
    const S = Math.max(32, Math.min(44, Math.round(Math.min(vw, vh) / 11)));
    const m = World.getMap();
    const camX = player.x * S - vw * 0.5 + S * 0.5;
    const camY = player.y * S - vh * 0.5 + S * 0.5;
    ctx.fillStyle = currentChapterId === 5 ? '#1b1440' : '#0f172a';
    ctx.fillRect(0, 0, vw, vh);

    const x0 = Math.max(0, Math.floor(camX / S) - 1);
    const y0 = Math.max(0, Math.floor(camY / S) - 1);
    const x1 = Math.min(m.w - 1, Math.ceil((camX + vw) / S) + 1);
    const y1 = Math.min(m.h - 1, Math.ceil((camY + vh) / S) + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        Art.drawTile(ctx, World.getT(m, x, y), World.getZ(m, x, y), m.decals[y * m.w + x], Math.floor(x * S - camX), Math.floor(y * S - camY), S, time, state.unlockedChapters);
      }
    }
    m.objects.forEach(o => {
      if (o.x + (o.w || 1) < x0 || o.x > x1 || o.y + (o.h || 1) < y0 || o.y > y1) return;
      Art.drawObject(ctx, o, Math.floor(o.x * S - camX), Math.floor(o.y * S - camY), S, time);
    });
    m.chests.forEach(ch => {
      if (ch.x < x0 || ch.x > x1 || ch.y < y0 || ch.y > y1) return;
      Art.drawChest(ctx, state.openedChests.includes(ch.id), Math.floor(ch.x * S - camX), Math.floor(ch.y * S - camY), S, time);
    });
    m.npcs.forEach(n => {
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) return;
      const hasGift = (n.gift && !state.claimedNpcs.includes(n.id)) || (n.questTool && !state.tools.includes(n.questTool));
      Art.drawNpc(ctx, n, Math.floor(n.x * S - camX), Math.floor(n.y * S - camY), S, time, hasGift);
    });
    if (m.boss) {
      Art.drawCritter(ctx, m.boss.critterId, m.boss.x * S - camX + S * 0.5, m.boss.y * S - camY + S * 0.45, S * 2, time, false);
    }
    const isSurfing = World.getT(m, Math.round(player.x), Math.round(player.y)) === World.T.SHALLOW;
    Art.drawHero(ctx, state.heroId, player.x * S - camX, player.y * S - camY, S, player.dir, player.walkPhase, time, state.tools, isSurfing);

    // Top HUD
    const topY = 12;
    const p = getActiveMine();
    const cr = D.CRITTER_BY_ID[p.id];
    ctx.fillStyle = 'rgba(252,249,240,0.95)';
    roundRect(ctx, 10, topY, 152, 46, 12);
    ctx.fill();
    Art.drawCritter(ctx, p.id, 32, topY + 24, 34, time, false);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${I18N.pick(cr.name)} Lv.${p.lv}`, 54, topY + 18, 102);
    ctx.fillStyle = '#475569';
    ctx.fillText(`HP ${p.hp}/${p.maxHp}`, 54, topY + 35, 102);
    hitZones.push({ x: 10, y: topY, w: 152, h: 46, onClick: () => openModal('party') });

    drawBtn(vw - 114, topY, 34, 34, I18N.t('langLabel'), 'rgba(15,23,42,0.82)', '#fff', () => I18N.toggleLang(), 12);
    drawBtn(vw - 76, topY, 32, 34, AudioFX.isMuted() ? '🔇' : '🔊', 'rgba(15,23,42,0.82)', '#fff', () => AudioFX.setMuted(!AudioFX.isMuted()), 13);
    drawBtn(vw - 40, topY, 32, 34, '⚙️', 'rgba(15,23,42,0.82)', '#fff', () => openModal('settings'), 13);

    // Chapter Banner
    const ch = D.getChapter(currentChapterId);
    const bannerTxt = m.isDungeon
      ? `🌀 ${I18N.pick(ch.dungeon.name)}`
      : `${ch.emoji} ${I18N.t('chapterPrefix', { n: ch.id })} · ${I18N.pick(ch.short)}`;
    ctx.fillStyle = 'rgba(15,23,42,0.78)';
    roundRect(ctx, vw / 2 - 110, topY + 54, 220, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#fef9c3';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(bannerTxt, vw / 2, topY + 67, 206);

    // Bottom Controls (D-Pad + 2x2 Menu + A/B)
    const botY = vh - 96;
    dpadRect = { cx: 52, cy: botY + 42, r: 42 };
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    ctx.beginPath(); ctx.arc(dpadRect.cx, dpadRect.cy, dpadRect.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();

    const menuX = 102;
    const menuW = Math.max(120, vw - 208);
    const mw = (menuW - 6) / 2;
    drawBtn(menuX, botY + 6, mw, 36, '🗺️ ' + I18N.t('worldMap'), '#fcf9f0', '#0f172a', () => openModal('map'), 12);
    drawBtn(menuX + mw + 6, botY + 6, mw, 36, '📖 ' + I18N.t('dex'), '#fcf9f0', '#0f172a', () => openModal('dex'), 12);
    drawBtn(menuX, botY + 48, mw, 36, '🎒 ' + I18N.t('bag'), '#fcf9f0', '#0f172a', () => openModal('bag'), 12);
    drawBtn(menuX + mw + 6, botY + 48, mw, 36, '🎬 ' + I18N.t('shop'), '#fde68a', '#78350f', () => openModal('store', 'chapters'), 12);

    drawBtn(vw - 98, botY + 34, 42, 42, 'B', '#d97706', '#fff', () => { dashHeld = !dashHeld; }, 14);
    drawBtn(vw - 52, botY + 24, 46, 46, 'A', '#16a34a', '#fff', () => interact(), 16);

    // Dialog Box
    if (dialog) {
      const dx = 12, dy = vh - 190, dw = vw - 24, dh = 84;
      ctx.fillStyle = '#fcf9f0';
      roundRect(ctx, dx, dy, dw, dh, 14);
      ctx.fill();
      ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${dialog.emoji} ${dialog.speaker}`, dx + 14, dy + 22, dw - 28);
      ctx.fillStyle = '#1e293b';
      ctx.font = '13px sans-serif';
      ctx.fillText(dialog.text, dx + 14, dy + 48, dw - 28);
      hitZones.push({ x: dx, y: dy, w: dw, h: dh, onClick: () => closeDialog(false) });
    }
  }

  function renderBattle() {
    if (!bState) return;
    const stageH = Math.floor(vh * 0.58);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, vw, vh);
    const g = ctx.createLinearGradient(0, 0, 0, stageH);
    g.addColorStop(0, '#7dd3fc');
    g.addColorStop(1, '#4ade80');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, stageH);

    const wCr = D.CRITTER_BY_ID[bState.wild.id];
    const mine = getActiveMine();
    const mCr = D.CRITTER_BY_ID[mine.id];
    Art.drawCritter(ctx, bState.wild.id, vw * 0.72, stageH * 0.42, 110, time, false);
    Art.drawCritter(ctx, mine.id, vw * 0.28, stageH * 0.74, 108, time + 1, true);

    // Wild & Mine Cards
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, 12, 16, 176, 56, 12); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${I18N.pick(wCr.name)} Lv.${bState.wild.lv}`, 22, 36, 156);
    ctx.fillStyle = '#475569'; ctx.font = '12px sans-serif';
    ctx.fillText(`HP ${bState.wild.hp}/${bState.wild.maxHp}`, 22, 56);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, vw - 188, stageH - 70, 176, 56, 12); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${I18N.pick(mCr.name)} Lv.${mine.lv}`, vw - 178, stageH - 50, 156);
    ctx.fillStyle = '#475569'; ctx.font = '12px sans-serif';
    ctx.fillText(`HP ${mine.hp}/${mine.maxHp}`, vw - 178, stageH - 30);

    // Panel
    ctx.fillStyle = '#fcf9f0';
    ctx.fillRect(0, stageH, vw, vh - stageH);
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(bState.msgText || '', 14, stageH + 26, vw - 28);

    const by = stageH + 46;
    const bw = (vw - 36) / 2;
    if (!bState.menuOpen) {
      drawBtn(12, by, bw, 56, I18N.t('attack'), '#dc2626', '#fff', () => battleAction('attack'), 14);
      drawBtn(24 + bw, by, bw, 56, I18N.t('catchBtn'), '#2563eb', '#fff', () => battleAction('catch'), 14);
      drawBtn(12, by + 66, bw, 56, I18N.t('feedBtn'), '#db2777', '#fff', () => battleAction('feed'), 14);
      drawBtn(24 + bw, by + 66, bw, 56, I18N.t('switchRun'), '#475569', '#fff', () => battleAction('switch'), 14);
    } else if (bState.subMenu === 'orb') {
      drawBtn(12, by, bw, 48, `🔵 ${I18N.t('orbs')} (${state.items.orbs})`, '#0284c7', '#fff', () => battleThrowOrb('orbs', 1.0), 12);
      drawBtn(24 + bw, by, bw, 48, `🌈 ${I18N.t('superOrbs')} (${state.items.superOrbs})`, '#db2777', '#fff', () => battleThrowOrb('superOrbs', 1.6), 12);
      drawBtn(12, by + 58, bw, 48, `👑 ${I18N.t('masterOrbs')} (${state.items.masterOrbs})`, '#d97706', '#fff', () => battleThrowOrb('masterOrbs', 99), 12);
      drawBtn(24 + bw, by + 58, bw, 48, I18N.t('close'), '#cbd5e1', '#0f172a', () => { bState.menuOpen = false; bState.subMenu = null; }, 13);
    } else if (bState.subMenu === 'switch') {
      drawBtn(12, by, vw - 24, 48, '🏃 ' + (I18N.getLang() === 'zh' ? '逃跑' : 'Run Away'), '#ef4444', '#fff', () => {
        bState.menuOpen = false; bState.subMenu = null;
        if (bState.isBoss) { bState.msgText = I18N.t('battleRunBoss'); return; }
        bState.busy = true;
        bState.msgText = I18N.t('battleRunOk');
        schedBattle(() => endNativeBattle('run'), 400);
      }, 13);
      drawBtn(12, by + 58, vw - 24, 48, I18N.t('close'), '#cbd5e1', '#0f172a', () => { bState.menuOpen = false; bState.subMenu = null; }, 13);
    }
  }

  function renderModal() {
    renderWorldAndHud();
    hitZones = []; // Lock underlying world taps while modal is open
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fillRect(0, 0, vw, vh);

    const mx = 12, my = 32, mw = vw - 24, mh = vh - 64;
    ctx.fillStyle = '#fcf9f0';
    roundRect(ctx, mx, my, mw, mh, 18);
    ctx.fill();

    drawBtn(mx + mw - 44, my + 10, 34, 34, '✕', '#e2e8f0', '#0f172a', closeModal, 15);
    drawBtn(mx + mw - 102, my + 10, 52, 34, I18N.t('langLabel'), '#1e293b', '#fff', () => I18N.toggleLang(), 12);

    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left';
    const title = modalType === 'store' ? I18N.t('storeTitle')
      : modalType === 'map' ? I18N.t('worldMap')
      : modalType === 'gate' ? I18N.t('gateLockedTitle')
      : modalType === 'dex' ? I18N.t('dex')
      : modalType === 'party' ? I18N.t('party')
      : modalType === 'bag' ? I18N.t('bag')
      : I18N.t('settingsTitle');
    ctx.fillText(title, mx + 14, my + 30, mw - 124);

    let y = my + 56;
    if (modalType === 'map') {
      if (!mapCanvas && typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') {
        mapCanvas = wx.createCanvas();
      }
      if (mapCanvas) {
        const pos = state.mapId === 'overworld' ? { x: Math.round(player.x), y: Math.round(player.y) } : { x: player.owX, y: player.owY };
        Art.renderWorldMapCanvas(mapCanvas, pos.x, pos.y, state);
        const drawH = Math.min(180, Math.round((mw - 24) * 0.72));
        if (typeof ctx.drawImage === 'function') ctx.drawImage(mapCanvas, mx + 12, y, mw - 24, drawH);
        y += drawH + 10;
      }
      D.CHAPTERS.forEach(ch => {
        const unlocked = state.unlockedChapters.includes(ch.id);
        const hasWings = state.tools.includes('wings');
        const label = `${ch.emoji} ${I18N.t('chapterPrefix', { n: ch.id })} ${I18N.pick(ch.short)}`;
        drawBtn(mx + 12, y, mw - 24, 42, unlocked ? (hasWings ? label + ' · 🪽' : label) : label + ' 🔒', unlocked ? '#dcfce7' : '#f1f5f9', '#0f172a', () => {
          if (!unlocked) { openModal('store', 'chapters'); return; }
          if (!hasWings) { toast(I18N.t('fastTravelLocked')); openModal('store', 'tools'); return; }
          World.setActiveMap('overworld');
          player.x = player.tx = ch.waystone.x;
          player.y = player.ty = ch.waystone.y + 1;
          player.owX = player.x; player.owY = player.y;
          closeModal();
          updateChapterContext(true);
          saveState();
        }, 12);
        y += 48;
      });
    } else if (modalType === 'gate') {
      const ch = D.getChapter(modalArg || 4);
      const prod = D.PRODUCT_BY_ID[ch.productId];
      const done = getEffectiveAdProgress(prod);
      ctx.fillStyle = '#1e293b'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${ch.emoji} ${I18N.pick(ch.name)}`, vw / 2, y + 24, mw - 24);
      ctx.font = '13px sans-serif';
      ctx.fillText(`🎬 ${done} / ${ch.adCost}`, vw / 2, y + 54);
      drawBtn(mx + 24, y + 78, mw - 48, 44, I18N.t('storeWatchAd', { done, cost: ch.adCost }), '#d97706', '#fff', () => triggerAdUnlock(prod), 13);
      drawBtn(mx + 24, y + 132, mw - 48, 44, I18N.t('storeTitle'), '#0284c7', '#fff', () => openModal('store', 'chapters'), 13);
    } else if (modalType === 'store') {
      const tabs = ['chapters', 'heroes', 'tools', 'items'];
      const tw = (mw - 24 - 12) / 4;
      tabs.forEach((tb, i) => {
        drawBtn(mx + 12 + i * (tw + 4), y, tw, 32, I18N.t('storeTab' + tb[0].toUpperCase() + tb.slice(1)), storeTab === tb ? '#1e293b' : '#e2e8f0', storeTab === tb ? '#fff' : '#0f172a', () => { storeTab = tb; }, 12);
      });
      y += 42;
      const list = storeTab === 'chapters' ? D.PRODUCTS.filter(p => p.category === 'chapters')
        : storeTab === 'heroes' ? D.PRODUCTS.filter(p => p.category === 'heroes')
        : storeTab === 'tools' ? D.PRODUCTS.filter(p => p.category === 'tools')
        : [D.PRODUCT_BY_ID.ad_supply_pack];
      list.slice(0, 6).forEach(p => {
        const owned = isProductOwned(p);
        const done = getEffectiveAdProgress(p);
        const btnTxt = owned ? '✅ ' + I18N.t('storeOwned') : (p.repeatable || p.adCost === 1 ? I18N.t('storeWatchAdSingle') : I18N.t('storeWatchAd', { done, cost: p.adCost }));
        drawBtn(mx + 12, y, mw - 24, 52, `${p.emoji} ${I18N.pick(p.name)} · ${btnTxt}`, owned ? '#dbeafe' : '#fef3c7', '#0f172a', owned ? null : () => triggerAdUnlock(p), 12);
        y += 60;
      });
    } else if (modalType === 'settings') {
      drawBtn(mx + 24, y + 12, mw - 48, 44, '🌐 ' + (I18N.getLang() === 'zh' ? 'Switch to English' : '切换为简体中文'), '#0284c7', '#fff', () => I18N.toggleLang(), 14);
      if (!resetConfirm) {
        drawBtn(mx + 24, y + 68, mw - 48, 44, '🗑️ ' + I18N.t('resetSave'), '#e2e8f0', '#0f172a', () => { resetConfirm = true; }, 14);
      } else {
        drawBtn(mx + 24, y + 68, mw - 48, 44, '⚠️ ' + I18N.t('resetConfirm'), '#dc2626', '#fff', () => {
          Platform.clearSave();
          AudioFX.stopBgm();
          state = null;
          resetConfirm = false;
          screen = 'title';
        }, 13);
        drawBtn(mx + 24, y + 122, mw - 48, 40, I18N.t('resetCancel'), '#e2e8f0', '#0f172a', () => { resetConfirm = false; }, 13);
      }
    } else if (modalType === 'party') {
      state.party.slice(0, 6).forEach((p, idx) => {
        const cr = D.CRITTER_BY_ID[p.id];
        const act = idx === state.activePartnerIdx;
        drawBtn(mx + 12, y, mw - 24, 46, `${act ? '⭐ ' : ''}${I18N.pick(cr.name)} Lv.${p.lv} (${p.hp}/${p.maxHp})`, act ? '#fef3c7' : '#fff', '#0f172a', () => {
          state.activePartnerIdx = idx;
          saveState();
        }, 13);
        y += 54;
      });
    } else if (modalType === 'bag') {
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`🪙 ${state.gold}  🔵 ${state.items.orbs}  🌈 ${state.items.superOrbs}  👑 ${state.items.masterOrbs}  🍓 ${state.items.treats}`, mx + 14, y + 16, mw - 28);
      y += 38;
      D.TOOLS.forEach(tl => {
        const owned = state.tools.includes(tl.id);
        drawBtn(mx + 12, y, mw - 24, 40, `${tl.emoji} ${I18N.pick(tl.name)} ${owned ? '✅' : '🔒'}`, owned ? '#dcfce7' : '#f1f5f9', '#0f172a', owned ? null : () => openModal('store', 'tools'), 12);
        y += 46;
      });
    } else if (modalType === 'dex') {
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${I18N.t('dex')}: ${state.caughtIds.length} / ${D.CRITTERS.length}`, mx + 14, y + 18);
    }
  }

  function renderToasts() {
    const tNow = nowMs();
    toasts = toasts.filter(t => t.expiresAt > tNow);
    toasts.forEach((t, i) => {
      const ty = 104 + i * 36;
      ctx.fillStyle = 'rgba(15,23,42,0.92)';
      roundRect(ctx, 20, ty, vw - 40, 30, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, vw / 2, ty + 15, vw - 56);
    });
  }

  function updateMovement() {
    if (screen !== 'world' || dialog || !state) return;
    if (!player.moving && dpadDir) tryStep(dpadDir);
    if (player.moving) {
      let speed = 0.12;
      if (dashHeld && state.tools.includes('boots')) speed *= 1.62;
      if (state.tools.includes('wings')) speed *= 1.18;
      const dx = player.tx - player.x, dy = player.ty - player.y;
      const dist = Math.hypot(dx, dy);
      player.walkPhase += speed * 2.2;
      if (dist <= speed) {
        player.x = player.tx;
        player.y = player.ty;
        player.moving = false;
        onStepComplete();
      } else {
        player.x += (dx / dist) * speed;
        player.y += (dy / dist) * speed;
      }
    }
  }

  function stepFrame() {
    time += 0.016;
    hitZones = [];
    updateMovement();
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    if (screen === 'title') renderTitle();
    else if (screen === 'world') renderWorldAndHud();
    else if (screen === 'battle') renderBattle();
    else if (screen === 'modal') renderModal();
    renderToasts();
    ctx.restore();
  }

  function handleTouchPoint(x, y, phase, touchId) {
    if (phase === 'start') {
      // Check D-pad first in world screen
      if (screen === 'world' && !dialog) {
        const dx = x - dpadRect.cx, dy = y - dpadRect.cy;
        if (Math.hypot(dx, dy) <= dpadRect.r + 14) {
          dpadTouchId = touchId;
          dpadDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          return;
        }
      }
      // Hit-test topmost interactive zone
      for (let i = hitZones.length - 1; i >= 0; i--) {
        const z = hitZones[i];
        if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
          if (z.onClick) z.onClick();
          return;
        }
      }
    } else if (phase === 'move' && touchId === dpadTouchId) {
      const dx = x - dpadRect.cx, dy = y - dpadRect.cy;
      if (Math.hypot(dx, dy) >= 8) {
        dpadDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
    } else if (phase === 'end' && touchId === dpadTouchId) {
      dpadTouchId = null;
      dpadDir = null;
    }
  }

  function boot() {
    I18N.init();
    AudioFX.init();
    World.init();
    Platform.initShareMenu(() => ({
      title: I18N.t('shareTitle', { caught: state && Array.isArray(state.caughtIds) ? state.caughtIds.length : 1 }),
      query: 'lang=' + I18N.getLang(),
    }));

    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    vw = (info && info.windowWidth) || 390;
    vh = (info && info.windowHeight) || 844;
    dpr = Math.min(2, (info && info.pixelRatio) || 1);

    canvas = wx.createCanvas();
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx = canvas.getContext('2d');

    if (typeof wx.onTouchStart === 'function') {
      wx.onTouchStart(e => {
        const t = e && e.changedTouches && e.changedTouches[0];
        if (t) handleTouchPoint(t.clientX, t.clientY, 'start', t.identifier);
      });
    }
    if (typeof wx.onTouchMove === 'function') {
      wx.onTouchMove(e => {
        const t = e && e.changedTouches && e.changedTouches[0];
        if (t) handleTouchPoint(t.clientX, t.clientY, 'move', t.identifier);
      });
    }
    if (typeof wx.onTouchEnd === 'function') {
      wx.onTouchEnd(e => {
        const t = e && e.changedTouches && e.changedTouches[0];
        if (t) handleTouchPoint(t.clientX, t.clientY, 'end', t.identifier);
      });
    }
    if (typeof wx.onTouchCancel === 'function') {
      wx.onTouchCancel(() => { dpadTouchId = null; dpadDir = null; });
    }

    booted = true;
    screen = 'title';
    stepFrame();
    if (typeof requestAnimationFrame === 'function') {
      const loop = () => {
        if (!booted) return;
        stepFrame();
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }
    return true;
  }

  function shutdown() {
    booted = false;
    clearBattleTimers();
    AudioFX.stopBgm();
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return {
    boot,
    shutdown,
    stepFrame,
    startGame,
    defaultState,
    sanitizeSave,
    tryStep,
    interact,
    startBattle,
    battleAction,
    battleThrowOrb,
    openModal,
    closeModal,
    triggerAdUnlock,
    handleTouchPoint,
    getScreen: () => screen,
    getState: () => state,
    getHitZones: () => hitZones,
    getToasts: () => toasts,
    getBattleState: () => bState,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = NativeApp;
