const apiOrigin = process.env.MONALISA_API_ORIGIN;

export default {
  allowedDevOrigins: ['127.0.0.1'],
  async rewrites() {
    if (!apiOrigin) return [];
    const upstream = new URL(apiOrigin);
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password ||
        upstream.pathname !== '/' || upstream.search || upstream.hash) {
      throw new Error('MONALISA_API_ORIGIN must be an HTTPS origin.');
    }
    return {
      beforeFiles: [{ source: '/api/:path*', destination: upstream.origin + '/api/:path*' }],
    };
  },
};
