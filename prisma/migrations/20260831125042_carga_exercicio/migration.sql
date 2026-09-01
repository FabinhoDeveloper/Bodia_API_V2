/*
  Warnings:

  - You are about to drop the column `ultimoPesoKg` on the `ExercicioSessao` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ExercicioSessao" DROP COLUMN "ultimoPesoKg";

-- CreateTable
CREATE TABLE "CargaExercicio" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "exercicioId" INTEGER NOT NULL,
    "pesoKg" DOUBLE PRECISION NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargaExercicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargaExercicio_usuarioId_exercicioId_key" ON "CargaExercicio"("usuarioId", "exercicioId");

-- AddForeignKey
ALTER TABLE "CargaExercicio" ADD CONSTRAINT "CargaExercicio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaExercicio" ADD CONSTRAINT "CargaExercicio_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
