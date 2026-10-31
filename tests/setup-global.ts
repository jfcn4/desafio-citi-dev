import { execSync } from "child_process";

// Roda uma vez antes de todos os testes: recria o banco de teste do zero e aplica
// as migrations. O yarn test troca o DATABASE_DB para "treinamento-crud-test",
// então o banco de desenvolvimento nunca é tocado.
export default function setup() {
  if (!process.env.DATABASE_DB?.endsWith("-test")) {
    throw new Error("Rode os testes com yarn test, que usa o banco treinamento-crud-test.");
  }

  execSync("prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "inherit",
  });
}
