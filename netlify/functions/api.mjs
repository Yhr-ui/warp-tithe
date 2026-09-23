'use strict';

import { getStore } from '@netlify/blobs';

import {
  addBot,
  addLog,
  chooseFaction,
  createPlayer,
  createRoom,
  createRoomCode,
  getPlayer,
  joinRoom,
  maybeAdvanceBot,
  performAction,
  restartRoom,
  roomState,
  removeBot,
  startGame,
} from './game.js';

const locks = new Map();

function roomStore() {
  return getStore({
    name: 'warp-tithe-rooms',
    consistency: 'strong',
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(error) {
  return json({
    ok: false,
    error: error.statusCode ? error.message : '服务器暂时无法处理请求',
  }, error.statusCode || 500);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error('请求格式错误');
    error.statusCode = 400;
    throw error;
  }
}

function serializeRoom(room) {
  return {
    ...room,
    doomMilestones: [...room.doomMilestones],
    players: room.players.map((player) => {
      const { clients, ...plainPlayer } = player;
      return plainPlayer;
    }),
  };
}

function hydrateRoom(value) {
  return {
    ...value,
    doomMilestones: new Set(value.doomMilestones || []),
    players: (value.players || []).map((player) => ({
      ...player,
      clients: new Set(),
    })),
  };
}

async function loadRoom(code) {
  const value = await roomStore().get(`room:${code}`, {
    consistency: 'strong',
    type: 'json',
  });
  return value ? hydrateRoom(value) : null;
}

async function saveRoom(room) {
  await roomStore().setJSON(`room:${room.code}`, serializeRoom(room));
}

async function withRoomLock(code, task) {
  const previous = locks.get(code) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(code, previous.then(() => current));
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
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

function normalizePath(pathname) {
  let value = pathname;
  if (value.startsWith('/.netlify/functions/api')) {
    value = value.slice('/.netlify/functions/api'.length) || '/';
  }
  if (!value.startsWith('/api/')) {
    value = `/api${value}`;
  }
  return value;
}

async function loadRequiredRoom(code) {
  const room = await loadRoom(code);
  if (!room) {
    const error = new Error('战区不存在或已经关闭');
    error.statusCode = 404;
    throw error;
  }
  return room;
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  if (pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, runtime: 'netlify-functions' });
  }

  if (pathname === '/api/rooms' && request.method === 'POST') {
    const body = await readJson(request);
    const name = String(body.name || '').trim().slice(0, 14);
    if (!name) {
      const error = new Error('请输入玩家名称');
      error.statusCode = 400;
      throw error;
    }
    let code;
    do {
      code = createRoomCode();
    } while (await loadRoom(code));
    const player = createPlayer(name);
    const room = createRoom(player);
    room.code = code;
    await saveRoom(room);
    return json({
      ok: true,
      roomCode: room.code,
      playerId: player.id,
      token: player.token,
      name: player.name,
      faction: player.faction,
    }, 201);
  }

  if (pathname === '/api/rooms/join' && request.method === 'POST') {
    const body = await readJson(request);
    const code = String(body.roomCode || '').trim().toUpperCase();
    return withRoomLock(code, async () => {
      const room = await loadRequiredRoom(code);
      const joined = joinRoom(
        room,
        String(body.name || '战争领主').trim().slice(0, 14),
        body.token,
        body.playerId,
      );
      joined.player.connected = true;
      joined.player.lastSeenAt = Date.now();
      await saveRoom(room);
      return json({
        ok: true,
        roomCode: room.code,
        playerId: joined.player.id,
        token: joined.player.token,
        name: joined.player.name,
        faction: joined.player.faction,
        reconnected: joined.reconnected,
      });
    });
  }

  const match = pathname.match(
    /^\/api\/rooms\/([A-Z0-9]{4,6})\/(state|ready|faction|addbot|removebot|start|action|restart|leave)$/i,
  );
  if (!match) {
    return json({ ok: false, error: '接口不存在' }, 404);
  }

  const code = match[1].toUpperCase();
  const endpoint = match[2].toLowerCase();
  return withRoomLock(code, async () => {
    const room = await loadRequiredRoom(code);

    if (endpoint === 'state' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      const viewer = token ? getPlayer(room, token) : null;
      let changed = false;
      if (viewer) {
        const wasConnected = viewer.connected;
        viewer.connected = true;
        viewer.lastSeenAt = Date.now();
        if (!wasConnected) {
          changed = true;
        }
      }
      if (maybeAdvanceBot(room)) {
        changed = true;
      }
      if (changed) {
        await saveRoom(room);
      }
      return json({ ok: true, state: roomState(room, viewer) });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: '请求方式不正确' }, 405);
    }

    const body = await readJson(request);
    const player = getPlayer(room, body.token);
    player.connected = true;
    player.lastSeenAt = Date.now();

    if (endpoint === 'ready') {
      requireLobby(room);
      player.ready = Boolean(body.ready);
      addLog(room, `${player.name}${player.ready ? ' 已准备' : ' 取消准备'}`);
    } else if (endpoint === 'faction') {
      chooseFaction(room, player, String(body.faction || ''));
      player.ready = false;
    } else if (endpoint === 'addbot') {
      addBot(room, player);
    } else if (endpoint === 'removebot') {
      removeBot(room, player, String(body.playerId || ''));
    } else if (endpoint === 'start') {
      requireHost(room, player);
      startGame(room);
    } else if (endpoint === 'action') {
      performAction(room, player, body);
    } else if (endpoint === 'restart') {
      requireHost(room, player);
      if (room.phase !== 'settled') {
        const error = new Error('当前远征尚未结束');
        error.statusCode = 409;
        throw error;
      }
      restartRoom(room);
    } else if (endpoint === 'leave') {
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
      }
      addLog(room, `${player.name} 离开了战区`);
    }

    await saveRoom(room);
    return json({ ok: true, state: roomState(room, player) });
  });
}

export default async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    return errorResponse(error);
  }
};
