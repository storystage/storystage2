import { createServer, type Server, type Socket } from 'node:net';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { frame, png, wav } from './package.ts';
import { DELIMITER, Pixera, PixeraError } from './pixera.ts';

interface Request {
  jsonrpc: string;
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** A stand-in for Pixera's JSON/TCP(dl) port: `answer` decides each reply's text. */
async function fakePixera(
  answer: (r: Request, socket: Socket) => void,
): Promise<{ server: Server; port: number; seen: Request[] }> {
  const seen: Request[] = [];
  const server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf(DELIMITER)) !== -1) {
        const r = JSON.parse(buffer.slice(0, end)) as Request;
        buffer = buffer.slice(end + DELIMITER.length);
        seen.push(r);
        answer(r, socket);
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: (server.address() as { port: number }).port, seen };
}

let open: { server: Server; px?: Pixera }[] = [];
afterEach(async () => {
  for (const o of open) {
    o.px?.close();
    await new Promise((r) => o.server.close(r));
  }
  open = [];
});

describe('the Pixera client', () => {
  it('sends JSON-RPC 2.0 ended by 0xPX, with the handle among the params', async () => {
    const fake = await fakePixera((r, s) =>
      s.write(JSON.stringify({ jsonrpc: '2.0', id: r.id, result: 7 }) + DELIMITER),
    );
    const px = await Pixera.connect('127.0.0.1', fake.port);
    open.push({ server: fake.server, px });
    expect(await px.call('Pixera.Timelines.Timeline.createLayer', { handle: 42 })).toBe(7);
    expect(fake.seen).toEqual([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'Pixera.Timelines.Timeline.createLayer',
        params: { handle: 42 },
      },
    ]);
  });

  it('matches replies by id, however they arrive: split, together, or out of order', async () => {
    const pending: Request[] = [];
    const fake = await fakePixera((r, s) => {
      pending.push(r);
      if (pending.length < 3) return;
      const [a, b, c] = pending.map(
        (p) => JSON.stringify({ jsonrpc: '2.0', id: p.id, result: p.method }) + DELIMITER,
      );
      // The third first, the first split across two writes, the second in the same write.
      s.write(c! + a!.slice(0, 10));
      setTimeout(() => s.write(a!.slice(10) + b!), 5);
    });
    const px = await Pixera.connect('127.0.0.1', fake.port);
    open.push({ server: fake.server, px });
    const got = await Promise.all(['Pixera.A', 'Pixera.B', 'Pixera.C'].map((m) => px.call(m)));
    expect(got).toEqual(['Pixera.A', 'Pixera.B', 'Pixera.C']);
  });

  it('gives a method with no result null, and an error as a PixeraError naming the method', async () => {
    const fake = await fakePixera((r, s) =>
      s.write(
        JSON.stringify(
          r.method === 'Pixera.Bad'
            ? { jsonrpc: '2.0', id: r.id, error: { code: -32601, message: 'Method not found' } }
            : { jsonrpc: '2.0', id: r.id },
        ) + DELIMITER,
      ),
    );
    const px = await Pixera.connect('127.0.0.1', fake.port);
    open.push({ server: fake.server, px });
    expect(await px.call('Pixera.Session.saveProject')).toBeNull();
    await expect(px.call('Pixera.Bad')).rejects.toThrow(PixeraError);
    await expect(px.call('Pixera.Bad')).rejects.toThrow(/Pixera.Bad: .*Method not found/);
    expect(px.log.map((l) => l.method)).toEqual([
      'Pixera.Session.saveProject',
      'Pixera.Bad',
      'Pixera.Bad',
    ]);
  });

  it('gives up on a call with no reply, and on a closed connection', async () => {
    const fake = await fakePixera((r, s) => {
      if (r.method === 'Pixera.Close') s.destroy();
    });
    const px = await Pixera.connect('127.0.0.1', fake.port, 50);
    open.push({ server: fake.server, px });
    await expect(px.call('Pixera.Silent')).rejects.toThrow(/no reply in 50 ms/);
    await expect(px.call('Pixera.Silent', undefined, 20)).rejects.toThrow(/no reply in 20 ms/);
    await expect(px.call('Pixera.Close')).rejects.toThrow(/closed/);
  });
});

describe('the test package', () => {
  it('writes PNGs a decoder can read back, pixel for pixel', () => {
    const rgb = frame(32, 16, [10, 20, 30], 3, 25);
    const file = png(32, 16, rgb);
    expect(file.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(file.readUInt32BE(16)).toBe(32);
    expect(file.readUInt32BE(20)).toBe(16);
    const idat = file.indexOf('IDAT');
    const rows = inflateSync(file.subarray(idat + 4, idat + 4 + file.readUInt32BE(idat - 4)));
    for (let y = 0; y < 16; y++) {
      expect(rows[y * (32 * 3 + 1)]).toBe(0); // no filter
      expect([...rows.subarray(y * 97 + 1, y * 97 + 97)]).toEqual([
        ...rgb.subarray(y * 96, y * 96 + 96),
      ]);
    }
  });

  it('moves the bar across once a second, so a wrong frame rate shows', () => {
    const barAt = (n: number) => {
      const rgb = frame(100, 20, [0, 0, 0], n, 25);
      const row = 15 * 100 * 3;
      return [...Array(100).keys()].find((x) => rgb[row + x * 3] === 255);
    };
    expect(barAt(0)).toBe(0);
    expect(barAt(25)).toBe(0);
    expect(barAt(12)).toBeGreaterThan(45);
  });

  it('writes a WAV of the right length', () => {
    const file = wav(2, 8000);
    expect(file.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(file.readUInt32LE(40)).toBe(2 * 8000 * 2);
    expect(file.length).toBe(44 + 2 * 8000 * 2);
  });
});
