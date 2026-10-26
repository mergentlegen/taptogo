/**
 * A small ZIP writer (the PKZIP format: a local header + data per file, then a central
 * directory). Compression uses the platform's `CompressionStream("deflate-raw")`, which
 * Node and the serverless runtime both provide. It replaces a zip library that was
 * about 6% of the server bundle, which the serverless host limits in size.
 */

export type ZipEntry = { name: string; data: Uint8Array | string };

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** MS-DOS date and time, the only timestamp format ZIP headers have (local time, 2-second steps). */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Below this size deflate rarely pays for itself. */
const MIN_COMPRESSED = 64;
const UTF8_NAMES = 0x0800;

type Prepared = {
  name: Uint8Array;
  method: 0 | 8;
  crc: number;
  size: number;
  body: Uint8Array<ArrayBuffer>;
};

export async function createZip(
  entries: readonly ZipEntry[],
  modified: Date = new Date(),
): Promise<Uint8Array<ArrayBuffer>> {
  const stamp = dosDateTime(modified);

  const prepared: Prepared[] = await Promise.all(
    entries.map(async ({ name, data }) => {
      const raw = new Uint8Array(typeof data === "string" ? encoder.encode(data) : data);
      const packed = raw.length >= MIN_COMPRESSED ? await deflateRaw(raw) : raw;
      const compressed = packed.length < raw.length;
      return {
        name: encoder.encode(name),
        method: compressed ? 8 : 0,
        crc: crc32(raw),
        size: raw.length,
        body: compressed ? packed : raw,
      } satisfies Prepared;
    }),
  );

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of prepared) {
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, UTF8_NAMES, true);
    local.setUint16(8, file.method, true);
    local.setUint16(10, stamp.time, true);
    local.setUint16(12, stamp.date, true);
    local.setUint32(14, file.crc, true);
    local.setUint32(18, file.body.length, true);
    local.setUint32(22, file.size, true);
    local.setUint16(26, file.name.length, true);
    local.setUint16(28, 0, true); // extra field length
    chunks.push(new Uint8Array(local.buffer), file.name, file.body);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true); // version made by
    entry.setUint16(6, 20, true); // version needed
    entry.setUint16(8, UTF8_NAMES, true);
    entry.setUint16(10, file.method, true);
    entry.setUint16(12, stamp.time, true);
    entry.setUint16(14, stamp.date, true);
    entry.setUint32(16, file.crc, true);
    entry.setUint32(20, file.body.length, true);
    entry.setUint32(24, file.size, true);
    entry.setUint16(28, file.name.length, true);
    entry.setUint32(42, offset, true); // offset of the local header
    central.push(new Uint8Array(entry.buffer), file.name);

    offset += 30 + file.name.length + file.body.length;
  }

  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, prepared.length, true);
  end.setUint16(10, prepared.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);

  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const zip = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    zip.set(part, position);
    position += part.length;
  }
  return zip;
}
