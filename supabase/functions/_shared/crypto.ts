const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secretKeyBytes(): Uint8Array {
  const secret = Deno.env.get('AI_SETTINGS_ENCRYPTION_KEY');
  if (!secret) throw new Error('AI_SETTINGS_ENCRYPTION_KEY belum diset di server.');
  const bytes = base64ToBytes(secret);
  if (bytes.byteLength !== 32) {
    throw new Error('AI_SETTINGS_ENCRYPTION_KEY harus 32 byte (base64).');
  }
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    arrayBufferOf(secretKeyBytes()),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSecret(plain: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plain),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const key = await importKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: arrayBufferOf(base64ToBytes(iv)) },
    key,
    arrayBufferOf(base64ToBytes(ciphertext)),
  );
  return decoder.decode(decrypted);
}

export function last4(value: string): string {
  return value.slice(-4);
}
