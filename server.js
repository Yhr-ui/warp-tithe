'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3210;
const ROOM_TTL_MS = 60 * 60 * 1000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const GALAXY_EDGE_LENGTH = 8;
const DOMINION_TARGET = 20;
const MAX_DOOM = 40;
const WAR_LOSS_BASE = 35;
const WAR_LOSS_PER_LEVEL = 20;
const REPARATION_PER_LEVEL = 40;
const RECOVERY_ROUNDS = 3;
const NURGLE_ID = 'nurgle';
const NURGLE_DURATION_ROUNDS = 5;
const SLAANESH_HOLD_TURNS = 2;

const GALAXY_DEFINITIONS = [
  {
    key: 'solar',
    name: '索拉里昂星区',
    color: '#e2bd64',
    center: { x: 50, y: 20 },
    vertices: {
      apex: { x: 50, y: 4 },
      left: { x: 28, y: 34 },
      right: { x: 72, y: 34 },
    },
    tiles: [
      { name: '风暴枢纽', type: 'shop' },
      { name: '赫拉凤巢', type: 'hive' },
      { name: '维吉勒斯巢都', type: 'hive' },
      { name: '梅尔加德铸造界', type: 'forge' },
      { name: '格里芬铸造界', type: 'forge' },
      { name: '塔兰锻造世界', type: 'forge' },
      { name: '光耀圣祠', type: 'shrine' },
      { name: '塞赫拉圣殿', type: 'shrine' },
      { name: '太阳星门', type: 'vertex', teleportTo: 'alpha:0' },
      { name: '努西里亚', type: 'death' },
      { name: '卡塔昌', type: 'death' },
      { name: '喀里西斯死亡世界', type: 'death' },
      { name: '阿格里皮娜', type: 'hive' },
      { name: '涅克蒙达', type: 'hive' },
      { name: '黑石要塞', type: 'relic' },
      { name: '莫迪安铸造界', type: 'forge' },
      { name: '黄金星门', type: 'vertex', teleportTo: 'gamma:0' },
      { name: '阿玛拉钢铁世界', type: 'forge' },
      { name: '瑞扎铸造界', type: 'forge' },
      { name: '加里亚努斯铸造界', type: 'forge' },
      { name: '伊莎之泪', type: 'maiden' },
      { name: '希拉圣血世界', type: 'shrine' },
      { name: '阿米吉多顿', type: 'death' },
      { name: '瓦尔哈拉', type: 'death' },
    ],
  },
  {
    key: 'alpha',
    name: '阿尔法核心',
    color: '#58d5c8',
    center: { x: 25, y: 73 },
    vertices: {
      apex: { x: 26, y: 50 },
      left: { x: 4, y: 93 },
      right: { x: 45, y: 93 },
    },
    tiles: [
      { name: '阿尔法星门', type: 'vertex', teleportTo: 'solar:8' },
      { name: '奥克塔琉斯要塞', type: 'hive' },
      { name: '网道回廊', type: 'webway' },
      { name: '韦尔丹尼斯铸造界', type: 'forge' },
      { name: '乌斯维', type: 'maiden' },
      { name: '伊利里亚圣殿', type: 'shrine' },
      { name: '卢修斯', type: 'hive' },
      { name: '图勒死亡世界', type: 'death' },
      { name: '虚空贸易港', type: 'shop' },
      { name: '索萨巢都', type: 'hive' },
      { name: '库拉铸造界', type: 'forge' },
      { name: '卡迪亚残骸', type: 'forge' },
      { name: '沉睡墓穴', type: 'tomb' },
      { name: '奥兰息斯圣祠', type: 'shrine' },
      { name: '次元回廊', type: 'webway' },
      { name: '梅杜莎死亡世界', type: 'death' },
      { name: '伽马联络港', type: 'vertex', teleportTo: 'gamma:8' },
      { name: '阿德拉斯塔堡', type: 'hive' },
      { name: '奥菲莉亚', type: 'shrine' },
      { name: '维戈斯铸造界', type: 'forge' },
      { name: '萨弗拉', type: 'death' },
      { name: '洛伦萨圣祠', type: 'shrine' },
      { name: '塞弗', type: 'hive' },
      { name: '塔洛斯死亡世界', type: 'death' },
    ],
  },
  {
    key: 'gamma',
    name: '伽马核心',
    color: '#b96be8',
    center: { x: 75, y: 73 },
    vertices: {
      apex: { x: 74, y: 50 },
      left: { x: 55, y: 93 },
      right: { x: 96, y: 93 },
    },
    tiles: [
      { name: '紫晶星门', type: 'vertex', teleportTo: 'solar:16' },
      { name: '伊克萨死亡世界', type: 'death' },
      { name: '混沌魔域', type: 'warp' },
      { name: '塞弗斯铸造界', type: 'forge' },
      { name: '异形遗迹', type: 'tomb' },
      { name: '昆图斯巢都', type: 'hive' },
      { name: '沃拉克', type: 'death' },
      { name: '梅萨利圣祠', type: 'shrine' },
      { name: '阿尔法联络港', type: 'vertex', teleportTo: 'alpha:16' },
      { name: '摩洛克死亡世界', type: 'death' },
      { name: '太空废船', type: 'relic' },
      { name: '奥克塔维亚铸造界', type: 'forge' },
      { name: '特里安', type: 'hive' },
      { name: '梅德雷格巢都', type: 'hive' },
      { name: '泰坦之泪', type: 'maiden' },
      { name: '埃克塞特圣祠', type: 'shrine' },
      { name: '风暴眼黑市', type: 'shop' },
      { name: '奈克罗斯死亡世界', type: 'death' },
      { name: '维斯塔', type: 'shrine' },
      { name: '科罗努斯铸造界', type: 'forge' },
      { name: '兹拉杜斯', type: 'death' },
      { name: '奥菲利亚巢都', type: 'hive' },
      { name: '大漩涡', type: 'warp' },
      { name: '塔纳托斯死亡世界', type: 'death' },
    ],
  },
];

const BOARD_DEFINITIONS = GALAXY_DEFINITIONS.flatMap((galaxy) => (
  galaxy.tiles.map((tile, localIndex) => ({
    ...tile,
    galaxy: galaxy.key,
    galaxyName: galaxy.name,
    galaxyColor: galaxy.color,
    localIndex,
  }))
));

const TILE_TYPES = {
  start: { label: '起点', glyph: 'G', color: '#d6b56d', claimable: false },
  shop: { label: '商店', glyph: '$', color: '#e5c45f', claimable: false },
  hive: { label: '巢都', glyph: 'H', color: '#c88a42', cost: 90, value: 1, yield: 16, claimable: true },
  forge: { label: '铸造', glyph: 'F', color: '#a8b7b5', cost: 120, value: 2, yield: 22, claimable: true },
  shrine: { label: '圣祠', glyph: 'S', color: '#d0c6a5', cost: 100, value: 1, yield: 15, claimable: true },
  death: { label: '死亡', glyph: 'D', color: '#a54d3d', cost: 75, value: 1, yield: 13, claimable: true },
  maiden: { label: '处女', glyph: 'M', color: '#8e9e83', claimable: false },
  tomb: { label: '墓穴', glyph: 'T', color: '#6f8e84', claimable: false },
  relic: { label: '遗物', glyph: 'R', color: '#b98b45', claimable: false },
  webway: { label: '网道', glyph: 'E', color: '#4d847d', claimable: false },
  warp: { label: '亚空间', glyph: 'W', color: '#963e34', claimable: false },
  vertex: { label: '星门', glyph: 'V', color: '#e2bd64', claimable: false },
  anchor: { label: '信标', glyph: 'A', color: '#b96be8', claimable: false },
};

const FACTIONS = {
  imperium: {
    name: '人类帝国',
    shortName: '帝国',
    color: '#d0a24c',
    startInfluence: 600,
  },
  chaos: {
    name: '混沌军团',
    shortName: '混沌',
    color: '#b84436',
    startInfluence: 600,
  },
  orks: {
    name: '兽人 Waaagh!',
    shortName: '兽人',
    color: '#7fa34f',
    startInfluence: 600,
  },
  aeldari: {
    name: '方舟灵族',
    shortName: '灵族',
    color: '#4b8f8a',
    startInfluence: 600,
  },
  necrons: {
    name: '太空死灵',
    shortName: '死灵',
    color: '#62cf9d',
    startInfluence: 600,
  },
  tau: {
    name: '钛帝国',
    shortName: '钛',
    color: '#579edc',
    startInfluence: 600,
  },
};

const FACTION_KEYS = Object.keys(FACTIONS);
const SKILL_DEFINITIONS = {
  income: {
    name: '什一税增效',
    type: 'passive',
    description: '领地每回合提供的影响力收益增加 25%。',
  },
  invasionTie: {
    name: '无退之战',
    type: 'passive',
    description: '入侵时不再产生平局；点数相同时进攻方获胜。',
  },
  eventResist: {
    name: '命运庇护',
    type: 'passive',
    description: '随机事件造成的影响力损失减少 50%，亚空间压力变化不受影响。',
  },
  discount: {
    name: '精算扩张',
    type: 'passive',
    description: '占领和升级领地消耗的影响力减少 30%。',
  },
  steal: {
    name: '暗影窃取',
    type: 'active',
    cooldownRounds: 6,
    targetMode: 'player',
    range: 8,
    description: '偷取 8 格范围内一名其他玩家 15% 的影响力。',
  },
  warpControl: {
    name: '潮汐操纵',
    type: 'active',
    cooldownRounds: 8,
    targetMode: 'choice',
    description: '选择使亚空间压力增加 3 或减少 3。',
  },
  tzeentchChosen: {
    name: '奸奇神选',
    type: 'active',
    cooldownRounds: 7,
    targetMode: 'none',
    description: '远程打开一次商店；奸奇之谋触发后改为随机传送。',
  },
  downgrade: {
    name: '轨道打击',
    type: 'active',
    cooldownRounds: 8,
    targetMode: 'tile',
    range: 8,
    description: '使 8 格范围内一个已占领星球降低 1 级；1 级星球变为无主。',
  },
};
const SKILL_IDS = Object.keys(SKILL_DEFINITIONS);
const ITEM_DEFINITIONS = {
  warpSuppress: {
    name: '亚空间抑制卡',
    price: 60,
    targetMode: 'none',
    endTurn: false,
    description: '使亚空间压力减少 2。',
  },
  rebirth: {
    name: '重生卡',
    price: 200,
    targetMode: 'none',
    endTurn: false,
    description: '随机重置自己的初始技能，原技能作废。',
  },
  siege: {
    name: '攻城卡',
    price: 90,
    targetMode: 'none',
    endTurn: false,
    description: '下一次入侵点数增加 2。',
  },
  upgrade: {
    name: '升级卡',
    price: 140,
    targetMode: 'ownTile',
    range: 8,
    endTurn: true,
    description: '免费升级 8 格范围内的一颗己方星球 1 级。',
  },
  teleport: {
    name: '传送卡',
    price: 150,
    targetMode: 'unitDestination',
    range: 8,
    endTurn: true,
    description: '将 8 格范围内一名玩家传送到任意星球；其下回合移动 0 格并结算落点。',
  },
  static: {
    name: '静止卡',
    price: 150,
    targetMode: 'player',
    range: 8,
    endTurn: true,
    description: '使 8 格范围内一名其他玩家两个回合无法移动。',
  },
  universalDice: {
    name: '万能骰子',
    price: 200,
    targetMode: 'rollValue',
    endTurn: false,
    description: '指定下一次移动的 D12 点数，不作用于入侵战斗。',
  },
};
const ITEM_IDS = Object.keys(ITEM_DEFINITIONS);
const SHOP_STOCK_SIZE = 3;
const PUBLIC_GALAXIES = GALAXY_DEFINITIONS.map((galaxy) => ({
  key: galaxy.key,
  name: galaxy.name,
  color: galaxy.color,
  center: galaxy.center,
  vertices: galaxy.vertices,
}));
const rooms = new Map();
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
};

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomInt(max) {
  return crypto.randomInt(max);
}

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14);
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function publicItem(itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  return item ? { id: itemId, ...item } : null;
}

