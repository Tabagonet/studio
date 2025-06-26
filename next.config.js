// Forcing server restart to clear the route cache.
/** @type {import('next').NextConfig} */
const nextConfig = {
  // This comment forces a server restart to clear potential cache issues.
  // Adding another comment to trigger a full server reload and clear the cache.
  // Final comment added to ensure the cache is cleared.
  // Adding one more comment to be absolutely sure we trigger a restart and clear the build cache.
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

module.exports = nextConfig;
