
import type {NextConfig} from 'next';
import path from 'path'; // Ensure path is imported

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
      // Prevent bundling of Node.js core modules and problematic transitive dependencies for the client
      config.resolve.fallback = {
        ...config.resolve.fallback, // Spread existing fallbacks if any
        dns: false,
        net: false,
        tls: false,
        fs: false,
        child_process: false, // Also common for server-side utils
        'aws-sdk': false, // Add fallback for aws-sdk
        'mock-aws-s3': false, // Add fallback for mock-aws-s3
        'nock': false, // Add fallback for nock
      };
    }

    // Alias the problematic HTML file to 'false' to make Webpack treat it as an empty module
    // This prevents the "Unknown module type" error for this specific file.
    config.resolve.alias = {
      ...config.resolve.alias,
      [path.join(__dirname, 'node_modules/@mapbox/node-pre-gyp/lib/util/nw-pre-gyp/index.html')]: false,
    };

    return config;
  },
};

export default nextConfig;
