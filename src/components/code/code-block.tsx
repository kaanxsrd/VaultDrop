import { type CodeLang, highlight } from "@/server/highlight";
import { CodeCopyButton } from "./code-copy-button";

const LANG_LABEL: Record<CodeLang, string> = {
  typescript: "TypeScript",
  bash: "Shell",
  python: "Python",
  go: "Go",
  json: "JSON",
  jsonc: "JSON",
  yaml: "YAML",
  text: "Text",
};

/**
 * Editor-style code panel: window chrome, filename, language badge, copy button, line numbers.
 * Highlighted on the server (Catppuccin Mocha); always dark so it reads the same in both themes.
 */
export async function CodeBlock({
  code,
  lang = "text",
  title,
  lineNumbers,
  className,
}: {
  code: string;
  lang?: CodeLang;
  title?: string;
  lineNumbers?: boolean;
  className?: string;
}) {
  const numbered = lineNumbers ?? code.split("\n").length > 4;
  const body = await highlight(
    code,
    lang,
    title ? `Code: ${title}` : `${LANG_LABEL[lang]} example`,
  );
  return (
    <figure
      data-line-numbers={numbered ? "" : undefined}
      className={`code-block shadow-lifted relative overflow-hidden rounded-xl border border-white/10 bg-[#0b0f14] ${className ?? ""}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[#45d1a5]/60 to-transparent"
      />
      <figcaption className="flex h-10 items-center gap-3 border-b border-white/[0.07] bg-white/[0.025] pr-2 pl-4">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]/85" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/85" />
          <span className="size-2.5 rounded-full bg-[#28c840]/85" />
        </span>
        {title && <span className="truncate font-mono text-[12px] text-white/60">{title}</span>}
        <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-white/45 uppercase">
          {LANG_LABEL[lang]}
        </span>
        <CodeCopyButton code={code} />
      </figcaption>
      {body}
    </figure>
  );
}
