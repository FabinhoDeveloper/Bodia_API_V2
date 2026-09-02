-- A ficha passa a ter VIGÊNCIA: um plano regenerado no meio de um dia que já
-- tem refeição marcada só entra em vigor na próxima meia-noite.
--
-- O DEFAULT preenche as linhas existentes com o instante da migração, o que
-- empataria TODAS elas no mesmo valor e deixaria o `orderBy: vigenteDe desc`
-- sem critério para separar a ficha de ontem da de anteontem. O UPDATE abaixo
-- reescreve com `criadaEm`, que é a data em que cada ficha de fato passou a
-- valer — antes desta migração, gravar era o mesmo que entrar em vigor.

-- DropIndex
DROP INDEX "FichaAlimentacao_usuarioId_ativa_idx";

-- DropIndex
DROP INDEX "FichaTreino_usuarioId_ativa_idx";

-- AlterTable
ALTER TABLE "FichaAlimentacao" ADD COLUMN     "vigenteDe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FichaTreino" ADD COLUMN     "vigenteDe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: antes da vigência, a ficha valia a partir do instante em que foi
-- criada. Roda DEPOIS do ADD COLUMN e ANTES dos índices, para o índice já
-- nascer sobre os valores definitivos.
UPDATE "FichaAlimentacao" SET "vigenteDe" = "criadaEm";
UPDATE "FichaTreino" SET "vigenteDe" = "criadaEm";

-- CreateIndex
CREATE INDEX "FichaAlimentacao_usuarioId_ativa_vigenteDe_idx" ON "FichaAlimentacao"("usuarioId", "ativa", "vigenteDe");

-- CreateIndex
CREATE INDEX "FichaTreino_usuarioId_ativa_vigenteDe_idx" ON "FichaTreino"("usuarioId", "ativa", "vigenteDe");
