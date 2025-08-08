
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@google-cloud/tasks',
      'zod',
      '@woocommerce/woocommerce-rest-api',
      'axios',
      'firebase-admin',
      '@google/generative-ai',
      'cheerio',
      'handlebars',
      'debug',
      'sharp', // mantenemos sharp para compatibilidad
    ],
    outputFileTracingIncludes: {
      // Incluye binarios de sharp en el bundle para Vercel
      './src/app/api/**': ['./node_modules/sharp/**/*'],
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'gtrexsolution.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'www.gstatic.com' },
      { protocol: 'https', hostname: 'www.google.com' },
      { protocol: 'https', hostname: 'quefoto.es' },
      { protocol: 'https', hostname: 's.w.org' },
      { protocol: 'https', hostname: 'www.farmacialavidriera.com' },
      { protocol: 'http', hostname: 'www.farmacialavidriera.com' },
      { protocol: 'https', hostname: 'treezom.com' },
      { protocol: 'https', hostname: 'esdron.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    formats: ['image/avif', 'image/webp'], // genera formatos modernos automáticamente
  },
};

module.exports = nextConfig;
