import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import prisma from "../src/database";

const plantaValida = {
  nome: "Costela-de-adão",
  especie: "Monstera deliciosa",
  preco: 8990,
  estoque: 12,
  luminosidade: "MEIA_SOMBRA",
  petFriendly: false,
  regaACadaDias: 3,
};

async function criarPlanta(dados: Partial<typeof plantaValida> = {}) {
  const res = await request(app)
    .post("/plantas")
    .send({ ...plantaValida, ...dados });
  return res.body;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Planta" RESTART IDENTITY');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /plantas", () => {
  it("cadastra uma planta válida (201)", async () => {
    const res = await request(app).post("/plantas").send(plantaValida);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(plantaValida);
    expect(res.body.id).toBeTypeOf("number");
  });

  it("aceita estoque 0 e petFriendly false (201)", async () => {
    const res = await request(app)
      .post("/plantas")
      .send({ ...plantaValida, estoque: 0, petFriendly: false });
    expect(res.status).toBe(201);
    expect(res.body.estoque).toBe(0);
    expect(res.body.petFriendly).toBe(false);
  });

  it.each([
    ["sem um campo", { nome: undefined }],
    ["preco 0", { preco: 0 }],
    ["estoque -1", { estoque: -1 }],
    ["preco como texto", { preco: "8990" }],
    ["preco decimal", { preco: 89.9 }],
    ["luminosidade fora do enum", { luminosidade: "LUA" }],
    ["regaACadaDias 0", { regaACadaDias: 0 }],
    ["nome vazio", { nome: "   " }],
    ["petFriendly como texto", { petFriendly: "true" }],
  ])("recusa cadastro %s (400)", async (_, alteracao) => {
    const res = await request(app)
      .post("/plantas")
      .send({ ...plantaValida, ...alteracao });
    expect(res.status).toBe(400);
    expect(res.body.message).toBeTypeOf("string");
  });

  it("ignora campos desconhecidos no body", async () => {
    const res = await request(app)
      .post("/plantas")
      .send({ ...plantaValida, id: 999, hackeado: true });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(999);
    expect(res.body.hackeado).toBeUndefined();
  });
});

