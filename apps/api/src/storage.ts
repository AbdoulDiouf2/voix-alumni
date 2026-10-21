import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Opaque keys and private objects only; no bucket name reaches the browser. */
export interface PrivateObjectStore {
  provider: "r2" | "isolated-test";
  putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
  headObject(key: string): Promise<{ byteSize: number } | null>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<URL>;
  removeObject(key: string): Promise<void>;
}

export function objectKey(scope: string, kind: string) {
  return `${scope}/${kind}/${randomUUID()}`;
}

export function fileSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createObjectStore(): PrivateObjectStore | null {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } =
    process.env;
  if (R2_ENDPOINT && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    const endpoint = new URL(R2_ENDPOINT);
    if (
      endpoint.protocol !== "https:" ||
      !endpoint.hostname.endsWith(".eu.r2.cloudflarestorage.com")
    )
      throw new Error("R2_ENDPOINT doit viser la juridiction eu en HTTPS");
    const client = new S3Client({
      region: "auto",
      endpoint: endpoint.toString(),
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    return {
      provider: "r2",
      async putObject(key, bytes, contentType) {
        await client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: bytes,
            ContentType: contentType,
          }),
        );
      },
      async getObject(key) {
        const result = await client.send(
          new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
        );
        if (!result.Body) throw new Error("Objet absent");
        return result.Body.transformToByteArray();
      },
      async headObject(key) {
        try {
          const result = await client.send(
            new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }),
          );
          return { byteSize: result.ContentLength ?? 0 };
        } catch (error) {
          if ((error as { name?: string }).name === "NotFound") return null;
          throw error;
        }
      },
      async createDownloadUrl(key, expiresInSeconds) {
        return new URL(
          await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
            { expiresIn: expiresInSeconds },
          ),
        );
      },
      async removeObject(key) {
        await client.send(
          new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }),
        );
      },
    };
  }
  if (process.env.APP_ENV !== "e2e" && process.env.APP_ENV !== "test")
    return null;
  const root = join("/tmp", `voix-alumni-${process.env.APP_ENV}-objects`);
  const safe = (key: string) => {
    if (!/^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-f0-9-]{36}$/.test(key))
      throw new Error("INVALID_OBJECT_KEY");
    return join(root, key);
  };
  return {
    provider: "isolated-test",
    async putObject(key, bytes) {
      const path = safe(key);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, bytes, { flag: "wx" });
    },
    async getObject(key) {
      return readFile(safe(key));
    },
    async headObject(key) {
      try {
        return { byteSize: (await readFile(safe(key))).length };
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") return null;
        throw error;
      }
    },
    async createDownloadUrl() {
      throw new Error("TEST_STORE_HAS_NO_PUBLIC_URL");
    },
    async removeObject(key) {
      await unlink(safe(key)).catch((error: unknown) => {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      });
    },
  };
}
