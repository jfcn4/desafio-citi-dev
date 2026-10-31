# 🌿 Folhagem & Cia — API

## Visão geral

A **Folhagem & Cia** vende plantas pela internet e controlava o estoque numa planilha, o que já fez a loja vender uma planta que não existia mais. Esta API substitui a planilha: cadastra, lista, edita e remove plantas, registra vendas sem nunca deixar o estoque negativo e calcula quanto vale o estoque.

**Stack:** Node.js · Express · TypeScript · Prisma · PostgreSQL · Docker

O projeto segue a organização em camadas do CRUD de usuários que veio no template:

```
Requisição → routes.ts → Controller → Repository → Banco
                              ↓
Resposta  ←───────────────────┘  (status HTTP + JSON)
```

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Rotas | `src/routes.ts` | Liga cada URL a uma função do controller |
| Controller | `src/controllers/PlantaController.ts` | Lê a requisição, valida, decide o status e responde |
| Repository | `src/repositories/PlantaRepository.ts` | Única camada que conversa com o banco (Prisma) |

Extras: testes automatizados (`tests/`), script de seed (`prisma/seed.ts`) e um painel web da loja (`public/`), servido em `/loja`. O CRUD de usuários do template continua disponível em `/users`.

---

## Como rodar

**Pré-requisitos:** [Docker](https://www.docker.com/products/docker-desktop/) aberto, [Node.js 20+](https://nodejs.org) e Yarn (`npm install -g yarn`).

```bash
# 1. Crie o .env a partir do modelo
cp .env.example .env        # no PowerShell ou CMD: copy .env.example .env

# 2. Instale as dependências na sua máquina
yarn

# 3. Suba a API e o banco
docker compose up -d --build

# 4. Crie as tabelas no banco a partir das migrations
yarn migration

# 5. (Opcional) Cadastre 10 plantas de exemplo
yarn seed
```

| Endereço | O que tem |
|---|---|
| http://localhost:3001 | A API: deve responder `{ "message": "API do treinamento de CRUD do CITi 🚀" }` |
| http://localhost:3001/loja | O painel web da loja |

### Comandos do dia a dia

| Comando | O que faz |
|---|---|
| `docker compose up -d` | Sobe a API e o banco |
| `docker compose logs -f server` | Mostra os logs da API (é aqui que os erros aparecem) |
| `docker compose down` | Derruba os containers (os dados do banco continuam salvos) |
| `yarn migration` | Cria uma migration a partir do `schema.prisma` e aplica no banco |
| `yarn seed` | Cadastra 10 plantas de exemplo, se a tabela estiver vazia |
| `yarn test` | Roda os testes automatizados |
| `yarn studio` | Abre o Prisma Studio para ver o banco no navegador |
| `yarn typecheck` | Procura erros de tipo no TypeScript |

O arquivo `requests.http` tem exemplos prontos de todas as rotas, incluindo os casos de erro. Para usar, instale a extensão **REST Client** no VS Code e clique em **Send Request** acima de cada exemplo.

---

## Modelo de dados

### `Planta`

| Campo | Tipo | Exemplo | Regras |
|---|---|---|---|
| `id` | Int | `1` | Gerado pelo banco (autoincrement) |
| `nome` | String | `"Costela-de-adão"` | Nome popular. Texto não vazio |
| `especie` | String | `"Monstera deliciosa"` | Nome científico. Texto não vazio |
| `preco` | Int | `8990` | Em **centavos** (`8990` = R$ 89,90). Inteiro maior que zero |
| `estoque` | Int | `12` | Vasos disponíveis. Inteiro maior ou igual a zero (zero = esgotada) |
| `luminosidade` | Enum `Luminosidade` | `"MEIA_SOMBRA"` | Um dos valores do enum abaixo |
| `petFriendly` | Boolean | `false` | Segura para cães e gatos? `true` ou `false` |
| `regaACadaDias` | Int | `3` | De quantos em quantos dias regar. Inteiro maior ou igual a 1 |
| `createdAt` | DateTime | | Preenchido pelo banco |
| `updatedAt` | DateTime | | Atualizado pelo banco a cada edição |

Os campos numéricos aceitam no máximo `2147483647`, o maior valor de uma coluna `Int` do PostgreSQL.

### Enum `Luminosidade`

| Valor | Significado |
|---|---|
| `SOMBRA` | Ambientes internos com pouca luz |
| `MEIA_SOMBRA` | Luz indireta ou sol fraco |
| `SOL_PLENO` | Sol direto por várias horas |

---

## Rotas

| Método | Rota | O que faz | Sucesso |
|---|---|---|---|
| `POST` | `/plantas` | Cadastra uma planta | `201` |
| `GET` | `/plantas` | Lista as plantas, com filtros opcionais | `200` |
| `GET` | `/plantas/esgotadas` | Lista as plantas com estoque zero (bônus) | `200` |
| `GET` | `/plantas/estoque/valor-total` | Valor total do estoque e total de vasos | `200` |
| `GET` | `/plantas/:id` | Busca uma planta | `200` |
| `PATCH` | `/plantas/:id` | Edita só os campos enviados | `200` |
| `DELETE` | `/plantas/:id` | Remove uma planta | `204` |
| `POST` | `/plantas/:id/venda` | Registra uma venda e diminui o estoque | `200` |

Todas as requisições com corpo usam JSON, com os tipos certos: `"preco": 8990`, sem aspas no número.

### `POST /plantas`

Cadastra uma planta. **Todos os campos são obrigatórios.** Campos fora do modelo (como `id` ou `createdAt`) são ignorados.

**Requisição:**
```json
{
  "nome": "Costela-de-adão",
  "especie": "Monstera deliciosa",
  "preco": 8990,
  "estoque": 12,
  "luminosidade": "MEIA_SOMBRA",
  "petFriendly": false,
  "regaACadaDias": 3
}
```

**Resposta `201`:**
```json
{
  "id": 1,
  "nome": "Costela-de-adão",
  "especie": "Monstera deliciosa",
  "preco": 8990,
  "estoque": 12,
  "luminosidade": "MEIA_SOMBRA",
  "petFriendly": false,
  "regaACadaDias": 3,
  "createdAt": "2026-10-31T14:48:23.948Z",
  "updatedAt": "2026-10-31T14:48:23.948Z"
}
```

### `GET /plantas`

Lista as plantas. Os filtros são opcionais e podem ser combinados.

| Parâmetro | Valores aceitos | Exemplo |
|---|---|---|
| `luminosidade` | `SOMBRA`, `MEIA_SOMBRA`, `SOL_PLENO` | `?luminosidade=SOMBRA` |
| `petFriendly` | `true`, `false` | `?petFriendly=true` |
| `nome` (bônus) | Qualquer texto. Busca parcial, sem diferenciar maiúsculas | `?nome=costela` |
| `ordem` (bônus) | `preco` ou `nome`, em ordem crescente. Sem `ordem`, a lista vem por `id` | `?ordem=preco` |

Exemplo: `GET /plantas?luminosidade=MEIA_SOMBRA&petFriendly=false&ordem=preco`

**Resposta `200`:** uma lista de plantas, no mesmo formato do cadastro. Um filtro válido sem resultado responde `200` com `[]`.

### `GET /plantas/esgotadas` (bônus)

Lista as plantas com `estoque` igual a zero, por `id`.

**Resposta `200`:** uma lista de plantas, ou `[]` se nenhuma estiver esgotada.

### `GET /plantas/estoque/valor-total`

Soma `preco × estoque` de todas as plantas e o total de vasos.

**Resposta `200`:**
```json
{
  "valorTotalEmCentavos": 423020,
  "totalDeVasos": 98
}
```

Com a loja vazia, responde `200` com os dois valores zerados.

### `GET /plantas/:id`

Busca uma planta pelo `id`. Exemplo: `GET /plantas/1`

**Resposta `200`:** a planta, no mesmo formato do cadastro.

### `PATCH /plantas/:id`

Edita uma planta. **Nenhum campo é obrigatório**, mas os enviados seguem as mesmas regras do cadastro. Os campos não enviados continuam como estavam.

**Requisição** (`PATCH /plantas/1`):
```json
{ "preco": 9990 }
```

**Resposta `200`:** a planta atualizada.
```json
{
  "id": 1,
  "nome": "Costela-de-adão",
  "especie": "Monstera deliciosa",
  "preco": 9990,
  "estoque": 12,
  "luminosidade": "MEIA_SOMBRA",
  "petFriendly": false,
  "regaACadaDias": 3,
  "createdAt": "2026-10-31T14:48:23.948Z",
  "updatedAt": "2026-10-31T14:48:24.026Z"
}
```

### `DELETE /plantas/:id`

Remove uma planta. Exemplo: `DELETE /plantas/1`

**Resposta `204`:** sem corpo.

### `POST /plantas/:id/venda`

Registra a venda de uma quantidade de vasos e diminui o estoque. Se não houver vasos suficientes, **nada é alterado**.

**Requisição** (`POST /plantas/1/venda`):
```json
{ "quantidade": 2 }
```

**Resposta `200`:** a planta com o estoque atualizado.
```json
{
  "id": 1,
  "nome": "Costela-de-adão",
  "especie": "Monstera deliciosa",
  "preco": 9990,
  "estoque": 10,
  "luminosidade": "MEIA_SOMBRA",
  "petFriendly": false,
  "regaACadaDias": 3,
  "createdAt": "2026-10-31T14:48:23.948Z",
  "updatedAt": "2026-10-31T14:48:24.039Z"
}
```

---

## Erros e status HTTP

Todo erro responde em JSON, com uma `message`. Quando o erro é num campo específico, a resposta também diz qual em `campo`:

```json
{
  "campo": "preco",
  "message": "preco deve ser um inteiro maior que zero (valor em centavos)."
}
```

| Rota | `400` Bad Request | `404` Not Found |
|---|---|---|
| `POST /plantas` | Campo faltando, tipo errado ou valor fora das regras | |
| `GET /plantas` | Filtro com valor inválido (`?luminosidade=LUA`, `?petFriendly=sim`, `?ordem=estoque`, `?nome=` vazio) | |
| `GET /plantas/:id` | `id` inválido (`abc`, `0`, `-1`, `1.5`) | Planta não existe |
| `PATCH /plantas/:id` | `id` inválido; nenhum campo da planta no corpo; campo com valor fora das regras | Planta não existe |
| `DELETE /plantas/:id` | `id` inválido | Planta não existe |
| `POST /plantas/:id/venda` | `id` inválido; `quantidade` que não é inteiro maior que zero; estoque insuficiente | Planta não existe |

Erros que valem para todas as rotas:

| Status | Quando |
|---|---|
| `400` | O corpo da requisição não é um JSON válido (por exemplo, uma vírgula sobrando) |
| `404` | A rota não existe |
| `500` | Erro inesperado no servidor. O detalhe aparece em `docker compose logs -f server` |

Exemplos de mensagens:

| Situação | Status | Resposta |
|---|---|---|
| Cadastro sem `especie` | `400` | `{ "campo": "especie", "message": "O campo especie é obrigatório." }` |
| `"preco": "8990"` (texto) | `400` | `{ "campo": "preco", "message": "preco deve ser um inteiro maior que zero (valor em centavos)." }` |
| `"luminosidade": "LUA"` | `400` | `{ "campo": "luminosidade", "message": "luminosidade deve ser um destes valores: SOMBRA, MEIA_SOMBRA, SOL_PLENO." }` |
| `GET /plantas?luminosidade=LUA` | `400` | `{ "campo": "luminosidade", "message": "Filtro luminosidade inválido. Use: SOMBRA, MEIA_SOMBRA, SOL_PLENO." }` |
| `GET /plantas/abc` | `400` | `{ "campo": "id", "message": "O id deve ser um inteiro positivo." }` |
| `GET /plantas/99` (não existe) | `404` | `{ "message": "Planta com id 99 não encontrada." }` |
| `PATCH` com corpo `{}` | `400` | `{ "message": "Nenhum campo válido para atualizar." }` |
| Venda de 50 vasos com 10 em estoque | `400` | `{ "campo": "quantidade", "message": "Estoque insuficiente: temos só 10 vasos de Costela-de-adão." }` |
| Venda com `"quantidade": 0` | `400` | `{ "campo": "quantidade", "message": "quantidade deve ser um inteiro maior que zero." }` |

---

## Decisões e bônus

### Bônus do enunciado

- **Busca por nome** sem diferenciar maiúsculas: `?nome=costela`.
- **Ordenação** por preço ou nome: `?ordem=preco` e `?ordem=nome`.
- **Rota `GET /plantas/esgotadas`.**
- **Script de seed** com 10 plantas variadas: `yarn seed`.

### Duas vendas simultâneas do último vaso

Se a venda fosse feita em passos separados (buscar a planta, conferir o estoque e só então diminuir), duas compras do último vaso que chegassem ao mesmo tempo poderiam passar as duas pela conferência antes de qualquer uma diminuir o estoque. O resultado seria estoque `-1`: o mesmo problema da planilha.

Por isso, a conferência fica **dentro da própria atualização**, no `where`:

```ts
prisma.planta.updateMany({
  where: { id: id, estoque: { gte: quantidade } },
  data: { estoque: { decrement: quantidade } },
});
```

O banco só diminui o estoque se ainda houver vasos suficientes, e faz isso numa única operação. Se nenhuma linha for alterada, a resposta é `400`. Um teste automatizado manda duas vendas do último vaso ao mesmo tempo e confere que exatamente uma passa e o estoque termina em zero.

### Outras decisões

- **Uma única função de validação** atende o cadastro (todos os campos obrigatórios) e a edição (nenhum obrigatório, mas os enviados seguem as mesmas regras).
- **Presença checada com `=== undefined`**, e não com `!campo`. Como `!0` e `!false` são verdadeiros, `!campo` recusaria estoque zero e plantas que não são pet-friendly.
- **Campos fora do modelo são ignorados:** o corpo é desestruturado e só os campos da planta chegam ao banco.
- **`PATCH` sem nenhum campo da planta responde `400`**, em vez de um `200` que não altera nada.
- **Textos são salvos sem espaços nas pontas.**
- **Números acima de `2147483647` respondem `400`.** Sem isso, o banco recusaria o valor e a resposta viraria `500`, quando o erro é do cliente.
- **JSON malformado responde `400` em JSON**, em vez da página HTML padrão do Express.
- **O `app` foi separado do `listen`** (`src/app.ts` e `src/server.ts`), para os testes usarem a API sem abrir uma porta.

### Testes automatizados

51 testes com [Vitest](https://vitest.dev) e [Supertest](https://github.com/ladjs/supertest) cobrem todos os testes essenciais do enunciado, a venda simultânea e casos de borda. Com os containers de pé:

```bash
yarn test
```

Os testes usam um **banco separado**, `treinamento-crud-test`, recriado do zero a cada execução. O banco de desenvolvimento nunca é tocado.

### Painel web

Em http://localhost:3001/loja há um painel da loja feito com HTML, CSS e JavaScript puros, sem build. Ele consome a própria API: lista as plantas com filtros, cadastra, edita, vende, exclui e mostra o valor do estoque. As mensagens de erro exibidas são as que a API retorna.

---

## Problemas comuns

| Erro | O que fazer |
|---|---|
| `'cross-env' não é reconhecido como um comando` | Faltou instalar as dependências: rode `yarn`. |
| `Environment variable not found: DATABASE_URL` | Falta o `.env` na raiz do projeto: `cp .env.example .env`. |
| `failed to connect to the docker API` | O Docker está fechado. Abra e espere ele ficar pronto. |
| `port is already allocated` | Troque `SERVER_PORT` ou `DATABASE_PORT` no `.env` e suba de novo. |
| `Can't reach database server` | Os containers não estão de pé (`docker compose up -d`) ou o banco ainda está iniciando: espere uns 10 segundos e rode o comando de novo. |
| `P1000: Authentication failed` ou `address already in use` na porta 5432 | Um Postgres instalado na máquina está usando a 5432. Troque `DATABASE_PORT=5433` no `.env`, rode `docker compose down` e `docker compose up -d`, e repita o `yarn migration`. |
| `Property 'planta' does not exist on type 'PrismaClient'` | Rode `yarn migration` e, no VS Code, **Ctrl+Shift+P → Restart TS Server**. |
| A API não responde em `localhost:3001` | Veja o erro em `docker compose logs -f server`. |
| `500` ao criar ou editar depois de mudar o `schema.prisma` | O banco ainda está com as colunas antigas: rode `yarn migration`. |
