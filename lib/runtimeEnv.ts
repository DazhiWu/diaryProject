import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getRuntimeEnvValue(name: string): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as Record<string, unknown>)[name];

    if (typeof value === 'string') {
      return value;
    }
  } catch (error) {
    // Local Next.js dev/build does not always have a Cloudflare context.
  }

  if (typeof process !== 'undefined') {
    return process.env[name];
  }

  return undefined;
}
