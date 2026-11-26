'use strict';
/* ==========================================================================
 * core.js — Pure Shared Game Logic (Zero DOM, Shared by Web & Native WeChat)
 *
 * Single source of truth for:
 *   - Default save creation & strict save-schema/coordinate sanitization
 *   - Ratio-preserving Hero swap HP calculation (no infinite heal exploit)
 *   - Bundle ownership (claimedBundles) & cross-credited chapter ad progress
 *   - Product grant application
 *   - Combat stat scaling, type/level-gap damage math, catch rate & boss rematch
 * ========================================================================== */
const GameCore = (() => {
  const getD = () => (typeof GameData !== 'undefined' ? GameData : globalThis.GameData);
  const getW = () => (typeof World !== 'undefined' ? World : globalThis.World);

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

  /**
   * Validates and sanitizes any loaded save object so corrupt fields or
   * out-of-chapter coordinates cannot soft-lock or bypass chapter gates.
   */
  function sanitizeSave(raw) {
    const D = getD();
    const W = getW();
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

    if (W && typeof W.getOverworld === 'function' && W.getOverworld()) {
      const ch1 = D.getChapter(1);
      const safeX = ch1.healSpot.x;
      const safeY = ch1.healSpot.y + 1;
      const ow = W.getOverworld();

      const owZone = W.getZ(ow, sanitized.owX, sanitized.owY);
      const prevMap = W.getMap();
      W.setActiveMap('overworld');
      if (!sanitized.unlockedChapters.includes(owZone) || !W.isWalkable(sanitized.owX, sanitized.owY, sanitized).ok) {
        sanitized.owX = safeX;
        sanitized.owY = safeY;
      }

      if (sanitized.mapId !== 'overworld') {
        const dun = W.getDungeon(sanitized.mapId);
        if (!dun || !sanitized.unlockedChapters.includes(dun.chapterId)) {
          sanitized.mapId = 'overworld';
          sanitized.x = safeX;
          sanitized.y = safeY;
        } else {
          W.setActiveMap(sanitized.mapId);
          if (!W.inb(dun, sanitized.x, sanitized.y) || !W.isWalkable(sanitized.x, sanitized.y, sanitized).ok) {
            sanitized.x = 11;
            sanitized.y = 13;
          }
        }
      } else {
        const curZone = W.getZ(ow, sanitized.x, sanitized.y);
        if (!sanitized.unlockedChapters.includes(curZone) || !W.isWalkable(sanitized.x, sanitized.y, sanitized).ok) {
          sanitized.x = safeX;
          sanitized.y = safeY;
        }
      }
      if (prevMap) W.setActiveMap(prevMap.id);
    }

    return sanitized;
  }

  /**
   * Preserves HP ratio across Hero swaps so toggling +HP Heroes cannot heal infinitely.
   */
  function syncPartyStats(state) {
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

  function getEffectiveAdProgress(prod, st) {
    if (!prod || prod.repeatable) return 0;
    const prog = (st && st.adProgress) || {};
    let total = prog[prod.id] || 0;
    if (Array.isArray(prod.creditFrom)) {
      prod.creditFrom.forEach(srcId => {
        total += (prog[srcId] || 0);
      });
    }
    return Math.min(prod.adCost || 1, total);
  }

  function isProductOwned(p, st) {
    if (!p || p.repeatable) return false;
    if (p.isBundle) {
      return Array.isArray(st.claimedBundles) && st.claimedBundles.includes(p.id);
    }
    const g = p.grants || {};
    const chOk = !g.chapters || g.chapters.every(cid => st.unlockedChapters.includes(cid));
    const heroOk = !g.heroes || g.heroes.every(hid => st.unlockedHeroes.includes(hid));
    const toolOk = !g.tools || g.tools.every(tid => st.tools.includes(tid));
    return chOk && heroOk && toolOk;
  }

  function applyProductGrants(prod, state) {
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
      syncPartyStats(state);
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

  /* ---------------- Shared Combat Math (Web + Native WeChat) ---------------- */
  function levelGapMult(atkLv, defLv) {
    const diff = (atkLv || 1) - (defLv || 1);
    return Math.max(0.78, Math.min(1.25, 1 + diff * 0.03));
  }

  function calcStats(critterId, lv, isPlayerTeam, stObj) {
    const D = getD();
    const base = D.CRITTER_BY_ID[critterId] || D.CRITTERS[0];
    let hpMult = 1, atkMult = 1;
    if (isPlayerTeam && stObj) {
      const hero = D.HERO_BY_ID[stObj.heroId];
      if (hero && hero.perk) {
        if (hero.perk.hpMult) hpMult *= hero.perk.hpMult;
        if (hero.perk.atkMult) atkMult *= hero.perk.atkMult;
      }
    }
    const maxHp = Math.round((base.hp + lv * 6) * hpMult);
    const atk = Math.round((base.atk + lv * 2.15) * atkMult);
    const spd = Math.round(base.spd + lv * 1.3);
    return { maxHp, atk, spd };
  }

  function calcPlayerDamage(mine, wildObj, stObj, rng) {
    const D = getD();
    const mCr = D.CRITTER_BY_ID[mine.id] || D.CRITTERS[0];
    const wCr = D.CRITTER_BY_ID[wildObj.id] || D.CRITTERS[0];
    const mst = calcStats(mine.id, mine.lv, true, stObj);
    let mult = D.typeMultiplier(mCr.elem, wCr.elem);
    const hero = stObj ? D.HERO_BY_ID[stObj.heroId] : null;
    if (hero && hero.perk && hero.perk.elemBonus && hero.perk.elemBonus.includes(mCr.elem)) {
      mult *= hero.perk.elemMult;
    }
    const gap = levelGapMult(mine.lv, wildObj.lv);
    const roll = 0.90 + (typeof rng === 'function' ? rng() : Math.random()) * 0.25;
    const dmg = Math.max(4, Math.round(mst.atk * mult * gap * roll));
    return { dmg, mult };
  }

  function calcEnemyDamage(wildObj, mine, shielded, rng) {
    const D = getD();
    const mCr = D.CRITTER_BY_ID[mine.id] || D.CRITTERS[0];
    const wCr = D.CRITTER_BY_ID[wildObj.id] || D.CRITTERS[0];
    const mult = D.typeMultiplier(wCr.elem, mCr.elem);
    const gap = levelGapMult(wildObj.lv, mine.lv);
    const roll = 0.72 + (typeof rng === 'function' ? rng() : Math.random()) * 0.20;
    let dmg = Math.max(3, Math.round(wildObj.atk * mult * gap * roll));
    if (shielded) dmg = Math.max(1, Math.round(dmg * 0.45));
    return { dmg, mult };
  }

  function calcCatchChance(wildObj, fedCount, state, orbMult) {
    const D = getD();
    const base = D.CRITTER_BY_ID[wildObj.id].catchBase;
    const hpRatio = Math.max(0, wildObj.hp / wildObj.maxHp);
    const hpBonus = (1 - hpRatio) * 0.42;
    const feedBonus = Math.min(0.45, (fedCount || 0) * 0.25);
    const hero = state ? D.HERO_BY_ID[state.heroId] : null;
    const heroBonus = (hero && hero.perk && hero.perk.catchBonus) ? hero.perk.catchBonus : 0;
    const toolBonus = state && state.tools && state.tools.includes('prismstaff') ? 0.25 : 0;
    const raw = (base + hpBonus + feedBonus + heroBonus + toolBonus) * (orbMult || 1);
    return Math.max(0.08, Math.min(0.98, raw));
  }

  function calcVictoryRewards(wildObj, isBoss, chapterId, state) {
    const D = getD();
    const hero = state ? D.HERO_BY_ID[state.heroId] : null;
    const expMult = (hero && hero.perk && hero.perk.expMult) ? hero.perk.expMult : 1;
    let goldMult = (hero && hero.perk && hero.perk.goldMult) ? hero.perk.goldMult : 1;
    if (state && state.tools && state.tools.includes('magnet')) goldMult *= 1.35;

    const alreadyDefeatedBoss = isBoss && state && (
      (Array.isArray(state.defeatedBosses) && state.defeatedBosses.includes(chapterId)) ||
      (Array.isArray(state.crests) && state.crests.includes(chapterId))
    );
    const expGain = alreadyDefeatedBoss ? 0 : Math.round((16 + wildObj.lv * 6) * (isBoss ? 2.5 : 1) * expMult);
    const goldGain = alreadyDefeatedBoss ? 0 : Math.round((12 + wildObj.lv * 4) * (isBoss ? 3.5 : 1) * goldMult);
    return { expGain, goldGain, rematch: !!alreadyDefeatedBoss };
  }

  function calcBossMultipliers(chapterId) {
    const table = {
      1: { hpMult: 1.15, atkMult: 1.00 },
      2: { hpMult: 1.28, atkMult: 1.06 },
      3: { hpMult: 1.42, atkMult: 1.12 },
      4: { hpMult: 1.92, atkMult: 1.33 },
      5: { hpMult: 1.92, atkMult: 1.32 },
    };
    return table[chapterId] || { hpMult: 1.25, atkMult: 1.05 };
  }

  function createWildUnit(critterId, lv, isBoss, chapterId) {
    const st = calcStats(critterId, lv, false, null);
    const bm = isBoss ? calcBossMultipliers(chapterId || 1) : { hpMult: 1.0, atkMult: 1.0 };
    const maxHp = Math.round(st.maxHp * bm.hpMult);
    return {
      id: critterId,
      lv,
      maxHp,
      hp: maxHp,
      atk: Math.round(st.atk * bm.atkMult),
      spd: st.spd,
    };
  }

  return {
    clampInt,
    uniqueValidArray,
    defaultState,
    sanitizeSave,
    syncPartyStats,
    getEffectiveAdProgress,
    isProductOwned,
    applyProductGrants,
    levelGapMult,
    calcStats,
    calcBossMultipliers,
    createWildUnit,
    calcPlayerDamage,
    calcEnemyDamage,
    calcCatchChance,
    calcVictoryRewards,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.GameCore = GameCore;
if (typeof module === 'object' && module.exports) module.exports = GameCore;
