import { ALIMENTOS } from "../../src/data/alimentos";
import { EXERCICIOS } from "../../src/data/exercicios";
import { descansoPara } from "../../src/data/descanso-treino";
import { PLANO_SIMULADO } from "../../src/data/plano-simulado";
import EngineService from "../../src/services/engine.service";
import PlanoMapper from "../../src/mappers/plano.mapper";
import PlanoSimuladoGenerator from "../../src/generators/plano-simulado.generator";
import ValidadorMacros from "../../src/generators/validador-macros";
import ValidadorVolume from "../../src/generators/validador-volume";

const PERFIL = {
    sexo: "F" as const,
    dataNascimento: "1998-04-10",
    peso: 65,
    altura: 165,
    percentualGordura: 20,
    nivelAtividade: "moderado" as const,
    nivelExperiencia: "iniciante" as const,
    objetivo: "perder" as const,
    diasPorSemana: 4,
    numeroRefeicoes: 4,
};

const perfil = (overrides: Partial<typeof PERFIL> = {}) => ({ ...PERFIL, ...overrides });

describe("PlanoMapper", () => {
    const engineService = new EngineService();
    const mapper = new PlanoMapper();

    /**
     * Monta o DTO usando as SESSÕES DO MOTOR como se a IA as tivesse devolvido.
     * O fixture tem sempre 2 sessões, então não serviria para testar splits de
     * 3, 5 ou 6 dias — que é justamente onde a repartição dos dias importa.
     */
    const montarDto = (resultado: ReturnType<EngineService["calcular"]>) =>
        mapper.montar(
            {
                ...PLANO_SIMULADO,
                treino: {
                    sessoes: resultado.treino.sessoes.map((s) => ({ nome: s.nome, exercicios: [] })),
                },
            },
            resultado,
        );
    const resultado = engineService.calcular(PERFIL);
    const dto = mapper.montar(PLANO_SIMULADO, resultado);

    it("usa as metas do EngineService, não números do plano", () => {
        expect(dto.metas.calorias).toBe(resultado.meta.caloriasAlvo);
        expect(dto.metas.proteinaG).toBe(resultado.macros.proteina.g);
        expect(dto.metas.carboidratoG).toBe(resultado.macros.carboidrato.g);
        expect(dto.metas.gorduraG).toBe(resultado.macros.gordura.g);
    });

    // A tela mostra dia e horário, que não existem nem no plano nem no cálculo.
    it("acrescenta dia da semana e horário, que a tela precisa", () => {
        dto.treino.sessoes.forEach((sessao) => expect(sessao.diasSemana.length).toBeGreaterThan(0));
        dto.dieta.refeicoes.forEach((refeicao) => expect(refeicao.horario).toBeTruthy());
    });

    // Antes o mapper gravava META_AGUA_ML = 2000 para todo usuário.
    it("usa a meta de água do EngineService, não uma constante", () => {
        expect(dto.metas.aguaMl).toBe(resultado.dieta.metaAguaMl);

        const outro = engineService.calcular(perfil({ peso: 100 }));
        const outroDto = mapper.montar(PLANO_SIMULADO, outro);

        expect(outroDto.metas.aguaMl).not.toBe(dto.metas.aguaMl);
    });

    // Antes o mapper gravava descansoSegundos: 60 para todo exercício, incluindo
    // o cronômetro entre séries que o app usa durante o treino.
    it("prescreve descansos diferentes conforme o tipo do exercício", () => {
        const exercicios = dto.treino.sessoes.flatMap((s) => s.exercicios);
        const valores = new Set(exercicios.map((e) => e.descansoSegundos));

        expect(valores.size).toBeGreaterThan(1);

        for (const exercicio of exercicios) {
            const noCatalogo = EXERCICIOS.find((e) => e.id === exercicio.exercicioId)!;
            expect(exercicio.descansoSegundos).toBe(descansoPara(noCatalogo));
        }
    });

    it("busca grupo muscular no catálogo em vez de confiar no plano", () => {
        const exercicio = dto.treino.sessoes[0].exercicios[0];
        const noCatalogo = EXERCICIOS.find((e) => e.id === exercicio.exercicioId)!;

        expect(exercicio.grupoMuscular).toBe(noCatalogo.grupoMuscular);
        expect(dto.treino.sessoes[0].gruposMusculares).toContain(noCatalogo.grupoMuscular);
    });

    it("calcula as kcal de cada item pela TACO e soma na refeição", () => {
        const refeicao = dto.dieta.refeicoes[0];
        const item = refeicao.itens[0];
        const alimento = ALIMENTOS.find((a) => a.id === item.alimentoId)!;

        expect(item.kcal).toBe(Math.round((alimento.kcal * item.gramas) / 100));
        expect(refeicao.kcal).toBe(refeicao.itens.reduce((total, i) => total + i.kcal, 0));
    });

    it("não repete grupo muscular no resumo da sessão", () => {
        dto.treino.sessoes.forEach((sessao) => {
            const grupos = sessao.gruposMusculares.split(", ");
            expect(new Set(grupos).size).toBe(grupos.length);
        });
    });

    /**
     * A regressão: `dia: dias[indice]` dava um dia por sessão. Com 4 dias em
     * Upper/Lower (2 sessões, 2x cada), só Segunda e Terça eram usados —
     * Quinta e Sexta sumiam, e quem pedia 4 dias de treino via 2 na tela.
     */
    describe("distribuição dos dias da semana", () => {
        it.each([2, 3, 4, 5, 6])("usa todos os %i dias pedidos, sem descartar nenhum", (dias) => {
            const resultado = new EngineService().calcular(perfil({ diasPorSemana: dias }));
            const dto = montarDto(resultado);

            const usados = dto.treino.sessoes.flatMap((s) => s.diasSemana);

            expect(usados).toHaveLength(dias);
            expect(new Set(usados).size).toBe(dias);
        });

        it("respeita a frequência semanal de cada sessão", () => {
            const resultado = new EngineService().calcular(perfil({ diasPorSemana: 4 }));
            const dto = montarDto(resultado);

            for (const sessao of dto.treino.sessoes) {
                const prescrita = resultado.treino.sessoes.find((s) => s.nome === sessao.nome)!;
                expect(sessao.diasSemana).toHaveLength(prescrita.frequenciaSemanal);
            }
        });

        it("espaça as repetições em vez de agrupá-las em dias seguidos", () => {
            const resultado = new EngineService().calcular(perfil({ diasPorSemana: 4 }));
            const dto = montarDto(resultado);
            const upper = dto.treino.sessoes.find((s) => s.nome === "Upper")!;

            // Segunda + Quinta, e não Segunda + Terça.
            expect(upper.diasSemana).toEqual(["Segunda", "Quinta"]);
        });
});

describe("PlanoSimuladoGenerator", () => {
    const engineService = new EngineService();
    const simulado = new PlanoSimuladoGenerator(new ValidadorMacros(), new ValidadorVolume());

    it("devolve o fixture sem chamar a IA", async () => {
        const resultado = engineService.calcular(PERFIL);
        const { plano } = await simulado.gerar(
            { restricoesAlimentares: [], restricoesFisicas: [] },
            resultado,
        );

        expect(plano).toBe(PLANO_SIMULADO);
    });

    // Ids inventados quebrariam a chave estrangeira quando a persistência entrar.
    it("só cita ids que existem nos catálogos", () => {
        const idsAlimentos = new Set(ALIMENTOS.map((a) => a.id));
        const idsExercicios = new Set(EXERCICIOS.map((e) => e.id));

        for (const refeicao of PLANO_SIMULADO.dieta.refeicoes) {
            for (const item of refeicao.itens) {
                expect(idsAlimentos.has(item.alimentoId)).toBe(true);
            }
        }

        for (const sessao of PLANO_SIMULADO.treino.sessoes) {
            for (const exercicio of sessao.exercicios) {
                expect(idsExercicios.has(exercicio.exercicioId)).toBe(true);
            }
        }
    });

    it("confere os macros de verdade contra a meta do perfil", async () => {
        const resultado = engineService.calcular(PERFIL);
        const { validacao } = await simulado.gerar(
            { restricoesAlimentares: [], restricoesFisicas: [] },
            resultado,
        );

        expect(validacao.calorias.meta).toBe(resultado.meta.caloriasAlvo);
        expect(validacao.calorias.obtido).toBeGreaterThan(0);
    });

    });
});
