'use strict';

const SESSION_KEY = 'warp-tithe-session-v1';
const GALAXY_EDGE_LENGTH = 8;

const elements = {
  landingView: document.querySelector('#landingView'),
  gameView: document.querySelector('#gameView'),
  createForm: document.querySelector('#createForm'),
  joinForm: document.querySelector('#joinForm'),
  createName: document.querySelector('#createName'),
  joinName: document.querySelector('#joinName'),
  roomCode: document.querySelector('#roomCode'),
  landingMessage: document.querySelector('#landingMessage'),
  roomCodeLabel: document.querySelector('#roomCodeLabel'),
  copyRoomButton: document.querySelector('#copyRoomButton'),
  connectionStatus: document.querySelector('#connectionStatus'),
  leaveButton: document.querySelector('#leaveButton'),
  phaseLabel: document.querySelector('#phaseLabel'),
  roundValue: document.querySelector('#roundValue'),
  doomValue: document.querySelector('#doomValue'),
  doomEffect8: document.querySelector('#doomEffect8'),
  doomEffect16: document.querySelector('#doomEffect16'),
  doomEffect24: document.querySelector('#doomEffect24'),
  doomEffect32: document.querySelector('#doomEffect32'),
  doomEffect40: document.querySelector('#doomEffect40'),
  targetValue: document.querySelector('#targetValue'),
  board: document.querySelector('#board'),
  planetInfoPanel: document.querySelector('#planetInfoPanel'),
  planetInfoName: document.querySelector('#planetInfoName'),
  planetInfoGalaxy: document.querySelector('#planetInfoGalaxy'),
  planetInfoGlyph: document.querySelector('#planetInfoGlyph'),
  planetInfoType: document.querySelector('#planetInfoType'),
  planetInfoDescription: document.querySelector('#planetInfoDescription'),
  planetInfoStats: document.querySelector('#planetInfoStats'),
  commanderName: document.querySelector('#commanderName'),
  commanderFaction: document.querySelector('#commanderFaction'),
  inventoryList: document.querySelector('#inventoryList'),
  skillPanel: document.querySelector('#skillPanel'),
  skillCooldown: document.querySelector('#skillCooldown'),
  skillName: document.querySelector('#skillName'),
  skillDescription: document.querySelector('#skillDescription'),
  skillTargets: document.querySelector('#skillTargets'),
  influenceValue: document.querySelector('#influenceValue'),
  dominionValue: document.querySelector('#dominionValue'),
  holdingValue: document.querySelector('#holdingValue'),
  lobbyControls: document.querySelector('#lobbyControls'),
  factionGrid: document.querySelector('#factionGrid'),
  readyButton: document.querySelector('#readyButton'),
  startButton: document.querySelector('#startButton'),
  addBotButton: document.querySelector('#addBotButton'),
  lobbyHint: document.querySelector('#lobbyHint'),
  playControls: document.querySelector('#playControls'),
  turnBanner: document.querySelector('#turnBanner'),
  turnKicker: document.querySelector('#turnKicker'),
  turnTitle: document.querySelector('#turnTitle'),
  diceTray: document.querySelector('#diceTray'),
  eventText: document.querySelector('#eventText'),
  invasionPreview: document.querySelector('#invasionPreview'),
  invasionFailureLoss: document.querySelector('#invasionFailureLoss'),
  invasionDrawLoss: document.querySelector('#invasionDrawLoss'),
  invasionBreakdown: document.querySelector('#invasionBreakdown'),
  rollButton: document.querySelector('#rollButton'),
  claimButton: document.querySelector('#claimButton'),
  upgradeButton: document.querySelector('#upgradeButton'),
  titheButton: document.querySelector('#titheButton'),
  invadeButton: document.querySelector('#invadeButton'),
  teleportButton: document.querySelector('#teleportButton'),
  endButton: document.querySelector('#endButton'),
  shopPanel: document.querySelector('#shopPanel'),
  shopTitle: document.querySelector('#shopTitle'),
  shopModeLabel: document.querySelector('#shopModeLabel'),
  shopItems: document.querySelector('#shopItems'),
  shopHint: document.querySelector('#shopHint'),
  resultControls: document.querySelector('#resultControls'),
  resultTitle: document.querySelector('#resultTitle'),
  resultDetail: document.querySelector('#resultDetail'),
  restartButton: document.querySelector('#restartButton'),
  playerCount: document.querySelector('#playerCount'),
  playerList: document.querySelector('#playerList'),
  logList: document.querySelector('#logList'),
  toast: document.querySelector('#toast'),
};

let session = null;
let gameState = null;
let pollTimer = null;
let renderScheduled = false;
let toastTimer = null;
let selectedTileId = null;
let selectedTeleportUnitId = null;
let hasRenderedState = false;
let activeMovementId = null;
let boardRenderDeferred = false;

function makeElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== '') {
    element.textContent = text;
  }
  return element;
}

function makeSvgElement(tag, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (value?.roomCode && value?.token && value?.playerId) {
      return value;
    }
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
  return null;
}

function saveSession(value) {
  session = value;
  localStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({
    ok: false,
    error: '服务器返回了无法识别的内容',
  }));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || '请求失败');
  }
  return payload;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2800);
}

function setLandingMessage(message) {
  elements.landingMessage.textContent = message;
}

function setConnection(state, label) {
  elements.connectionStatus.dataset.state = state;
  elements.connectionStatus.querySelector('span:last-child').textContent = label;
}

function showGame() {
  elements.landingView.hidden = true;
  elements.gameView.hidden = false;
}

function showLanding() {
  elements.gameView.hidden = true;
  elements.landingView.hidden = false;
  elements.landingMessage.textContent = '';
}

function closeEvents() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

function connectEvents() {
  if (!session) {
    return;
  }
  closeEvents();
  setConnection('connecting', '连接中');
  let stopped = false;

  const poll = async () => {
    if (stopped) {
      return;
    }
    try {
      const payload = await api(
        `/api/rooms/${session.roomCode}/state?token=${encodeURIComponent(session.token)}`,
      );
      gameState = payload.state;
      setConnection('online', '在线');
      scheduleRender();
    } catch (error) {
      setConnection('offline', '重连中');
      if (error.message?.includes('身份凭证')) {
        stopped = true;
        closeEvents();
      }
    } finally {
      if (!stopped) {
        pollTimer = setTimeout(poll, 1200);
      }
    }
  };

  poll();
}

