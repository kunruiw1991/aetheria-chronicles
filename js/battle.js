'use strict';
/* ==========================================================================
 * battle.js — Turn-Based RPG Battle & Critter Capture Engine
 * Integrates Hero Passive Perks, Fancy Tool Bonuses (Prism Staff, Magnet),
 * Type Effectiveness, Level-Gap Dampener, Input/Submenu Locks, Timer Cleanup,
 * Live Language Refresh & Canvas VFX.
 * ========================================================================== */
const Battle = (() => {
  const getD = () => (typeof GameData !== 'undefined' ? GameData : globalThis.GameData);
  let active = false;
  let state = null;
  let wild = null;
  let isBoss = false;
  let chapterId = 1;
  let busy = false;
  let menuOpen = false;
  let currentSubmenu = null; // 'orb' | 'switch' | null
  let victoryTriggered = false;
  let fedCount = 0;
  let shieldActive = false;
  let onEndCb = null;
  let lastMsgSpec = null;

  // Timer & animation tracking
  const pendingTimers = new Set();
  let rafId = null;
  let animTime = 0;
  let wildOffset = { x: 0, y: 0, shake: 0 };
  let mineOffset = { x: 0, y: 0, shake: 0 };
  let orbAnim = null; // { t, color, rainbow }
  let fxList = [];

  const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);

  function scheduleTimer(fn, ms) {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      if (!active) return;
      fn();
    }, ms);
    pendingTimers.add(id);
    return id;
  }

  function clearPendingTimers() {
    pendingTimers.forEach(id => clearTimeout(id));
    pendingTimers.clear();
  }

  function levelGapMult(atkLv, defLv) {
    const diff = (atkLv || 1) - (defLv || 1);
    return Math.max(0.78, Math.min(1.25, 1 + diff * 0.03));
  }

  function calcStats(critterId, lv, isPlayerTeam, stateOverride) {
    const D = getD();
    const stObj = stateOverride || state;
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

  function getActiveMine() {
    let p = state.party[state.activePartnerIdx] || state.party[0];
    if (!p || p.hp <= 0) {
      const aliveIdx = state.party.findIndex(x => x.hp > 0);
      if (aliveIdx >= 0) {
        state.activePartnerIdx = aliveIdx;
        p = state.party[aliveIdx];
      }
    }
    return p;
  }

  function getCatchChance(orbMult) {
    const D = getD();
    const base = D.CRITTER_BY_ID[wild.id].catchBase;
    const hpRatio = Math.max(0, wild.hp / wild.maxHp);
    const hpBonus = (1 - hpRatio) * 0.42;
    const feedBonus = Math.min(0.45, fedCount * 0.25);
    const hero = D.HERO_BY_ID[state.heroId];
    const heroBonus = (hero && hero.perk && hero.perk.catchBonus) ? hero.perk.catchBonus : 0;
    const toolBonus = state.tools.includes('prismstaff') ? 0.25 : 0;
    const raw = (base + hpBonus + feedBonus + heroBonus + toolBonus) * (orbMult || 1);
    return Math.max(0.08, Math.min(0.98, raw));
  }

  function closeSubmenu() {
    menuOpen = false;
    currentSubmenu = null;
    const sub = $('bSub');
    if (sub) {
      sub.classList.add('hidden');
      sub.innerHTML = '';
    }
    const acts = $('bActions');
    if (acts) acts.classList.remove('hidden');
  }

  function renderMsgSpec(spec) {
    if (!spec) return '';
    const D = getD();
    const vars = {};
    if (spec.vars) {
      Object.keys(spec.vars).forEach(k => {
        const v = spec.vars[k];
        if (v && typeof v === 'object' && v.critterNameId) {
          const cr = D.CRITTER_BY_ID[v.critterNameId] || D.CRITTERS[0];
          vars[k] = I18N.pick(cr.name);
        } else if (v && typeof v === 'object' && v.critterSkillId) {
          const cr = D.CRITTER_BY_ID[v.critterSkillId] || D.CRITTERS[0];
          vars[k] = I18N.pick(cr.skill);
        } else if (v && typeof v === 'object' && v.i18nKey) {
          vars[k] = I18N.t(v.i18nKey);
        } else {
          vars[k] = v;
        }
      });
    }
    let txt = I18N.t(spec.key, vars);
    if (spec.extraKey) txt += I18N.t(spec.extraKey);
    return txt;
  }

  function setMsgKey(key, vars, extraKey) {
    lastMsgSpec = { key, vars: vars || null, extraKey: extraKey || null };
    const el = $('bMsg');
    if (el) el.textContent = renderMsgSpec(lastMsgSpec);
  }

  function start(gameState, critterId, lv, bossFlag, chId, onEnd) {
    clearPendingTimers();
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    const D = getD();
    state = gameState;
    isBoss = !!bossFlag;
    chapterId = chId || 1;
    onEndCb = onEnd;
    fedCount = 0;
    busy = false;
    menuOpen = false;
    currentSubmenu = null;
    victoryTriggered = false;
    orbAnim = null;
    fxList = [];

    const hero = D.HERO_BY_ID[state.heroId];
    shieldActive = !!(hero && hero.perk && hero.perk.startShield);

    const st = calcStats(critterId, lv, false);
    const bossHpMult = isBoss ? 1.15 : 1.0;
    wild = {
      id: critterId,
      lv,
      maxHp: Math.round(st.maxHp * bossHpMult),
      hp: Math.round(st.maxHp * bossHpMult),
      atk: st.atk,
      spd: st.spd,
    };

    // Ensure partner stats are synced
    const mine = getActiveMine();
    const mst = calcStats(mine.id, mine.lv, true);
    mine.maxHp = mst.maxHp;
    mine.hp = Math.min(mine.maxHp, mine.hp);

    active = true;
    const bEl = $('battle');
    if (bEl) bEl.classList.remove('hidden');
    closeSubmenu();
    AudioFX.playBgm('battle');

    setMsgKey(isBoss ? 'battleBossAppeared' : 'battleWildAppeared', {
      name: { critterNameId: wild.id },
      lv: wild.lv,
    });
    syncUI();
    startLoop();
  }

  function syncUI() {
    if (!active || !wild || !state) return;
    const D = getD();
    const wCr = D.CRITTER_BY_ID[wild.id];
    const mine = getActiveMine();
    const mCr = D.CRITTER_BY_ID[mine.id];

    const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    const setW = (id, pct) => { const el = $(id); if (el && el.style) el.style.width = pct; };

    setTxt('bwName', I18N.pick(wCr.name));
    setTxt('bwLv', 'Lv.' + wild.lv);
    setTxt('bwBadge', isBoss ? '👑 BOSS' : (I18N.t('elemNames')[wCr.elem] || wCr.elem));
    setW('bwHp', Math.max(0, Math.round((wild.hp / wild.maxHp) * 100)) + '%');
    setTxt('bwHpTxt', `${wild.hp}/${wild.maxHp}`);
    const chancePct = Math.round(getCatchChance(1.0) * 100);
    setW('bwCatch', chancePct + '%');
    setTxt('bwCatchTxt', `🎯 ${I18N.t('catchChance')} ${chancePct}%`);

    setTxt('bmName', I18N.pick(mCr.name) + (shieldActive ? ' 🛡️' : ''));
    setTxt('bmLv', 'Lv.' + mine.lv);
    setW('bmHp', Math.max(0, Math.round((mine.hp / mine.maxHp) * 100)) + '%');
    setTxt('bmHpTxt', `${mine.hp}/${mine.maxHp}`);
    const needExp = mine.lv * 30;
    setW('bmExp', Math.min(100, Math.round((mine.exp / needExp) * 100)) + '%');

    // Button labels
    setTxt('bAttackLabel', I18N.t('attack'));
    setTxt('bMoveName', I18N.pick(mCr.skill));
    setTxt('bCatchLabel', I18N.t('catchBtn'));
    setTxt('bCatchInfo', `🔵${state.items.orbs} 🌈${state.items.superOrbs} 👑${state.items.masterOrbs}`);
    setTxt('bFeedLabel', I18N.t('feedBtn'));
    setTxt('bFeedInfo', `🍓×${state.items.treats} · ${I18N.t('feedInfo')}`);
    setTxt('bSwitchLabel', I18N.t('switchRun'));
    setTxt('bSwitchInfo', I18N.t('switchInfo'));
    setTxt('bLangBtn', '🌐 ' + I18N.t('langLabel'));
  }

  function refreshLang() {
    if (!active) return;
    if (lastMsgSpec) {
      const el = $('bMsg');
      if (el) el.textContent = renderMsgSpec(lastMsgSpec);
    }
    syncUI();
    if (currentSubmenu === 'orb') openOrbMenu();
    else if (currentSubmenu === 'switch') openSwitchMenu();
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < (count || 14); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4;
      fxList.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, color, r: 3 + Math.random() * 4 });
    }
  }

  function startLoop() {
    const cv = $('battleCanvas');
    if (!cv || typeof cv.getContext !== 'function' || typeof requestAnimationFrame !== 'function') return;
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    const c = cv.getContext('2d');
    if (!c) return;
    const tick = () => {
      if (!active) return;
      animTime += 0.016;
      const rect = cv.parentElement && cv.parentElement.getBoundingClientRect
        ? cv.parentElement.getBoundingClientRect()
        : { width: 480, height: 280 };
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height));
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr; cv.height = h * dpr;
      }
      c.save();
      c.scale(dpr, dpr);

      const skyColors = {
        1: ['#7dd3fc', '#bbf7d0', '#4ade80'],
        2: ['#38bdf8', '#a5f3fc', '#fde68a'],
        3: ['#fb923c', '#fde68a', '#eab308'],
        4: ['#60a5fa', '#e0f2fe', '#bae6fd'],
        5: ['#312e81', '#7e22ce', '#e9d5ff'],
      }[chapterId] || ['#7dd3fc', '#bbf7d0', '#4ade80'];

      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, skyColors[0]);
      g.addColorStop(0.58, skyColors[1]);
      g.addColorStop(1, skyColors[2]);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      const wx = w * 0.72, wy = h * 0.44;
      const mx = w * 0.27, my = h * 0.72;
      c.fillStyle = 'rgba(255,255,255,0.42)';
      c.beginPath(); c.ellipse(wx, wy + 46, 68, 20, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(mx, my + 42, 74, 22, 0, 0, Math.PI * 2); c.fill();

      wildOffset.x *= 0.85; wildOffset.y *= 0.85; wildOffset.shake *= 0.85;
      mineOffset.x *= 0.85; mineOffset.y *= 0.85; mineOffset.shake *= 0.85;
      const wShake = wildOffset.shake > 0.3 ? (Math.random() - 0.5) * wildOffset.shake * 14 : 0;
      const mShake = mineOffset.shake > 0.3 ? (Math.random() - 0.5) * mineOffset.shake * 14 : 0;

      const wildSize = Math.min(138, h * 0.48);
      Art.drawCritter(c, wild.id, wx + wildOffset.x + wShake, wy + wildOffset.y, wildSize, animTime, false);

      const mine = getActiveMine();
      if (mine) {
        const mineSize = Math.min(132, h * 0.46);
        Art.drawCritter(c, mine.id, mx + mineOffset.x + mShake, my + mineOffset.y, mineSize, animTime + 1.2, true);
      }

      if (orbAnim) {
        orbAnim.t += 0.04;
        const p = Math.min(1, orbAnim.t);
        const ox = mx + (wx - mx) * p;
        const oy = my + (wy - my) * p - Math.sin(p * Math.PI) * 90;
        if (orbAnim.rainbow) {
          c.strokeStyle = `hsl(${(animTime * 360) % 360}, 90%, 65%)`;
          c.lineWidth = 6;
          c.beginPath(); c.moveTo(mx + 20, my - 10); c.lineTo(ox, oy); c.stroke();
        }
        c.fillStyle = orbAnim.color;
        c.beginPath(); c.arc(ox, oy, 12, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke();
        if (p >= 1) orbAnim = null;
      }

      for (let i = fxList.length - 1; i >= 0; i--) {
        const f = fxList[i];
        f.x += f.vx; f.y += f.vy; f.life -= 0.032;
        if (f.life <= 0) { fxList.splice(i, 1); continue; }
        c.globalAlpha = f.life;
        c.fillStyle = f.color;
        c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
      c.restore();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function handleAction(act) {
    if (!active || busy || menuOpen) return;
    AudioFX.sfx.tap();
    if (act === 'attack') return doAttack();
    if (act === 'catch') return openOrbMenu();
    if (act === 'feed') return doFeed();
    if (act === 'switch') return openSwitchMenu();
  }

  function doAttack() {
    if (!active || busy) return;
    closeSubmenu();
    busy = true;
    const D = getD();
    const mine = getActiveMine();
    const mCr = D.CRITTER_BY_ID[mine.id];
    const { dmg, mult } = calcPlayerDamage(mine, wild, state);

    mineOffset.x = 34; mineOffset.y = -18;
    wildOffset.shake = 1.0;
    wild.hp = Math.max(0, wild.hp - dmg);
    const cv = $('battleCanvas');
    if (cv) spawnParticles((cv.clientWidth || 400) * 0.72, (cv.clientHeight || 240) * 0.44, mCr.art.accent, 18);
    if (mult > 1.15) AudioFX.sfx.superHit(); else AudioFX.sfx.hit();

    const extraKey = mult > 1.15 ? 'battleSuperEffective' : (mult < 0.9 ? 'battleNotEffective' : null);
    setMsgKey('battleUsedSkill', {
      a: { critterNameId: mine.id },
      skill: { critterSkillId: mine.id },
      dmg,
    }, extraKey);
    syncUI();

    scheduleTimer(() => {
      if (wild.hp <= 0) return finishVictory(false);
      enemyTurn();
    }, 850);
  }

  function openOrbMenu() {
    if (!active || busy) return;
    const sub = $('bSub');
    if (!sub) return;
    const total = state.items.orbs + state.items.superOrbs + state.items.masterOrbs;
    if (total <= 0) {
      setMsgKey('battleNoOrbs');
      return;
    }
    menuOpen = true;
    currentSubmenu = 'orb';
    const items = [
      { key: 'orbs', label: `🔵 ${I18N.t('orbs')} (×${state.items.orbs})`, mult: 1.0, color: '#38bdf8' },
      { key: 'superOrbs', label: `🌈 ${I18N.t('superOrbs')} (×${state.items.superOrbs})`, mult: 1.6, color: '#ec4899' },
      { key: 'masterOrbs', label: `👑 ${I18N.t('masterOrbs')} (×${state.items.masterOrbs})`, mult: 99, color: '#facc15' },
    ];
    sub.innerHTML = items.map(it => {
      const pct = it.mult >= 99 ? 100 : Math.round(getCatchChance(it.mult) * 100);
      return `<button class="bsub-btn" data-orb="${it.key}" ${state.items[it.key] <= 0 ? 'disabled' : ''}>${it.label} · <b>${pct}%</b></button>`;
    }).join('') + `<button class="bsub-btn cancel" data-cancel="1">${I18N.t('close')}</button>`;
    sub.classList.remove('hidden');
    const acts = $('bActions');
    if (acts) acts.classList.add('hidden');
    sub.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        if (!active || busy) return;
        closeSubmenu();
        if (btn.dataset.cancel) return;
        const spec = items.find(x => x.key === btn.dataset.orb);
        if (spec && state.items[spec.key] > 0) doThrowOrb(spec);
      };
    });
  }

  function doThrowOrb(spec) {
    if (!active || busy) return;
    busy = true;
    state.items[spec.key]--;
    AudioFX.sfx.throwOrb();
    orbAnim = { t: 0, color: spec.color, rainbow: state.tools.includes('prismstaff') };
    setMsgKey('battleThrowOrb', { orb: { i18nKey: spec.key } });
    syncUI();

    scheduleTimer(() => {
      const chance = spec.mult >= 99 ? 1.0 : getCatchChance(spec.mult);
      const caught = Math.random() < chance;
      const cv = $('battleCanvas');
      if (caught) {
        AudioFX.sfx.catchOk();
        if (cv) spawnParticles((cv.clientWidth || 400) * 0.72, (cv.clientHeight || 240) * 0.44, '#fde047', 30);
        setMsgKey('battleCaught', { name: { critterNameId: wild.id } });
        scheduleTimer(() => finishVictory(true), 850);
      } else {
        setMsgKey('battleBrokeFree', { name: { critterNameId: wild.id } });
        scheduleTimer(() => enemyTurn(), 900);
      }
    }, 800);
  }

  function doFeed() {
    if (!active || busy) return;
    if (state.items.treats <= 0) {
      setMsgKey('battleNoTreats');
      return;
    }
    closeSubmenu();
    busy = true;
    const D = getD();
    state.items.treats--;
    fedCount++;
    const mine = getActiveMine();
    const hero = D.HERO_BY_ID[state.heroId];
    const healRatio = 0.32 + ((hero && hero.perk && hero.perk.healBonus) ? hero.perk.healBonus : 0);
    mine.hp = Math.min(mine.maxHp, mine.hp + Math.round(mine.maxHp * healRatio));
    AudioFX.sfx.heal();
    const cv = $('battleCanvas');
    if (cv) spawnParticles((cv.clientWidth || 400) * 0.72, (cv.clientHeight || 240) * 0.44, '#f472b6', 16);
    setMsgKey('battleFed', { name: { critterNameId: wild.id } });
    syncUI();
    scheduleTimer(() => enemyTurn(), 850);
  }

  function openSwitchMenu() {
    if (!active || busy) return;
    const sub = $('bSub');
    if (!sub) return;
    const D = getD();
    menuOpen = true;
    currentSubmenu = 'switch';
    let html = state.party.map((p, idx) => {
      const cr = D.CRITTER_BY_ID[p.id];
      const cur = idx === state.activePartnerIdx;
      return `<button class="bsub-btn" data-swap="${idx}" ${cur || p.hp <= 0 ? 'disabled' : ''}>${I18N.pick(cr.name)} Lv.${p.lv} (${p.hp}/${p.maxHp})</button>`;
    }).join('');
    html += `<button class="bsub-btn run" data-run="1">🏃 ${I18N.getLang() === 'zh' ? '逃跑' : 'Run Away'}</button>`;
    html += `<button class="bsub-btn cancel" data-cancel="1">${I18N.t('close')}</button>`;
    sub.innerHTML = html;
    sub.classList.remove('hidden');
    const acts = $('bActions');
    if (acts) acts.classList.add('hidden');
    sub.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        if (!active || busy) return;
        closeSubmenu();
        if (btn.dataset.cancel) return;
        if (btn.dataset.run) {
          if (isBoss) { setMsgKey('battleRunBoss'); AudioFX.sfx.locked(); return; }
          busy = true;
          setMsgKey('battleRunOk');
          scheduleTimer(() => endBattle({ result: 'run' }), 500);
          return;
        }
        const idx = parseInt(btn.dataset.swap, 10);
        if (!isNaN(idx) && state.party[idx] && state.party[idx].hp > 0 && idx !== state.activePartnerIdx) {
          state.activePartnerIdx = idx;
          syncUI();
          busy = true;
          scheduleTimer(() => enemyTurn(), 500);
        }
      };
    });
  }

  function enemyTurn() {
    if (!active) return;
    const D = getD();
    const mine = getActiveMine();
    const wCr = D.CRITTER_BY_ID[wild.id];
    const { dmg } = calcEnemyDamage(wild, mine, shieldActive);
    if (shieldActive) shieldActive = false;

    wildOffset.x = -34; wildOffset.y = 18;
    mineOffset.shake = 1.0;
    mine.hp = Math.max(0, mine.hp - dmg);
    AudioFX.sfx.hit();
    const cv = $('battleCanvas');
    if (cv) spawnParticles((cv.clientWidth || 400) * 0.27, (cv.clientHeight || 240) * 0.72, wCr.art.c1, 14);
    setMsgKey('battleUsedSkill', {
      a: { critterNameId: wild.id },
      skill: { critterSkillId: wild.id },
      dmg,
    });
    syncUI();

    scheduleTimer(() => {
      if (mine.hp <= 0) {
        const nextIdx = state.party.findIndex(x => x.hp > 0);
        if (nextIdx >= 0) {
          state.activePartnerIdx = nextIdx;
          setMsgKey('battleFainted', { name: { critterNameId: mine.id } });
          syncUI();
          busy = false;
        } else {
          setMsgKey('battleAllFainted');
          scheduleTimer(() => endBattle({ result: 'fainted' }), 1100);
        }
      } else {
        busy = false;
      }
    }, 850);
  }

  function finishVictory(caught) {
    if (!active || victoryTriggered) return;
    victoryTriggered = true;
    busy = true;
    closeSubmenu();
    const D = getD();
    const hero = D.HERO_BY_ID[state.heroId];
    const expMult = (hero && hero.perk && hero.perk.expMult) ? hero.perk.expMult : 1;
    let goldMult = (hero && hero.perk && hero.perk.goldMult) ? hero.perk.goldMult : 1;
    if (state.tools.includes('magnet')) goldMult *= 1.35;

    const alreadyDefeatedBoss = isBoss && (
      (Array.isArray(state.defeatedBosses) && state.defeatedBosses.includes(chapterId)) ||
      (Array.isArray(state.crests) && state.crests.includes(chapterId))
    );

    const expGain = alreadyDefeatedBoss ? 0 : Math.round((16 + wild.lv * 6) * (isBoss ? 2.5 : 1) * expMult);
    const goldGain = alreadyDefeatedBoss ? 0 : Math.round((12 + wild.lv * 4) * (isBoss ? 3.5 : 1) * goldMult);
    state.gold += goldGain;

    const mine = getActiveMine();
    mine.exp += expGain;
    let leveledUp = false;
    while (mine.exp >= mine.lv * 30 && mine.lv < 50) {
      mine.exp -= mine.lv * 30;
      mine.lv++;
      const nst = calcStats(mine.id, mine.lv, true);
      mine.maxHp = nst.maxHp;
      mine.hp = nst.maxHp;
      leveledUp = true;
    }
    if (leveledUp) AudioFX.sfx.levelUp();

    if (alreadyDefeatedBoss) {
      setMsgKey('battleWinRematch');
    } else {
      setMsgKey('battleWin', { exp: expGain, gold: goldGain });
    }
    syncUI();

    scheduleTimer(() => {
      endBattle({
        result: caught ? 'caught' : 'win',
        critterId: wild.id,
        lv: wild.lv,
        isBoss,
        chapterId,
        expGain,
        goldGain,
        leveledUp,
        rematch: alreadyDefeatedBoss,
      });
    }, 1000);
  }

  function endBattle(info) {
    if (!active) return;
    active = false;
    busy = true;
    clearPendingTimers();
    closeSubmenu();
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    const bEl = $('battle');
    if (bEl) bEl.classList.add('hidden');
    const cb = onEndCb;
    onEndCb = null;
    if (cb) cb(info);
  }

  function isActive() { return active; }
  function isBusy() { return busy; }
  function isMenuOpen() { return menuOpen; }
  function getWild() { return wild; }

  return {
    start,
    handleAction,
    refreshLang,
    isActive,
    isBusy,
    isMenuOpen,
    getWild,
    calcStats,
    calcPlayerDamage,
    calcEnemyDamage,
    levelGapMult,
    endBattle,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.Battle = Battle;
if (typeof module === 'object' && module.exports) module.exports = Battle;
