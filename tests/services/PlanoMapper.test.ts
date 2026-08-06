import { ALIMENTOS } from "../../src/data/alimentos";
import { EXERCICIOS } from "../../src/data/exercicios";
import { PLANO_SIMULADO } from "../../src/data/planoSimulado";
import CalculoService from "../../src/services/CalculoService";
import PlanoMapper from "../../src/services/PlanoMapper";
import PlanoSimuladoService from "../../src/services/PlanoSimuladoService";

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
};

describe("PlanoMapper", () => {
    const calculoService = new CalculoService();
    const mapper = new PlanoMapper();
    const resultado = calculoService.calcular(PERFIL);
    const dto = mapper.montar(PLANO_SIMULADO, resultado);

    it("usa as metas do CalculoService, não números do plano", () => {
        expect(dto.metas.calorias).toBe(resultado.meta.caloriasAlvo);
        expect(dto.metas.proteinaG).toBe(resultado.macros.proteina.g);
        expect(dto.metas.carboidratoG).toBe(resultado.macros.carboidrato.g);
        expect(dto.metas.gorduraG).toBe(resultado.macros.gordura.g);
    });

    // A tela mostra dia e horário, que não existem nem no plano nem no cálculo.
    it("acrescenta dia da semana e horário, que a tela precisa", () => {
        dto.treino.sessoes.forEach((sessao) => expect(sessao.dia).toBeTruthy());
        dto.dieta.refeicoes.forEach((refeicao) => expect(refeicao.horario).toBeTruthy());
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
});

describe("PlanoSimuladoService", () => {
    const calculoService = new CalculoService();
    const simulado = new PlanoSimuladoService();

    it("devolve o fixture sem chamar a IA", async () => {
        const resultado = calculoService.calcular(PERFIL);
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
        const resultado = calculoService.calcular(PERFIL);
        const { validacao } = await simulado.gerar(
            { restricoesAlimentares: [], restricoesFisicas: [] },
            resultado,
        );

        expect(validacao.calorias.meta).toBe(resultado.meta.caloriasAlvo);
        expect(validacao.calorias.obtido).toBeGreaterThan(0);
    });
});
