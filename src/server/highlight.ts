import "server-only";
import { type Jsx, toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Server-side syntax highlighting. Runs at render time, so code blocks ship zero client JS.
 * Shiki's HAST output is converted straight to React elements (no dangerouslySetInnerHTML).
 * The JavaScript regex engine avoids loading the Oniguruma WASM binary.
 */

export const CODE_THEME = "catppuccin-mocha";
const LANGS = ["typescript", "bash", "python", "go", "json", "jsonc", "yaml"] as const;
export type CodeLang = (typeof LANGS)[number] | "text";

const globalForShiki = globalThis as unknown as { __vaultdropShiki?: Promise<Highlighter> };

function highlighter(): Promise<Highlighter> {
  globalForShiki.__vaultdropShiki ??= createHighlighter({
    themes: [CODE_THEME],
    langs: [...LANGS],
    engine: createJavaScriptRegexEngine(),
  });
  return globalForShiki.__vaultdropShiki;
}

export async function highlight(code: string, lang: CodeLang, label: string) {
  const hast = (await highlighter()).codeToHast(code, {
    lang,
    theme: CODE_THEME,
    transformers: [
      {
        pre(node) {
          // Colours come from the panel; the <pre> is the keyboard-focusable, named scroll region.
          node.properties.style = undefined;
          node.properties.class = "code-pre";
          node.properties.tabindex = 0;
          node.properties.role = "region";
          node.properties["aria-label"] = label;
        },
      },
    ],
  });
  return toJsxRuntime(hast, { Fragment, jsx: jsx as Jsx, jsxs: jsxs as Jsx });
}
