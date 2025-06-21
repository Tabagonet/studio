const path = require('path');

const nextConfig = {
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

    // Add fallbacks for problematic transitive dependencies
    // These should apply to both server and client builds to prevent "Module not found"
    // during server build, and to exclude from client bundle.
    config.resolve.fallback['aws-sdk'] = false;
    config.resolve.fallback['mock-aws-s3'] = false;
    config.resolve.fallback['nock'] = false;
    config.resolve.fallback['node-gyp'] = false; // For @mapbox/node-pre-gyp
    config.resolve.fallback['npm'] = false; // For @mapbox/node-pre-gyp
    config.resolve.fallback['@opentelemetry/exporter-jaeger'] = false; // For @opentelemetry/sdk-node

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

    // Ignore "Critical dependency: the request of a dependency is an expression"
    // for specific @opentelemetry modules if they cause persistent warnings.
    // This is a more aggressive approach and should be used cautiously.
    config.module.rules.push({
      test: /@opentelemetry\/instrumentation/,
      parser: { exprContextCritical: false },
    });
    config.module.rules.push({
      test: /handlebars/, // Handlebars also uses dynamic requires that Webpack warns about
      parser: { exprContextCritical: false },
    });


    return config;
  },
};

module.exports = nextConfig;
