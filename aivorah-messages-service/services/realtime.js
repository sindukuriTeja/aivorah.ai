const WebSocket = require('ws');

// email (lowercased) -> Set<WebSocket>
const connectionsByEmail = new Map();

function attach(server) {
  const wss = new WebSocket.Server({ server, path: '/messages/realtime' });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg && msg.type === 'auth' && typeof msg.email === 'string') {
        const email = msg.email.toLowerCase();
        ws.email = email;
        if (!connectionsByEmail.has(email)) connectionsByEmail.set(email, new Set());
        connectionsByEmail.get(email).add(ws);
      }
    });

    ws.on('close', () => {
      if (ws.email && connectionsByEmail.has(ws.email)) {
        connectionsByEmail.get(ws.email).delete(ws);
        if (connectionsByEmail.get(ws.email).size === 0) connectionsByEmail.delete(ws.email);
      }
    });
  });

  // Drop dead connections (e.g. client crashed without a close frame).
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

function pushToUser(email, payload) {
  if (!email) return;
  const sockets = connectionsByEmail.get(email.toLowerCase());
  if (!sockets || sockets.size === 0) return;
  const data = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

module.exports = { attach, pushToUser };
