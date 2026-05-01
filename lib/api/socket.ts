import { Socket } from "phoenix";
import { API_BASE_URL } from "./client";

let socketSingleton: Socket | null = null;

function deriveWsUrl(httpBase: string): string {
  // http://host:port -> ws://host:port/socket/v2/websocket
  // https://host -> wss://host/socket/v2/websocket
  return httpBase.replace(/^http/, "ws") + "/socket/v2/websocket";
}

export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("getSocket() called on the server; gate behind 'use client' / useEffect");
  }
  if (!socketSingleton) {
    socketSingleton = new Socket(deriveWsUrl(API_BASE_URL), {
      // Reconnect with capped exponential backoff (matches Phoenix recommendation)
      reconnectAfterMs: (tries: number) => [1000, 2000, 5000, 10000][tries - 1] ?? 10000,
      heartbeatIntervalMs: 30000,
    });
    socketSingleton.connect();
  }
  return socketSingleton;
}
