require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory room store
// rooms.get(code) => { code, hostWs, participants: Map<ws, {name, isHost, isEditor}>, started }
const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function broadcastToRoom(roomCode, message, excludeWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const payload = JSON.stringify(message);
  room.participants.forEach((_, ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

// Middleware
app.use(express.json());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

// REST: create a room
app.post('/api/room/create', (req, res) => {
  const { hostName } = req.body;
  if (!hostName) return res.status(400).json({ error: 'hostName required' });
  const roomCode = generateRoomCode();
  rooms.set(roomCode, {
    code: '',
    hostWs: null,
    participants: new Map(),
    started: false,
  });
  console.log(`[Room] Created ${roomCode} for host "${hostName}"`);
  res.json({ roomCode });
});

// REST: check if a room exists
app.get('/api/room/:code/exists', (req, res) => {
  const exists = rooms.has(req.params.code.toUpperCase());
  res.json({ exists });
});

// Code execution endpoint — runs Python locally
app.post('/api/run', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  // Write code to a temp file to avoid shell injection
  const tmpFile = path.join(os.tmpdir(), `collabcode_${Date.now()}.py`);
  fs.writeFileSync(tmpFile, code);

  let output = '';
  let errorOutput = '';

  const proc = spawn('python3', [tmpFile]);

  proc.stdout.on('data', (data) => { output += data.toString(); });
  proc.stderr.on('data', (data) => { errorOutput += data.toString(); });

  // 10-second timeout
  const timeout = setTimeout(() => {
    proc.kill();
    fs.unlink(tmpFile, () => {});
    res.json({ output: 'Execution timed out (10s limit)', isError: true });
  }, 10000);

  proc.on('close', (exitCode) => {
    clearTimeout(timeout);
    fs.unlink(tmpFile, () => {});
    const combined = output + (errorOutput ? errorOutput : '');
    res.json({ output: combined || '(no output)', isError: exitCode !== 0 });
  });
});

// WebSocket
wss.on('connection', (ws) => {
  console.log('[WS] New connection');

  ws.on('message', (message) => {
    try {
      const { event, data } = JSON.parse(message);

      switch (event) {
        case 'join-room': {
          const { roomCode, name, isHost } = data;
          const room = rooms.get(roomCode);
          if (!room) {
            ws.send(JSON.stringify({ event: 'error', data: { message: 'Room not found' } }));
            return;
          }

          // Track which room this ws belongs to
          ws.roomCode = roomCode;
          ws.participantName = name;

          // Host starts as editor; all others start as viewers
          room.participants.set(ws, { name, isHost, isEditor: isHost });
          if (isHost) room.hostWs = ws;

          // Send current state back to the joining client
          const participantList = [...room.participants.values()];
          ws.send(JSON.stringify({
            event: 'room-joined',
            data: { participants: participantList, code: room.code, started: room.started },
          }));

          // Notify others (new joiners are always non-editors)
          broadcastToRoom(roomCode, { event: 'participant-joined', data: { name, isHost, isEditor: isHost } }, ws);
          console.log(`[WS] "${name}" joined room ${roomCode}`);
          break;
        }

        case 'start-session': {
          const { roomCode } = data;
          const room = rooms.get(roomCode);
          if (!room) return;
          room.started = true;
          broadcastToRoom(roomCode, { event: 'session-started', data: {} }, ws);
          console.log(`[WS] Session started in room ${roomCode}`);
          break;
        }

        case 'code-update': {
          const { roomCode, content } = data;
          const room = rooms.get(roomCode);
          if (!room) return;
          // Reject updates from non-editors (server-side enforcement)
          const sender = room.participants.get(ws);
          if (!sender?.isEditor) return;
          room.code = content;
          broadcastToRoom(roomCode, { event: 'code-update', data: { content } }, ws);
          break;
        }

        case 'grant-editor': {
          const { roomCode, targetName } = data;
          const room = rooms.get(roomCode);
          if (!room || ws !== room.hostWs) return;
          for (const [targetWs, info] of room.participants) {
            if (info.name === targetName) {
              room.participants.set(targetWs, { ...info, isEditor: true });
              break;
            }
          }
          broadcastToRoom(roomCode, { event: 'editor-granted', data: { name: targetName } });
          console.log(`[WS] Editor granted to "${targetName}" in room ${roomCode}`);
          break;
        }

        case 'revoke-editor': {
          const { roomCode, targetName } = data;
          const room = rooms.get(roomCode);
          if (!room || ws !== room.hostWs) return;
          for (const [targetWs, info] of room.participants) {
            if (info.name === targetName) {
              room.participants.set(targetWs, { ...info, isEditor: false });
              break;
            }
          }
          broadcastToRoom(roomCode, { event: 'editor-revoked', data: { name: targetName } });
          console.log(`[WS] Editor revoked from "${targetName}" in room ${roomCode}`);
          break;
        }

        case 'chat-message': {
          const { roomCode, name, text } = data;
          broadcastToRoom(roomCode, {
            event: 'chat-message',
            data: { name, text, timestamp: new Date().toISOString() },
          });
          break;
        }

        case 'request-code-state': {
          const { roomCode } = data;
          const room = rooms.get(roomCode);
          if (!room) return;
          ws.send(JSON.stringify({ event: 'code-state', data: { content: room.code } }));
          break;
        }

        default:
          console.log(`[WS] Unknown event: ${event}`);
      }
    } catch (err) {
      console.error('[WS] Error:', err.message);
    }
  });

  ws.on('close', () => {
    const { roomCode, participantName } = ws;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    const wasHost = room.hostWs === ws;

    room.participants.delete(ws);
    console.log(`[WS] "${participantName}" left room ${roomCode}`);

    if (room.participants.size === 0) {
      rooms.delete(roomCode);
      console.log(`[Room] ${roomCode} closed (empty)`);
      return;
    }

    if (wasHost && room.started) {
      broadcastToRoom(roomCode, { event: 'host-left', data: {} });
    } else {
      broadcastToRoom(roomCode, { event: 'participant-left', data: { name: participantName } });
    }
  });

  ws.on('error', (err) => console.error('[WS] Error:', err.message));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
