import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
}

/**
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
export default function configureNext(phase) {
  if (phase === PHASE_DEVELOPMENT_SERVER) initOpenNextCloudflareForDev()
  return nextConfig
}
