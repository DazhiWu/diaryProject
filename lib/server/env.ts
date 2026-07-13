import 'server-only'

import { getRuntimeEnvValue } from '@/lib/runtimeEnv'

export type AuthConfiguration = {
  viewer: string | undefined
  admin: string | undefined
}

export function validateAuthConfiguration({ viewer, admin }: AuthConfiguration): asserts viewer is string & asserts admin is string {
  if (!viewer) {
    throw new Error('AUTH_PASSWORD_VIEWER must be configured')
  }

  if (!admin) {
    throw new Error('AUTH_PASSWORD_ADMIN must be configured')
  }

  if (viewer === admin) {
    throw new Error('AUTH_PASSWORD_VIEWER and AUTH_PASSWORD_ADMIN must be distinct')
  }
}

export async function requireServerEnv(name: string): Promise<string> {
  const value = await getRuntimeEnvValue(name)

  if (!value) {
    throw new Error(`${name} must be configured`)
  }

  return value
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production'
}
