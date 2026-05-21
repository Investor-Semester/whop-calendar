/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the Whop iFrame to embed this app
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Allow Whop to embed the app in an iFrame
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
