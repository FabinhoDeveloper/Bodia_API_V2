-- CreateEnum
CREATE TYPE "TipoRestricao" AS ENUM ('ALIMENTAR', 'FISICA');

-- CreateTable
CREATE TABLE "Restricao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoRestricao" NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "Restricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaTreino" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "split" TEXT NOT NULL,
    "diasPorSemana" INTEGER NOT NULL,
    "seriesPorGrupoSemana" INTEGER NOT NULL,

    CONSTRAINT "FichaTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoTreino" (
    "id" TEXT NOT NULL,
    "fichaTreinoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "diaSemana" TEXT NOT NULL,
    "frequenciaSemanal" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "SessaoTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExercicioSessao" (
    "id" TEXT NOT NULL,
    "sessaoTreinoId" TEXT NOT NULL,
    "exercicioId" INTEGER NOT NULL,
    "series" INTEGER NOT NULL,
    "repeticoes" TEXT NOT NULL,
    "descansoSegundos" INTEGER NOT NULL DEFAULT 60,
    "ordem" INTEGER NOT NULL,
    "ultimoPesoKg" DOUBLE PRECISION,

    CONSTRAINT "ExercicioSessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaAlimentacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tmb" INTEGER NOT NULL,
    "tdee" INTEGER NOT NULL,
    "caloriasAlvo" INTEGER NOT NULL,
    "proteinaG" INTEGER NOT NULL,
    "carboidratoG" INTEGER NOT NULL,
    "gorduraG" INTEGER NOT NULL,
    "metaAguaMl" INTEGER NOT NULL DEFAULT 2000,

    CONSTRAINT "FichaAlimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refeicao" (
    "id" TEXT NOT NULL,
    "fichaAlimentacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "kcal" INTEGER NOT NULL,
    "proteinaG" INTEGER NOT NULL,
    "carboidratoG" INTEGER NOT NULL,
    "gorduraG" INTEGER NOT NULL,

    CONSTRAINT "Refeicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRefeicao" (
    "id" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "alimentoId" INTEGER NOT NULL,
    "gramas" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ItemRefeicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Restricao_usuarioId_tipo_idx" ON "Restricao"("usuarioId", "tipo");

-- CreateIndex
CREATE INDEX "FichaTreino_usuarioId_ativa_idx" ON "FichaTreino"("usuarioId", "ativa");

-- CreateIndex
CREATE INDEX "SessaoTreino_fichaTreinoId_idx" ON "SessaoTreino"("fichaTreinoId");

-- CreateIndex
CREATE INDEX "ExercicioSessao_sessaoTreinoId_idx" ON "ExercicioSessao"("sessaoTreinoId");

-- CreateIndex
CREATE INDEX "FichaAlimentacao_usuarioId_ativa_idx" ON "FichaAlimentacao"("usuarioId", "ativa");

-- CreateIndex
CREATE INDEX "Refeicao_fichaAlimentacaoId_idx" ON "Refeicao"("fichaAlimentacaoId");

-- CreateIndex
CREATE INDEX "ItemRefeicao_refeicaoId_idx" ON "ItemRefeicao"("refeicaoId");

-- AddForeignKey
ALTER TABLE "Restricao" ADD CONSTRAINT "Restricao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTreino" ADD CONSTRAINT "FichaTreino_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoTreino" ADD CONSTRAINT "SessaoTreino_fichaTreinoId_fkey" FOREIGN KEY ("fichaTreinoId") REFERENCES "FichaTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercicioSessao" ADD CONSTRAINT "ExercicioSessao_sessaoTreinoId_fkey" FOREIGN KEY ("sessaoTreinoId") REFERENCES "SessaoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercicioSessao" ADD CONSTRAINT "ExercicioSessao_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaAlimentacao" ADD CONSTRAINT "FichaAlimentacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refeicao" ADD CONSTRAINT "Refeicao_fichaAlimentacaoId_fkey" FOREIGN KEY ("fichaAlimentacaoId") REFERENCES "FichaAlimentacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRefeicao" ADD CONSTRAINT "ItemRefeicao_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "Refeicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRefeicao" ADD CONSTRAINT "ItemRefeicao_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
