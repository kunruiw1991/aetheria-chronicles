'use strict';
/* ==========================================================================
 * data.js — Aetheria Chronicles: Classic Fantasy RPG Continent Data Registry
 * 100% Original IP · Extensible Multi-Chapter Architecture
 * Chapters 1–3 FREE · Chapters 4–5 Paid Expansion Packs (+ future Ch.6+)
 * ========================================================================== */
const GameData = (() => {
  const MAP_W = 150;
  const MAP_H = 120;

  /* ---------------- Elemental Effectiveness ---------------- */
  const TYPE_STRONG = {
    grass:  ['water', 'earth'],
    water:  ['fire', 'earth'],
    fire:   ['grass', 'ice'],
    earth:  ['fire', 'storm'],
    ice:    ['grass', 'storm'],
    storm:  ['water', 'mystic'],
    mystic: ['ice', 'earth'],
  };

  function typeMultiplier(atkElem, defElem) {
    if (TYPE_STRONG[atkElem] && TYPE_STRONG[atkElem].includes(defElem)) return 1.25;
    if (TYPE_STRONG[defElem] && TYPE_STRONG[defElem].includes(atkElem)) return 0.80;
    return 1.0;
  }

  /* ---------------- 5 Classic Fantasy Chapters ---------------- */
  const CHAPTERS = [
    {
      id: 1,
      key: 'emerald',
      free: true,
      emoji: '🌿',
      name: { zh: '翡翠平原 · 晨木镇', en: 'Emerald Meadow & Dawnwood' },
      short: { zh: '翡翠平原', en: 'Emerald Meadow' },
      desc: {
        zh: '阳光洒落的冒险起点。探索晨木镇与微语森林，挑战古树灵殿的守护神兽！',
        en: 'Sunlit cradle of adventure. Explore Dawnwood Village & Whispering Woods to challenge the Ancient Root Sanctum!',
      },
      rect: [6, 66, 74, 113],
      waystone: { x: 34, y: 92 },
      healSpot: { x: 29, y: 94 },
      dungeon: {
        id: 'dun_1',
        name: { zh: '古树灵殿', en: 'Ancient Root Sanctum' },
        entrance: { x: 22, y: 74 },
        theme: 'forest',
        bossId: 'oakstag',
        bossLv: 9,
        wildPool: ['sproutling', 'acornpup', 'dewdrop', 'flutterfae'],
        sage: {
          name: { zh: '林木长老 · 艾尔', en: 'Elder Sylvan' },
          gift: { orbs: 4, treats: 3, gold: 60 },
          line: {
            zh: '欢迎踏入古树灵殿！收下这些星灵球与灵果，前方的苍木灵鹿正等待着勇敢的冒险者。',
            en: 'Welcome to the Ancient Root Sanctum! Take these Star Orbs & Treats—the Verdant Stag awaits ahead.',
          },
        },
      },
      crest: { zh: '翡翠森灵徽章', en: 'Emerald Grove Crest', emoji: '🌿' },
      wildPool: ['sproutling', 'acornpup', 'dewdrop', 'flutterfae'],
      lvRange: [3, 6],
      bossId: 'oakstag',
      bgm: 'meadow',
      color: '#34a853',
    },
    {
      id: 2,
      key: 'coral',
      free: true,
      emoji: '🐚',
      name: { zh: '珊瑚海湾 · 潮汐港', en: 'Coral Bay & Tidebreak Harbor' },
      short: { zh: '珊瑚海湾', en: 'Coral Bay' },
      desc: {
        zh: '碧蓝浅滩与珊瑚礁群。在潮汐港获取「踏浪舟」，穿越礁湖探秘沉珠秘窟！',
        en: 'Turquoise lagoons and gleaming reefs. Earn the Tideglider Skiff at Tidebreak Harbor and enter the Sunken Pearl Grotto!',
      },
      rect: [75, 66, 143, 113],
      waystone: { x: 104, y: 90 },
      healSpot: { x: 98, y: 91 },
      dungeon: {
        id: 'dun_2',
        name: { zh: '沉珠秘窟', en: 'Sunken Pearl Grotto' },
        entrance: { x: 124, y: 92 },
        theme: 'coral',
        bossId: 'leviathino',
        bossLv: 13,
        wildPool: ['coralcrab', 'pearlotter', 'voltjelly', 'tidefox'],
        sage: {
          name: { zh: '潮汐灯塔守望者', en: 'Lighthouse Keeper Coral' },
          gift: { superOrbs: 3, treats: 3, gold: 90 },
          line: {
            zh: '秘窟深处的潮声越发汹涌了！这几颗霓虹球收好，能大大提高收服沧澜海龙的概率！',
            en: 'The tides surge deep within! Take these Prism Orbs—they greatly boost catching Tidecrest!',
          },
        },
      },
      crest: { zh: '潮汐珍珠徽章', en: 'Tidal Pearl Crest', emoji: '🐚' },
      wildPool: ['coralcrab', 'pearlotter', 'voltjelly', 'tidefox'],
      lvRange: [7, 11],
      bossId: 'leviathino',
      bgm: 'coral',
      color: '#06b6d4',
    },
    {
      id: 3,
      key: 'desert',
      free: true,
      emoji: '☀️',
      name: { zh: '烈日沙城 · 绿洲古城', en: 'Sunfire Desert & Oasis Citadel' },
      short: { zh: '烈日沙城', en: 'Sunfire Desert' },
      desc: {
        zh: '金色沙海与古老金字塔。探索绿洲市集、集齐前三章徽章，直面太阳金字塔的烈阳金凤！',
        en: 'Golden dunes and ancient obelisks. Explore Oasis Citadel and challenge Heliowing inside the Solar Pyramid Vault!',
      },
      rect: [75, 28, 143, 65],
      waystone: { x: 106, y: 47 },
      healSpot: { x: 100, y: 49 },
      dungeon: {
        id: 'dun_3',
        name: { zh: '太阳金字塔地宫', en: 'Solar Pyramid Vault' },
        entrance: { x: 126, y: 36 },
        theme: 'desert',
        bossId: 'sunphoenix',
        bossLv: 17,
        wildPool: ['emberfennec', 'sandscarab', 'miragecat', 'cactuspuff'],
        sage: {
          name: { zh: '沙海占星师 · 萨拉', en: 'Dune Astrologer Zara' },
          gift: { superOrbs: 4, treats: 4, gold: 130 },
          line: {
            zh: '你已走过艾瑟瑞亚的三大免费王国！击败烈阳金凤后，北方的雪峰古堡与星界神殿正等待勇者开启！',
            en: 'You have crossed all three free kingdoms! Defeat Heliowing—then Frostpeak and Starlight Sanctum await!',
          },
        },
      },
      crest: { zh: '炽阳金冠徽章', en: 'Solar Crown Crest', emoji: '☀️' },
      wildPool: ['emberfennec', 'sandscarab', 'miragecat', 'cactuspuff'],
      lvRange: [11, 15],
      bossId: 'sunphoenix',
      bgm: 'desert',
      color: '#f59e0b',
    },
    {
      id: 4,
      key: 'frost',
      free: false,
      productId: 'ch4_pack',
      adCost: 2,
      emoji: '❄️',
      name: { zh: '雪峰古堡 · 冰晶雪原', en: 'Frostpeak Citadel & Glacier' },
      short: { zh: '雪峰古堡', en: 'Frostpeak Citadel' },
      desc: {
        zh: '【激励解锁章】银装素裹的冰晶雪原、暖融温泉与冰冠要塞！观看 2 次激励视频即可永久免费解锁！',
        en: '[Ad-Unlock Chapter] Shimmering glaciers, alpine hot springs & Glacial Crown Keep—watch 2 rewarded ads to unlock free forever!',
      },
      rect: [6, 28, 74, 65],
      waystone: { x: 38, y: 48 },
      healSpot: { x: 44, y: 49 },
      dungeon: {
        id: 'dun_4',
        name: { zh: '冰冠要塞', en: 'Glacial Crown Keep' },
        entrance: { x: 22, y: 36 },
        theme: 'frost',
        bossId: 'frostwyrm',
        bossLv: 22,
        wildPool: ['snowowl', 'glaciercub', 'crystaldeer', 'aurorawolf'],
        sage: {
          name: { zh: '凛冬守望者 · 弗蕾', en: 'Winter Warden Orin' },
          gift: { masterOrbs: 1, superOrbs: 4, gold: 180 },
          line: {
            zh: '极光在冰冠之上闪耀！这颗珍贵的圣星球送给你，去收服沉睡千年的寒穹冰龙吧！',
            en: 'The aurora blazes above the Keep! Take this Astral Orb to befriend Glacieron!',
          },
        },
      },
      crest: { zh: '极光冰晶徽章', en: 'Aurora Frost Crest', emoji: '❄️' },
      wildPool: ['snowowl', 'glaciercub', 'crystaldeer', 'aurorawolf'],
      lvRange: [16, 20],
      bossId: 'frostwyrm',
      bgm: 'frost',
      color: '#38bdf8',
    },
    {
      id: 5,
      key: 'starlight',
      free: false,
      productId: 'ch5_pack',
      adCost: 3,
      emoji: '✨',
      name: { zh: '星界神殿 · 苍穹浮岛', en: 'Starlight Sky Sanctum' },
      short: { zh: '星界神殿', en: 'Starlight Sanctum' },
      desc: {
        zh: '【终章扩展】踏上彩虹天桥进入云端浮岛，挑战终极神兽「星界圣龙」！观看 3 次激励视频即可永久解锁！',
        en: '[Grand Finale] Cross Rainbow Skybridges to floating marble isles & Celestiar—watch 3 rewarded ads to unlock free forever!',
      },
      rect: [24, 4, 126, 27],
      waystone: { x: 75, y: 18 },
      healSpot: { x: 69, y: 18 },
      dungeon: {
        id: 'dun_5',
        name: { zh: '星穹王座神殿', en: 'Celestial Throne Sanctum' },
        entrance: { x: 75, y: 10 },
        theme: 'starlight',
        bossId: 'astraldragon',
        bossLv: 28,
        wildPool: ['starbunny', 'cometsprite', 'nebulaowl', 'aetherkirin'],
        sage: {
          name: { zh: '星穹大祭司 · 露米娜', en: 'High Oracle Lumina' },
          gift: { masterOrbs: 1, superOrbs: 5, gold: 300 },
          line: {
            zh: '星辰为你铺路！收下这颗珍贵的圣星球，在星穹王座迎接与星界圣龙的终极试炼吧！',
            en: 'The cosmos opens before you! Take this rare Astral Orb for the ultimate trial against Celestiar!',
          },
        },
      },
      crest: { zh: '星穹圣辉徽章', en: 'Celestial Crown Crest', emoji: '✨' },
      wildPool: ['starbunny', 'cometsprite', 'nebulaowl', 'aetherkirin'],
      lvRange: [21, 26],
      bossId: 'astraldragon',
      bgm: 'starlight',
      color: '#a855f7',
    },
  ];

  /* ---------------- 25 Original Fantasy Critters (5 per Chapter) ---------------- */
  // art: { shape, c1, c2, c3, accent, ear, tail, wing, crown, aura }
  const CRITTERS = [
    // === CHAPTER 1: EMERALD MEADOW ===
    {
      id: 'sproutling', chapter: 1, starter: true, elem: 'grass', rarity: 'common',
      name: { zh: '青芽狸', en: 'Mosskit' },
      skill: { zh: '飞叶旋风', en: 'Leaf Whisk' },
      desc: { zh: '头顶嫩芽的元气小狸猫，最喜欢在晨露草丛里打滚。', en: 'A cheerful moss fox-kit crowned with a fresh spring sprout.' },
      hp: 50, atk: 14, spd: 12, catchBase: 0.65,
      art: { shape: 'fox', c1: '#52c46b', c2: '#d9f99d', c3: '#228b42', accent: '#facc15', ear: 'leaf', tail: 'bushy', aura: '#86efac' },
    },
    {
      id: 'acornpup', chapter: 1, starter: true, elem: 'earth', rarity: 'common',
      name: { zh: '橡果犬', en: 'Bramblepup' },
      skill: { zh: '橡果翻滚', en: 'Acorn Roll' },
      desc: { zh: '戴着橡果帽子的勇敢小犬，总能嗅出藏在树林里的宝箱。', en: 'A loyal pup wearing an acorn cap with a nose for hidden chests.' },
      hp: 56, atk: 15, spd: 11, catchBase: 0.65,
      art: { shape: 'pup', c1: '#d98a4e', c2: '#fef3c7', c3: '#8c4a1c', accent: '#4ade80', ear: 'floppy', tail: 'curl', aura: '#fde68a' },
    },
    {
      id: 'dewdrop', chapter: 1, starter: true, elem: 'water', rarity: 'common',
      name: { zh: '露珠鲤', en: 'Dewfin' },
      skill: { zh: '水泡冲击', en: 'Bubble Splash' },
      desc: { zh: '漂浮在清泉边的小水灵，尾巴甩动时会洒出彩虹露珠。', en: 'A buoyant spring spirit whose fins scatter rainbow dewdrops.' },
      hp: 52, atk: 14, spd: 13, catchBase: 0.65,
      art: { shape: 'fin', c1: '#38bdf8', c2: '#e0f2fe', c3: '#0284c7', accent: '#f472b6', ear: 'fin', tail: 'mermaid', aura: '#bae6fd' },
    },
    {
      id: 'flutterfae', chapter: 1, elem: 'fire', rarity: 'rare',
      name: { zh: '炽花蝶', en: 'Emberwing' },
      skill: { zh: '暖阳花瓣', en: 'Sunpetal Gust' },
      desc: { zh: '翅膀如暖阳花瓣般闪耀的火精灵，所过之处洒下金色花粉。', en: 'A sun-warmed fire sprite whose wings scatter glowing ember petals.' },
      hp: 46, atk: 14, spd: 15, catchBase: 0.56,
      art: { shape: 'fae', c1: '#f97316', c2: '#fef3c7', c3: '#c2410c', accent: '#fde047', wing: 'butterfly', aura: '#fed7aa' },
    },
    {
      id: 'oakstag', chapter: 1, boss: true, elem: 'grass', rarity: 'legend',
      name: { zh: '苍木灵鹿', en: 'Verdant Stag' },
      skill: { zh: '森罗光辉', en: 'Sylvan Radiance' },
      desc: { zh: '翡翠平原的守护神兽，鹿角上开满金色光叶，守护古树灵殿千年。', en: 'Guardian of Emerald Meadow whose antlers bloom with golden leaves.' },
      hp: 74, atk: 13, spd: 14, catchBase: 0.34,
      art: { shape: 'stag', c1: '#16a34a', c2: '#dcfce7', c3: '#14532d', accent: '#fbbf24', crown: 'antler', aura: '#4ade80' },
    },

    // === CHAPTER 2: CORAL BAY ===
    {
      id: 'coralcrab', chapter: 2, elem: 'water', rarity: 'common',
      name: { zh: '珊瑚钳', en: 'Reefsnap' },
      skill: { zh: '珊瑚盾击', en: 'Reef Bash' },
      desc: { zh: '背着粉红珊瑚壳的小螃蟹，敲击钳子能发出悦耳的海螺声。', en: 'A lively reef crab carrying a bright coral-crowned shell.' },
      hp: 62, atk: 16, spd: 11, catchBase: 0.58,
      art: { shape: 'crab', c1: '#fb7185', c2: '#ffe4e6', c3: '#be123c', accent: '#38bdf8', crown: 'coral', aura: '#fda4af' },
    },
    {
      id: 'pearlotter', chapter: 2, elem: 'water', rarity: 'common',
      name: { zh: '珍珠獭', en: 'Pearlkin' },
      skill: { zh: '珍珠连弹', en: 'Pearl Toss' },
      desc: { zh: '怀里总抱着一颗发光海珠的小海獭，擅长在海浪间翻跟斗。', en: 'A playful sea otter cradling a glowing ocean pearl.' },
      hp: 58, atk: 17, spd: 15, catchBase: 0.56,
      art: { shape: 'pup', c1: '#22d3ee', c2: '#ecfeff', c3: '#0e7490', accent: '#fef08a', ear: 'round', tail: 'fin', aura: '#a5f3fc' },
    },
    {
      id: 'voltjelly', chapter: 2, elem: 'storm', rarity: 'rare',
      name: { zh: '电光水母', en: 'Sparkjell' },
      skill: { zh: '雷潮脉冲', en: 'Volt Pulse' },
      desc: { zh: '在潮汐港夜空中飘浮的透明水母，伞盖里闪烁着金色电弧。', en: 'A translucent tide-jelly humming with golden coastal lightning.' },
      hp: 54, atk: 20, spd: 17, catchBase: 0.48,
      art: { shape: 'jelly', c1: '#818cf8', c2: '#fef08a', c3: '#4338ca', accent: '#facc15', aura: '#c7d2fe' },
    },
    {
      id: 'tidefox', chapter: 2, elem: 'water', rarity: 'epic',
      name: { zh: '踏浪狐', en: 'Wavekit' },
      skill: { zh: '碎浪疾冲', en: 'Surf Dash' },
      desc: { zh: '踩着浪花奔跑的蓝白灵狐，只有潮汐最旺时才会在珊瑚礁现身。', en: 'A sleek sea-foam fox that sprints effortlessly across rolling waves.' },
      hp: 66, atk: 21, spd: 19, catchBase: 0.42,
      art: { shape: 'fox', c1: '#0ea5e9', c2: '#f0f9ff', c3: '#0369a1', accent: '#67e8f9', ear: 'point', tail: 'wave', aura: '#7dd3fc' },
    },
    {
      id: 'leviathino', chapter: 2, boss: true, elem: 'water', rarity: 'legend',
      name: { zh: '沧澜海龙', en: 'Tidecrest' },
      skill: { zh: '沧海龙卷', en: 'Maelstrom Surge' },
      desc: { zh: '珊瑚海湾的守护海龙，优雅地守护着沉珠秘窟与海上航路。', en: 'Graceful sea dragon guardian of Coral Bay and Sunken Pearl Grotto.' },
      hp: 88, atk: 17, spd: 17, catchBase: 0.30,
      art: { shape: 'dragon', c1: '#0284c7', c2: '#bae6fd', c3: '#1e3a8a', accent: '#fde047', wing: 'fin', crown: 'pearl', aura: '#38bdf8' },
    },

    // === CHAPTER 3: SUNFIRE DESERT ===
    {
      id: 'emberfennec', chapter: 3, elem: 'fire', rarity: 'common',
      name: { zh: '炽焰耳狐', en: 'Solkit' },
      skill: { zh: '耀日火球', en: 'Solar Spark' },
      desc: { zh: '拥有大耳朵和火焰尾尖的沙漠狐，夜晚能为旅人照亮沙丘。', en: 'A big-eared desert fennec whose flame-tipped tail lights the dunes.' },
      hp: 68, atk: 22, spd: 19, catchBase: 0.54,
      art: { shape: 'fox', c1: '#f97316', c2: '#ffedd5', c3: '#c2410c', accent: '#fde047', ear: 'big', tail: 'flame', aura: '#fdba74' },
    },
    {
      id: 'sandscarab', chapter: 3, elem: 'earth', rarity: 'common',
      name: { zh: '金甲圣虫', en: 'Gildbeetle' },
      skill: { zh: '金沙冲锋', en: 'Dune Charge' },
      desc: { zh: '甲壳如黄金般闪耀的沙海甲虫，传说能推着微型太阳前行。', en: 'A gleaming golden scarab said to roll miniature suns across the sands.' },
      hp: 78, atk: 20, spd: 14, catchBase: 0.52,
      art: { shape: 'beetle', c1: '#eab308', c2: '#fef9c3', c3: '#a16207', accent: '#06b6d4', crown: 'sun', aura: '#fde047' },
    },
    {
      id: 'cactuspuff', chapter: 3, elem: 'grass', rarity: 'rare',
      name: { zh: '仙人球宝', en: 'Pricklepop' },
      skill: { zh: '沙花飞针', en: 'Bloom Volley' },
      desc: { zh: '头顶盛开艳红花朵的圆滚滚仙人球，其实性格超温柔。', en: 'A plump desert cactus crowned with a scarlet flower and a warm heart.' },
      hp: 76, atk: 21, spd: 13, catchBase: 0.48,
      art: { shape: 'cactus', c1: '#22c55e', c2: '#bbf7d0', c3: '#15803d', accent: '#f43f5e', crown: 'flower', aura: '#86efac' },
    },
    {
      id: 'miragecat', chapter: 3, elem: 'mystic', rarity: 'epic',
      name: { zh: '沙影灵猫', en: 'Dunesphinx' },
      skill: { zh: '蜃景幻爪', en: 'Mirage Claw' },
      desc: { zh: '戴着蓝宝石额饰的沙漠灵猫，总在绿洲日落时踏着微风现身。', en: 'A regal oasis cat adorned with a sapphire brow gem.' },
      hp: 74, atk: 25, spd: 22, catchBase: 0.40,
      art: { shape: 'cat', c1: '#d97706', c2: '#fef3c7', c3: '#78350f', accent: '#38bdf8', crown: 'gem', tail: 'slim', aura: '#fcd34d' },
    },
    {
      id: 'sunphoenix', chapter: 3, boss: true, elem: 'fire', rarity: 'legend',
      name: { zh: '烈阳金凤', en: 'Heliowing' },
      skill: { zh: '日冕羽翼', en: 'Corona Flare' },
      desc: { zh: '太阳金字塔的守护金凤，双翼展翅如朝阳破晓，光芒照耀整片沙海。', en: 'Radiant phoenix guardian of the Solar Pyramid Vault.' },
      hp: 102, atk: 20, spd: 21, catchBase: 0.28,
      art: { shape: 'bird', c1: '#ef4444', c2: '#fde047', c3: '#991b1b', accent: '#fb923c', wing: 'phoenix', crown: 'sun', aura: '#fb923c' },
    },

    // === CHAPTER 4: FROSTPEAK CITADEL (AD-UNLOCK CHAPTER) ===
    {
      id: 'snowowl', chapter: 4, elem: 'ice', rarity: 'common',
      name: { zh: '霜羽鸮', en: 'Flurryhoot' },
      skill: { zh: '冰晶旋风', en: 'Frost Gust' },
      desc: { zh: '披着雪白羽绒的冰原猫头鹰，振翅时会飘落晶莹雪花。', en: 'A snow-plumed owl whose silent wings scatter sparkling frost.' },
      hp: 84, atk: 26, spd: 23, catchBase: 0.50,
      art: { shape: 'owl', c1: '#e2e8f0', c2: '#ffffff', c3: '#64748b', accent: '#38bdf8', wing: 'feathered', aura: '#e0f2fe' },
    },
    {
      id: 'glaciercub', chapter: 4, elem: 'ice', rarity: 'common',
      name: { zh: '冰原熊崽', en: 'Rimebear' },
      skill: { zh: '冰川重踏', en: 'Glacier Slam' },
      desc: { zh: '系着蓝围巾的憨厚小冰熊，最喜欢泡完雪山温泉再去滑雪。', en: 'A sturdy frost bear cub wearing an icy scarf who loves hot springs.' },
      hp: 98, atk: 27, spd: 16, catchBase: 0.48,
      art: { shape: 'bear', c1: '#93c5fd', c2: '#f0f9ff', c3: '#2563eb', accent: '#f43f5e', ear: 'round', aura: '#bfdbfe' },
    },
    {
      id: 'crystaldeer', chapter: 4, elem: 'mystic', rarity: 'rare',
      name: { zh: '晶角雪鹿', en: 'Prismfawn' },
      skill: { zh: '棱镜极光', en: 'Prism Beam' },
      desc: { zh: '透明水晶鹿角会折射七彩极光，踏雪无痕的神秘雪鹿。', en: 'A crystal-antlered fawn that refracts northern lights into rainbows.' },
      hp: 88, atk: 29, spd: 25, catchBase: 0.42,
      art: { shape: 'stag', c1: '#67e8f9', c2: '#f0f9ff', c3: '#0284c7', accent: '#e879f9', crown: 'crystal', aura: '#a5f3fc' },
    },
    {
      id: 'aurorawolf', chapter: 4, elem: 'storm', rarity: 'epic',
      name: { zh: '极光雪狼', en: 'Borealfang' },
      skill: { zh: '极光奔雷', en: 'Aurora Howl' },
      desc: { zh: '披着翡翠与紫罗兰极光鬃毛的雪山孤狼，速度如风雪闪电。', en: 'A swift alpine wolf with a mane shimmering like the aurora borealis.' },
      hp: 94, atk: 32, spd: 28, catchBase: 0.36,
      art: { shape: 'fox', c1: '#38bdf8', c2: '#e0f2fe', c3: '#1e40af', accent: '#34d399', ear: 'point', tail: 'aurora', aura: '#6ee7b7' },
    },
    {
      id: 'frostwyrm', chapter: 4, boss: true, elem: 'ice', rarity: 'legend',
      name: { zh: '寒穹冰龙', en: 'Glacieron' },
      skill: { zh: '永冻星陨', en: 'Permafrost Nova' },
      desc: { zh: '冰冠要塞的传说守护龙，晶翼展动间唤醒整座雪峰的极光。', en: 'Legendary crystal-winged ice dragon ruling Glacial Crown Keep.' },
      hp: 155, atk: 33, spd: 24, catchBase: 0.25,
      art: { shape: 'dragon', c1: '#38bdf8', c2: '#f0f9ff', c3: '#1d4ed8', accent: '#c084fc', wing: 'crystal', crown: 'crystal', aura: '#93c5fd' },
    },

    // === CHAPTER 5: STARLIGHT SKY SANCTUM (AD-UNLOCK CHAPTER) ===
    {
      id: 'starbunny', chapter: 5, elem: 'mystic', rarity: 'common',
      name: { zh: '星月兔', en: 'Lunahop' },
      skill: { zh: '月华跃击', en: 'Moonbeam Hop' },
      desc: { zh: '长耳朵垂落星砂的月光兔，在浮岛彩虹桥上轻盈起舞。', en: 'A velvet moon rabbit whose long ears trail sparkling stardust.' },
      hp: 102, atk: 32, spd: 30, catchBase: 0.45,
      art: { shape: 'bunny', c1: '#c084fc', c2: '#faf5ff', c3: '#7e22ce', accent: '#fde047', ear: 'bunny', crown: 'moon', aura: '#e9d5ff' },
    },
    {
      id: 'cometsprite', chapter: 5, elem: 'fire', rarity: 'rare',
      name: { zh: '彗星精灵', en: 'Novawisp' },
      skill: { zh: '彗尾星爆', en: 'Comet Tail' },
      desc: { zh: '由流星碎片诞生的金色小精灵，飞行时拉出长长的星焰尾巴。', en: 'A radiant starlight sprite born from a golden shooting comet.' },
      hp: 96, atk: 36, spd: 32, catchBase: 0.40,
      art: { shape: 'fae', c1: '#fbbf24', c2: '#fef9c3', c3: '#d97706', accent: '#38bdf8', wing: 'star', aura: '#fde68a' },
    },
    {
      id: 'nebulaowl', chapter: 5, elem: 'storm', rarity: 'epic',
      name: { zh: '星云灵枭', en: 'Cosmowing' },
      skill: { zh: '星河飓风', en: 'Nebula Gale' },
      desc: { zh: '双翼映照整片银河星云的圣域守护鸟，智慧堪比星穹祭司。', en: 'An astral owl whose wings mirror swirling violet galaxies.' },
      hp: 110, atk: 37, spd: 31, catchBase: 0.35,
      art: { shape: 'owl', c1: '#6366f1', c2: '#e0e7ff', c3: '#312e81', accent: '#f472b6', wing: 'star', crown: 'star', aura: '#a5b4fc' },
    },
    {
      id: 'aetherkirin', chapter: 5, elem: 'mystic', rarity: 'epic',
      name: { zh: '苍穹麒麟', en: 'Aetherin' },
      skill: { zh: '天光踏云', en: 'Celestial Hoof' },
      desc: { zh: '踏云而行的祥瑞星兽，周身环绕虹光，是星界神殿的圣使。', en: 'A cloud-striding celestial kirin wreathed in iridescent light.' },
      hp: 120, atk: 38, spd: 34, catchBase: 0.30,
      art: { shape: 'stag', c1: '#f59e0b', c2: '#fffbeb', c3: '#b45309', accent: '#a855f7', crown: 'halo', aura: '#fde047' },
    },
    {
      id: 'astraldragon', chapter: 5, boss: true, elem: 'mystic', rarity: 'legend',
      name: { zh: '星界圣龙', en: 'Celestiar' },
      skill: { zh: '创世星河', en: 'Genesis Starfall' },
      desc: { zh: '艾瑟瑞亚大陆的至高守护圣龙，掌管星辰与五大王国的永恒平衡。', en: 'Supreme celestial dragon guardian watching over all five realms of Aetheria.' },
      hp: 175, atk: 37, spd: 28, catchBase: 0.24,
      art: { shape: 'dragon', c1: '#9333ea', c2: '#fef08a', c3: '#4c1d95', accent: '#38bdf8', wing: 'astral', crown: 'halo', aura: '#d8b4fe' },
    },
  ];

  const CRITTER_BY_ID = {};
  CRITTERS.forEach(c => { CRITTER_BY_ID[c.id] = c; });

  /* ---------------- 5 Playable Hero Characters ---------------- */
  const HEROES = [
    {
      id: 'ranger',
      free: true,
      name: { zh: '林风 · 翡翠游侠', en: 'Rowan · Emerald Ranger' },
      short: { zh: '林风', en: 'Rowan' },
      perkDesc: { zh: '灵宠收服率 +10%', en: '+10% Critter Catch Rate' },
      perk: { catchBonus: 0.10 },
      colors: { hair: '#5c3a21', skin: '#fde2c4', tunic: '#22a055', cape: '#15803d', trim: '#fbbf24', hat: 'hood' },
    },
    {
      id: 'tidecaller',
      free: false,
      goldPrice: 180,
      name: { zh: '汐月 · 潮汐术士', en: 'Marina · Tidecaller' },
      short: { zh: '汐月', en: 'Marina' },
      perkDesc: { zh: '海洋/寒冰伤害 +18%，战斗回血更强', en: '+18% Water/Ice Power & Enhanced Healing' },
      perk: { elemBonus: ['water', 'ice'], elemMult: 1.18, healBonus: 0.2 },
      colors: { hair: '#0284c7', skin: '#ffe4d1', tunic: '#0ea5e9', cape: '#38bdf8', trim: '#fde047', hat: 'tiara' },
    },
    {
      id: 'sunblade',
      free: false,
      goldPrice: 320,
      name: { zh: '烈阳 · 耀日骑士', en: 'Solarius · Sunblade Knight' },
      short: { zh: '烈阳', en: 'Solarius' },
      perkDesc: { zh: '全队战斗攻击力 +18%', en: '+18% Team Attack Power' },
      perk: { atkMult: 1.18 },
      colors: { hair: '#b45309', skin: '#f8d4b4', tunic: '#ea580c', cape: '#dc2626', trim: '#facc15', hat: 'helm' },
    },
    {
      id: 'valkyrie',
      free: false,
      productId: 'hero_valkyrie',
      adCost: 2,
      name: { zh: '凛霜 · 极光女武神', en: 'Freya · Frost Valkyrie' },
      short: { zh: '凛霜', en: 'Freya' },
      perkDesc: { zh: '全队最大生命 +22% · 进战自带寒冰护盾', en: '+22% Max HP & Frost Shield at Battle Start' },
      perk: { hpMult: 1.22, startShield: true },
      colors: { hair: '#e0f2fe', skin: '#fff1e6', tunic: '#2563eb', cape: '#67e8f9', trim: '#e2e8f0', hat: 'winghelm' },
    },
    {
      id: 'summoner',
      free: false,
      productId: 'hero_summoner',
      adCost: 3,
      name: { zh: '星语 · 星界召唤师', en: 'Astraea · Starlight Summoner' },
      short: { zh: '星语', en: 'Astraea' },
      perkDesc: { zh: '收服率 +22% · 经验与金币获取 +35%', en: '+22% Catch Rate & +35% EXP / Gold' },
      perk: { catchBonus: 0.22, expMult: 1.35, goldMult: 1.35 },
      colors: { hair: '#a855f7', skin: '#fff1e6', tunic: '#6d28d9', cape: '#ec4899', trim: '#fde047', hat: 'starhat' },
    },
  ];
  const HERO_BY_ID = {};
  HEROES.forEach(h => { HERO_BY_ID[h.id] = h; });

  /* ---------------- 7 Fancy Tools & Gadgets ---------------- */
  const TOOLS = [
    {
      id: 'boots',
      emoji: '🛼',
      free: true,
      name: { zh: '疾风靴', en: 'Windstep Boots' },
      desc: { zh: '按住 B 键或 Shift 极速疾跑，留下翠绿星风尾迹！', en: 'Hold B / Shift to dash swiftly with glowing wind-trail sparkles!' },
      effect: { dashSpeed: 1.68 },
    },
    {
      id: 'skiff',
      emoji: '🛶',
      free: false,
      goldPrice: 120,
      questUnlockChapter: 2,
      name: { zh: '踏浪舟', en: 'Tideglider Skiff' },
      desc: { zh: '可在珊瑚海湾浅滩与水域自由踏浪滑行，直达秘密珍珠岛！', en: 'Glide effortlessly over shallow reefs & coastal waters to secret islands!' },
      effect: { surfShallow: true },
    },
    {
      id: 'compass',
      emoji: '🧭',
      free: false,
      goldPrice: 200,
      name: { zh: '寻宝罗盘', en: 'Treasure Compass' },
      desc: { zh: '在主界面实时显示金色箭头，指引最近的未开宝箱或秘境入口！', en: 'Live golden HUD pointer showing direction & distance to nearest chest!' },
      effect: { showCompass: true },
    },
    {
      id: 'magnet',
      emoji: '🧲',
      free: false,
      goldPrice: 360,
      productId: 'tool_magnet',
      adCost: 1,
      name: { zh: '星光磁石', en: 'Starlight Magnet' },
      desc: { zh: '自动吸附附近掉落金币与星尘，战斗与宝箱金币收益 +35%！', en: 'Auto-collects nearby loot & boosts all Gold rewards by +35%!' },
      effect: { goldMult: 1.35 },
    },
    {
      id: 'lantern',
      emoji: '🏮',
      free: false,
      productId: 'tool_lantern',
      adCost: 1,
      name: { zh: '时空提灯', en: 'Chrono Lantern' },
      desc: { zh: '在角色周身绽放金色光晕照亮秘境，稀有/史诗灵宠遇见率翻倍！', en: 'Casts a warm radiant aura & doubles Rare/Epic Critter encounter rate!' },
      effect: { glowAura: true, rareBoost: 2.0 },
    },
    {
      id: 'wings',
      emoji: '🪽',
      free: false,
      productId: 'tool_wings',
      adCost: 2,
      name: { zh: '星穹之翼', en: 'Aether Wings' },
      desc: { zh: '展开流光羽翼滑翔（移速+18%），并在大地图一键瞬移至任意已解锁章节！', en: 'Spread glowing wings (+18% speed) & instant Fast Travel from World Map!' },
      effect: { speedMult: 1.18, fastTravel: true, wingFx: true },
    },
    {
      id: 'prismstaff',
      emoji: '🔮',
      free: false,
      productId: 'tool_prismstaff',
      adCost: 2,
      name: { zh: '棱镜捕星杖', en: 'Prism Capture Staff' },
      desc: { zh: '投掷星灵球时释放七彩棱镜光束，全种类星灵球收服率 +25%！', en: 'Channels a rainbow capture beam adding +25% catch chance to all Orbs!' },
      effect: { catchBonus: 0.25 },
    },
  ];
  const TOOL_BY_ID = {};
  TOOLS.forEach(t => { TOOL_BY_ID[t.id] = t; });

  /* ---------------- IAA Rewarded-Ad Unlock Packs (Zero Cash Paywalls) ---------------- */
  const PRODUCTS = [
    {
      id: 'season_pass',
      category: 'chapters',
      featured: true,
      isBundle: true,
      creditFrom: ['ch4_pack', 'ch5_pack'],
      emoji: '👑',
      name: { zh: '全章节探险大礼包（激励合集）', en: 'Grand Explorer All-Chapter Bundle' },
      desc: {
        zh: '累计观看 4 次激励视频即可一次解锁第 4 章「雪峰古堡」+ 第 5 章「星界神殿」+ 英雄「凛霜女武神」+ 神器「星穹之翼」+ 1 颗圣星球 + 300 金币！',
        en: 'Watch 4 total rewarded ads to unlock Ch.4 Frostpeak + Ch.5 Starlight + Frost Valkyrie Hero + Aether Wings + 1 Astral Orb + 300 Gold!',
      },
      adCost: 4,
      grants: { chapters: [4, 5], heroes: ['valkyrie'], tools: ['wings'], items: { masterOrbs: 1, gold: 300 } },
    },
    {
      id: 'ch4_pack',
      category: 'chapters',
      emoji: '❄️',
      name: { zh: '第 4 章：雪峰古堡扩展包', en: 'Chapter 4: Frostpeak Citadel Pack' },
      desc: {
        zh: '观看 2 次激励视频永久解锁冰晶雪原大陆、冰冠要塞秘境、5 只极地灵宠与守护神兽「寒穹冰龙」+ 赠 3 颗霓虹球！',
        en: 'Watch 2 rewarded ads to unlock Frostpeak Glacier, Glacial Crown Keep, 5 Frost Critters & Glacieron Boss + 3 Prism Orbs!',
      },
      adCost: 2,
      grants: { chapters: [4], items: { superOrbs: 3 } },
    },
    {
      id: 'ch5_pack',
      category: 'chapters',
      emoji: '✨',
      name: { zh: '第 5 章：星界神殿终章包', en: 'Chapter 5: Starlight Sanctum Pack' },
      desc: {
        zh: '观看 3 次激励视频永久解锁苍穹浮岛大陆、星穹王座神殿、5 只星界灵宠与终极神兽「星界圣龙」+ 赠 1 颗圣星球！',
        en: 'Watch 3 rewarded ads to unlock Starlight Sky Isles, Celestial Throne, 5 Astral Critters & Celestiar Boss + 1 Astral Orb!',
      },
      adCost: 3,
      grants: { chapters: [5], items: { masterOrbs: 1 } },
    },
    {
      id: 'hero_valkyrie',
      category: 'heroes',
      emoji: '🛡️',
      heroId: 'valkyrie',
      name: { zh: '英雄：凛霜 · 极光女武神', en: 'Hero: Freya · Frost Valkyrie' },
      desc: { zh: '全队最大生命 +22%，每场战斗开局自带寒冰护盾，专属银翼披风外观！', en: '+22% Max HP & Frost Shield every battle + exclusive silver-wing sprite!' },
      adCost: 2,
      grants: { heroes: ['valkyrie'] },
    },
    {
      id: 'hero_summoner',
      category: 'heroes',
      emoji: '🌟',
      heroId: 'summoner',
      name: { zh: '英雄：星语 · 星界召唤师', en: 'Hero: Astraea · Starlight Summoner' },
      desc: { zh: '全队收服率 +22%，经验与金币获取 +35%，专属星帽幻光披风外观！', en: '+22% Catch Rate & +35% EXP/Gold + exclusive astral mage sprite!' },
      adCost: 3,
      grants: { heroes: ['summoner'] },
    },
    {
      id: 'tool_magnet',
      category: 'tools',
      emoji: '🧲',
      toolId: 'magnet',
      name: { zh: '神器：星光磁石', en: 'Fancy Tool: Starlight Magnet' },
      desc: { zh: '自动吸附附近星尘与金币，战斗和宝箱金币收益 +35%！', en: 'Auto-collects nearby loot & boosts all Gold earned by +35%!' },
      adCost: 1,
      goldAlt: 360,
      grants: { tools: ['magnet'] },
    },
    {
      id: 'tool_lantern',
      category: 'tools',
      emoji: '🏮',
      toolId: 'lantern',
      name: { zh: '神器：时空提灯', en: 'Fancy Tool: Chrono Lantern' },
      desc: { zh: '周身散发暖金光环照亮秘境，稀有与史诗灵宠出现概率翻倍！', en: 'Radiant golden aura + doubles Rare & Epic Critter encounter rate!' },
      adCost: 1,
      grants: { tools: ['lantern'] },
    },
    {
      id: 'tool_wings',
      category: 'tools',
      emoji: '🪽',
      toolId: 'wings',
      name: { zh: '神器：星穹之翼', en: 'Fancy Tool: Aether Wings' },
      desc: { zh: '展开流光羽翼（移速+18%），解锁大地图点击任意已解锁章节一键瞬移！', en: 'Glowing wings (+18% speed) & instant Fast Travel on the World Map!' },
      adCost: 2,
      grants: { tools: ['wings'] },
    },
    {
      id: 'tool_prismstaff',
      category: 'tools',
      emoji: '🔮',
      toolId: 'prismstaff',
      name: { zh: '神器：棱镜捕星杖', en: 'Fancy Tool: Prism Capture Staff' },
      desc: { zh: '七彩棱镜光束加持，所有星灵球捕捉成功率永久 +25%！', en: 'Rainbow capture beam permanently boosts all Orb catch rates by +25%!' },
      adCost: 2,
      grants: { tools: ['prismstaff'] },
    },
    {
      id: 'ad_supply_pack',
      category: 'items',
      repeatable: true,
      emoji: '🎁',
      name: { zh: '激励补给空投箱（可重复领）', en: 'Rewarded Ad Supply Drop (Repeatable)' },
      desc: { zh: '观看 1 次激励视频即可免费领取：霓虹球 ×3 + 甜心灵果 ×3 + 100 金币！', en: 'Watch 1 rewarded ad to claim FREE: Prism Orbs ×3 + Sweet Treats ×3 + 100 Gold!' },
      adCost: 1,
      grants: { items: { superOrbs: 3, treats: 3, gold: 100 } },
    },
  ];

  const PRODUCT_BY_ID = {};
  PRODUCTS.forEach(p => { PRODUCT_BY_ID[p.id] = p; });

  /* ---------------- Gold Supply Items ---------------- */
  const SUPPLIES = [
    { id: 'orbs', emoji: '🔵', price: 25, amount: 3, name: { zh: '星灵球 ×3', en: 'Star Orbs ×3' }, desc: { zh: '标准捕捉球，适合日常收服野生灵宠。', en: 'Standard capture orbs for wild Critters.' } },
    { id: 'superOrbs', emoji: '🌈', price: 75, amount: 3, name: { zh: '霓虹球 ×3', en: 'Prism Orbs ×3' }, desc: { zh: '高概率捕捉球（1.6x 收服率），适合稀有灵宠！', en: 'High-rate orbs (1.6x catch chance) for rare Critters!' } },
    { id: 'masterOrbs', emoji: '👑', price: 180, amount: 1, name: { zh: '圣星球 ×1', en: 'Astral Orb ×1' }, desc: { zh: '传说级捕捉球，100% 收服任何灵宠与守护神兽！', en: 'Legendary orb—100% guaranteed capture on any Critter or Boss!' } },
    { id: 'treats', emoji: '🍓', price: 30, amount: 4, name: { zh: '甜心灵果 ×4', en: 'Sweet Treats ×4' }, desc: { zh: '喂给野生灵宠大幅提升收服率，同时恢复我方体力。', en: 'Boosts catch chance & restores partner HP in battle.' } },
  ];

  function getChapter(id) {
    return CHAPTERS.find(c => c.id === id) || CHAPTERS[0];
  }

  return {
    MAP_W, MAP_H,
    CHAPTERS, getChapter,
    CRITTERS, CRITTER_BY_ID,
    HEROES, HERO_BY_ID,
    TOOLS, TOOL_BY_ID,
    PRODUCTS, PRODUCT_BY_ID,
    SUPPLIES,
    typeMultiplier,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.GameData = GameData;
if (typeof module === 'object' && module.exports) module.exports = GameData;
