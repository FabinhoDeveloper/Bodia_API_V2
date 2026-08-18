// Único teste que exercita o app INTEIRO: app.ts, a composição de dependências
// feita nos arquivos de rota, o errorHandler e o notFoundHandler. Os demais
// testes são unitários com fakes e, por isso, não pegam erro de wiring — um
// refactor pode compilar, passar em todos eles e ainda assim quebrar as rotas.
//
// Não toca no banco: as rotas cobertas aqui, ou não usam Prisma, ou falham na
// validação antes de chegar nele.

// A flag é lida na carga de config/deepseek.ts, então precisa estar definida
// ANTES do import do app — daí o require() lá embaixo em vez de import.
process.env.SIMULAR_IA = "true";

import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require("../src/app").default;

const PERFIL_VALIDO = {
    sexo: "M",
    dataNascimento: "2001-03-10",
    peso: 80,
    altura: 180,
    percentualGordura: 18,
    nivelAtividade: "moderado",
    nivelExperiencia: "intermediario",
    objetivo: "perder",
    diasPorSemana: 4,
    numeroRefeicoes: 4,
    restricoesAlimentares: [],
    restricoesFisicas: [],
};

const CONTA_VALIDA = {
    nome: "Fulano",
    sobrenome: "de Tal",
    email: "fulano@exemplo.com",
    senha: "senha-secreta",
};

describe("app (smoke)", () => {
    it("responde na raiz", async () => {
        const resposta = await request(app).get("/");

        expect(resposta.status).toBe(200);
    });

    it("devolve 404 em rota inexistente", async () => {
        const resposta = await request(app).get("/api/rota-que-nao-existe");

        expect(resposta.status).toBe(404);
        expect(resposta.body.message).toContain("not found");
    });

    describe("POST /api/onboarding", () => {
        it("devolve 400 quando o perfil não vem", async () => {
            const resposta = await request(app)
                .post("/api/onboarding")
                .send({ conta: CONTA_VALIDA, perfil: null });

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/perfil/i);
        });

        it("devolve 400 quando o perfil é inválido", async () => {
            const resposta = await request(app)
                .post("/api/onboarding")
                .send({ conta: CONTA_VALIDA, perfil: { ...PERFIL_VALIDO, diasPorSemana: 9 } });

            expect(resposta.status).toBe(400);
        });

        it("devolve o plano completo com perfil válido", async () => {
            const resposta = await request(app)
                .post("/api/onboarding")
                .send({ conta: CONTA_VALIDA, perfil: PERFIL_VALIDO });

            expect(resposta.status).toBe(200);

            const { plano } = resposta.body;

            expect(plano.metas.calorias).toBeGreaterThan(0);
            expect(plano.metas.proteinaG).toBeGreaterThan(0);
            expect(plano.metas.aguaMl).toBeGreaterThan(0);
            expect(plano.treino.split).toBeTruthy();
            expect(plano.treino.diasPorSemana).toBe(4);
            expect(plano.treino.sessoes.length).toBeGreaterThan(0);
            expect(plano.dieta.refeicoes.length).toBeGreaterThan(0);

            // O DTO precisa chegar completo até a última folha — é o que o app
            // consome direto na tela.
            const exercicio = plano.treino.sessoes[0].exercicios[0];
            expect(exercicio.exercicioId).toEqual(expect.any(Number));
            expect(exercicio.nome).toBeTruthy();
            expect(exercicio.series).toBeGreaterThan(0);

            const item = plano.dieta.refeicoes[0].itens[0];
            expect(item.alimentoId).toEqual(expect.any(Number));
            expect(item.nome).toBeTruthy();
            expect(item.gramas).toBeGreaterThan(0);
        });
    });

    describe("POST /api/cadastro", () => {
        // Estas validações rodam ANTES de qualquer consulta ao Prisma, então o
        // teste não precisa de banco.
        it("devolve 400 sem perfil", async () => {
            const resposta = await request(app)
                .post("/api/cadastro")
                .send({ conta: CONTA_VALIDA, perfil: null, plano: null });

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/perfil/i);
        });

        it("devolve 400 sem plano", async () => {
            const resposta = await request(app)
                .post("/api/cadastro")
                .send({ conta: CONTA_VALIDA, perfil: PERFIL_VALIDO, plano: null });

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/plano/i);
        });
    });
});
