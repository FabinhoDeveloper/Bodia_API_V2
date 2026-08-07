-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "NivelAtividade" AS ENUM ('SEDENTARIO', 'LEVE', 'MODERADO', 'INTENSO', 'ATLETA');

-- CreateEnum
CREATE TYPE "NivelExperiencia" AS ENUM ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO');

-- CreateEnum
CREATE TYPE "Objetivo" AS ENUM ('PERDER', 'MANTER', 'GANHAR');

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
    "sexo" "Sexo" NOT NULL,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "alturaCm" DOUBLE PRECISION NOT NULL,
    "percentualGordura" DOUBLE PRECISION,
    "nivelAtividade" "NivelAtividade" NOT NULL,
    "nivelExperiencia" "NivelExperiencia" NOT NULL,
    "objetivo" "Objetivo" NOT NULL,
    "diasPorSemana" INTEGER NOT NULL,
    "numeroRefeicoes" INTEGER NOT NULL DEFAULT 4,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroPeso" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "pesoKg" DOUBLE PRECISION NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroPeso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alimento_categoria_idx" ON "Alimento"("categoria");

-- CreateIndex
CREATE INDEX "Exercicio_grupoMuscular_idx" ON "Exercicio"("grupoMuscular");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "RegistroPeso_usuarioId_registradoEm_idx" ON "RegistroPeso"("usuarioId", "registradoEm");

-- AddForeignKey
ALTER TABLE "RegistroPeso" ADD CONSTRAINT "RegistroPeso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
