// Único teste que exercita o app INTEIRO: app.ts, a composição de dependências
// feita nos arquivos de rota, o errorHandler e o notFoundHandler. Os demais
// testes são unitários com fakes e, por isso, não pegam erro de wiring — um
// refactor pode compilar, passar em todos eles e ainda assim quebrar as rotas.
//
// Não toca no banco: as rotas cobertas aqui, ou não usam Prisma, ou falham na
// validação antes de chegar nele.

// A flag é lida na carga de config/ia.ts, então precisa estar definida
// ANTES do import do app — daí o require() lá embaixo em vez de import.
process.env.SIMULAR_IA = "true";

import request from "supertest";

import { assinarToken } from "../src/config/jwt";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require("../src/app").default;

// Token válido de um usuário que não existe no banco. Serve para atravessar o
// middleware e chegar às validações de payload, que rodam antes do Prisma —
// é o que mantém este teste sem banco mesmo com as rotas autenticadas.
const TOKEN = `Bearer ${assinarToken("usuario-de-teste")}`;

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
    aceiteTermos: true,
};

/**
 * Percorre o router do Express e devolve todas as rotas efetivamente
 * registradas, como "POST /api/login". É o teste que pega a rota que sumiu
 * num refactor: as rotas que dependem de banco não podem ser chamadas de
 * verdade aqui, mas a AUSÊNCIA delas continua sendo detectável.
 */
function rotasRegistradas(): string[] {
    const encontradas: string[] = [];

    const percorrer = (camada: any, prefixo: string) => {
        if (camada.route) {
            const metodos = Object.keys(camada.route.methods).map((m) => m.toUpperCase());
            for (const metodo of metodos) {
                encontradas.push(`${metodo} ${prefixo}${camada.route.path}`);
            }
            return;
        }
        if (camada.name === "router" && camada.handle?.stack) {
            const novoPrefixo = camada.regexp?.source.includes("api") ? "/api" : prefixo;
            for (const filha of camada.handle.stack) percorrer(filha, novoPrefixo);
        }
    };

    for (const camada of app._router.stack) percorrer(camada, "");

    return encontradas;
}

