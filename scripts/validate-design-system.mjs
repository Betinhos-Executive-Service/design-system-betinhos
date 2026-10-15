import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateCss, loadTokenDocument, synchronizeMarkdownSnapshot } from "./generate-design-tokens.mjs";

const DOLLAR = "$";
const VALUE = `${DOLLAR}value`;
const TYPE = `${DOLLAR}type`;
const EXTENSIONS = `${DOLLAR}extensions`;

function collectTokens(node, path = [], inheritedType = null, result = new Map()) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return result;
  const currentType = node[TYPE] || inheritedType;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(DOLLAR)) continue;
    const tokenPath = [...path, key];
    if (value && typeof value === "object" && VALUE in value) {
      result.set(tokenPath.join("."), { type: value[TYPE] || currentType, value: value[VALUE] });
    } else {
      collectTokens(value, tokenPath, value?.[TYPE] || currentType, result);
    }
  }
  return result;
}

function references(value, result = []) {
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) result.push(value.slice(1, -1));
  else if (Array.isArray(value)) value.forEach((item) => references(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => references(item, result));
  return result;
}

function validateReferences(tokens) {
  for (const [path, token] of tokens) {
    if (!token.type) throw new Error(`Token sem tipo: ${path}`);
    for (const reference of references(token.value)) {
      if (!tokens.has(reference)) throw new Error(`Alias ausente em ${path}: ${reference}`);
    }
  }

  function visit(path, stack = []) {
    if (stack.includes(path)) throw new Error(`Alias circular: ${[...stack, path].join(" -> ")}`);
    const token = tokens.get(path);
    for (const reference of references(token.value)) visit(reference, [...stack, path]);
  }
  for (const path of tokens.keys()) visit(path);
}

function resolveTokenValue(path, tokens, stack = []) {
  if (stack.includes(path)) throw new Error(`Alias circular: ${[...stack, path].join(" -> ")}`);
  const token = tokens.get(path);
  if (!token) throw new Error(`Token ausente: ${path}`);
  const reference = typeof token.value === "string" && /^\{[^}]+\}$/.test(token.value)
    ? token.value.slice(1, -1)
    : null;
  return reference ? resolveTokenValue(reference, tokens, [...stack, path]) : token.value;
}

async function validateNoGradients(paths) {
  const pattern = /(linear|radial|conic|repeating-linear|repeating-radial)-gradient\s*\(/i;
  for (const path of paths) {
    const content = await readFile(resolve(path), "utf8");
    if (pattern.test(content)) throw new Error(`Gradiente proibido encontrado em ${path}`);
  }
}

async function main() {
  const document = await loadTokenDocument();
  const metadata = document[EXTENSIONS]?.["com.betinhos.design-system"] || {};
  const tokens = collectTokens(document);
  validateReferences(tokens);

  if (document.theme?.mode?.[VALUE] !== "light" || document.theme?.["supports-dark"]?.[VALUE] !== false) {
    throw new Error("Tema deve permanecer light-only; dark mode não autorizado.");
  }

  const generated = generateCss(document);
  const committed = await readFile(resolve("design-tokens.css"), "utf8");
  if (generated !== committed) throw new Error("design-tokens.css está desatualizado. Rode npm run design:generate.");
  const packaged = await readFile(resolve("packages/tokens/design-tokens.css"), "utf8");
  if (packaged !== generated) throw new Error("packages/tokens/design-tokens.css está desatualizado. Rode npm run design:generate.");
  const packagedJson = await readFile(resolve("packages/tokens/design-tokens.json"), "utf8");
  if (packagedJson !== await readFile(resolve("design-tokens.json"), "utf8")) throw new Error("packages/tokens/design-tokens.json diverge do design-tokens.json da raiz. Rode npm run design:generate.");
  const tokensPackage = JSON.parse(await readFile(resolve("packages/tokens/package.json"), "utf8"));
  if (tokensPackage.version !== metadata.version) throw new Error(`@betinhos/tokens está na ${tokensPackage.version}; o Design System está na ${metadata.version}.`);

  const markdown = await readFile(resolve("DESIGN_SYSTEM.md"), "utf8");
  if (synchronizeMarkdownSnapshot(markdown, generated) !== markdown) {
    throw new Error("Snapshot CSS de DESIGN_SYSTEM.md está desatualizado. Rode npm run design:generate.");
  }
  if (!markdown.includes(`**Versão:** ${metadata.version}`)) {
    throw new Error("Versão de DESIGN_SYSTEM.md diverge de design-tokens.json.");
  }
  const responsePrefix = metadata.validation?.requiredResponsePrefix;
  if (responsePrefix !== "DESIGN CONTEXTO") {
    throw new Error("Prefixo obrigatório de resposta deve ser DESIGN CONTEXTO.");
  }
  if (!markdown.includes("## Protocolo obrigatório de resposta da IA") || !markdown.includes(`\`\`\`text\n${responsePrefix}\n\`\`\``)) {
    throw new Error("DESIGN_SYSTEM.md não declara o protocolo obrigatório de resposta.");
  }
  const appVersioning = metadata.validation?.appVersioning;
  const expectedVersioning = {
    required: true,
    format: "v0.0.0 dd/mm/yyyy",
    alwaysVisible: true,
    presentation: "extremely-subtle-non-blocking",
    updateOn: ["npm run dev", "npm run push"],
    timezone: "America/Sao_Paulo",
  };
  if (JSON.stringify(appVersioning) !== JSON.stringify(expectedVersioning)) {
    throw new Error("Contrato obrigatório de versionamento dos apps está ausente ou divergente.");
  }
  if (
    !markdown.includes("### Versionamento obrigatório dos apps") ||
    !markdown.includes("`v0.0.0 dd/mm/yyyy`") ||
    !markdown.includes("`npm run dev` e `npm run push`")
  ) {
    throw new Error("DESIGN_SYSTEM.md não declara o versionamento automático obrigatório dos apps.");
  }

  const neutral = resolveTokenValue("color.semantic.surface-neutral", tokens);
  if (neutral?.hex?.toLowerCase() !== "#fcfcfb") {
    throw new Error("color.semantic.surface-neutral deve permanecer #FCFCFB.");
  }

  const declaredVariables = new Set([...generated.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
  const referencedVariables = [...generated.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map((match) => match[1]);
  const missingVariables = [...new Set(referencedVariables.filter((variable) => !declaredVariables.has(variable)))];
  if (missingVariables.length) throw new Error(`Variáveis CSS ausentes: ${missingVariables.join(", ")}`);

  // A adoção nos apps (import dos tokens, superfície neutra) é checada em cada app consumidor, não aqui.
  await validateNoGradients(["DESIGN_SYSTEM.md", "design-tokens.css"]);

  console.log(`Design system válido: ${tokens.size} tokens, aliases íntegros, light-only, prefixo ${responsePrefix}, sem gradientes e CSS sincronizado.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
