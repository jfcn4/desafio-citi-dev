import { Request, Response } from "express";
import { Luminosidade } from "@prisma/client";
import * as PlantaRepository from "@repositories/PlantaRepository";
import { FiltrosPlanta } from "@repositories/PlantaRepository";

type DadosPlanta = {
  nome?: string;
  especie?: string;
  preco?: number;
  estoque?: number;
  luminosidade?: Luminosidade;
  petFriendly?: boolean;
  regaACadaDias?: number;
};

type ErroValidacao = { campo: string; message: string };

const CAMPOS_PLANTA = [
  "nome",
  "especie",
  "preco",
  "estoque",
  "luminosidade",
  "petFriendly",
  "regaACadaDias",
] as const;

const LUMINOSIDADES = Object.values(Luminosidade) as string[];

// Maior valor que cabe numa coluna Int do PostgreSQL. Acima disso o banco
// recusaria o valor e o erro viraria um 500, quando o problema é do cliente (400).
const MAIOR_INT_DO_BANCO = 2147483647;

// ---------- Validações ----------

const ehTextoValido = (valor: unknown): valor is string => {
  return typeof valor === "string" && valor.trim() !== "";
};

// Number.isInteger recusa "8990" (texto), 89.9 (decimal) e NaN
const ehInteiro = (valor: unknown): valor is number => {
  return Number.isInteger(valor);
};

const validarCampo = (campo: string, valor: unknown): string | null => {
  if (ehInteiro(valor) && valor > MAIOR_INT_DO_BANCO) {
    return `${campo} deve ser no máximo ${MAIOR_INT_DO_BANCO}.`;
  }

  switch (campo) {
    case "nome":
    case "especie":
      return ehTextoValido(valor) ? null : `${campo} deve ser um texto não vazio.`;
    case "preco":
      return ehInteiro(valor) && valor > 0
        ? null
        : "preco deve ser um inteiro maior que zero (valor em centavos).";
    case "estoque":
      return ehInteiro(valor) && valor >= 0
        ? null
        : "estoque deve ser um inteiro maior ou igual a zero.";
    case "regaACadaDias":
      return ehInteiro(valor) && valor >= 1
        ? null
        : "regaACadaDias deve ser um inteiro maior ou igual a 1.";
    case "luminosidade":
      return typeof valor === "string" && LUMINOSIDADES.includes(valor)
        ? null
        : `luminosidade deve ser um destes valores: ${LUMINOSIDADES.join(", ")}.`;
    case "petFriendly":
      return typeof valor === "boolean" ? null : "petFriendly deve ser true ou false.";
    default:
      return null;
  }
};

// Serve para o cadastro e para a edição. A presença do campo é checada com
// === undefined, e não com !campo, porque !0 e !false são verdadeiros:
// !campo recusaria estoque 0 e plantas que não são pet-friendly.
// - parcial = false (POST): todos os campos são obrigatórios
// - parcial = true (PATCH): nenhum é obrigatório, mas os enviados seguem as mesmas regras
const validarPlanta = (
  body: Record<string, unknown>,
  parcial: boolean
): ErroValidacao | null => {
  for (const campo of CAMPOS_PLANTA) {
    const valor = body[campo];

    if (valor === undefined) {
      if (parcial) continue;
      return { campo, message: `O campo ${campo} é obrigatório.` };
    }

    const erro = validarCampo(campo, valor);
    if (erro) return { campo, message: erro };
  }

  return null;
};

// Pega só os campos da planta: qualquer outro campo do body (id, createdAt...) é ignorado
const extrairDadosPlanta = (body: Record<string, unknown>): DadosPlanta => {
  const { nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias } =
    body as DadosPlanta;

  return {
    nome: typeof nome === "string" ? nome.trim() : undefined,
    especie: typeof especie === "string" ? especie.trim() : undefined,
    preco: preco,
    estoque: estoque,
    luminosidade: luminosidade,
    petFriendly: petFriendly,
    regaACadaDias: regaACadaDias,
  };
};

// Garante que o body é um objeto, mesmo quando a requisição chega sem corpo
const lerBody = (req: Request): Record<string, unknown> => {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
};

// O :id chega da URL como texto. Retorna o número ou null se for inválido ("abc", "0", "1.5")
const parseId = (valor: unknown): number | null => {
  if (typeof valor !== "string") return null;
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 && id <= MAIOR_INT_DO_BANCO ? id : null;
};

// Os filtros de req.query são sempre texto: "true" e "false" viram boolean, e um
// filtro não enviado continua undefined (e não false), para não filtrar sem querer
const lerFiltros = (query: Request["query"]): FiltrosPlanta | ErroValidacao => {
  const { luminosidade, petFriendly, nome, ordem } = query;
  const filtros: FiltrosPlanta = {};

  if (luminosidade !== undefined) {
    if (typeof luminosidade !== "string" || !LUMINOSIDADES.includes(luminosidade)) {
      return {
        campo: "luminosidade",
        message: `Filtro luminosidade inválido. Use: ${LUMINOSIDADES.join(", ")}.`,
      };
    }
    filtros.luminosidade = luminosidade as Luminosidade;
  }

  if (petFriendly !== undefined) {
    if (petFriendly !== "true" && petFriendly !== "false") {
      return { campo: "petFriendly", message: "Filtro petFriendly deve ser true ou false." };
    }
    filtros.petFriendly = petFriendly === "true";
  }

  if (nome !== undefined) {
    if (!ehTextoValido(nome)) {
      return { campo: "nome", message: "Filtro nome deve ser um texto não vazio." };
    }
    filtros.nome = nome.trim();
  }

  if (ordem !== undefined) {
    if (ordem !== "preco" && ordem !== "nome") {
      return { campo: "ordem", message: "Filtro ordem deve ser preco ou nome." };
    }
    filtros.ordem = ordem;
  }

  return filtros;
};

