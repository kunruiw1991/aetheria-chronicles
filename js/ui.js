'use strict';
/* ==========================================================================
 * ui.js — Modals: Interactive World Map, Grand Store (Chapters/Heroes/Tools),
 * Critterdex, Party & Hero Switcher, Bag/Tools, Settings & Checkout Sheet
 * ========================================================================== */
const UI = (() => {
  const D = GameData;
  const $ = id => document.getElementById(id);

  let gameRef = null;
  let storeTab = 'chapters';

  function bind(ref) {
    gameRef = ref;
    $('modalClose').onclick = closeModal;
    $('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
  }

  function openModal(title, html, onReady) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
    AudioFX.sfx.open();
    if (onReady) onReady($('modalBody'));
  }

  function closeModal() {
    $('modal').classList.add('hidden');
  }

  /* ---------------- 1. Interactive World Map & Chapter Navigator ---------------- */
  function openWorldMap() {
    const st = gameRef.getState();
    const hasWings = st.tools.includes('wings');
    const chCards = D.CHAPTERS.map(ch => {
      const unlocked = st.unlockedChapters.includes(ch.id);
      const cleared = st.crests.includes(ch.id);
      const badge = ch.free
        ? `<span class="badge free">${I18N.t('chapterFree')}</span>`
        : unlocked
          ? `<span class="badge owned">${I18N.t('chapterUnlocked')}</span>`
          : `<span class="badge paid">🎬 ${(st.adProgress && st.adProgress[ch.productId]) || 0}/${ch.adCost}</span>`;
      const actionBtn = !unlocked
        ? `<button class="sm-btn gold" data-unlock-ch="${ch.productId}">${I18N.t('openStoreBtn')}</button>`
        : hasWings
          ? `<button class="sm-btn primary" data-warp="${ch.id}">🪽 ${I18N.t('fastTravelBtn')}</button>`
          : `<button class="sm-btn ghost" data-need-wings="1">🪽 ${I18N.t('unlockWingsBtn')}</button>`;
      return `
        <div class="ch-row ${unlocked ? '' : 'locked'}">
          <div class="ch-row-top">
            <div><strong>${ch.emoji} ${I18N.t('chapterPrefix', { n: ch.id })} · ${I18N.pick(ch.short)}</strong> ${badge} ${cleared ? `<span class="badge clear">🏆 ${I18N.t('chapterCleared')}</span>` : ''}</div>
            ${actionBtn}
          </div>
          <p class="ch-desc">${I18N.pick(ch.desc)}</p>
        </div>`;
    }).join('');

    const tip = hasWings
      ? `🪽 ${I18N.getLang() === 'zh' ? '已装备星穹之翼！点击任意已解锁章节即可一键瞬移！' : 'Aether Wings active! Jump to any unlocked chapter instantly!'}`
      : `🗺️ ${I18N.t('fastTravelLocked')}`;

    openModal(`🗺️ ${I18N.t('worldMap')}`, `
      <div class="wmap-wrap"><canvas id="worldMapCanvas"></canvas></div>
      <div class="info-banner">${tip}</div>
      <div class="ch-list">${chCards}</div>
    `, body => {
      const cv = body.querySelector('#worldMapCanvas');
      const pos = gameRef.getOverworldPos();
      Art.renderWorldMapCanvas(cv, pos.x, pos.y, st);

      body.querySelectorAll('[data-warp]').forEach(btn => {
        btn.onclick = () => {
          const cid = parseInt(btn.dataset.warp, 10);
          closeModal();
          gameRef.warpToChapter(cid);
        };
      });
      body.querySelectorAll('[data-need-wings]').forEach(btn => {
        btn.onclick = () => {
          gameRef.toast(I18N.t('fastTravelLocked'));
          openStore('tools');
        };
      });
      body.querySelectorAll('[data-unlock-ch]').forEach(btn => {
        btn.onclick = () => {
          storeTab = 'chapters';
          openStore('chapters');
        };
      });
    });
  }

  /* ---------------- 2. Reward Vault (IAA Ad Unlocks + Gold Supplies) ---------------- */
  function isProductOwned(p, st) {
    if (p.repeatable) return false;
    const g = p.grants || {};
    const chOk = !g.chapters || g.chapters.every(cid => st.unlockedChapters.includes(cid));
    const heroOk = !g.heroes || g.heroes.every(hid => st.unlockedHeroes.includes(hid));
    const toolOk = !g.tools || g.tools.every(tid => st.tools.includes(tid));
    return chOk && heroOk && toolOk;
  }

  function adBtnLabel(prod, st) {
    if (prod.repeatable || prod.adCost === 1) return I18N.t('storeWatchAdSingle');
    const done = (st.adProgress && st.adProgress[prod.id]) || 0;
    return I18N.t('storeWatchAd', { done, cost: prod.adCost });
  }

  function openStore(tab) {
    if (tab) storeTab = tab;
    const st = gameRef.getState();

    const tabsHtml = `
      <div class="tabs">
        <button class="tab-btn ${storeTab === 'chapters' ? 'active' : ''}" data-tab="chapters">🗺️ ${I18N.t('storeTabChapters')}</button>
        <button class="tab-btn ${storeTab === 'heroes' ? 'active' : ''}" data-tab="heroes">🦸 ${I18N.t('storeTabHeroes')}</button>
        <button class="tab-btn ${storeTab === 'tools' ? 'active' : ''}" data-tab="tools">✨ ${I18N.t('storeTabTools')}</button>
        <button class="tab-btn ${storeTab === 'items' ? 'active' : ''}" data-tab="items">🎁 ${I18N.t('storeTabItems')}</button>
      </div>
      <div class="wechat-note">🎬 ${I18N.t('storeWechatNote')}</div>
      <div class="store-grid" id="storeGrid"></div>
    `;

    openModal(I18N.t('storeTitle'), tabsHtml, body => {
      body.querySelectorAll('[data-tab]').forEach(b => {
        b.onclick = () => openStore(b.dataset.tab);
      });
      const grid = body.querySelector('#storeGrid');

      if (storeTab === 'chapters') {
        const freeList = D.CHAPTERS.filter(c => c.free)
          .map(c => `${c.emoji} ${I18N.t('chapterPrefix', { n: c.id })} ${I18N.pick(c.short)}`).join(' · ');
        let html = `<div class="free-banner">🎁 <strong>${I18N.t('freeChapterTag')}</strong>${I18N.t('sep')}${freeList}</div>`;
        D.PRODUCTS.filter(p => p.category === 'chapters').forEach(p => {
          const owned = isProductOwned(p, st);
          html += `
            <div class="store-card ${p.featured ? 'featured' : ''}">
              <div class="sc-ico">${p.emoji}</div>
              <div class="sc-body">
                <div class="sc-head"><b>${I18N.pick(p.name)}</b> ${p.featured ? `<span class="badge paid">${I18N.t('bundleSavings')}</span>` : ''}</div>
                <p>${I18N.pick(p.desc)}</p>
              </div>
              <div class="sc-act">
                ${owned
                  ? `<span class="badge owned">✅ ${I18N.t('storeOwned')}</span>`
                  : `<button class="sm-btn gold" data-watch-ad="${p.id}">${adBtnLabel(p, st)}</button>`}
              </div>
            </div>`;
        });
        grid.innerHTML = html;
      } else if (storeTab === 'heroes') {
        grid.innerHTML = D.HEROES.map(h => {
          const owned = st.unlockedHeroes.includes(h.id);
          const equipped = st.heroId === h.id;
          let actBtn = '';
          if (equipped) actBtn = `<span class="badge owned">⭐ ${I18N.t('storeEquipped')}</span>`;
          else if (owned) actBtn = `<button class="sm-btn primary" data-equip-hero="${h.id}">${I18N.t('storeEquip')}</button>`;
          else if (h.goldPrice) actBtn = `<button class="sm-btn primary" data-buy-hero-gold="${h.id}">${I18N.t('storeBuyGold', { price: h.goldPrice })}</button>`;
          else {
            const prod = D.PRODUCT_BY_ID[h.productId];
            actBtn = `<button class="sm-btn gold" data-watch-ad="${prod.id}">${adBtnLabel(prod, st)}</button>`;
          }
          return `
            <div class="store-card">
              <img class="sc-img" src="${Art.getHeroPortrait(h.id)}" alt="">
              <div class="sc-body">
                <div class="sc-head"><b>${I18N.pick(h.name)}</b></div>
                <p class="perk-txt">✨ ${I18N.t('perk')}${I18N.t('sep')}${I18N.pick(h.perkDesc)}</p>
              </div>
              <div class="sc-act">${actBtn}</div>
            </div>`;
        }).join('');
      } else if (storeTab === 'tools') {
        grid.innerHTML = D.TOOLS.map(tl => {
          const owned = st.tools.includes(tl.id);
          let actHtml = '';
          if (owned) {
            actHtml = `<span class="badge owned">✅ ${I18N.t('storeOwned')}</span>`;
          } else {
            const btns = [];
            if (tl.goldPrice) btns.push(`<button class="sm-btn primary" data-buy-tool-gold="${tl.id}">${I18N.t('storeBuyGold', { price: tl.goldPrice })}</button>`);
            if (tl.productId) {
              const prod = D.PRODUCT_BY_ID[tl.productId];
              btns.push(`<button class="sm-btn gold" data-watch-ad="${prod.id}">${adBtnLabel(prod, st)}</button>`);
            }
            actHtml = btns.join('');
          }
          return `
            <div class="store-card">
              <div class="sc-ico">${tl.emoji}</div>
              <div class="sc-body">
                <div class="sc-head"><b>${I18N.pick(tl.name)}</b></div>
                <p>${I18N.pick(tl.desc)}</p>
              </div>
              <div class="sc-act">${actHtml}</div>
            </div>`;
        }).join('');
      } else {
        const adPack = D.PRODUCT_BY_ID.ad_supply_pack;
        let html = `
          <div class="store-card featured">
            <div class="sc-ico">${adPack.emoji}</div>
            <div class="sc-body">
              <div class="sc-head"><b>${I18N.pick(adPack.name)}</b> <span class="badge free">${I18N.t('chapterFree')}</span></div>
              <p>${I18N.pick(adPack.desc)}</p>
            </div>
            <div class="sc-act">
              <button class="sm-btn gold" data-watch-ad="${adPack.id}">${adBtnLabel(adPack, st)}</button>
            </div>
          </div>`;
        html += D.SUPPLIES.map(sp => `
          <div class="store-card">
            <div class="sc-ico">${sp.emoji}</div>
            <div class="sc-body">
              <div class="sc-head"><b>${I18N.pick(sp.name)}</b></div>
              <p>${I18N.pick(sp.desc)}</p>
            </div>
            <div class="sc-act">
              <button class="sm-btn primary" data-buy-supply="${sp.id}">${I18N.t('storeBuyGold', { price: sp.price })}</button>
            </div>
          </div>`).join('');
        grid.innerHTML = html;
      }

      // Bind Rewarded Video Ad actions
      grid.querySelectorAll('[data-watch-ad]').forEach(btn => {
        btn.onclick = () => {
          const prod = D.PRODUCT_BY_ID[btn.dataset.watchAd];
          if (!prod) return;
          triggerAdUnlock(prod, () => openStore(storeTab));
        };
      });
      grid.querySelectorAll('[data-buy-hero-gold]').forEach(btn => {
        btn.onclick = () => {
          const h = D.HERO_BY_ID[btn.dataset.buyHeroGold];
          if (gameRef.spendGold(h.goldPrice)) {
            if (!st.unlockedHeroes.includes(h.id)) st.unlockedHeroes.push(h.id);
            st.heroId = h.id;
            gameRef.syncPartyStats();
            AudioFX.sfx.unlock();
            gameRef.toast(I18N.t('unlockedToast', { name: I18N.pick(h.name) }));
            gameRef.saveAndSync();
            openStore('heroes');
          }
        };
      });
      grid.querySelectorAll('[data-equip-hero]').forEach(btn => {
        btn.onclick = () => {
          st.heroId = btn.dataset.equipHero;
          gameRef.syncPartyStats();
          AudioFX.sfx.tap();
          gameRef.saveAndSync();
          openStore('heroes');
        };
      });
      grid.querySelectorAll('[data-buy-tool-gold]').forEach(btn => {
        btn.onclick = () => {
          const tl = D.TOOL_BY_ID[btn.dataset.buyToolGold];
          if (gameRef.spendGold(tl.goldPrice)) {
            if (!st.tools.includes(tl.id)) st.tools.push(tl.id);
            AudioFX.sfx.unlock();
            gameRef.toast(I18N.t('unlockedToast', { name: I18N.pick(tl.name) }));
            gameRef.saveAndSync();
            openStore('tools');
          }
        };
      });
      grid.querySelectorAll('[data-buy-supply]').forEach(btn => {
        btn.onclick = () => {
          const sp = D.SUPPLIES.find(x => x.id === btn.dataset.buySupply);
          if (gameRef.spendGold(sp.price)) {
            st.items[sp.id] = (st.items[sp.id] || 0) + sp.amount;
            AudioFX.sfx.chest();
            gameRef.toast(I18N.t('boughtToast', { name: I18N.pick(sp.name) }));
            gameRef.saveAndSync();
          }
        };
      });
    });
  }

  function triggerAdUnlock(prod, onAfter) {
    Platform.showRewardedAd(
      prod,
      () => {
        gameRef.recordAdProgress(prod);
        if (onAfter) onAfter();
      },
      () => {
        AudioFX.sfx.locked();
        gameRef.toast(I18N.t('adIncompleteToast'));
        if (onAfter) onAfter();
      },
      openSimulatedAdModal
    );
  }

  /* ---------------- Sandbox Rewarded Video Ad Player Modal ---------------- */
  function openSimulatedAdModal(prod, onComplete, onSkip) {
    const st = gameRef.getState();
    const done = prod.repeatable ? 0 : ((st.adProgress && st.adProgress[prod.id]) || 0);
    openModal(I18N.t('adPlayerTitle'), `
      <div class="checkout-box">
        <div class="co-emoji">🎬 ${prod.emoji}</div>
        <h3>${I18N.pick(prod.name)}</h3>
        <p>${I18N.pick(prod.desc)}</p>
        <div class="co-price">${done + 1} / ${prod.adCost} <span>🎬</span></div>
        <div class="co-note">${I18N.t('checkoutBridge')} (${Platform.getEnvName()})</div>
        <div class="co-btns">
          <button class="big-btn green" id="adConfirm">${I18N.t('adPlayerConfirm')}</button>
          <button class="big-btn ghost" id="adSkip">${I18N.t('adPlayerSkip')}</button>
        </div>
      </div>
    `, body => {
      body.querySelector('#adConfirm').onclick = () => { onComplete(); };
      body.querySelector('#adSkip').onclick = () => { onSkip(); };
    });
  }

  /* ---------------- Chapter Gate Locked Preview Modal ---------------- */
  function openGateLockModal(chapterId) {
    const ch = D.getChapter(chapterId);
    const prod = D.PRODUCT_BY_ID[ch.productId];
    const st = gameRef.getState();
    const done = (st.adProgress && st.adProgress[prod.id]) || 0;
    openModal(I18N.t('gateLockedTitle'), `
      <div class="checkout-box">
        <div class="co-emoji">${ch.emoji}</div>
        <h3>${I18N.t('chapterPrefix', { n: ch.id })} · ${I18N.pick(ch.name)}</h3>
        <p>${I18N.t('gateLockedDesc', { chName: I18N.pick(ch.name), cost: ch.adCost, done })}</p>
        <div class="co-price">🎬 ${done} / ${ch.adCost}</div>
        <div class="co-btns">
          <button class="big-btn gold" id="gateWatchAd">${I18N.t('storeWatchAd', { done, cost: ch.adCost })}</button>
          <button class="big-btn primary" id="gateOpenStore">👑 ${I18N.t('storeTitle')}</button>
          <button class="big-btn ghost" id="gateClose">${I18N.t('notNowBtn')}</button>
        </div>
      </div>
    `, body => {
      body.querySelector('#gateWatchAd').onclick = () => {
        triggerAdUnlock(prod, () => {
          if (st.unlockedChapters.includes(chapterId)) closeModal();
          else openGateLockModal(chapterId);
        });
      };
      body.querySelector('#gateOpenStore').onclick = () => { storeTab = 'chapters'; openStore('chapters'); };
      body.querySelector('#gateClose').onclick = closeModal;
    });
  }

  /* ---------------- 3. Critterdex (25 Original Critters by Chapter) ---------------- */
  function openDex() {
    const st = gameRef.getState();
    const sections = D.CHAPTERS.map(ch => {
      const list = D.CRITTERS.filter(c => c.chapter === ch.id);
      const unlocked = st.unlockedChapters.includes(ch.id);
      const chBadge = ch.free
        ? `<span class="badge free">${I18N.t('chapterFree')}</span>`
        : unlocked
          ? `<span class="badge owned">${I18N.t('chapterUnlocked')}</span>`
          : `<span class="badge paid">${I18N.t('chapterPaid')}</span>`;
      const cards = list.map(c => {
        const caught = st.caughtIds.includes(c.id);
        return `
          <div class="dex-card ${caught ? 'caught' : 'unseen'}">
            <img src="${Art.getCritterPortrait(c.id)}" alt="">
            <div class="dex-name">${caught ? I18N.pick(c.name) : '???'}</div>
            <div class="dex-meta">
              <span class="elem-tag ${c.elem}">${I18N.t('elemNames')[c.elem]}</span>
              ${c.boss ? '<span class="boss-tag">👑</span>' : ''}
            </div>
            <div class="dex-desc">${caught ? I18N.pick(c.desc) : I18N.t('unseenTag')}</div>
          </div>`;
      }).join('');
      return `
        <h3 class="sec-h">${ch.emoji} ${I18N.t('chapterPrefix', { n: ch.id })} · ${I18N.pick(ch.short)} ${chBadge}</h3>
        <div class="dex-grid">${cards}</div>`;
    }).join('');

    openModal(`📖 ${I18N.t('dex')} (${st.caughtIds.length}/${D.CRITTERS.length})`, sections);
  }

  /* ---------------- 4. Party, Crests & Active Hero ---------------- */
  function openParty() {
    const st = gameRef.getState();
    const hero = D.HERO_BY_ID[st.heroId] || D.HEROES[0];
    const crestsHtml = D.CHAPTERS.map(ch => {
      const has = st.crests.includes(ch.id);
      return `<div class="crest-chip ${has ? 'got' : ''}" title="${I18N.pick(ch.crest)}">${ch.emoji} ${has ? '🏆' : '·'}</div>`;
    }).join('');

    const partyHtml = st.party.map((p, idx) => {
      const cr = D.CRITTER_BY_ID[p.id];
      const active = idx === st.activePartnerIdx;
      const hpPct = Math.round((p.hp / p.maxHp) * 100);
      return `
        <div class="store-card ${active ? 'featured' : ''}">
          <img class="sc-img" src="${Art.getCritterPortrait(p.id)}" alt="">
          <div class="sc-body">
            <div class="sc-head"><b>${I18N.pick(cr.name)}</b> <span class="badge free">Lv.${p.lv}</span></div>
            <div class="mini-bar"><i style="width:${hpPct}%"></i></div>
            <p>HP ${p.hp}/${p.maxHp} · ${I18N.pick(cr.skill)}</p>
          </div>
          <div class="sc-act">
            ${active ? `<span class="badge owned">⭐ ${I18N.t('activePartner')}</span>` : `<button class="sm-btn primary" data-set-p="${idx}">${I18N.t('setPartner')}</button>`}
          </div>
        </div>`;
    }).join('');

    openModal(`🐾 ${I18N.t('party')}`, `
      <div class="crest-bar"><strong>🏆 ${I18N.t('crestsLabel')} (${st.crests.length}/5)${I18N.t('sep')}</strong> ${crestsHtml}</div>
      <div class="store-card">
        <img class="sc-img" src="${Art.getHeroPortrait(hero.id)}" alt="">
        <div class="sc-body">
          <div class="sc-head"><b>${I18N.pick(hero.name)}</b> <span class="badge owned">${I18N.t('activeHero')}</span></div>
          <p class="perk-txt">✨ ${I18N.pick(hero.perkDesc)}</p>
        </div>
        <div class="sc-act"><button class="sm-btn gold" id="switchHeroBtn">${I18N.t('storeTabHeroes')}</button></div>
      </div>
      <h3 class="sec-h">🐾 ${I18N.t('party')} (${st.party.length})</h3>
      <div class="store-grid">${partyHtml}</div>
    `, body => {
      body.querySelector('#switchHeroBtn').onclick = () => openStore('heroes');
      body.querySelectorAll('[data-set-p]').forEach(btn => {
        btn.onclick = () => {
          st.activePartnerIdx = parseInt(btn.dataset.setP, 10);
          AudioFX.sfx.tap();
          gameRef.saveAndSync();
          openParty();
        };
      });
    });
  }

  /* ---------------- 5. Bag & Fancy Tool Belt ---------------- */
  function openBag() {
    const st = gameRef.getState();
    const toolsHtml = D.TOOLS.map(tl => {
      const owned = st.tools.includes(tl.id);
      return `
        <div class="store-card ${owned ? '' : 'dim'}">
          <div class="sc-ico">${tl.emoji}</div>
          <div class="sc-body">
            <div class="sc-head"><b>${I18N.pick(tl.name)}</b> ${owned ? `<span class="badge owned">✅ ${I18N.t('storeOwned')}</span>` : `<span class="badge paid">🔒</span>`}</div>
            <p>${I18N.pick(tl.desc)}</p>
          </div>
          <div class="sc-act">${owned ? '' : `<button class="sm-btn gold" data-go-tools="1">${I18N.t('shop')}</button>`}</div>
        </div>`;
    }).join('');

    openModal(`🎒 ${I18N.t('bag')}`, `
      <div class="bag-stats">
        <span>🪙 ${I18N.t('gold')}${I18N.t('sep')}<b>${st.gold}</b></span>
        <span>🔵 ${I18N.t('orbs')}${I18N.t('sep')}<b>${st.items.orbs}</b></span>
        <span>🌈 ${I18N.t('superOrbs')}${I18N.t('sep')}<b>${st.items.superOrbs}</b></span>
        <span>👑 ${I18N.t('masterOrbs')}${I18N.t('sep')}<b>${st.items.masterOrbs}</b></span>
        <span>🍓 ${I18N.t('treats')}${I18N.t('sep')}<b>${st.items.treats}</b></span>
      </div>
      <h3 class="sec-h">✨ ${I18N.t('storeTabTools')} (${st.tools.length}/${D.TOOLS.length})</h3>
      <div class="store-grid">${toolsHtml}</div>
    `, body => {
      body.querySelectorAll('[data-go-tools]').forEach(b => { b.onclick = () => openStore('tools'); });
    });
  }

  /* ---------------- 6. Settings & WeChat Readiness Panel ---------------- */
  function openSettings() {
    const st = gameRef.getState();
    openModal(I18N.t('settingsTitle'), `
      <div class="wechat-box">
        <div class="badge owned">✅ ${I18N.t('wechatReadyBadge')}</div>
        <p>${I18N.t('wechatReadyInfo')}</p>
        <small>${I18N.t('runtimeLabel')}${I18N.t('sep')}<code>${Platform.getEnvName()}</code> · ${I18N.t('adViewsLabel')}${I18N.t('sep')}<b>${st.adViewsTotal || 0}</b></small>
      </div>
      <div class="set-btns">
        <button class="big-btn" id="setLangBtn">🌐 ${I18N.getLang() === 'zh' ? 'Switch to English' : '切换为简体中文'}</button>
        <button class="big-btn ghost" id="setResetBtn">🗑️ ${I18N.t('resetSave')}</button>
      </div>
    `, body => {
      body.querySelector('#setLangBtn').onclick = () => {
        I18N.toggleLang();
        gameRef.refreshLabels();
        openSettings();
      };
      body.querySelector('#setResetBtn').onclick = () => {
        if (confirm(I18N.t('resetConfirm'))) {
          closeModal();
          gameRef.resetGame();
        }
      };
    });
  }

  return {
    bind, openModal, closeModal,
    openWorldMap, openStore, openGateLockModal,
    openDex, openParty, openBag, openSettings,
  };
})();
