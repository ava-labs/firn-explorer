// Next 16 templates remount on every navigation (auto-keyed per segment),
// so a CSS animation on the wrapper re-runs each time. This gives every
// page a subtle entrance without per-page wiring.

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
