'use strict';
/* ==========================================================================
 * art.js — Crisp Procedural Classic Fantasy RPG Canvas Renderer
 * 100% Original Vector/Canvas Art · Zero External Image Dependencies
 * Renders: 5 Biome Palettes, Landmarks, Animated Seal Gates, 5 Heroes +
 * Fancy Tool VFX, 25 Original Fantasy Critters & Cached Portraits.
 * ========================================================================== */
const Art = (() => {
  const PI2 = Math.PI * 2;
  const portraitCache = {};

  const BIOME_PAL = {
    1: { grass: '#6ecb63', grass2: '#58b84e', tall: '#2d8a3e', tall2: '#48b35a', path: '#dfc493', path2: '#c7a974', sand: '#f3df9b', plaza: '#e8dec8', plaza2: '#d5c8ad', cliff: '#7a7066', cliff2: '#5d544b', water: '#2b95d6', shallow: '#5cc8f2', floor: '#3f5242', wall: '#253328' },
    2: { grass: '#5cc984', grass2: '#46b36e', tall: '#1f9d7c', tall2: '#38c79e', path: '#e8d7b2', path2: '#d0bc92', sand: '#f8e6a8', plaza: '#ece5d6', plaza2: '#d6ccb8', cliff: '#7d8590', cliff2: '#5c6470', water: '#0284c7', shallow: '#38d9e8', floor: '#1d4d5e', wall: '#10313d' },
    3: { grass: '#8cc959', grass2: '#73b043', tall: '#c78a28', tall2: '#e6a83c', path: '#e8c487', path2: '#cfab6c', sand: '#f2cf7e', plaza: '#edd8b0', plaza2: '#d6bc8e', cliff: '#a66b3c', cliff2: '#7f4c24', water: '#0ea5e9', shallow: '#5eead4', floor: '#614326', wall: '#422b16' },
    4: { grass: '#b5d9e8', grass2: '#9cc7db', tall: '#5ea4cf', tall2: '#89c7eb', path: '#cfdbe6', path2: '#b3c4d4', sand: '#dce8f2', plaza: '#e4eef7', plaza2: '#c8d9eb', cliff: '#627994', cliff2: '#465a73', water: '#1d4ed8', shallow: '#7dd3fc', floor: '#2a415e', wall: '#192a40' },
    5: { grass: '#c8b6f2', grass2: '#b39ce8', tall: '#9354e6', tall2: '#d97cf7', path: '#ede4ff', path2: '#d6c6fa', sand: '#f5ebff', plaza: '#f3edff', plaza2: '#ded2fa', cliff: '#5b448a', cliff2: '#3e2c63', water: '#1e1646', shallow: '#7c5ce6', floor: '#31235c', wall: '#1e143d' },
  };

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  function ell(c, x, y, rx, ry) {
    c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, PI2);
  }

  function drawStar(c, x, y, r1, r2, n, rot) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (rot || -Math.PI / 2) + i * Math.PI / n;
      const r = i % 2 ? r2 : r1;
      c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }

  /* ---------------- Tile Renderer ---------------- */
  function drawTile(c, tile, zone, decal, px, py, S, time, unlockedChapters) {
    const T = World.T;
    const p = BIOME_PAL[zone] || BIOME_PAL[1];

    if (tile === T.DEEP) {
      c.fillStyle = zone === 5 ? '#1b1440' : p.water;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      if (zone === 5) {
        // Twinkling cosmos stars
        const hash = ((px * 37 + py * 17) & 255);
        if (hash < 45) {
          const tw = 0.4 + 0.6 * Math.sin(time * 2.5 + hash);
          c.fillStyle = `rgba(255,244,180,${tw.toFixed(2)})`;
          c.fillRect(px + (hash % 18) * S / 24, py + ((hash * 7) % 18) * S / 24, S * 0.1, S * 0.1);
        }
      } else {
        const wave = Math.sin(time * 2.2 + px * 0.08 + py * 0.05) * S * 0.08;
        c.fillStyle = 'rgba(255,255,255,0.16)';
        c.fillRect(px + S * 0.18 + wave, py + S * 0.35, S * 0.45, S * 0.08);
        c.fillRect(px + S * 0.32 - wave, py + S * 0.72, S * 0.35, S * 0.07);
      }
      return;
    }

    if (tile === T.SHALLOW) {
      c.fillStyle = p.shallow;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      const wv = Math.sin(time * 3 + px * 0.12 + py * 0.09) * S * 0.09;
      c.fillStyle = 'rgba(255,255,255,0.38)';
      c.fillRect(px + S * 0.2 + wv, py + S * 0.32, S * 0.48, S * 0.09);
      c.fillRect(px + S * 0.28 - wv, py + S * 0.68, S * 0.32, S * 0.07);
      return;
    }

    if (tile === T.SAND) {
      c.fillStyle = p.sand;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.fillStyle = 'rgba(180,130,50,0.16)';
      c.fillRect(px + S * 0.15, py + S * 0.28, S * 0.12, S * 0.06);
      c.fillRect(px + S * 0.65, py + S * 0.72, S * 0.14, S * 0.06);
      return;
    }

    if (tile === T.GRASS || tile === T.FLOWERS || tile === T.TALL) {
      c.fillStyle = ((Math.round(px / S) + Math.round(py / S)) & 1) ? p.grass : p.grass2;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      if (tile === T.FLOWERS) {
        const cols = zone === 5 ? ['#fde047', '#f472b6', '#67e8f9'] : ['#fff', '#fde047', '#f472b6'];
        for (let k = 0; k < 3; k++) {
          c.fillStyle = cols[k];
          c.beginPath();
          c.arc(px + S * (0.22 + k * 0.28), py + S * (0.3 + (k % 2) * 0.36), S * 0.09, 0, PI2);
          c.fill();
        }
      } else if (tile === T.TALL) {
        const sway = Math.sin(time * 3.2 + px * 0.15) * S * 0.06;
        for (let k = 0; k < 3; k++) {
          const bx = px + S * (0.18 + k * 0.28);
          const by = py + S * 0.84;
          c.fillStyle = k % 2 ? p.tall2 : p.tall;
          c.beginPath();
          c.moveTo(bx - S * 0.1, by);
          c.lineTo(bx + sway, by - S * 0.56);
          c.lineTo(bx + S * 0.12, by);
          c.closePath();
          c.fill();
        }
        // Subtle sparkle hint that critters hide here
        if (((Math.round(px / S) * 13 + Math.round(py / S) * 7) % 5) === 0) {
          c.fillStyle = 'rgba(255,255,255,0.45)';
          c.fillRect(px + S * 0.48, py + S * 0.24, S * 0.08, S * 0.08);
        }
      } else if (decal > 0) {
        c.fillStyle = 'rgba(255,255,255,0.22)';
        c.fillRect(px + S * 0.3, py + S * 0.45, S * 0.1, S * 0.1);
      }
      return;
    }

    if (tile === T.SNOW) {
      c.fillStyle = ((Math.round(px / S) + Math.round(py / S)) & 1) ? '#eef6fc' : '#e2eff9';
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.fillStyle = 'rgba(148,197,235,0.35)';
      c.fillRect(px + S * 0.22, py + S * 0.65, S * 0.18, S * 0.06);
      return;
    }

    if (tile === T.ICE) {
      c.fillStyle = '#a5e6ff';
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.strokeStyle = 'rgba(255,255,255,0.65)';
      c.lineWidth = Math.max(1, S * 0.06);
      c.beginPath();
      c.moveTo(px + S * 0.18, py + S * 0.22); c.lineTo(px + S * 0.46, py + S * 0.5);
      c.moveTo(px + S * 0.58, py + S * 0.3); c.lineTo(px + S * 0.82, py + S * 0.54);
      c.stroke();
      return;
    }

    if (tile === T.PATH) {
      c.fillStyle = p.path;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.fillStyle = p.path2;
      c.fillRect(px + S * 0.12, py + S * 0.15, S * 0.32, S * 0.22);
      c.fillRect(px + S * 0.54, py + S * 0.58, S * 0.3, S * 0.22);
      return;
    }

    if (tile === T.PLAZA) {
      c.fillStyle = p.plaza;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.strokeStyle = p.plaza2;
      c.lineWidth = 1;
      c.strokeRect(px + 1, py + 1, S - 2, S - 2);
      if (zone === 5) {
        c.fillStyle = 'rgba(250,204,21,0.22)';
        c.fillRect(px + S * 0.42, py + S * 0.42, S * 0.16, S * 0.16);
      }
      return;
    }

    if (tile === T.BRIDGE) {
      if (zone === 5) {
        // Rainbow Celestial Skybridge!
        const hue = ((px * 2 + py * 2 + time * 45) % 360);
        c.fillStyle = `hsl(${hue}, 82%, 72%)`;
        c.fillRect(px, py, S + 0.5, S + 0.5);
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.fillRect(px, py + S * 0.1, S, S * 0.12);
        c.fillRect(px, py + S * 0.78, S, S * 0.12);
      } else {
        c.fillStyle = '#a86f3e';
        c.fillRect(px, py, S + 0.5, S + 0.5);
        c.fillStyle = '#855229';
        for (let k = 0; k < 4; k++) c.fillRect(px, py + k * S * 0.25, S, S * 0.05);
        c.fillStyle = '#d49a62';
        c.fillRect(px, py, S, S * 0.09);
        c.fillRect(px, py + S * 0.91, S, S * 0.09);
      }
      return;
    }

    if (tile === T.CLIFF) {
      c.fillStyle = p.cliff;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.fillStyle = p.cliff2;
      c.fillRect(px, py + S * 0.62, S + 0.5, S * 0.38);
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(px + S * 0.1, py + S * 0.1, S * 0.8, S * 0.14);
      return;
    }

    if (tile === T.FLOOR) {
      c.fillStyle = ((Math.round(px / S) + Math.round(py / S)) & 1) ? p.floor : p.wall;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.fillRect(px + 1, py + 1, S - 2, S - 2);
      return;
    }

    if (tile === T.WALL) {
      c.fillStyle = p.wall;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fillRect(px + S * 0.08, py + S * 0.08, S * 0.84, S * 0.24);
      return;
    }

    if (tile === T.GATE_CH4 || tile === T.GATE_CH5) {
      const chId = tile === T.GATE_CH4 ? 4 : 5;
      const unlocked = unlockedChapters && unlockedChapters.includes(chId);
      // Draw underlying bridge/path
      c.fillStyle = chId === 5 ? '#c4b5fd' : p.path;
      c.fillRect(px, py, S + 0.5, S + 0.5);
      const pulse = 0.65 + 0.35 * Math.sin(time * 4.5);
      if (unlocked) {
        c.fillStyle = chId === 5 ? `rgba(192,132,252,${0.25 * pulse})` : `rgba(56,189,248,${0.25 * pulse})`;
        c.fillRect(px, py, S, S);
      } else {
        // Shimmering Arcane Chapter Seal Barrier
        const grad = c.createLinearGradient(px, py, px + S, py + S);
        if (chId === 4) {
          grad.addColorStop(0, `rgba(14,165,233,${0.88 * pulse})`);
          grad.addColorStop(1, `rgba(129,140,248,${0.88 * pulse})`);
        } else {
          grad.addColorStop(0, `rgba(168,85,247,${0.9 * pulse})`);
          grad.addColorStop(1, `rgba(244,114,182,${0.9 * pulse})`);
        }
        c.fillStyle = grad;
        c.fillRect(px, py, S, S);
        c.strokeStyle = '#fef08a';
        c.lineWidth = Math.max(1.5, S * 0.08);
        c.strokeRect(px + 2, py + 2, S - 4, S - 4);
        c.fillStyle = '#fff';
        c.font = `bold ${Math.round(S * 0.42)}px sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('🔒', px + S * 0.5, py + S * 0.52);
      }
    }
  }

  /* ---------------- Scenery & Landmark Objects ---------------- */
  function drawObject(c, o, px, py, S, time) {
    const w = (o.w || 1) * S;
    const h = (o.h || 1) * S;

    if (o.kind === 'tree') {
      c.fillStyle = 'rgba(0,0,0,0.18)'; ell(c, px + S * 0.5, py + S * 0.88, S * 0.4, S * 0.16); c.fill();
      c.fillStyle = '#7c4a26'; c.fillRect(px + S * 0.38, py + S * 0.55, S * 0.24, S * 0.34);
      c.fillStyle = '#257a3c'; ell(c, px + S * 0.5, py + S * 0.42, S * 0.44, S * 0.38); c.fill();
      c.fillStyle = '#38a852'; ell(c, px + S * 0.46, py + S * 0.33, S * 0.34, S * 0.28); c.fill();
      c.fillStyle = '#6fe078'; ell(c, px + S * 0.38, py + S * 0.24, S * 0.16, S * 0.12); c.fill();
      return;
    }

    if (o.kind === 'bush') {
      c.fillStyle = '#2d8f47'; ell(c, px + S * 0.5, py + S * 0.62, S * 0.4, S * 0.28); c.fill();
      c.fillStyle = '#4cc968'; ell(c, px + S * 0.44, py + S * 0.54, S * 0.28, S * 0.2); c.fill();
      c.fillStyle = '#fb7185';
      c.beginPath(); c.arc(px + S * 0.36, py + S * 0.54, S * 0.06, 0, PI2); c.arc(px + S * 0.64, py + S * 0.6, S * 0.06, 0, PI2); c.fill();
      return;
    }

    if (o.kind === 'palm') {
      c.fillStyle = 'rgba(0,0,0,0.16)'; ell(c, px + S * 0.5, py + S * 0.88, S * 0.34, S * 0.14); c.fill();
      c.strokeStyle = '#9a6534'; c.lineWidth = S * 0.18; c.lineCap = 'round';
      c.beginPath(); c.moveTo(px + S * 0.52, py + S * 0.86); c.quadraticCurveTo(px + S * 0.4, py + S * 0.55, px + S * 0.5, py + S * 0.28); c.stroke();
      const fronds = [[-0.4, -0.05], [0.4, -0.05], [-0.3, -0.25], [0.3, -0.25], [0, -0.32]];
      c.fillStyle = '#22a858';
      fronds.forEach(([fx, fy]) => {
        ell(c, px + S * (0.5 + fx * 0.65), py + S * (0.28 + fy * 0.65), S * 0.28, S * 0.11); c.fill();
      });
      return;
    }

    if (o.kind === 'cactus') {
      c.fillStyle = 'rgba(0,0,0,0.16)'; ell(c, px + S * 0.5, py + S * 0.88, S * 0.28, S * 0.12); c.fill();
      c.fillStyle = '#1f9d55';
      rr(c, px + S * 0.38, py + S * 0.2, S * 0.24, S * 0.68, S * 0.1); c.fill();
      rr(c, px + S * 0.18, py + S * 0.36, S * 0.22, S * 0.14, S * 0.06); c.fill();
      rr(c, px + S * 0.6, py + S * 0.44, S * 0.22, S * 0.14, S * 0.06); c.fill();
      c.fillStyle = '#f43f5e'; c.beginPath(); c.arc(px + S * 0.5, py + S * 0.18, S * 0.09, 0, PI2); c.fill();
      return;
    }

    if (o.kind === 'pine') {
      c.fillStyle = 'rgba(0,0,0,0.16)'; ell(c, px + S * 0.5, py + S * 0.88, S * 0.36, S * 0.14); c.fill();
      c.fillStyle = '#5c3c24'; c.fillRect(px + S * 0.42, py + S * 0.68, S * 0.16, S * 0.22);
      c.fillStyle = '#1f6f78';
      c.beginPath(); c.moveTo(px + S * 0.5, py + S * 0.08); c.lineTo(px + S * 0.12, py + S * 0.74); c.lineTo(px + S * 0.88, py + S * 0.74); c.closePath(); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(px + S * 0.5, py + S * 0.08); c.lineTo(px + S * 0.3, py + S * 0.36); c.lineTo(px + S * 0.7, py + S * 0.36); c.closePath(); c.fill();
      return;
    }

    if (o.kind === 'coral_rock' || o.kind === 'ice_crystal' || o.kind === 'crystal') {
      const col = o.kind === 'coral_rock' ? '#fb7185' : o.kind === 'ice_crystal' ? '#38bdf8' : '#c084fc';
      const hi  = o.kind === 'coral_rock' ? '#fecdd3' : o.kind === 'ice_crystal' ? '#e0f2fe' : '#f3e8ff';
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(px + S * 0.5, py + S * 0.1); c.lineTo(px + S * 0.82, py + S * 0.62);
      c.lineTo(px + S * 0.66, py + S * 0.88); c.lineTo(px + S * 0.34, py + S * 0.88);
      c.lineTo(px + S * 0.18, py + S * 0.62); c.closePath(); c.fill();
      c.fillStyle = hi;
      c.beginPath(); c.moveTo(px + S * 0.5, py + S * 0.14); c.lineTo(px + S * 0.64, py + S * 0.55); c.lineTo(px + S * 0.44, py + S * 0.55); c.closePath(); c.fill();
      return;
    }

    if (o.kind === 'pillar' || o.kind === 'star_pillar' || o.kind === 'obelisk') {
      c.fillStyle = o.kind === 'obelisk' ? '#d97706' : o.kind === 'star_pillar' ? '#e9d5ff' : '#cbd5e1';
      rr(c, px + S * 0.24, py + S * 0.1, S * 0.52, h - S * 0.16, S * 0.08); c.fill();
      c.fillStyle = o.kind === 'obelisk' ? '#fde047' : '#a855f7';
      drawStar(c, px + S * 0.5, py + S * 0.36, S * 0.18, S * 0.08, 4, 0); c.fill();
      return;
    }

    if (o.kind === 'cottage' || o.kind === 'shop_house') {
      const isShop = o.kind === 'shop_house';
      c.fillStyle = 'rgba(0,0,0,0.22)'; rr(c, px + 4, py + h - S * 0.28, w - 4, S * 0.32, 6); c.fill();
      // Walls
      c.fillStyle = isShop ? '#fff7ed' : '#fef3c7';
      rr(c, px + S * 0.1, py + S * 0.45, w - S * 0.2, h - S * 0.52, 4); c.fill();
      // Roof
      c.fillStyle = isShop ? '#7c3aed' : '#d9534f';
      c.beginPath();
      c.moveTo(px, py + S * 0.58); c.lineTo(px + w * 0.5, py); c.lineTo(px + w, py + S * 0.58); c.closePath(); c.fill();
      // Door & Windows
      c.fillStyle = '#78350f';
      rr(c, px + w * 0.4, py + h - S * 0.65, w * 0.2, S * 0.58, 3); c.fill();
      c.fillStyle = '#38bdf8';
      c.fillRect(px + S * 0.32, py + h - S * 0.55, S * 0.36, S * 0.32);
      c.fillRect(px + w - S * 0.68, py + h - S * 0.55, S * 0.36, S * 0.32);
      if (isShop) {
        c.fillStyle = '#fde047';
        c.font = `bold ${Math.round(S * 0.45)}px sans-serif`;
        c.textAlign = 'center'; c.fillText('💎', px + w * 0.5, py + S * 0.42);
      }
      return;
    }

    if (o.kind === 'windmill') {
      c.fillStyle = '#f5f0e1';
      c.beginPath(); c.moveTo(px + w * 0.22, py + h - 2); c.lineTo(px + w * 0.34, py + S * 0.5); c.lineTo(px + w * 0.66, py + S * 0.5); c.lineTo(px + w * 0.78, py + h - 2); c.closePath(); c.fill();
      c.fillStyle = '#dc2626';
      c.beginPath(); c.moveTo(px + w * 0.25, py + S * 0.55); c.lineTo(px + w * 0.5, py + S * 0.12); c.lineTo(px + w * 0.75, py + S * 0.55); c.closePath(); c.fill();
      // Spinning blades
      c.save();
      c.translate(px + w * 0.5, py + S * 0.65);
      c.rotate(time * 1.1);
      c.fillStyle = '#fbbf24';
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2);
        c.fillRect(-S * 0.08, 0, S * 0.16, S * 0.9);
      }
      c.restore();
      return;
    }

    if (o.kind === 'lighthouse') {
      c.fillStyle = '#fff';
      rr(c, px + w * 0.24, py + S * 0.4, w * 0.52, h - S * 0.44, 4); c.fill();
      c.fillStyle = '#ef4444';
      c.fillRect(px + w * 0.24, py + S * 0.85, w * 0.52, S * 0.35);
      c.fillRect(px + w * 0.24, py + S * 1.6, w * 0.52, S * 0.35);
      const glow = 0.5 + 0.5 * Math.sin(time * 3);
      c.fillStyle = `rgba(254,240,138,${glow.toFixed(2)})`;
      c.beginPath(); c.arc(px + w * 0.5, py + S * 0.36, S * 0.42, 0, PI2); c.fill();
      c.fillStyle = '#1e293b';
      c.beginPath(); c.moveTo(px + w * 0.2, py + S * 0.32); c.lineTo(px + w * 0.5, py); c.lineTo(px + w * 0.8, py + S * 0.32); c.closePath(); c.fill();
      return;
    }

    if (o.kind === 'pyramid') {
      c.fillStyle = '#eab308';
      c.beginPath(); c.moveTo(px + w * 0.5, py); c.lineTo(px + w, py + h - 4); c.lineTo(px, py + h - 4); c.closePath(); c.fill();
      c.fillStyle = '#ca8a04';
      c.beginPath(); c.moveTo(px + w * 0.5, py); c.lineTo(px + w, py + h - 4); c.lineTo(px + w * 0.55, py + h - 4); c.closePath(); c.fill();
      c.fillStyle = '#fef08a';
      drawStar(c, px + w * 0.5, py + S * 0.55, S * 0.24, S * 0.1, 4, 0); c.fill();
      return;
    }

    if (o.kind === 'castle' || o.kind === 'skytemple') {
      const isSky = o.kind === 'skytemple';
      c.fillStyle = isSky ? '#f5f3ff' : '#dbeafe';
      rr(c, px + S * 0.2, py + S * 0.6, w - S * 0.4, h - S * 0.65, 6); c.fill();
      c.fillStyle = isSky ? '#9333ea' : '#2563eb';
      // 3 spires
      [0.2, 0.5, 0.8].forEach((f, idx) => {
        const sh = idx === 1 ? S * 0.9 : S * 0.6;
        c.beginPath();
        c.moveTo(px + w * f - S * 0.36, py + S * 0.68);
        c.lineTo(px + w * f, py + S * 0.68 - sh);
        c.lineTo(px + w * f + S * 0.36, py + S * 0.68);
        c.closePath(); c.fill();
      });
      c.fillStyle = isSky ? '#fde047' : '#67e8f9';
      drawStar(c, px + w * 0.5, py + h * 0.58, S * 0.32, S * 0.14, 5, time * 0.4); c.fill();
      return;
    }

    if (o.kind === 'fountain' || o.kind === 'hotspring' || o.kind === 'starwell') {
      const isHot = o.kind === 'hotspring', isStar = o.kind === 'starwell';
      c.fillStyle = isHot ? '#78716c' : isStar ? '#ede9fe' : '#e2e8f0';
      ell(c, px + w * 0.5, py + h * 0.55, w * 0.46, h * 0.38); c.fill();
      c.fillStyle = isHot ? '#38bdf8' : isStar ? '#a855f7' : '#22d3ee';
      ell(c, px + w * 0.5, py + h * 0.52, w * 0.36, h * 0.28); c.fill();
      const r = (0.14 + 0.14 * ((time * 1.4) % 1)) * w;
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2;
      ell(c, px + w * 0.5, py + h * 0.5, r, r * 0.65); c.stroke();
      c.fillStyle = '#fff'; c.font = `${Math.round(S * 0.46)}px sans-serif`; c.textAlign = 'center';
      c.fillText(isHot ? '♨️' : isStar ? '✨' : '💧', px + w * 0.5, py + h * 0.52);
      return;
    }

    if (o.kind === 'waystone') {
      const pulse = 0.65 + 0.35 * Math.sin(time * 3.5);
      c.fillStyle = `rgba(56,189,248,${0.28 * pulse})`;
      ell(c, px + S * 0.5, py + S * 0.6, S * 0.5, S * 0.35); c.fill();
      c.fillStyle = '#475569';
      c.beginPath(); c.moveTo(px + S * 0.5, py + S * 0.08); c.lineTo(px + S * 0.78, py + S * 0.85); c.lineTo(px + S * 0.22, py + S * 0.85); c.closePath(); c.fill();
      c.fillStyle = '#38bdf8';
      drawStar(c, px + S * 0.5, py + S * 0.48, S * 0.2, S * 0.09, 4, time); c.fill();
      return;
    }

    if (o.kind === 'portal' || o.kind === 'exitmat') {
      const isExit = o.kind === 'exitmat';
      const pulse = 0.75 + 0.25 * Math.sin(time * 4);
      c.fillStyle = isExit ? 'rgba(250,204,21,0.55)' : `rgba(168,85,247,${0.55 * pulse})`;
      ell(c, px + S * 0.5, py + S * 0.52, S * 0.46, S * 0.38); c.fill();
      c.strokeStyle = isExit ? '#fef08a' : '#f0abfc';
      c.lineWidth = Math.max(2, S * 0.08);
      ell(c, px + S * 0.5, py + S * 0.52, S * 0.34 * pulse, S * 0.26 * pulse); c.stroke();
      c.fillStyle = '#fff'; c.font = `bold ${Math.round(S * 0.46)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(isExit ? '🚪' : '🌀', px + S * 0.5, py + S * 0.54);
      return;
    }

    if (o.kind === 'sign') {
      c.fillStyle = '#78350f'; c.fillRect(px + S * 0.44, py + S * 0.55, S * 0.12, S * 0.35);
      c.fillStyle = '#d97706'; rr(c, px + S * 0.16, py + S * 0.22, S * 0.68, S * 0.4, 3); c.fill();
      c.fillStyle = '#fef3c7'; c.fillRect(px + S * 0.25, py + S * 0.34, S * 0.5, S * 0.06); c.fillRect(px + S * 0.25, py + S * 0.46, S * 0.36, S * 0.06);
    }
  }

  /* ---------------- Treasure Chest ---------------- */
  function drawChest(c, opened, px, py, S, time) {
    c.fillStyle = 'rgba(0,0,0,0.22)'; ell(c, px + S * 0.5, py + S * 0.84, S * 0.36, S * 0.14); c.fill();
    c.fillStyle = opened ? '#78716c' : '#b45309';
    rr(c, px + S * 0.16, py + S * 0.34, S * 0.68, S * 0.48, 4); c.fill();
    c.fillStyle = opened ? '#a8a29e' : '#f59e0b';
    rr(c, px + S * 0.14, py + S * (opened ? 0.2 : 0.28), S * 0.72, S * 0.2, 4); c.fill();
    c.fillStyle = '#fef08a';
    c.fillRect(px + S * 0.43, py + S * 0.44, S * 0.14, S * 0.14);
    if (!opened) {
      const sp = 0.5 + 0.5 * Math.sin(time * 5 + px);
      c.fillStyle = `rgba(254,240,138,${sp.toFixed(2)})`;
      drawStar(c, px + S * 0.78, py + S * 0.22, S * 0.14, S * 0.05, 4, time); c.fill();
    }
  }

  /* ---------------- NPC Renderer ---------------- */
  function drawNpc(c, npc, px, py, S, time, hasGift) {
    const bob = Math.sin(time * 3 + npc.x) * S * 0.04;
    const pal = {
      elder:    { robe: '#15803d', hair: '#e2e8f0', hat: '#166534' },
      merchant: { robe: '#9333ea', hair: '#f59e0b', hat: '#eab308' },
      guard:    { robe: '#0284c7', hair: '#94a3b8', hat: '#38bdf8' },
      sailor:   { robe: '#0369a1', hair: '#78350f', hat: '#f8fafc' },
      nomad:    { robe: '#d97706', hair: '#451a03', hat: '#fde047' },
      valkyrie: { robe: '#2563eb', hair: '#bae6fd', hat: '#e0f2fe' },
      oracle:   { robe: '#7e22ce', hair: '#f5d0fe', hat: '#fde047' },
    }[npc.look] || { robe: '#3b82f6', hair: '#5c3a21', hat: '#facc15' };

    c.fillStyle = 'rgba(0,0,0,0.22)'; ell(c, px + S * 0.5, py + S * 0.88, S * 0.3, S * 0.12); c.fill();
    // Body
    c.fillStyle = pal.robe;
    rr(c, px + S * 0.26, py + S * 0.46 + bob, S * 0.48, S * 0.4, 6); c.fill();
    // Head
    c.fillStyle = '#fde2c4';
    c.beginPath(); c.arc(px + S * 0.5, py + S * 0.34 + bob, S * 0.21, 0, PI2); c.fill();
    // Hat / Hair
    c.fillStyle = pal.hat;
    c.beginPath(); c.arc(px + S * 0.5, py + S * 0.25 + bob, S * 0.22, Math.PI, 0); c.fill();
    // Eyes
    c.fillStyle = '#1e293b';
    c.fillRect(px + S * 0.41, py + S * 0.33 + bob, S * 0.06, S * 0.07);
    c.fillRect(px + S * 0.54, py + S * 0.33 + bob, S * 0.06, S * 0.07);
    // Exclamation / Gift indicator
    if (hasGift) {
      const bounce = Math.sin(time * 5) * S * 0.07;
      c.fillStyle = '#facc15';
      c.beginPath(); c.arc(px + S * 0.5, py - S * 0.06 + bounce, S * 0.16, 0, PI2); c.fill();
      c.fillStyle = '#78350f'; c.font = `bold ${Math.round(S * 0.24)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', px + S * 0.5, py - S * 0.05 + bounce);
    }
  }

  /* ---------------- Playable Hero Renderer + Fancy Tool VFX ---------------- */
  function drawHero(c, heroId, px, py, S, dir, walkPhase, time, tools, isSurfing) {
    const hero = GameData.HERO_BY_ID[heroId] || GameData.HEROES[0];
    const col = hero.colors;
    const bob = Math.abs(Math.sin(walkPhase)) * S * 0.09;

    // Chrono Lantern warm golden aura
    if (tools && tools.includes('lantern')) {
      const grad = c.createRadialGradient(px + S * 0.5, py + S * 0.5, S * 0.1, px + S * 0.5, py + S * 0.5, S * 1.35);
      grad.addColorStop(0, 'rgba(254,240,138,0.42)');
      grad.addColorStop(1, 'rgba(254,240,138,0)');
      c.fillStyle = grad;
      c.beginPath(); c.arc(px + S * 0.5, py + S * 0.5, S * 1.35, 0, PI2); c.fill();
    }

    // Tideglider Skiff under hero when surfing shallow water
    if (isSurfing) {
      c.fillStyle = '#f59e0b';
      ell(c, px + S * 0.5, py + S * 0.82, S * 0.48, S * 0.2); c.fill();
      c.strokeStyle = '#fef08a'; c.lineWidth = 2;
      ell(c, px + S * 0.5, py + S * 0.82, S * 0.42, S * 0.15); c.stroke();
    } else {
      c.fillStyle = 'rgba(0,0,0,0.24)';
      ell(c, px + S * 0.5, py + S * 0.88, S * 0.32, S * 0.13); c.fill();
    }

    // Aether Wings glowing angel wings behind hero!
    if (tools && tools.includes('wings')) {
      const flap = Math.sin(time * 7) * S * 0.1;
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath();
      c.moveTo(px + S * 0.36, py + S * 0.52 - bob);
      c.quadraticCurveTo(px - S * 0.25, py + S * 0.2 - bob + flap, px - S * 0.1, py + S * 0.68 - bob);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(px + S * 0.64, py + S * 0.52 - bob);
      c.quadraticCurveTo(px + S * 1.25, py + S * 0.2 - bob + flap, px + S * 1.1, py + S * 0.68 - bob);
      c.closePath(); c.fill();
    }

    // Cape
    c.fillStyle = col.cape;
    rr(c, px + S * 0.2, py + S * 0.46 - bob, S * 0.6, S * 0.38, 6); c.fill();
    // Tunic
    c.fillStyle = col.tunic;
    rr(c, px + S * 0.27, py + S * 0.46 - bob, S * 0.46, S * 0.38, 5); c.fill();
    // Trim belt
    c.fillStyle = col.trim;
    c.fillRect(px + S * 0.27, py + S * 0.66 - bob, S * 0.46, S * 0.08);
    // Head
    c.fillStyle = col.skin;
    c.beginPath(); c.arc(px + S * 0.5, py + S * 0.32 - bob, S * 0.22, 0, PI2); c.fill();
    // Hair & Hat
    c.fillStyle = col.hair;
    c.beginPath(); c.arc(px + S * 0.5, py + S * 0.27 - bob, S * 0.23, Math.PI, 0); c.fill();
    if (col.hat === 'starhat') {
      c.fillStyle = col.tunic;
      c.beginPath(); c.moveTo(px + S * 0.2, py + S * 0.24 - bob); c.lineTo(px + S * 0.5, py - S * 0.08 - bob); c.lineTo(px + S * 0.8, py + S * 0.24 - bob); c.closePath(); c.fill();
      c.fillStyle = '#fde047';
      drawStar(c, px + S * 0.5, py + S * 0.1 - bob, S * 0.1, S * 0.04, 5, 0); c.fill();
    } else if (col.hat === 'winghelm' || col.hat === 'helm') {
      c.fillStyle = col.trim;
      c.beginPath(); c.arc(px + S * 0.5, py + S * 0.22 - bob, S * 0.23, Math.PI, 0); c.fill();
    } else if (col.hat === 'tiara') {
      c.fillStyle = '#fde047';
      c.fillRect(px + S * 0.34, py + S * 0.14 - bob, S * 0.32, S * 0.07);
    }

    // Face eyes (except facing up)
    if (dir !== 'up') {
      const ex = dir === 'left' ? -S * 0.05 : dir === 'right' ? S * 0.05 : 0;
      c.fillStyle = '#0f172a';
      c.fillRect(px + S * 0.39 + ex, py + S * 0.32 - bob, S * 0.07, S * 0.08);
      c.fillRect(px + S * 0.54 + ex, py + S * 0.32 - bob, S * 0.07, S * 0.08);
    }
  }

  /* ---------------- 25 Original Procedural Fantasy Critters ---------------- */
  function drawCritter(c, critterId, cx, cy, size, time, flipX) {
    const cr = GameData.CRITTER_BY_ID[critterId] || GameData.CRITTERS[0];
    const a = cr.art;
    const r = size * 0.34;
    const bob = Math.sin((time || 0) * 3.4) * size * 0.03;

    c.save();
    c.translate(cx, cy + bob);
    if (flipX) c.scale(-1, 1);

    // Elemental Halo / Aura
    const auraGrad = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.45);
    auraGrad.addColorStop(0, a.aura + '88');
    auraGrad.addColorStop(1, a.aura + '00');
    c.fillStyle = auraGrad;
    c.beginPath(); c.arc(0, 0, r * 1.45, 0, PI2); c.fill();

    // Ground shadow
    c.fillStyle = 'rgba(0,0,0,0.2)';
    ell(c, 0, r * 0.96 - bob * 0.5, r * 0.78, r * 0.22); c.fill();

    // Wings (behind body)
    if (a.wing) {
      const flap = Math.sin((time || 0) * 6.5) * 0.18;
      c.save();
      [-1, 1].forEach(side => {
        c.save();
        c.scale(side, 1);
        c.rotate(flap);
        c.fillStyle = a.wing === 'astral' ? a.accent : a.wing === 'phoenix' ? '#fb923c' : a.wing === 'crystal' ? '#bae6fd' : a.c2;
        c.strokeStyle = a.c3;
        c.lineWidth = Math.max(1.5, size * 0.025);
        c.beginPath();
        c.moveTo(r * 0.35, -r * 0.1);
        c.quadraticCurveTo(r * 1.55, -r * 0.95, r * 1.35, r * 0.12);
        c.quadraticCurveTo(r * 0.95, r * 0.45, r * 0.3, r * 0.25);
        c.closePath();
        c.fill(); c.stroke();
        c.restore();
      });
      c.restore();
    }

    // Tail (behind body)
    if (a.tail) {
      c.fillStyle = a.tail === 'flame' ? '#fb923c' : a.tail === 'aurora' ? a.accent : a.c1;
      c.strokeStyle = a.c3;
      c.lineWidth = Math.max(1.5, size * 0.024);
      c.beginPath();
      c.moveTo(r * 0.45, r * 0.35);
      c.quadraticCurveTo(r * 1.35, r * 0.1, r * 1.05, -r * 0.55);
      c.quadraticCurveTo(r * 0.72, -r * 0.15, r * 0.45, r * 0.05);
      c.closePath();
      c.fill(); c.stroke();
    }

    // Main Body silhouette by shape
    c.fillStyle = a.c1;
    c.strokeStyle = a.c3;
    c.lineWidth = Math.max(2, size * 0.03);
    if (a.shape === 'dragon' || a.shape === 'stag') {
      // Majestic taller body + neck
      ell(c, 0, r * 0.22, r * 0.76, r * 0.68); c.fill(); c.stroke();
      c.fillStyle = a.c2;
      ell(c, 0, r * 0.3, r * 0.45, r * 0.44); c.fill();
      c.fillStyle = a.c1;
      ell(c, 0, -r * 0.42, r * 0.56, r * 0.46); c.fill(); c.stroke();
    } else if (a.shape === 'jelly') {
      c.beginPath();
      c.arc(0, -r * 0.15, r * 0.78, Math.PI, 0);
      c.quadraticCurveTo(r * 0.78, r * 0.35, 0, r * 0.25);
      c.quadraticCurveTo(-r * 0.78, r * 0.35, -r * 0.78, -r * 0.15);
      c.fill(); c.stroke();
      // Tentacles
      for (let t = -2; t <= 2; t++) {
        c.strokeStyle = a.accent; c.lineWidth = Math.max(2, size * 0.032);
        c.beginPath();
        c.moveTo(t * r * 0.25, r * 0.22);
        c.quadraticCurveTo(t * r * 0.3 + Math.sin((time || 0) * 5 + t) * 5, r * 0.6, t * r * 0.2, r * 0.9);
        c.stroke();
      }
    } else if (a.shape === 'crab' || a.shape === 'beetle') {
      ell(c, 0, r * 0.1, r * 0.85, r * 0.65); c.fill(); c.stroke();
      c.fillStyle = a.c2;
      ell(c, 0, r * 0.25, r * 0.52, r * 0.34); c.fill();
      // Claws
      [-1, 1].forEach(s => {
        c.fillStyle = a.c1; c.strokeStyle = a.c3;
        c.beginPath(); c.arc(s * r * 0.92, -r * 0.05, r * 0.26, 0, PI2); c.fill(); c.stroke();
      });
    } else if (a.shape === 'cactus') {
      rr(c, -r * 0.62, -r * 0.68, r * 1.24, r * 1.48, r * 0.56); c.fill(); c.stroke();
      c.fillStyle = a.c2;
      ell(c, 0, r * 0.1, r * 0.32, r * 0.45); c.fill();
    } else {
      // Cute classic creature body (fox, pup, fin, fae, cat, bird, owl, bear, bunny)
      ell(c, 0, r * 0.12, r * 0.78, r * 0.72); c.fill(); c.stroke();
      c.fillStyle = a.c2;
      ell(c, 0, r * 0.28, r * 0.48, r * 0.42); c.fill();
    }

    // Ears
    if (a.ear) {
      [-1, 1].forEach(side => {
        c.fillStyle = a.ear === 'leaf' ? '#22c55e' : a.c1;
        c.strokeStyle = a.c3; c.lineWidth = Math.max(1.5, size * 0.024);
        c.beginPath();
        if (a.ear === 'bunny') {
          ell(c, side * r * 0.36, -r * 0.92, r * 0.2, r * 0.56);
        } else if (a.ear === 'round') {
          c.arc(side * r * 0.52, -r * 0.52, r * 0.26, 0, PI2);
        } else if (a.ear === 'big' || a.ear === 'point' || a.ear === 'leaf') {
          c.moveTo(side * r * 0.22, -r * 0.48);
          c.lineTo(side * r * (a.ear === 'big' ? 0.95 : 0.72), -r * 1.05);
          c.lineTo(side * r * 0.62, -r * 0.22);
          c.closePath();
        } else {
          ell(c, side * r * 0.65, -r * 0.25, r * 0.2, r * 0.35);
        }
        c.fill(); c.stroke();
      });
    }

    // Crown / Antlers / Halo / Flower / Sun Crest
    if (a.crown) {
      c.fillStyle = a.accent;
      c.strokeStyle = a.c3; c.lineWidth = Math.max(1.5, size * 0.022);
      if (a.crown === 'antler' || a.crown === 'crystal') {
        [-1, 1].forEach(s => {
          c.beginPath();
          c.moveTo(s * r * 0.22, -r * 0.78);
          c.lineTo(s * r * 0.62, -r * 1.32);
          c.lineTo(s * r * 0.34, -r * 0.98);
          c.lineTo(s * r * 0.85, -r * 1.15);
          c.stroke();
        });
      } else if (a.crown === 'halo') {
        c.strokeStyle = '#fde047'; c.lineWidth = Math.max(2.5, size * 0.04);
        ell(c, 0, -r * 1.05, r * 0.55, r * 0.16); c.stroke();
      } else if (a.crown === 'sun' || a.crown === 'star' || a.crown === 'moon') {
        drawStar(c, 0, -r * 0.92, r * 0.34, r * 0.15, 5, (time || 0) * 0.5); c.fill();
      } else {
        c.beginPath(); c.arc(0, -r * 0.75, r * 0.24, 0, PI2); c.fill(); c.stroke();
      }
    }

    // Expressive Cute Eyes + Gloss Highlight + Rosy Cheeks
    const ey = (a.shape === 'dragon' || a.shape === 'stag') ? -r * 0.45 : -r * 0.06;
    const ex = r * 0.28;
    [-1, 1].forEach(side => {
      c.fillStyle = '#0f172a';
      ell(c, side * ex, ey, r * 0.14, r * 0.17); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(side * ex - r * 0.04, ey - r * 0.05, r * 0.055, 0, PI2); c.fill();
      // Rosy blush
      c.fillStyle = 'rgba(244,114,182,0.42)';
      ell(c, side * (ex + r * 0.14), ey + r * 0.16, r * 0.11, r * 0.07); c.fill();
    });
    // Cute smile
    c.strokeStyle = '#0f172a'; c.lineWidth = Math.max(1.4, size * 0.022);
    c.beginPath(); c.arc(0, ey + r * 0.12, r * 0.11, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();

    // Boss Crown Sparkle Badge
    if (cr.boss) {
      c.fillStyle = '#fde047';
      drawStar(c, r * 0.82, -r * 0.82, r * 0.22, r * 0.09, 4, (time || 0) * 2); c.fill();
    }

    c.restore();
  }

  /* ---------------- Cached Portrait DataURL for UI Cards ---------------- */
  function getCritterPortrait(critterId) {
    if (portraitCache[critterId]) return portraitCache[critterId];
    const cv = document.createElement('canvas');
    cv.width = 112; cv.height = 112;
    const c = cv.getContext('2d');
    const cr = GameData.CRITTER_BY_ID[critterId] || GameData.CRITTERS[0];
    const bg = c.createRadialGradient(56, 56, 8, 56, 56, 56);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, cr.art.aura + '99');
    c.fillStyle = bg;
    rr(c, 2, 2, 108, 108, 22); c.fill();
    drawCritter(c, critterId, 56, 62, 92, 0.4, false);
    const url = cv.toDataURL('image/png');
    portraitCache[critterId] = url;
    return url;
  }

  function getHeroPortrait(heroId) {
    const key = 'hero_' + heroId;
    if (portraitCache[key]) return portraitCache[key];
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const c = cv.getContext('2d');
    const h = GameData.HERO_BY_ID[heroId] || GameData.HEROES[0];
    const bg = c.createRadialGradient(48, 48, 6, 48, 48, 48);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, h.colors.tunic + '44');
    c.fillStyle = bg;
    rr(c, 2, 2, 92, 92, 20); c.fill();
    drawHero(c, heroId, 12, 10, 72, 'down', 0, 0, heroId === 'summoner' ? ['wings'] : [], false);
    const url = cv.toDataURL('image/png');
    portraitCache[key] = url;
    return url;
  }

  /* ---------------- Mini World Map Renderer ---------------- */
  function renderWorldMapCanvas(canvas, playerX, playerY, state) {
    const ow = World.getOverworld();
    const W = ow.w, H = ow.h;
    canvas.width = W * 3;
    canvas.height = H * 3;
    const c = canvas.getContext('2d');
    const T = World.T;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = World.getT(ow, x, y);
        const z = World.getZ(ow, x, y);
        const p = BIOME_PAL[z] || BIOME_PAL[1];
        let col = p.grass;
        if (t === T.DEEP) col = z === 5 ? '#1b1440' : '#1d6fa5';
        else if (t === T.SHALLOW) col = '#38d9e8';
        else if (t === T.SAND) col = p.sand;
        else if (t === T.TALL) col = p.tall;
        else if (t === T.PATH) col = '#e8cf9b';
        else if (t === T.PLAZA) col = '#f1eadb';
        else if (t === T.BRIDGE) col = z === 5 ? '#f472b6' : '#b4692c';
        else if (t === T.SNOW) col = '#eef6fc';
        else if (t === T.ICE) col = '#7dd3fc';
        else if (t === T.CLIFF) col = p.cliff2;
        else if (t === T.GATE_CH4) col = state.unlockedChapters.includes(4) ? '#38bdf8' : '#ef4444';
        else if (t === T.GATE_CH5) col = state.unlockedChapters.includes(5) ? '#c084fc' : '#ef4444';
        c.fillStyle = col;
        c.fillRect(x * 3, y * 3, 3, 3);
      }
    }

    // Dim locked chapters with subtle frost/astral overlay & badge
    GameData.CHAPTERS.forEach(ch => {
      const [x1, y1, x2, y2] = ch.rect;
      const unlocked = state.unlockedChapters.includes(ch.id);
      if (!unlocked) {
        c.fillStyle = 'rgba(15,23,42,0.45)';
        c.fillRect(x1 * 3, y1 * 3, (x2 - x1) * 3, (y2 - y1) * 3);
      }
      // Dungeon pin
      const de = ch.dungeon.entrance;
      c.fillStyle = '#a855f7';
      c.beginPath(); c.arc(de.x * 3, de.y * 3, 5, 0, PI2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();

      // Waystone pin
      const ws = ch.waystone;
      c.fillStyle = unlocked ? '#38bdf8' : '#f59e0b';
      c.beginPath(); c.arc(ws.x * 3, ws.y * 3, 6, 0, PI2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.8; c.stroke();

      // Chapter label pill
      const cx = ((x1 + x2) * 0.5) * 3;
      const cy = (y1 + 4) * 3;
      const txt = `${ch.emoji} ${I18N.t('chapterPrefix', { n: ch.id })} ${I18N.pick(ch.short)}${unlocked ? '' : ' 🔒'}`;
      c.font = 'bold 11px sans-serif';
      const tw = c.measureText(txt).width + 14;
      c.fillStyle = unlocked ? 'rgba(15,23,42,0.78)' : 'rgba(124,45,18,0.9)';
      rr(c, cx - tw / 2, cy - 9, tw, 18, 9); c.fill();
      c.fillStyle = unlocked ? '#fff' : '#fde047';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(txt, cx, cy);
    });

    // Player marker
    c.fillStyle = '#ef4444';
    c.beginPath(); c.arc(playerX * 3, playerY * 3, 6, 0, PI2); c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
  }

  return {
    BIOME_PAL,
    drawTile,
    drawObject,
    drawChest,
    drawNpc,
    drawHero,
    drawCritter,
    getCritterPortrait,
    getHeroPortrait,
    renderWorldMapCanvas,
  };
})();
