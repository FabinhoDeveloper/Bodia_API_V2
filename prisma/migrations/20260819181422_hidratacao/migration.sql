-- CreateTable
CREATE TABLE "RegistroHidratacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroHidratacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroHidratacao_usuarioId_registradoEm_idx" ON "RegistroHidratacao"("usuarioId", "registradoEm");

-- AddForeignKey
ALTER TABLE "RegistroHidratacao" ADD CONSTRAINT "RegistroHidratacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
