
/** @type {import('next').NextConfig} */
const nextConfig = {
  // This comment forces a server restart to clear potential cache issues.
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
      {
        protocol: 'https',
        hostname: 's.w.org',
      },
      {
        protocol: 'https',
        hostname: 'www.farmacialavidriera.com',
      },
      {
        protocol: 'https,',
        hostname: 'treezom.com',
      },
    ],
  },
};

module.exports = nextConfig;
