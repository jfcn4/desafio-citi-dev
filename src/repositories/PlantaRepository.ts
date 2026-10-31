import { Luminosidade, Prisma } from "@prisma/client";
import prisma from "@database";

export type FiltrosPlanta = {
    luminosidade?: Luminosidade;
    petFriendly?: boolean;
    nome?: string;
    ordem?: "preco" | "nome";
};

export const createPlanta = async (data: Prisma.PlantaCreateInput) => {
    return await prisma.planta.create({
        data: data,
    });
};

// Filtros com valor undefined são ignorados pelo Prisma,
// então uma única consulta atende qualquer combinação de filtros
export const findAllPlantas = async (filtros: FiltrosPlanta) => {
    return await prisma.planta.findMany({
        where: {
            luminosidade: filtros.luminosidade,
            petFriendly: filtros.petFriendly,
            nome: filtros.nome
                ? { contains: filtros.nome, mode: "insensitive" }
                : undefined,
        },
        orderBy: filtros.ordem ? { [filtros.ordem]: "asc" } : { id: "asc" },
    });
};

export const findPlantasEsgotadas = async () => {
    return await prisma.planta.findMany({
        where: { estoque: 0 },
        orderBy: { id: "asc" },
    });
};

export const findPlantaById = async (id: number) => {
    return await prisma.planta.findUnique({
        where: { id: id }
    });
};

export const updatePlanta = async (id: number, data: Prisma.PlantaUpdateInput) => {
    return await prisma.planta.update({
        where: { id: id },
        data: data,
    });
};

export const deletePlanta = async (id: number) => {
    return await prisma.planta.delete({
        where: { id: id }
    });
};

// A conferência do estoque fica no próprio where: o banco só decrementa
// se ainda houver vasos suficientes, numa única operação. Assim duas vendas
// simultâneas do último vaso não conseguem deixar o estoque negativo.
// Retorna true se vendeu e false se o estoque não era suficiente.
export const venderPlanta = async (id: number, quantidade: number) => {
    const resultado = await prisma.planta.updateMany({
        where: { id: id, estoque: { gte: quantidade } },
        data: { estoque: { decrement: quantidade } },
    });

    return resultado.count > 0;
};

export const findPrecoEEstoque = async () => {
    return await prisma.planta.findMany({
        select: { preco: true, estoque: true },
    });
};
