import { useEffect, useRef } from "react";
import { useAuth } from "../context/useAuth";

type WsMessage = {
  type: string;
  [key: string]: unknown;
};

export const useWebSocket = (onMessage: (msg: WsMessage) => void) => {
  const onMessageRef = useRef(onMessage);
  const { accessToken } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;

    if (!accessToken) {
      return;
    }

    const ws = new WebSocket("ws://localhost:3000");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: accessToken }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      onMessageRef.current(msg);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [accessToken, onMessage]);

  const send = (msg: object) => {
    wsRef.current?.send(JSON.stringify(msg));
  };

  return { send };
};