describe("app (smoke)", () => {
    // Contrato consumido pelo app mobile — nenhuma reorganização interna pode
    // mudar estas cinco linhas.
    it("registra exatamente as rotas que o app consome", () => {
        const rotas = rotasRegistradas();

        expect(rotas).toEqual(
            expect.arrayContaining([
                "POST /api/onboarding",
                "POST /api/cadastro",
                "POST /api/login",
                "GET /api/plano",
                "GET /api/teste-geracao",
                "POST /api/hidratacao",
                "GET /api/hidratacao",
                "DELETE /api/hidratacao/:registroId",
                "POST /api/refeicao",
                "GET /api/refeicao",
                "DELETE /api/refeicao/:refeicaoId",
                "POST /api/treino",
                "POST /api/treino/:registroTreinoId/concluir",
                "GET /api/treino",
                "DELETE /api/conta",
                "GET /api/perfil",
                "PATCH /api/perfil",
                "POST /api/peso",
                "GET /api/peso",
            ]),
        );
    });

    // A rota protegida que perde o middleware num refactor continua respondendo
    // 200 nos testes unitários — só aqui, sem token, o buraco aparece.
    describe("rotas protegidas", () => {
        it.each([
            ["get", "/api/plano"],
            ["post", "/api/hidratacao"],
            ["get", "/api/hidratacao"],
            ["delete", "/api/hidratacao/registro-1"],
            ["post", "/api/refeicao"],
            ["get", "/api/refeicao"],
            ["delete", "/api/refeicao/refeicao-1"],
            ["post", "/api/treino"],
            ["post", "/api/treino/treino-1/concluir"],
            ["get", "/api/treino"],
            ["post", "/api/peso"],
            ["get", "/api/peso"],
            ["delete", "/api/conta"],
            ["get", "/api/perfil"],
            ["patch", "/api/perfil"],
        ])("devolve 401 em %s %s sem token", async (metodo, rota) => {
            const resposta = await (request(app) as any)[metodo](rota);

            expect(resposta.status).toBe(401);
        });

        it("devolve 401 com token assinado por outro segredo", async () => {
            // Três segmentos base64 com assinatura inventada: a forma é a de um
            // JWT, a assinatura não fecha.
            const falso = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxdWFscXVlciJ9.assinatura-inventada";

            const resposta = await request(app)
                .get("/api/plano")
                .set("Authorization", `Bearer ${falso}`);

            expect(resposta.status).toBe(401);
        });

        it("devolve 401 quando o esquema não é Bearer", async () => {
            const resposta = await request(app)
                .get("/api/plano")
                .set("Authorization", "Basic dXNlcjpzZW5oYQ==");

            expect(resposta.status).toBe(401);
        });
    });

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

        // RF36: o aceite é conferido na ROTA, não só na tela — a tela pode ser
        // contornada por quem chamar a API direto.
        it("devolve 400 sem o aceite do aviso legal", async () => {
            const resposta = await request(app)
                .post("/api/cadastro")
                .send({
                    conta: { ...CONTA_VALIDA, aceiteTermos: false },
                    perfil: PERFIL_VALIDO,
                    plano: { treino: { sessoes: [{}] }, dieta: { refeicoes: [{}] } },
                });

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/aceitar/i);
        });

    });

    describe("hidratação", () => {
        // A validação do volume e a do formato do dia rodam ANTES de qualquer
        // consulta ao Prisma, então estes casos não precisam de banco.
        it.each([-5, 0, 250.5, 99999])(
            "devolve 400 ao registrar volumeMl %p",
            async (volumeMl) => {
                const resposta = await request(app)
                    .post("/api/hidratacao")
                    .set("Authorization", TOKEN)
                    .send({ volumeMl });

                expect(resposta.status).toBe(400);
                expect(resposta.body.message).toMatch(/volumeMl/i);
            },
        );

        it("devolve 400 quando o dia da query não é AAAA-MM-DD", async () => {
            const resposta = await request(app)
                .get("/api/hidratacao?dia=19/08/2026")
                .set("Authorization", TOKEN);

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/dia/i);
        });
    });

    describe("peso", () => {
        // A faixa é conferida antes de qualquer consulta ao Prisma: um peso
        // errado propaga para TMB, meta calórica, macros e hidratação de uma vez.
        it.each([0, -70, 7, 800, "70"])("devolve 400 ao registrar pesoKg %p", async (pesoKg) => {
            const resposta = await request(app)
                .post("/api/peso")
                .set("Authorization", TOKEN)
                .send({ pesoKg });

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/pesoKg/i);
        });
    });

    describe("treino", () => {
        // Também rodam antes do Prisma: o sessaoTreinoId ausente é recusado na
        // primeira linha do service, e o período malformado no controller.
        it("devolve 400 ao abrir sem sessaoTreinoId", async () => {
            const resposta = await request(app)
                .post("/api/treino")
                .set("Authorization", TOKEN)
                .send({});

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/sessaoTreinoId/i);
        });

        it("devolve 400 quando só um lado do período vem", async () => {
            const resposta = await request(app)
                .get("/api/treino?de=2026-08-01")
                .set("Authorization", TOKEN);

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/juntos/i);
        });

        it("devolve 400 quando o período não é AAAA-MM-DD", async () => {
            const resposta = await request(app)
                .get("/api/treino?de=01/08/2026&ate=07/08/2026")
                .set("Authorization", TOKEN);

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/AAAA-MM-DD/);
        });

        it("devolve 400 quando ate é anterior a de", async () => {
            const resposta = await request(app)
                .get("/api/treino?de=2026-08-10&ate=2026-08-01")
                .set("Authorization", TOKEN);

            expect(resposta.status).toBe(400);
        });
    });

    describe("refeição", () => {
        // Também rodam antes do Prisma: o refeicaoId ausente é recusado na
        // primeira linha do service, e o dia malformado no controller.
        it("devolve 400 ao marcar sem refeicaoId", async () => {
            const resposta = await request(app)
                .post("/api/refeicao")
                .set("Authorization", TOKEN)
                .send({});

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/refeicaoId/i);
        });

        it("devolve 400 quando o dia da query não é AAAA-MM-DD", async () => {
            const resposta = await request(app)
                .get("/api/refeicao?dia=ontem")
                .set("Authorization", TOKEN);

            expect(resposta.status).toBe(400);
            expect(resposta.body.message).toMatch(/dia/i);
        });
    });
});
