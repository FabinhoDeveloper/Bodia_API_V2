import NaoEncontradoError from "../../src/errors/nao-encontrado.error";
import ValidationError from "../../src/errors/validation.error";
import PlanRepository from "../../src/repositories/plan.repository";
import RefeicaoService, {
    RefeicaoRepository,
} from "../../src/services/refeicao.service";
import { RegistroRefeicaoComPrescricao } from "../../src/types/registro.types";

const USUARIO = "usuario-1";
const CAFE = "refeicao-cafe";
const ALMOCO = "refeicao-almoco";

const METAS = { caloriasAlvo: 2000, proteinaG: 150, carboidratoG: 200, gorduraG: 60 };

function registro(
    refeicaoId: string,
    registradoEm: string,
    macros = { kcal: 500, proteinaG: 40, carboidratoG: 50, gorduraG: 15 },
): RegistroRefeicaoComPrescricao {
    return {
        id: `r-${refeicaoId}`,
        usuarioId: USUARIO,
        refeicaoId,
        registradoEm: new Date(registradoEm),
        refeicao: { nome: "Refeição", horario: "12:00", ...macros },
    };
}

/**
 * Fake em memória que respeita a janela recebida — é o que permite conferir que
 * o service pediu o intervalo certo sem subir banco.
 */
function montar({
    registros = [] as RegistroRefeicaoComPrescricao[],
    temFicha = true,
    idsDaFicha = [CAFE, ALMOCO],
} = {}) {
    const refeicaoRepository = {
        criar: jest.fn(async (novo) => {
            const criado = registro(novo.refeicaoId, novo.registradoEm.toISOString());
            registros.push(criado);
            return criado;
        }),
        listarPorPeriodo: jest.fn(async (_usuarioId, periodo) =>
            registros.filter((r) => r.registradoEm >= periodo.de && r.registradoEm < periodo.ate),
        ),
        buscarNoDia: jest.fn(
            async (_usuarioId, refeicaoId, periodo) =>
                registros.find(
                    (r) =>
                        r.refeicaoId === refeicaoId &&
                        r.registradoEm >= periodo.de &&
                        r.registradoEm < periodo.ate,
                ) ?? null,
        ),
        remover: jest.fn(async (_usuarioId, refeicaoId, periodo) => {
            const antes = registros.length;
            const sobra = registros.filter(
                (r) =>
                    !(
                        r.refeicaoId === refeicaoId &&
                        r.registradoEm >= periodo.de &&
                        r.registradoEm < periodo.ate
                    ),
            );
            registros.length = 0;
            registros.push(...sobra);
            return antes - registros.length;
        }),
    } as unknown as RefeicaoRepository & {
        criar: jest.Mock;
        listarPorPeriodo: jest.Mock;
        buscarNoDia: jest.Mock;
        remover: jest.Mock;
    };

    const planRepository = {
        buscarFichaAlimentacaoAtiva: jest.fn(async () =>
            temFicha ? { ...METAS, refeicoes: idsDaFicha.map((id) => ({ id })) } : null,
        ),
    } as unknown as PlanRepository & { buscarFichaAlimentacaoAtiva: jest.Mock };

    return {
        refeicaoRepository,
        planRepository,
        registros,
        service: new RefeicaoService(refeicaoRepository, planRepository),
    };
}

