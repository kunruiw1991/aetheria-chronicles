'use strict';
/* ==========================================================================
 * world.js — Grand 150x120 Interconnected Classic Fantasy Continent
 * + 5 Enterable Chapter Sanctum Dungeons + Chapter Seal Gates
 * + Built-in BFS Reachability Verification
 * ========================================================================== */
const World = (() => {
  const D = GameData;
  const OW_W = D.MAP_W;
  const OW_H = D.MAP_H;

  const T = {
    DEEP: 0,
    SHALLOW: 1,
    SAND: 2,
    GRASS: 3,
    TALL: 4,
    PATH: 5,
    FLOWERS: 6,
    BRIDGE: 7,
    SNOW: 8,
    ICE: 9,
    PLAZA: 10,
    CLIFF: 11,
    FLOOR: 12,
    WALL: 13,
    GATE_CH4: 14,
    GATE_CH5: 15,
  };

  // Seeded PRNG (mulberry32) for deterministic, rich landscapes
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let overworld = null;
  let dungeons = {};
  let activeMap = null; // Either overworld or dungeons[id]

  function createEmptyMap(id, w, h, isDungeon, chapterId) {
    return {
      id, w, h, isDungeon, chapterId,
      tiles: new Uint8Array(w * h),
      zones: new Uint8Array(w * h), // Chapter id 1..5
      decals: new Uint8Array(w * h),
      objects: [], // { id, kind, x, y, w, h, solid, label, action, data }
      npcs: [],    // { id, name, x, y, look, chapter, role, lines, gift, questTool }
      chests: [],  // { id, x, y, loot, chapter }
      portals: [], // { x, y, target, tx, ty, label }
      boss: null,  // { id, critterId, lv, x, y, chapter }
    };
  }

  function idx(m, x, y) { return y * m.w + x; }
  function inb(m, x, y) { return x >= 0 && y >= 0 && x < m.w && y < m.h; }
  function setT(m, x, y, t) { if (inb(m, x, y)) m.tiles[idx(m, x, y)] = t; }
  function getT(m, x, y) { return inb(m, x, y) ? m.tiles[idx(m, x, y)] : T.DEEP; }
  function setZ(m, x, y, z) { if (inb(m, x, y)) m.zones[idx(m, x, y)] = z; }
  function getZ(m, x, y) { return inb(m, x, y) ? m.zones[idx(m, x, y)] : 1; }

  function fillRect(m, x1, y1, x2, y2, tile, zone) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setT(m, x, y, tile);
        if (zone !== undefined) setZ(m, x, y, zone);
      }
    }
  }

  function fillEllipse(m, cx, cy, rx, ry, tile, zone) {
    const x1 = Math.floor(cx - rx), x2 = Math.ceil(cx + rx);
    const y1 = Math.floor(cy - ry), y2 = Math.ceil(cy + ry);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) {
          setT(m, x, y, tile);
          if (zone !== undefined) setZ(m, x, y, zone);
        }
      }
    }
  }

  function carveRoad(m, x1, y1, x2, y2, width, tile) {
    const w = width || 1;
    let x = x1, y = y1;
    const t = tile !== undefined ? tile : T.PATH;
    while (x !== x2) {
      for (let dy = -w; dy <= w; dy++) {
        const cur = getT(m, x, y + dy);
        if (cur === T.DEEP || cur === T.SHALLOW) setT(m, x, y + dy, T.BRIDGE);
        else setT(m, x, y + dy, t);
      }
      x += x < x2 ? 1 : -1;
    }
    while (y !== y2) {
      for (let dx = -w; dx <= w; dx++) {
        const cur = getT(m, x + dx, y);
        if (cur === T.DEEP || cur === T.SHALLOW) setT(m, x + dx, y, T.BRIDGE);
        else setT(m, x + dx, y, t);
      }
      y += y < y2 ? 1 : -1;
    }
  }

  function addObj(m, obj) {
    m.objects.push(Object.assign({ w: 1, h: 1, solid: true }, obj));
  }

  function hasObjAt(m, x, y) {
    for (let i = 0; i < m.objects.length; i++) {
      const o = m.objects[i];
      if (x >= o.x && x < o.x + (o.w || 1) && y >= o.y && y < o.y + (o.h || 1)) return o;
    }
    return null;
  }

  function hasNpcAt(m, x, y) {
    for (let i = 0; i < m.npcs.length; i++) {
      if (m.npcs[i].x === x && m.npcs[i].y === y) return m.npcs[i];
    }
    return null;
  }

  function hasChestAt(m, x, y) {
    for (let i = 0; i < m.chests.length; i++) {
      if (m.chests[i].x === x && m.chests[i].y === y) return m.chests[i];
    }
    return null;
  }

  /* ---------------- Build Grand Overworld ---------------- */
  function buildOverworld() {
    const m = createEmptyMap('overworld', OW_W, OW_H, false, 1);
    const rng = mulberry32(20261125);

    // 0. Ocean & Sky Void backdrop
    fillRect(m, 0, 0, OW_W - 1, OW_H - 1, T.DEEP, 1);

    // === CHAPTER 1: EMERALD MEADOW (SW: x 6..72, y 67..113) ===
    fillRect(m, 8, 68, 71, 111, T.GRASS, 1);
    fillEllipse(m, 39, 90, 34, 23, T.GRASS, 1);
    // Cozy Village Plaza around (28..42, 87..97)
    fillRect(m, 26, 87, 42, 97, T.PLAZA, 1);
    // Whispering Woods flower & tall grass meadows
    fillEllipse(m, 18, 98, 7, 5, T.TALL, 1);
    fillEllipse(m, 55, 100, 9, 6, T.TALL, 1);
    fillEllipse(m, 54, 78, 8, 6, T.TALL, 1);
    fillEllipse(m, 22, 81, 6, 4, T.TALL, 1);
    fillEllipse(m, 32, 74, 6, 4, T.FLOWERS, 1);
    fillEllipse(m, 48, 92, 5, 4, T.FLOWERS, 1);
    // Scenic Pond in Ch. 1
    fillEllipse(m, 58, 107, 6, 3, T.SHALLOW, 1);

    // === CHAPTER 2: CORAL BAY (SE: x 77..143, y 67..113) ===
    // Turquoise coastal shallows surrounding Coral Bay islands
    fillRect(m, 76, 68, 144, 114, T.SHALLOW, 2);
    // Main Harbor Island
    fillEllipse(m, 102, 88, 22, 16, T.SAND, 2);
    fillEllipse(m, 102, 86, 17, 12, T.GRASS, 2);
    fillRect(m, 95, 86, 110, 94, T.PLAZA, 2);
    // Eastern Reef Peninsula (Dungeon 2: Sunken Pearl Grotto at 124, 92)
    fillEllipse(m, 124, 92, 11, 9, T.SAND, 2);
    fillEllipse(m, 124, 92, 7, 6, T.GRASS, 2);
    // Coral Wild Encounter Patches
    fillEllipse(m, 88, 96, 5, 4, T.TALL, 2);
    fillEllipse(m, 112, 77, 6, 4, T.TALL, 2);
    fillEllipse(m, 93, 76, 5, 4, T.TALL, 2);
    fillEllipse(m, 128, 96, 4, 3, T.TALL, 2);
    // Secret Pearl Treasure Islands (Reachable with Tideglider Skiff across SHALLOW!)
    fillEllipse(m, 134, 107, 5, 4, T.SAND, 2);
    fillEllipse(m, 86, 109, 5, 3, T.SAND, 2);

    // === CHAPTER 3: SUNFIRE DESERT (Mid-East: x 77..143, y 29..64) ===
    fillRect(m, 78, 30, 142, 63, T.SAND, 3);
    fillEllipse(m, 110, 46, 33, 18, T.SAND, 3);
    // Oasis Citadel center (x 96..113, y 43..52)
    fillEllipse(m, 104, 48, 11, 6, T.GRASS, 3);
    fillRect(m, 98, 45, 110, 51, T.PLAZA, 3);
    fillEllipse(m, 95, 51, 3, 2, T.SHALLOW, 3);
    // Desert tall grass / dune oasis brush patches
    fillEllipse(m, 86, 38, 6, 4, T.TALL, 3);
    fillEllipse(m, 126, 54, 7, 4, T.TALL, 3);
    fillEllipse(m, 90, 57, 6, 3, T.TALL, 3);
    fillEllipse(m, 117, 37, 5, 3, T.TALL, 3);
    // Solar Pyramid Courtyard (around 126, 36)
    fillRect(m, 122, 33, 131, 40, T.PLAZA, 3);

    // === CHAPTER 4: FROSTPEAK CITADEL (Mid-West: x 6..72, y 29..64) — PAID ===
    fillRect(m, 8, 30, 71, 63, T.SNOW, 4);
    fillEllipse(m, 40, 47, 33, 18, T.SNOW, 4);
    // Frozen Mirror Lakes
    fillEllipse(m, 55, 39, 8, 5, T.ICE, 4);
    fillEllipse(m, 18, 55, 6, 4, T.ICE, 4);
    // Frostpeak Village Plaza
    fillRect(m, 34, 45, 48, 53, T.PLAZA, 4);
    // Glacial Crown Keep Courtyard (around 22, 36)
    fillRect(m, 18, 33, 27, 40, T.PLAZA, 4);
    // Frost Encounter Patches
    fillEllipse(m, 26, 54, 6, 4, T.TALL, 4);
    fillEllipse(m, 58, 55, 6, 4, T.TALL, 4);
    fillEllipse(m, 38, 36, 6, 3, T.TALL, 4);
    fillEllipse(m, 62, 35, 5, 3, T.TALL, 4);

    // === CHAPTER 5: STARLIGHT SKY SANCTUM (Far North: x 24..126, y 4..25) — PAID ===
    // Floating Celestial Archipelago surrounded by astral sea (T.DEEP)
    fillEllipse(m, 75, 16, 46, 10, T.PLAZA, 5);
    fillEllipse(m, 46, 17, 16, 7, T.FLOWERS, 5);
    fillEllipse(m, 104, 17, 16, 7, T.FLOWERS, 5);
    fillRect(m, 64, 12, 86, 22, T.PLAZA, 5);
    // Astral Encounter Gardens
    fillEllipse(m, 42, 15, 6, 3, T.TALL, 5);
    fillEllipse(m, 108, 15, 6, 3, T.TALL, 5);
    fillEllipse(m, 58, 19, 5, 2, T.TALL, 5);
    fillEllipse(m, 92, 19, 5, 2, T.TALL, 5);

    // === NATURAL BORDERS BETWEEN CHAPTERS ===
    // Cliff divider between Ch.1 (south) and Ch.4 (north) at y=65..66
    for (let x = 6; x <= 74; x++) {
      setT(m, x, 65, T.CLIFF); setZ(m, x, 65, 4);
      setT(m, x, 66, T.CLIFF); setZ(m, x, 66, 1);
    }
    // River/Cliff divider between Ch.1/Ch.2 at x=73..76
    for (let y = 66; y <= 114; y++) {
      for (let x = 73; x <= 76; x++) {
        setT(m, x, y, T.DEEP);
        setZ(m, x, y, x < 75 ? 1 : 2);
      }
    }
    // Cliff/Chasm divider between Ch.4 (west) and Ch.3 (east) at x=73..76, y=28..65
    for (let y = 28; y <= 65; y++) {
      for (let x = 73; x <= 76; x++) {
        setT(m, x, y, T.CLIFF);
        setZ(m, x, y, x < 75 ? 4 : 3);
      }
    }
    // Cliff wall between Ch.2 (south) and Ch.3 (north) at y=65..66, x=76..144
    for (let x = 76; x <= 144; x++) {
      setT(m, x, 65, T.CLIFF); setZ(m, x, 65, 3);
      setT(m, x, 66, T.CLIFF); setZ(m, x, 66, 2);
    }
    // Deep Astral Sky Void separating Ch.5 (y<=25) from Ch.3 & Ch.4 (y>=29)
    for (let y = 26; y <= 28; y++) {
      for (let x = 0; x < OW_W; x++) {
        setT(m, x, y, T.DEEP);
        setZ(m, x, y, 5);
      }
    }

    // === MAIN ROADS & INTER-CHAPTER BRIDGES ===
    // Ch.1 internal roads
    carveRoad(m, 34, 92, 22, 75, 1, T.PATH);  // Village -> Dungeon 1
    carveRoad(m, 34, 92, 72, 90, 1, T.PATH);  // Village -> East Bridge
    carveRoad(m, 34, 92, 39, 68, 1, T.PATH);  // Village -> North Ch.4 Gate
    // Free Bridge: Ch.1 <-> Ch.2 (y = 89..91, x = 71..82)
    fillRect(m, 71, 89, 82, 91, T.BRIDGE, 2);
    // Ch.2 internal roads
    carveRoad(m, 82, 90, 104, 90, 1, T.PATH); // Bridge -> Harbor
    carveRoad(m, 104, 90, 124, 92, 1, T.BRIDGE); // Harbor -> Sunken Pearl Grotto Peninsula
    carveRoad(m, 104, 90, 108, 67, 1, T.PATH); // Harbor -> North Canyon Pass
    // Free Pass: Ch.2 <-> Ch.3 (x = 107..109, y = 63..68)
    fillRect(m, 107, 63, 109, 68, T.PATH, 3);
    // Ch.3 internal roads
    carveRoad(m, 108, 63, 106, 48, 1, T.PATH); // Pass -> Oasis Citadel
    carveRoad(m, 106, 48, 126, 37, 1, T.PATH); // Oasis -> Solar Pyramid Vault
    carveRoad(m, 106, 48, 77, 47, 1, T.PATH);  // Oasis -> West Ch.4 Gate
    carveRoad(m, 106, 48, 103, 30, 1, T.PATH); // Oasis -> East Ch.5 Skybridge

    // === PAID CHAPTER 4 & CHAPTER 5 ROADS & SEAL GATES ===
    // South Pass (Ch.1 <-> Ch.4): x=38..40, y=64..67
    fillRect(m, 38, 64, 40, 65, T.PATH, 4);
    fillRect(m, 38, 66, 40, 68, T.PATH, 1);
    // East Bridge (Ch.3 <-> Ch.4): x=72..77, y=46..48
    fillRect(m, 72, 46, 74, 48, T.BRIDGE, 4);
    fillRect(m, 75, 46, 77, 48, T.BRIDGE, 3);
    // Ch.4 internal roads (carved BEFORE placing seal gate tiles)
    carveRoad(m, 39, 63, 38, 48, 1, T.PATH);   // South Gate -> Frostpeak Village
    carveRoad(m, 72, 47, 38, 48, 1, T.PATH);   // East Gate -> Frostpeak Village
    carveRoad(m, 38, 48, 22, 37, 1, T.PATH);   // Village -> Glacial Crown Keep
    carveRoad(m, 38, 48, 47, 30, 1, T.PATH);   // Village -> West Ch.5 Skybridge

    // West Rainbow Skybridge (Ch.4 <-> Ch.5): x=46..48, y=22..30
    fillRect(m, 46, 22, 48, 27, T.BRIDGE, 5);
    fillRect(m, 46, 28, 48, 30, T.BRIDGE, 4);
    // East Rainbow Skybridge (Ch.3 <-> Ch.5): x=102..104, y=22..30
    fillRect(m, 102, 22, 104, 27, T.BRIDGE, 5);
    fillRect(m, 102, 28, 104, 30, T.BRIDGE, 3);
    // Ch.5 internal walkways
    carveRoad(m, 47, 22, 75, 18, 1, T.PLAZA);
    carveRoad(m, 103, 22, 75, 18, 1, T.PLAZA);
    carveRoad(m, 75, 18, 75, 11, 1, T.PLAZA);

    // Place Seal Gates LAST so no road carving can ever overwrite them!
    for (let x = 37; x <= 41; x++) {
      if (getT(m, x, 65) !== T.CLIFF) { setT(m, x, 65, T.GATE_CH4); setZ(m, x, 65, 4); }
    }
    for (let y = 45; y <= 49; y++) {
      if (getT(m, 74, y) !== T.CLIFF) { setT(m, 74, y, T.GATE_CH4); setZ(m, 74, y, 4); }
    }
    for (let x = 45; x <= 49; x++) {
      if (getT(m, x, 27) !== T.DEEP) { setT(m, x, 27, T.GATE_CH5); setZ(m, x, 27, 5); }
      // Also guard the Ch.4 side of West Skybridge so unlocking Ch.5 alone cannot enter locked Ch.4!
      if (getT(m, x, 28) !== T.DEEP) { setT(m, x, 28, T.GATE_CH4); setZ(m, x, 28, 4); }
    }
    for (let x = 101; x <= 105; x++) {
      if (getT(m, x, 27) !== T.DEEP) { setT(m, x, 27, T.GATE_CH5); setZ(m, x, 27, 5); }
    }

    // === LANDMARKS, BUILDINGS, FOUNTAINS, WAYSTONES & DUNGEON PORTALS ===
    // Chapter 1 Landmarks
    addObj(m, { id: 'c1_house1', kind: 'cottage', x: 27, y: 88, w: 3, h: 2, solid: true, label: { zh: '晨木镇民居', en: 'Dawnwood Cottage' } });
    addObj(m, { id: 'c1_house2', kind: 'shop_house', x: 38, y: 88, w: 3, h: 2, solid: true, action: 'shop', label: { zh: '星界杂货铺', en: 'Grand Store' } });
    addObj(m, { id: 'c1_windmill', kind: 'windmill', x: 46, y: 84, w: 2, h: 3, solid: true, label: { zh: '翡翠风车塔', en: 'Emerald Windmill' } });
    addObj(m, { id: 'c1_fountain', kind: 'fountain', x: 29, y: 93, w: 2, h: 2, solid: true, action: 'heal', label: { zh: '晨露治愈圣泉', en: 'Healing Fountain' } });
    addObj(m, { id: 'c1_way', kind: 'waystone', x: 34, y: 90, w: 1, h: 1, solid: true, action: 'waystone', data: { chapter: 1 }, label: { zh: '翡翠传送石碑', en: 'Emerald Waystone' } });
    addObj(m, { id: 'c1_sign', kind: 'sign', x: 43, y: 91, w: 1, h: 1, solid: true, action: 'sign', data: { text: { zh: '路标：东行跨桥 → 第2章 珊瑚海湾 ｜ 北行 → 古树灵殿与雪峰结界', en: 'Sign: East Bridge → Ch.2 Coral Bay | North → Ancient Sanctum & Frostpeak Gate' } } });

    // Chapter 2 Landmarks
    addObj(m, { id: 'c2_lighthouse', kind: 'lighthouse', x: 108, y: 83, w: 2, h: 3, solid: true, label: { zh: '潮汐灯塔', en: 'Tidebreak Lighthouse' } });
    addObj(m, { id: 'c2_shop', kind: 'shop_house', x: 101, y: 86, w: 3, h: 2, solid: true, action: 'shop', label: { zh: '海港集市', en: 'Harbor Market' } });
    addObj(m, { id: 'c2_fountain', kind: 'fountain', x: 97, y: 90, w: 2, h: 2, solid: true, action: 'heal', label: { zh: '潮汐疗愈泉', en: 'Tidal Spring' } });
    addObj(m, { id: 'c2_way', kind: 'waystone', x: 104, y: 89, w: 1, h: 1, solid: true, action: 'waystone', data: { chapter: 2 }, label: { zh: '珊瑚传送石碑', en: 'Coral Waystone' } });

    // Chapter 3 Landmarks
    addObj(m, { id: 'c3_pyramid', kind: 'pyramid', x: 124, y: 31, w: 4, h: 3, solid: true, label: { zh: '太阳金字塔', en: 'Solar Pyramid' } });
    addObj(m, { id: 'c3_bazaar', kind: 'shop_house', x: 101, y: 45, w: 3, h: 2, solid: true, action: 'shop', label: { zh: '绿洲黄金商行', en: 'Oasis Bazaar' } });
    addObj(m, { id: 'c3_fountain', kind: 'fountain', x: 99, y: 48, w: 2, h: 2, solid: true, action: 'heal', label: { zh: '绿洲生命泉', en: 'Oasis Pool' } });
    addObj(m, { id: 'c3_way', kind: 'waystone', x: 106, y: 46, w: 1, h: 1, solid: true, action: 'waystone', data: { chapter: 3 }, label: { zh: '沙城传送石碑', en: 'Sunfire Waystone' } });
    addObj(m, { id: 'c3_obelisk', kind: 'obelisk', x: 114, y: 45, w: 1, h: 2, solid: true, label: { zh: '烈日方尖碑', en: 'Sun Obelisk' } });

    // Chapter 4 Landmarks
    addObj(m, { id: 'c4_castle', kind: 'castle', x: 20, y: 31, w: 4, h: 3, solid: true, label: { zh: '冰冠古堡', en: 'Glacial Crown Keep' } });
    addObj(m, { id: 'c4_hotspring', kind: 'hotspring', x: 43, y: 48, w: 2, h: 2, solid: true, action: 'heal', label: { zh: '雪峰暖心温泉', en: 'Alpine Hot Spring' } });
    addObj(m, { id: 'c4_lodge', kind: 'shop_house', x: 35, y: 45, w: 3, h: 2, solid: true, action: 'shop', label: { zh: '冰晶补给站', en: 'Frostpeak Lodge' } });
    addObj(m, { id: 'c4_way', kind: 'waystone', x: 39, y: 47, w: 1, h: 1, solid: true, action: 'waystone', data: { chapter: 4 }, label: { zh: '雪峰传送石碑', en: 'Frostpeak Waystone' } });

    // Chapter 5 Landmarks
    addObj(m, { id: 'c5_temple', kind: 'skytemple', x: 73, y: 5, w: 5, h: 3, solid: true, label: { zh: '星穹王座神殿', en: 'Celestial Throne' } });
    addObj(m, { id: 'c5_fountain', kind: 'starwell', x: 68, y: 17, w: 2, h: 2, solid: true, action: 'heal', label: { zh: '星辉治愈井', en: 'Starlight Well' } });
    addObj(m, { id: 'c5_way', kind: 'waystone', x: 75, y: 17, w: 1, h: 1, solid: true, action: 'waystone', data: { chapter: 5 }, label: { zh: '星界传送石碑', en: 'Astral Waystone' } });

    // === 5 ENTERABLE CHAPTER SANCTUM DUNGEON PORTALS ===
    D.CHAPTERS.forEach(ch => {
      const ent = ch.dungeon.entrance;
      // Clear 3x3 around entrance so it's always walkable
      fillRect(m, ent.x - 1, ent.y - 1, ent.x + 1, ent.y + 1, T.PLAZA, ch.id);
      addObj(m, {
        id: 'portal_' + ch.dungeon.id,
        kind: 'portal',
        x: ent.x, y: ent.y, w: 1, h: 1, solid: false,
        action: 'enter_dungeon',
        data: { dungeonId: ch.dungeon.id, chapter: ch.id },
        label: ch.dungeon.name,
      });
      m.portals.push({ x: ent.x, y: ent.y, target: ch.dungeon.id, tx: 11, ty: 13, chapter: ch.id });
    });

    // === FRIENDLY NPCs ACROSS ALL 5 CHAPTERS ===
    m.npcs = [
      {
        id: 'npc_elder', x: 32, y: 91, chapter: 1, look: 'elder',
        name: { zh: '晨木镇长老', en: 'Elder Rowan' },
        gift: { orbs: 5, treats: 3, gold: 50 },
        lines: {
          zh: '欢迎踏上艾瑟瑞亚大陆！按住 B 键可以用疾风靴加速。收下这份新人补给，向北去挑战【古树灵殿】，向东跨桥前往【珊瑚海湾】吧！',
          en: 'Welcome to Aetheria! Hold B to dash with Windstep Boots. Take this starter gift—head North to Ancient Root Sanctum or East to Coral Bay!',
        },
      },
      {
        id: 'npc_merchant', x: 40, y: 91, chapter: 1, look: 'merchant', role: 'shop',
        name: { zh: '星界行商 · 贝拉', en: 'Merchant Bella' },
        lines: {
          zh: '想要炫酷神器、新英雄角色、免费补给，或看激励视频解锁第 4、5 章扩展大陆吗？随时来星界宝库逛逛吧！',
          en: 'Want fancy tools, heroes, free supplies, or to unlock Chapters 4 & 5 via rewarded ads? Open the Reward Vault anytime!',
        },
      },
      {
        id: 'npc_gate4', x: 37, y: 67, chapter: 1, look: 'guard', role: 'gate4',
        name: { zh: '雪峰结界守卫', en: 'Frostpeak Gatekeeper' },
        lines: {
          zh: '前方就是【第 4 章：雪峰古堡】！前 3 章完全免费，观看 2 次激励视频即可永久免费解除这道极光结界！',
          en: 'Beyond lies Chapter 4: Frostpeak Citadel! Chapters 1–3 are open—watch 2 rewarded ads to dispel this seal free forever!',
        },
      },
      {
        id: 'npc_captain', x: 103, y: 92, chapter: 2, look: 'sailor', questTool: 'skiff',
        name: { zh: '潮汐船长 · 巴纳比', en: 'Captain Barnaby' },
        lines: {
          zh: '哈哈，年轻的冒险者！送你一艘【踏浪舟】！现在你可以直接滑过浅蓝海水，去南边的秘密珍珠岛寻宝了！',
          en: 'Ahoy, adventurer! Take this Tideglider Skiff for free! You can now surf across shallow reefs to the secret Pearl Islands!',
        },
      },
      {
        id: 'npc_nomad', x: 104, y: 50, chapter: 3, look: 'nomad', questTool: 'compass',
        name: { zh: '绿洲探险家 · 卡里姆', en: 'Explorer Karim' },
        lines: {
          zh: '烈日沙城藏着许多金字塔秘宝！这枚【寻宝罗盘】赠予你，主界面上方会自动指引最近未开启的宝箱方向！',
          en: 'Sunfire Desert hides ancient vaults! Take this Treasure Compass—it points straight toward the nearest unopened chest!',
        },
      },
      {
        id: 'npc_gate5', x: 101, y: 29, chapter: 3, look: 'oracle', role: 'gate5',
        name: { zh: '苍穹天桥使者', en: 'Skybridge Herald' },
        lines: {
          zh: '彩虹天桥直通【第 5 章：星界神殿】与终极圣龙！观看 3 次激励视频（或 4 次解锁全章大礼包）即可登岛！',
          en: 'This Rainbow Skybridge leads to Chapter 5: Starlight Sanctum! Watch 3 rewarded ads (or 4 for the Grand Bundle) to ascend!',
        },
      },
      {
        id: 'npc_valk', x: 40, y: 50, chapter: 4, look: 'valkyrie',
        name: { zh: '雪原游侠 · 希尔薇', en: 'Ranger Sylvi' },
        gift: { superOrbs: 3, treats: 3, gold: 120 },
        lines: {
          zh: '欢迎来到雪峰古堡！泡一泡旁边的暖心温泉可瞬间满血，西北方的【冰冠要塞】里沉睡着寒穹冰龙！',
          en: 'Welcome to Frostpeak! Rest at the hot spring anytime—Glacieron awaits in Glacial Crown Keep to the northwest!',
        },
      },
      {
        id: 'npc_astral', x: 73, y: 19, chapter: 5, look: 'oracle',
        name: { zh: '星界守护使', en: 'Astral Keeper' },
        gift: { masterOrbs: 1, treats: 5, gold: 200 },
        lines: {
          zh: '恭喜登上苍穹浮岛！星穹王座神殿就在正北方向，愿星光庇佑你收服至高圣龙「星界圣龙」！',
          en: 'Welcome to the floating isles! Celestial Throne Sanctum lies straight north—may starlight guide you to Celestiar!',
        },
      },
    ];

    // === 26 OVERWORLD TREASURE CHESTS ACROSS ALL 5 CHAPTERS ===
    const chestSpecs = [
      // Chapter 1 (6 chests)
      { id: 'ow_c1_1', x: 18, y: 95, chapter: 1, loot: { gold: 45, orbs: 2 } },
      { id: 'ow_c1_2', x: 48, y: 98, chapter: 1, loot: { gold: 55, treats: 2 } },
      { id: 'ow_c1_3', x: 63, y: 80, chapter: 1, loot: { gold: 60, superOrbs: 1 } },
      { id: 'ow_c1_4', x: 15, y: 76, chapter: 1, loot: { gold: 70, orbs: 3 } },
      { id: 'ow_c1_5', x: 52, y: 71, chapter: 1, loot: { gold: 65, treats: 3 } },
      { id: 'ow_c1_6', x: 34, y: 105, chapter: 1, loot: { gold: 80, superOrbs: 1 } },
      // Chapter 2 (6 chests, including 2 on Secret Pearl Islands reachable with Tideglider Skiff!)
      { id: 'ow_c2_1', x: 89, y: 82, chapter: 2, loot: { gold: 75, orbs: 3 } },
      { id: 'ow_c2_2', x: 114, y: 82, chapter: 2, loot: { gold: 90, superOrbs: 2 } },
      { id: 'ow_c2_3', x: 96, y: 100, chapter: 2, loot: { gold: 85, treats: 3 } },
      { id: 'ow_c2_4', x: 130, y: 89, chapter: 2, loot: { gold: 100, superOrbs: 2 } },
      { id: 'ow_c2_5', x: 134, y: 107, chapter: 2, loot: { gold: 180, masterOrbs: 1 } }, // Secret Island!
      { id: 'ow_c2_6', x: 86, y: 109, chapter: 2, loot: { gold: 140, superOrbs: 3 } }, // Secret Island!
      // Chapter 3 (5 chests)
      { id: 'ow_c3_1', x: 84, y: 40, chapter: 3, loot: { gold: 110, superOrbs: 2 } },
      { id: 'ow_c3_2', x: 92, y: 58, chapter: 3, loot: { gold: 100, treats: 4 } },
      { id: 'ow_c3_3', x: 132, y: 52, chapter: 3, loot: { gold: 130, superOrbs: 2 } },
      { id: 'ow_c3_4', x: 134, y: 34, chapter: 3, loot: { gold: 160, masterOrbs: 1 } },
      { id: 'ow_c3_5', x: 118, y: 34, chapter: 3, loot: { gold: 120, treats: 3 } },
      // Chapter 4 (5 chests)
      { id: 'ow_c4_1', x: 16, y: 46, chapter: 4, loot: { gold: 150, superOrbs: 2 } },
      { id: 'ow_c4_2', x: 64, y: 56, chapter: 4, loot: { gold: 160, treats: 4 } },
      { id: 'ow_c4_3', x: 56, y: 39, chapter: 4, loot: { gold: 190, superOrbs: 3 } },
      { id: 'ow_c4_4', x: 14, y: 34, chapter: 4, loot: { gold: 220, masterOrbs: 1 } },
      { id: 'ow_c4_5', x: 34, y: 59, chapter: 4, loot: { gold: 140, superOrbs: 2 } },
      // Chapter 5 (4 chests)
      { id: 'ow_c5_1', x: 38, y: 17, chapter: 5, loot: { gold: 220, superOrbs: 3 } },
      { id: 'ow_c5_2', x: 112, y: 17, chapter: 5, loot: { gold: 220, superOrbs: 3 } },
      { id: 'ow_c5_3', x: 60, y: 12, chapter: 5, loot: { gold: 260, masterOrbs: 1 } },
      { id: 'ow_c5_4', x: 90, y: 12, chapter: 5, loot: { gold: 260, masterOrbs: 1 } },
    ];
    chestSpecs.forEach(c => {
      // Ensure tile under chest is solid ground
      const cur = getT(m, c.x, c.y);
      if (cur === T.DEEP || cur === T.CLIFF) setT(m, c.x, c.y, T.SAND);
      m.chests.push(c);
    });

    // === PROCEDURAL SCENERY TREES / PALMS / CACTI / PINES / CRYSTALS ===
    const blocked = new Uint8Array(OW_W * OW_H);
    const markClear = (cx, cy, r) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (inb(m, nx, ny)) blocked[idx(m, nx, ny)] = 1;
        }
      }
    };
    // Keep landmarks, NPCs, chests, portals, roads, bridges, and gates clear
    m.objects.forEach(o => markClear(o.x, o.y, Math.max(o.w || 1, o.h || 1) + 1));
    m.npcs.forEach(n => markClear(n.x, n.y, 2));
    m.chests.forEach(c => markClear(c.x, c.y, 2));
    m.portals.forEach(p => markClear(p.x, p.y, 2));

    for (let y = 5; y < OW_H - 5; y++) {
      for (let x = 5; x < OW_W - 5; x++) {
        const i = idx(m, x, y);
        if (blocked[i]) continue;
        const t = m.tiles[i];
        const z = m.zones[i];
        if (t === T.PATH || t === T.BRIDGE || t === T.PLAZA || t === T.TALL || t === T.DEEP || t === T.SHALLOW || t === T.CLIFF || t === T.GATE_CH4 || t === T.GATE_CH5 || t === T.ICE) continue;
        // Scatter ground decals
        if (rng() < 0.08) m.decals[i] = 1 + Math.floor(rng() * 3);
        // Scatter scenic trees/props sparsely so paths always feel open
        const density = z === 1 ? 0.045 : z === 2 ? 0.032 : z === 3 ? 0.025 : z === 4 ? 0.045 : 0.03;
        if (rng() < density) {
          let kind = 'tree';
          if (z === 2) kind = rng() < 0.65 ? 'palm' : 'coral_rock';
          else if (z === 3) kind = rng() < 0.55 ? 'cactus' : 'palm';
          else if (z === 4) kind = rng() < 0.72 ? 'pine' : 'ice_crystal';
          else if (z === 5) kind = rng() < 0.55 ? 'star_pillar' : 'crystal';
          else kind = rng() < 0.8 ? 'tree' : 'bush';
          addObj(m, { id: 'sc_' + x + '_' + y, kind, x, y, w: 1, h: 1, solid: true });
          markClear(x, y, 1);
        }
      }
    }

    return m;
  }

  /* ---------------- Build 5 Chapter Sanctum Dungeons ---------------- */
  function buildDungeon(ch) {
    const W = 22, H = 16;
    const m = createEmptyMap(ch.dungeon.id, W, H, true, ch.id);
    // Outer walls
    fillRect(m, 0, 0, W - 1, H - 1, T.WALL, ch.id);
    fillRect(m, 2, 2, W - 3, H - 3, T.FLOOR, ch.id);
    // Decorative sanctum carpet / central aisle
    fillRect(m, 10, 3, 12, 14, T.PLAZA, ch.id);
    // Boss Dais
    fillRect(m, 8, 3, 14, 6, T.PLAZA, ch.id);
    // Wild encounter wings on left & right
    fillRect(m, 3, 8, 7, 12, T.TALL, ch.id);
    fillRect(m, 15, 8, 18, 12, T.TALL, ch.id);
    // Interior Pillars
    [[7, 7], [15, 7], [7, 12], [15, 12]].forEach(([px, py], k) => {
      addObj(m, { id: ch.dungeon.id + '_pil_' + k, kind: ch.id === 4 ? 'ice_crystal' : ch.id === 5 ? 'star_pillar' : 'pillar', x: px, y: py, w: 1, h: 1, solid: true });
    });
    // Exit Mat
    addObj(m, {
      id: ch.dungeon.id + '_exit', kind: 'exitmat', x: 11, y: 14, w: 1, h: 1, solid: false,
      action: 'exit_dungeon',
      data: { tx: ch.dungeon.entrance.x, ty: ch.dungeon.entrance.y + 1 },
    });
    m.portals.push({ x: 11, y: 14, target: 'overworld', tx: ch.dungeon.entrance.x, ty: ch.dungeon.entrance.y + 1 });

    // Sanctum Sage NPC
    m.npcs.push({
      id: ch.dungeon.id + '_sage', x: 9, y: 11, chapter: ch.id, look: 'oracle',
      name: ch.dungeon.sage.name,
      gift: ch.dungeon.sage.gift,
      lines: ch.dungeon.sage.line,
    });

    // 2 Dungeon Treasure Chests
    m.chests.push(
      { id: ch.dungeon.id + '_ch1', x: 4, y: 5, chapter: ch.id, loot: { gold: 70 + ch.id * 35, superOrbs: 2 } },
      { id: ch.dungeon.id + '_ch2', x: 17, y: 5, chapter: ch.id, loot: { gold: 90 + ch.id * 40, treats: 3, orbs: 2 } }
    );

    // Standing Chapter Guardian Boss
    m.boss = {
      id: 'boss_' + ch.id,
      critterId: ch.dungeon.bossId,
      lv: ch.dungeon.bossLv,
      x: 11, y: 4,
      chapter: ch.id,
    };

    return m;
  }

  function init() {
    overworld = buildOverworld();
    dungeons = {};
    D.CHAPTERS.forEach(ch => {
      dungeons[ch.dungeon.id] = buildDungeon(ch);
    });
    activeMap = overworld;
    return audit();
  }

  function getMap() { return activeMap; }
  function getOverworld() { return overworld; }
  function getDungeon(id) { return dungeons[id]; }
  function setActiveMap(id) {
    if (id === 'overworld' || !id) activeMap = overworld;
    else if (dungeons[id]) activeMap = dungeons[id];
    return activeMap;
  }

  function isWalkable(x, y, state) {
    const m = activeMap;
    if (!inb(m, x, y)) return { ok: false, reason: 'oob' };
    const t = getT(m, x, y);
    if (t === T.DEEP || t === T.CLIFF || t === T.WALL) return { ok: false, reason: 'solid' };
    if (t === T.SHALLOW) {
      const hasSkiff = state && state.tools && state.tools.includes('skiff');
      return hasSkiff ? { ok: true, surf: true } : { ok: false, reason: 'water' };
    }
    if (t === T.GATE_CH4) {
      const unlocked = state && state.unlockedChapters && state.unlockedChapters.includes(4);
      return unlocked ? { ok: true } : { ok: false, reason: 'gate', chapter: 4 };
    }
    if (t === T.GATE_CH5) {
      const unlocked = state && state.unlockedChapters && state.unlockedChapters.includes(5);
      return unlocked ? { ok: true } : { ok: false, reason: 'gate', chapter: 5 };
    }
    const obj = hasObjAt(m, x, y);
    if (obj && obj.solid) return { ok: false, reason: 'obj', obj };
    const npc = hasNpcAt(m, x, y);
    if (npc) return { ok: false, reason: 'npc', npc };
    const ch = hasChestAt(m, x, y);
    if (ch) return { ok: false, reason: 'chest', chest: ch };
    if (m.boss && m.boss.x === x && m.boss.y === y) {
      return { ok: false, reason: 'boss', boss: m.boss };
    }
    return { ok: true };
  }

  /* ---------------- BFS Reachability Audit ---------------- */
  function audit() {
    const m = overworld;
    const vis = new Uint8Array(m.w * m.h);
    const fullState = { unlockedChapters: [1, 2, 3, 4, 5], tools: ['skiff'] };
    const prev = activeMap;
    activeMap = m;
    const sx = 34, sy = 92;
    const q = [[sx, sy]];
    vis[idx(m, sx, sy)] = 1;
    let head = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < q.length) {
      const [cx, cy] = q[head++];
      for (let d = 0; d < 4; d++) {
        const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (!inb(m, nx, ny) || vis[idx(m, nx, ny)]) continue;
        const r = isWalkable(nx, ny, fullState);
        if (r.ok) {
          vis[idx(m, nx, ny)] = 1;
          q.push([nx, ny]);
        }
      }
    }
    const unreachable = [];
    const checkNear = (label, tx, ty) => {
      for (let d = 0; d < 4; d++) {
        const nx = tx + dirs[d][0], ny = ty + dirs[d][1];
        if (inb(m, nx, ny) && vis[idx(m, nx, ny)]) return;
      }
      if (!vis[idx(m, tx, ty)]) unreachable.push(label + '@' + tx + ',' + ty);
    };
    m.portals.forEach(p => checkNear('portal:' + p.target, p.x, p.y));
    m.chests.forEach(c => checkNear('chest:' + c.id, c.x, c.y));
    m.npcs.forEach(n => checkNear('npc:' + n.id, n.x, n.y));
    activeMap = prev;
    return { reachableTiles: q.length, unreachable };
  }

  return {
    T, OW_W, OW_H,
    init, getMap, getOverworld, getDungeon, setActiveMap,
    getT, getZ, inb, hasObjAt, hasNpcAt, hasChestAt, isWalkable, audit,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.World = World;
if (typeof module === 'object' && module.exports) module.exports = World;
