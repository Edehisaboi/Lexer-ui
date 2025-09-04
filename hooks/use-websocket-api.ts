"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE_URL } from "@/lib/constants";


type Callbacks = {
    onMessage?: (message: string) => void;
    onStreamingStart?: () => void;
    onStreamingEnd?: () => void;
    onChunk?: (chunk: string) => void;
};

type Document = { id: string };

export function useWebSocketApi() {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const handlersRef = useRef<{
        message?: (v: string) => void;
        chunk?: (v: string) => void;
        streaming?: (v: boolean) => void;
    }>({});

    const handleMessage = useCallback((event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);

            if (data?.error) {
                console.error("WebSocket payload error: ", data.error);
                return;
            }
            if (data?.streaming !== undefined) {
                handlersRef.current.streaming?.(!!data.streaming);
                return;
            }
            if (data?.chunk) {
                handlersRef.current.chunk?.(data.chunk as string);
                return;
            }
            if (data?.response) {
                handlersRef.current.message?.(data.response as string);
            }
        } catch (e) {
            console.error("WebSocket parse error:", e);
        }
    }, []);

    const connect = useCallback(() => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(`${WS_BASE_URL}/ws/document`);
        socketRef.current = ws;

        ws.onopen = () => setIsConnected(true);
        ws.onclose = () => setIsConnected(false);
        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            setIsConnected(false);
        };
        ws.onmessage = handleMessage;
    }, [handleMessage]);

    const disconnect = useCallback(() => {
        socketRef.current?.close();
        socketRef.current = null;
        handlersRef.current = {};
        setIsConnected(false);
    }, []);

    const setCallbacks = useCallback((c: Callbacks) => {
        if (c.onMessage) handlersRef.current.message = c.onMessage;
        if (c.onChunk) handlersRef.current.chunk = c.onChunk;
        if (c.onStreamingStart || c.onStreamingEnd) {
            handlersRef.current.streaming = (isStreaming: boolean) => {
                if (isStreaming) c.onStreamingStart?.();
                else c.onStreamingEnd?.();
            };
        }
    }, []);

    const sendMessage = useCallback(
        (document: Document, message: string, callbacks: Callbacks = {}) => {
            if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
                console.warn("WebSocket not connected; reconnecting...");
                connect();
            }

            setCallbacks(callbacks);

            socketRef.current?.send(
                JSON.stringify({
                    message: message,
                    document_id: document.id,
                })
            );
        },
        [connect, setCallbacks]
    );

    useEffect(() => {
        connect();
        return disconnect;
    }, [connect, disconnect]);

    return { isConnected, sendMessage, disconnect, setCallbacks };
}