function publicItems(itemIds) {
  return itemIds
    .map((itemId) => publicItem(itemId))
    .filter(Boolean);
}

function rollShopStock() {
  return randomSample(ITEM_IDS, SHOP_STOCK_SIZE);
}

function refreshShopStock(room, tileId) {
  room.shopStocks[tileId] = rollShopStock();
  return room.shopStocks[tileId];
}

function refreshAllShopStocks(room) {
  for (const tile of room.tiles) {
    if (tile.type === 'shop') {
      refreshShopStock(room, tile.id);
    }
  }
  room.remoteShopStock = rollShopStock();
}

function publicShopItems(room, tile = null, remote = false) {
  const itemIds = remote
    ? room.remoteShopStock
    : (tile ? (room.shopStocks[tile.id] || []) : []);
  return publicItems(itemIds);
}

function ownerFor(room, ownerId) {
  if (!ownerId) {
    return null;
  }
  if (ownerId === NURGLE_ID) {
    return {
      id: NURGLE_ID,
      name: '纳垢',
      color: '#7f9f58',
      faction: 'nurgle',
      isNurgle: true,
    };
  }
  return room.players.find((player) => player.id === ownerId) || null;
}

function hasSkill(player, skillId) {
  return player?.skillId === skillId;
}

function publicSkill(player, room) {
  const skill = SKILL_DEFINITIONS[player?.skillId];
  if (!skill) {
    return null;
  }
  const cooldownRounds = Number(skill.cooldownRounds) || 0;
  const cooldownRemaining = skill.type === 'active'
    ? Math.max(0, (Number(player.skillReadyAtRound) || 0) - (Number(room.round) || 0))
    : 0;
  return {
    id: player.skillId,
    ...skill,
    cooldownRemaining,
    ready: cooldownRemaining === 0,
  };
}

function claimCostFor(room, player, tile) {
  const baseCost = Math.max(0, Number(tile?.cost) || 0);
  return hasSkill(player, 'discount') ? Math.round(baseCost * 0.7) : baseCost;
}

function upgradeCostFor(room, player, tile) {
  const baseCost = upgradeCost(tile);
  return hasSkill(player, 'discount') ? Math.round(baseCost * 0.7) : baseCost;
}

function applyNegativeEventLoss(player, amount) {
  const loss = Math.max(0, Number(amount) || 0);
  const modified = hasSkill(player, 'eventResist') ? Math.ceil(loss * 0.5) : loss;
  player.influence = Math.max(0, player.influence - modified);
  return modified;
}

function tileDistance(room, fromId, toId) {
  if (fromId === toId) {
    return 0;
  }
  const adjacency = new Map(room.tiles.map((tile) => [tile.id, new Set()]));
  const connect = (left, right) => {
    adjacency.get(left)?.add(right);
    adjacency.get(right)?.add(left);
  };

  for (const galaxy of PUBLIC_GALAXIES) {
    const tiles = room.tiles
      .filter((tile) => tile.galaxy === galaxy.key)
      .sort((left, right) => left.localIndex - right.localIndex);
    for (let index = 0; index < tiles.length; index += 1) {
      connect(tiles[index].id, tiles[(index + 1) % tiles.length].id);
    }
  }
  for (const tile of room.tiles) {
    if (tile.teleportTo !== null) {
      connect(tile.id, tile.teleportTo);
    }
  }

  const queue = [[fromId, 0]];
  const visited = new Set([fromId]);
  while (queue.length) {
    const [tileId, distance] = queue.shift();
    if (tileId === toId) {
      return distance;
    }
    for (const next of adjacency.get(tileId) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, distance + 1]);
      }
    }
  }
  return Infinity;
}

function skillTargetsFor(room, player, skillId) {
  if (skillId === 'steal') {
    return room.players
      .filter((target) => target.id !== player.id && target.influence > 0)
      .map((target) => ({
        id: target.id,
        name: target.name,
        influence: target.influence,
        stealAmount: Math.floor(target.influence * 0.15),
        distance: tileDistance(room, player.position, target.position),
      }))
      .filter((target) => target.distance <= SKILL_DEFINITIONS.steal.range);
  }
  if (skillId === 'downgrade') {
    return room.tiles
      .filter((tile) => (
        tile.ownerId
        && tile.ownerId !== player.id
        && tile.level > 0
        && tile.claimable
      ))
      .map((tile) => ({
        id: tile.id,
        name: tile.name,
        ownerName: ownerFor(room, tile.ownerId)?.name || '未知势力',
        level: tile.level,
        becomesUnowned: tile.level <= 1,
        distance: tileDistance(room, player.position, tile.id),
      }))
      .filter((tile) => tile.distance <= SKILL_DEFINITIONS.downgrade.range);
  }
  if (skillId === 'warpControl') {
    return [
      { id: 'increase', label: '增加 3 点', amount: 3 },
      { id: 'decrease', label: '减少 3 点', amount: -3 },
    ];
  }
  return [];
}

function skillActionFor(room, viewer) {
  const skill = publicSkill(viewer, room);
  if (!skill || skill.type !== 'active') {
    return null;
  }
  const usableStages = ['roll', 'claim', 'upgrade', 'landing', 'teleport', 'end'];
  const canUse = activeTurn(room, viewer)
    && skill.ready
    && usableStages.includes(room.turnStage);
  return {
    ...skill,
    canUse,
    targets: canUse ? skillTargetsFor(room, viewer, skill.id) : [],
  };
}

function itemTargetsFor(room, player, itemId) {
  if (itemId === 'upgrade') {
    return room.tiles
      .filter((tile) => (
        tile.ownerId === player.id
        && tile.claimable
        && tile.level > 0
        && tile.level < 3
      ))
      .map((tile) => ({
        id: tile.id,
        name: tile.name,
        level: tile.level,
        distance: tileDistance(room, player.position, tile.id),
      }))
      .filter((tile) => tile.distance <= ITEM_DEFINITIONS.upgrade.range);
  }
  if (itemId === 'static') {
    return room.players
      .filter((target) => target.id !== player.id)
      .map((target) => ({
        id: target.id,
        name: target.name,
        distance: tileDistance(room, player.position, target.position),
      }))
      .filter((target) => target.distance <= ITEM_DEFINITIONS.static.range);
  }
  if (itemId === 'teleport') {
    return {
      players: room.players
        .map((target) => ({
          id: target.id,
          name: target.name,
          isSelf: target.id === player.id,
          distance: tileDistance(room, player.position, target.position),
        }))
        .filter((target) => target.distance <= ITEM_DEFINITIONS.teleport.range),
      destinations: room.tiles.map((tile) => ({
        id: tile.id,
        name: tile.name,
        galaxyName: tile.galaxyName,
        typeLabel: tile.typeLabel,
      })),
    };
  }
  if (itemId === 'universalDice') {
    return Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      label: String(index + 1),
    }));
  }
  return [];
}

