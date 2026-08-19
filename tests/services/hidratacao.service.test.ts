import NaoEncontradoError from "../../src/errors/nao-encontrado.error";
import ValidationError from "../../src/errors/validation.error";
import PlanRepository from "../../src/repositories/plan.repository";
import HidratacaoService, {
    HidratacaoRepository,
} from "../../src/services/hidratacao.service";
import { RegistroHidratacao } from "../../src/types/registro.types";

const META_ML = 2000;
const USUARIO = "usuario-1";

function registro(volumeMl: number, registradoEm: string, id = "r1"): RegistroHidratacao {
    return { id, usuarioId: USUARIO, volumeMl, registradoEm: new Date(registradoEm) };
}

/**
 * O repository de hidratação é substituído por um fake em memória que respeita
 * a janela recebida — é o que permite conferir que o service pediu o intervalo
 * certo sem subir banco.
 */
function montar({
    registros = [] as RegistroHidratacao[],
    meta = META_ML as number | null,
    removidos = 1,
} = {}) {
    const hidratacaoRepository = {
        criar: jest.fn(async (novo) => {
            const criado = { ...novo, id: `r${registros.length + 1}` };
            registros.push(criado);
            return criado;
        }),
        listarPorPeriodo: jest.fn(async (_usuarioId, periodo) =>
            registros.filter(
                (r) => r.registradoEm >= periodo.de && r.registradoEm < periodo.ate,
            ),
        ),
        remover: jest.fn(async () => removidos),
    } as unknown as HidratacaoRepository & {
        criar: jest.Mock;
        listarPorPeriodo: jest.Mock;
        remover: jest.Mock;
    };

    const planRepository = {
        buscarMetaAgua: jest.fn(async () => meta),
    } as unknown as PlanRepository & { buscarMetaAgua: jest.Mock };

    return {
        hidratacaoRepository,
        planRepository,
        service: new HidratacaoService(hidratacaoRepository, planRepository),
    };
}

describe("HidratacaoService", () => {
    describe("registrar", () => {
        it.each([0, -250, 250.5, 5001, NaN])(
            "recusa volumeMl %p com ValidationError",
            async (volume) => {
                const { service, hidratacaoRepository } = montar();

                await expect(service.registrar(USUARIO, volume)).rejects.toBeInstanceOf(
                    ValidationError,
                );
                // Nada pode ter sido gravado antes da recusa.
                expect(hidratacaoRepository.criar).not.toHaveBeenCalled();
            },
        );

        it("grava e devolve o dia já somado", async () => {
            const { service, hidratacaoRepository } = montar();

            const resumo = await service.registrar(USUARIO, 500);

            expect(hidratacaoRepository.criar).toHaveBeenCalledWith(
                expect.objectContaining({ usuarioId: USUARIO, volumeMl: 500 }),
            );
            expect(resumo.totalMl).toBe(500);
            expect(resumo.metaMl).toBe(META_ML);
            expect(resumo.registros).toHaveLength(1);
        });

        it("soma os registros anteriores do mesmo dia", async () => {
            const hoje = new Date().toISOString();
            const { service } = montar({ registros: [registro(250, hoje)] });

            const resumo = await service.registrar(USUARIO, 500);

            expect(resumo.totalMl).toBe(750);
        });

        it("devolve 404 antes de gravar quando o usuário não tem ficha ativa", async () => {
            const { service, hidratacaoRepository } = montar({ meta: null });

            await expect(service.registrar(USUARIO, 500)).rejects.toBeInstanceOf(
                NaoEncontradoError,
            );
            // Sem esta checagem o insert estouraria a FK e viraria 500.
            expect(hidratacaoRepository.criar).not.toHaveBeenCalled();
        });
    });

    describe("doDia", () => {
        it("conta só o que caiu dentro do dia local", async () => {
            const { service } = montar({
                registros: [
                    // 22:12 do dia 18 em Brasília — pertence ao dia 18.
                    registro(300, "2026-08-19T01:12:00.000Z", "ontem"),
                    // 12:00 do dia 19 em Brasília.
                    registro(500, "2026-08-19T15:00:00.000Z", "hoje"),
                ],
            });

            const resumo = await service.doDia(USUARIO, new Date("2026-08-19T15:00:00.000Z"));

            expect(resumo.dia).toBe("2026-08-19");
            expect(resumo.totalMl).toBe(500);
            expect(resumo.registros.map((r) => r.id)).toEqual(["hoje"]);
        });

        it("devolve zero e a meta quando o dia está vazio", async () => {
            const { service } = montar();

            const resumo = await service.doDia(USUARIO, new Date());

            expect(resumo).toMatchObject({ totalMl: 0, metaMl: META_ML, registros: [] });
        });
    });

    describe("remover", () => {
        it("devolve o dia atualizado quando apagou", async () => {
            const { service, hidratacaoRepository } = montar();

            const resumo = await service.remover(USUARIO, "r1");

            expect(hidratacaoRepository.remover).toHaveBeenCalledWith(USUARIO, "r1");
            expect(resumo.totalMl).toBe(0);
        });

        it("devolve 404 quando o registro não existe OU é de outro usuário", async () => {
            // O repository filtra por dono, então as duas situações chegam aqui
            // como zero linhas removidas — e as duas viram 404 de propósito:
            // um 403 confirmaria a existência do registro alheio.
            const { service } = montar({ removidos: 0 });

            await expect(service.remover(USUARIO, "de-outro")).rejects.toBeInstanceOf(
                NaoEncontradoError,
            );
        });
    });
});
