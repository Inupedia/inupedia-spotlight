/**
 * Compile-time IoC: strip @agent and inject resolveAgentMeta registration (AST-based).
 */
import { parse } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import MagicString from "magic-string";
import type { Plugin } from "vite";

type DecoratedFn = { decorators?: t.Decorator[] | null };

function getDecorators(node: unknown): t.Decorator[] {
  const decorators = (node as DecoratedFn).decorators;
  return decorators ?? [];
}

const REGISTER_IMPORT =
  'import { registerAgentCapability } from "@inupedia/spotlight-client";\n';

export type SpotlightAgentIocOptions = {
  includePath?: string | RegExp;
  agentPreset?: string;
};

type AgentMatch = {
  metaSource: string;
  identifier: string;
  insertAfter: number;
  removeStart: number;
  removeEnd: number;
};

function parseModule(source: string, sourceFilename: string) {
  return parse(source, {
    sourceType: "module",
    plugins: ["typescript", "decorators-legacy"],
    sourceFilename,
  });
}

function collectAgentMatches(source: string, sourceFilename: string): AgentMatch[] {
  const ast = parseModule(source, sourceFilename);
  const matches: AgentMatch[] = [];

  function pushMatch(
    decorator: t.Decorator,
    identifier: string,
    insertAfter: number,
  ) {
    const expr = decorator.expression;
    if (!t.isCallExpression(expr)) return;
    if (!t.isIdentifier(expr.callee, { name: "agent" })) return;
    if (expr.arguments.length !== 1) return;

    const metaArg = expr.arguments[0];
    const metaSource = source.slice(metaArg.start!, metaArg.end!);
    const decoratorStart = decorator.start!;
    let removeEnd = decorator.end!;
    if (source[removeEnd] === "\n") removeEnd += 1;

    matches.push({
      metaSource,
      identifier,
      insertAfter,
      removeStart: decoratorStart,
      removeEnd,
    });
  }

  traverse(ast, {
    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      const decl = path.node.declaration;
      if (!t.isFunctionDeclaration(decl) || !decl.id?.name) return;
      for (const decorator of getDecorators(decl)) {
        pushMatch(decorator, decl.id.name, path.node.end!);
      }
    },
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      const decl = path.node.declaration;
      if (!t.isFunctionDeclaration(decl) || !decl.id?.name) return;
      for (const decorator of getDecorators(decl)) {
        pushMatch(decorator, decl.id.name, path.node.end!);
      }
    },
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      for (const decorator of getDecorators(path.node)) {
        if (!path.node.id?.name) continue;
        const exportPath = path.parentPath?.isExportNamedDeclaration()
          ? path.parentPath
          : path;
        pushMatch(
          decorator,
          path.node.id.name,
          exportPath.node.end ?? path.node.end!,
        );
      }
    },
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isIdentifier(path.node.id) || !path.node.init) return;
      if (!t.isFunctionExpression(path.node.init)) return;
      for (const decorator of getDecorators(path.node.init)) {
        const stmt = path.parentPath?.parentPath;
        pushMatch(
          decorator,
          path.node.id.name,
          stmt?.node.end ?? path.node.end!,
        );
      }
    },
    ClassMethod(path: NodePath<t.ClassMethod>) {
      if (!t.isIdentifier(path.node.key)) return;
      for (const decorator of getDecorators(path.node)) {
        pushMatch(decorator, path.node.key.name, path.node.end!);
      }
    },
  });

  return matches.sort((a, b) => b.removeStart - a.removeStart);
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipLeadingWhitespaceAndComments(
  source: string,
  fromIndex: number,
): number {
  let i = fromIndex;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (source.slice(i, i + 2) === "//") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (source.slice(i, i + 2) === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function findFunctionBodyEnd(source: string, bodyStart: number): number | null {
  if (source[bodyStart] !== "{") return null;
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

function findDeclarationAfter(
  source: string,
  fromIndex: number,
): { identifier: string; insertAfter: number } | null {
  const start = skipLeadingWhitespaceAndComments(source, fromIndex);
  const slice = source.slice(start);

  const defaultFnMatch =
    /^export\s+default\s+(?:async\s+)?function\s+(\w+)/.exec(slice);
  if (defaultFnMatch) {
    const identifier = defaultFnMatch[1];
    const paramOpen = source.indexOf(
      "(",
      start + defaultFnMatch.index! + defaultFnMatch[0].length,
    );
    if (paramOpen === -1) return null;
    const paramClose = findMatchingParen(source, paramOpen);
    if (paramClose === -1) return null;
    const bodyStart = source.indexOf("{", paramClose);
    if (bodyStart === -1) return null;
    const bodyEnd = findFunctionBodyEnd(source, bodyStart);
    return bodyEnd ? { identifier, insertAfter: bodyEnd } : null;
  }

  const fnMatch =
    /^(export\s+async\s+function\s+(\w+)|export\s+function\s+(\w+)|async\s+function\s+(\w+)|function\s+(\w+))/.exec(
      slice,
    );
  if (fnMatch) {
    const identifier = fnMatch[2] ?? fnMatch[3] ?? fnMatch[4] ?? fnMatch[5];
    const declStart = start + (fnMatch.index ?? 0);
    const paramOpen = source.indexOf("(", declStart);
    if (paramOpen === -1) return null;
    const paramClose = findMatchingParen(source, paramOpen);
    if (paramClose === -1) return null;
    const bodyStart = source.indexOf("{", paramClose);
    if (bodyStart === -1) return null;
    const bodyEnd = findFunctionBodyEnd(source, bodyStart);
    return bodyEnd ? { identifier, insertAfter: bodyEnd } : null;
  }

  const constMatch = /^export\s+const\s+(\w+)\s*=/.exec(slice);
  if (constMatch) {
    const identifier = constMatch[1];
    let i = start + constMatch.index! + constMatch[0].length;
    i = skipLeadingWhitespaceAndComments(source, i);
    if (source[i] === "(") {
      const close = findMatchingParen(source, i);
      if (close === -1) return null;
      let end = close + 1;
      while (end < source.length && source[end] !== ";" && source[end] !== "\n") {
        end += 1;
      }
      if (source[end] === ";") end += 1;
      return { identifier, insertAfter: end };
    }
    const asyncFnMatch = /^async\s+function\s+(\w+)/.exec(source.slice(i));
    if (asyncFnMatch) {
      const fnStart = i + asyncFnMatch.index! + asyncFnMatch[0].length;
      const paramOpen = source.indexOf("(", fnStart - 1);
      if (paramOpen === -1) return null;
      const paramClose = findMatchingParen(source, paramOpen);
      if (paramClose === -1) return null;
      const bodyStart = source.indexOf("{", paramClose);
      if (bodyStart === -1) return null;
      const bodyEnd = findFunctionBodyEnd(source, bodyStart);
      if (!bodyEnd) return null;
      let end = bodyEnd;
      while (end < source.length && source[end] !== ";" && source[end] !== "\n") {
        end += 1;
      }
      if (source[end] === ";") end += 1;
      return { identifier, insertAfter: end };
    }
    if (source.slice(i, i + 6) === "async ") {
      i += 6;
      i = skipLeadingWhitespaceAndComments(source, i);
    }
    if (source[i] === "(") {
      const close = findMatchingParen(source, i);
      if (close === -1) return null;
      let end = close + 1;
      if (source[end] === ";") end += 1;
      return { identifier, insertAfter: end };
    }
  }

  return null;
}

/** Legacy string scanner when Babel cannot parse decorated exports. */
function collectAgentMatchesLegacy(source: string): AgentMatch[] {
  const matches: AgentMatch[] = [];
  const kind = "@agent";
  let searchFrom = 0;

  while (searchFrom < source.length) {
    const at = source.indexOf(kind + "(", searchFrom);
    if (at === -1) break;
    const metaOpen = at + kind.length;
    const metaClose = findMatchingParen(source, metaOpen);
    if (metaClose === -1) break;
    const metaSource = source.slice(metaOpen + 1, metaClose).trim();
    let removeTo = metaClose + 1;
    while (removeTo < source.length && /\s/.test(source[removeTo] ?? "")) {
      removeTo += 1;
    }
    const decl = findDeclarationAfter(source, removeTo);
    if (decl) {
      matches.push({
        metaSource,
        identifier: decl.identifier,
        removeStart: at,
        removeEnd: removeTo,
        insertAfter: decl.insertAfter,
      });
    }
    searchFrom = metaClose + 1;
  }

  return matches.sort((a, b) => b.removeStart - a.removeStart);
}

function applyAgentMatches(
  code: string,
  id: string,
  matches: AgentMatch[],
  agentPreset: string,
): { code: string; map: import("magic-string").SourceMap | null } {
  const s = new MagicString(code);

  for (const match of matches) {
    s.remove(match.removeStart, match.removeEnd);
    s.appendLeft(
      match.insertAfter,
      `\n${registrationLine(match.metaSource, match.identifier, id)}\n`,
    );
  }

  let output = s.toString();
  const presetImport = `import { resolveAgentMeta } from "${agentPreset}";\n`;

  if (!/import\s+{[^}]*\bregisterAgentCapability\b/.test(output)) {
    output = REGISTER_IMPORT + output;
  }
  if (!/import\s+{[^}]*\bresolveAgentMeta\b/.test(output)) {
    output = presetImport + output;
  }

  return {
    code: output,
    map: s.generateMap({ hires: true, source: id, includeContent: true }),
  };
}

function registrationLine(
  metaSource: string,
  identifier: string,
  fileId: string,
): string {
  const fileLiteral = JSON.stringify(fileId);
  return `registerAgentCapability(resolveAgentMeta(${metaSource}, ${fileLiteral}), ${identifier});`;
}

export function transformSpotlightAgentIoc(
  code: string,
  id: string,
  options: Pick<SpotlightAgentIocOptions, "agentPreset"> = {},
): { code: string; map: import("magic-string").SourceMap | null } | null {
  const agentPreset =
    options.agentPreset ?? "@/service/agent/presets/resolveAgentMeta";

  if (!code.includes("@agent") && !code.includes("@Agent")) return null;

  let matches: AgentMatch[] = [];
  try {
    matches = collectAgentMatches(code, id);
  } catch {
    matches = [];
  }
  if (matches.length === 0) {
    matches = collectAgentMatchesLegacy(code);
  }
  if (matches.length === 0) return null;

  return applyAgentMatches(code, id, matches, agentPreset);
}

function shouldTransform(id: string, includePath: string | RegExp): boolean {
  if (id.includes(".test.")) return false;
  if (id.includes("/_shared/")) return false;
  if (typeof includePath === "string") return id.includes(includePath);
  return includePath.test(id);
}

export default function spotlightAgentIoc(
  options: SpotlightAgentIocOptions = {},
): Plugin {
  const includePath = options.includePath ?? "/capabilities/";

  return {
    name: "spotlight-agent-ioc",
    enforce: "pre",
    transform(code, id) {
      if (!shouldTransform(id, includePath)) return null;
      const result = transformSpotlightAgentIoc(code, id, {
        agentPreset: options.agentPreset,
      });
      if (!result) return null;
      return result;
    },
  };
}
