

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@google-cloud/tasks',
      'zod',
      '@woocommerce/woocommerce-rest-api',
      'axios',
      'firebase-admin',
      'form-data',
      '@google/generative-ai',
      'cheerio',
      'handlebars',
      'debug',
      'supports-color',
      'sharp',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gtrexsolution.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'www.gstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'www.google.com',
      },
      {
        protocol: 'https',
        hostname: 'quefoto.es',
      },
      {
        protocol: 'https',
        hostname: 's.w.org',
      },
      {
        protocol: 'https',
        hostname: 'www.farmacialavidriera.com',
      },
      {
        protocol: 'https',
        hostname: 'treezom.com',
      },
      {
        protocol: 'https',
        hostname: 'esdron.com',
      },
      
    ],
  },
};

module.exports = nextConfig;
