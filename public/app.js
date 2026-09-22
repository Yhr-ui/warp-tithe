'use strict';

const SESSION_KEY = 'warp-tithe-session-v1';

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
  targetValue: document.querySelector('#targetValue'),
  board: document.querySelector('#board'),
  commanderName: document.querySelector('#commanderName'),
  commanderFaction: document.querySelector('#commanderFaction'),
  influenceValue: document.querySelector('#influenceValue'),
  dominionValue: document.querySelector('#dominionValue'),
  holdingValue: document.querySelector('#holdingValue'),
  lobbyControls: document.querySelector('#lobbyControls'),
  factionGrid: document.querySelector('#factionGrid'),
  readyButton: document.querySelector('#readyButton'),
  startButton: document.querySelector('#startButton'),
  lobbyHint: document.querySelector('#lobbyHint'),
  playControls: document.querySelector('#playControls'),
  turnBanner: document.querySelector('#turnBanner'),
  turnKicker: document.querySelector('#turnKicker'),
  turnTitle: document.querySelector('#turnTitle'),
  diceTray: document.querySelector('#diceTray'),
  eventText: document.querySelector('#eventText'),
  rollButton: document.querySelector('#rollButton'),
  claimButton: document.querySelector('#claimButton'),
  upgradeButton: document.querySelector('#upgradeButton'),
  titheButton: document.querySelector('#titheButton'),
  invadeButton: document.querySelector('#invadeButton'),
  endButton: document.querySelector('#endButton'),
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
let eventSource = null;
let renderScheduled = false;
let toastTimer = null;
let selectedTileId = null;
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
  eventSource?.close();
  eventSource = null;
}

function connectEvents() {
  if (!session) {
    return;
  }
  closeEvents();
  setConnection('connecting', '连接中');
  const query = new URLSearchParams({ token: session.token });
  eventSource = new EventSource(`/api/rooms/${session.roomCode}/events?${query}`);
  eventSource.addEventListener('open', () => setConnection('online', '在线'));
  eventSource.addEventListener('state', (event) => {
    try {
      gameState = JSON.parse(event.data);
      setConnection('online', '在线');
      scheduleRender();
    } catch {
      showToast('战区状态读取失败');
    }
  });
  eventSource.addEventListener('error', () => setConnection('offline', '重连中'));
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

async function sendAction(type) {
  if (!session) {
    return;
  }
  try {
    const payload = await api(`/api/rooms/${session.roomCode}/action`, {
      method: 'POST',
      body: { token: session.token, type },
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

function tileGridPosition(index) {
  if (index <= 9) {
    return { column: index + 1, row: 8 };
  }
  if (index <= 16) {
    return { column: 10, row: 17 - index };
  }
  if (index <= 25) {
    return { column: 26 - index, row: 1 };
  }
  return { column: 1, row: index - 24 };
}

function tileMeta(tile) {
  if (!tile.claimable) {
    return tile.typeLabel;
  }
  if (!tile.owner) {
    return `占领 ${tile.cost}`;
  }
  if (tile.restoreAtRound) {
    return `${tile.level} 级 / 重建中`;
  }
  return `${tile.level} 级 / 税 ${tile.tribute}`;
}

function renderBoard(state) {
  elements.board.replaceChildren();
  const playerTurn = state.room.turnPlayerId;

  state.board.forEach((tile) => {
    const position = tileGridPosition(tile.id);
    const element = makeElement('button', `tile tile-${tile.type}`);
    element.type = 'button';
    element.style.gridColumn = String(position.column);
    element.style.gridRow = String(position.row);
    element.dataset.tileId = String(tile.id);
    element.setAttribute(
      'aria-label',
      `${tile.name}，${tile.typeLabel}，${tile.owner ? `${tile.owner.name}控制` : '未占领'}`,
    );

    if (tile.owner) {
      element.classList.add('is-owned');
      element.style.setProperty('--owner-color', tile.owner.color);
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

    element.append(top, name, meta, tokenRow);
    element.addEventListener('click', () => {
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
    selectedTile ? '战区情报' : '风暴星区',
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
  if (state.room.doom >= 12) {
    return makeElement('span', 'doom-status danger', '大裂痕迫近');
  }
  if (state.room.doom >= 8) {
    return makeElement('span', 'doom-status warning', '亚空间风暴');
  }
  if (state.room.doom >= 4) {
    return makeElement('span', 'doom-status', '混沌苏醒');
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
  elements.lobbyHint.textContent = state.players.length < 2
    ? '至少需要两名战争领主'
    : `${readyCount} / ${state.players.length} 已准备`;
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
  elements.endButton.hidden = !actions.canEnd;
  elements.endButton.disabled = !actions.canEnd;

  renderDice(state);
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
    const subline = makeElement(
      'span',
      'player-subline',
      `${player.influence} 影响力 / ${player.holdings} 领地`,
    );
    text.append(nameLine, subline);
    identity.append(mark, text);

    const score = makeElement('div', 'player-score');
    score.append(
      makeElement('strong', '', String(player.dominion)),
      makeElement('span', '', '统治点'),
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

  const path = [];
  for (let step = 0; step <= move.distance; step += 1) {
    const tileIndex = (move.from + step) % gameState.board.length;
    const tile = elements.board.querySelector(`[data-tile-id="${tileIndex}"]`);
    if (tile) {
      path.push({ tile, center: tileCenter(tile) });
    }
  }
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
    offset: index / move.distance,
    transform: `translate(${point.center.x}px, ${point.center.y}px) translate(-50%, -50%)`,
  }));

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
  elements.rollButton.addEventListener('click', () => sendAction('roll'));
  elements.claimButton.addEventListener('click', () => sendAction('claim'));
  elements.upgradeButton.addEventListener('click', () => sendAction('upgrade'));
  elements.titheButton.addEventListener('click', () => sendAction('tithe'));
  elements.invadeButton.addEventListener('click', () => sendAction('invade'));
  elements.endButton.addEventListener('click', () => sendAction('end'));
  elements.restartButton.addEventListener('click', restartGame);
}

async function init() {
  bindEvents();
  await restoreSession();
}

window.addEventListener('beforeunload', closeEvents);

init();
