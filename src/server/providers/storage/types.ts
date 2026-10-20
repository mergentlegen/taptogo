export type StoredObject = {
  key: string;
  contentType: string;
  size: number;
};

/**
 * Private file storage (organization logos). Objects are never public:
 * pages render them through short-lived signed URLs.
 */
export interface StorageProvider {
  readonly name: string;
  upload(input: { key: string; contentType: string; body: Uint8Array }): Promise<StoredObject>;
  /** Short-lived URL for displaying the object; null if it does not exist. */
  getSignedUrl(key: string, options?: { expiresInSeconds?: number }): Promise<string | null>;
  delete(key: string): Promise<void>;
}
