import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Uma só versão: a do Design System (design-tokens.json) vale para a raiz e para os pacotes publicados.
// Com argumento (a tag sem o "v"), também exige que a tag seja essa versão.
const read = async (path) => JSON.parse(await readFile(resolve(path), "utf8"));

async function main() {
  const tokens = await read("design-tokens.json");
  const expected = tokens.$extensions?.["com.betinhos.design-system"]?.version;
  if (!expected) throw new Error("design-tokens.json sem a versão do Design System.");
  const files = ["package.json", "packages/tokens/package.json", "packages/ui/package.json"];
  const wrong = [];
  for (const file of files) {
    const { version } = await read(file);
    if (version !== expected) wrong.push(`${file} (${version})`);
  }
  if (wrong.length) throw new Error(`Versão diferente da ${expected} do Design System: ${wrong.join(", ")}.`);
  const tag = process.argv[2];
  if (tag && tag !== expected) throw new Error(`A tag v${tag} não é a versão do Design System (${expected}).`);
  console.log(`Versões alinhadas em ${expected}${tag ? " e iguais à tag" : ""}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
