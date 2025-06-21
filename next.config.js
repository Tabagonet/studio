/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@genkit-ai/core', '@genkit-ai/googleai'],
  images: {
    remotePatterns: [
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
    ],
  },
};

module.exports = nextConfig;
