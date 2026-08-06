-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "NivelAtividade" AS ENUM ('SEDENTARIO', 'LEVE', 'MODERADO', 'INTENSO', 'ATLETA');

-- CreateEnum
CREATE TYPE "NivelExperiencia" AS ENUM ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO');

-- CreateEnum
CREATE TYPE "Objetivo" AS ENUM ('PERDER', 'MANTER', 'GANHAR');

-- CreateEnum
CREATE TYPE "TipoRestricao" AS ENUM ('ALIMENTAR', 'FISICA');

-- CreateTable
CREATE TABLE "Alimento" (
    "id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteina" DOUBLE PRECISION NOT NULL,
    "carboidrato" DOUBLE PRECISION NOT NULL,
    "gordura" DOUBLE PRECISION NOT NULL,
    "fibra" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Alimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercicio" (
    "id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "grupoMuscular" TEXT NOT NULL,
    "sessoes" TEXT[],
    "articulacoes" TEXT[],

    CONSTRAINT "Exercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sobrenome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Perfil" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "pesoKg" DOUBLE PRECISION NOT NULL,
    "alturaCm" DOUBLE PRECISION NOT NULL,
    "percentualGordura" DOUBLE PRECISION,
    "nivelAtividade" "NivelAtividade" NOT NULL,
    "nivelExperiencia" "NivelExperiencia" NOT NULL,
    "objetivo" "Objetivo" NOT NULL,
    "diasPorSemana" INTEGER NOT NULL,
    "numeroRefeicoes" INTEGER NOT NULL DEFAULT 4,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restricao" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "tipo" "TipoRestricao" NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "Restricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plano" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tmb" INTEGER NOT NULL,
    "tdee" INTEGER NOT NULL,
    "caloriasAlvo" INTEGER NOT NULL,
    "proteinaG" INTEGER NOT NULL,
    "carboidratoG" INTEGER NOT NULL,
    "gorduraG" INTEGER NOT NULL,
    "metaAguaMl" INTEGER NOT NULL DEFAULT 2000,
    "split" TEXT NOT NULL,
    "diasPorSemana" INTEGER NOT NULL,
    "seriesPorGrupoSemana" INTEGER NOT NULL,
    "observacoes" TEXT,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaTreino" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "frequenciaSemanal" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "FichaTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaTreinoExercicio" (
    "id" TEXT NOT NULL,
    "fichaTreinoId" TEXT NOT NULL,
    "exercicioId" INTEGER NOT NULL,
    "series" INTEGER NOT NULL,
    "repeticoes" TEXT NOT NULL,
    "descansoSegundos" INTEGER NOT NULL DEFAULT 60,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "FichaTreinoExercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refeicao" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
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
CREATE TABLE "RefeicaoItem" (
    "id" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "alimentoId" INTEGER NOT NULL,
    "gramas" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RefeicaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoTreino" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fichaTreinoId" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "duracaoSegundos" INTEGER,
    "totalSeries" INTEGER,
    "volumeKg" DOUBLE PRECISION,

    CONSTRAINT "SessaoTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieRealizada" (
    "id" TEXT NOT NULL,
    "sessaoTreinoId" TEXT NOT NULL,
    "exercicioId" INTEGER NOT NULL,
    "numeroSerie" INTEGER NOT NULL,
    "pesoKg" DOUBLE PRECISION,
    "repeticoes" INTEGER,
    "concluida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SerieRealizada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroRefeicao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "consumidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroRefeicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroHidratacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "mililitros" INTEGER NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroHidratacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alimento_categoria_idx" ON "Alimento"("categoria");

-- CreateIndex
CREATE INDEX "Exercicio_grupoMuscular_idx" ON "Exercicio"("grupoMuscular");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_usuarioId_key" ON "Perfil"("usuarioId");

-- CreateIndex
CREATE INDEX "Restricao_perfilId_tipo_idx" ON "Restricao"("perfilId", "tipo");

-- CreateIndex
CREATE INDEX "Plano_usuarioId_ativo_idx" ON "Plano"("usuarioId", "ativo");

-- CreateIndex
CREATE INDEX "FichaTreino_planoId_idx" ON "FichaTreino"("planoId");

-- CreateIndex
CREATE INDEX "FichaTreinoExercicio_fichaTreinoId_idx" ON "FichaTreinoExercicio"("fichaTreinoId");

-- CreateIndex
CREATE INDEX "Refeicao_planoId_idx" ON "Refeicao"("planoId");

-- CreateIndex
CREATE INDEX "RefeicaoItem_refeicaoId_idx" ON "RefeicaoItem"("refeicaoId");

-- CreateIndex
CREATE INDEX "SessaoTreino_usuarioId_iniciadaEm_idx" ON "SessaoTreino"("usuarioId", "iniciadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "SerieRealizada_sessaoTreinoId_exercicioId_numeroSerie_key" ON "SerieRealizada"("sessaoTreinoId", "exercicioId", "numeroSerie");

-- CreateIndex
CREATE INDEX "RegistroRefeicao_usuarioId_data_idx" ON "RegistroRefeicao"("usuarioId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroRefeicao_usuarioId_refeicaoId_data_key" ON "RegistroRefeicao"("usuarioId", "refeicaoId", "data");

-- CreateIndex
CREATE INDEX "RegistroHidratacao_usuarioId_data_idx" ON "RegistroHidratacao"("usuarioId", "data");

-- AddForeignKey
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restricao" ADD CONSTRAINT "Restricao_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plano" ADD CONSTRAINT "Plano_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTreino" ADD CONSTRAINT "FichaTreino_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTreinoExercicio" ADD CONSTRAINT "FichaTreinoExercicio_fichaTreinoId_fkey" FOREIGN KEY ("fichaTreinoId") REFERENCES "FichaTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTreinoExercicio" ADD CONSTRAINT "FichaTreinoExercicio_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refeicao" ADD CONSTRAINT "Refeicao_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefeicaoItem" ADD CONSTRAINT "RefeicaoItem_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "Refeicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefeicaoItem" ADD CONSTRAINT "RefeicaoItem_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoTreino" ADD CONSTRAINT "SessaoTreino_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoTreino" ADD CONSTRAINT "SessaoTreino_fichaTreinoId_fkey" FOREIGN KEY ("fichaTreinoId") REFERENCES "FichaTreino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieRealizada" ADD CONSTRAINT "SerieRealizada_sessaoTreinoId_fkey" FOREIGN KEY ("sessaoTreinoId") REFERENCES "SessaoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieRealizada" ADD CONSTRAINT "SerieRealizada_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRefeicao" ADD CONSTRAINT "RegistroRefeicao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRefeicao" ADD CONSTRAINT "RegistroRefeicao_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "Refeicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroHidratacao" ADD CONSTRAINT "RegistroHidratacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
