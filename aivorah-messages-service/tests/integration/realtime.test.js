const http = require('http');
const WebSocket = require('ws');
const { attach, pushToUser } = require('../../services/realtime');

function waitFor(ws, event) {
  return new Promise((resolve) => ws.once(event, resolve));
}

describe('realtime messages service', () => {
  let server;
  let port;

  beforeAll((done) => {
    server = http.createServer((_req, res) => res.end());
    attach(server);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('delivers a pushToUser payload only to the authenticated recipient', async () => {
    const wsA = new WebSocket(`ws://localhost:${port}/messages/realtime`);
    const wsB = new WebSocket(`ws://localhost:${port}/messages/realtime`);
    await Promise.all([waitFor(wsA, 'open'), waitFor(wsB, 'open')]);

    wsA.send(JSON.stringify({ type: 'auth', email: 'a@x.com' }));
    wsB.send(JSON.stringify({ type: 'auth', email: 'b@x.com' }));
    await new Promise((r) => setTimeout(r, 100));

    const gotA = waitFor(wsA, 'message');
    const gotBTimeout = new Promise((resolve) => {
      const t = setTimeout(() => resolve('timeout'), 300);
      wsB.once('message', () => { clearTimeout(t); resolve('message'); });
    });

    pushToUser('a@x.com', { type: 'message', message: { id: 1 } });

    const payload = JSON.parse((await gotA).toString());
    expect(payload).toEqual({ type: 'message', message: { id: 1 } });
    expect(await gotBTimeout).toBe('timeout');

    wsA.close();
    wsB.close();
  });

  test('pushToUser is a no-op when the recipient has no open connection', () => {
    expect(() => pushToUser('nobody@x.com', { type: 'message', message: {} })).not.toThrow();
  });
});