const ehErro = (valor: FiltrosPlanta | ErroValidacao): valor is ErroValidacao => {
  return "message" in valor;
};

const ID_INVALIDO = { campo: "id", message: "O id deve ser um inteiro positivo." };

const plantaNaoEncontrada = (id: number) => ({
  message: `Planta com id ${id} não encontrada.`,
});

// ---------- Handlers ----------

export const createPlanta = async (req: Request, res: Response) => {
  try {
    const body = lerBody(req);

    const erro = validarPlanta(body, false);
    if (erro) {
      return res.status(400).json(erro);
    }

    const dados = extrairDadosPlanta(body) as Required<DadosPlanta>;
    const planta = await PlantaRepository.createPlanta(dados);

    return res.status(201).json(planta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao cadastrar planta." });
  }
};

export const readAllPlantas = async (req: Request, res: Response) => {
  try {
    const filtros = lerFiltros(req.query);
    if (ehErro(filtros)) {
      return res.status(400).json(filtros);
    }

    // Filtro válido sem resultado responde 200 com [], nunca 404
    const plantas = await PlantaRepository.findAllPlantas(filtros);

    return res.status(200).json(plantas);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar plantas." });
  }
};

export const readPlantasEsgotadas = async (_req: Request, res: Response) => {
  try {
    const plantas = await PlantaRepository.findPlantasEsgotadas();

    return res.status(200).json(plantas);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar plantas esgotadas." });
  }
};

export const readPlantaById = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json(ID_INVALIDO);
    }

    const planta = await PlantaRepository.findPlantaById(id);
    if (!planta) {
      return res.status(404).json(plantaNaoEncontrada(id));
    }

    return res.status(200).json(planta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar planta." });
  }
};

export const updatePlanta = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json(ID_INVALIDO);
    }

    const body = lerBody(req);
    const enviouAlgumCampo = CAMPOS_PLANTA.some((campo) => body[campo] !== undefined);
    if (!enviouAlgumCampo) {
      return res.status(400).json({ message: "Nenhum campo válido para atualizar." });
    }

    const erro = validarPlanta(body, true);
    if (erro) {
      return res.status(400).json(erro);
    }

    // Antes de editar, garantimos que a planta existe; sem isso, o erro do Prisma viraria 500
    const planta = await PlantaRepository.findPlantaById(id);
    if (!planta) {
      return res.status(404).json(plantaNaoEncontrada(id));
    }

    // Campos não enviados (undefined) não são alterados
    const plantaAtualizada = await PlantaRepository.updatePlanta(id, extrairDadosPlanta(body));

    return res.status(200).json(plantaAtualizada);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao atualizar planta." });
  }
};

export const deletePlanta = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json(ID_INVALIDO);
    }

    const planta = await PlantaRepository.findPlantaById(id);
    if (!planta) {
      return res.status(404).json(plantaNaoEncontrada(id));
    }

    await PlantaRepository.deletePlanta(id);

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao deletar planta." });
  }
};

export const venderPlanta = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json(ID_INVALIDO);
    }

    const { quantidade } = lerBody(req);
    if (!ehInteiro(quantidade) || quantidade <= 0 || quantidade > MAIOR_INT_DO_BANCO) {
      return res.status(400).json({
        campo: "quantidade",
        message: "quantidade deve ser um inteiro maior que zero.",
      });
    }

    const planta = await PlantaRepository.findPlantaById(id);
    if (!planta) {
      return res.status(404).json(plantaNaoEncontrada(id));
    }

    const vendeu = await PlantaRepository.venderPlanta(id, quantidade);
    if (!vendeu) {
      // Busca de novo: outra venda pode ter mudado o estoque nesse meio-tempo
      const atual = await PlantaRepository.findPlantaById(id);
      const disponivel = atual ? atual.estoque : 0;
      return res.status(400).json({
        campo: "quantidade",
        message: `Estoque insuficiente: temos só ${disponivel} ${disponivel === 1 ? "vaso" : "vasos"} de ${planta.nome}.`,
      });
    }

    const plantaAtualizada = await PlantaRepository.findPlantaById(id);

    return res.status(200).json(plantaAtualizada);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao registrar venda." });
  }
};

// O aggregate do Prisma soma uma coluna, mas não preco × estoque,
// então buscamos só esses dois campos e fazemos a conta aqui
export const readValorTotalEstoque = async (_req: Request, res: Response) => {
  try {
    const plantas = await PlantaRepository.findPrecoEEstoque();

    const resumo = plantas.reduce(
      (total, planta) => ({
        valorTotalEmCentavos: total.valorTotalEmCentavos + planta.preco * planta.estoque,
        totalDeVasos: total.totalDeVasos + planta.estoque,
      }),
      { valorTotalEmCentavos: 0, totalDeVasos: 0 }
    );

    return res.status(200).json(resumo);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao calcular o valor do estoque." });
  }
};
