/**
 * Popula os catálogos (Alimento e Exercicio) a partir de src/data/ — as mesmas
 * listas que alimentam o prompt da IA, com os mesmos ids.
 *
 * Preservar os ids é o ponto: assim o id que a IA devolve num plano vira chave
 * estrangeira direta, sem nenhuma tradução no meio.
 *
 * Rodar com: npx prisma db seed  (o migrate reset também chama sozinho)
 */
import { PrismaClient } from "@prisma/client";

import { ALIMENTOS } from "../src/data/alimentos";
import { EXERCICIOS } from "../src/data/exercicios";

const prisma = new PrismaClient();

async function main() {
    // skipDuplicates deixa o seed idempotente: rodar de novo não quebra nem
    // duplica, só completa o que faltar.
    const alimentos = await prisma.alimento.createMany({
        data: ALIMENTOS,
        skipDuplicates: true,
    });

    const exercicios = await prisma.exercicio.createMany({
        data: EXERCICIOS.map((exercicio) => ({
            id: exercicio.id,
            nome: exercicio.nome,
            grupoMuscular: exercicio.grupoMuscular,
            sessoes: exercicio.sessoes,
            articulacoes: exercicio.articulacoes,
        })),
        skipDuplicates: true,
    });

    console.log(`Alimentos inseridos: ${alimentos.count} (catálogo tem ${ALIMENTOS.length})`);
    console.log(`Exercícios inseridos: ${exercicios.count} (catálogo tem ${EXERCICIOS.length})`);
}

main()
    .catch((erro) => {
        console.error(erro);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
