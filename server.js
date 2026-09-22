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
const MAX_PLAYERS = 4;
const DOMINION_TARGET = 12;
const MAX_DOOM = 16;
const WAR_LOSS_BASE = 35;
const WAR_LOSS_PER_LEVEL = 20;
const REPARATION_PER_LEVEL = 40;
const RECOVERY_ROUNDS = 3;

const BOARD_DEFINITIONS = [
  { name: '风暴枢纽', type: 'start' },
  { name: '维吉勒斯巢都', type: 'hive' },
  { name: '铸造世界：格里芬', type: 'forge' },
  { name: '亚空间裂隙', type: 'warp' },
  { name: '光耀圣祠', type: 'shrine' },
  { name: '死亡世界：卡塔昌', type: 'death' },
  { name: '黑石要塞', type: 'relic' },
  { name: '农业世界：阿格里皮娜', type: 'hive' },
  { name: '虚空信标', type: 'webway' },
  { name: '巢都：涅克洛蒙达', type: 'hive' },
  { name: '铸造世界：瑞扎', type: 'forge' },
  { name: '处女世界：伊莎之泪', type: 'maiden' },
  { name: '死亡世界：阿米吉多顿', type: 'death' },
  { name: '亚空间裂隙', type: 'warp' },
  { name: '太空废船', type: 'relic' },
  { name: '沉默圣祠', type: 'shrine' },
  { name: '死亡世界：萨弗拉', type: 'death' },
  { name: '异形遗迹', type: 'tomb' },
  { name: '蜂巢世界：卢修斯', type: 'hive' },
  { name: '铸造世界：阿格里皮娜', type: 'forge' },
  { name: '网道之门', type: 'webway' },
  { name: '混沌魔域', type: 'warp' },
  { name: '死亡世界：沃拉克', type: 'death' },
  { name: '巢都世界：特里安', type: 'hive' },
  { name: '处女世界：乌斯维', type: 'maiden' },
  { name: '被遗弃的废船', type: 'relic' },
  { name: '圣祠世界：奥菲莉亚', type: 'shrine' },
  { name: '亚空间裂隙', type: 'warp' },
  { name: '铸造世界：库拉', type: 'forge' },
  { name: '死亡世界：兹拉杜斯', type: 'death' },
  { name: '巢都世界：塞弗', type: 'hive' },
  { name: '沉睡墓穴', type: 'tomb' },
];

const TILE_TYPES = {
  start: { label: '起点', glyph: 'G', color: '#d6b56d', claimable: false },
  hive: { label: '巢都', glyph: 'H', color: '#c88a42', cost: 90, value: 1, yield: 16, claimable: true },
  forge: { label: '铸造', glyph: 'F', color: '#a8b7b5', cost: 120, value: 2, yield: 22, claimable: true },
  shrine: { label: '圣祠', glyph: 'S', color: '#d0c6a5', cost: 100, value: 1, yield: 15, claimable: true },
  death: { label: '死亡', glyph: 'D', color: '#a54d3d', cost: 75, value: 1, yield: 13, claimable: true },
  maiden: { label: '处女', glyph: 'M', color: '#8e9e83', claimable: false },
  tomb: { label: '墓穴', glyph: 'T', color: '#6f8e84', claimable: false },
  relic: { label: '遗物', glyph: 'R', color: '#b98b45', claimable: false },
  webway: { label: '网道', glyph: 'E', color: '#4d847d', claimable: false },
  warp: { label: '亚空间', glyph: 'W', color: '#963e34', claimable: false },
};

const FACTIONS = {
  imperium: {
    name: '人类帝国',
    shortName: '帝国',
    color: '#d0a24c',
    startInfluence: 360,
    incomeModifier: 1.25,
    invasionBonus: 0,
    passive: '泰拉税吏：领地收入提高 25%',
  },
  chaos: {
    name: '混沌军团',
    shortName: '混沌',
    color: '#b84436',
    startInfluence: 300,
    incomeModifier: 1,
    invasionBonus: 1,
    passive: '亚空间馈赠：亚空间事件额外获得影响力',
  },
  orks: {
    name: '兽人 Waaagh!',
    shortName: '兽人',
    color: '#7fa34f',
    startInfluence: 280,
    incomeModifier: 1,
    invasionBonus: 2,
    passive: 'Waaagh!：入侵检定 +2',
  },
  aeldari: {
    name: '方舟灵族',
    shortName: '灵族',
    color: '#4b8f8a',
    startInfluence: 320,
    incomeModifier: 1.1,
    invasionBonus: 0,
    passive: '网道行者：网道事件获得额外统治点',
  },
};

