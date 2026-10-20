export const themes = ["light", "dark", "system"] as const;
export type Theme = (typeof themes)[number];

export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return themes.find((theme) => theme === value) ?? "system";
}

/**
 * Runs in <head> before first paint so there is no light/dark flash.
 * Kept tiny and dependency-free; it is inlined as a nonce'd script.
 */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var t=m?m[1]:"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
