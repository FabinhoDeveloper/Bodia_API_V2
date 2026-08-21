-- SessaoTreino.diaSemana (um dia) -> diasSemana (lista de dias).
--
-- Uma sessão pode se repetir na semana (Upper 2x num split de 4 dias). Com um
-- dia só, a segunda ocorrência era descartada: quem pedia 4 dias de treino via
-- 2 na tela.
--
-- Os dados existentes são PRESERVADOS: o dia antigo vira o primeiro elemento da
-- lista. O segundo dia das sessões repetidas só aparece em fichas geradas a
-- partir daqui — não há como inferir retroativamente qual seria.

ALTER TABLE "SessaoTreino" ADD COLUMN "diasSemana" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "SessaoTreino"
   SET "diasSemana" = ARRAY["diaSemana"]
 WHERE "diaSemana" IS NOT NULL AND "diaSemana" <> '';

ALTER TABLE "SessaoTreino" ALTER COLUMN "diasSemana" DROP DEFAULT;

ALTER TABLE "SessaoTreino" DROP COLUMN "diaSemana";
