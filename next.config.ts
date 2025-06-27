
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@genkit-ai/core',
      '@genkit-ai/googleai',
      '@genkit-ai/firebase',
      '@genkit-ai/google-cloud',
      'zod',
      '@opentelemetry/api',
      '@opentelemetry/sdk-node',
      '@opentelemetry/instrumentation',
      '@opentelemetry/instrumentation-winston',
      '@opentelemetry/exporter-jaeger',
      '@opentelemetry/winston-transport',
      '@woocommerce/woocommerce-rest-api',
      'axios',
      'firebase-admin',
      'form-data',
      '@google/generative-ai',
      'cheerio',
      'handlebars',
      'dotprompt',
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
    ],
  },
};

export default nextConfig;
