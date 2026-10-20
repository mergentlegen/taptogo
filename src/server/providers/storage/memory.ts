import type { StorageProvider, StoredObject } from "./types";

/**
 * In-memory storage for development. "Signed URLs" are data: URLs, which the
 * CSP allows for images. Replaced by Supabase Storage (private bucket) later.
 */
export class LocalMockStorageProvider implements StorageProvider {
  readonly name = "memory";
  private readonly objects = new Map<string, { contentType: string; body: Uint8Array }>();

  async upload({
    key,
    contentType,
    body,
  }: {
    key: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<StoredObject> {
    this.objects.set(key, { contentType, body: body.slice() });
    return { key, contentType, size: body.byteLength };
  }

  async getSignedUrl(key: string): Promise<string | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    return `data:${object.contentType};base64,${Buffer.from(object.body).toString("base64")}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
