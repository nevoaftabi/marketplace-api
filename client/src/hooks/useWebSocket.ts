import { useEffect, useRef } from 'react';
import { useAuth } from '../context/useAuth';

export const useWebSocket = (onMessage: (msg: any) => void) => {
    const { accessToken } = useAuth()
    const wsRef = useRef<WebSocket | null>(null);   

    useEffect(() => {
        if(!accessToken) {
            return;
        }

        const ws = new WebSocket('ws://localhost:3000');
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'auth', token: accessToken }))
        }

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            onMessage(msg);
        }
        
        return () => ws.close();
    }, [accessToken]);

    const send = (msg: object) => {
        wsRef.current?.send(JSON.stringify(msg));
    }

    return { send } 
}