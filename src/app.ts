import express, { NextFunction, Request, Response } from "express";
import path from "path";
import routes from "./routes";

const app = express();

app.use(express.json());

// Painel web da loja (HTML, CSS e JS da pasta public/), acessível em /loja
app.use("/loja", express.static(path.resolve(__dirname, "..", "public")));

app.use(routes);

// Qualquer rota que não existe cai aqui
app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

// Erros que acontecem antes de chegar nas rotas, como um corpo que não é JSON válido.
// O Express só reconhece um middleware de erro pelos 4 parâmetros, por isso o _next fica
app.use((error: { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (error.type === "entity.parse.failed") {
    res.status(400).json({ message: "O corpo da requisição não é um JSON válido." });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Erro interno do servidor." });
});

export default app;
