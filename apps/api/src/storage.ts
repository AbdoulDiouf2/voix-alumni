/** Port for private object storage. The Cloudflare R2 adapter belongs to a later lot. */
export interface PrivateObjectStore {
  createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<URL>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<URL>;
  removeObject(key: string): Promise<void>;
}
