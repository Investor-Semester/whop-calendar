export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Whop Calendar</h1>
          <p className="text-neutral-400 text-sm">
            This app is designed to be embedded inside a Whop experience. When
            loaded by Whop, it will receive an experience or company ID in the
            URL automatically.
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <p className="text-sm font-medium text-neutral-300">
            Test locally by visiting one of these routes:
          </p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-neutral-500 mb-1">Member view</p>
              <a href="/experiences/test-experience" className="text-sm text-indigo-400 hover:text-indigo-300 font-mono">
                /experiences/test-experience
              </a>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Admin dashboard</p>
              <a href="/dashboard/test-company" className="text-sm text-indigo-400 hover:text-indigo-300 font-mono">
                /dashboard/test-company
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
