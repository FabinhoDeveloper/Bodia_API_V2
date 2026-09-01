/**
 * Roda antes de qualquer módulo ser importado (`setupFiles` no jest.config.js).
 *
 * `config/jwt.ts` lê `JWT_SECRET` no momento em que é carregado, e definir a
 * variável dentro de um `beforeAll` seria tarde demais: o import já teria
 * acontecido. É o mesmo motivo pelo qual `app.smoke.test.ts` define
 * `SIMULAR_IA` antes de exigir o app.
 *
 * O segredo aqui é fixo e só vale para os testes — o token assinado com ele não
 * abre nada em produção.
 */
process.env.JWT_SECRET = "segredo-de-teste";