function itemActionFor(room, viewer) {
  if (!activeTurn(room, viewer)) {
    return [];
  }
  const usableStages = ['roll', 'claim', 'upgrade', 'landing', 'teleport', 'end'];
  const counts = new Map();
  for (const itemId of Array.isArray(viewer.items) ? viewer.items : []) {
    counts.set(itemId, (counts.get(itemId) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([itemId, count]) => {
      const item = publicItem(itemId);
      if (!item) {
        return null;
      }
      const targets = itemTargetsFor(room, viewer, itemId);
      let canUse = usableStages.includes(room.turnStage);
      let reason = '';
      if (!canUse) {
        reason = '当前阶段无法使用道具。';
      } else if (itemId === 'upgrade' && targets.length === 0) {
        canUse = false;
        reason = '8 格范围内没有可免费升级的己方星球。';
      } else if (itemId === 'static' && targets.length === 0) {
        canUse = false;
        reason = '8 格范围内没有可指定的其他玩家。';
      } else if (itemId === 'teleport' && targets.players.length === 0) {
        canUse = false;
        reason = '8 格范围内没有可传送的玩家。';
      } else if (itemId === 'siege' && viewer.nextInvasionBonus > 0) {
        canUse = false;
        reason = '攻城加成已经生效。';
      } else if (itemId === 'universalDice' && viewer.forcedMoveRoll !== null) {
        canUse = false;
        reason = '已经指定了下一次移动点数。';
      }
      return {
        ...item,
        count,
        canUse,
        reason,
        targets,
      };
    })
    .filter(Boolean);
}

function randomSample(items, count) {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.max(0, count));
}

function createBoard() {
  const board = BOARD_DEFINITIONS.map((definition, index) => {
    const type = TILE_TYPES[definition.type];
    return {
      id: index,
      name: definition.name,
      type: definition.type,
      typeLabel: type.label,
      visual: `${definition.type}-${(definition.localIndex % 4) + 1}`,
      galaxy: definition.galaxy,
      galaxyName: definition.galaxyName,
      galaxyColor: definition.galaxyColor,
      localIndex: definition.localIndex,
      vertex: definition.localIndex % GALAXY_EDGE_LENGTH === 0,
      teleportToKey: definition.teleportTo || null,
      teleportTo: null,
      glyph: type.glyph,
      color: ['vertex', 'anchor'].includes(definition.type)
        ? definition.galaxyColor
        : type.color,
      cost: type.cost,
      value: type.value,
      yield: type.yield,
      claimable: Boolean(type.claimable),
      ownerId: null,
      level: 0,
      restoreAtRound: null,
      slaaneshCorrupted: false,
    };
  });
  const byKey = new Map(board.map((tile) => [`${tile.galaxy}:${tile.localIndex}`, tile.id]));
  for (const tile of board) {
    if (tile.teleportToKey) {
      tile.teleportTo = byKey.get(tile.teleportToKey) ?? null;
    }
    delete tile.teleportToKey;
  }
  return board;
}

function createPlayer(name, faction = '', isBot = false) {
  return {
    id: randomId(12),
    token: randomId(24),
    name,
    faction,
    isBot,
    influence: 0,
    bonusDominion: 0,
    items: [],
    heldTurns: 0,
    skillId: '',
    skillReadyAtRound: 0,
    forcedMoveRoll: null,
    nextInvasionBonus: 0,
    zeroMoveNextTurn: false,
    lastPurchaseRound: 0,
    position: 0,
    ready: isBot,
    connected: isBot,
    clients: new Set(),
    lastSeenAt: Date.now(),
  };
}

function createRoom(owner) {
  const now = Date.now();
  const room = {
    code: createRoomCode(),
    createdAt: now,
    updatedAt: now,
    phase: 'lobby',
    players: [owner],
    hostId: owner.id,
    tiles: createBoard(),
    turnIndex: -1,
    turnStage: 'idle',
    round: 0,
    doom: 0,
    doomMilestones: new Set(),
    shopMode: 'open',
    shopStocks: {},
    remoteShopPlayerId: null,
    remoteShopStock: [],
    nurgle: {
      active: false,
      position: null,
      roundsRemaining: 0,
      conqueredTileIds: [],
    },
    dice: [],
    diceMode: 'd12',
    lastMove: null,
    lastEvent: null,
    result: null,
    logs: [],
    botNextActionAt: 0,
    sseTimer: null,
  };
  assignFaction(room, owner);
  addLog(room, '新战区已建立，等待战争领主加入');
  return room;
}

function touchRoom(room) {
  room.updatedAt = Date.now();
}

function addLog(room, message, type = 'info') {
  room.logs.unshift({
    id: randomId(5),
    at: Date.now(),
    message,
    type,
  });
  if (room.logs.length > 48) {
    room.logs.length = 48;
  }
  room.updatedAt = Date.now();
}

function logLastEvent(room) {
  const message = room.lastEvent?.text;
  if (!message || room.logs[0]?.message === message) {
    return;
  }
  const type = room.lastEvent.tone === 'danger'
    ? 'danger'
    : room.lastEvent.tone === 'warp'
      ? 'warp'
      : 'info';
  addLog(room, message, type);
}

function getRoom(code) {
  const room = rooms.get(normalizeCode(code));
  if (!room) {
    const error = new Error('战区不存在或已经关闭');
    error.statusCode = 404;
    throw error;
  }
  return room;
}

function getPlayer(room, token) {
  const player = room.players.find((item) => item.token === String(token || ''));
  if (!player) {
    const error = new Error('身份凭证已失效，请重新加入战区');
    error.statusCode = 401;
    throw error;
  }
  return player;
}

function requireHost(room, player) {
  if (room.hostId !== player.id) {
    const error = new Error('只有房主可以执行此操作');
    error.statusCode = 403;
    throw error;
  }
}

function requireLobby(room) {
  if (room.phase !== 'lobby') {
    const error = new Error('远征已经开始');
    error.statusCode = 409;
    throw error;
  }
}

function currentPlayer(room) {
  if (room.phase !== 'playing' || room.turnIndex < 0) {
    return null;
  }
  return room.players[room.turnIndex] || null;
}

function assignFaction(room, player) {
  if (player.faction) {
    return;
  }
  const taken = new Set(room.players.map((item) => item.faction).filter(Boolean));
  player.faction = FACTION_KEYS.find((key) => !taken.has(key)) || FACTION_KEYS[0];
}

function playerTiles(room, playerId) {
  return room.tiles.filter((tile) => tile.ownerId === playerId);
}

function dominionFor(room, player) {
  return player.bonusDominion + playerTiles(room, player.id)
    .reduce((sum, tile) => sum + (tile.value * tile.level), 0);
}

function upgradeCost(tile) {
  if (tile.level === 1) {
    return Math.round(tile.cost * 0.65);
  }
  if (tile.level === 2) {
    return Math.round(tile.cost * 1.15);
  }
  return 0;
}

function tributeFor(tile) {
  if (!tile.cost || !tile.level) {
    return 0;
  }
  return Math.round(tile.cost * (0.22 + (tile.level * 0.14)));
}

function activeTurn(room, player) {
  return currentPlayer(room)?.id === player.id;
}

function legalActionsFor(room, viewer) {
  const empty = {
    canChooseFaction: false,
    canReady: false,
    canStart: false,
    canRestart: false,
    canRoll: false,
    canClaim: false,
    canUpgrade: false,
    canPayTithe: false,
    canInvade: false,
    canTeleport: false,
    canBuyItem: false,
    canEnd: false,
    claimCost: 0,
    upgradeCost: 0,
    titheCost: 0,
    tileIndex: -1,
    teleportTo: -1,
    teleportToName: '',
    shopItems: [],
    invasionPreview: null,
    skillAction: null,
    itemActions: [],
  };
  if (!viewer) {
    return empty;
  }

  if (room.phase === 'lobby') {
    const everyoneReady = room.players.length >= MIN_PLAYERS
      && room.players.every((player) => player.ready);
    return {
      ...empty,
      canChooseFaction: true,
      canReady: true,
      canStart: room.hostId === viewer.id && everyoneReady,
    };
  }

  if (room.phase === 'settled') {
    return {
      ...empty,
      canRestart: room.hostId === viewer.id,
    };
  }

  if (!activeTurn(room, viewer) || room.turnStage === 'idle') {
    return empty;
  }

  const tile = room.tiles[viewer.position];
  const actions = {
    ...empty,
    tileIndex: tile.id,
  };
  actions.skillAction = skillActionFor(room, viewer);
  actions.itemActions = itemActionFor(room, viewer);

  if (room.turnStage === 'roll') {
    actions.canRoll = true;
    return actions;
  }
  if (room.turnStage === 'claim') {
    const cost = claimCostFor(room, viewer, tile);
    actions.canClaim = viewer.influence >= cost;
    actions.canEnd = true;
    actions.claimCost = cost;
    return actions;
  }
  if (room.turnStage === 'upgrade') {
    const cost = upgradeCostFor(room, viewer, tile);
    actions.canUpgrade = Boolean(cost && viewer.influence >= cost && tile.level < 3);
    actions.canEnd = true;
    actions.upgradeCost = cost;
    return actions;
  }
  if (room.turnStage === 'landing') {
    const owner = ownerFor(room, tile.ownerId);
    const tribute = owner?.isNurgle ? 0 : tributeFor(tile);
    actions.canPayTithe = !owner?.isNurgle && viewer.influence >= tribute;
    actions.canInvade = true;
    actions.titheCost = tribute;
    actions.invasionPreview = invasionPreviewFor(room, viewer, tile);
    return actions;
  }
  if (room.turnStage === 'teleport') {
    const target = tile.teleportTo === null ? null : room.tiles[tile.teleportTo];
    actions.canTeleport = Boolean(target);
    actions.canEnd = true;
    actions.teleportTo = target ? target.id : -1;
    actions.teleportToName = target ? `${target.galaxyName} · ${target.name}` : '';
    return actions;
  }
  if (room.turnStage === 'shop') {
    const remote = room.remoteShopPlayerId === viewer.id;
    const alreadyPurchased = viewer.lastPurchaseRound === room.round;
    actions.canEnd = true;
    actions.shopItems = publicShopItems(room, tile, remote).map((item) => ({
      ...item,
      affordable: viewer.influence >= item.price,
    }));
    actions.canBuyItem = room.shopMode === 'open'
      && !alreadyPurchased
      && actions.shopItems.some((item) => item.affordable);
    actions.shopPurchaseLocked = alreadyPurchased;
    actions.remoteShop = remote;
    return actions;
  }
  if (room.turnStage === 'held') {
    actions.canEnd = true;
    return actions;
  }
  if (room.turnStage === 'end') {
    actions.canEnd = true;
  }
  return actions;
}

function publicPlayer(room, player) {
  const faction = FACTIONS[player.faction];
  const playerTurn = currentPlayer(room);
  return {
    id: player.id,
    name: player.name,
    isBot: Boolean(player.isBot),
    faction: player.faction,
    factionName: faction?.name || '未选择',
    factionShortName: faction?.shortName || '未知',
    color: faction?.color || '#8a938f',
    influence: player.influence,
    dominion: dominionFor(room, player),
    bonusDominion: player.bonusDominion,
    items: (Array.isArray(player.items) ? player.items : [])
      .map((itemId) => publicItem(itemId))
      .filter(Boolean),
    skill: publicSkill(player, room),
    nextInvasionBonus: Math.max(0, Number(player.nextInvasionBonus) || 0),
    forcedMoveRoll: Number.isFinite(player.forcedMoveRoll) ? player.forcedMoveRoll : null,
    zeroMoveNextTurn: Boolean(player.zeroMoveNextTurn),
    holdings: playerTiles(room, player.id).length,
    position: player.position,
    heldTurns: Math.max(0, Number(player.heldTurns) || 0),
    ready: player.ready,
    connected: player.connected,
    isHost: player.id === room.hostId,
    isTurn: playerTurn?.id === player.id,
  };
}

function addBot(room, requester) {
  requireLobby(room);
  requireHost(room, requester);
  if (room.players.length >= MAX_PLAYERS) {
    const error = new Error(`战区最多容纳 ${MAX_PLAYERS} 名玩家`);
    error.statusCode = 409;
    throw error;
  }
  const player = createPlayer('AI', '', true);
  room.players.push(player);
  assignFaction(room, player);
  player.name = `AI·${FACTIONS[player.faction].shortName}`;
  addLog(room, `${player.name} 加入了战区`, 'round');
  touchRoom(room);
  return player;
}

function removeBot(room, requester, playerId) {
  requireLobby(room);
  requireHost(room, requester);
  const index = room.players.findIndex((player) => player.id === playerId && player.isBot);
  if (index < 0) {
    const error = new Error('找不到这个机器人');
    error.statusCode = 404;
    throw error;
  }
  const [player] = room.players.splice(index, 1);
  addLog(room, `${player.name} 离开了战区`);
  touchRoom(room);
  return player;
}

function advanceBot(room) {
  const bot = currentPlayer(room);
  if (!bot?.isBot || room.phase !== 'playing') {
    return false;
  }

  const tile = room.tiles[bot.position];
  if (room.turnStage === 'roll') {
    performAction(room, bot, { type: 'roll' });
    return true;
  }
  if (room.turnStage === 'claim') {
    if (bot.influence >= tile.cost + 40) {
      performAction(room, bot, { type: 'claim' });
    } else {
      performAction(room, bot, { type: 'end' });
    }
    return true;
  }
  if (room.turnStage === 'upgrade') {
    const cost = upgradeCost(tile);
    if (tile.level < 3 && bot.influence >= cost + 70) {
      performAction(room, bot, { type: 'upgrade' });
    } else {
      performAction(room, bot, { type: 'end' });
    }
    return true;
  }
  if (room.turnStage === 'landing') {
    const owner = room.players.find((player) => player.id === tile.ownerId);
    const tribute = tributeFor(tile);
    const aggression = 6 - tile.level;
    const shouldInvade = Boolean(
      owner
      && (
        tile.level <= 1
        || bot.influence < tribute
        || aggression >= 4
      )
    );
    performAction(room, bot, { type: shouldInvade ? 'invade' : 'tithe' });
    return true;
  }
  if (room.turnStage === 'shop') {
    const affordable = publicShopItems(room, tile)
      .filter((item) => item.price <= bot.influence - 80)
      .sort((left, right) => left.price - right.price)[0];
    if (affordable && bot.lastPurchaseRound !== room.round) {
      performAction(room, bot, { type: 'buyitem', itemId: affordable.id });
    } else {
      performAction(room, bot, { type: 'end' });
    }
    return true;
  }
  if (room.turnStage === 'teleport') {
    performAction(room, bot, { type: 'teleport' });
    return true;
  }
  if (room.turnStage === 'held') {
    performAction(room, bot, { type: 'end' });
    return true;
  }
  if (room.turnStage === 'end') {
    performAction(room, bot, { type: 'end' });
    return true;
  }
  return false;
}

function maybeAdvanceBot(room) {
  const bot = currentPlayer(room);
  if (!bot?.isBot || room.phase !== 'playing') {
    return false;
  }
  const now = Date.now();
  if (now < (room.botNextActionAt || 0)) {
    return false;
  }
  room.botNextActionAt = now + 900;
  return advanceBot(room);
}

function publicTile(room, tile) {
  const owner = ownerFor(room, tile.ownerId);
  const teleportTarget = tile.teleportTo === null
    ? null
    : room.tiles[tile.teleportTo];
  return {
    ...tile,
    owner: owner ? {
      id: owner.id,
      name: owner.name,
      color: owner.isNurgle ? owner.color : (FACTIONS[owner.faction]?.color || '#8a938f'),
      isNurgle: Boolean(owner.isNurgle),
    } : null,
    tribute: tributeFor(tile),
    nextUpgradeCost: upgradeCost(tile),
    shopMode: tile.type === 'shop' ? room.shopMode : null,
    shopItems: tile.type === 'shop' && room.shopMode === 'open'
      ? publicShopItems(room, tile)
      : [],
    slaaneshCorrupted: Boolean(tile.slaaneshCorrupted),
    teleportTarget: teleportTarget ? {
      id: teleportTarget.id,
      name: teleportTarget.name,
      galaxyName: teleportTarget.galaxyName,
    } : null,
  };
}

function roomState(room, viewer = null) {
  const turn = currentPlayer(room);
  const factionOptions = FACTION_KEYS.map((key) => {
    const chosenBy = room.players.find((player) => player.faction === key);
    return {
      key,
      name: FACTIONS[key].name,
      shortName: FACTIONS[key].shortName,
      color: FACTIONS[key].color,
      passive: '无种族技能',
      chosenBy: chosenBy ? chosenBy.name : null,
    };
  });

  return {
    room: {
      code: room.code,
      phase: room.phase,
      round: room.round,
      hostId: room.hostId,
      turnPlayerId: turn?.id || null,
      turnStage: room.turnStage,
      doom: room.doom,
      maxDoom: MAX_DOOM,
      shopMode: room.shopMode,
      nurgle: {
        active: Boolean(room.nurgle?.active),
        position: room.nurgle?.position ?? null,
        roundsRemaining: Math.max(0, Number(room.nurgle?.roundsRemaining) || 0),
      },
      dominionTarget: DOMINION_TARGET,
      playerCount: room.players.length,
      maxPlayers: MAX_PLAYERS,
    },
    you: viewer ? {
      ...publicPlayer(room, viewer),
      legalActions: legalActionsFor(room, viewer),
    } : null,
    players: room.players.map((player) => publicPlayer(room, player)),
    board: room.tiles.map((tile) => publicTile(room, tile)),
    galaxies: PUBLIC_GALAXIES,
    factions: factionOptions,
    dice: room.dice,
    diceMode: room.diceMode,
    lastMove: room.lastMove,
    lastEvent: room.lastEvent,
    result: room.result,
    logs: room.logs.slice(0, 16),
  };
}

function writeEvent(response, payload) {
  if (response.destroyed || response.writableEnded) {
    return;
  }
  response.write('event: state\n');
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(room) {
  for (const player of room.players) {
    for (const response of player.clients) {
      writeEvent(response, roomState(room, player));
    }
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function sendError(response, error) {
  sendJson(response, error.statusCode || 500, {
    ok: false,
    error: error.statusCode ? error.message : '服务器暂时无法处理请求',
  });
  if (!error.statusCode) {
    console.error(error);
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        const error = new Error('请求内容过大');
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error('请求格式错误');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function settleGame(room, winner, reason) {
  if (room.phase !== 'playing') {
    return;
  }
  room.phase = 'settled';
  room.turnStage = 'idle';
  room.result = {
    winnerId: winner?.id || null,
    winnerName: winner?.name || '无人',
    reason,
    dominion: winner ? dominionFor(room, winner) : 0,
    at: Date.now(),
  };
  addLog(
    room,
    winner ? `${winner.name} 取得战区统治权：${reason}` : `战区沦陷：${reason}`,
    winner ? 'win' : 'warning',
  );
}

function checkVictory(room, player, reason) {
  if (dominionFor(room, player) >= DOMINION_TARGET) {
    settleGame(room, player, reason);
    return true;
  }
  return false;
}

function leaderByDominion(room) {
  return [...room.players].sort((left, right) => (
    dominionFor(room, right) - dominionFor(room, left)
    || right.influence - left.influence
  ))[0] || null;
}

function triggerKhorne(room) {
  const targets = randomSample(
    room.tiles.filter((tile) => tile.ownerId && tile.level > 0),
    3,
  );
  const details = [];

  for (const tile of targets) {
    tile.level = Math.max(0, tile.level - 1);
    if (tile.level === 0) {
      tile.ownerId = null;
      tile.restoreAtRound = null;
      details.push(`${tile.name} 降为无主领土`);
    } else {
      details.push(`${tile.name} 降至 ${tile.level} 级`);
    }
  }

  room.lastEvent = {
    title: '恐虐狂潮',
    text: details.length
      ? `黄铜要塞的怒潮摧毁了 ${details.join('、')}。`
      : '黄铜要塞的怒潮席卷星区，但没有领土受到影响。',
    tone: 'danger',
  };
  addLog(room, room.lastEvent.text, 'danger');
  touchRoom(room);
}

function triggerSlaanesh(room) {
  const targets = randomSample(
    room.tiles.filter((tile) => (
      !tile.slaaneshCorrupted
      && !(tile.type === 'vertex' && tile.teleportTo !== null)
      && !(tile.type === 'shop' && room.shopMode === 'warp')
    )),
    3,
  );

  for (const tile of targets) {
    tile.slaaneshCorrupted = true;
  }

  room.lastEvent = {
    title: '色孽之祸',
    text: targets.length
      ? `${targets.map((tile) => tile.name).join('、')} 被色孽侵蚀，原本效果失效；踏入者将被禁锢两个回合。`
      : '色孽的低语席卷星区，但没有地块可以被侵蚀。',
    tone: 'danger',
  };
  addLog(room, room.lastEvent.text, 'danger');
  touchRoom(room);
}

function startNurgleInvasion(room) {
  if (room.nurgle.active) {
    return;
  }
  const safeTiles = room.tiles.filter((tile) => (
    tile.type !== 'shop'
    && !(tile.type === 'vertex' && tile.teleportTo !== null)
  ));
  const emptyTiles = safeTiles.filter((tile) => !tile.ownerId);
  const candidates = emptyTiles.length ? emptyTiles : safeTiles;
  room.nurgle = {
    active: true,
    position: candidates.length ? candidates[randomInt(candidates.length)].id : 0,
    roundsRemaining: NURGLE_DURATION_ROUNDS,
    conqueredTileIds: [],
  };
  room.lastEvent = {
    title: '纳垢降临',
    text: `纳垢本体进入星区，将在接下来的 ${NURGLE_DURATION_ROUNDS} 个回合中行动；它攻占的领土在离场后会化为无主废土。`,
    tone: 'danger',
  };
  addLog(room, room.lastEvent.text, 'danger');
  touchRoom(room);
}

function expireNurgle(room) {
  const affected = room.nurgle.conqueredTileIds
    .map((tileId) => room.tiles[tileId])
    .filter(Boolean);
  for (const tile of affected) {
    if (tile.ownerId === NURGLE_ID) {
      tile.ownerId = null;
      tile.level = 0;
      tile.restoreAtRound = null;
    }
  }
  room.nurgle.active = false;
  room.nurgle.position = null;
  room.nurgle.roundsRemaining = 0;
  room.nurgle.conqueredTileIds = [];
  room.lastEvent = {
    title: '纳垢离场',
    text: affected.length
      ? `纳垢回归亚空间，被它侵占的 ${affected.length} 个星球全部化为无主废土。`
      : '纳垢回归亚空间，没有领土被瘟疫吞没。',
    tone: 'danger',
  };
  addLog(room, room.lastEvent.text, 'danger');
}

function advanceNurgleInvasion(room, forcedDistance = null) {
  if (!room.nurgle?.active) {
    return false;
  }
  const current = room.tiles[room.nurgle.position];
  if (!current) {
    expireNurgle(room);
    return true;
  }

  const galaxyTiles = room.tiles
    .filter((tile) => tile.galaxy === current.galaxy)
    .sort((left, right) => left.localIndex - right.localIndex);
  const currentIndex = galaxyTiles.findIndex((tile) => tile.id === current.id);
  const distance = Number.isFinite(forcedDistance)
    ? Math.max(1, Math.min(galaxyTiles.length, Math.trunc(forcedDistance)))
    : randomInt(12) + 1;
  let target = galaxyTiles[(currentIndex + distance) % galaxyTiles.length];

  if (target.type === 'vertex' && target.teleportTo !== null) {
    target = room.tiles[target.teleportTo];
  }
  if (target.type === 'shop') {
    const alternatives = room.tiles.filter((tile) => tile.type !== 'shop');
    target = alternatives[randomInt(alternatives.length)];
  }

  room.nurgle.position = target.id;
  const owner = ownerFor(room, target.ownerId);
  if (owner && !owner.isNurgle) {
    target.ownerId = NURGLE_ID;
    target.restoreAtRound = null;
    if (!room.nurgle.conqueredTileIds.includes(target.id)) {
      room.nurgle.conqueredTileIds.push(target.id);
    }
    room.lastEvent = {
      title: '瘟疫入侵',
      text: `纳垢踏入 ${target.name}，瘟疫瞬间吞没当地守军，该星球被纳垢占据。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'danger');
  } else {
    room.lastEvent = {
      title: '纳垢行军',
      text: `纳垢在 ${target.galaxyName} 的 ${target.name} 留下腐化足迹。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'danger');
  }

  room.nurgle.roundsRemaining = Math.max(0, room.nurgle.roundsRemaining - 1);
  if (room.nurgle.roundsRemaining === 0) {
    expireNurgle(room);
  }
  touchRoom(room);
  return true;
}

function triggerDoomMilestone(room, milestone) {
  if (room.doomMilestones.has(milestone) || room.phase !== 'playing') {
    return;
  }
  room.doomMilestones.add(milestone);

  if (milestone === 8) {
    triggerKhorne(room);
  } else if (milestone === 16) {
    triggerSlaanesh(room);
  } else if (milestone === 24) {
    activateShopWarp(room, '奸奇的诡术篡改了所有星际商店');
  } else if (milestone === 32) {
    startNurgleInvasion(room);
  } else if (milestone >= MAX_DOOM) {
    const leader = leaderByDominion(room);
    settleGame(room, leader, '亚空间压力达到极限，统治点最高者胜出');
  }
}

function addDoom(room, amount = 1, reason = '') {
  if (room.phase !== 'playing') {
    return;
  }
  const previous = room.doom;
  room.doom = Math.min(MAX_DOOM, room.doom + amount);
  if (reason) {
    addLog(room, `${reason}，亚空间压力 +${amount}`, 'warp');
  }
  for (let value = previous + 1; value <= room.doom; value += 1) {
    if ([8, 16, 24, 32, 40].includes(value)) {
      triggerDoomMilestone(room, value);
    }
  }
}

function grantTurnIncome(room, player) {
  const baseIncome = playerTiles(room, player.id)
    .reduce((sum, tile) => sum + tile.yield * tile.level, 0);
  const income = hasSkill(player, 'income')
    ? Math.floor(baseIncome * 1.25)
    : baseIncome;
  if (income <= 0) {
    return;
  }
  player.influence += income;
  addLog(room, `${player.name} 的领地提供 ${income} 影响力`, 'income');
}

function drawWarpEvent(room, player) {
  const roll = randomInt(7);
  if (roll === 0) {
    const amount = 70;
    player.influence += amount;
    return {
      title: '亚空间顺流',
      text: `${player.name} 获得 ${amount} 影响力。`,
      tone: 'good',
    };
  }
  if (roll === 1) {
    const loss = applyNegativeEventLoss(player, 55);
    return {
      title: '恶魔伏击',
      text: `${player.name} 损失 ${loss} 影响力。`,
      tone: 'danger',
    };
  }
  if (roll === 2) {
    player.bonusDominion += 1;
    return {
      title: '命运回响',
      text: `${player.name} 获得 1 点额外统治点。`,
      tone: 'good',
    };
  }
  if (roll === 3) {
    room.doom = Math.max(0, room.doom - 1);
    return {
      title: '黑石稳定',
      text: '亚空间压力降低 1。',
      tone: 'good',
    };
  }
  if (roll === 4) {
    const amount = 42;
    player.influence += amount;
    addDoom(room, 1, '混沌馈赠撕裂现实');
    return {
      title: '混沌馈赠',
      text: `${player.name} 获得 ${amount} 影响力，但亚空间压力上升。`,
      tone: 'warp',
    };
  }
  if (roll === 5) {
    const destinations = room.tiles.filter((tile) => (
      tile.type === 'vertex' && tile.teleportTo !== null
    ));
    const target = destinations[randomInt(destinations.length)];
    const previous = player.position;
    player.position = target.id;
    room.lastMove = {
      id: randomId(5),
      playerId: player.id,
      from: previous,
      to: target.id,
      distance: 1,
      path: [target.id],
      jump: true,
      at: Date.now(),
    };
    return {
      title: '跨星系潮汐',
      text: `${player.name} 被亚空间潮汐卷至 ${target.galaxyName} 的 ${target.name}。`,
      tone: 'warp',
    };
  }
  const loss = applyNegativeEventLoss(player, 45);
  addDoom(room, 1, '灵能尖啸穿透盖勒场');
  return {
    title: '灵能尖啸',
    text: `${player.name} 损失 ${loss} 影响力，亚空间压力上升。`,
    tone: 'warp',
  };
}

function activateShopWarp(room, reason = '亚空间风暴吞没了星际商店') {
  if (room.shopMode === 'warp') {
    return false;
  }
  room.shopMode = 'warp';
  room.shopStocks = {};
  room.remoteShopStock = [];
  room.remoteShopPlayerId = null;
  for (const tile of room.tiles) {
    if (tile.type === 'shop') {
      tile.slaaneshCorrupted = false;
    }
  }
  room.lastEvent = {
    title: '商店坍缩',
    text: `${reason}。所有商店已变为随机传送点，购买功能失效。`,
    tone: 'danger',
  };
  addLog(room, room.lastEvent.text, 'warp');
  touchRoom(room);
  return true;
}

function resolveShopLanding(room, player, tile) {
  if (room.shopMode !== 'warp') {
    if (!room.shopStocks[tile.id]?.length) {
      refreshShopStock(room, tile.id);
    }
    room.turnStage = 'shop';
    room.lastEvent = {
      title: '星际商店',
      text: `${player.name} 抵达 ${tile.name}，可以消耗影响力购买道具。`,
      tone: 'neutral',
    };
    return;
  }

  const destinations = room.tiles.filter((candidate) => (
    candidate.id !== tile.id && candidate.type !== 'shop'
  ));
  if (destinations.length === 0) {
    room.turnStage = 'end';
    return;
  }

  const target = destinations[randomInt(destinations.length)];
  const previous = player.position;
  player.position = target.id;
  room.lastMove = {
    id: randomId(5),
    playerId: player.id,
    from: previous,
    to: target.id,
    distance: 1,
    path: [target.id],
    jump: true,
    at: Date.now(),
  };
  addLog(
    room,
    `${tile.name} 已坍缩，${player.name} 被随机传送至 ${target.galaxyName} 的 ${target.name}`,
    'warp',
  );
  resolveLanding(room, player);
}

function resolveLanding(room, player) {
  const tile = room.tiles[player.position];
  room.lastEvent = null;

  if (tile.slaaneshCorrupted) {
    player.heldTurns = Math.max(
      Number(player.heldTurns) || 0,
      SLAANESH_HOLD_TURNS,
    );
    room.turnStage = 'end';
    room.lastEvent = {
      title: '色孽禁锢',
      text: `${player.name} 被 ${tile.name} 的感官幻象俘获，接下来两个回合无法移动。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'danger');
    return;
  }

  if (tile.type === 'shop') {
    resolveShopLanding(room, player, tile);
    return;
  }

  if (tile.type === 'start') {
    player.influence += 35;
    room.turnStage = 'end';
    room.lastEvent = {
      title: '风暴枢纽',
      text: `${player.name} 重整舰队，获得 35 影响力。`,
      tone: 'good',
    };
    checkVictory(room, player, '风暴枢纽的荣光');
    return;
  }

  if (tile.type === 'vertex' && tile.teleportTo !== null) {
    const target = room.tiles[tile.teleportTo];
    room.turnStage = 'teleport';
    room.lastEvent = {
      title: '星系跃迁',
      text: `${tile.name} 可以跃迁至 ${target.galaxyName} 的 ${target.name}，也可以留在原地。`,
      tone: 'good',
    };
    return;
  }

  if (tile.type === 'anchor') {
    room.turnStage = 'end';
    if (tile.galaxy === 'alpha') {
      player.bonusDominion += 1;
      room.lastEvent = {
        title: '虚空信标',
        text: `${player.name} 校准虚空信标，获得 1 点额外统治点。`,
        tone: 'good',
      };
      checkVictory(room, player, '掌控虚空信标');
    } else {
      const loss = Math.min(45, player.influence);
      player.influence -= loss;
      addDoom(room, 1, '亚空间风暴眼撕裂现实');
      room.lastEvent = {
        title: '亚空间风暴眼',
        text: `${player.name} 损失 ${loss} 影响力，亚空间压力上升。`,
        tone: 'danger',
      };
    }
    return;
  }

  if (tile.type === 'warp') {
    room.lastEvent = drawWarpEvent(room, player);
    room.turnStage = 'end';
    checkVictory(room, player, '从亚空间夺取命运');
    return;
  }

  if (tile.type === 'relic') {
    if (randomInt(2) === 0) {
      player.influence += 65;
      room.lastEvent = {
        title: '遗物回收',
        text: `${player.name} 回收远古技术，获得 65 影响力。`,
        tone: 'good',
      };
    } else {
      player.bonusDominion += 1;
      room.lastEvent = {
        title: '遗物认主',
        text: `${player.name} 获得 1 点额外统治点。`,
        tone: 'good',
      };
    }
    room.turnStage = 'end';
    checkVictory(room, player, '遗物的力量');
    return;
  }

  if (tile.type === 'webway') {
    player.influence += 45;
    room.lastEvent = {
      title: '网道捷径',
      text: `${player.name} 穿过网道，获得 45 影响力。`,
      tone: 'good',
    };
    room.turnStage = 'end';
    checkVictory(room, player, '网道奇袭');
    return;
  }

  if (tile.type === 'tomb') {
    const loss = applyNegativeEventLoss(player, 35);
    addDoom(room, 1, '墓穴世界苏醒');
    room.turnStage = 'end';
    room.lastEvent = {
      title: '墓穴苏醒',
      text: `${player.name} 损失 ${loss} 影响力，远古军团开始活动。`,
      tone: 'danger',
    };
    return;
  }

  if (tile.type === 'maiden') {
    const loss = applyNegativeEventLoss(player, 40);
    addDoom(room, 1, '处女世界发出哀鸣');
    room.turnStage = 'end';
    room.lastEvent = {
      title: '欢愉低语',
      text: `${player.name} 受到灵魂层面的侵蚀，损失 ${loss} 影响力。`,
      tone: 'danger',
    };
    return;
  }

  if (!tile.claimable) {
    room.turnStage = 'end';
    return;
  }

  if (!tile.ownerId) {
    room.turnStage = 'claim';
    room.lastEvent = {
      title: '无主世界',
      text: `${tile.name} 尚未归顺，可以支付 ${tile.cost} 影响力占领。`,
      tone: 'neutral',
    };
    return;
  }

  const owner = ownerFor(room, tile.ownerId);
  if (owner?.isNurgle) {
    room.turnStage = 'landing';
    room.lastEvent = {
      title: '纳垢领土',
      text: `${tile.name} 已被瘟疫吞没，任何玩家入侵纳垢领土都必定失败。`,
      tone: 'danger',
    };
    return;
  }
  if (tile.ownerId === player.id) {
    if (tile.level < 3) {
      room.turnStage = 'upgrade';
      room.lastEvent = {
        title: '己方领地',
        text: `${tile.name} 可以花费 ${upgradeCost(tile)} 影响力升级。`,
        tone: 'neutral',
      };
    } else {
      room.turnStage = 'end';
      room.lastEvent = {
        title: '要塞世界',
        text: `${tile.name} 已经完成最高等级建设。`,
        tone: 'neutral',
      };
    }
    return;
  }

  room.turnStage = 'landing';
  room.lastEvent = {
    title: '敌方领地',
    text: `${tile.name} 属于 ${owner?.name || '未知势力'}，支付 ${tributeFor(tile)} 影响力或发动入侵。`,
    tone: 'danger',
  };
}

function advanceTurn(room) {
  if (room.phase !== 'playing') {
    return;
  }
  const previousIndex = room.turnIndex;
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
  let roundAdvanced = false;
  if (room.turnIndex <= previousIndex) {
    room.round += 1;
    roundAdvanced = true;
    processTileRecovery(room);
    refreshAllShopStocks(room);
  }
  room.turnStage = 'roll';
  room.dice = [];
  room.diceMode = 'd12';
  room.lastMove = null;
  room.lastEvent = null;
  room.remoteShopPlayerId = null;
  if (roundAdvanced && room.nurgle?.active) {
    advanceNurgleInvasion(room);
  }
  const next = currentPlayer(room);
  if (!next) {
    return;
  }
  const heldTurns = Math.max(0, Number(next.heldTurns) || 0);
  if (heldTurns > 0) {
    next.heldTurns = heldTurns - 1;
    room.turnStage = 'held';
    room.lastEvent = {
      title: '色孽禁锢',
      text: `${next.name} 仍被感官幻象困住，本回合无法移动。剩余禁锢回合：${next.heldTurns}。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'danger');
  } else if (next.zeroMoveNextTurn) {
    next.zeroMoveNextTurn = false;
    resolveLanding(room, next);
    logLastEvent(room);
  }
  room.botNextActionAt = next.isBot ? Date.now() + 1200 : 0;
  addLog(room, `第 ${room.round} 轮，轮到 ${next.name}`, 'round');
  grantTurnIncome(room, next);
  touchRoom(room);
}

function ensureCurrentTurn(room, player, stage) {
  if (room.phase !== 'playing') {
    const error = new Error('当前远征已经结束');
    error.statusCode = 409;
    throw error;
  }
  if (!activeTurn(room, player)) {
    const error = new Error('还没有轮到你行动');
    error.statusCode = 409;
    throw error;
  }
  if (stage && room.turnStage !== stage) {
    const error = new Error('当前阶段无法执行此操作');
    error.statusCode = 409;
    throw error;
  }
}

function useSkill(room, player, input) {
  ensureCurrentTurn(room, player);
  const skillId = String(input.skillId || player.skillId || '');
  const skill = SKILL_DEFINITIONS[skillId];
  if (!skill || skill.type !== 'active' || skillId !== player.skillId) {
    const error = new Error('当前没有可以使用的主动技能');
    error.statusCode = 409;
    throw error;
  }

  const cooldownRemaining = Math.max(
    0,
    (Number(player.skillReadyAtRound) || 0) - room.round,
  );
  if (cooldownRemaining > 0) {
    const error = new Error(`技能冷却中，还需等待 ${cooldownRemaining} 个回合`);
    error.statusCode = 409;
    throw error;
  }
  const usableStages = ['roll', 'claim', 'upgrade', 'landing', 'teleport', 'end'];
  if (!usableStages.includes(room.turnStage)) {
    const error = new Error('当前阶段无法使用技能');
    error.statusCode = 409;
    throw error;
  }

  if (skillId === 'steal') {
    const targetId = String(input.targetPlayerId || '');
    const target = skillTargetsFor(room, player, skillId)
      .find((item) => item.id === targetId);
    if (!target) {
      const error = new Error('目标玩家不在技能范围内');
      error.statusCode = 409;
      throw error;
    }
    if (target.stealAmount <= 0) {
      const error = new Error('目标玩家没有可偷取的影响力');
      error.statusCode = 409;
      throw error;
    }
    player.skillReadyAtRound = room.round + skill.cooldownRounds;
    const targetPlayer = room.players.find((item) => item.id === targetId);
    targetPlayer.influence -= target.stealAmount;
    player.influence += target.stealAmount;
    room.turnStage = 'end';
    room.lastEvent = {
      title: '暗影窃取',
      text: `${player.name} 从 ${targetPlayer.name} 处偷取 ${target.stealAmount} 影响力，剩余 ${player.influence} 影响力。`,
      tone: 'good',
    };
    addLog(room, room.lastEvent.text, 'income');
    touchRoom(room);
    return;
  }

  if (skillId === 'warpControl') {
    const choice = String(input.choice || '');
    if (!['increase', 'decrease'].includes(choice)) {
      const error = new Error('请选择增加或减少亚空间压力');
      error.statusCode = 400;
      throw error;
    }
    player.skillReadyAtRound = room.round + skill.cooldownRounds;
    if (choice === 'increase') {
      addDoom(room, 3, `${player.name} 操纵亚空间潮汐`);
      if (room.phase !== 'playing') {
        return;
      }
      room.lastEvent = {
        title: '潮汐操纵',
        text: `${player.name} 使亚空间压力增加 3，当前为 ${room.doom}。`,
        tone: 'danger',
      };
    } else {
      const previous = room.doom;
      room.doom = Math.max(0, room.doom - 3);
      room.lastEvent = {
        title: '潮汐操纵',
        text: `${player.name} 使亚空间压力减少 ${previous - room.doom}，当前为 ${room.doom}。`,
        tone: 'good',
      };
    }
    room.turnStage = 'end';
    addLog(room, room.lastEvent.text, room.lastEvent.tone === 'danger' ? 'warp' : 'income');
    touchRoom(room);
    return;
  }

  if (skillId === 'tzeentchChosen') {
    player.skillReadyAtRound = room.round + skill.cooldownRounds;
    if (room.shopMode === 'open') {
      room.remoteShopPlayerId = player.id;
      if (!room.remoteShopStock.length) {
        room.remoteShopStock = rollShopStock();
      }
      room.turnStage = 'shop';
      room.lastEvent = {
        title: '远程商店',
        text: `${player.name} 使用奸奇神选远程打开了星际商店。`,
        tone: 'good',
      };
      addLog(room, room.lastEvent.text, 'income');
      touchRoom(room);
      return;
    }

    const destinations = room.tiles.filter((tile) => tile.type !== 'shop');
    const target = destinations[randomInt(destinations.length)];
    const previous = player.position;
    player.position = target.id;
    room.turnStage = 'end';
    room.lastMove = {
      id: randomId(5),
      playerId: player.id,
      from: previous,
      to: target.id,
      distance: 1,
      path: [target.id],
      jump: true,
      at: Date.now(),
    };
    room.lastEvent = {
      title: '奸奇传送',
      text: `${player.name} 被奸奇魔法随机传送至 ${target.galaxyName} 的 ${target.name}。`,
      tone: 'warp',
    };
    addLog(room, room.lastEvent.text, 'warp');
    touchRoom(room);
    return;
  }

  if (skillId === 'downgrade') {
    const targetId = Number(input.targetTileId);
    const target = skillTargetsFor(room, player, skillId)
      .find((item) => item.id === targetId);
    if (!target) {
      const error = new Error('目标星球不在技能范围内');
      error.statusCode = 409;
      throw error;
    }
    player.skillReadyAtRound = room.round + skill.cooldownRounds;
    const tile = room.tiles[targetId];
    tile.level = Math.max(0, tile.level - 1);
    if (tile.level === 0) {
      tile.ownerId = null;
      tile.restoreAtRound = null;
    }
    room.turnStage = 'end';
    room.lastEvent = {
      title: '轨道打击',
      text: tile.level > 0
        ? `${player.name} 对 ${tile.name} 发动轨道打击，世界降为 ${tile.level} 级。`
        : `${player.name} 对 ${tile.name} 发动轨道打击，世界降为无主状态。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'invasion');
    touchRoom(room);
    return;
  }

  const error = new Error('未知技能');
  error.statusCode = 400;
  throw error;
}

function useItem(room, player, input) {
  ensureCurrentTurn(room, player);
  const itemId = String(input.itemId || '');
  const item = ITEM_DEFINITIONS[itemId];
  if (!item) {
    const error = new Error('未知道具');
    error.statusCode = 400;
    throw error;
  }
  if (!Array.isArray(player.items) || !player.items.includes(itemId)) {
    const error = new Error('背包中没有这张道具');
    error.statusCode = 409;
    throw error;
  }
  const usableStages = ['roll', 'claim', 'upgrade', 'landing', 'teleport', 'end'];
  if (!usableStages.includes(room.turnStage)) {
    const error = new Error('当前阶段无法使用道具');
    error.statusCode = 409;
    throw error;
  }

  const targets = itemTargetsFor(room, player, itemId);
  const finish = (event, logType = 'info') => {
    const index = player.items.indexOf(itemId);
    player.items.splice(index, 1);
    room.lastEvent = event;
    addLog(room, event.text, logType);
    if (item.endTurn) {
      room.turnStage = 'end';
    }
    touchRoom(room);
  };

  if (itemId === 'warpSuppress') {
    const previous = room.doom;
    room.doom = Math.max(0, room.doom - 2);
    finish({
      title: '亚空间抑制',
      text: `${player.name} 使用亚空间抑制卡，亚空间压力减少 ${previous - room.doom}，当前为 ${room.doom}。`,
      tone: 'good',
    }, 'income');
    return;
  }

  if (itemId === 'rebirth') {
    const candidates = SKILL_IDS.filter((skillId) => skillId !== player.skillId);
    const previousSkill = publicSkill(player, room);
    player.skillId = candidates[randomInt(candidates.length)];
    player.skillReadyAtRound = room.round;
    finish({
      title: '技能重生',
      text: `${player.name} 使用重生卡，${previousSkill?.name || '原技能'}作废，重新抽取了 ${SKILL_DEFINITIONS[player.skillId].name}。`,
      tone: 'good',
    }, 'round');
    return;
  }

  if (itemId === 'siege') {
    if (player.nextInvasionBonus > 0) {
      const error = new Error('攻城加成已经生效');
      error.statusCode = 409;
      throw error;
    }
    player.nextInvasionBonus = 2;
    finish({
      title: '攻城准备',
      text: `${player.name} 使用攻城卡，下一次入侵点数增加 2。`,
      tone: 'good',
    }, 'invasion');
    return;
  }

  if (itemId === 'universalDice') {
    if (player.forcedMoveRoll !== null) {
      const error = new Error('已经指定了下一次移动点数');
      error.statusCode = 409;
      throw error;
    }
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 1 || value > 12) {
      const error = new Error('请选择 1 到 12 之间的点数');
      error.statusCode = 400;
      throw error;
    }
    player.forcedMoveRoll = value;
    finish({
      title: '万能骰子',
      text: `${player.name} 使用万能骰子，将下一次移动点数指定为 ${value}。`,
      tone: 'good',
    }, 'move');
    return;
  }

  if (itemId === 'upgrade') {
    const targetId = Number(input.targetTileId);
    const target = Array.isArray(targets)
      ? targets.find((tile) => tile.id === targetId)
      : null;
    if (!target) {
      const error = new Error('目标星球不在升级卡范围内');
      error.statusCode = 409;
      throw error;
    }
    const tile = room.tiles[targetId];
    tile.level += 1;
    finish({
      title: '免费升级',
      text: `${player.name} 使用升级卡，免费将 ${tile.name} 升级到 ${tile.level} 级。`,
      tone: 'good',
    }, 'build');
    checkVictory(room, player, '完成星区要塞化');
    return;
  }

  if (itemId === 'static') {
    const targetId = String(input.targetPlayerId || '');
    const target = Array.isArray(targets)
      ? targets.find((item) => item.id === targetId)
      : null;
    if (!target) {
      const error = new Error('目标玩家不在静止卡范围内');
      error.statusCode = 409;
      throw error;
    }
    const targetPlayer = room.players.find((item) => item.id === targetId);
    targetPlayer.heldTurns = Math.max(2, Number(targetPlayer.heldTurns) || 0);
    finish({
      title: '静止场',
      text: `${player.name} 使用静止卡，${targetPlayer.name} 接下来两个回合无法移动。`,
      tone: 'danger',
    }, 'danger');
    return;
  }

  if (itemId === 'teleport') {
    const targetId = String(input.targetPlayerId || '');
    const target = targets.players?.find((item) => item.id === targetId);
    const destinationId = Number(input.destinationTileId);
    const destination = room.tiles[destinationId];
    if (!target || !destination) {
      const error = new Error('传送目标或目的地无效');
      error.statusCode = 409;
      throw error;
    }
    const targetPlayer = room.players.find((item) => item.id === targetId);
    if (targetPlayer.position === destination.id) {
      const error = new Error('目标已经在该星球');
      error.statusCode = 409;
      throw error;
    }
    const previous = targetPlayer.position;
    targetPlayer.position = destination.id;
    targetPlayer.zeroMoveNextTurn = true;
    room.lastMove = {
      id: randomId(5),
      playerId: targetPlayer.id,
      from: previous,
      to: destination.id,
      distance: 1,
      path: [destination.id],
      jump: true,
      at: Date.now(),
    };
    finish({
      title: '强制传送',
      text: `${player.name} 使用传送卡，将 ${targetPlayer.name} 传送到 ${destination.galaxyName} 的 ${destination.name}；其下回合移动 0 格并结算落点。`,
      tone: 'warp',
    }, 'warp');
    return;
  }

  const error = new Error('该道具暂时无法使用');
  error.statusCode = 400;
  throw error;
}

function performAction(room, player, input) {
  const type = String(input.type || '').toLowerCase();

  if (type === 'skill') {
    useSkill(room, player, input);
    return;
  }

  if (type === 'item') {
    useItem(room, player, input);
    return;
  }

  if (type === 'roll') {
    ensureCurrentTurn(room, player, 'roll');
    const distance = Number.isInteger(player.forcedMoveRoll)
      ? player.forcedMoveRoll
      : randomInt(12) + 1;
    player.forcedMoveRoll = null;
    const previousTile = room.tiles[player.position];
    const galaxyTiles = room.tiles
      .filter((tile) => tile.galaxy === previousTile.galaxy)
      .sort((left, right) => left.localIndex - right.localIndex);
    const currentLocalIndex = galaxyTiles.findIndex((tile) => tile.id === previousTile.id);
    const movementPath = [];
    for (let step = 1; step <= distance; step += 1) {
      movementPath.push(
        galaxyTiles[(currentLocalIndex + step) % galaxyTiles.length].id,
      );
    }
    const previous = player.position;
    player.position = movementPath[movementPath.length - 1];
    room.dice = [distance];
    room.diceMode = 'd12';
    room.lastMove = {
      id: randomId(5),
      playerId: player.id,
      from: previous,
      to: player.position,
      distance,
      path: movementPath,
      jump: false,
      at: Date.now(),
    };
    addLog(
      room,
      `${player.name} 投出 D12：${distance}，从 ${room.tiles[previous].name} 抵达 ${room.tiles[player.position].name}`,
      'move',
    );
    if (distance === 12) {
      addDoom(room, 1, `${player.name} 投出 12，亚空间产生波动`);
    }
    resolveLanding(room, player);
    logLastEvent(room);
    touchRoom(room);
    return;
  }

  if (type === 'claim') {
    ensureCurrentTurn(room, player, 'claim');
    const tile = room.tiles[player.position];
    if (tile.ownerId || !tile.claimable) {
      const error = new Error('该区域无法被占领');
      error.statusCode = 409;
      throw error;
    }
    const cost = claimCostFor(room, player, tile);
    if (player.influence < cost) {
      const error = new Error('影响力不足');
      error.statusCode = 409;
      throw error;
    }
    player.influence -= cost;
    tile.ownerId = player.id;
    tile.level = 1;
    room.turnStage = 'end';
    addLog(
      room,
      `${player.name} 支付 ${cost} 影响力占领 ${tile.name}，剩余 ${player.influence} 影响力。`,
      'claim',
    );
    checkVictory(room, player, '建立无可争议的星区霸权');
    touchRoom(room);
    return;
  }

  if (type === 'upgrade') {
    ensureCurrentTurn(room, player, 'upgrade');
    const tile = room.tiles[player.position];
    if (tile.ownerId !== player.id || tile.level < 1 || tile.level >= 3) {
      const error = new Error('该区域无法升级');
      error.statusCode = 409;
      throw error;
    }
    const cost = upgradeCostFor(room, player, tile);
    if (player.influence < cost) {
      const error = new Error('影响力不足');
      error.statusCode = 409;
      throw error;
    }
    player.influence -= cost;
    tile.level += 1;
    room.turnStage = 'end';
    addLog(
      room,
      `${player.name} 支付 ${cost} 影响力将 ${tile.name} 升级到 ${tile.level} 级，剩余 ${player.influence} 影响力。`,
      'build',
    );
    checkVictory(room, player, '完成星区要塞化');
    touchRoom(room);
    return;
  }

  if (type === 'tithe') {
    ensureCurrentTurn(room, player, 'landing');
    const tile = room.tiles[player.position];
    const owner = ownerFor(room, tile.ownerId);
    if (!owner || owner.id === player.id) {
      const error = new Error('当前不需要缴税');
      error.statusCode = 409;
      throw error;
    }
    if (owner.isNurgle) {
      const error = new Error('无法向纳垢缴纳什一税，只能尝试入侵');
      error.statusCode = 409;
      throw error;
    }
    const cost = tributeFor(tile);
    if (player.influence < cost) {
      const error = new Error('影响力不足，只能选择入侵');
      error.statusCode = 409;
      throw error;
    }
    player.influence -= cost;
    owner.influence += cost;
    room.turnStage = 'end';
    addLog(
      room,
      `${player.name} 向 ${owner.name} 支付 ${cost} 影响力作为什一税，剩余 ${player.influence} 影响力。`,
      'tithe',
    );
    room.lastEvent = {
      title: '什一税',
      text: `${player.name} 向 ${owner.name} 支付 ${cost} 影响力。`,
      tone: 'neutral',
    };
    touchRoom(room);
    return;
  }

  if (type === 'invade') {
    ensureCurrentTurn(room, player, 'landing');
    const tile = room.tiles[player.position];
    const defender = ownerFor(room, tile.ownerId);
    if (!defender || defender.id === player.id) {
      const error = new Error('当前无法发动入侵');
      error.statusCode = 409;
      throw error;
    }
    if (defender.isNurgle) {
      room.turnStage = 'end';
      room.lastEvent = {
        title: '入侵失败',
        text: `${player.name} 进攻 ${tile.name}，但纳垢的瘟疫让所有攻势彻底失败。`,
        tone: 'danger',
      };
      addLog(room, room.lastEvent.text, 'invasion');
      touchRoom(room);
      return;
    }
    const invasionBonus = Math.max(0, Number(player.nextInvasionBonus) || 0);
    const attackerRoll = randomInt(6) + 1 + invasionBonus;
    player.nextInvasionBonus = 0;
    const defenderRoll = randomInt(6) + 1 + tile.level;
    room.dice = [attackerRoll, defenderRoll];
    room.diceMode = 'battle';
    resolveInvasion(room, player, defender, tile, attackerRoll, defenderRoll);
    touchRoom(room);
    return;
  }

  if (type === 'buyitem') {
    ensureCurrentTurn(room, player, 'shop');
    if (room.shopMode !== 'open') {
      const error = new Error('商店已经失效');
      error.statusCode = 409;
      throw error;
    }

    const itemId = String(input.itemId || '');
    const tile = room.tiles[player.position];
    const remote = room.remoteShopPlayerId === player.id;
    const stock = remote ? room.remoteShopStock : (room.shopStocks[tile.id] || []);
    const stockIndex = stock.indexOf(itemId);
    const item = publicItem(itemId);
    if (player.lastPurchaseRound === room.round) {
      const error = new Error('本回合已经购买过道具');
      error.statusCode = 409;
      throw error;
    }
    if (stockIndex < 0 || !item) {
      const error = new Error('该商品已经售罄');
      error.statusCode = 409;
      throw error;
    }
    if (!Number.isFinite(item.price) || item.price < 0) {
      const error = new Error('商品价格无效');
      error.statusCode = 500;
      throw error;
    }
    if (player.influence < item.price) {
      const error = new Error('影响力不足');
      error.statusCode = 409;
      throw error;
    }

    player.influence -= item.price;
    if (!Array.isArray(player.items)) {
      player.items = [];
    }
    player.items.push(itemId);
    stock.splice(stockIndex, 1);
    player.lastPurchaseRound = room.round;
    room.remoteShopPlayerId = null;
    room.turnStage = 'end';
    room.lastEvent = {
      title: '购买成功',
      text: `${player.name} 花费 ${item.price} 影响力购买 ${item.name}，剩余 ${player.influence} 影响力。`,
      tone: 'good',
    };
    addLog(room, room.lastEvent.text, 'income');
    touchRoom(room);
    return;
  }

  if (type === 'teleport') {
    ensureCurrentTurn(room, player, 'teleport');
    const tile = room.tiles[player.position];
    if (tile.teleportTo === null) {
      const error = new Error('当前星门无法跃迁');
      error.statusCode = 409;
      throw error;
    }
    const target = room.tiles[tile.teleportTo];
    const previous = player.position;
    player.position = target.id;
    room.turnStage = 'end';
    room.lastMove = {
      id: randomId(5),
      playerId: player.id,
      from: previous,
      to: target.id,
      distance: 1,
      path: [target.id],
      jump: true,
      at: Date.now(),
    };
    room.lastEvent = {
      title: '跃迁完成',
      text: `${player.name} 从 ${tile.name} 跃迁至 ${target.galaxyName} 的 ${target.name}。`,
      tone: 'good',
    };
    addLog(room, room.lastEvent.text, 'warp');
    touchRoom(room);
    return;
  }

  if (type === 'end') {
    ensureCurrentTurn(room, player);
    if (!['claim', 'upgrade', 'teleport', 'shop', 'held', 'end'].includes(room.turnStage)) {
      const error = new Error('必须先处理当前落点');
      error.statusCode = 409;
      throw error;
    }
    advanceTurn(room);
    return;
  }

  const error = new Error('未知操作');
  error.statusCode = 400;
  throw error;
}

function chooseFaction(room, player, factionKey) {
  requireLobby(room);
  if (!FACTION_KEYS.includes(factionKey)) {
    const error = new Error('未知阵营');
    error.statusCode = 400;
    throw error;
  }
  const occupied = room.players.find((item) => (
    item.id !== player.id && item.faction === factionKey
  ));
  if (occupied) {
    const error = new Error(`${FACTIONS[factionKey].name} 已被选择`);
    error.statusCode = 409;
    throw error;
  }
  player.faction = factionKey;
  addLog(room, `${player.name} 选择 ${FACTIONS[factionKey].name}`);
}

function startGame(room) {
  requireLobby(room);
  if (room.players.length < MIN_PLAYERS) {
    const error = new Error('至少需要两名玩家');
    error.statusCode = 409;
    throw error;
  }
  if (!room.players.every((player) => player.ready)) {
    const error = new Error('仍有玩家尚未准备');
    error.statusCode = 409;
    throw error;
  }
  room.tiles = createBoard();
  const startingTiles = randomSample(room.tiles, room.players.length);
  const startingSkills = randomSample(SKILL_IDS, room.players.length);
  for (const [index, player] of room.players.entries()) {
    const faction = FACTIONS[player.faction];
    player.influence = faction.startInfluence;
    player.bonusDominion = 0;
    player.items = [];
    player.heldTurns = 0;
    player.skillId = startingSkills[index];
    player.skillReadyAtRound = 0;
    player.forcedMoveRoll = null;
    player.nextInvasionBonus = 0;
    player.zeroMoveNextTurn = false;
    player.lastPurchaseRound = 0;
    player.position = startingTiles[index].id;
    player.ready = Boolean(player.isBot);
  }
  room.phase = 'playing';
  room.round = 1;
  room.turnIndex = 0;
  room.turnStage = 'roll';
  room.botNextActionAt = room.players[0].isBot ? Date.now() + 1200 : 0;
  room.doom = 0;
  room.doomMilestones = new Set();
  room.shopMode = 'open';
  room.shopStocks = {};
  room.remoteShopPlayerId = null;
  room.remoteShopStock = [];
  refreshAllShopStocks(room);
  room.nurgle = {
    active: false,
    position: null,
    roundsRemaining: 0,
    conqueredTileIds: [],
  };
  room.dice = [];
  room.diceMode = 'd12';
  room.lastMove = null;
  const skillSummary = room.players
    .map((player) => `${player.name} 抽取 ${SKILL_DEFINITIONS[player.skillId].name}`)
    .join('，');
  room.lastEvent = {
    title: '远征开始',
    text: `战争领主们在星区内随机跃出：${room.players.map((player) => `${player.name} 位于 ${room.tiles[player.position].name}`).join('，')}。${skillSummary}。`,
    tone: 'neutral',
  };
  room.result = null;
  addLog(room, room.lastEvent.text, 'round');
}

function restartRoom(room) {
  room.phase = 'lobby';
  room.tiles = createBoard();
  room.turnIndex = -1;
  room.turnStage = 'idle';
  room.botNextActionAt = 0;
  room.round = 0;
  room.doom = 0;
  room.doomMilestones = new Set();
  room.shopMode = 'open';
  room.shopStocks = {};
  room.remoteShopPlayerId = null;
  room.remoteShopStock = [];
  room.nurgle = {
    active: false,
    position: null,
    roundsRemaining: 0,
    conqueredTileIds: [],
  };
  room.dice = [];
  room.diceMode = 'd12';
  room.lastMove = null;
  room.lastEvent = null;
  room.result = null;
  for (const player of room.players) {
    player.influence = 0;
    player.bonusDominion = 0;
    player.items = [];
    player.heldTurns = 0;
    player.skillId = '';
    player.skillReadyAtRound = 0;
    player.forcedMoveRoll = null;
    player.nextInvasionBonus = 0;
    player.zeroMoveNextTurn = false;
    player.lastPurchaseRound = 0;
    player.position = 0;
    player.ready = Boolean(player.isBot);
  }
  addLog(room, '舰队返回轨道，等待下一次远征', 'round');
}

function joinRoom(room, name, existingToken = '', existingPlayerId = '') {
  if (existingToken) {
    const existing = room.players.find((player) => (
      player.token === existingToken
      && (!existingPlayerId || player.id === existingPlayerId)
    ));
    if (existing) {
      existing.connected = true;
      existing.lastSeenAt = Date.now();
      return { player: existing, reconnected: true };
    }
  }

  requireLobby(room);
  if (room.players.length >= MAX_PLAYERS) {
    const error = new Error(`战区最多容纳 ${MAX_PLAYERS} 名玩家`);
    error.statusCode = 409;
    throw error;
  }
  const player = createPlayer(name);
  room.players.push(player);
  assignFaction(room, player);
  addLog(room, `${player.name} 加入战区`);
  return { player, reconnected: false };
}

function warLossFor(level) {
  return WAR_LOSS_BASE + (Math.max(0, level) * WAR_LOSS_PER_LEVEL);
}

function reparationFor(level) {
  return Math.max(0, level) * REPARATION_PER_LEVEL;
}

function invasionPreviewFor(room, player, tile) {
  const owner = ownerFor(room, tile.ownerId);
  if (!owner || owner.id === player.id) {
    return null;
  }
  if (owner.isNurgle) {
    return {
      nurgle: true,
      level: tile.level,
      warLoss: 0,
      reparations: 0,
      failureLoss: 0,
      drawLoss: 0,
      remainingAfterFailure: player.influence,
      remainingAfterDraw: player.influence,
    };
  }

  const level = Math.max(0, Number(tile.level) || 0);
  const warLoss = Math.min(player.influence, warLossFor(level));
  const remainingAfterWarLoss = Math.max(0, player.influence - warLoss);
  const reparations = Math.min(remainingAfterWarLoss, reparationFor(level));
  const failureLoss = warLoss + reparations;
  return {
    nurgle: false,
    tieWins: hasSkill(player, 'invasionTie'),
    level,
    warLoss,
    reparations,
    failureLoss,
    drawLoss: warLoss,
    remainingAfterFailure: Math.max(0, player.influence - failureLoss),
    remainingAfterDraw: remainingAfterWarLoss,
  };
}

function scheduleRecovery(room, tile) {
  if (tile.level > 0) {
    tile.restoreAtRound = room.round + RECOVERY_ROUNDS;
  } else {
    tile.restoreAtRound = null;
  }
}

function processTileRecovery(room) {
  for (const tile of room.tiles) {
    if (
      tile.ownerId
      && tile.restoreAtRound
      && room.round >= tile.restoreAtRound
    ) {
      tile.level = Math.min(3, tile.level + 1);
      tile.restoreAtRound = null;
      addLog(room, `${tile.name} 完成重建，恢复到 ${tile.level} 级`, 'build');
    }
  }
}

function resolveInvasion(room, player, defender, tile, attackerRoll, defenderRoll) {
  room.turnStage = 'end';

  if (defenderRoll > attackerRoll) {
    const loss = Math.min(player.influence, warLossFor(tile.level));
    player.influence -= loss;
    const reparations = Math.min(player.influence, reparationFor(tile.level));
    player.influence -= reparations;
    defender.influence += reparations;
    room.lastEvent = {
      title: '防守胜利',
      text: `${defender.name} 以 ${defenderRoll}:${attackerRoll} 守住 ${tile.name}。${player.name} 损失 ${loss} 战争物资，并支付 ${reparations} 赔款，剩余 ${player.influence} 影响力。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'invasion');
    return;
  }

  if (defenderRoll === attackerRoll && !hasSkill(player, 'invasionTie')) {
    const levelBefore = tile.level;
    const attackerLoss = Math.min(player.influence, warLossFor(levelBefore));
    const defenderLoss = Math.min(defender.influence, warLossFor(levelBefore));
    player.influence -= attackerLoss;
    defender.influence -= defenderLoss;
    if (levelBefore > 0) {
      tile.level -= 1;
      scheduleRecovery(room, tile);
    }
    room.lastEvent = {
      title: '战争僵局',
      text: `${player.name} 与 ${defender.name} 以 ${attackerRoll}:${defenderRoll} 僵持。双方各损失 ${attackerLoss} 与 ${defenderLoss} 战争物资，${tile.name} 降为 ${tile.level} 级，并将在 ${RECOVERY_ROUNDS} 个回合后恢复。`,
      tone: 'warp',
    };
    addLog(room, room.lastEvent.text, 'invasion');
    return;
  }

  tile.ownerId = player.id;
  tile.level = Math.max(1, tile.level - 1);
  tile.restoreAtRound = null;
  room.lastEvent = {
    title: '入侵成功',
    text: `${player.name} 以 ${attackerRoll}:${defenderRoll} 夺取 ${tile.name}，世界降为 ${tile.level} 级，原领主失去该领土。`,
    tone: 'danger',
  };
  addLog(room, room.lastEvent.text, 'invasion');
  checkVictory(room, player, '通过武力夺取星区');
}

function attachSse(request, response, room, player) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write(': connected\n\n');

  player.connected = true;
  player.lastSeenAt = Date.now();
  player.clients.add(response);
  writeEvent(response, roomState(room, player));
  broadcast(room);

  const cleanup = () => {
    player.clients.delete(response);
    if (player.clients.size === 0) {
      player.connected = false;
      player.lastSeenAt = Date.now();
      broadcast(room);
    }
  };

  request.on('close', cleanup);
  response.on('close', cleanup);

  if (!room.sseTimer) {
    room.sseTimer = setInterval(() => {
      for (const roomPlayer of room.players) {
        for (const client of roomPlayer.clients) {
          if (!client.destroyed && !client.writableEnded) {
            client.write(': ping\n\n');
          }
        }
      }
    }, 15000);
    room.sseTimer.unref?.();
  }
}

function serveStatic(request, response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(requestedPath);
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  const filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': ['.html', '.js', '.css'].includes(extension)
        ? 'no-store'
        : 'public, max-age=300',
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, {
      ok: true,
      rooms: rooms.size,
      now: new Date().toISOString(),
    });
    return;
  }

  if (pathname === '/api/rooms' && request.method === 'POST') {
    const body = await readJson(request);
    const name = cleanName(body.name);
    if (!name) {
      const error = new Error('请输入玩家名称');
      error.statusCode = 400;
      throw error;
    }
    const player = createPlayer(name);
    const room = createRoom(player);
    rooms.set(room.code, room);
    sendJson(response, 201, {
      ok: true,
      roomCode: room.code,
      playerId: player.id,
      token: player.token,
      name: player.name,
      faction: player.faction,
    });
    return;
  }

  if (pathname === '/api/rooms/join' && request.method === 'POST') {
    const body = await readJson(request);
    const room = getRoom(body.roomCode);
    const name = cleanName(body.name) || '战争领主';
    const joined = joinRoom(room, name, body.token, body.playerId);
    joined.player.connected = true;
    joined.player.lastSeenAt = Date.now();
    broadcast(room);
    sendJson(response, 200, {
      ok: true,
      roomCode: room.code,
      playerId: joined.player.id,
      token: joined.player.token,
      name: joined.player.name,
      faction: joined.player.faction,
      reconnected: joined.reconnected,
    });
    return;
  }

  const roomMatch = pathname.match(
    /^\/api\/rooms\/([A-Z0-9]{4,6})(?:\/(events|state|ready|faction|addbot|removebot|start|action|restart|leave))?$/i,
  );
  if (!roomMatch) {
    sendJson(response, 404, { ok: false, error: '接口不存在' });
    return;
  }

  const room = getRoom(roomMatch[1]);
  const endpoint = roomMatch[2] || 'state';

  if (endpoint === 'events' && request.method === 'GET') {
    const player = getPlayer(room, requestUrl.searchParams.get('token'));
    attachSse(request, response, room, player);
    return;
  }

  if (endpoint === 'state' && request.method === 'GET') {
    const token = requestUrl.searchParams.get('token');
    const viewer = token ? getPlayer(room, token) : null;
    if (viewer) {
      viewer.connected = true;
      viewer.lastSeenAt = Date.now();
    }
    maybeAdvanceBot(room);
    sendJson(response, 200, {
      ok: true,
      state: roomState(room, viewer),
    });
    return;
  }

  if (endpoint === 'ready' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    requireLobby(room);
    player.ready = Boolean(body.ready);
    player.connected = true;
    player.lastSeenAt = Date.now();
    addLog(room, `${player.name}${player.ready ? ' 已准备' : ' 取消准备'}`);
    broadcast(room);
    sendJson(response, 200, { ok: true, state: roomState(room, player) });
    return;
  }

  if (endpoint === 'faction' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    chooseFaction(room, player, String(body.faction || ''));
    player.ready = false;
    broadcast(room);
    sendJson(response, 200, { ok: true, state: roomState(room, player) });
    return;
  }

  if (endpoint === 'addbot' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    addBot(room, player);
    broadcast(room);
    sendJson(response, 200, { ok: true, state: roomState(room, player) });
    return;
  }

  if (endpoint === 'removebot' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    removeBot(room, player, String(body.playerId || ''));
    broadcast(room);
    sendJson(response, 200, { ok: true, state: roomState(room, player) });
    return;
  }

  if (endpoint === 'start' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    requireHost(room, player);
    startGame(room);
    broadcast(room);
    sendJson(response, 200, { ok: true, state: roomState(room, player) });
    return;
  }

  if (endpoint === 'action' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    player.connected = true;
    player.lastSeenAt = Date.now();
    performAction(room, player, body);
    broadcast(room);
    sendJson(response, 200, { ok: true, state: roomState(room, player) });
    return;
  }

  if (endpoint === 'restart' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    requireHost(room, player);
    if (room.phase !== 'settled') {
      const error = new Error('当前远征尚未结束');
      error.statusCode = 409;
      throw error;
    }
    restartRoom(room);
    broadcast(room);
    sendJson(response, 200, { ok: true, state: roomState(room, player) });
    return;
  }

  if (endpoint === 'leave' && request.method === 'POST') {
    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    if (room.phase === 'playing') {
      const error = new Error('远征进行中，暂时不能退出战区');
      error.statusCode = 409;
      throw error;
    }
    const playerIndex = room.players.indexOf(player);
    if (playerIndex >= 0) {
      room.players.splice(playerIndex, 1);
    }
    if (room.hostId === player.id) {
      const nextHost = room.players.find((item) => item.connected) || room.players[0];
      room.hostId = nextHost ? nextHost.id : null;
      if (nextHost) {
        addLog(room, `${nextHost.name} 成为新房主`);
      }
    }
    if (room.turnIndex >= room.players.length) {
      room.turnIndex = room.players.length - 1;
    }
    addLog(room, `${player.name} 离开了战区`);
    if (room.players.length === 0) {
      clearInterval(room.sseTimer);
      rooms.delete(room.code);
    } else {
      broadcast(room);
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 405, { ok: false, error: '请求方式不正确' });
}

function createGameServer() {
  return http.createServer((request, response) => {
    if (request.url?.startsWith('/api/')) {
      handleRequest(request, response).catch((error) => sendError(response, error));
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end();
      return;
    }
    serveStatic(request, response, new URL(request.url, 'http://localhost').pathname);
  });
}

function startGameServer(port = PORT, host = HOST) {
  const server = createGameServer();
  server.listen(port, host, () => {
    const address = server.address();
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`亚空间什一税已启动：http://${displayHost}:${address.port}`);
  });
  return server;
}

function startMaintenance() {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const hasClients = room.players.some((player) => player.clients.size > 0);
      if (!hasClients && now - room.updatedAt > ROOM_TTL_MS) {
        clearInterval(room.sseTimer);
        rooms.delete(code);
        continue;
      }
      if (maybeAdvanceBot(room)) {
        broadcast(room);
      }
    }
  }, 1000);
  timer.unref?.();
}

if (require.main === module) {
  startMaintenance();
  startGameServer();
}

module.exports = {
  activateShopWarp,
  advanceNurgleInvasion,
  BOARD_DEFINITIONS,
  DOMINION_TARGET,
  ITEM_DEFINITIONS,
  SKILL_DEFINITIONS,
  SKILL_IDS,
  TILE_TYPES,
  addBot,
  advanceBot,
  createGameServer,
  createRoom,
  dominionFor,
  grantTurnIncome,
  invasionPreviewFor,
  maybeAdvanceBot,
  performAction,
  processTileRecovery,
  removeBot,
  resolveLanding,
  resolveInvasion,
  startGame,
  startGameServer,
  triggerDoomMilestone,
};