function scheduleRender() {
  if (renderScheduled) {
    return;
  }
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

async function enterRoom(roomCode, playerId, token, name) {
  saveSession({ roomCode, playerId, token, name });
  elements.roomCodeLabel.textContent = roomCode;
  selectedTileId = null;
  showGame();
  setConnection('connecting', '连接中');
  try {
    const payload = await api(
      `/api/rooms/${roomCode}/state?token=${encodeURIComponent(token)}`,
    );
    gameState = payload.state;
    setConnection('online', '在线');
    render();
  } catch (error) {
    showToast(error.message);
  }
  connectEvents();
}

async function restoreSession() {
  const saved = readSession();
  if (!saved) {
    return;
  }
  session = saved;
  elements.roomCodeLabel.textContent = saved.roomCode;
  showGame();
  try {
    const payload = await api(
      `/api/rooms/${saved.roomCode}/state?token=${encodeURIComponent(saved.token)}`,
    );
    gameState = payload.state;
    setConnection('online', '在线');
    render();
    connectEvents();
  } catch (error) {
    clearSession();
    showLanding();
    setLandingMessage(error.message);
  }
}

async function createRoom(event) {
  event.preventDefault();
  setLandingMessage('');
  const name = elements.createName.value.trim();
  if (!name) {
    setLandingMessage('请输入战争领主名称');
    return;
  }
  try {
    const payload = await api('/api/rooms', { method: 'POST', body: { name } });
    elements.createName.value = '';
    await enterRoom(payload.roomCode, payload.playerId, payload.token, payload.name);
  } catch (error) {
    setLandingMessage(error.message);
  }
}

async function joinRoom(event) {
  event.preventDefault();
  setLandingMessage('');
  const name = elements.joinName.value.trim();
  const roomCode = elements.roomCode.value.trim().toUpperCase();
  if (!name || !roomCode) {
    setLandingMessage('请输入名称和房间代码');
    return;
  }
  try {
    const payload = await api('/api/rooms/join', {
      method: 'POST',
      body: { name, roomCode },
    });
    elements.joinName.value = '';
    elements.roomCode.value = '';
    await enterRoom(payload.roomCode, payload.playerId, payload.token, payload.name);
    if (payload.reconnected) {
      showToast('已恢复此前的战区席位');
    }
  } catch (error) {
    setLandingMessage(error.message);
  }
}

async function sendReady(ready) {
  if (!session) {
    return;
  }
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/ready`, {
      method: 'POST',
      body: { token: session.token, ready },
    });
    gameState = payload.state;
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function chooseFaction(faction) {
  if (!session) {
    return;
  }
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/faction`, {
      method: 'POST',
      body: { token: session.token, faction },
    });
    gameState = payload.state;
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function addBot() {
  if (!session) {
    return;
  }
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/addbot`, {
      method: 'POST',
      body: { token: session.token },
    });
    gameState = payload.state;
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function removeBot(playerId) {
  if (!session) {
    return;
  }
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/removebot`, {
      method: 'POST',
      body: { token: session.token, playerId },
    });
    gameState = payload.state;
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function startGame() {
  if (!session) {
    return;
  }
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/start`, {
      method: 'POST',
      body: { token: session.token },
    });
    gameState = payload.state;
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function sendAction(type, extra = {}) {
  if (!session) {
    return;
  }
  selectedTeleportUnitId = null;
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/action`, {
      method: 'POST',
      body: { token: session.token, type, ...extra },
    });
    gameState = payload.state;
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function restartGame() {
  if (!session) {
    return;
  }
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/restart`, {
      method: 'POST',
      body: { token: session.token },
    });
    gameState = payload.state;
    selectedTileId = null;
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function leaveRoom() {
  if (!session) {
    showLanding();
    return;
  }
  try {
    await api(`/api/rooms/${session.roomCode}/leave`, {
      method: 'POST',
      body: { token: session.token },
    });
    closeEvents();
    clearSession();
    gameState = null;
    showLanding();
  } catch (error) {
    showToast(error.message);
  }
}

async function copyRoomCode() {
  if (!session) {
    return;
  }
  try {
    await navigator.clipboard.writeText(session.roomCode);
    showToast(`房间代码 ${session.roomCode} 已复制`);
  } catch {
    showToast(`房间代码：${session.roomCode}`);
  }
}

const MOBILE_GALAXIES = {
  solar: {
    center: { x: 50, y: 13 },
    vertices: {
      apex: { x: 50, y: 2 },
      left: { x: 7, y: 24 },
      right: { x: 93, y: 24 },
    },
  },
  alpha: {
    center: { x: 50, y: 40 },
    vertices: {
      apex: { x: 50, y: 29 },
      left: { x: 7, y: 51 },
      right: { x: 93, y: 51 },
    },
  },
  gamma: {
    center: { x: 50, y: 67 },
    vertices: {
      apex: { x: 50, y: 56 },
      left: { x: 7, y: 78 },
      right: { x: 93, y: 78 },
    },
  },
};

function usesMobileBoardLayout() {
  return window.matchMedia('(max-width: 700px)').matches;
}

function galaxyLayout(galaxy, galaxies) {
  if (usesMobileBoardLayout()) {
    return MOBILE_GALAXIES[galaxy.key] || galaxy;
  }
  return galaxies.find((item) => item.key === galaxy.key) || galaxy;
}

function galaxyTilePosition(tile, galaxies) {
  const sourceGalaxy = galaxies.find((item) => item.key === tile.galaxy);
  const galaxy = sourceGalaxy
    ? galaxyLayout(sourceGalaxy, galaxies)
    : null;
  if (!galaxy) {
    return { x: 50, y: 50 };
  }
  const { apex, left, right } = galaxy.vertices;
  let start = apex;
  let end = left;
  let progress = tile.localIndex / GALAXY_EDGE_LENGTH;

  if (tile.localIndex > GALAXY_EDGE_LENGTH && tile.localIndex <= (GALAXY_EDGE_LENGTH * 2)) {
    start = left;
    end = right;
    progress = (tile.localIndex - GALAXY_EDGE_LENGTH) / GALAXY_EDGE_LENGTH;
  } else if (tile.localIndex > (GALAXY_EDGE_LENGTH * 2)) {
    start = right;
    end = apex;
    progress = (tile.localIndex - (GALAXY_EDGE_LENGTH * 2)) / GALAXY_EDGE_LENGTH;
  }

  return {
    x: start.x + ((end.x - start.x) * progress),
    y: start.y + ((end.y - start.y) * progress),
  };
}

function tileMeta(tile) {
  if (tile.slaaneshCorrupted) {
    return '色孽侵蚀';
  }
  if (tile.type === 'shop') {
    return tile.shopMode === 'warp'
      ? '随机传送'
      : `商店 · ${tile.shopItems?.length || 0} 件`;
  }
  if (tile.type === 'vertex') {
    return tile.teleportTarget
      ? `跃迁 · ${tile.teleportTarget.galaxyName}`
      : '星门';
  }
  if (tile.type === 'anchor') {
    return '特殊信标';
  }
  if (!tile.claimable) {
    return tile.typeLabel;
  }
  if (!tile.owner) {
    return `占领 ${tile.cost}`;
  }
  if (tile.owner.isNurgle) {
    return `纳垢领地 / ${tile.level} 级`;
  }
  if (tile.restoreAtRound) {
    return `${tile.level} 级 / 重建中`;
  }
  return `${tile.level} 级 / 税 ${tile.tribute}`;
}

function tileDescription(tile) {
  if (tile.slaaneshCorrupted) {
    return '色孽的欢愉洪流侵蚀了这颗星球，原本效果已经失效；踏入此地的战争领主会被幻象禁锢两个回合。';
  }
  const descriptions = {
    shop: '星际商人设立的贸易节点，可以消耗影响力购买道具。后期亚空间事件可能令此处坍缩为随机传送点。',
    hive: '人口密集的巢都世界，拥有稳定的工业产出和大量征募人口。',
    forge: '机械教控制的铸造世界，拥有高价值和坚固的工业体系。',
    shrine: '信仰汇聚的圣祠世界，适合建立稳定的统治据点。',
    death: '环境极端危险的死亡世界，占领难度较低，但战略收益有限。',
    maiden: '脆弱的处女世界，亚空间与灵族势力在此留下强烈回响。',
    tomb: '沉睡的异形墓穴，远古机械军团可能随时苏醒。',
    relic: '散落着远古遗物的区域，可能带来额外统治点或资源。',
    webway: '连接星系的网道节点，穿越后可获得额外影响力。',
    warp: '现实与亚空间交叠的危险区域，可能触发跨星系传送或混沌事件。',
    vertex: '连接两座星系的跃迁顶点，可以传送到对应星门，也可以留在原地。',
  };
  return descriptions[tile.type] || '未知星区档案。';
}

function renderPlanetInfo(state) {
  const selectedTile = selectedTileId === null
    ? state.board.find((tile) => (
      tile.id === state.players.find((player) => player.id === state.you.id)?.position
    ))
    : state.board.find((tile) => tile.id === selectedTileId);

  if (!selectedTile) {
    elements.planetInfoName.textContent = '选择一颗星球';
    elements.planetInfoGalaxy.textContent = '星区';
    elements.planetInfoGlyph.textContent = '?';
    elements.planetInfoType.textContent = '未知区域';
    elements.planetInfoDescription.textContent = '点击棋盘上的星球查看详细信息。';
    elements.planetInfoStats.replaceChildren();
    return;
  }

  elements.planetInfoName.textContent = selectedTile.name;
  elements.planetInfoPanel.style.setProperty('--planet-color', selectedTile.color);
  elements.planetInfoGalaxy.textContent = selectedTile.galaxyName;
  elements.planetInfoGalaxy.style.setProperty('--galaxy-color', selectedTile.galaxyColor);
  elements.planetInfoGlyph.textContent = selectedTile.glyph;
  elements.planetInfoGlyph.style.setProperty('--planet-color', selectedTile.color);
  elements.planetInfoType.textContent = selectedTile.typeLabel;
  elements.planetInfoDescription.textContent = tileDescription(selectedTile);
  elements.planetInfoStats.replaceChildren();

  const stats = [
    ['控制方', selectedTile.slaaneshCorrupted ? '色孽侵蚀' : (selectedTile.owner ? selectedTile.owner.name : (selectedTile.type === 'vertex' ? '跃迁节点' : selectedTile.type === 'shop' ? (selectedTile.shopMode === 'warp' ? '坍缩传送点' : '星际商店') : '无主'))],
    ['领地等级', selectedTile.claimable ? `${selectedTile.level || 0} / 3` : '不可占领'],
    ['占领费用', selectedTile.owner || !selectedTile.claimable ? '已处理' : String(selectedTile.cost)],
    ['什一税', selectedTile.owner?.isNurgle ? '不可缴纳' : (selectedTile.owner ? String(selectedTile.tribute) : '无')],
    ['统治价值', String(selectedTile.value || 0)],
  ];
  if (selectedTile.slaaneshCorrupted) {
    stats.push(['当前状态', '原本效果失效 · 禁锢 2 回合']);
  } else if (selectedTile.type === 'shop') {
    stats.push([
      selectedTile.shopMode === 'warp' ? '当前状态' : '在售商品',
      selectedTile.shopMode === 'warp' ? '随机传送点' : `${selectedTile.shopItems?.length || 0} 件`,
    ]);
  }
  if (selectedTile.teleportTarget) {
    stats.push(['跃迁目标', `${selectedTile.teleportTarget.galaxyName} · ${selectedTile.teleportTarget.name}`]);
  }

  for (const [label, value] of stats) {
    const item = makeElement('div', 'planet-stat');
    item.append(
      makeElement('span', '', label),
      makeElement('strong', '', value),
    );
    elements.planetInfoStats.append(item);
  }
}

function renderBoard(state) {
  elements.board.replaceChildren();
  const playerTurn = state.room.turnPlayerId;
  const routeMap = makeSvgElement('svg', {
    class: 'route-map',
    viewBox: '0 0 100 100',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  for (const galaxy of state.galaxies) {
    const tiles = state.board
      .filter((tile) => tile.galaxy === galaxy.key)
      .sort((left, right) => left.localIndex - right.localIndex);
    const points = tiles.map((tile) => {
      const position = galaxyTilePosition(tile, state.galaxies);
      return `${position.x},${position.y}`;
    });
    points.push(points[0]);
    const glow = makeSvgElement('polyline', {
      class: 'route-glow',
      points: points.join(' '),
      'vector-effect': 'non-scaling-stroke',
    });
    const line = makeSvgElement('polyline', {
      class: 'route-line',
      points: points.join(' '),
      'vector-effect': 'non-scaling-stroke',
    });
    line.style.setProperty('--route-color', galaxy.color);
    glow.style.setProperty('--route-color', galaxy.color);
    routeMap.append(glow, line);
  }

  const teleportTiles = state.board.filter((tile) => (
    tile.teleportTarget && tile.id < tile.teleportTarget.id
  ));
  for (const tile of teleportTiles) {
    const start = galaxyTilePosition(tile, state.galaxies);
    const target = state.board.find((item) => item.id === tile.teleportTarget.id);
    const end = galaxyTilePosition(target, state.galaxies);
    routeMap.append(makeSvgElement('line', {
      class: 'teleport-line',
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      'vector-effect': 'non-scaling-stroke',
    }));
  }
  elements.board.append(routeMap);

  for (const galaxy of state.galaxies) {
    const layout = galaxyLayout(galaxy, state.galaxies);
    const label = makeElement('div', 'galaxy-label', galaxy.name);
    label.style.left = `${layout.center.x}%`;
    label.style.top = `${layout.center.y}%`;
    label.style.setProperty('--galaxy-color', galaxy.color);
    elements.board.append(label);
  }

  state.board.forEach((tile) => {
    const position = galaxyTilePosition(tile, state.galaxies);
    const element = makeElement('button', `tile tile-${tile.type}`);
    element.type = 'button';
    element.classList.add(`planet-${tile.type}`);
    if (tile.visual) {
      element.classList.add(`planet-${tile.visual}`);
    }
    if (tile.type === 'vertex') {
      element.classList.add('is-vertex');
    }
    if (tile.type === 'anchor') {
      element.classList.add('is-anchor');
    }
    if (tile.type === 'shop' && tile.shopMode === 'warp') {
      element.classList.add('is-shop-warped');
    }
    if (tile.slaaneshCorrupted) {
      element.classList.add('is-slaanesh-corrupted');
    }
    element.style.left = `${position.x}%`;
    element.style.top = `${position.y}%`;
    element.style.setProperty('--planet-color', tile.color);
    element.style.setProperty('--type-color', tile.color);
    element.dataset.tileId = String(tile.id);
    element.setAttribute(
      'aria-label',
      `${tile.name}，${tile.typeLabel}，${tile.owner ? `${tile.owner.name}控制` : '未占领'}`,
    );

    if (tile.owner) {
      element.classList.add('is-owned');
      element.style.setProperty('--owner-color', tile.owner.color);
      if (tile.owner.isNurgle) {
        element.classList.add('is-nurgle-owned');
      }
    }
    if (selectedTileId === tile.id) {
      element.classList.add('is-selected');
    }

    const top = makeElement('div', 'tile-top');
    const glyph = makeElement('span', 'tile-glyph', tile.glyph);
    const kind = makeElement('span', 'tile-kind', tile.typeLabel);
    top.append(glyph, kind);

    const name = makeElement('strong', 'tile-name', tile.name);
    const meta = makeElement('span', 'tile-meta', tileMeta(tile));
    const planet = makeElement('span', 'planet-body');
    const atmosphere = makeElement('span', 'planet-atmosphere');
    const tokenRow = makeElement('div', 'token-row');
    for (const player of state.players.filter((item) => item.position === tile.id)) {
      const token = makeElement('span', 'player-token', player.name.slice(0, 1));
      token.dataset.playerId = player.id;
      token.style.setProperty('--token-color', player.color);
      if (player.id === playerTurn) {
        token.classList.add('is-turn');
      }
      token.title = player.name;
      tokenRow.append(token);
    }
    if (state.room.nurgle?.active && state.room.nurgle.position === tile.id) {
      const nurgleToken = makeElement('span', 'player-token nurgle-token', 'N');
      nurgleToken.title = `纳垢：剩余 ${state.room.nurgle.roundsRemaining} 回合`;
      tokenRow.append(nurgleToken);
    }

    element.append(planet, atmosphere, top, name, meta, tokenRow);
    element.addEventListener('click', () => {
      if (selectedTeleportUnitId) {
        sendAction('item', {
          itemId: 'teleport',
          targetPlayerId: selectedTeleportUnitId,
          destinationTileId: tile.id,
        });
        selectedTeleportUnitId = null;
        return;
      }
      selectedTileId = selectedTileId === tile.id ? null : tile.id;
      render();
    });
    elements.board.append(element);
  });

  const center = makeElement('div', 'board-center');
  const selectedTile = selectedTileId === null
    ? null
    : state.board.find((tile) => tile.id === selectedTileId);
  const centerLabel = makeElement(
    'span',
    'center-label',
    selectedTile ? '战区情报' : '三星系战区',
  );
  const centerTitle = makeElement(
    'h2',
    'center-title',
    selectedTile ? selectedTile.name : (state.lastEvent?.title || '远征待命'),
  );
  const centerCopy = makeElement(
    'p',
    'center-copy',
    selectedTile
      ? [
        `${selectedTile.typeLabel}区域`,
        selectedTile.owner ? `${selectedTile.owner.name}控制` : '尚无领主',
        selectedTile.level ? `${selectedTile.level}级领地` : `占领成本 ${selectedTile.cost || 0}`,
        selectedTile.tribute ? `什一税 ${selectedTile.tribute}` : '特殊区域',
      ].join(' / ')
      : (state.lastEvent?.text || '从风暴枢纽开始，争夺整个星区。'),
  );
  const centerRule = makeElement('div', 'center-rule');
  const current = state.players.find((player) => player.id === playerTurn);
  const turnText = current ? `当前行动：${current.name}` : '等待远征开始';
  const doomPercent = Math.round((state.room.doom / state.room.maxDoom) * 100);
  const doomLine = makeElement('div', 'doom-line');
  const doomFill = makeElement('span');
  doomFill.style.width = `${Math.min(100, doomPercent)}%`;
  doomLine.append(doomFill);

  centerRule.append(
    makeElement('span', 'center-turn', turnText),
    dooomStatus(state),
    doomLine,
  );
  center.append(centerLabel, centerTitle, centerCopy, centerRule);
  elements.board.append(center);
}

function dooomStatus(state) {
  if (state.room.doom >= 40) {
    return makeElement('span', 'doom-status danger', '大裂痕降临');
  }
  if (state.room.doom >= 32) {
    return makeElement('span', 'doom-status danger', '纳垢降临');
  }
  if (state.room.doom >= 24) {
    return makeElement('span', 'doom-status danger', '奸奇之谋');
  }
  if (state.room.doom >= 16) {
    return makeElement('span', 'doom-status danger', '色孽之祸');
  }
  if (state.room.doom >= 8) {
    return makeElement('span', 'doom-status warning', '恐虐狂潮');
  }
  return makeElement('span', 'doom-status calm', '盖勒场稳定');
}

function renderFactionGrid(state) {
  elements.factionGrid.replaceChildren();
  for (const faction of state.factions) {
    const button = makeElement('button', 'faction-option');
    button.type = 'button';
    button.style.setProperty('--faction-color', faction.color);
    const isMine = state.you.faction === faction.key;
    const occupiedByOther = faction.chosenBy && !isMine;
    button.classList.toggle('is-selected', isMine);
    button.disabled = Boolean(occupiedByOther);

    const title = makeElement('strong', '', faction.shortName);
    const passive = makeElement('span', '', faction.passive);
    const stateText = makeElement(
      'small',
      '',
      occupiedByOther ? `由 ${faction.chosenBy} 使用` : '可用',
    );
    button.append(title, passive, stateText);
    button.addEventListener('click', () => chooseFaction(faction.key));
    elements.factionGrid.append(button);
  }
}

function renderHeader(state) {
  const phaseNames = {
    lobby: '远征准备',
    playing: `第 ${state.room.round} 轮`,
    settled: '远征结束',
  };
  elements.phaseLabel.textContent = phaseNames[state.room.phase] || '战区';
  elements.roomCodeLabel.textContent = state.room.code;
  elements.roundValue.textContent = String(state.room.round);
  elements.doomValue.textContent = `${state.room.doom} / ${state.room.maxDoom}`;
  elements.doomEffect8.classList.toggle('is-active', state.room.doom >= 8);
  elements.doomEffect16.classList.toggle('is-active', state.room.doom >= 16);
  elements.doomEffect24.classList.toggle('is-active', state.room.doom >= 24);
  elements.doomEffect32.classList.toggle('is-active', state.room.doom >= 32);
  elements.doomEffect40.classList.toggle('is-active', state.room.doom >= 40);
  elements.targetValue.textContent = String(state.room.dominionTarget);
}

function renderCommander(state) {
  const me = state.you;
  elements.commanderName.textContent = me.name;
  elements.commanderFaction.textContent = me.factionShortName;
  elements.commanderFaction.style.setProperty('--faction-color', me.color);
  elements.influenceValue.textContent = String(me.influence);
  elements.dominionValue.textContent = String(me.dominion);
  elements.holdingValue.textContent = String(me.holdings);
  renderInventory(state);
  renderSkill(state);
}

function renderInventory(state) {
  elements.inventoryList.replaceChildren();
  const items = state.you.items || [];
  if (items.length === 0) {
    elements.inventoryList.append(
      makeElement('span', 'inventory-empty', '暂无道具'),
    );
    return;
  }

  const grouped = new Map();
  for (const item of items) {
    const current = grouped.get(item.id) || { item, count: 0 };
    current.count += 1;
    grouped.set(item.id, current);
  }
  const actions = new Map(
    (state.you.legalActions.itemActions || []).map((item) => [item.id, item]),
  );

  for (const { item, count } of grouped.values()) {
    const card = makeElement('article', 'inventory-item');
    const header = makeElement('div', 'inventory-item-head');
    header.append(
      makeElement('strong', '', item.name),
      makeElement('span', '', count > 1 ? `×${count}` : `${item.price}`),
    );
    card.append(
      header,
      makeElement('p', '', item.description || '暂无说明'),
    );

    const action = actions.get(item.id);
    if (!action) {
      card.append(makeElement('small', 'item-status', '等待你的行动阶段。'));
      elements.inventoryList.append(card);
      continue;
    }
    if (!action.canUse) {
      card.append(makeElement('small', 'item-status', action.reason || '当前无法使用。'));
      elements.inventoryList.append(card);
      continue;
    }

    const targetBox = makeElement('div', 'item-targets');
    const sendItem = (payload = {}) => {
      sendAction('item', { itemId: item.id, ...payload });
      selectedTeleportUnitId = null;
    };

    if (item.targetMode === 'none') {
      const button = makeElement('button', 'item-use-button', '使用道具');
      button.type = 'button';
      button.addEventListener('click', () => sendItem());
      targetBox.append(button);
    } else if (item.targetMode === 'rollValue') {
      const diceGrid = makeElement('div', 'item-dice-grid');
      for (const choice of action.targets) {
        const button = makeElement('button', 'item-dice-button', choice.label);
        button.type = 'button';
        button.addEventListener('click', () => sendItem({ value: choice.id }));
        diceGrid.append(button);
      }
      targetBox.append(diceGrid);
    } else if (item.targetMode === 'unitDestination') {
      const selected = action.targets.players.find(
        (target) => target.id === selectedTeleportUnitId,
      );
      if (!selected) {
        selectedTeleportUnitId = null;
        for (const target of action.targets.players) {
          const button = makeElement(
            'button',
            'item-target-button',
            `${target.name}${target.isSelf ? '（自己）' : ''} · 距离 ${target.distance}`,
          );
          button.type = 'button';
          button.addEventListener('click', () => {
            selectedTeleportUnitId = target.id;
            render();
          });
          targetBox.append(button);
        }
      } else {
        const clear = makeElement('button', 'item-back-button', '重新选择单位');
        clear.type = 'button';
        clear.addEventListener('click', () => {
          selectedTeleportUnitId = null;
          render();
        });
        targetBox.append(
          clear,
          makeElement('small', 'item-status', `已选择 ${selected.name}，点击地图上的任意星球完成传送。`),
        );
      }
    } else {
      const list = Array.isArray(action.targets) ? action.targets : [];
      for (const target of list) {
        const label = item.targetMode === 'ownTile'
          ? `${target.name} · ${target.level} 级`
          : `${target.name} · 距离 ${target.distance}`;
        const button = makeElement('button', 'item-target-button', label);
        button.type = 'button';
        button.addEventListener('click', () => {
          if (item.targetMode === 'ownTile') {
            sendItem({ targetTileId: target.id });
          } else {
            sendItem({ targetPlayerId: target.id });
          }
        });
        targetBox.append(button);
      }
    }
    card.append(targetBox);
    elements.inventoryList.append(card);
  }
}

function renderSkill(state) {
  const skill = state.you.skill;
  const actions = state.you.legalActions.skillAction;
  elements.skillTargets.replaceChildren();

  if (!skill) {
    elements.skillName.textContent = '开局随机抽取';
    elements.skillDescription.textContent = '远征开始后随机获得一项被动或主动技能。';
    elements.skillCooldown.textContent = '';
    return;
  }

  elements.skillName.textContent = skill.name;
  elements.skillDescription.textContent = skill.description;
  elements.skillCooldown.textContent = skill.type === 'passive'
    ? '被动'
    : skill.cooldownRemaining > 0
      ? `冷却 ${skill.cooldownRemaining} 回合`
      : '可使用';

  if (skill.type !== 'active') {
    return;
  }
  if (!actions?.canUse) {
    const note = makeElement('span', 'skill-status', '只能在自己的行动阶段使用。');
    elements.skillTargets.append(note);
    return;
  }

  const sendSkill = (payload = {}) => {
    sendAction('skill', { skillId: skill.id, ...payload });
  };

  if (skill.targetMode === 'none') {
    const useButton = makeElement(
      'button',
      'skill-use-button',
      state.room.shopMode === 'open' ? '远程打开商店' : '随机传送',
    );
    useButton.type = 'button';
    useButton.addEventListener('click', () => sendSkill());
    elements.skillTargets.append(useButton);
    return;
  }

  if (skill.targetMode === 'choice') {
    for (const choice of actions.targets) {
      const button = makeElement('button', 'skill-use-button', choice.label);
      button.type = 'button';
      button.addEventListener('click', () => sendSkill({ choice: choice.id }));
      elements.skillTargets.append(button);
    }
    return;
  }

  if (!actions.targets.length) {
    elements.skillTargets.append(
      makeElement('span', 'skill-status', '当前 8 格范围内没有可用目标。'),
    );
    return;
  }

  for (const target of actions.targets) {
    const button = makeElement('button', 'skill-target-button');
    button.type = 'button';
    const label = skill.targetMode === 'player'
      ? `${target.name} · 偷取 ${target.stealAmount}`
      : `${target.name} · ${target.ownerName} · ${target.level} 级`;
    button.append(
      makeElement('strong', '', label),
      makeElement('small', '', `距离 ${target.distance} 格`),
    );
    button.addEventListener('click', () => {
      if (skill.targetMode === 'player') {
        sendSkill({ targetPlayerId: target.id });
      } else {
        sendSkill({ targetTileId: target.id });
      }
    });
    elements.skillTargets.append(button);
  }
}

function renderLobbyControls(state) {
  const isLobby = state.room.phase === 'lobby';
  elements.lobbyControls.hidden = !isLobby;
  elements.playControls.hidden = isLobby || state.room.phase === 'settled';
  elements.resultControls.hidden = state.room.phase !== 'settled';
  if (!isLobby) {
    return;
  }

  renderFactionGrid(state);
  const actions = state.you.legalActions;
  const readyCount = state.players.filter((player) => player.ready).length;
  elements.readyButton.textContent = state.you.ready ? '取消准备' : '准备';
  elements.readyButton.disabled = !actions.canReady;
  elements.readyButton.classList.toggle('is-ready', state.you.ready);
  elements.startButton.hidden = !state.you.isHost;
  elements.startButton.disabled = !actions.canStart;
  const botCount = state.players.filter((player) => player.isBot).length;
  elements.addBotButton.hidden = !state.you.isHost;
  elements.addBotButton.disabled = state.players.length >= state.room.maxPlayers;
  elements.addBotButton.textContent = `添加 AI（${botCount}）`;
  elements.lobbyHint.textContent = state.players.length < 2
    ? '至少需要两名战争领主'
    : `${readyCount} / ${state.players.length} 已准备，AI 会自动行动`;
}

function renderDice(state) {
  const dice = elements.diceTray.querySelectorAll('.die');
  const mode = state.diceMode === 'battle' ? 'battle' : 'd12';
  const visibleCount = mode === 'battle' ? 2 : 1;
  elements.diceTray.dataset.mode = mode;
  for (let index = 0; index < dice.length; index += 1) {
    const value = state.dice[index];
    dice[index].hidden = index >= visibleCount;
    dice[index].textContent = value ? String(value) : '';
    dice[index].dataset.value = value ? String(value) : '';
    dice[index].classList.toggle('is-empty', !value);
  }
  elements.diceTray.classList.remove('is-rolling');
  requestAnimationFrame(() => elements.diceTray.classList.add('is-rolling'));
}

function renderPlayControls(state) {
  if (state.room.phase !== 'playing') {
    return;
  }
  const actions = state.you.legalActions;
  const current = state.players.find((player) => player.id === state.room.turnPlayerId);
  const isMyTurn = current?.id === state.you.id;
  const stageNames = {
    roll: '等待投骰',
    claim: '无主世界',
    upgrade: '己方领地',
    landing: '敌方领地',
    shop: '星际商店',
    held: '色孽禁锢',
    end: '行动完成',
  };

  elements.turnBanner.dataset.state = isMyTurn ? 'active' : 'waiting';
  elements.turnKicker.textContent = isMyTurn ? '你的回合' : '等待行动';
  elements.turnTitle.textContent = isMyTurn
    ? (stageNames[state.room.turnStage] || '执行行动')
    : `轮到 ${current?.name || '其他战争领主'}`;
  elements.eventText.textContent = state.lastEvent
    ? `${state.lastEvent.title}：${state.lastEvent.text}`
    : '等待命运降临。';

  elements.rollButton.disabled = !actions.canRoll;
  elements.claimButton.hidden = !actions.canClaim;
  elements.claimButton.disabled = !actions.canClaim;
  elements.claimButton.textContent = `占领 ${actions.claimCost}`;
  elements.upgradeButton.hidden = !actions.canUpgrade;
  elements.upgradeButton.disabled = !actions.canUpgrade;
  elements.upgradeButton.textContent = `升级 ${actions.upgradeCost}`;
  elements.titheButton.hidden = !actions.canPayTithe;
  elements.titheButton.disabled = !actions.canPayTithe;
  elements.titheButton.textContent = `缴税 ${actions.titheCost}`;
  elements.invadeButton.hidden = !actions.canInvade;
  elements.invadeButton.disabled = !actions.canInvade;
  elements.teleportButton.hidden = !actions.canTeleport;
  elements.teleportButton.disabled = !actions.canTeleport;
  elements.teleportButton.textContent = actions.teleportToName
    ? `跃迁至 ${actions.teleportToName}`
    : '星系跃迁';
  elements.endButton.hidden = !actions.canEnd;
  elements.endButton.disabled = !actions.canEnd;

  renderInvasionPreview(actions);
  renderShopControls(state);
  renderDice(state);
}

function renderInvasionPreview(actions) {
  const preview = actions.invasionPreview;
  elements.invasionPreview.hidden = !preview || !actions.canInvade;
  if (!preview || !actions.canInvade) {
    return;
  }

  elements.invasionFailureLoss.textContent = String(preview.failureLoss);
  elements.invasionDrawLoss.textContent = preview.tieWins
    ? '0（平局获胜）'
    : String(preview.drawLoss);
  if (preview.nurgle) {
    elements.invasionBreakdown.textContent = '纳垢领土：入侵必定失败，但不会产生资源损失。';
    return;
  }
  if (preview.tieWins) {
    elements.invasionBreakdown.textContent =
      `无退之战：点数相同视为进攻胜利；失败仍损失 ${preview.warLoss} + 赔款 ${preview.reparations}。`;
    return;
  }

  elements.invasionBreakdown.textContent =
    `失败：战争损失 ${preview.warLoss} + 赔款 ${preview.reparations}，`
    + `剩余 ${preview.remainingAfterFailure}；平局后剩余 ${preview.remainingAfterDraw}。`;
}

function renderShopControls(state) {
  const current = state.players.find((player) => player.id === state.room.turnPlayerId);
  const isMyTurn = current?.id === state.you.id;
  const isShop = isMyTurn && state.room.turnStage === 'shop';
  elements.shopPanel.hidden = !isShop;
  if (!isShop) {
    return;
  }

  const tile = state.board.find((item) => item.id === state.you.position);
  const actions = state.you.legalActions;
  elements.shopTitle.textContent = actions.remoteShop
    ? '远程星际商店'
    : (tile?.name || '星际商店');
  elements.shopModeLabel.textContent = state.room.shopMode === 'warp'
    ? '已失效'
    : actions.shopPurchaseLocked
      ? '本回合已购买'
      : '营业中';
  elements.shopItems.replaceChildren();

  const items = actions.shopItems || [];
  if (items.length === 0) {
    elements.shopHint.textContent = '商品暂未上架，可以先结束回合。';
    return;
  }

  for (const item of items) {
    const card = makeElement('article', 'shop-item');
    const copy = makeElement('div', 'shop-item-copy');
    copy.append(
      makeElement('strong', '', item.name),
      makeElement('span', '', item.description || '暂无说明'),
    );
    const buy = makeElement(
      'button',
      'shop-buy-button',
      `${item.price} 影响力`,
    );
    buy.type = 'button';
    buy.disabled = !item.affordable;
    buy.addEventListener('click', () => sendAction('buyitem', { itemId: item.id }));
    card.append(copy, buy);
    elements.shopItems.append(card);
  }

  elements.shopHint.textContent = actions.shopPurchaseLocked
    ? '每回合最多购买 1 件，本回合已经完成购买。'
    : actions.canBuyItem
      ? '每回合最多购买 1 件，购买后结束当前行动。'
      : '当前没有可购买的库存或影响力不足。';
}

function renderResult(state) {
  if (state.room.phase !== 'settled' || !state.result) {
    return;
  }
  const isWinner = state.result.winnerId === state.you.id;
  elements.resultTitle.textContent = isWinner
    ? '你取得了星区统治权'
    : `${state.result.winnerName} 取得胜利`;
  elements.resultDetail.textContent = `${state.result.reason} / 统治点 ${state.result.dominion}`;
  elements.restartButton.hidden = !state.you.legalActions.canRestart;
}

function renderPlayers(state) {
  elements.playerList.replaceChildren();
  elements.playerCount.textContent = `${state.players.length} / ${state.room.maxPlayers}`;
  const sorted = [...state.players].sort((left, right) => (
    right.dominion - left.dominion || right.influence - left.influence
  ));

  for (const player of sorted) {
    const item = makeElement('article', 'player-row');
    item.style.setProperty('--player-color', player.color);
    item.classList.toggle('is-turn', player.isTurn);
    item.classList.toggle('is-self', player.id === state.you.id);
    item.classList.toggle('is-offline', !player.connected);

    const identity = makeElement('div', 'player-identity');
    const mark = makeElement('span', 'player-mark', player.name.slice(0, 1));
    const text = makeElement('div', 'player-text');
    const nameLine = makeElement('div', 'player-name-line');
    nameLine.append(
      makeElement('strong', '', player.name),
      makeElement('span', 'mini-faction', player.factionShortName),
    );
    if (player.skill) {
      nameLine.append(makeElement('span', 'mini-skill', player.skill.name));
    }
    const subline = makeElement(
      'span',
      'player-subline',
      [
        `${player.influence} 影响力`,
        `${player.holdings} 领地`,
        player.heldTurns ? `禁锢 ${player.heldTurns} 回合` : '',
        player.nextInvasionBonus ? `攻城 +${player.nextInvasionBonus}` : '',
        player.forcedMoveRoll ? `指定骰 ${player.forcedMoveRoll}` : '',
        player.zeroMoveNextTurn ? '下回合原地结算' : '',
      ].filter(Boolean).join(' / '),
    );
    text.append(nameLine, subline);
    identity.append(mark, text);

    const score = makeElement('div', 'player-score');
    score.append(
      makeElement('strong', '', String(player.dominion)),
      makeElement('span', '', '统治点'),
    );
    item.append(identity, score);
    if (
      player.isBot
      && state.room.phase === 'lobby'
      && state.you.isHost
    ) {
      const removeButton = makeElement('button', 'player-remove-button', '移除');
      removeButton.type = 'button';
      removeButton.addEventListener('click', () => removeBot(player.id));
      item.append(removeButton);
    }
    elements.playerList.append(item);
  }

  if (state.room.nurgle?.active) {
    const item = makeElement('article', 'player-row nurgle-row');
    item.style.setProperty('--player-color', '#7f9f58');
    const identity = makeElement('div', 'player-identity');
    const mark = makeElement('span', 'player-mark', 'N');
    const text = makeElement('div', 'player-text');
    const nameLine = makeElement('div', 'player-name-line');
    nameLine.append(
      makeElement('strong', '', '纳垢本体'),
      makeElement('span', 'mini-faction', '亚空间灾厄'),
    );
    text.append(
      nameLine,
      makeElement('span', 'player-subline', `剩余行动回合：${state.room.nurgle.roundsRemaining}`),
    );
    identity.append(mark, text);
    const score = makeElement('div', 'player-score');
    score.append(
      makeElement('strong', '', '∞'),
      makeElement('span', '', '瘟疫'),
    );
    item.append(identity, score);
    elements.playerList.append(item);
  }
}

function renderLogs(state) {
  elements.logList.replaceChildren();
  for (const log of state.logs) {
    const item = makeElement('li', `log-item log-${log.type || 'info'}`);
    const dot = makeElement('span', 'log-dot');
    const message = makeElement('span', '', log.message);
    item.append(dot, message);
    elements.logList.append(item);
  }
}

function render() {
  if (!gameState || !session) {
    return;
  }
  renderHeader(gameState);
  const move = gameState.lastMove;
  const movementOverlay = elements.board.querySelector('.movement-token');
  const sameMoveInProgress = Boolean(
    movementOverlay
    && move
    && move.id === activeMovementId
  );
  if (sameMoveInProgress) {
    boardRenderDeferred = true;
  } else {
    renderBoard(gameState);
  }
  if (hasRenderedState && move && move.id !== activeMovementId) {
    activeMovementId = move.id;
    animateMovement(move);
  }
  hasRenderedState = true;
  renderPlanetInfo(gameState);
  renderCommander(gameState);
  renderLobbyControls(gameState);
  renderPlayControls(gameState);
  renderResult(gameState);
  renderPlayers(gameState);
  renderLogs(gameState);
}

function tileCenter(tile) {
  const boardRect = elements.board.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  return {
    x: tileRect.left - boardRect.left + (tileRect.width / 2),
    y: tileRect.top - boardRect.top + (tileRect.height / 2),
  };
}

function animateMovement(move) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    return;
  }

  const scroller = elements.board.closest('.board-scroller');
  const targetTile = elements.board.querySelector(`[data-tile-id="${move.to}"]`);
  const sourceTile = elements.board.querySelector(`[data-tile-id="${move.from}"]`);
  if (!targetTile || !sourceTile || !scroller) {
    return;
  }

  const targetLeft = targetTile.offsetLeft - (scroller.clientWidth / 2)
    + (targetTile.offsetWidth / 2);
  scroller.scrollLeft = Math.max(0, targetLeft);

  const player = gameState.players.find((item) => item.id === move.playerId);
  const sourceToken = elements.board.querySelector(`[data-player-id="${move.playerId}"]`);
  if (!player || !sourceToken) {
    return;
  }

  const movementIds = Array.isArray(move.path)
    ? [move.from, ...move.path]
    : Array.from(
      { length: move.distance + 1 },
      (_, step) => (move.from + step) % gameState.board.length,
    );
  const path = movementIds.map((tileId) => {
    const tile = elements.board.querySelector(`[data-tile-id="${tileId}"]`);
    return tile ? { tile, center: tileCenter(tile) } : null;
  }).filter(Boolean);
  if (path.length < 2) {
    return;
  }

  const overlay = makeElement('span', 'player-token movement-token');
  overlay.textContent = player.name.slice(0, 1);
  overlay.style.setProperty('--token-color', player.color);
  overlay.style.left = '0';
  overlay.style.top = '0';
  elements.board.append(overlay);
  sourceToken.style.visibility = 'hidden';

  const duration = Math.max(640, Math.min(1500, move.distance * 115));
  const stepDelay = duration / move.distance;
  const keyframes = path.map((point, index) => ({
    offset: index / (path.length - 1),
    transform: `translate(${point.center.x}px, ${point.center.y}px) translate(-50%, -50%)`,
  }));

  if (move.jump && path.length >= 2) {
    const start = path[0].center;
    const end = path[path.length - 1].center;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
    const beam = makeElement('span', 'teleport-beam');
    beam.style.left = `${start.x}px`;
    beam.style.top = `${start.y}px`;
    beam.style.width = `${length}px`;
    beam.style.transform = `rotate(${angle}deg)`;
    elements.board.append(beam);
    setTimeout(() => beam.remove(), duration + 350);
    elements.board.classList.add('is-teleporting');
  }

  path.slice(1).forEach((point, index) => {
    const step = makeElement('span', 'movement-step');
    step.style.left = `${point.center.x}px`;
    step.style.top = `${point.center.y}px`;
    step.style.animationDelay = `${index * stepDelay}ms`;
    elements.board.append(step);
    setTimeout(() => step.remove(), duration + 350);
  });

  sourceTile.classList.add('is-departing');
  targetTile.classList.add('is-arriving');
  elements.board.classList.add('is-moving');
  const animation = overlay.animate(keyframes, {
    duration,
    easing: 'linear',
    fill: 'forwards',
  });

  animation.finished.finally(() => {
    overlay.remove();
    sourceToken.style.visibility = '';
    sourceTile.classList.remove('is-departing');
    targetTile.classList.remove('is-arriving');
    elements.board.classList.remove('is-moving');
    elements.board.classList.remove('is-teleporting');
    if (boardRenderDeferred) {
      boardRenderDeferred = false;
      scheduleRender();
    }
  });
}

function bindEvents() {
  elements.createForm.addEventListener('submit', createRoom);
  elements.joinForm.addEventListener('submit', joinRoom);
  elements.roomCode.addEventListener('input', () => {
    elements.roomCode.value = elements.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  elements.copyRoomButton.addEventListener('click', copyRoomCode);
  elements.leaveButton.addEventListener('click', leaveRoom);
  elements.readyButton.addEventListener('click', () => {
    sendReady(!gameState?.you?.ready);
  });
  elements.startButton.addEventListener('click', startGame);
  elements.addBotButton.addEventListener('click', addBot);
  elements.rollButton.addEventListener('click', () => sendAction('roll'));
  elements.claimButton.addEventListener('click', () => sendAction('claim'));
  elements.upgradeButton.addEventListener('click', () => sendAction('upgrade'));
  elements.titheButton.addEventListener('click', () => sendAction('tithe'));
  elements.invadeButton.addEventListener('click', () => sendAction('invade'));
  elements.teleportButton.addEventListener('click', () => sendAction('teleport'));
  elements.endButton.addEventListener('click', () => sendAction('end'));
  elements.restartButton.addEventListener('click', restartGame);
}

async function init() {
  bindEvents();
  window.addEventListener('resize', scheduleRender);
  await restoreSession();
}

window.addEventListener('beforeunload', closeEvents);

init();
