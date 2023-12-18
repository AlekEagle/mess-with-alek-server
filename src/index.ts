import Express from 'express';
import BasicAuth, {
  returnAllUserTokens,
  fromUsername as authFromUsername,
} from './BasicAuth';
import { readFile } from 'fs/promises';
let packageJSON: any;
import {
  sendPrompt,
  server as WSServer,
  clients,
  disconnectUsername,
} from './WebSocketServer';
import { ServerRequest } from './data-shim';

(async function () {
  packageJSON = JSON.parse(await readFile('./package.json', 'utf8'));
  if (process.env.PRINT_TOKENS === 'true') {
    console.log((await returnAllUserTokens()).join('\n'));
  }
})();

const app = Express();

app.use(Express.json());
app.use(Express.urlencoded({ extended: true }));
app.use(Express.text());

// add CORS and OPTIONS support

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.send();
});

app.all('/', (req, res) => {
  res.json({ hello: 'world', version: packageJSON.version });
});

app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }
  if (req.path === '/client') {
    next();
    return;
  }
  if (!req.headers.authorization) {
    res.status(401).json({ error: 'Unauthorized' });
    console.log('Blocked request without authorization header');
    return;
  }
  const auth = new BasicAuth(req.headers.authorization);
  if (!(await auth.hasPermissions())) {
    res.status(401).json({ error: 'Unauthorized' });
    console.log(`Blocked request from ${auth.username}`);
    return;
  }
  (req as unknown as ServerRequest).user = auth;
  next();
});

app.get('/clients', async (req, res) => {
  res.json(
    Array.from(clients.values()).map((c) => {
      return { computer: c.clientName, username: c.username };
    }),
  );
});

app.post('/user', async (req, res) => {
  if (!(req as unknown as ServerRequest).user.admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { username, password, admin } = req.body;
  const basicAuth = BasicAuth.FromUserPass(username, password);
  if (await basicAuth.hasPermissions()) {
    res.status(409).json({ error: 'User already exists' });
    return;
  }
  basicAuth.admin = admin;
  try {
    await basicAuth.givePermissions();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
  res.status(201).json({ username, password, admin, token: basicAuth.token });
});

app.delete('/user', async (req, res) => {
  if (!(req as unknown as ServerRequest).user.admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { username } = req.body;
  const basicAuth = await authFromUsername(username);
  if (!(await basicAuth.hasPermissions())) {
    res.status(404).json({ error: 'User does not exist' });
    return;
  }
  try {
    await basicAuth.revokePermissions();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
  disconnectUsername(username);
  res.status(200).json({ username });
});

app.patch('/user', async (req, res) => {
  if (!(req as unknown as ServerRequest).user.admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { username, password, admin } = req.body;
  const basicAuth = await authFromUsername(username);
  if (!(await basicAuth.hasPermissions())) {
    res.status(404).json({ error: 'User does not exist' });
    return;
  }
  if (password) {
    basicAuth.password = password;
  }
  if (admin !== undefined) {
    basicAuth.admin = admin;
  }
  try {
    await basicAuth.givePermissions();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
  disconnectUsername(username);
  res.status(200).json({ username, password, admin });
});

app.post('/prompt', (req, res) => {
  if (req.headers['content-type'] !== 'text/plain')
    return res.status(415).json({ error: 'Unsupported media type' });

  try {
    sendPrompt(req.body);
    res.json(
      Array.from(clients.values()).map((c) => {
        return { computer: c.clientName, username: c.username };
      }),
    );
  } catch (err) {
    res.status(503).send(err.message);
  }
});

const server = app.listen(3000, () => {
  console.log('Listening on port 3000');
});

// Handle websocket connections from clients via express (app) and pass them to WSServer
server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade !== 'websocket') return socket.destroy();
  if (req.url !== '/client') return socket.destroy();
  WSServer.handleUpgrade(req, socket, head, (ws) => {
    WSServer.emit('connection', ws, req);
  });
});
