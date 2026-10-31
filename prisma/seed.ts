import { Luminosidade } from "@prisma/client";
import prisma from "../src/database";

const plantas = [
  { nome: "Costela-de-adão", especie: "Monstera deliciosa", preco: 8990, estoque: 12, luminosidade: Luminosidade.MEIA_SOMBRA, petFriendly: false, regaACadaDias: 3 },
  { nome: "Jiboia", especie: "Epipremnum aureum", preco: 3490, estoque: 20, luminosidade: Luminosidade.SOMBRA, petFriendly: false, regaACadaDias: 4 },
  { nome: "Maranta", especie: "Maranta leuconeura", preco: 4590, estoque: 7, luminosidade: Luminosidade.MEIA_SOMBRA, petFriendly: true, regaACadaDias: 2 },
  { nome: "Calathea", especie: "Goeppertia orbifolia", preco: 7990, estoque: 0, luminosidade: Luminosidade.SOMBRA, petFriendly: true, regaACadaDias: 3 },
  { nome: "Zamioculca", especie: "Zamioculcas zamiifolia", preco: 6490, estoque: 9, luminosidade: Luminosidade.SOMBRA, petFriendly: false, regaACadaDias: 14 },
  { nome: "Espada-de-são-jorge", especie: "Dracaena trifasciata", preco: 3990, estoque: 15, luminosidade: Luminosidade.MEIA_SOMBRA, petFriendly: false, regaACadaDias: 15 },
  { nome: "Alecrim", especie: "Salvia rosmarinus", preco: 1890, estoque: 25, luminosidade: Luminosidade.SOL_PLENO, petFriendly: true, regaACadaDias: 2 },
  { nome: "Lavanda", especie: "Lavandula angustifolia", preco: 2990, estoque: 0, luminosidade: Luminosidade.SOL_PLENO, petFriendly: false, regaACadaDias: 4 },
  { nome: "Samambaia", especie: "Nephrolepis exaltata", preco: 4290, estoque: 6, luminosidade: Luminosidade.MEIA_SOMBRA, petFriendly: true, regaACadaDias: 2 },
  { nome: "Cacto-mandacaru", especie: "Cereus jamacaru", preco: 5490, estoque: 4, luminosidade: Luminosidade.SOL_PLENO, petFriendly: false, regaACadaDias: 20 },
];

// Só cadastra se a tabela estiver vazia, para nunca duplicar nem apagar dados
const main = async () => {
  const quantidade = await prisma.planta.count();
  if (quantidade > 0) {
    console.log(`🌱 O banco já tem ${quantidade} plantas; seed não executado.`);
    return;
  }

  await prisma.planta.createMany({ data: plantas });
  console.log(`🌱 ${plantas.length} plantas cadastradas.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
