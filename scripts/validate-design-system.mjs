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

function hexOf(value) {
  const hex = typeof value === "string" ? value : (value?.alpha ?? 1) === 1 ? value?.hex : null;
  return /^#[0-9a-f]{6}$/i.test(hex ?? "") ? hex : null;
}

function luminance(hex) {
  const channel = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Texto que os componentes põem sobre cada fundo; AA (4,5:1) nos dois temas.
const S = "color.semantic.";
const CONTRAST_PAIRS = [
  ...["text-primary", "text-secondary", "brand", "action", "success", "warning", "danger"]
    .flatMap((text) => ["surface", "surface-soft", "surface-neutral"].map((bg) => [S + text, S + bg])),
  [S + "text-primary", S + "canvas"],
  ...["success", "warning", "danger", "action"].map((tone) => [S + tone, `${S}${tone}-soft`]),
  ...["action", "danger", "brand", "brand-hover"].map((bg) => [S + "on-solid", S + bg]),
  ...["foreground", "foreground-muted"].flatMap((text) => ["background", "background-hover"].map((bg) => [`component.shell.${text}`, `component.shell.${bg}`])),
];

// Só no escuro: no claro são exceções conhecidas (§2.3), mas o escuro não pode herdá-las.
const DARK_ONLY_PAIRS = [
  [S + "text-secondary", S + "canvas"],
  [S + "text-secondary", "component.shell.background"],
];

function validateContrast(tokens, theme, pairs = CONTRAST_PAIRS) {
  const failures = [];
  for (const [text, background] of pairs) {
    const [fg, bg] = [text, background].map((path) => hexOf(resolveTokenValue(path, tokens)));
    if (!fg || !bg) throw new Error(`Tema ${theme}: ${!fg ? text : background} não resolve para cor opaca.`);
    const ratio = contrast(fg, bg);
    if (ratio < 4.5) failures.push(`${text} sobre ${background}: ${ratio.toFixed(2)}`);
  }
  if (failures.length) throw new Error(`Contraste abaixo de 4,5:1 no tema ${theme}: ${failures.join("; ")}`);
}

// Tokens com os overrides do modo aplicados; override só troca o valor de um token existente.
function applyMode(tokens, overrides, mode) {
  const result = new Map(tokens);
  for (const [path, value] of Object.entries(overrides)) {
    const token = tokens.get(path);
    if (!token) throw new Error(`Modo ${mode}: token inexistente ${path}`);
    for (const reference of references(value)) {
      if (!tokens.has(reference)) throw new Error(`Modo ${mode}: alias ausente em ${path}: ${reference}`);
    }
    const corValida = references(value).length || hexOf(value) || typeof value?.hex === "string";
    if (token.type === "color" && !corValida) {
      throw new Error(`Modo ${mode}: ${path} precisa ser hex (#rrggbb) ou cor DTCG.`);
    }
    result.set(path, { ...token, value });
  }
  return result;
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

  // Claro é o padrão; escuro só por data-theme (opt-in), declarado em modes.dark.
  const darkOverrides = metadata.modes?.dark;
  if (document.theme?.mode?.[VALUE] !== "light" || document.theme?.["supports-dark"]?.[VALUE] !== true || !darkOverrides) {
    throw new Error("Tema padrão deve ser light, com supports-dark = true e modes.dark declarado.");
  }
  const darkTokens = applyMode(tokens, darkOverrides, "escuro");
  if (darkTokens.get("theme.mode").value !== "dark") throw new Error("modes.dark deve trocar theme.mode para dark.");
  validateContrast(tokens, "claro");
  validateContrast(darkTokens, "escuro", [...CONTRAST_PAIRS, ...DARK_ONLY_PAIRS]);

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

  console.log(`Design system válido: ${tokens.size} tokens, aliases íntegros, claro + escuro com contraste AA, prefixo ${responsePrefix}, sem gradientes e CSS sincronizado.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
