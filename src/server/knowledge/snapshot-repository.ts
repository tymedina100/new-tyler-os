import { open } from "node:fs/promises";

/** Bounded cache IO. Open/read the same handle; never log private source content. */
export async function readSnapshotSource(
  path: string | undefined,
  inline: string | undefined,
  maxBytes: number,
): Promise<string | null> {
  if (!path) {
    if (!inline) return null;
    if (Buffer.byteLength(inline, "utf8") > maxBytes) throw new Error("Snapshot is too large.");
    return inline;
  }
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes)
      throw new Error("Snapshot must be a bounded regular file.");
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) throw new Error("Snapshot is too large.");
    return buffer.subarray(0, offset).toString("utf8");
  } finally {
    await handle.close();
  }
}
