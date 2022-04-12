import WS from 'ws';
import BasicAuth from './BasicAuth';

const clients: Map<number, WS> = new Map(),
  clientHeartbeatTimeout: NodeJS.Timeout[] = [],
  server = new WS.Server({ noServer: true }),
  heartbeatInterval = 10000;

let sid = 0;

interface ServerPayloads {
  IDENTIFY: {
    heartbeatInterval: number;
  };

  HEARTBEAT: {
    timestamp: number;
  };

  IDENTIFIED: {
    sid: string;
    name: string;
  };

  MESSAGE: string;
}

enum ServerCloseCodes {
  OK = 1000,
  ServerError = 4000,
  InvalidToken = 4001,
  InvalidPayload = 4002,
  MissedHeartbeat = 4003,
  AlreadyIdentified = 4004
}

enum ClientCloseCodes {
  OK = 1000,
  ClientError = 4000,
  InvalidPayload = 4001,
  MissedHeartbeat = 4002
}

interface ClientPayloads {
  IDENTITY: {
    token: string;
    name: string;
  };

  HEARTBEAT: {
    timestamp: number;
  };
}

interface GenericPayload {
  op: string;
  d: any;
}

function sendPayload<T extends keyof ServerPayloads>(
  ws: WS,
  op: T,
  d: ServerPayloads[T]
) {
  ws.send(JSON.stringify({ op, d }));
}

function sendPayloadToAll<T extends keyof ServerPayloads>(
  op: T,
  d: ServerPayloads[T]
) {
  clients.forEach(ws => sendPayload(ws, op, d));
}

function sendPrompt(message: string) {
  if (clients.size === 0) throw new Error('No clients connected');
  sendPayloadToAll('MESSAGE', message);
}

function clientFirstConnect(ws: WS) {
  sendPayload(ws, 'IDENTIFY', {
    heartbeatInterval
  });
  ws.once('message', async (data: string) => {
    const payload: GenericPayload = JSON.parse(data);
    if (payload.op !== 'IDENTITY') {
      ws.close(ServerCloseCodes.InvalidPayload);
      return;
    }
    const token = payload.d.token;
    if (!token) {
      ws.close(ServerCloseCodes.InvalidPayload);
      return;
    }
    const auth = new BasicAuth(token);
    if (!(await auth.hasPermissions())) {
      ws.close(ServerCloseCodes.InvalidToken);
      return;
    }
    const clientSid = sid++;
    sendPayload(ws, 'IDENTIFIED', {
      sid: clientSid.toString(),
      name: payload.d.name
    });
    console.log(`Client ${payload.d.name} (${clientSid}) connected`);
    ws.on('close', () => {
      console.log(`Client ${payload.d.name} (${clientSid}) disconnected`);
      clearTimeout(clientHeartbeatTimeout[clientSid]);
      delete clientHeartbeatTimeout[clientSid];
      clients.delete(clientSid);
      if (clients.size === 0) sid = 0;
    });
    ws.on('error', () => {
      console.log(`Client ${payload.d.name} (${clientSid}) disconnected`);
      clearTimeout(clientHeartbeatTimeout[clientSid]);
      delete clientHeartbeatTimeout[clientSid];
      clients.delete(clientSid);
      if (clients.size === 0) sid = 0;
      ws.close(ServerCloseCodes.ServerError);
    });
    ws.on('message', (data: string) => {
      const payload: GenericPayload = JSON.parse(data);
      handleClientPayload(clientSid, payload);
    });
  });
}

async function handleClientPayload(wsID: number, data: GenericPayload) {
  const ws = clients.get(wsID);
  if (!ws) return;
  switch (data.op) {
    case 'IDENTIFY':
      ws.close(ServerCloseCodes.AlreadyIdentified);
      break;
    case 'HEARTBEAT':
      clearTimeout(clientHeartbeatTimeout[wsID]);
      setTimeout(
        () =>
          sendPayload(ws, 'HEARTBEAT', {
            timestamp: data.d.timestamp
          }),
        heartbeatInterval / 2
      );
      clientHeartbeatTimeout[wsID] = setTimeout(() => {
        ws.close(ServerCloseCodes.MissedHeartbeat);
      }, data.d.timestamp + heartbeatInterval - Date.now());
      break;
    default:
      ws.close(ServerCloseCodes.InvalidPayload);
  }
}

server.on('connection', clientFirstConnect);

export { sendPrompt, server };
