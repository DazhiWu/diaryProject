import 'server-only'

type TimingSafeSubtleCrypto = SubtleCrypto & {
  timingSafeEqual?: (left: ArrayBuffer | ArrayBufferView, right: ArrayBuffer | ArrayBufferView) => boolean
}

export async function timingSafeEqualStrings(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])

  const subtle = crypto.subtle as TimingSafeSubtleCrypto
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(leftHash, rightHash)
  }

  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index]
  }
  return mismatch === 0
}
