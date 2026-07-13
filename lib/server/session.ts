import 'server-only'

import { isProductionEnvironment, requireServerEnv } from '@/lib/server/env'

export type Role = 'guest' | 'viewer' | 'admin'
export type AuthenticatedRole = Exclude<Role, 'guest'>

export type SessionPayload = {
  role: AuthenticatedRole
  sessionVersion: string
  expiresAt: number
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

const COOKIE_NAME = 'diary_session'
const ROLE_MAX_AGE: Record<AuthenticatedRole, number> = {
  viewer: 30 * 24 * 60 * 60,
  admin: 7 * 24 * 60 * 60,
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null

  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
    const binary = atob(base64)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function signingKey(): Promise<CryptoKey> {
  const secret = await requireServerEnv('SESSION_SECRET')
  const secretBytes = new TextEncoder().encode(secret)
  if (secretBytes.byteLength < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes')
  }

  return crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function sign(value: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(value))
  return encodeBase64Url(new Uint8Array(signature))
}

function parseCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))
  return cookie ? cookie.slice(COOKIE_NAME.length + 1) : null
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return (payload.role === 'viewer' || payload.role === 'admin')
    && typeof payload.sessionVersion === 'string'
    && typeof payload.expiresAt === 'number'
}

export async function createSession(role: AuthenticatedRole, now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const maxAge = ROLE_MAX_AGE[role]
  const sessionVersion = await requireServerEnv('SESSION_VERSION')
  const payload: SessionPayload = { role, sessionVersion, expiresAt: now + maxAge * 1000 }
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  return { token: `${encodedPayload}.${await sign(encodedPayload)}`, maxAge }
}

export async function readSession(cookieHeader: string | null, now = Date.now()): Promise<SessionPayload | null> {
  const token = parseCookie(cookieHeader)
  if (!token) return null

  const [encodedPayload, encodedSignature, ...extra] = token.split('.')
  if (!encodedPayload || !encodedSignature || extra.length > 0) return null
  const signature = decodeBase64Url(encodedSignature)
  if (!signature) return null

  const signatureBytes = new Uint8Array(signature.byteLength)
  signatureBytes.set(signature)
  const verified = await crypto.subtle.verify('HMAC', await signingKey(), signatureBytes, new TextEncoder().encode(encodedPayload))
  if (!verified) return null

  const payloadBytes = decodeBase64Url(encodedPayload)
  if (!payloadBytes) return null

  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(payloadBytes))
    if (!isSessionPayload(payload) || payload.expiresAt <= now) return null
    return payload.sessionVersion === await requireServerEnv('SESSION_VERSION') ? payload : null
  } catch {
    return null
  }
}

export function sessionCookie(token: string, maxAge: number): string {
  const secure = isProductionEnvironment() ? '; Secure' : ''
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
}

export function clearSessionCookie(): string {
  const secure = isProductionEnvironment() ? '; Secure' : ''
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
}

export function requireRole(session: SessionPayload | null, role: AuthenticatedRole): SessionPayload {
  if (!session) throw new HttpError(401, 'Authentication required')
  if (role === 'admin' && session.role !== 'admin') throw new HttpError(403, 'Forbidden')
  return session
}

export const requireSession = (session: SessionPayload | null) => requireRole(session, 'viewer')
export const requireViewer = requireSession
export const requireAdmin = (session: SessionPayload | null) => requireRole(session, 'admin')
