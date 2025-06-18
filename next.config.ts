
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.gstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent bundling of Node.js core modules for the client
      // This is often needed when server-side packages are inadvertently
      // pulled into the client bundle via transitive dependencies.
      config.resolve.fallback = {
        ...config.resolve.fallback, // Spread existing fallbacks if any
        dns: false,
        net: false,
        tls: false,
        fs: false, 
        child_process: false, // Also common for server-side utils
      };
    }
    return config;
  },
};

export default nextConfig;
