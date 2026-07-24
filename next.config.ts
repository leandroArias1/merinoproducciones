import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // El client de Prisma 7 (@prisma/adapter-pg + pg) es solo-servidor: que no
  // intente bundlearlo para el cliente.
  serverExternalPackages: ['@prisma/adapter-pg', 'pg'],
}

export default nextConfig
