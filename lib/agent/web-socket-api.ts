import { WS_BASE_URL } from '@/lib/constants';

export type Callbacks = {
  onDraftContent?: (content: string) => void | Promise<void>;
  onStreamingStart?: () => void;
  onStreamingEnd?: () => void;
  onChunk?: (chunk: string) => void;
  onUpdate?: (node: string) => void;
  onInterrupt?: (payload: string) => void | Promise<void>;
};

type CallbackType =
  | 'draftContent'
  | 'streaming'
  | 'chunk'
  | 'update'
  | 'interrupt';

type ServerMessage = {
  error?: string;
  streaming?: boolean;
  chunk?: string;
  draftContent?: string;
  update?: string;
  interrupt?: string;
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
        this.socket = new WebSocket(`${this.baseUrl}/lexer/api/ws/document`);
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

    if (typeof data.draftContent === 'string') {
      this.triggerCallback('draftContent', data.draftContent);
    }

    if (typeof data.update === 'string') {
      this.triggerCallback('update', data.update);
    }

    if (typeof data.interrupt === 'string') {
      this.triggerCallback('interrupt', data.interrupt);
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

      // Register all provided callbacks
      this.registerCallbacks(callbacks);

      // Return a promise that resolves when streaming ends OR the socket closes
      return await new Promise<void>((resolve, reject) => {
        let settled = false;

        const resolveOnce = () => {
          if (settled) return;
          settled = true;
          // Cleanup the temporary handlers for this call
          if (this.socket) {
            this.socket.onclose = originalOnClose;
            this.socket.onerror = originalOnError;
          }
          // Remove our proxy streaming handler; future calls will re-register
          this.messageCallbacks.delete('streaming');
          resolve();
        };

        const rejectOnce = (err: unknown) => {
          if (settled) return;
          settled = true;
          if (this.socket) {
            this.socket.onclose = originalOnClose;
            this.socket.onerror = originalOnError;
          }
          this.messageCallbacks.delete('streaming');
          reject(err instanceof Error ? err : new Error(String(err)));
        };

        // Proxy the streaming callback to detect end and resolve
        this.messageCallbacks.set('streaming', (isStreaming) => {
          if (isStreaming) {
            callbacks.onStreamingStart?.();
          } else {
            callbacks.onStreamingEnd?.();
            resolveOnce();
          }
        });

        // Also resolve on socket close, and reject on socket error
        const originalOnClose = this.socket?.onclose ?? null;
        const originalOnError = this.socket?.onerror ?? null;

        if (this.socket) {
          const socket = this.socket as WebSocket;
          socket.onclose = (event: CloseEvent) => {
            if (typeof originalOnClose === 'function') {
              try {
                originalOnClose.call(socket, event);
              } catch {
                // ignore errors from original handler
              }
            }
            resolveOnce();
          };

          socket.onerror = (event: Event) => {
            if (typeof originalOnError === 'function') {
              try {
                originalOnError.call(socket, event);
              } catch {
                // ignore errors from original handler
              }
            }
            rejectOnce(event instanceof ErrorEvent ? event.error : event);
          };
        }

        try {
          this.socket?.send(
            JSON.stringify({
              message: message,
              document_id: documentId,
              is_new_document: isNewDocument,
            }),
          );
        } catch (err) {
          rejectOnce(err);
        }
      });
    } catch (error) {
      console.error('Error sending message via WebSocket:', error);
      throw error;
    }
  }

  private registerCallbacks(callbacks: Callbacks): void {
    if (callbacks.onDraftContent) {
      this.messageCallbacks.set('draftContent', async (msg) => {
        const result = callbacks.onDraftContent?.(String(msg));
        if (result instanceof Promise) {
          await result;
        }
      });
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

    if (callbacks.onUpdate) {
      this.messageCallbacks.set('update', (node) =>
        callbacks.onUpdate?.(String(node)),
      );
    }

    if (callbacks.onInterrupt) {
      this.messageCallbacks.set('interrupt', async (payload) => {
        const result = callbacks.onInterrupt?.(String(payload));
        if (result instanceof Promise) {
          await result;
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
