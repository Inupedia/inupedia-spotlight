import * as prettier from "prettier/standalone";
import * as prettierPluginMarkdown from "prettier/plugins/markdown";

/** LLM 常把标题/列表/表格粘在一行；在 prettier 前做轻量拆分。 */
export function preprocessKnowledgeMarkdown(text: string): string {
  if (!text.trim()) return text;

  let output = text.replace(/\r\n/g, "\n");

  output = output.replace(/(#{1,6}\s+[^\n#|]+?)(#{1,6}\s)/g, "$1\n\n$2");
  output = output.replace(/([\u4e00-\u9fa5）】>])(#{1,6})(?=\S)/g, "$1\n\n$2");
  output = output.replace(/^(#{1,6})(\d+[.)、])/gm, "$1 $2");
  output = output.replace(/^-(?![-])(\S)/gm, "- $1");
  output = output.replace(
    /(?<=[\d.km座处）%)kW#])-(?=[\u4e00-\u9fa5])/g,
    "\n- ",
  );

  output = output
    .split("\n")
    .map((line) => splitGluedTablePrefix(line))
    .join("\n");

  output = repairShatteredTableSeparators(output);

  return output.replace(/\n{3,}/g, "\n\n").trim();
}

function splitGluedTablePrefix(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return line;
  if (/^\|/.test(trimmed)) return line;
  if (/^\|[-\s|:]+\|/.test(trimmed.replace(/\s/g, ""))) return line;

  const pipeIdx = trimmed.indexOf("|");
  const before = trimmed.slice(0, pipeIdx).trimEnd();
  const after = trimmed.slice(pipeIdx).trimStart();
  if (!before || !after) return line;
  if (!after.includes("|") && !after.startsWith("|")) return line;
  return `${before}\n\n${after}`;
}

/** 修复历史/误处理留下的碎裂表头分隔行（勿对含 | 的行做 --- 水平线拆分）。 */
function repairShatteredTableSeparators(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!isTableFragmentLine(trimmed)) {
      out.push(line);
      continue;
    }

    const fragments: string[] = [];
    while (i < lines.length) {
      const current = lines[i].trim();
      if (!current) {
        i++;
        continue;
      }
      if (!isTableFragmentLine(current)) break;
      fragments.push(current);
      i++;
    }
    i--;

    const merged = mergeTableSeparatorFragments(fragments);
    if (merged.length) out.push(...merged);
  }

  return out.join("\n");
}

function isTableFragmentLine(line: string): boolean {
  if (!line) return false;
  if (/^\|.*\|$/.test(line) && /[|:-]/.test(line)) return true;
  return /^[\s|:-]+$/.test(line);
}

function mergeTableSeparatorFragments(fragments: string[]): string[] {
  if (!fragments.length) return [];

  const separatorOnly = fragments.every((line) =>
    /^[\s|:-]+$/.test(line.replace(/[^|:\-\s]/g, "")),
  );
  if (!separatorOnly) return fragments;

  const merged = fragments
    .join("")
    .replace(/\s+/g, "")
    .replace(/\|+/g, "|")
    .replace(/^\|/, "|")
    .replace(/\|$/, "|");

  if (/^\|[-:|]+\|$/.test(merged)) return [merged];
  return fragments;
}

export async function formatSpotlightKnowledgeMarkdown(
  text: string,
): Promise<string> {
  const preprocessed = preprocessKnowledgeMarkdown(text);
  if (!preprocessed) return "";

  try {
    return (
      await prettier.format(preprocessed, {
        parser: "markdown",
        plugins: [prettierPluginMarkdown],
        proseWrap: "preserve",
      })
    ).trim();
  } catch {
    return preprocessed;
  }
}

/** 保留入口：预览统一走 SpotlightMarkdownPreview，无需重复挂 markdown-it 规则。 */
export function initSpotlightMarkdownPreview(): void {
  // no-op
}