describe("RefeicaoService", () => {
    describe("registrar", () => {
        it("recusa refeicaoId ausente com ValidationError", async () => {
            const { service, planRepository } = montar();

            await expect(service.registrar(USUARIO, "")).rejects.toBeInstanceOf(ValidationError);
            // Falha antes de qualquer consulta — é o que deixa o smoke test
            // exercitar esta rota sem banco.
            expect(planRepository.buscarFichaAlimentacaoAtiva).not.toHaveBeenCalled();
        });

        it("marca a refeição e devolve o dia já somado", async () => {
            const { service, refeicaoRepository } = montar();

            const resumo = await service.registrar(USUARIO, CAFE);

            expect(refeicaoRepository.criar).toHaveBeenCalledWith(
                expect.objectContaining({ usuarioId: USUARIO, refeicaoId: CAFE }),
            );
            expect(resumo.consumido).toEqual({
                kcal: 500,
                proteinaG: 40,
                carboidratoG: 50,
                gorduraG: 15,
            });
            expect(resumo.metas.kcal).toBe(METAS.caloriasAlvo);
            expect(resumo.totalRefeicoes).toBe(2);
        });

        it("é idempotente: marcar duas vezes não duplica a linha nem as calorias", async () => {
            const { service, refeicaoRepository, registros } = montar();

            await service.registrar(USUARIO, CAFE);
            const segundo = await service.registrar(USUARIO, CAFE);

            expect(refeicaoRepository.criar).toHaveBeenCalledTimes(1);
            expect(registros).toHaveLength(1);
            expect(segundo.consumido.kcal).toBe(500);
        });

        it("recusa refeição que não está na ficha do usuário", async () => {
            const { service, refeicaoRepository } = montar();

            await expect(
                service.registrar(USUARIO, "refeicao-de-outra-pessoa"),
            ).rejects.toBeInstanceOf(NaoEncontradoError);
            expect(refeicaoRepository.criar).not.toHaveBeenCalled();
        });

        it("devolve 404 antes de gravar quando não há ficha ativa", async () => {
            const { service, refeicaoRepository } = montar({ temFicha: false });

            await expect(service.registrar(USUARIO, CAFE)).rejects.toBeInstanceOf(
                NaoEncontradoError,
            );
            expect(refeicaoRepository.criar).not.toHaveBeenCalled();
        });
    });

    describe("doDia", () => {
        it("conta só o que caiu dentro do dia local", async () => {
            const { service } = montar({
                registros: [
                    // 22:12 do dia 18 em Brasília — pertence ao dia 18.
                    registro(CAFE, "2026-08-19T01:12:00.000Z"),
                    // 12:00 do dia 19 em Brasília.
                    registro(ALMOCO, "2026-08-19T15:00:00.000Z"),
                ],
            });

            const resumo = await service.doDia(USUARIO, new Date("2026-08-19T15:00:00.000Z"));

            expect(resumo.dia).toBe("2026-08-19");
            expect(resumo.registros.map((r) => r.refeicaoId)).toEqual([ALMOCO]);
            expect(resumo.consumido.kcal).toBe(500);
        });

        it("soma refeição prescrita numa ficha que já foi desativada", async () => {
            // O id não está mais na ficha ativa — o plano foi regenerado hoje.
            // Os macros vêm do JOIN, então a conta do dia continua certa.
            const { service } = montar({
                registros: [registro("refeicao-da-ficha-antiga", new Date().toISOString())],
                idsDaFicha: [CAFE, ALMOCO],
            });

            const resumo = await service.doDia(USUARIO, new Date());

            expect(resumo.consumido.kcal).toBe(500);
            expect(resumo.registros).toHaveLength(1);
        });

        it("devolve zero e as metas quando nada foi marcado", async () => {
            const { service } = montar();

            const resumo = await service.doDia(USUARIO, new Date());

            expect(resumo.consumido).toEqual({
                kcal: 0,
                proteinaG: 0,
                carboidratoG: 0,
                gorduraG: 0,
            });
            expect(resumo.registros).toEqual([]);
        });
    });

    describe("remover", () => {
        it("desmarca e devolve o dia sem aquelas calorias", async () => {
            const { service } = montar();

            await service.registrar(USUARIO, CAFE);
            const resumo = await service.remover(USUARIO, CAFE);

            expect(resumo.consumido.kcal).toBe(0);
            expect(resumo.registros).toEqual([]);
        });

        it("devolve 404 quando a refeição não está marcada hoje", async () => {
            const { service } = montar();

            await expect(service.remover(USUARIO, CAFE)).rejects.toBeInstanceOf(
                NaoEncontradoError,
            );
        });

        it("não apaga a marcação de um dia anterior", async () => {
            const { service, registros } = montar({
                registros: [registro(CAFE, "2020-01-01T15:00:00.000Z")],
            });

            await expect(service.remover(USUARIO, CAFE)).rejects.toBeInstanceOf(
                NaoEncontradoError,
            );
            expect(registros).toHaveLength(1);
        });
    });
});
