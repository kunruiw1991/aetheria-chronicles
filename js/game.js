'use strict';
/* ==========================================================================
 * game.js — Main Loop, Smooth Tile Movement, Interactions, Dungeons,
 * Ambient Biome FX, Compass HUD, Save/Load & Chapter Progression
 * ========================================================================== */
const Game = (() => {
  const D = GameData;
  const $ = id => document.getElementById(id);

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
    owX: 34, owY: 92, // Remembered overworld position while inside dungeon
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

  function defaultState(starterId) {
    const cr = D.CRITTER_BY_ID[starterId] || D.CRITTERS[0];
    const lv = 5;
    const maxHp = cr.hp + lv * 6;
    return {
      version: 1,
      heroId: 'ranger',
      unlockedHeroes: ['ranger'],
      unlockedChapters: [1, 2, 3], // First THREE chapters completely FREE!
      crests: [],
      tools: ['boots'], // Free Windstep Boots in Chapter 1
      gold: 80,
      items: { orbs: 8, superOrbs: 2, masterOrbs: 0, treats: 5 },
      party: [{ id: cr.id, lv, hp: maxHp, maxHp, exp: 0 }],
      activePartnerIdx: 0,
      caughtIds: [cr.id],
      openedChests: [],
      claimedNpcs: [],
      defeatedBosses: [],
      adProgress: {},
      adViewsTotal: 0,
      mapId: 'overworld',
      x: 34, y: 92,
      owX: 34, owY: 92,
    };
  }

  function getState() { return state; }
  function getOverworldPos() {
    return state && state.mapId === 'overworld'
      ? { x: Math.round(player.x), y: Math.round(player.y) }
      : { x: player.owX, y: player.owY };
  }

  function syncPartyStats() {
    if (!state || !state.party) return;
    const hero = D.HERO_BY_ID[state.heroId];
    const hpMult = (hero && hero.perk && hero.perk.hpMult) ? hero.perk.hpMult : 1;
    state.party.forEach(p => {
      const base = D.CRITTER_BY_ID[p.id] || D.CRITTERS[0];
      const newMax = Math.round((base.hp + p.lv * 6) * hpMult);
      const diff = newMax - (p.maxHp || newMax);
      p.maxHp = newMax;
      p.hp = Math.max(1, Math.min(newMax, p.hp + Math.max(0, diff)));
    });
  }

  /* ---------------- Initialization & Title Screen ---------------- */
  function init() {
    I18N.init();
    AudioFX.init();
    Platform.initShareMenu();
    World.init();

    UI.bind({
      getState,
      getOverworldPos,
      warpToChapter,
      grantProduct,
      recordAdProgress,
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
    requestAnimationFrame(loop);
  }

  function renderTitleScreen() {
    const saved = Platform.loadSave();
    const starters = D.CRITTERS.filter(c => c.starter);
    $('titleMain').textContent = I18N.t('gameTitle');
    $('titleSub').textContent = I18N.t('gameSubtitle');
    $('titlePick').textContent = I18N.t('pickStarter');
    $('titleHint').textContent = I18N.t('titleHint');
    $('titleLangBtn').textContent = '🌐 ' + I18N.t('langLabel');

    const contBtn = $('continueBtn');
    if (saved && saved.party && saved.party.length) {
      contBtn.classList.remove('hidden');
      contBtn.textContent = `▶ ${I18N.t('continueSave')} (${saved.caughtIds.length}/${D.CRITTERS.length} · 🏆${(saved.crests || []).length}/5)`;
      contBtn.onclick = () => {
        AudioFX.ensure();
        AudioFX.sfx.open();
        startGame(saved);
      };
    } else {
      contBtn.classList.add('hidden');
    }

    $('starters').innerHTML = starters.map(c => `
      <button class="starter-card" data-starter="${c.id}">
        <img src="${Art.getCritterPortrait(c.id)}" alt="">
        <b>${I18N.pick(c.name)}</b>
        <span class="elem-tag ${c.elem}">${I18N.t('elemNames')[c.elem]}</span>
        <small>${I18N.pick(c.skill)}</small>
      </button>`).join('');

    $('starters').querySelectorAll('[data-starter]').forEach(btn => {
      btn.onclick = () => {
        AudioFX.ensure();
        AudioFX.sfx.unlock();
        startGame(defaultState(btn.dataset.starter));
      };
    });

    $('titleLangBtn').onclick = () => {
      I18N.toggleLang();
      renderTitleScreen();
    };

    $('title').classList.remove('hidden');
  }

  function startGame(loadedState) {
    state = loadedState;
    state.unlockedChapters = state.unlockedChapters || [1, 2, 3];
    state.unlockedHeroes = state.unlockedHeroes || ['ranger'];
    state.tools = state.tools || ['boots'];
    state.crests = state.crests || [];
    state.openedChests = state.openedChests || [];
    state.claimedNpcs = state.claimedNpcs || [];
    state.defeatedBosses = state.defeatedBosses || [];
    state.adProgress = state.adProgress || {};
    state.adViewsTotal = state.adViewsTotal || 0;
    syncPartyStats();

    World.setActiveMap(state.mapId || 'overworld');
    player.x = player.tx = state.x || 34;
    player.y = player.ty = state.y || 92;
    player.owX = state.owX || 34;
    player.owY = state.owY || 92;
    player.moving = false;

    $('title').classList.add('hidden');
    running = true;
    refreshLabels();
    saveAndSync();
    updateChapterContext(true);
  }

  /* ---------------- Save, HUD & Labels ---------------- */
  function saveAndSync() {
    if (!state) return;
    state.mapId = World.getMap().id;
    state.x = Math.round(player.tx);
    state.y = Math.round(player.ty);
    state.owX = player.owX;
    state.owY = player.owY;
    Platform.writeSave(state);
    syncHud();
  }

  function syncHud() {
    if (!state) return;
    const p = state.party[state.activePartnerIdx] || state.party[0];
    const cr = D.CRITTER_BY_ID[p.id];
    $('pcImg').src = Art.getCritterPortrait(p.id);
    $('pcName').textContent = I18N.pick(cr.name);
    $('pcLv').textContent = 'Lv.' + p.lv;
    $('pcHp').style.width = Math.max(0, Math.round((p.hp / p.maxHp) * 100)) + '%';
    $('pcHpTxt').textContent = `${p.hp}/${p.maxHp}`;

    $('gold').textContent = state.gold;
    $('orbs').textContent = state.items.orbs;
    $('superOrbs').textContent = state.items.superOrbs;
    $('masterOrbs').textContent = state.items.masterOrbs;
    $('dexCount').textContent = `${state.caughtIds.length}/${D.CRITTERS.length}`;
    $('muteBtn').textContent = AudioFX.isMuted() ? '🔇' : '🔊';
    $('langBtn').textContent = I18N.t('langLabel');

    // Fancy Tool Belt quick badges
    const belt = $('toolBelt');
    belt.innerHTML = state.tools.map(tid => {
      const tl = D.TOOL_BY_ID[tid];
      return tl ? `<span class="tool-pill" title="${I18N.pick(tl.name)}">${tl.emoji}</span>` : '';
    }).join('');

    updateCompass();
  }

  function refreshLabels() {
    $('mapLbl').textContent = I18N.t('worldMap');
    $('dexLbl').textContent = I18N.t('dex');
    $('bagLbl').textContent = I18N.t('bag');
    $('shopLbl').textContent = I18N.t('shop');
    $('btnBLabel').textContent = I18N.t('dash');
    $('btnALabel').textContent = I18N.t('interactShort');
    syncHud();
    updateChapterContext(false);
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('fade'), 2400);
    setTimeout(() => el.remove(), 2900);
  }

  function showDialog(speaker, emoji, text, onDone) {
    dialogOpen = true;
    dialogOpenedAt = performance.now();
    dialogCallback = onDone || null;
    $('dlgFace').textContent = emoji || '💬';
    $('dlgName').textContent = speaker;
    $('dlgText').textContent = text;
    $('dialog').classList.remove('hidden');
  }

  function closeDialog(force) {
    if (!dialogOpen) return;
    if (!force && performance.now() - dialogOpenedAt < 220) return;
    dialogOpen = false;
    $('dialog').classList.add('hidden');
    const cb = dialogCallback;
    dialogCallback = null;
    if (cb) cb();
  }

  /* ---------------- Store Grants & Economy ---------------- */
  function spendGold(amount) {
    if (state.gold < amount) {
      AudioFX.sfx.locked();
      toast(I18N.t('notEnoughGold'));
      return false;
    }
    state.gold -= amount;
    return true;
  }

  function grantProduct(prod) {
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
    AudioFX.sfx.unlock();
    Platform.vibrateShort();
    toast(I18N.t('unlockedToast', { name: I18N.pick(prod.name) }));
    spawnBurst(player.x, player.y, '#fde047', 24);
    saveAndSync();
  }

  function recordAdProgress(prod) {
    state.adViewsTotal = (state.adViewsTotal || 0) + 1;
    if (prod.repeatable) {
      grantProduct(prod);
      return;
    }
    state.adProgress = state.adProgress || {};
    const done = (state.adProgress[prod.id] || 0) + 1;
    state.adProgress[prod.id] = done;
    if (done >= (prod.adCost || 1)) {
      grantProduct(prod);
    } else {
      AudioFX.sfx.tap();
      toast(I18N.t('adProgressToast', { done, cost: prod.adCost }));
      saveAndSync();
    }
  }

  /* ---------------- Chapter Detection, Fast Travel & Compass ---------------- */
  function updateChapterContext(playMusic) {
    const m = World.getMap();
    const chId = m.isDungeon ? m.chapterId : World.getZ(m, Math.round(player.x), Math.round(player.y));
    const ch = D.getChapter(chId);
    const changed = chId !== currentChapterId;
    currentChapterId = chId;

    const banner = $('chapterBanner');
    if (m.isDungeon) {
      banner.textContent = `🌀 ${I18N.pick(ch.dungeon.name)} · ${I18N.t('chapterPrefix', { n: ch.id })}`;
    } else {
      banner.textContent = `${ch.emoji} ${I18N.t('chapterPrefix', { n: ch.id })} · ${I18N.pick(ch.name)}`;
    }
    if (playMusic || changed) {
      AudioFX.playBgm(m.isDungeon ? 'dungeon' : ch.bgm);
    }
  }

  function warpToChapter(chapterId) {
    if (!state.unlockedChapters.includes(chapterId)) {
      UI.openGateLockModal(chapterId);
      return;
    }
    if (!state.tools.includes('wings')) {
      AudioFX.sfx.locked();
      toast(I18N.t('fastTravelLocked'));
      UI.openStore('tools');
      return;
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
  }

  function updateCompass() {
    const bar = $('compassBar');
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
      if (check.reason === 'gate' && performance.now() - lastGateWarn > 1400) {
        lastGateWarn = performance.now();
        AudioFX.sfx.locked();
        UI.openGateLockModal(check.chapter);
      } else if (check.reason === 'water' && performance.now() - lastGateWarn > 2200) {
        lastGateWarn = performance.now();
        toast(I18N.t('waterBlocked'));
      }
      return;
    }
    player.tx = nx;
    player.ty = ny;
    player.moving = true;
    AudioFX.sfx.step();
  }

  function onStepComplete() {
    const m = World.getMap();
    const px = Math.round(player.x), py = Math.round(player.y);
    updateChapterContext(false);
    updateCompass();

    // Check Portal / Dungeon Entrance / Exit Mat
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

    // Check Wild Encounter in Tall Grass
    const tile = World.getT(m, px, py);
    if (tile === World.T.TALL) {
      player.stepsSinceEncounter++;
      if (player.stepsSinceEncounter >= 4 && Math.random() < 0.24) {
        player.stepsSinceEncounter = 0;
        triggerWildEncounter();
      }
    }
  }

  function interact() {
    if (dialogOpen) { closeDialog(false); return; }
    if (!running || Battle.isActive() || !$('modal').classList.contains('hidden') || !$('celebrate').classList.contains('hidden')) return;

    const m = World.getMap();
    const px = Math.round(player.x), py = Math.round(player.y);
    const [dx, dy] = dirDelta(player.dir);
    const targets = [[px + dx, py + dy], [px, py]];

    for (let i = 0; i < targets.length; i++) {
      const [tx, ty] = targets[i];

      // 1. Standing Guardian Boss in Dungeon
      if (m.boss && m.boss.x === tx && m.boss.y === ty) {
        const cr = D.CRITTER_BY_ID[m.boss.critterId];
        showDialog(I18N.pick(cr.name), '👑', I18N.pick(cr.desc), () => {
          startBattle(m.boss.critterId, m.boss.lv, true, m.boss.chapter);
        });
        return;
      }

      // 2. Treasure Chest
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

      // 3. NPC
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

      // 4. Interactive Object (Fountain, Shop House, Waystone, Sign, Portal)
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

      // 5. Locked Chapter Gate
      const tile = World.getT(m, tx, ty);
      if (tile === World.T.GATE_CH4 && !state.unlockedChapters.includes(4)) { UI.openGateLockModal(4); return; }
      if (tile === World.T.GATE_CH5 && !state.unlockedChapters.includes(5)) { UI.openGateLockModal(5); return; }
    }
  }

  /* ---------------- Battles & Capture Celebration ---------------- */
  function triggerWildEncounter() {
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
    player.moving = false;
    Battle.start(state, critterId, lv, isBoss, chId, res => {
      if (res.result === 'fainted') {
        const ch = D.getChapter(currentChapterId);
        state.party.forEach(p => { p.hp = p.maxHp; });
        World.setActiveMap('overworld');
        player.x = player.tx = ch.healSpot.x;
        player.y = player.ty = ch.healSpot.y + 1;
        toast(I18N.t('battleAllFainted'));
      } else if (res.result === 'caught') {
        addCaughtCritter(res.critterId, res.lv);
      }
      if ((res.result === 'win' || res.result === 'caught') && res.isBoss) {
        const ch = D.getChapter(res.chapterId);
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

  function addCaughtCritter(critterId, lv) {
    if (!state.caughtIds.includes(critterId)) state.caughtIds.push(critterId);
    const existing = state.party.find(p => p.id === critterId);
    let newIdx = state.party.length;
    if (!existing) {
      const st = Battle.calcStats(critterId, lv, true);
      state.party.push({ id: critterId, lv, hp: st.maxHp, maxHp: st.maxHp, exp: 0 });
    } else {
      newIdx = state.party.indexOf(existing);
      existing.lv = Math.max(existing.lv, lv);
      const st = Battle.calcStats(critterId, existing.lv, true);
      existing.maxHp = st.maxHp;
      existing.hp = st.maxHp;
    }
    const cr = D.CRITTER_BY_ID[critterId];
    $('celeTitle').textContent = I18N.t('gotchaTitle');
    $('celeImg').src = Art.getCritterPortrait(critterId);
    $('celeName').textContent = `${I18N.pick(cr.name)} (Lv.${lv})`;
    $('celeDesc').textContent = I18N.pick(cr.desc);
    $('celeOk').textContent = I18N.t('gotchaOk');
    $('celePartner').textContent = I18N.t('gotchaPartner');
    $('celebrate').classList.remove('hidden');
    $('celeOk').onclick = () => $('celebrate').classList.add('hidden');
    $('celePartner').onclick = () => {
      state.activePartnerIdx = newIdx;
      saveAndSync();
      $('celebrate').classList.add('hidden');
    };
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
    if (running && !Battle.isActive() && $('modal').classList.contains('hidden') && $('celebrate').classList.contains('hidden')) {
      updateMovement();
    }
    if (running && !Battle.isActive()) {
      renderWorld();
    }
    requestAnimationFrame(loop);
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
    const c = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
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

    // 1. Tiles
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = Math.floor(x * S - camX);
        const py = Math.floor(y * S - camY);
        Art.drawTile(c, World.getT(m, x, y), World.getZ(m, x, y), m.decals[y * m.w + x], px, py, S, time, state.unlockedChapters);
      }
    }

    // 2. Objects
    m.objects.forEach(o => {
      if (o.x + (o.w || 1) < x0 || o.x > x1 || o.y + (o.h || 1) < y0 || o.y > y1) return;
      Art.drawObject(c, o, Math.floor(o.x * S - camX), Math.floor(o.y * S - camY), S, time);
    });

    // 3. Chests
    m.chests.forEach(ch => {
      if (ch.x < x0 || ch.x > x1 || ch.y < y0 || ch.y > y1) return;
      Art.drawChest(c, state.openedChests.includes(ch.id), Math.floor(ch.x * S - camX), Math.floor(ch.y * S - camY), S, time);
    });

    // 4. NPCs
    m.npcs.forEach(n => {
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) return;
      const hasGift = (n.gift && !state.claimedNpcs.includes(n.id)) || (n.questTool && !state.tools.includes(n.questTool));
      Art.drawNpc(c, n, Math.floor(n.x * S - camX), Math.floor(n.y * S - camY), S, time, hasGift);
    });

    // 5. Standing Dungeon Guardian Boss
    if (m.boss) {
      const bx = m.boss.x * S - camX + S * 0.5;
      const by = m.boss.y * S - camY + S * 0.45;
      Art.drawCritter(c, m.boss.critterId, bx, by, S * 2.1, time, false);
    }

    // 6. Hero + Fancy Tool FX
    const curTile = World.getT(m, Math.round(player.x), Math.round(player.y));
    const isSurfing = curTile === World.T.SHALLOW;
    Art.drawHero(c, state.heroId, player.x * S - camX, player.y * S - camY, S, player.dir, player.walkPhase, time, state.tools, isSurfing);

    // 7. World Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      c.globalAlpha = p.life;
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x * S - camX, p.y * S - camY, p.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    // 8. Subtle Biome Ambient Weather (Blossoms / Snowflakes / Stardust)
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
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (running && !dialogOpen && !Battle.isActive() && $('modal').classList.contains('hidden') && $('celebrate').classList.contains('hidden') && !player.moving) {
        const keyDir = e.code === 'ArrowUp' || e.code === 'KeyW' ? 'up'
          : e.code === 'ArrowDown' || e.code === 'KeyS' ? 'down'
          : e.code === 'ArrowLeft' || e.code === 'KeyA' ? 'left'
          : e.code === 'ArrowRight' || e.code === 'KeyD' ? 'right' : null;
        if (keyDir) tryStep(keyDir);
      }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') {
        if (dialogOpen) { e.preventDefault(); closeDialog(true); }
        else if (running && !Battle.isActive() && $('modal').classList.contains('hidden')) { e.preventDefault(); interact(); }
      }
      if (e.code === 'Escape') {
        if (dialogOpen) closeDialog(true);
        else UI.closeModal();
      }
      if (Battle.isActive()) {
        if (e.key === '1') Battle.handleAction('attack');
        if (e.key === '2') Battle.handleAction('catch');
        if (e.key === '3') Battle.handleAction('feed');
        if (e.key === '4') Battle.handleAction('switch');
      }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // Touch & Pointer D-Pad
    const dpad = $('dpad');
    const calcDpad = e => {
      const rect = dpad.getBoundingClientRect();
      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - (rect.left + rect.width / 2);
      const dy = pt.clientY - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) < 10) { dpadDir = null; return; }
      dpadDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    };
    let dpadDown = false;
    dpad.addEventListener('pointerdown', e => { e.preventDefault(); AudioFX.ensure(); dpadDown = true; dpad.setPointerCapture(e.pointerId); calcDpad(e); });
    dpad.addEventListener('pointermove', e => { if (dpadDown) calcDpad(e); });
    const stopDpad = () => { dpadDown = false; dpadDir = null; };
    dpad.addEventListener('pointerup', stopDpad);
    dpad.addEventListener('pointercancel', stopDpad);

    // A / B Buttons
    $('btnA').addEventListener('pointerdown', e => { e.preventDefault(); AudioFX.ensure(); interact(); });
    $('btnB').addEventListener('pointerdown', e => { e.preventDefault(); AudioFX.ensure(); dashHeld = true; });
    const stopB = () => { dashHeld = false; };
    $('btnB').addEventListener('pointerup', stopB);
    $('btnB').addEventListener('pointerleave', stopB);
    $('btnB').addEventListener('pointercancel', stopB);

    // Dialog click (debounced so mobile #btnA tap-lift cannot accidentally auto-dismiss)
    $('dialog').addEventListener('click', () => closeDialog(false));

    // HUD Buttons
    $('partnerCard').onclick = () => UI.openParty();
    $('mapBtn').onclick = () => UI.openWorldMap();
    $('dexBtn').onclick = () => UI.openDex();
    $('bagBtn').onclick = () => UI.openBag();
    $('shopBtn').onclick = () => UI.openStore('chapters');
    $('menuBtn').onclick = () => UI.openSettings();
    $('langBtn').onclick = () => { I18N.toggleLang(); refreshLabels(); };
    $('muteBtn').onclick = () => { AudioFX.setMuted(!AudioFX.isMuted()); syncHud(); };

    // Battle Action Buttons
    $('bActions').querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = () => Battle.handleAction(btn.dataset.act);
    });
  }

  function resetGame() {
    Platform.clearSave();
    AudioFX.stopBgm();
    running = false;
    state = null;
    renderTitleScreen();
  }

  window.addEventListener('DOMContentLoaded', init);
  return { getState, warpToChapter };
})();
