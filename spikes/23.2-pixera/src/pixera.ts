/**
 * A client for Pixera's API over JSON/TCP(dl): JSON-RPC 2.0, each request and each reply ended by
 * the four characters "0xPX". Pixera is the server (Settings > API, port 1400 by default). Class
 * methods take the object's handle as `handle` in `params` (Pixera's API revision 481 docs).
 */
import { connect, type Socket } from 'node:net';

export const DELIMITER = '0xPX';

export class PixeraError extends Error {
  readonly method: string;
  readonly detail: unknown;
  constructor(method: string, detail: unknown) {
    super(`${method}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    this.method = method;
    this.detail = detail;
  }
}

interface Waiting {
  method: string;
  resolve: (value: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Pixera {
  private nextId = 1;
  private buffer = '';
  private readonly waiting = new Map<number, Waiting>();
  /** Every request and reply, in order, for the spike's report. */
  readonly log: { method: string; params?: object; reply: unknown }[] = [];

  private readonly socket: Socket;
  private readonly timeoutMs: number;

  private constructor(socket: Socket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.receive(chunk));
    const fail = (e: Error) => {
      for (const w of this.waiting.values()) {
        clearTimeout(w.timer);
        w.reject(e);
      }
      this.waiting.clear();
    };
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('Pixera closed the connection')));
  }

  static connect(host = '127.0.0.1', port = 1400, timeoutMs = 10_000): Promise<Pixera> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port }, () => {
        socket.off('error', reject);
        resolve(new Pixera(socket, timeoutMs));
      });
      socket.once('error', reject);
    });
  }

  /**
   * Calls a method by its full name, such as `Pixera.Timelines.createTimeline`. Pixera answers one
   * call at a time on a connection, and never answers a method it doesn't have, so a call that
   * times out leaves the connection stuck: check methods with `Utility.getHasFunction` first.
   * `timeoutMs` overrides the connection's wait, for a call that waits on a dialog in Pixera.
   */
  call<T = unknown>(method: string, params?: object, timeoutMs = this.timeoutMs): Promise<T> {
    const id = this.nextId++;
    const request = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new PixeraError(method, `no reply in ${timeoutMs} ms`));
      }, timeoutMs);
      this.waiting.set(id, {
        method,
        resolve: (value) => {
          this.log.push({ method, ...(params ? { params } : {}), reply: value });
          resolve(value as T);
        },
        reject: (e) => {
          this.log.push({ method, ...(params ? { params } : {}), reply: { error: e.message } });
          reject(e);
        },
        timer,
      });
      this.socket.write(JSON.stringify(request) + DELIMITER);
    });
  }

  close(): void {
    this.socket.end();
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let end: number;
    while ((end = this.buffer.indexOf(DELIMITER)) !== -1) {
      const text = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + DELIMITER.length);
      if (text) this.reply(text);
    }
  }

  private reply(text: string): void {
    let message: { id?: number; result?: unknown; error?: unknown };
    try {
      message = JSON.parse(text) as typeof message;
    } catch {
      return; // Not a reply to us (a monitoring message, say).
    }
    const w = message.id === undefined ? undefined : this.waiting.get(message.id);
    if (!w) return;
    this.waiting.delete(message.id!);
    clearTimeout(w.timer);
    if (message.error !== undefined) w.reject(new PixeraError(w.method, message.error));
    else w.resolve(message.result ?? null);
  }
}
