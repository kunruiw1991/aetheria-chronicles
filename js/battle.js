'use strict';
/* ==========================================================================
 * battle.js — Turn-Based RPG Battle & Critter Capture Engine
 * Integrates Hero Passive Perks, Fancy Tool Bonuses (Prism Staff, Magnet),
 * Type Effectiveness, Orb Selection, Boss Rewards & Canvas VFX.
 * ========================================================================== */
const Battle = (() => {
  const D = GameData;
  let active = false;
  let state = null;
  let wild = null;
  let isBoss = false;
  let chapterId = 1;
  let busy = false;
  let fedCount = 0;
  let shieldActive = false;
  let onEndCb = null;

  // Animation state
  let rafId = null;
  let animTime = 0;
  let wildOffset = { x: 0, y: 0, shake: 0 };
  let mineOffset = { x: 0, y: 0, shake: 0 };
  let orbAnim = null; // { t, color, rainbow }
  let fxList = [];

  const $ = id => document.getElementById(id);

  function calcStats(critterId, lv, isPlayerTeam) {
    const base = D.CRITTER_BY_ID[critterId] || D.CRITTERS[0];
    let hpMult = 1, atkMult = 1;
    if (isPlayerTeam && state) {
      const hero = D.HERO_BY_ID[state.heroId];
      if (hero && hero.perk) {
        if (hero.perk.hpMult) hpMult *= hero.perk.hpMult;
        if (hero.perk.atkMult) atkMult *= hero.perk.atkMult;
      }
    }
    const maxHp = Math.round((base.hp + lv * 6) * hpMult);
    const atk = Math.round((base.atk + lv * 2.1) * atkMult);
    const spd = Math.round(base.spd + lv * 1.3);
    return { maxHp, atk, spd };
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

  function start(gameState, critterId, lv, bossFlag, chId, onEnd) {
    state = gameState;
    isBoss = !!bossFlag;
    chapterId = chId || 1;
    onEndCb = onEnd;
    fedCount = 0;
    busy = false;
    orbAnim = null;
    fxList = [];

    const hero = D.HERO_BY_ID[state.heroId];
    shieldActive = !!(hero && hero.perk && hero.perk.startShield);

    const st = calcStats(critterId, lv, false);
    const bossHpMult = isBoss ? 1.25 : 1.0;
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
    $('battle').classList.remove('hidden');
    $('bSub').classList.add('hidden');
    $('bActions').classList.remove('hidden');
    AudioFX.playBgm('battle');

    const cr = D.CRITTER_BY_ID[wild.id];
    setMsg(I18N.t(isBoss ? 'battleBossAppeared' : 'battleWildAppeared', {
      name: I18N.pick(cr.name), lv: wild.lv,
    }));
    syncUI();
    startLoop();
  }

  function setMsg(text) {
    $('bMsg').textContent = text;
  }

  function syncUI() {
    const wCr = D.CRITTER_BY_ID[wild.id];
    const mine = getActiveMine();
    const mCr = D.CRITTER_BY_ID[mine.id];

    $('bwName').textContent = I18N.pick(wCr.name);
    $('bwLv').textContent = 'Lv.' + wild.lv;
    $('bwBadge').textContent = isBoss ? '👑 BOSS' : I18N.t('elemNames')[wCr.elem] || wCr.elem;
    $('bwHp').style.width = Math.max(0, Math.round((wild.hp / wild.maxHp) * 100)) + '%';
    $('bwHpTxt').textContent = `${wild.hp}/${wild.maxHp}`;
    const chancePct = Math.round(getCatchChance(1.0) * 100);
    $('bwCatch').style.width = chancePct + '%';
    $('bwCatchTxt').textContent = `🎯 ${I18N.t('catchChance')} ${chancePct}%`;

    $('bmName').textContent = I18N.pick(mCr.name) + (shieldActive ? ' 🛡️' : '');
    $('bmLv').textContent = 'Lv.' + mine.lv;
    $('bmHp').style.width = Math.max(0, Math.round((mine.hp / mine.maxHp) * 100)) + '%';
    $('bmHpTxt').textContent = `${mine.hp}/${mine.maxHp}`;
    const needExp = mine.lv * 30;
    $('bmExp').style.width = Math.min(100, Math.round((mine.exp / needExp) * 100)) + '%';

    // Button labels
    $('bAttackLabel').textContent = I18N.t('attack');
    $('bMoveName').textContent = I18N.pick(mCr.skill);
    $('bCatchLabel').textContent = I18N.t('catchBtn');
    $('bCatchInfo').textContent = `🔵${state.items.orbs} 🌈${state.items.superOrbs} 👑${state.items.masterOrbs}`;
    $('bFeedLabel').textContent = I18N.t('feedBtn');
    $('bFeedInfo').textContent = `🍓×${state.items.treats} · ${I18N.t('feedInfo')}`;
    $('bSwitchLabel').textContent = I18N.t('switchRun');
    $('bSwitchInfo').textContent = I18N.t('switchInfo');
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < (count || 14); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4;
      fxList.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, color, r: 3 + Math.random() * 4 });
    }
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    const cv = $('battleCanvas');
    const c = cv.getContext('2d');
    const tick = () => {
      if (!active) return;
      animTime += 0.016;
      const rect = cv.parentElement.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height));
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr; cv.height = h * dpr;
      }
      c.save();
      c.scale(dpr, dpr);

      // Biome sky & arena backdrop
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

      // Platforms
      const wx = w * 0.72, wy = h * 0.44;
      const mx = w * 0.27, my = h * 0.72;
      c.fillStyle = 'rgba(255,255,255,0.42)';
      c.beginPath(); c.ellipse(wx, wy + 46, 68, 20, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(mx, my + 42, 74, 22, 0, 0, Math.PI * 2); c.fill();

      // Decay lunge/shake offsets
      wildOffset.x *= 0.85; wildOffset.y *= 0.85; wildOffset.shake *= 0.85;
      mineOffset.x *= 0.85; mineOffset.y *= 0.85; mineOffset.shake *= 0.85;
      const wShake = wildOffset.shake > 0.3 ? (Math.random() - 0.5) * wildOffset.shake * 14 : 0;
      const mShake = mineOffset.shake > 0.3 ? (Math.random() - 0.5) * mineOffset.shake * 14 : 0;

      // Draw Wild Critter
      const wildSize = Math.min(138, h * 0.48);
      Art.drawCritter(c, wild.id, wx + wildOffset.x + wShake, wy + wildOffset.y, wildSize, animTime, false);

      // Draw Player Partner Critter
      const mine = getActiveMine();
      if (mine) {
        const mineSize = Math.min(132, h * 0.46);
        Art.drawCritter(c, mine.id, mx + mineOffset.x + mShake, my + mineOffset.y, mineSize, animTime + 1.2, true);
      }

      // Draw Orb Throw animation
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

      // Particles
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
    if (!active || busy) return;
    AudioFX.sfx.tap();
    if (act === 'attack') return doAttack();
    if (act === 'catch') return openOrbMenu();
    if (act === 'feed') return doFeed();
    if (act === 'switch') return openSwitchMenu();
  }

  function doAttack() {
    busy = true;
    const mine = getActiveMine();
    const mCr = D.CRITTER_BY_ID[mine.id];
    const wCr = D.CRITTER_BY_ID[wild.id];
    const mst = calcStats(mine.id, mine.lv, true);
    let mult = D.typeMultiplier(mCr.elem, wCr.elem);
    const hero = D.HERO_BY_ID[state.heroId];
    if (hero && hero.perk && hero.perk.elemBonus && hero.perk.elemBonus.includes(mCr.elem)) {
      mult *= hero.perk.elemMult;
    }
    const dmg = Math.max(4, Math.round(mst.atk * mult * (0.9 + Math.random() * 0.25)));
    mineOffset.x = 34; mineOffset.y = -18;
    wildOffset.shake = 1.0;
    wild.hp = Math.max(0, wild.hp - dmg);
    const cv = $('battleCanvas');
    spawnParticles(cv.clientWidth * 0.72, cv.clientHeight * 0.44, mCr.art.accent, 18);
    if (mult > 1.2) AudioFX.sfx.superHit(); else AudioFX.sfx.hit();

    let extra = '';
    if (mult > 1.2) extra = I18N.t('battleSuperEffective');
    else if (mult < 0.85) extra = I18N.t('battleNotEffective');
    setMsg(I18N.t('battleUsedSkill', { a: I18N.pick(mCr.name), skill: I18N.pick(mCr.skill), dmg }) + extra);
    syncUI();

    setTimeout(() => {
      if (wild.hp <= 0) return finishVictory(false);
      enemyTurn();
    }, 850);
  }

  function openOrbMenu() {
    const sub = $('bSub');
    const total = state.items.orbs + state.items.superOrbs + state.items.masterOrbs;
    if (total <= 0) {
      setMsg(I18N.t('battleNoOrbs'));
      return;
    }
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
    $('bActions').classList.add('hidden');
    sub.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        sub.classList.add('hidden');
        $('bActions').classList.remove('hidden');
        if (btn.dataset.cancel) return;
        const spec = items.find(x => x.key === btn.dataset.orb);
        if (spec) doThrowOrb(spec);
      };
    });
  }

  function doThrowOrb(spec) {
    busy = true;
    state.items[spec.key]--;
    AudioFX.sfx.throwOrb();
    orbAnim = { t: 0, color: spec.color, rainbow: state.tools.includes('prismstaff') };
    setMsg(I18N.t('battleThrowOrb', { orb: I18N.t(spec.key) }));
    syncUI();

    setTimeout(() => {
      const chance = spec.mult >= 99 ? 1.0 : getCatchChance(spec.mult);
      const caught = Math.random() < chance;
      const cv = $('battleCanvas');
      if (caught) {
        AudioFX.sfx.catchOk();
        spawnParticles(cv.clientWidth * 0.72, cv.clientHeight * 0.44, '#fde047', 30);
        const wCr = D.CRITTER_BY_ID[wild.id];
        setMsg(I18N.t('battleCaught', { name: I18N.pick(wCr.name) }));
        setTimeout(() => finishVictory(true), 850);
      } else {
        const wCr = D.CRITTER_BY_ID[wild.id];
        setMsg(I18N.t('battleBrokeFree', { name: I18N.pick(wCr.name) }));
        setTimeout(() => enemyTurn(), 900);
      }
    }, 800);
  }

  function doFeed() {
    if (state.items.treats <= 0) {
      setMsg(I18N.t('battleNoTreats'));
      return;
    }
    busy = true;
    state.items.treats--;
    fedCount++;
    const mine = getActiveMine();
    const hero = D.HERO_BY_ID[state.heroId];
    const healRatio = 0.32 + ((hero && hero.perk && hero.perk.healBonus) ? hero.perk.healBonus : 0);
    mine.hp = Math.min(mine.maxHp, mine.hp + Math.round(mine.maxHp * healRatio));
    AudioFX.sfx.heal();
    const wCr = D.CRITTER_BY_ID[wild.id];
    const cv = $('battleCanvas');
    spawnParticles(cv.clientWidth * 0.72, cv.clientHeight * 0.44, '#f472b6', 16);
    setMsg(I18N.t('battleFed', { name: I18N.pick(wCr.name) }));
    syncUI();
    setTimeout(() => enemyTurn(), 850);
  }

  function openSwitchMenu() {
    const sub = $('bSub');
    let html = state.party.map((p, idx) => {
      const cr = D.CRITTER_BY_ID[p.id];
      const cur = idx === state.activePartnerIdx;
      return `<button class="bsub-btn" data-swap="${idx}" ${cur || p.hp <= 0 ? 'disabled' : ''}>${I18N.pick(cr.name)} Lv.${p.lv} (${p.hp}/${p.maxHp})</button>`;
    }).join('');
    html += `<button class="bsub-btn run" data-run="1">🏃 ${I18N.getLang() === 'zh' ? '逃跑' : 'Run Away'}</button>`;
    html += `<button class="bsub-btn cancel" data-cancel="1">${I18N.t('close')}</button>`;
    sub.innerHTML = html;
    sub.classList.remove('hidden');
    $('bActions').classList.add('hidden');
    sub.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        sub.classList.add('hidden');
        $('bActions').classList.remove('hidden');
        if (btn.dataset.cancel) return;
        if (btn.dataset.run) {
          if (isBoss) { setMsg(I18N.t('battleRunBoss')); AudioFX.sfx.locked(); return; }
          busy = true;
          setMsg(I18N.t('battleRunOk'));
          setTimeout(() => endBattle({ result: 'run' }), 500);
          return;
        }
        const idx = parseInt(btn.dataset.swap, 10);
        if (!isNaN(idx)) {
          state.activePartnerIdx = idx;
          syncUI();
          busy = true;
          setTimeout(() => enemyTurn(), 500);
        }
      };
    });
  }

  function enemyTurn() {
    const mine = getActiveMine();
    const mCr = D.CRITTER_BY_ID[mine.id];
    const wCr = D.CRITTER_BY_ID[wild.id];
    const mult = D.typeMultiplier(wCr.elem, mCr.elem);
    let dmg = Math.max(3, Math.round(wild.atk * mult * (0.78 + Math.random() * 0.22)));
    if (shieldActive) {
      dmg = Math.max(1, Math.round(dmg * 0.45));
      shieldActive = false;
    }
    wildOffset.x = -34; wildOffset.y = 18;
    mineOffset.shake = 1.0;
    mine.hp = Math.max(0, mine.hp - dmg);
    AudioFX.sfx.hit();
    const cv = $('battleCanvas');
    spawnParticles(cv.clientWidth * 0.27, cv.clientHeight * 0.72, wCr.art.c1, 14);
    setMsg(I18N.t('battleUsedSkill', { a: I18N.pick(wCr.name), skill: I18N.pick(wCr.skill), dmg }));
    syncUI();

    setTimeout(() => {
      if (mine.hp <= 0) {
        const nextIdx = state.party.findIndex(x => x.hp > 0);
        if (nextIdx >= 0) {
          state.activePartnerIdx = nextIdx;
          setMsg(I18N.t('battleFainted', { name: I18N.pick(mCr.name) }));
          syncUI();
          busy = false;
        } else {
          setMsg(I18N.t('battleAllFainted'));
          setTimeout(() => endBattle({ result: 'fainted' }), 1100);
        }
      } else {
        busy = false;
      }
    }, 850);
  }

  function finishVictory(caught) {
    const hero = D.HERO_BY_ID[state.heroId];
    const expMult = (hero && hero.perk && hero.perk.expMult) ? hero.perk.expMult : 1;
    let goldMult = (hero && hero.perk && hero.perk.goldMult) ? hero.perk.goldMult : 1;
    if (state.tools.includes('magnet')) goldMult *= 1.35;

    const expGain = Math.round((16 + wild.lv * 6) * (isBoss ? 2.5 : 1) * expMult);
    const goldGain = Math.round((12 + wild.lv * 4) * (isBoss ? 3.5 : 1) * goldMult);
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

    setMsg(I18N.t('battleWin', { exp: expGain, gold: goldGain }));
    syncUI();

    setTimeout(() => {
      endBattle({
        result: caught ? 'caught' : 'win',
        critterId: wild.id,
        lv: wild.lv,
        isBoss,
        chapterId,
        expGain,
        goldGain,
        leveledUp,
      });
    }, 1000);
  }

  function endBattle(info) {
    active = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    $('battle').classList.add('hidden');
    if (onEndCb) onEndCb(info);
  }

  function isActive() { return active; }

  return { start, handleAction, isActive, calcStats };
})();