const FACTION_KEYS = Object.keys(FACTIONS);
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

function createBoard() {
  return BOARD_DEFINITIONS.map((definition, index) => {
    const type = TILE_TYPES[definition.type];
    return {
      id: index,
      name: definition.name,
      type: definition.type,
      typeLabel: type.label,
      glyph: type.glyph,
      color: type.color,
      cost: type.cost,
      value: type.value,
      yield: type.yield,
      claimable: Boolean(type.claimable),
      ownerId: null,
      level: 0,
      restoreAtRound: null,
    };
  });
}

function createPlayer(name, faction = '') {
  return {
    id: randomId(12),
    token: randomId(24),
    name,
    faction,
    influence: 0,
    bonusDominion: 0,
    position: 0,
    ready: false,
    connected: false,
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
    dice: [],
    diceMode: 'd12',
    lastMove: null,
    lastEvent: null,
    result: null,
    logs: [],
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
    canEnd: false,
    claimCost: 0,
    upgradeCost: 0,
    titheCost: 0,
    tileIndex: -1,
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

  if (room.turnStage === 'roll') {
    actions.canRoll = true;
    return actions;
  }
  if (room.turnStage === 'claim') {
    actions.canClaim = viewer.influence >= tile.cost;
    actions.canEnd = true;
    actions.claimCost = tile.cost;
    return actions;
  }
  if (room.turnStage === 'upgrade') {
    const cost = upgradeCost(tile);
    actions.canUpgrade = Boolean(cost && viewer.influence >= cost && tile.level < 3);
    actions.canEnd = true;
    actions.upgradeCost = cost;
    return actions;
  }
  if (room.turnStage === 'landing') {
    const tribute = tributeFor(tile);
    actions.canPayTithe = viewer.influence >= tribute;
    actions.canInvade = true;
    actions.titheCost = tribute;
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
    faction: player.faction,
    factionName: faction?.name || '未选择',
    factionShortName: faction?.shortName || '未知',
    color: faction?.color || '#8a938f',
    influence: player.influence,
    dominion: dominionFor(room, player),
    bonusDominion: player.bonusDominion,
    holdings: playerTiles(room, player.id).length,
    position: player.position,
    ready: player.ready,
    connected: player.connected,
    isHost: player.id === room.hostId,
    isTurn: playerTurn?.id === player.id,
  };
}

function publicTile(room, tile) {
  const owner = tile.ownerId
    ? room.players.find((player) => player.id === tile.ownerId)
    : null;
  return {
    ...tile,
    owner: owner ? {
      id: owner.id,
      name: owner.name,
      color: FACTIONS[owner.faction]?.color || '#8a938f',
    } : null,
    tribute: tributeFor(tile),
    nextUpgradeCost: upgradeCost(tile),
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
      passive: FACTIONS[key].passive,
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

function triggerDoomMilestone(room, milestone) {
  if (room.doomMilestones.has(milestone) || room.phase !== 'playing') {
    return;
  }
  room.doomMilestones.add(milestone);

  if (milestone === 4) {
    for (const player of room.players) {
      player.influence = Math.max(0, player.influence - 40);
    }
    room.lastEvent = {
      title: '恐虐狂潮',
      text: '血神的目光扫过战区，所有战争领主损失 40 影响力。',
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'danger');
  } else if (milestone === 8) {
    let downgraded = 0;
    for (const tile of room.tiles) {
      if (tile.ownerId && tile.level === 3) {
        tile.level = 2;
        downgraded += 1;
      }
    }
    room.lastEvent = {
      title: '纳垢之疫',
      text: `瘟疫侵蚀高等级领地，${downgraded} 个要塞世界降级。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'danger');
  } else if (milestone === 12) {
    if (room.players.length >= 2) {
      const first = room.players[randomInt(room.players.length)];
      let second = room.players[randomInt(room.players.length)];
      while (second.id === first.id) {
        second = room.players[randomInt(room.players.length)];
      }
      [first.position, second.position] = [second.position, first.position];
      room.lastEvent = {
        title: '奸奇之谋',
        text: `${first.name} 与 ${second.name} 的位置被命运互换。`,
        tone: 'danger',
      };
      addLog(room, room.lastEvent.text, 'danger');
    }
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
    if (value === 4 || value === 8 || value === 12 || value === 16) {
      triggerDoomMilestone(room, value);
    }
  }
}

function grantTurnIncome(room, player) {
  const faction = FACTIONS[player.faction];
  const baseIncome = playerTiles(room, player.id)
    .reduce((sum, tile) => sum + tile.yield * tile.level, 0);
  const income = Math.round(baseIncome * (faction?.incomeModifier || 1));
  if (income <= 0) {
    return;
  }
  player.influence += income;
  addLog(room, `${player.name} 的领地提供 ${income} 影响力`, 'income');
}

function drawWarpEvent(room, player) {
  const roll = randomInt(6);
  const chaosBonus = player.faction === 'chaos';
  if (roll === 0) {
    const amount = chaosBonus ? 95 : 70;
    player.influence += amount;
    return {
      title: '亚空间顺流',
      text: `${player.name} 获得 ${amount} 影响力。`,
      tone: 'good',
    };
  }
  if (roll === 1) {
    const loss = chaosBonus ? 25 : 55;
    player.influence = Math.max(0, player.influence - loss);
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
    const amount = chaosBonus ? 80 : 42;
    player.influence += amount;
    addDoom(room, 1, '混沌馈赠撕裂现实');
    return {
      title: '混沌馈赠',
      text: `${player.name} 获得 ${amount} 影响力，但亚空间压力上升。`,
      tone: 'warp',
    };
  }
  const loss = chaosBonus ? 20 : 45;
  player.influence = Math.max(0, player.influence - loss);
  addDoom(room, 1, '灵能尖啸穿透盖勒场');
  return {
    title: '灵能尖啸',
    text: `${player.name} 损失 ${loss} 影响力，亚空间压力上升。`,
    tone: 'warp',
  };
}

function resolveLanding(room, player) {
  const tile = room.tiles[player.position];
  room.lastEvent = null;

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
    const bonus = player.faction === 'aeldari' ? 1 : 0;
    player.influence += 45;
    player.bonusDominion += bonus;
    room.lastEvent = {
      title: '网道捷径',
      text: bonus
        ? `${player.name} 穿过网道，获得 45 影响力和 1 统治点。`
        : `${player.name} 穿过网道，获得 45 影响力。`,
      tone: 'good',
    };
    room.turnStage = 'end';
    checkVictory(room, player, '网道奇袭');
    return;
  }

  if (tile.type === 'tomb') {
    player.influence = Math.max(0, player.influence - 35);
    addDoom(room, 1, '墓穴世界苏醒');
    room.turnStage = 'end';
    room.lastEvent = {
      title: '墓穴苏醒',
      text: `${player.name} 损失 35 影响力，远古军团开始活动。`,
      tone: 'danger',
    };
    return;
  }

  if (tile.type === 'maiden') {
    const loss = player.faction === 'aeldari' ? 15 : 40;
    player.influence = Math.max(0, player.influence - loss);
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

  const owner = room.players.find((item) => item.id === tile.ownerId);
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
  if (room.turnIndex <= previousIndex) {
    room.round += 1;
    processTileRecovery(room);
  }
  room.turnStage = 'roll';
  room.dice = [];
  room.diceMode = 'd12';
  room.lastMove = null;
  room.lastEvent = null;
  const next = currentPlayer(room);
  if (!next) {
    return;
  }
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

function performAction(room, player, input) {
  const type = String(input.type || '').toLowerCase();

  if (type === 'roll') {
    ensureCurrentTurn(room, player, 'roll');
    const distance = randomInt(12) + 1;
    const previous = player.position;
    player.position = (player.position + distance) % room.tiles.length;
    room.dice = [distance];
    room.diceMode = 'd12';
    room.lastMove = {
      id: randomId(5),
      playerId: player.id,
      from: previous,
      to: player.position,
      distance,
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
    if (player.influence < tile.cost) {
      const error = new Error('影响力不足');
      error.statusCode = 409;
      throw error;
    }
    player.influence -= tile.cost;
    tile.ownerId = player.id;
    tile.level = 1;
    room.turnStage = 'end';
    addLog(room, `${player.name} 占领 ${tile.name}`, 'claim');
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
    const cost = upgradeCost(tile);
    if (player.influence < cost) {
      const error = new Error('影响力不足');
      error.statusCode = 409;
      throw error;
    }
    player.influence -= cost;
    tile.level += 1;
    room.turnStage = 'end';
    addLog(room, `${player.name} 将 ${tile.name} 升级到 ${tile.level} 级`, 'build');
    checkVictory(room, player, '完成星区要塞化');
    touchRoom(room);
    return;
  }

  if (type === 'tithe') {
    ensureCurrentTurn(room, player, 'landing');
    const tile = room.tiles[player.position];
    const owner = room.players.find((item) => item.id === tile.ownerId);
    if (!owner || owner.id === player.id) {
      const error = new Error('当前不需要缴税');
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
    addLog(room, `${player.name} 向 ${owner.name} 支付 ${cost} 影响力`, 'tithe');
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
    const defender = room.players.find((item) => item.id === tile.ownerId);
    if (!defender || defender.id === player.id) {
      const error = new Error('当前无法发动入侵');
      error.statusCode = 409;
      throw error;
    }
    const attackerRoll = randomInt(6) + 1 + (FACTIONS[player.faction]?.invasionBonus || 0);
    const defenderRoll = randomInt(6) + 1 + tile.level;
    room.dice = [attackerRoll, defenderRoll];
    room.diceMode = 'battle';
    resolveInvasion(room, player, defender, tile, attackerRoll, defenderRoll);
    touchRoom(room);
    return;
  }

  if (type === 'end') {
    ensureCurrentTurn(room, player);
    if (!['claim', 'upgrade', 'end'].includes(room.turnStage)) {
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
  for (const player of room.players) {
    const faction = FACTIONS[player.faction];
    player.influence = faction.startInfluence;
    player.bonusDominion = 0;
    player.position = 0;
    player.ready = false;
  }
  room.tiles = createBoard();
  room.phase = 'playing';
  room.round = 1;
  room.turnIndex = 0;
  room.turnStage = 'roll';
  room.doom = 0;
  room.doomMilestones = new Set();
  room.dice = [];
  room.diceMode = 'd12';
  room.lastMove = null;
  room.lastEvent = {
    title: '远征开始',
    text: '战争领主们从风暴枢纽出发。',
    tone: 'neutral',
  };
  room.result = null;
  addLog(room, '远征开始，风暴枢纽启动', 'round');
}

function restartRoom(room) {
  room.phase = 'lobby';
  room.tiles = createBoard();
  room.turnIndex = -1;
  room.turnStage = 'idle';
  room.round = 0;
  room.doom = 0;
  room.doomMilestones = new Set();
  room.dice = [];
  room.diceMode = 'd12';
  room.lastMove = null;
  room.lastEvent = null;
  room.result = null;
  for (const player of room.players) {
    player.influence = 0;
    player.bonusDominion = 0;
    player.position = 0;
    player.ready = false;
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
      text: `${defender.name} 以 ${defenderRoll}:${attackerRoll} 守住 ${tile.name}。${player.name} 损失 ${loss} 战争物资，并支付 ${reparations} 赔款。`,
      tone: 'danger',
    };
    addLog(room, room.lastEvent.text, 'invasion');
    return;
  }

  if (defenderRoll === attackerRoll) {
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
      text: `${player.name} 与 ${defender.name} 以 ${attackerRoll}:${defenderRoll} 僵持。双方各损失 ${attackerLoss} 与 ${defenderLoss} 战争物资，${tile.name} 降为 ${tile.level} 级。`,
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
    text: `${player.name} 以 ${attackerRoll}:${defenderRoll} 夺取 ${tile.name}，世界降为 ${tile.level} 级。`,
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
    /^\/api\/rooms\/([A-Z0-9]{4,6})(?:\/(events|state|ready|faction|start|action|restart|leave))?$/i,
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
      }
    }
  }, 60000);
  timer.unref?.();
}

if (require.main === module) {
  startMaintenance();
  startGameServer();
}

module.exports = {
  BOARD_DEFINITIONS,
  DOMINION_TARGET,
  TILE_TYPES,
  createGameServer,
  createRoom,
  dominionFor,
  performAction,
  processTileRecovery,
  resolveLanding,
  resolveInvasion,
  startGameServer,
};
