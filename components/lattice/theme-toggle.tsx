"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// Subscribe to data-theme changes on <html> via MutationObserver so the
// button icon stays in sync with whatever flipped the attribute (the
// bootstrap script in <head> on first paint, this component's toggle,
// or any future system-preference listener). useSyncExternalStore keeps
// the read DOM-driven without a setState-in-effect cascade.
function subscribeTheme(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
}

function getThemeSnapshot(): Theme {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme | null {
  return null;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    // Flip the attribute; the MutationObserver in subscribeTheme will
    // notify useSyncExternalStore which re-renders the icon.
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("explorer:theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      className="w-8 h-8 grid place-items-center border border-line rounded-md bg-bg-elev text-ink-2 cursor-pointer"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
          </g>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 100 11 5.5 5.5 0 006.5-4.5z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}