describe("GET /plantas/:id", () => {
  it("busca uma planta existente (200)", async () => {
    const planta = await criarPlanta();
    const res = await request(app).get(`/plantas/${planta.id}`);
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe(plantaValida.nome);
  });

  it("retorna 404 para id inexistente", async () => {
    const res = await request(app).get("/plantas/9999");
    expect(res.status).toBe(404);
  });

  it.each(["abc", "0", "-1", "1.5"])("retorna 400 para id %s", async (id) => {
    const res = await request(app).get(`/plantas/${id}`);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /plantas/:id", () => {
  it("edita só o preço, sem mudar o resto (200)", async () => {
    const planta = await criarPlanta();
    const res = await request(app).patch(`/plantas/${planta.id}`).send({ preco: 9990 });
    expect(res.status).toBe(200);
    expect(res.body.preco).toBe(9990);
    expect(res.body.nome).toBe(planta.nome);
    expect(res.body.estoque).toBe(planta.estoque);
  });

  it("recusa valor inválido (400)", async () => {
    const planta = await criarPlanta();
    const res = await request(app).patch(`/plantas/${planta.id}`).send({ preco: -5 });
    expect(res.status).toBe(400);
  });

  it("recusa body sem nenhum campo válido (400)", async () => {
    const planta = await criarPlanta();
    const res = await request(app).patch(`/plantas/${planta.id}`).send({});
    expect(res.status).toBe(400);
  });

  it("retorna 404 para id inexistente", async () => {
    const res = await request(app).patch("/plantas/9999").send({ preco: 100 });
    expect(res.status).toBe(404);
  });
});

describe("GET /plantas (filtros)", () => {
  beforeEach(async () => {
    await criarPlanta({ nome: "Jiboia", luminosidade: "SOMBRA", petFriendly: false, preco: 3000 });
    await criarPlanta({ nome: "Maranta", luminosidade: "MEIA_SOMBRA", petFriendly: true, preco: 5000 });
    await criarPlanta({ nome: "Alecrim", luminosidade: "SOL_PLENO", petFriendly: true, preco: 1500 });
  });

  it("lista todas sem filtro (200)", async () => {
    const res = await request(app).get("/plantas");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it("filtra por luminosidade", async () => {
    const res = await request(app).get("/plantas?luminosidade=SOMBRA");
    expect(res.status).toBe(200);
    expect(res.body.map((p: { nome: string }) => p.nome)).toEqual(["Jiboia"]);
  });

  it("filtra por petFriendly=false sem confundir com filtro ausente", async () => {
    const res = await request(app).get("/plantas?petFriendly=false");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("filtra pelos dois juntos", async () => {
    const res = await request(app).get("/plantas?luminosidade=SOL_PLENO&petFriendly=true");
    expect(res.status).toBe(200);
    expect(res.body.map((p: { nome: string }) => p.nome)).toEqual(["Alecrim"]);
  });

  it("filtro válido sem resultado retorna 200 com []", async () => {
    const res = await request(app).get("/plantas?luminosidade=SOMBRA&petFriendly=true");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each(["luminosidade=LUA", "petFriendly=sim", "ordem=estoque"])(
    "filtro inválido %s retorna 400",
    async (query) => {
      const res = await request(app).get(`/plantas?${query}`);
      expect(res.status).toBe(400);
    }
  );

  it("busca por nome sem diferenciar maiúsculas (bônus)", async () => {
    const res = await request(app).get("/plantas?nome=MARAN");
    expect(res.status).toBe(200);
    expect(res.body.map((p: { nome: string }) => p.nome)).toEqual(["Maranta"]);
  });

  it("ordena por preço e por nome (bônus)", async () => {
    const porPreco = await request(app).get("/plantas?ordem=preco");
    expect(porPreco.body.map((p: { preco: number }) => p.preco)).toEqual([1500, 3000, 5000]);

    const porNome = await request(app).get("/plantas?ordem=nome");
    expect(porNome.body.map((p: { nome: string }) => p.nome)).toEqual([
      "Alecrim",
      "Jiboia",
      "Maranta",
    ]);
  });
});

describe("POST /plantas/:id/venda", () => {
  it("vende o que tem (200) e diminui o estoque", async () => {
    const planta = await criarPlanta({ estoque: 5 });
    const res = await request(app).post(`/plantas/${planta.id}/venda`).send({ quantidade: 2 });
    expect(res.status).toBe(200);
    expect(res.body.estoque).toBe(3);
  });

  it("recusa vender mais do que tem (400) sem alterar o estoque", async () => {
    const planta = await criarPlanta({ estoque: 2 });
    const res = await request(app).post(`/plantas/${planta.id}/venda`).send({ quantidade: 3 });
    expect(res.status).toBe(400);

    const depois = await request(app).get(`/plantas/${planta.id}`);
    expect(depois.body.estoque).toBe(2);
  });

  it.each([0, -1, 1.5, "2"])("recusa quantidade %s (400)", async (quantidade) => {
    const planta = await criarPlanta();
    const res = await request(app).post(`/plantas/${planta.id}/venda`).send({ quantidade });
    expect(res.status).toBe(400);
  });

  it("retorna 404 para planta inexistente", async () => {
    const res = await request(app).post("/plantas/9999/venda").send({ quantidade: 1 });
    expect(res.status).toBe(404);
  });

  it("duas vendas simultâneas do último vaso: só uma passa", async () => {
    const planta = await criarPlanta({ estoque: 1 });

    const [a, b] = await Promise.all([
      request(app).post(`/plantas/${planta.id}/venda`).send({ quantidade: 1 }),
      request(app).post(`/plantas/${planta.id}/venda`).send({ quantidade: 1 }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);

    const depois = await request(app).get(`/plantas/${planta.id}`);
    expect(depois.body.estoque).toBe(0);
  });
});

describe("GET /plantas/estoque/valor-total", () => {
  it("retorna zeros com a loja vazia (200)", async () => {
    const res = await request(app).get("/plantas/estoque/valor-total");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valorTotalEmCentavos: 0, totalDeVasos: 0 });
  });

  it("soma preco × estoque e o total de vasos", async () => {
    await criarPlanta({ preco: 8990, estoque: 12 });
    await criarPlanta({ preco: 2500, estoque: 4 });
    await criarPlanta({ preco: 4000, estoque: 0 });

    const res = await request(app).get("/plantas/estoque/valor-total");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valorTotalEmCentavos: 8990 * 12 + 2500 * 4,
      totalDeVasos: 16,
    });
  });
});

describe("GET /plantas/esgotadas (bônus)", () => {
  it("lista só as plantas com estoque zero", async () => {
    await criarPlanta({ nome: "Com estoque", estoque: 3 });
    await criarPlanta({ nome: "Esgotada", estoque: 0 });

    const res = await request(app).get("/plantas/esgotadas");
    expect(res.status).toBe(200);
    expect(res.body.map((p: { nome: string }) => p.nome)).toEqual(["Esgotada"]);
  });
});

describe("casos de borda", () => {
  it("JSON malformado retorna 400 com mensagem em JSON", async () => {
    const res = await request(app)
      .post("/plantas")
      .set("Content-Type", "application/json")
      .send('{"nome": "x",');
    expect(res.status).toBe(400);
    expect(res.body.message).toBeTypeOf("string");
  });

  it.each(["preco", "estoque", "regaACadaDias"])(
    "%s acima do limite do banco retorna 400, não 500",
    async (campo) => {
      const res = await request(app)
        .post("/plantas")
        .send({ ...plantaValida, [campo]: 99999999999 });
      expect(res.status).toBe(400);
      expect(res.body.campo).toBe(campo);
    }
  );

  it("id acima do limite do banco retorna 400, não 500", async () => {
    const res = await request(app).get("/plantas/99999999999");
    expect(res.status).toBe(400);
  });

  it("quantidade acima do limite do banco retorna 400, não 500", async () => {
    const planta = await criarPlanta();
    const res = await request(app)
      .post(`/plantas/${planta.id}/venda`)
      .send({ quantidade: 99999999999 });
    expect(res.status).toBe(400);
  });

  it("rota inexistente retorna 404 em JSON", async () => {
    const res = await request(app).get("/plantinhas");
    expect(res.status).toBe(404);
    expect(res.body.message).toBeTypeOf("string");
  });
});

describe("DELETE /plantas/:id", () => {
  it("deleta (204), depois busca (404) e deleta de novo (404)", async () => {
    const planta = await criarPlanta();

    const del = await request(app).delete(`/plantas/${planta.id}`);
    expect(del.status).toBe(204);

    const busca = await request(app).get(`/plantas/${planta.id}`);
    expect(busca.status).toBe(404);

    const delDeNovo = await request(app).delete(`/plantas/${planta.id}`);
    expect(delDeNovo.status).toBe(404);
  });
});
