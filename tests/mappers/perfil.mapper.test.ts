import PerfilMapper from "../../src/mappers/perfil.mapper";
import { NivelAtividade, NivelExperiencia, Objetivo } from "../../src/types/perfil.types";

const mapper = new PerfilMapper();

// Estes valores são os literais que o EngineService aceita (src/types/perfil.types.ts)
// e que o app manda no payload. Se um deles deixar de ter tradução, o cadastro
// grava null na coluna e o Prisma quebra só na hora do INSERT — este teste
// antecipa isso.
describe("PerfilMapper", () => {
    const ATIVIDADES: NivelAtividade[] = [
        "sedentario",
        "leve",
        "moderado",
        "intenso",
        "atleta",
    ];
    const EXPERIENCIAS: NivelExperiencia[] = ["iniciante", "intermediario", "avancado"];
    const OBJETIVOS: Objetivo[] = ["perder", "manter", "ganhar"];

    it.each(ATIVIDADES)("traduz o nível de atividade %s", (valor) => {
        expect(mapper.nivelAtividade(valor)).toBe(valor.toUpperCase());
    });

    it.each(EXPERIENCIAS)("traduz o nível de experiência %s", (valor) => {
        expect(mapper.nivelExperiencia(valor)).toBe(valor.toUpperCase());
    });

    it.each(OBJETIVOS)("traduz o objetivo %s", (valor) => {
        expect(mapper.objetivo(valor)).toBe(valor.toUpperCase());
    });
});
