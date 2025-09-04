import { WS_BASE_URL } from '@/lib/constants';

export type Callbacks = {
  onMessage?: (message: string) => void;
  onStreamingStart?: () => void;
  onStreamingEnd?: () => void;
  onChunk?: (chunk: string) => void;
};

type CallbackType = 'message' | 'streaming' | 'chunk';

type ServerMessage = {
  error?: string;
  streaming?: boolean;
  chunk?: string;
  response?: string;
};

export class WebSocketApiService {
  private socket: WebSocket | null = null;
  private messageCallbacks: Map<CallbackType, (data: unknown) => void> =
    new Map();
  private connected = false;
  private connectionPromise: Promise<void> | null = null;
  private readonly connectionTimeout = 10_000; // ms
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = WS_BASE_URL;
  }

  connect(): Promise<void> {
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.socket) this.socket.close();
        this.connectionPromise = null;
        reject(new Error('WebSocket connection timeout'));
      }, this.connectionTimeout);

      try {
        this.socket = new WebSocket(`${this.baseUrl}/ws/document`);
      } catch (err) {
        clearTimeout(timeoutId);
        this.connectionPromise = null;
        reject(err);
        return;
      }

      this.socket.onopen = () => {
        this.connected = true;
        clearTimeout(timeoutId);
        resolve();
      };

      this.socket.onmessage = (event: MessageEvent) =>
        this.handleMessage(event);

      this.socket.onerror = (error: Event) => {
        clearTimeout(timeoutId);
        this.connectionPromise = null;
        reject(error instanceof ErrorEvent ? error.error : error);
      };

      this.socket.onclose = () => {
        this.connected = false;
        this.connectionPromise = null;
      };
    });

    return this.connectionPromise;
  }

  private handleMessage(event: MessageEvent): void {
    let data: ServerMessage;
    try {
      data = JSON.parse(event.data as string) as ServerMessage;
    } catch (e) {
      console.error('WebSocket message parse error:', e);
      return;
    }

    if (data.error) {
      console.error('WebSocket error payload:', data.error);
      return;
    }

    if (typeof data.streaming === 'boolean') {
      this.handleStreamingUpdate(data.streaming);
      return;
    }

    if (typeof data.chunk === 'string') {
      this.triggerCallback('chunk', data.chunk);
      return;
    }

    if (typeof data.response === 'string') {
      this.triggerCallback('message', data.response);
    }
  }

  private handleStreamingUpdate(isStreaming: boolean): void {
    const streamingCallback = this.messageCallbacks.get('streaming');
    if (streamingCallback) streamingCallback(isStreaming);
  }

  private triggerCallback(type: CallbackType, payload: unknown): void {
    const cb = this.messageCallbacks.get(type);
    if (cb) cb(payload);
  }

  async generateDocument(
    documentId: string,
    isNewDocument: boolean,
    message: string,
    callbacks: Callbacks = {},
  ): Promise<void> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      this.registerCallbacks(callbacks);

      this.socket?.send(
        JSON.stringify({
          message: message,
          document_id: documentId,
        }),
      );
    } catch (error) {
      console.error('Error sending message via WebSocket:', error);
    }
  }

  private registerCallbacks(callbacks: Callbacks): void {
    if (callbacks.onMessage) {
      this.messageCallbacks.set('message', (msg) =>
        callbacks.onMessage?.(String(msg)),
      );
    }

    if (callbacks.onStreamingStart || callbacks.onStreamingEnd) {
      this.messageCallbacks.set('streaming', (isStreaming) => {
        if (isStreaming) {
          callbacks.onStreamingStart?.();
        } else {
          callbacks.onStreamingEnd?.();
        }
      });
    }

    if (callbacks.onChunk) {
      this.messageCallbacks.set('chunk', (chunk) =>
        callbacks.onChunk?.(String(chunk)),
      );
    }
  }

  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } finally {
        this.socket = null;
        this.connected = false;
        this.connectionPromise = null;
        this.messageCallbacks.clear();
      }
    }
  }
}
