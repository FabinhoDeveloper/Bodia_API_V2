-- CreateTable
CREATE TABLE "RegistroRefeicao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroRefeicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroRefeicao_usuarioId_registradoEm_idx" ON "RegistroRefeicao"("usuarioId", "registradoEm");

-- AddForeignKey
ALTER TABLE "RegistroRefeicao" ADD CONSTRAINT "RegistroRefeicao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRefeicao" ADD CONSTRAINT "RegistroRefeicao_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "Refeicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
