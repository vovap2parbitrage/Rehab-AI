/** Computes a stable fingerprint of a file's exact bytes, or skips if Web Crypto is unavailable. */
export async function sha256File(file: File): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null

  const digest = await subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
