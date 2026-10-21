import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";

const configuration = z.object({
  AWS_ENDPOINT_URL_S3: z.url().refine((value) => new URL(value).protocol === "https:"
    && new URL(value).hostname.endsWith(".neon.tech")),
  AWS_REGION: z.string().min(1), AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1), NEON_STORAGE_BUCKET: z.string().min(3).max(63),
});
const digest = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

// Small, server-only S3 Signature V4 adapter; credentials and object keys never reach the client.
async function storageRequest(method: "PUT" | "GET" | "DELETE", key: string, bytes?: Buffer) {
  const parsed = configuration.safeParse(process.env);
  if (!parsed.success) throw new AuthFailure("STORAGE_NOT_CONFIGURED", 503);
  const config = parsed.data;
  const url = new URL(config.AWS_ENDPOINT_URL_S3);
  url.pathname = `/${encodeURIComponent(config.NEON_STORAGE_BUCKET)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  url.search = "";
  const date = new Date().toISOString().replaceAll("-", "").replaceAll(":", "").split(".")[0] + "Z";
  const day = date.slice(0, 8);
  const hash = digest(bytes ?? new Uint8Array());
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = `${method}\n${url.pathname}\n\nhost:${url.host}\nx-amz-content-sha256:${hash}\nx-amz-date:${date}\n\n${signedHeaders}\n${hash}`;
  const scope = `${day}/${config.AWS_REGION}/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.AWS_SECRET_ACCESS_KEY}`, day), config.AWS_REGION), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${digest(canonical)}`).digest("hex");
  const response = await fetch(url, { method, cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "x-amz-date": date, "x-amz-content-sha256": hash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      ...(bytes ? { "Content-Type": "image/jpeg" } : {}),
    }, body: bytes ? new Uint8Array(bytes) : undefined,
  });
  if (!response.ok) throw new AuthFailure("STORAGE_UNAVAILABLE", 503);
  return response;
}

export async function uploadProfilePhoto(personId: string, file: File) {
  if (file.size === 0 || file.size > 2 * 1024 * 1024
    || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new AuthFailure("INVALID_PHOTO", 400);
  }
  let bytes: Buffer;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
      throw new Error("Unsupported image");
    }
    // Decode and re-encode to discard metadata and untrusted original content.
    bytes = await image.rotate().resize(512, 512, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  } catch { throw new AuthFailure("INVALID_PHOTO", 400); }
  const key = `profiles/${personId}/${randomUUID()}.jpg`;
  await storageRequest("PUT", key, bytes);
  return key;
}

export async function readProfilePhoto(key: string) {
  const response = await storageRequest("GET", key);
  return response.arrayBuffer();
}

export async function uploadReceiptPhoto(receiptId: string, file: File) {
  if (!z.uuid().safeParse(receiptId).success || file.size === 0 || file.size > 2 * 1024 * 1024
    || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new AuthFailure("INVALID_PHOTO", 400);
  let bytes: Buffer;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    bytes = await image.rotate().resize(1800, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch { throw new AuthFailure("INVALID_PHOTO", 400); }
  const key = `receipts/${receiptId}/${randomUUID()}.jpg`;
  await storageRequest("PUT", key, bytes);
  return key;
}

export async function removeProfilePhoto(key: string) {
  await storageRequest("DELETE", key);
}
