import { WebSocket } from "ws";
import BasicAuth from "./BasicAuth";
import { Request } from "express";

declare class ClientWS extends WebSocket {
  public clientName: string;
  public clientId: number;
  public username: string;
  public password: string;
}

declare class ServerRequest extends Request {
  public user: BasicAuth;
}
