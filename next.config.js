
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // This is the recommended way to handle external packages with the App Router.
    serverComponentsExternalPackages: [
      '@google-cloud/tasks',
      '@google/generative-ai',
      '@woocommerce/woocommerce-rest-api',
      'axios',
      'cheerio',
      'firebase-admin',
      'handlebars',
      'sharp',
      'zod',
    ],
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
