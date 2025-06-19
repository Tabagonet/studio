
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
    // Ensure resolve.fallback and resolve.alias objects exist
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.alias = config.resolve.alias || {};

    // Add fallbacks for problematic transitive dependencies (aws-sdk, etc.)
    // These should apply to both server and client builds.
    config.resolve.fallback['aws-sdk'] = false;
    config.resolve.fallback['mock-aws-s3'] = false;
    config.resolve.fallback['nock'] = false;

    // Client-specific fallbacks for Node.js core modules
    if (!isServer) {
      config.resolve.fallback.dns = false;
      config.resolve.fallback.net = false;
      config.resolve.fallback.tls = false;
      config.resolve.fallback.fs = false;
      config.resolve.fallback.child_process = false;
    }

    // Alias the problematic HTML file to 'false' to make Webpack treat it as an empty module
    config.resolve.alias[path.join(__dirname, 'node_modules/@mapbox/node-pre-gyp/lib/util/nw-pre-gyp/index.html')] = false;

    return config;
  },
};

export default nextConfig;
