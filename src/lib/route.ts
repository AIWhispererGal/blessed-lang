import { useCallback, useEffect, useState } from "react";

export const ROUTES = ["home", "playground", "commandments", "translate", "quiz", "calculator"] as const;
export type Route = (typeof ROUTES)[number];

export interface RouteState {
  route: Route;
  params: URLSearchParams;
}

export function parseHash(hash: string): RouteState {
  const raw = hash.replace(/^#\/?/, "");
  const q = raw.indexOf("?");
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? "" : raw.slice(q + 1);
  const route = (ROUTES as readonly string[]).includes(path) ? (path as Route) : "home";
  return { route, params: new URLSearchParams(query) };
}

export function hrefFor(route: Route, params?: Record<string, string>): string {
  const base = route === "home" ? "#/" : `#/${route}`;
  if (!params || Object.keys(params).length === 0) return base;
  return `${base}?${new URLSearchParams(params).toString()}`;
}

export function useHashRoute() {
  const [state, setState] = useState<RouteState>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((route: Route, params?: Record<string, string>) => {
    const next = hrefFor(route, params);
    if (window.location.hash === next) setState(parseHash(next));
    else window.location.hash = next;
    window.scrollTo({ top: 0 });
  }, []);
  /** Drop query params from the URL without a navigation event. */
  const cleanParams = useCallback(() => {
    const { route } = parseHash(window.location.hash);
    window.history.replaceState(null, "", hrefFor(route));
  }, []);
  return { ...state, navigate, cleanParams };
}

/* Share links carry the program as base64url in the hash. */
export function encodeCode(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => document.documentElement.getAttribute("data-theme") ?? "dark");
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("blessed-theme", next);
      } catch {
        /* a private window keeps its own counsel */
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}

export function roman(n: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

export const REPO_URL = "https://github.com/AIWhispererGal/blessed-lang";
export const ISSUES_URL = `${REPO_URL}/issues`;
export const ROADMAP_URL = `${REPO_URL}/issues/16`;
