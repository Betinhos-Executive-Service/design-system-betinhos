import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const repoRoot = resolve(".");
const parentRoot = resolve(repoRoot, "..");
const files = ["DESIGN_SYSTEM.md", "design-tokens.json", "design-tokens.css"];
const instructionFiles = ["AGENTS.md", "CLAUDE.md"];

async function main() {
  if (basename(parentRoot).toLowerCase() !== "vscode") {
    throw new Error(`Publicação recusada: pai inesperado ${parentRoot}`);
  }

  await mkdir(parentRoot, { recursive: true });
  for (const file of files) {
    await copyFile(resolve(repoRoot, file), resolve(parentRoot, file));
    const [source, published] = await Promise.all([
      readFile(resolve(repoRoot, file)),
      readFile(resolve(parentRoot, file)),
    ]);
    if (!source.equals(published)) throw new Error(`Falha ao verificar publicação de ${file}`);
  }
  for (const file of instructionFiles) {
    const instructions = await readFile(resolve(parentRoot, file), "utf8");
    if (!instructions.includes("Design System Betinhos") || !instructions.includes("DESIGN_SYSTEM.md")) {
      throw new Error(`${file} do diretório pai não exige a leitura do design system.`);
    }
  }
  console.log(`Design system publicado e verificado em ${parentRoot}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
