// Kart Party — static file server + WebSocket relay between the big screen (host) and phones (controllers).
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
// Phones need HTTPS for gyro (motion sensors are secure-context only), so we also serve a self-signed HTTPS port.
// Disabled when a hosting platform provides TLS for us (PORT is set) unless HTTPS_PORT is given explicitly.
const HTTPS_PORT = process.env.HTTPS_PORT ? Number(process.env.HTTPS_PORT) : process.env.PORT ? 0 : 3443;
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  // Prefer typical home-network ranges first
  return out.sort((a, b) => (b.startsWith('192.168.') - a.startsWith('192.168.')));
}

function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);

  if (p === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ips: lanAddresses(), port: PORT, httpsPort: httpsReady ? HTTPS_PORT : 0 }));
  }
  if (p === '/api/qr') {
    try {
      const svg = await QRCode.toString(url.searchParams.get('data') || '', { type: 'svg', margin: 1, color: { dark: '#1b1340', light: '#ffffff' } });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end(svg);
    } catch { res.writeHead(400); return res.end(); }
  }
  // dev only: save a canvas capture (enabled with KP_DEV_SHOTS=<dir>)
  if (p === '/api/devshot' && process.env.KP_DEV_SHOTS && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const data = Buffer.concat(chunks).toString().replace(/^data:image\/\w+;base64,/, '');
      const name = (url.searchParams.get('name') || 'shot').replace(/[^\w-]/g, '') + '.jpg';
      fs.writeFileSync(path.join(process.env.KP_DEV_SHOTS, name), Buffer.from(data, 'base64'));
      res.writeHead(200); res.end(name);
    });
    return;
  }
  if (p === '/' ) p = '/index.html';
  if (p === '/play' || p === '/play/') p = '/controller.html';

  let base = PUBLIC;
  if (p.startsWith('/vendor/three/')) { base = THREE_DIR; p = p.slice('/vendor/three'.length); }
  const file = path.normalize(path.join(base, p));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  sendFile(res, file);
}
const server = http.createServer(handler);
let httpsReady = false;

// ---------------------------------------------------------------- rooms
// room: { code, host: ws, players: Map<clientId, {ws, pid, name}>, nextPid }
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

const wss = new WebSocketServer({ noServer: true });
function attachWs(srv) {
  srv.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}
attachWs(server);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  let role = null, room = null, player = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (!role && m.t === 'host') {
      role = 'host';
      // Allow a host page reload to reclaim its room
      if (m.code && rooms.has(m.code) && !rooms.get(m.code).host) {
        room = rooms.get(m.code);
        room.host = ws;
      } else {
        room = { code: newCode(), host: ws, players: new Map(), nextPid: 1 };
        rooms.set(room.code, room);
      }
      clearTimeout(room.expire);
      send(ws, { t: 'room', code: room.code });
      for (const pl of room.players.values()) if (pl.ws) send(ws, { t: 'join', pid: pl.pid, name: pl.name, rejoin: true });
      return;
    }

    if (!role && m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r || !r.host) return send(ws, { t: 'error', msg: 'Room not found. Check the code on the big screen.' });
      const cid = String(m.cid || Math.random());
      let pl = r.players.get(cid);
      const rejoin = !!pl;
      if (!pl) {
        const active = [...r.players.values()].filter((x) => x.ws).length;
        if (active >= 4) return send(ws, { t: 'error', msg: 'This race is full (4 players max).' });
        pl = { pid: r.nextPid++, cid };
        r.players.set(cid, pl);
      } else if (pl.ws && pl.ws !== ws) {
        try { pl.ws.close(); } catch {}
      }
      pl.ws = ws;
      pl.name = String(m.name || 'Player').slice(0, 12);
      role = 'player'; room = r; player = pl;
      send(ws, { t: 'joined', pid: pl.pid, code });
      send(r.host, { t: 'join', pid: pl.pid, name: pl.name, rejoin });
      return;
    }

    if (role === 'player') {
      // Controller -> host. Inputs are small and frequent; everything else passes through too.
      m.pid = player.pid;
      send(room.host, m);
    } else if (role === 'host') {
      // Host -> one controller (m.to) or all (no to)
      const to = m.to; delete m.to;
      const data = JSON.stringify(m);
      for (const pl of room.players.values()) {
        if (pl.ws && pl.ws.readyState === 1 && (to == null || pl.pid === to)) pl.ws.send(data);
      }
    }
  });

  ws.on('close', () => {
    if (role === 'host' && room && room.host === ws) {
      room.host = null;
      for (const pl of room.players.values()) send(pl.ws, { t: 'hostgone' });
      const r = room;
      r.expire = setTimeout(() => {
        if (!r.host) { for (const pl of r.players.values()) try { pl.ws && pl.ws.close(); } catch {} rooms.delete(r.code); }
      }, 60_000);
    } else if (role === 'player' && player && player.ws === ws) {
      player.ws = null;
      send(room.host, { t: 'leave', pid: player.pid });
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 10_000);

async function loadCert() {
  const dir = path.join(__dirname, '.cert');
  const keyFile = path.join(dir, 'key.pem'), certFile = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  const selfsigned = require('selfsigned');
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...lanAddresses().map((ip) => ({ type: 7, ip }))];
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'kart-party.local' }], {
    days: 3650, keySize: 2048, extensions: [{ name: 'subjectAltName', altNames }],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private); fs.writeFileSync(certFile, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

server.listen(PORT, async () => {
  const ips = lanAddresses();
  if (HTTPS_PORT) {
    try {
      const creds = await loadCert();
      const secure = https.createServer(creds, handler);
      attachWs(secure);
      await new Promise((ok, fail) => secure.listen(HTTPS_PORT, ok).on('error', fail));
      httpsReady = true;
    } catch (e) { console.warn('  (HTTPS disabled: ' + e.message + ')'); }
  }
  console.log('\n  🏁 Kart Party is running!\n');
  console.log(`  Big screen:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  On your LAN:  http://${ip}:${PORT}` + (httpsReady ? `   (phones: https://${ip}:${HTTPS_PORT})` : ''));
  console.log('\n  Phones join by scanning the QR code on the big screen (same Wi-Fi).');
  if (httpsReady) console.log('  The phone link uses HTTPS so tilt steering works — accept the one-time certificate warning.');
  console.log('');
});
