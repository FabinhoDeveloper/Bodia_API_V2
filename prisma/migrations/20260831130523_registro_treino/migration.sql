-- CreateTable
CREATE TABLE "RegistroTreino" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "sessaoTreinoId" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "RegistroTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroSerie" (
    "id" TEXT NOT NULL,
    "registroTreinoId" TEXT NOT NULL,
    "exercicioSessaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "repeticoes" INTEGER NOT NULL,
    "pesoKg" DOUBLE PRECISION,

    CONSTRAINT "RegistroSerie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroTreino_usuarioId_iniciadoEm_idx" ON "RegistroTreino"("usuarioId", "iniciadoEm");

-- CreateIndex
CREATE INDEX "RegistroSerie_registroTreinoId_idx" ON "RegistroSerie"("registroTreinoId");

-- AddForeignKey
ALTER TABLE "RegistroTreino" ADD CONSTRAINT "RegistroTreino_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroTreino" ADD CONSTRAINT "RegistroTreino_sessaoTreinoId_fkey" FOREIGN KEY ("sessaoTreinoId") REFERENCES "SessaoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroSerie" ADD CONSTRAINT "RegistroSerie_registroTreinoId_fkey" FOREIGN KEY ("registroTreinoId") REFERENCES "RegistroTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroSerie" ADD CONSTRAINT "RegistroSerie_exercicioSessaoId_fkey" FOREIGN KEY ("exercicioSessaoId") REFERENCES "ExercicioSessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
