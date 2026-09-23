'use strict';

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

const encoder = new TextEncoder();

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

async function roomStub(env, code) {
  const id = env.ROOMS.idFromName(code.toUpperCase());
  return env.ROOMS.get(id);
}

async function forwardToRoom(request, env, code, endpoint) {
  const stub = await roomStub(env, code);
  const headers = new Headers(request.headers);
  headers.set('x-room-code', code.toUpperCase());
  const body = ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
  return stub.fetch(new Request(`https://room.internal${endpoint}`, {
    method: request.method,
    headers,
    body,
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, runtime: 'cloudflare-workers' });
      }

      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const body = await readJson(request);
        const code = createRoomCode();
        const stub = await roomStub(env, code);
        return stub.fetch(new Request('https://room.internal/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-room-code': code },
          body: JSON.stringify({ name: body.name }),
        }));
      }

      if (url.pathname === '/api/rooms/join' && request.method === 'POST') {
        const body = await readJson(request);
        const code = String(body.roomCode || '').trim().toUpperCase();
        if (!code) {
          const error = new Error('请输入房间代码');
          error.statusCode = 400;
          throw error;
        }
        const stub = await roomStub(env, code);
        return stub.fetch(new Request('https://room.internal/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-room-code': code },
          body: JSON.stringify(body),
        }));
      }

      const roomMatch = url.pathname.match(
        /^\/api\/rooms\/([A-Z0-9]{4,6})\/(events|state|ready|faction|addbot|removebot|start|action|restart|leave)$/i,
      );
      if (roomMatch) {
        const code = roomMatch[1].toUpperCase();
        const endpoint = `/${roomMatch[2]}${url.search}`;
        return forwardToRoom(request, env, code, endpoint);
      }

      if (url.pathname.startsWith('/api/')) {
        return json({ ok: false, error: '接口不存在' }, 404);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return errorResponse(error);
    }
  },
};

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.clients = new Set();
    this.heartbeat = null;
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get('room') || null;
    });
  }

  async persist() {
    if (this.room) {
      await this.ctx.storage.put('room', this.room);
    }
  }

  writeEvent(client, payload) {
    try {
      client.controller.enqueue(
        encoder.encode(`event: state\ndata: ${JSON.stringify(payload)}\n\n`),
      );
    } catch {
      this.clients.delete(client);
      this.stopHeartbeatIfIdle();
    }
  }

  broadcast() {
    if (!this.room) {
      return;
    }
    for (const client of this.clients) {
      const player = this.room.players.find((item) => item.token === client.token);
      if (!player) {
        continue;
      }
      this.writeEvent(client, roomState(this.room, player));
    }
  }

  startHeartbeat() {
    if (this.heartbeat) {
      return;
    }
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          this.clients.delete(client);
        }
      }
      this.stopHeartbeatIfIdle();
    }, 15000);
  }

  stopHeartbeatIfIdle() {
    if (this.clients.size === 0 && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/init' && request.method === 'POST') {
        return await this.initializeRoom(request);
      }
      if (url.pathname === '/join' && request.method === 'POST') {
        return await this.join(request);
      }
      if (!this.room) {
        return json({ ok: false, error: '战区不存在或已经关闭' }, 404);
      }
      if (url.pathname === '/state' && request.method === 'GET') {
        return await this.state(request);
      }
      if (url.pathname === '/events' && request.method === 'GET') {
        return await this.events(request);
      }
      if (url.pathname === '/ready' && request.method === 'POST') {
        return await this.ready(request);
      }
      if (url.pathname === '/faction' && request.method === 'POST') {
        return await this.faction(request);
      }
      if (url.pathname === '/addbot' && request.method === 'POST') {
        return await this.addBot(request);
      }
      if (url.pathname === '/removebot' && request.method === 'POST') {
        return await this.removeBot(request);
      }
      if (url.pathname === '/start' && request.method === 'POST') {
        return await this.start(request);
      }
      if (url.pathname === '/action' && request.method === 'POST') {
        return await this.action(request);
      }
      if (url.pathname === '/restart' && request.method === 'POST') {
        return await this.restart(request);
      }
      if (url.pathname === '/leave' && request.method === 'POST') {
        return await this.leave(request);
      }
      return json({ ok: false, error: '接口不存在' }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async initializeRoom(request) {
    const code = request.headers.get('x-room-code');
    const body = await readJson(request);
    const player = createPlayer(String(body.name || '').slice(0, 14));
    this.room = createRoom(player);
    this.room.code = code;
    await this.persist();
    return json({
      ok: true,
      roomCode: this.room.code,
      playerId: player.id,
      token: player.token,
      name: player.name,
      faction: player.faction,
    }, 201);
  }

  async join(request) {
    const body = await readJson(request);
    const joined = joinRoom(
      this.room,
      String(body.name || '战争领主').slice(0, 14),
      body.token,
      body.playerId,
    );
    joined.player.connected = true;
    joined.player.lastSeenAt = Date.now();
    await this.persist();
    this.broadcast();
    return json({
      ok: true,
      roomCode: this.room.code,
      playerId: joined.player.id,
      token: joined.player.token,
      name: joined.player.name,
      faction: joined.player.faction,
      reconnected: joined.reconnected,
    });
  }

  async state(request) {
    const token = new URL(request.url).searchParams.get('token');
    const player = token ? getPlayer(this.room, token) : null;
    let changed = false;
    if (player) {
      player.connected = true;
      player.lastSeenAt = Date.now();
      changed = true;
    }
    if (maybeAdvanceBot(this.room)) {
      changed = true;
    }
    if (changed) {
      await this.persist();
    }
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async events(request) {
    const token = new URL(request.url).searchParams.get('token');
    const player = getPlayer(this.room, token);
    player.connected = true;
    player.lastSeenAt = Date.now();
    await this.persist();

    let client;
    const stream = new ReadableStream({
      start: (controller) => {
        client = { controller, token: player.token };
        this.clients.add(client);
        this.writeEvent(client, roomState(this.room, player));
        this.startHeartbeat();
        this.broadcast();
      },
      cancel: () => {
        if (client) {
          this.clients.delete(client);
        }
        const stillConnected = [...this.clients].some((item) => item.token === player.token);
        player.connected = stillConnected;
        this.stopHeartbeatIfIdle();
        this.persist();
        this.broadcast();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  async ready(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    requireLobby(this.room);
    player.ready = Boolean(body.ready);
    player.connected = true;
    player.lastSeenAt = Date.now();
    addLog(this.room, `${player.name}${player.ready ? ' 已准备' : ' 取消准备'}`);
    await this.persist();
    this.broadcast();
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async faction(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    chooseFaction(this.room, player, String(body.faction || ''));
    player.ready = false;
    await this.persist();
    this.broadcast();
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async addBot(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    addBot(this.room, player);
    await this.persist();
    this.broadcast();
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async removeBot(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    removeBot(this.room, player, String(body.playerId || ''));
    await this.persist();
    this.broadcast();
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async start(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    requireHost(this.room, player);
    startGame(this.room);
    await this.persist();
    this.broadcast();
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async action(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    player.connected = true;
    player.lastSeenAt = Date.now();
    performAction(this.room, player, body);
    await this.persist();
    this.broadcast();
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async restart(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    requireHost(this.room, player);
    if (this.room.phase !== 'settled') {
      const error = new Error('当前远征尚未结束');
      error.statusCode = 409;
      throw error;
    }
    restartRoom(this.room);
    await this.persist();
    this.broadcast();
    return json({ ok: true, state: roomState(this.room, player) });
  }

  async leave(request) {
    const body = await readJson(request);
    const player = getPlayer(this.room, body.token);
    if (this.room.phase === 'playing') {
      const error = new Error('远征进行中，暂时不能退出战区');
      error.statusCode = 409;
      throw error;
    }
    const playerIndex = this.room.players.indexOf(player);
    if (playerIndex >= 0) {
      this.room.players.splice(playerIndex, 1);
    }
    if (this.room.hostId === player.id) {
      const nextHost = this.room.players.find((item) => item.connected) || this.room.players[0];
      this.room.hostId = nextHost ? nextHost.id : null;
    }
    addLog(this.room, `${player.name} 离开了战区`);
    if (this.room.players.length === 0) {
      await this.ctx.storage.deleteAll();
      this.room = null;
    } else {
      await this.persist();
      this.broadcast();
    }
    return json({ ok: true });
  }
}
