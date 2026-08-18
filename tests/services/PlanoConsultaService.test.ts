import NaoEncontradoError from "../../src/errors/NaoEncontradoError";
import PlanRepository from "../../src/repositories/plan.repository";
import PlanoConsultaService from "../../src/services/PlanoConsultaService";

function usuarioNoBanco(overrides: Record<string, unknown> = {}) {
    return {
        nome: "Ana",
        sobrenome: "Silva",
        email: "ana@teste.com",
        alturaCm: 165,
        objetivo: "PERDER",
        // Vem ordenado desc e limitado a 1 pelo repository: o peso atual.
        pesos: [{ pesoKg: 64 }],
        fichasTreino: [
            {
                split: "Upper / Lower",
                diasPorSemana: 4,
                sessoes: [
                    {
                        id: "s1",
                        nome: "Upper",
                        diaSemana: "Segunda",
                        exercicios: [
                            {
                                id: "e1",
                                exercicioId: 1,
                                series: 3,
                                repeticoes: "8-12",
                                descansoSegundos: 90,
                                ultimoPesoKg: null,
                                exercicio: { nome: "Supino reto com barra", grupoMuscular: "Peito" },
                            },
                            {
                                id: "e2",
                                exercicioId: 17,
                                series: 3,
                                repeticoes: "8-12",
                                descansoSegundos: 90,
                                ultimoPesoKg: 40,
                                exercicio: { nome: "Puxada frente na polia", grupoMuscular: "Costas" },
                            },
                            {
                                id: "e3",
                                exercicioId: 20,
                                series: 3,
                                repeticoes: "8-12",
                                descansoSegundos: 90,
                                ultimoPesoKg: null,
                                // Mesmo grupo do anterior: não pode duplicar no resumo.
                                exercicio: { nome: "Remada curvada", grupoMuscular: "Costas" },
                            },
                        ],
                    },
                ],
            },
        ],
        fichasAlimentacao: [
            {
                caloriasAlvo: 1711,
                proteinaG: 140,
                carboidratoG: 181,
                gorduraG: 48,
                metaAguaMl: 2000,
                refeicoes: [
                    {
                        id: "r1",
                        nome: "Almoço",
                        horario: "12:30",
                        kcal: 599,
                        proteinaG: 49,
                        carboidratoG: 63,
                        gorduraG: 17,
                        itens: [
                            {
                                alimentoId: 3,
                                gramas: 150,
                                alimento: { nome: "Arroz, tipo 1, cozido", kcal: 128.26 },
                            },
                        ],
                    },
                ],
            },
        ],
        ...overrides,
    };
}

function montar(retorno: unknown = usuarioNoBanco()) {
    const repository = {
        buscarPlanoAtivo: jest.fn().mockResolvedValue(retorno),
    } as unknown as PlanRepository & { buscarPlanoAtivo: jest.Mock };

    return { repository, service: new PlanoConsultaService(repository) };
}

describe("PlanoConsultaService", () => {
    it("usa o registro mais recente como peso atual", async () => {
        const { service } = montar();

        const plano = await service.buscar("usuario-1");

        expect(plano.usuario.pesoAtualKg).toBe(64);
        expect(plano.usuario.nome).toBe("Ana");
    });

    it("traz nome e grupo muscular do catálogo, não da ficha", async () => {
        const { service } = montar();

        const exercicio = (await service.buscar("usuario-1")).treino.sessoes[0].exercicios[0];

        expect(exercicio.nome).toBe("Supino reto com barra");
        expect(exercicio.grupoMuscular).toBe("Peito");
        expect(exercicio.ultimoPesoKg).toBeNull();
    });

    // O resumo é o subtítulo do card: repetir "Costas" duas vezes ficaria feio.
    it("resume os grupos musculares da sessão sem repetir", async () => {
        const { service } = montar();

        expect((await service.buscar("usuario-1")).treino.sessoes[0].gruposMusculares).toBe(
            "Peito, Costas",
        );
    });

    it("calcula as kcal do item pela TACO e pelas gramas", async () => {
        const { service } = montar();

        // 128.26 kcal/100g × 150g = 192
        expect((await service.buscar("usuario-1")).dieta.refeicoes[0].itens[0].kcal).toBe(192);
    });

    it("devolve as metas da ficha de alimentação", async () => {
        const { service } = montar();

        expect((await service.buscar("usuario-1")).dieta.metas).toEqual({
            calorias: 1711,
            proteinaG: 140,
            carboidratoG: 181,
            gorduraG: 48,
            aguaMl: 2000,
        });
    });

    it.each([
        ["usuário inexistente", null],
        ["usuário sem ficha de treino ativa", usuarioNoBanco({ fichasTreino: [] })],
        ["usuário sem ficha de alimentação ativa", usuarioNoBanco({ fichasAlimentacao: [] })],
    ])("recusa %s", async (_caso, retorno) => {
        const { service } = montar(retorno);

        await expect(service.buscar("usuario-1")).rejects.toThrow(NaoEncontradoError);
    });

    it("tolera usuário sem nenhum registro de peso", async () => {
        const { service } = montar(usuarioNoBanco({ pesos: [] }));

        expect((await service.buscar("usuario-1")).usuario.pesoAtualKg).toBeNull();
    });
});
