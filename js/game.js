'use strict';
/* ==========================================================================
 * game.js — Web Main Loop, Smooth Tile Movement, Interactions, Dungeons,
 * Ambient Biome FX, Compass HUD, Save Schema Validation & Chapter Progression
 * ========================================================================== */
const Game = (() => {
  const getD = () => (typeof GameData !== 'undefined' ? GameData : globalThis.GameData);
  const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);

  let state = null;
  let running = false;
  let time = 0;

  // Player smooth position (in tile coordinates)
  const player = {
    x: 34, y: 92,
    tx: 34, ty: 92,
    moving: false,
    dir: 'down',
    walkPhase: 0,
    stepsSinceEncounter: 0,
    owX: 34, owY: 92,
  };

  // Input state
  const keys = {};
  let dpadDir = null;
  let dashHeld = false;
  let dialogOpen = false;
  let dialogOpenedAt = 0;
  let dialogCallback = null;
  let currentChapterId = 1;
  let particles = [];
  let ambient = [];
  let lastGateWarn = -9999;
  let lastCaughtSpec = null;

  function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function defaultState(starterId) {
    const D = getD();
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

  function uniqueValidArray(arr, validSet, maxLen) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length && out.length < (maxLen || 200); i++) {
      const v = arr[i];
      if ((!validSet || validSet.has(v)) && !out.includes(v)) out.push(v);
    }
    return out;
  }

  /**
   * Validates and sanitizes any loaded save object so corrupt fields or
   * out-of-chapter coordinates cannot soft-lock or bypass chapter gates.
   */
  function sanitizeSave(raw) {
    const D = getD();
    const base = defaultState('sproutling');
    if (!raw || typeof raw !== 'object') return base;

    const validChapters = new Set(D.CHAPTERS.map(c => c.id));
    const validHeroes = new Set(D.HEROES.map(h => h.id));
    const validTools = new Set(D.TOOLS.map(t => t.id));
    const validCritters = new Set(D.CRITTERS.map(c => c.id));
    const validBundles = new Set(D.PRODUCTS.filter(p => p.isBundle).map(p => p.id));

    const unlockedChapters = uniqueValidArray(raw.unlockedChapters, validChapters, 20);
    [1, 2, 3].forEach(c => { if (!unlockedChapters.includes(c)) unlockedChapters.push(c); });

    const unlockedHeroes = uniqueValidArray(raw.unlockedHeroes, validHeroes, 20);
    if (!unlockedHeroes.includes('ranger')) unlockedHeroes.unshift('ranger');
    const heroId = unlockedHeroes.includes(raw.heroId) ? raw.heroId : 'ranger';

    const tools = uniqueValidArray(raw.tools, validTools, 20);
    if (!tools.includes('boots')) tools.unshift('boots');

    const crests = uniqueValidArray(raw.crests, validChapters, 20);
    const defeatedBosses = uniqueValidArray(
      Array.isArray(raw.defeatedBosses) ? raw.defeatedBosses.concat(crests) : crests,
      validChapters,
      20
    );
    const claimedBundles = uniqueValidArray(raw.claimedBundles, validBundles, 20);

    const caughtIds = uniqueValidArray(raw.caughtIds, validCritters, 100);
    const rawParty = Array.isArray(raw.party) ? raw.party.slice(0, 25) : [];
    const party = [];
    for (let i = 0; i < rawParty.length; i++) {
      const p = rawParty[i];
      if (!p || typeof p !== 'object' || !validCritters.has(p.id)) continue;
      const lv = clampInt(p.lv, 1, 50, 5);
      const cr = D.CRITTER_BY_ID[p.id];
      const maxHp = Math.max(1, clampInt(p.maxHp, 1, 9999, cr.hp + lv * 6));
      const hp = clampInt(p.hp, 0, maxHp, maxHp);
      const exp = clampInt(p.exp, 0, 99999, 0);
      party.push({ id: p.id, lv, hp, maxHp, exp });
      if (!caughtIds.includes(p.id)) caughtIds.push(p.id);
    }
    if (party.length === 0) {
      party.push(base.party[0]);
      if (!caughtIds.includes(base.party[0].id)) caughtIds.push(base.party[0].id);
    }
    if (party.every(p => p.hp <= 0)) party[0].hp = party[0].maxHp;

    const activePartnerIdx = clampInt(raw.activePartnerIdx, 0, party.length - 1, 0);
    const rawItems = (raw.items && typeof raw.items === 'object') ? raw.items : {};
    const items = {
      orbs: clampInt(rawItems.orbs, 0, 999, 8),
      superOrbs: clampInt(rawItems.superOrbs, 0, 999, 2),
      masterOrbs: clampInt(rawItems.masterOrbs, 0, 999, 0),
      treats: clampInt(rawItems.treats, 0, 999, 5),
    };

    const adProgress = {};
    if (raw.adProgress && typeof raw.adProgress === 'object') {
      Object.keys(raw.adProgress).forEach(k => {
        if (D.PRODUCT_BY_ID[k]) {
          adProgress[k] = clampInt(raw.adProgress[k], 0, 20, 0);
        }
      });
    }

    const openedChests = uniqueValidArray(
      Array.isArray(raw.openedChests) ? raw.openedChests.filter(x => typeof x === 'string') : [],
      null,
      200
    );
    const claimedNpcs = uniqueValidArray(
      Array.isArray(raw.claimedNpcs) ? raw.claimedNpcs.filter(x => typeof x === 'string') : [],
      null,
      200
    );

    const sanitized = {
      version: 2,
      heroId,
      unlockedHeroes,
      unlockedChapters,
      crests,
      tools,
      gold: clampInt(raw.gold, 0, 999999, 80),
      items,
      party,
      activePartnerIdx,
      caughtIds,
      openedChests,
      claimedNpcs,
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

    // Validate mapId & coordinates against unlocked chapters and walkability
    if (typeof World !== 'undefined' && World.getOverworld && World.getOverworld()) {
      const ch1 = D.getChapter(1);
      const safeX = ch1.healSpot.x;
      const safeY = ch1.healSpot.y + 1;
      const ow = World.getOverworld();

      const owZone = World.getZ(ow, sanitized.owX, sanitized.owY);
      const prevMap = World.getMap();
      World.setActiveMap('overworld');
      if (!sanitized.unlockedChapters.includes(owZone) || !World.isWalkable(sanitized.owX, sanitized.owY, sanitized).ok) {
        sanitized.owX = safeX;
        sanitized.owY = safeY;
      }

      if (sanitized.mapId !== 'overworld') {
        const dun = World.getDungeon(sanitized.mapId);
        if (!dun || !sanitized.unlockedChapters.includes(dun.chapterId)) {
          sanitized.mapId = 'overworld';
          sanitized.x = safeX;
          sanitized.y = safeY;
        } else {
          World.setActiveMap(sanitized.mapId);
          if (!World.inb(dun, sanitized.x, sanitized.y) || !World.isWalkable(sanitized.x, sanitized.y, sanitized).ok) {
            sanitized.x = 11;
            sanitized.y = 13;
          }
        }
      } else {
        const curZone = World.getZ(ow, sanitized.x, sanitized.y);
        if (!sanitized.unlockedChapters.includes(curZone) || !World.isWalkable(sanitized.x, sanitized.y, sanitized).ok) {
          sanitized.x = safeX;
          sanitized.y = safeY;
        }
      }
      if (prevMap) World.setActiveMap(prevMap.id);
    }

    return sanitized;
  }

  function getState() { return state; }
  function getOverworldPos() {
    return state && state.mapId === 'overworld'
      ? { x: Math.round(player.x), y: Math.round(player.y) }
      : { x: player.owX, y: player.owY };
  }

  function getPlayerPos() {
    return { x: player.x, y: player.y, tx: player.tx, ty: player.ty, dir: player.dir, moving: player.moving };
  }

  /**
   * Preserves HP ratio across hero swaps so toggling +HP heroes cannot heal infinitely.
   */
  function syncPartyStats() {
    if (!state || !state.party) return;
    const D = getD();
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

  function snapshotState() {
    return state ? JSON.parse(JSON.stringify(state)) : null;
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    state = snap;
  }

  /* ---------------- Initialization & Title Screen ---------------- */
  function init() {
    I18N.init();
    AudioFX.init();
    Platform.initShareMenu(() => ({
      title: I18N.t('shareTitle', { caught: state && Array.isArray(state.caughtIds) ? state.caughtIds.length : 1 }),
      query: 'lang=' + I18N.getLang(),
    }));
    World.init();

    UI.bind({
      getState,
      getOverworldPos,
      warpToChapter,
      grantProduct,
      recordAdProgress,
      buyHeroWithGold,
      buyToolWithGold,
      buySupplyWithGold,
      equipHero,
      spendGold,
      toast,
      saveAndSync,
      syncPartyStats,
      refreshLabels,
      resetGame,
    });

    bindInputs();
    renderTitleScreen();
    initAmbient();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);
  }

  function renderTitleScreen() {
    const D = getD();
    const saved = Platform.loadSave();
    const starters = D.CRITTERS.filter(c => c.starter);
    const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    setTxt('titleMain', I18N.t('gameTitle'));
    setTxt('titleSub', I18N.t('gameSubtitle'));
    setTxt('titlePick', I18N.t('pickStarter'));
    setTxt('titleHint', I18N.t('titleHint'));
    setTxt('titleLangBtn', '🌐 ' + I18N.t('langLabel'));

    const contBtn = $('continueBtn');
    if (contBtn) {
      if (saved && Array.isArray(saved.party) && saved.party.length) {
        const caughtCount = Array.isArray(saved.caughtIds) ? saved.caughtIds.length : saved.party.length;
        const crestCount = Array.isArray(saved.crests) ? saved.crests.length : 0;
        contBtn.classList.remove('hidden');
        contBtn.textContent = `▶ ${I18N.t('continueSave')} (${caughtCount}/${D.CRITTERS.length} · 🏆${crestCount}/5)`;
        contBtn.onclick = () => {
          AudioFX.ensure();
          AudioFX.sfx.open();
          startGame(saved);
        };
      } else {
        contBtn.classList.add('hidden');
      }
    }

    const startersEl = $('starters');
    if (startersEl) {
      startersEl.innerHTML = starters.map(c => `
        <button class="starter-card" data-starter="${c.id}">
          <img src="${Art.getCritterPortrait(c.id)}" alt="">
          <b>${I18N.pick(c.name)}</b>
          <span class="elem-tag ${c.elem}">${I18N.t('elemNames')[c.elem]}</span>
          <small>${I18N.pick(c.skill)}</small>
        </button>`).join('');

      startersEl.querySelectorAll('[data-starter]').forEach(btn => {
        btn.onclick = () => {
          AudioFX.ensure();
          AudioFX.sfx.unlock();
          startGame(defaultState(btn.dataset.starter));
        };
      });
    }

    const titleLangBtn = $('titleLangBtn');
    if (titleLangBtn) {
      titleLangBtn.onclick = () => {
        I18N.toggleLang();
        renderTitleScreen();
      };
    }

    const titleEl = $('title');
    if (titleEl) titleEl.classList.remove('hidden');
  }

  function startGame(loadedState) {
    state = sanitizeSave(loadedState);
    syncPartyStats();

    World.setActiveMap(state.mapId || 'overworld');
    player.x = player.tx = state.x;
    player.y = player.ty = state.y;
    player.owX = state.owX;
    player.owY = state.owY;
    player.moving = false;

    const titleEl = $('title');
    if (titleEl) titleEl.classList.add('hidden');
    running = true;
    refreshLabels();
    saveAndSync();
    updateChapterContext(true);
  }

  /* ---------------- Save, HUD & Labels ---------------- */
  function saveAndSync() {
    if (!state) return false;
    state.mapId = World.getMap().id;
    state.x = Math.round(player.tx);
    state.y = Math.round(player.ty);
    state.owX = player.owX;
    state.owY = player.owY;
    const ok = Platform.writeSave(state);
    syncHud();
    return ok;
  }

  function syncHud() {
    if (!state) return;
    const D = getD();
    const p = state.party[state.activePartnerIdx] || state.party[0];
    const cr = D.CRITTER_BY_ID[p.id];
    const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };

    const pcImg = $('pcImg');
    if (pcImg) pcImg.src = Art.getCritterPortrait(p.id);
    setTxt('pcName', I18N.pick(cr.name));
    setTxt('pcLv', 'Lv.' + p.lv);
    const pcHp = $('pcHp');
    if (pcHp && pcHp.style) pcHp.style.width = Math.max(0, Math.round((p.hp / p.maxHp) * 100)) + '%';
    setTxt('pcHpTxt', `${p.hp}/${p.maxHp}`);

    setTxt('gold', state.gold);
    setTxt('orbs', state.items.orbs);
    setTxt('superOrbs', state.items.superOrbs);
    setTxt('masterOrbs', state.items.masterOrbs);
    setTxt('dexCount', `${state.caughtIds.length}/${D.CRITTERS.length}`);
    setTxt('muteBtn', AudioFX.isMuted() ? '🔇' : '🔊');
    setTxt('langBtn', I18N.t('langLabel'));

    const belt = $('toolBelt');
    if (belt) {
      belt.innerHTML = state.tools.map(tid => {
        const tl = D.TOOL_BY_ID[tid];
        return tl ? `<span class="tool-pill" title="${I18N.pick(tl.name)}">${tl.emoji}</span>` : '';
      }).join('');
    }

    updateCompass();
  }

  function refreshLabels() {
    const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    setTxt('mapLbl', I18N.t('worldMap'));
    setTxt('dexLbl', I18N.t('dex'));
    setTxt('bagLbl', I18N.t('bag'));
    setTxt('shopLbl', I18N.t('shop'));
    setTxt('btnBLabel', I18N.t('dash'));
    setTxt('btnALabel', I18N.t('interactShort'));
    syncHud();
    if (state) updateChapterContext(false);
    if (typeof Battle !== 'undefined' && Battle.isActive()) Battle.refreshLang();
    if (typeof UI !== 'undefined' && UI.refreshActiveModal) UI.refreshActiveModal();
    if (lastCaughtSpec) {
      const cele = $('celebrate');
      if (cele && !cele.classList.contains('hidden')) renderCelebrateOverlay(lastCaughtSpec.id, lastCaughtSpec.lv);
    }
  }

  function toast(msg) {
    const container = $('toasts');
    if (!container || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.classList.add('fade'), 2400);
    setTimeout(() => el.remove(), 2900);
  }

  function showDialog(speaker, emoji, text, onDone) {
    dialogOpen = true;
    dialogOpenedAt = nowMs();
    dialogCallback = onDone || null;
    const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    setTxt('dlgFace', emoji || '💬');
    setTxt('dlgName', speaker);
    setTxt('dlgText', text);
    const dlg = $('dialog');
    if (dlg) dlg.classList.remove('hidden');
  }

  function closeDialog(force) {
    if (!dialogOpen) return false;
    if (!force && nowMs() - dialogOpenedAt < 220) return false;
    dialogOpen = false;
    const dlg = $('dialog');
    if (dlg) dlg.classList.add('hidden');
    const cb = dialogCallback;
    dialogCallback = null;
    if (cb) cb();
    return true;
  }

  /* ---------------- Store Grants & Economy (With Save Rollback) ---------------- */
  function spendGold(amount) {
    if (state.gold < amount) {
      AudioFX.sfx.locked();
      toast(I18N.t('notEnoughGold'));
      return false;
    }
    state.gold -= amount;
    return true;
  }

  function buyHeroWithGold(hero) {
    if (!hero) return false;
    const snap = snapshotState();
    if (!spendGold(hero.goldPrice)) return false;
    if (!state.unlockedHeroes.includes(hero.id)) state.unlockedHeroes.push(hero.id);
    state.heroId = hero.id;
    syncPartyStats();
    if (!saveAndSync()) {
      restoreSnapshot(snap);
      syncHud();
      AudioFX.sfx.locked();
      toast(I18N.t('saveFailedToast'));
      return false;
    }
    AudioFX.sfx.unlock();
    toast(I18N.t('unlockedToast', { name: I18N.pick(hero.name) }));
    return true;
  }

  function equipHero(heroId) {
    const snap = snapshotState();
    state.heroId = heroId;
    syncPartyStats();
    if (!saveAndSync()) {
      restoreSnapshot(snap);
      syncHud();
      AudioFX.sfx.locked();
      toast(I18N.t('saveFailedToast'));
      return false;
    }
    AudioFX.sfx.tap();
    return true;
  }

  function buyToolWithGold(tl) {
    if (!tl) return false;
    const snap = snapshotState();
    if (!spendGold(tl.goldPrice)) return false;
    if (!state.tools.includes(tl.id)) state.tools.push(tl.id);
    if (!saveAndSync()) {
      restoreSnapshot(snap);
      syncHud();
      AudioFX.sfx.locked();
      toast(I18N.t('saveFailedToast'));
      return false;
    }
    AudioFX.sfx.unlock();
    toast(I18N.t('unlockedToast', { name: I18N.pick(tl.name) }));
    return true;
  }

  function buySupplyWithGold(sp) {
    if (!sp) return false;
    const snap = snapshotState();
    if (!spendGold(sp.price)) return false;
    state.items[sp.id] = (state.items[sp.id] || 0) + sp.amount;
    if (!saveAndSync()) {
      restoreSnapshot(snap);
      syncHud();
      AudioFX.sfx.locked();
      toast(I18N.t('saveFailedToast'));
      return false;
    }
    AudioFX.sfx.chest();
    toast(I18N.t('boughtToast', { name: I18N.pick(sp.name) }));
    return true;
  }

  function applyProductGrants(prod) {
    const g = prod.grants || {};
    if (g.chapters) {
      g.chapters.forEach(cid => {
        if (!state.unlockedChapters.includes(cid)) state.unlockedChapters.push(cid);
      });
    }
    if (g.heroes) {
      g.heroes.forEach(hid => {
        if (!state.unlockedHeroes.includes(hid)) state.unlockedHeroes.push(hid);
        state.heroId = hid;
      });
      syncPartyStats();
    }
    if (g.tools) {
      g.tools.forEach(tid => {
        if (!state.tools.includes(tid)) state.tools.push(tid);
      });
    }
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

  function grantProduct(prod) {
    const snap = snapshotState();
    applyProductGrants(prod);
    if (!saveAndSync()) {
      restoreSnapshot(snap);
      syncHud();
      AudioFX.sfx.locked();
      toast(I18N.t('saveFailedToast'));
      return false;
    }
    AudioFX.sfx.unlock();
    Platform.vibrateShort();
    toast(I18N.t('unlockedToast', { name: I18N.pick(prod.name) }));
    spawnBurst(player.x, player.y, '#fde047', 24);
    return true;
  }

  function recordAdProgress(prod) {
    const snap = snapshotState();
    state.adViewsTotal = (state.adViewsTotal || 0) + 1;
    if (prod.repeatable) {
      applyProductGrants(prod);
      if (!saveAndSync()) {
        restoreSnapshot(snap);
        syncHud();
        AudioFX.sfx.locked();
        toast(I18N.t('saveFailedToast'));
        return false;
      }
      AudioFX.sfx.unlock();
      Platform.vibrateShort();
      toast(I18N.t('unlockedToast', { name: I18N.pick(prod.name) }));
      spawnBurst(player.x, player.y, '#fde047', 24);
      return true;
    }

    state.adProgress = state.adProgress || {};
    state.adProgress[prod.id] = (state.adProgress[prod.id] || 0) + 1;
    const done = UI.getEffectiveAdProgress(prod, state);
    const unlockedNow = done >= (prod.adCost || 1);
    if (unlockedNow) applyProductGrants(prod);

    if (!saveAndSync()) {
      restoreSnapshot(snap);
      syncHud();
      AudioFX.sfx.locked();
      toast(I18N.t('saveFailedToast'));
      return false;
    }

    if (unlockedNow) {
      AudioFX.sfx.unlock();
      Platform.vibrateShort();
      toast(I18N.t('unlockedToast', { name: I18N.pick(prod.name) }));
      spawnBurst(player.x, player.y, '#fde047', 24);
    } else {
      AudioFX.sfx.tap();
      toast(I18N.t('adProgressToast', { done, cost: prod.adCost }));
    }
    return true;
  }

  /* ---------------- Chapter Detection, Fast Travel & Compass ---------------- */
  function updateChapterContext(playMusic) {
    const D = getD();
    const m = World.getMap();
    const chId = m.isDungeon ? m.chapterId : World.getZ(m, Math.round(player.x), Math.round(player.y));
    const ch = D.getChapter(chId);
    const changed = chId !== currentChapterId;
    currentChapterId = chId;

    const banner = $('chapterBanner');
    if (banner) {
      if (m.isDungeon) {
        banner.textContent = `🌀 ${I18N.pick(ch.dungeon.name)} · ${I18N.t('chapterPrefix', { n: ch.id })}`;
      } else {
        banner.textContent = `${ch.emoji} ${I18N.t('chapterPrefix', { n: ch.id })} · ${I18N.pick(ch.name)}`;
      }
    }
    if (playMusic || changed) {
      AudioFX.playBgm(m.isDungeon ? 'dungeon' : ch.bgm);
    }
  }

  function warpToChapter(chapterId) {
    const D = getD();
    if (!state.unlockedChapters.includes(chapterId)) {
      UI.openGateLockModal(chapterId);
      return false;
    }
    if (!state.tools.includes('wings')) {
      AudioFX.sfx.locked();
      toast(I18N.t('fastTravelLocked'));
      UI.openStore('tools');
      return false;
    }
    const ch = D.getChapter(chapterId);
    World.setActiveMap('overworld');
    player.x = player.tx = ch.waystone.x;
    player.y = player.ty = ch.waystone.y + 1;
    player.owX = player.x;
    player.owY = player.y;
    player.moving = false;
    AudioFX.sfx.warp();
    spawnBurst(player.x, player.y, '#38bdf8', 22);
    toast(I18N.t('fastTravelDone', { name: I18N.pick(ch.name) }));
    updateChapterContext(true);
    saveAndSync();
    return true;
  }

  function updateCompass() {
    const bar = $('compassBar');
    if (!bar) return;
    if (!state || !state.tools.includes('compass')) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    const m = World.getMap();
    let best = null, bestDist = Infinity;
    m.chests.forEach(c => {
      if (state.openedChests.includes(c.id)) return;
      if (!m.isDungeon && !state.unlockedChapters.includes(c.chapter)) return;
      const dist = Math.hypot(c.x - player.x, c.y - player.y);
      if (dist < bestDist) { bestDist = dist; best = { x: c.x, y: c.y, label: I18N.getLang() === 'zh' ? '宝箱' : 'Chest' }; }
    });
    if (!best) {
      bar.textContent = `🧭 ${I18N.t('compassNone')}`;
      return;
    }
    const dx = best.x - player.x, dy = best.y - player.y;
    const dirs = ['➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '⬆️', '↗️'];
    const idx = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    bar.textContent = `🧭 ${dirs[idx]} ${I18N.t('compassNearest', { target: best.label, dist: Math.round(bestDist) })}`;
  }

  /* ---------------- Movement & Interaction ---------------- */
  function getMoveInput() {
    if (dpadDir) return dpadDir;
    if (keys.ArrowUp || keys.KeyW) return 'up';
    if (keys.ArrowDown || keys.KeyS) return 'down';
    if (keys.ArrowLeft || keys.KeyA) return 'left';
    if (keys.ArrowRight || keys.KeyD) return 'right';
    return null;
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
        UI.openGateLockModal(check.chapter);
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
    updateCompass();

    const obj = World.hasObjAt(m, px, py);
    if (obj && obj.action === 'enter_dungeon') {
      player.owX = px;
      player.owY = py + 1;
      World.setActiveMap(obj.data.dungeonId);
      player.x = player.tx = 11;
      player.y = player.ty = 13;
      player.dir = 'up';
      AudioFX.sfx.warp();
      toast(`🌀 ${I18N.pick(obj.label)}`);
      updateChapterContext(true);
      saveAndSync();
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
      saveAndSync();
      return;
    }

    const tile = World.getT(m, px, py);
    if (tile === World.T.TALL) {
      player.stepsSinceEncounter++;
      if (player.stepsSinceEncounter >= 4 && Math.random() < 0.24) {
        player.stepsSinceEncounter = 0;
        triggerWildEncounter();
      }
    }
  }

  function isOverlayOpen() {
    const modal = $('modal');
    const cele = $('celebrate');
    return (modal && !modal.classList.contains('hidden')) || (cele && !cele.classList.contains('hidden'));
  }

  function interact() {
    if (dialogOpen) { closeDialog(false); return; }
    if (!running || Battle.isActive() || isOverlayOpen()) return;

    const D = getD();
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
        if (state.openedChests.includes(chest.id)) {
          toast(I18N.t('chestEmpty'));
          return;
        }
        state.openedChests.push(chest.id);
        const parts = [];
        const goldMult = state.tools.includes('magnet') ? 1.35 : 1;
        Object.keys(chest.loot).forEach(k => {
          let amt = chest.loot[k];
          if (k === 'gold') { amt = Math.round(amt * goldMult); state.gold += amt; parts.push(`${amt} 🪙`); }
          else {
            state.items[k] = (state.items[k] || 0) + amt;
            const ico = k === 'orbs' ? '🔵' : k === 'superOrbs' ? '🌈' : k === 'masterOrbs' ? '👑' : '🍓';
            parts.push(`${amt} ${ico}`);
          }
        });
        AudioFX.sfx.chest();
        Platform.vibrateShort();
        spawnBurst(tx, ty, '#facc15', 22);
        toast(I18N.t('chestFound', { loot: parts.join(' + ') }));
        saveAndSync();
        return;
      }

      const npc = World.hasNpcAt(m, tx, ty);
      if (npc) {
        AudioFX.sfx.tap();
        showDialog(I18N.pick(npc.name), '🗣️', I18N.pick(npc.lines), () => {
          if (npc.gift && !state.claimedNpcs.includes(npc.id)) {
            state.claimedNpcs.push(npc.id);
            const parts = [];
            Object.keys(npc.gift).forEach(k => {
              const amt = npc.gift[k];
              if (k === 'gold') { state.gold += amt; parts.push(`${amt} 🪙`); }
              else { state.items[k] = (state.items[k] || 0) + amt; parts.push(`${amt}×${k === 'orbs' ? '🔵' : k === 'superOrbs' ? '🌈' : k === 'masterOrbs' ? '👑' : '🍓'}`); }
            });
            AudioFX.sfx.chest();
            toast(`🎁 ${parts.join(' + ')}`);
            saveAndSync();
          }
          if (npc.questTool && !state.tools.includes(npc.questTool)) {
            state.tools.push(npc.questTool);
            const tl = D.TOOL_BY_ID[npc.questTool];
            AudioFX.sfx.unlock();
            toast(I18N.t('unlockedToast', { name: `${tl.emoji} ${I18N.pick(tl.name)}` }));
            saveAndSync();
          }
          if (npc.role === 'shop') UI.openStore('chapters');
          if (npc.role === 'gate4' && !state.unlockedChapters.includes(4)) UI.openGateLockModal(4);
          if (npc.role === 'gate5' && !state.unlockedChapters.includes(5)) UI.openGateLockModal(5);
        });
        return;
      }

      const obj = World.hasObjAt(m, tx, ty);
      if (obj && obj.action) {
        if (obj.action === 'heal') {
          state.party.forEach(p => { p.hp = p.maxHp; });
          AudioFX.sfx.heal();
          spawnBurst(player.x, player.y, '#38bdf8', 22);
          toast(I18N.t('healMsg'));
          saveAndSync();
          return;
        }
        if (obj.action === 'shop') { UI.openStore('chapters'); return; }
        if (obj.action === 'waystone') { UI.openWorldMap(); return; }
        if (obj.action === 'sign') { showDialog('🪧', '🪧', I18N.pick(obj.data.text)); return; }
      }

      const tile = World.getT(m, tx, ty);
      if (tile === World.T.GATE_CH4 && !state.unlockedChapters.includes(4)) { UI.openGateLockModal(4); return; }
      if (tile === World.T.GATE_CH5 && !state.unlockedChapters.includes(5)) { UI.openGateLockModal(5); return; }
    }
  }

  /* ---------------- Battles & Capture Celebration ---------------- */
  function triggerWildEncounter() {
    const D = getD();
    const m = World.getMap();
    const ch = D.getChapter(currentChapterId);
    const pool = m.isDungeon ? ch.dungeon.wildPool : ch.wildPool;
    const hasLantern = state.tools.includes('lantern');

    const weights = pool.map(id => {
      const r = D.CRITTER_BY_ID[id].rarity;
      if (r === 'epic') return hasLantern ? 2.4 : 1.0;
      if (r === 'rare') return hasLantern ? 2.8 : 1.4;
      return 2.4;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let pick = Math.random() * sum;
    let chosenId = pool[0];
    for (let i = 0; i < pool.length; i++) {
      pick -= weights[i];
      if (pick <= 0) { chosenId = pool[i]; break; }
    }
    const [minLv, maxLv] = ch.lvRange;
    const lv = minLv + Math.floor(Math.random() * (maxLv - minLv + 1)) + (m.isDungeon ? 2 : 0);
    startBattle(chosenId, lv, false, ch.id);
  }

  function startBattle(critterId, lv, isBoss, chId) {
    const D = getD();
    player.moving = false;
    Battle.start(state, critterId, lv, isBoss, chId, res => {
      if (res.result === 'fainted') {
        const ch = D.getChapter(currentChapterId);
        state.party.forEach(p => { p.hp = p.maxHp; });
        World.setActiveMap('overworld');
        player.x = player.tx = ch.healSpot.x;
        player.y = player.ty = ch.healSpot.y + 1;
        player.owX = player.x;
        player.owY = player.y;
        toast(I18N.t('battleAllFainted'));
      } else if (res.result === 'caught') {
        addCaughtCritter(res.critterId, res.lv);
      }
      if ((res.result === 'win' || res.result === 'caught') && res.isBoss) {
        const ch = D.getChapter(res.chapterId);
        state.defeatedBosses = state.defeatedBosses || [];
        if (!state.defeatedBosses.includes(ch.id)) state.defeatedBosses.push(ch.id);
        if (!state.crests.includes(ch.id)) {
          state.crests.push(ch.id);
          AudioFX.sfx.unlock();
          toast(I18N.t('crestEarned', { name: `${ch.crest.emoji} ${I18N.pick(ch.crest)}` }));
        }
      }
      updateChapterContext(true);
      saveAndSync();
    });
  }

  function renderCelebrateOverlay(critterId, lv) {
    const D = getD();
    const cr = D.CRITTER_BY_ID[critterId];
    if (!cr) return;
    const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    setTxt('celeTitle', I18N.t('gotchaTitle'));
    const img = $('celeImg');
    if (img) img.src = Art.getCritterPortrait(critterId);
    setTxt('celeName', `${I18N.pick(cr.name)} (Lv.${lv})`);
    setTxt('celeDesc', I18N.pick(cr.desc));
    setTxt('celeOk', I18N.t('gotchaOk'));
    setTxt('celePartner', I18N.t('gotchaPartner'));
  }

  function addCaughtCritter(critterId, lv) {
    if (!state.caughtIds.includes(critterId)) state.caughtIds.push(critterId);
    const existing = state.party.find(p => p.id === critterId);
    let newIdx = state.party.length;
    if (!existing) {
      const st = Battle.calcStats(critterId, lv, true, state);
      state.party.push({ id: critterId, lv, hp: st.maxHp, maxHp: st.maxHp, exp: 0 });
    } else {
      newIdx = state.party.indexOf(existing);
      existing.lv = Math.max(existing.lv, lv);
      const st = Battle.calcStats(critterId, existing.lv, true, state);
      existing.maxHp = st.maxHp;
      existing.hp = st.maxHp;
    }
    lastCaughtSpec = { id: critterId, lv };
    renderCelebrateOverlay(critterId, lv);
    const cele = $('celebrate');
    if (cele) cele.classList.remove('hidden');
    const okBtn = $('celeOk');
    if (okBtn) okBtn.onclick = () => { if (cele) cele.classList.add('hidden'); };
    const partnerBtn = $('celePartner');
    if (partnerBtn) {
      partnerBtn.onclick = () => {
        state.activePartnerIdx = newIdx;
        saveAndSync();
        if (cele) cele.classList.add('hidden');
      };
    }
  }

  /* ---------------- Particles & Ambient Weather ---------------- */
  function spawnBurst(tx, ty, color, n) {
    for (let i = 0; i < (n || 12); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.04 + Math.random() * 0.09;
      particles.push({ x: tx + 0.5, y: ty + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, r: 3 + Math.random() * 3 });
    }
  }

  function initAmbient() {
    ambient = [];
    for (let i = 0; i < 36; i++) {
      ambient.push({ x: Math.random(), y: Math.random(), sp: 0.08 + Math.random() * 0.16, ph: Math.random() * 6.28 });
    }
  }

  /* ---------------- Main 60fps Game & Render Loop ---------------- */
  function loop() {
    time += 0.016;
    if (running && !Battle.isActive() && !isOverlayOpen()) {
      updateMovement();
    }
    if (running && !Battle.isActive()) {
      renderWorld();
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);
  }

  function updateMovement() {
    if (dialogOpen) return;
    if (!player.moving) {
      const dir = getMoveInput();
      if (dir) tryStep(dir);
    }
    if (player.moving) {
      let speed = 0.11;
      const dashing = (dashHeld || keys.ShiftLeft || keys.ShiftRight || keys.KeyX) && state.tools.includes('boots');
      if (dashing) speed *= 1.62;
      if (state.tools.includes('wings')) speed *= 1.18;

      const dx = player.tx - player.x;
      const dy = player.ty - player.y;
      const dist = Math.hypot(dx, dy);
      player.walkPhase += speed * 2.2;
      if (dashing && Math.random() < 0.45) {
        particles.push({ x: player.x + 0.5, y: player.y + 0.8, vx: (Math.random() - 0.5) * 0.03, vy: -0.02, life: 0.7, color: '#86efac', r: 3 });
      }
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

  function renderWorld() {
    const cv = $('world');
    if (!cv || typeof cv.getContext !== 'function') return;
    const c = cv.getContext('2d');
    if (!c) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 800;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 600;
    if (cv.width !== vw * dpr || cv.height !== vh * dpr) {
      cv.width = vw * dpr; cv.height = vh * dpr;
    }

    const S = Math.max(32, Math.min(48, Math.round(Math.min(vw, vh) / 13)));
    const m = World.getMap();
    const camX = player.x * S - vw * 0.5 + S * 0.5;
    const camY = player.y * S - vh * 0.5 + S * 0.5;

    c.save();
    c.scale(dpr, dpr);
    c.fillStyle = currentChapterId === 5 ? '#1b1440' : '#0f172a';
    c.fillRect(0, 0, vw, vh);

    const x0 = Math.max(0, Math.floor(camX / S) - 1);
    const y0 = Math.max(0, Math.floor(camY / S) - 1);
    const x1 = Math.min(m.w - 1, Math.ceil((camX + vw) / S) + 1);
    const y1 = Math.min(m.h - 1, Math.ceil((camY + vh) / S) + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = Math.floor(x * S - camX);
        const py = Math.floor(y * S - camY);
        Art.drawTile(c, World.getT(m, x, y), World.getZ(m, x, y), m.decals[y * m.w + x], px, py, S, time, state.unlockedChapters);
      }
    }

    m.objects.forEach(o => {
      if (o.x + (o.w || 1) < x0 || o.x > x1 || o.y + (o.h || 1) < y0 || o.y > y1) return;
      Art.drawObject(c, o, Math.floor(o.x * S - camX), Math.floor(o.y * S - camY), S, time);
    });

    m.chests.forEach(ch => {
      if (ch.x < x0 || ch.x > x1 || ch.y < y0 || ch.y > y1) return;
      Art.drawChest(c, state.openedChests.includes(ch.id), Math.floor(ch.x * S - camX), Math.floor(ch.y * S - camY), S, time);
    });

    m.npcs.forEach(n => {
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) return;
      const hasGift = (n.gift && !state.claimedNpcs.includes(n.id)) || (n.questTool && !state.tools.includes(n.questTool));
      Art.drawNpc(c, n, Math.floor(n.x * S - camX), Math.floor(n.y * S - camY), S, time, hasGift);
    });

    if (m.boss) {
      const bx = m.boss.x * S - camX + S * 0.5;
      const by = m.boss.y * S - camY + S * 0.45;
      Art.drawCritter(c, m.boss.critterId, bx, by, S * 2.1, time, false);
    }

    const curTile = World.getT(m, Math.round(player.x), Math.round(player.y));
    const isSurfing = curTile === World.T.SHALLOW;
    Art.drawHero(c, state.heroId, player.x * S - camX, player.y * S - camY, S, player.dir, player.walkPhase, time, state.tools, isSurfing);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      c.globalAlpha = p.life;
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x * S - camX, p.y * S - camY, p.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    if (!m.isDungeon && (currentChapterId === 1 || currentChapterId === 4 || currentChapterId === 5)) {
      const col = currentChapterId === 4 ? 'rgba(255,255,255,0.85)' : currentChapterId === 5 ? 'rgba(254,240,138,0.8)' : 'rgba(255,220,235,0.75)';
      c.fillStyle = col;
      ambient.forEach(a => {
        a.y = (a.y + a.sp * 0.008) % 1;
        const ax = ((a.x + Math.sin(time + a.ph) * 0.02 + 1) % 1) * vw;
        const ay = a.y * vh;
        c.beginPath(); c.arc(ax, ay, currentChapterId === 4 ? 3 : 2.3, 0, Math.PI * 2); c.fill();
      });
    }

    c.restore();
  }

  /* ---------------- Input Binding (Keyboard + Touch D-Pad + Buttons) ---------------- */
  function bindInputs() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (running && !dialogOpen && !Battle.isActive() && !isOverlayOpen() && !player.moving) {
        const keyDir = e.code === 'ArrowUp' || e.code === 'KeyW' ? 'up'
          : e.code === 'ArrowDown' || e.code === 'KeyS' ? 'down'
          : e.code === 'ArrowLeft' || e.code === 'KeyA' ? 'left'
          : e.code === 'ArrowRight' || e.code === 'KeyD' ? 'right' : null;
        if (keyDir) tryStep(keyDir);
      }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') {
        if (dialogOpen) {
          e.preventDefault();
          closeDialog(false); // Debounced (220ms) so double-Space never skips dialogs
        } else if (running && !Battle.isActive() && !isOverlayOpen()) {
          e.preventDefault();
          interact();
        }
      }
      if (e.code === 'Escape') {
        if (dialogOpen) closeDialog(true);
        else UI.closeModal();
      }
      if (Battle.isActive() && !Battle.isMenuOpen() && !Battle.isBusy()) {
        if (e.key === '1') Battle.handleAction('attack');
        if (e.key === '2') Battle.handleAction('catch');
        if (e.key === '3') Battle.handleAction('feed');
        if (e.key === '4') Battle.handleAction('switch');
      }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    const dpad = $('dpad');
    if (dpad) {
      const calcDpad = e => {
        const rect = dpad.getBoundingClientRect();
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - (rect.left + rect.width / 2);
        const dy = pt.clientY - (rect.top + rect.height / 2);
        if (Math.hypot(dx, dy) < 10) { dpadDir = null; return; }
        dpadDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      };
      let dpadDown = false;
      dpad.addEventListener('pointerdown', e => { e.preventDefault(); AudioFX.ensure(); dpadDown = true; if (dpad.setPointerCapture) dpad.setPointerCapture(e.pointerId); calcDpad(e); });
      dpad.addEventListener('pointermove', e => { if (dpadDown) calcDpad(e); });
      const stopDpad = () => { dpadDown = false; dpadDir = null; };
      dpad.addEventListener('pointerup', stopDpad);
      dpad.addEventListener('pointercancel', stopDpad);
    }

    const btnA = $('btnA');
    if (btnA) btnA.addEventListener('pointerdown', e => { e.preventDefault(); AudioFX.ensure(); interact(); });
    const btnB = $('btnB');
    if (btnB) {
      btnB.addEventListener('pointerdown', e => { e.preventDefault(); AudioFX.ensure(); dashHeld = true; });
      const stopB = () => { dashHeld = false; };
      btnB.addEventListener('pointerup', stopB);
      btnB.addEventListener('pointerleave', stopB);
      btnB.addEventListener('pointercancel', stopB);
    }

    const dlg = $('dialog');
    if (dlg) dlg.addEventListener('click', () => closeDialog(false));

    const bindClick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    bindClick('partnerCard', () => UI.openParty());
    bindClick('mapBtn', () => UI.openWorldMap());
    bindClick('dexBtn', () => UI.openDex());
    bindClick('bagBtn', () => UI.openBag());
    bindClick('shopBtn', () => UI.openStore('chapters'));
    bindClick('menuBtn', () => UI.openSettings());
    bindClick('langBtn', () => { I18N.toggleLang(); refreshLabels(); });
    bindClick('bLangBtn', () => { I18N.toggleLang(); refreshLabels(); });
    bindClick('muteBtn', () => { AudioFX.setMuted(!AudioFX.isMuted()); syncHud(); });

    const bActions = $('bActions');
    if (bActions) {
      bActions.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = () => Battle.handleAction(btn.dataset.act);
      });
    }
  }

  function resetGame() {
    Platform.clearSave();
    AudioFX.stopBgm();
    running = false;
    state = null;
    renderTitleScreen();
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', init);
  }

  return {
    init,
    startGame,
    defaultState,
    sanitizeSave,
    getState,
    getPlayerPos,
    getOverworldPos,
    warpToChapter,
    startBattle,
    syncPartyStats,
    recordAdProgress,
    grantProduct,
    buyHeroWithGold,
    buyToolWithGold,
    buySupplyWithGold,
    equipHero,
    saveAndSync,
    refreshLabels,
    interact,
    tryStep,
    showDialog,
    closeDialog,
    resetGame,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.Game = Game;
if (typeof module === 'object' && module.exports) module.exports = Game;
