import Express from 'express';
import BasicAuth, { returnAllUserTokens } from './BasicAuth';
import { readFile } from 'fs/promises';
let packageJSON: any;
import { sendPrompt, server as WSServer } from './WebSocketServer';

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

app.all('/', (req, res) => {
  res.json({ hello: 'world', version: packageJSON.version });
});

app.use(async (req, res, next) => {
  if (req.path === '/client') {
    next();
    return;
  }
  if (!req.headers.authorization) return res.status(401).send('Unauthorized');
  const auth = new BasicAuth(req.headers.authorization);
  if (!(await auth.hasPermissions())) return res.status(403).send('Forbidden');
  next();
});

app.post('/prompt', (req, res) => {
  if (req.headers['content-type'] !== 'text/plain')
    return res.status(415).send('Unsupported Media Type');

  try {
    sendPrompt(req.body);
    res.status(204).send();
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
  WSServer.handleUpgrade(req, socket, head, ws => {
    WSServer.emit('connection', ws, req);
  });
});
