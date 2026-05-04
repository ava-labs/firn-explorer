"use client";

// Next 16 templates remount on every navigation (auto-keyed per
// segment) — that's deliberate when you want useEffect to resync or
// state to reset, and we use it for the subtle entrance animation
// (`page-fade` in globals.css). The catch: back/forward navigations
// also trigger a remount, so the same animation re-fires over content
// that's already in the React Query cache. The animation starts at
// opacity 0 with a 6px translate and a staggered children fade — net
// effect is a 400ms blank flash on every back-button press, which
// reads as "loading is broken" even though the data is sitting right
// there in cache.
//
// Fix: skip the fade when the navigation came from a popstate
// (browser back/forward). Forward navigations still get the entrance.
//
// Detection: a module-scoped flag set by a single `popstate`
// listener. Templates remount AFTER popstate fires, so the flag is
// accurate when we read it during render. Reset on consume so the
// next forward navigation gets the fade back.

import { useState } from "react";

let cameFromPopstate = false;

if (typeof window !== "undefined") {
  // Window-level singleton — module re-eval in dev/HMR re-runs this
  // top-level block, so guard against double-binding via a property
  // on window itself.
  const w = window as Window & { __firnPopstateBound?: boolean };
  if (!w.__firnPopstateBound) {
    w.__firnPopstateBound = true;
    window.addEventListener("popstate", () => {
      cameFromPopstate = true;
    });
  }
}

export default function Template({ children }: { children: React.ReactNode }) {
  // Read once on first render and freeze the result with useState's
  // lazy initializer so a re-render of the same template instance
  // (for whatever reason) doesn't flip the class halfway through.
  const [skipFade] = useState(() => {
    const popped = cameFromPopstate;
    cameFromPopstate = false;
    return popped;
  });
  return <div className={skipFade ? undefined : "page-fade"}>{children}</div>;
}
