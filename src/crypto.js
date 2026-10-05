const textEncoder = new TextEncoder();

function webCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto unavailable. Open the tester through localhost or HTTPS.');
  }
  return globalThis.crypto;
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemWrap(base64, label) {
  return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g)?.join('\n') || ''}\n-----END ${label}-----`;
}

export async function generateDeviceKeyPair() {
  const keyPair = await webCrypto().subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicBytes = new Uint8Array(await webCrypto().subtle.exportKey('spki', keyPair.publicKey));
  const privateBytes = new Uint8Array(await webCrypto().subtle.exportKey('pkcs8', keyPair.privateKey));
  const publicKeyBase64 = bytesToBase64(publicBytes);
  return {
    publicKey: pemWrap(publicKeyBase64, 'PUBLIC KEY'),
    publicKeyBase64,
    privateKeyBase64: bytesToBase64(privateBytes),
  };
}

export async function signWithDeviceKey(privateKeyBase64, message) {
  if (!privateKeyBase64) throw new Error('Missing Smart OTP device private key.');
  const privateKey = await webCrypto().subtle.importKey(
    'pkcs8',
    base64ToBytes(privateKeyBase64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await webCrypto().subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    textEncoder.encode(message),
  );
  return bytesToBase64(new Uint8Array(signature));
}
