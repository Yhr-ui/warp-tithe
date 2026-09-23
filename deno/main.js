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
  removeBot,
  restartRoom,
  roomState,
  startGame,
} from './game.js';

let kvInstance = null;
function database() {
  kvInstance ??= Deno.openKv();
  return kvInstance;
}
const locks = new Map();
const PUBLIC_ROOT = new URL('../public/', import.meta.url);
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

function roomKey(code) {
  return ['rooms', code.toUpperCase()];
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
  const kv = await database();
  const result = await kv.get(roomKey(code), { consistency: 'strong' });
  return result.value ? hydrateRoom(result.value) : null;
}

async function saveRoom(room) {
  const kv = await database();
  await kv.set(roomKey(room.code), serializeRoom(room));
}

async function withRoomLock(code, task) {
  const key = code.toUpperCase();
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(key, previous.then(() => current));
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

async function loadRequiredRoom(code) {
  const room = await loadRoom(code);
  if (!room) {
    const error = new Error('战区不存在或已经关闭');
    error.statusCode = 404;
    throw error;
  }
  return room;
}

async function handleApi(request, url, pathname) {
  const kv = await database();
  if (pathname === '/api/health' && request.method === 'GET') {
    return json({
      ok: true,
      runtime: 'deno-deploy',
      now: new Date().toISOString(),
    });
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
      if (room.players.length === 0) {
        await kv.delete(roomKey(room.code));
        return json({ ok: true });
      }
    }

    await saveRoom(room);
    return json({ ok: true, state: roomState(room, player) });
  });
}

async function serveStatic(pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(requestedPath);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const fileUrl = new URL(`.${decoded}`, PUBLIC_ROOT);
  if (!fileUrl.href.startsWith(PUBLIC_ROOT.href)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const body = await Deno.readFile(fileUrl);
    const extension = decoded.slice(decoded.lastIndexOf('.')).toLowerCase();
    return new Response(body, {
      headers: {
        'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
        'Cache-Control': ['.html', '.js', '.css'].includes(extension)
          ? 'no-store'
          : 'public, max-age=300',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(request, url, url.pathname);
    }
    return await serveStatic(url.pathname);
  } catch (error) {
    return errorResponse(error);
  }
}

export default {
  fetch: handleRequest,
};

if (import.meta.main) {
  Deno.serve({
    hostname: '0.0.0.0',
    port: Number(Deno.env.get('PORT')) || 3211,
  }, handleRequest);
}
