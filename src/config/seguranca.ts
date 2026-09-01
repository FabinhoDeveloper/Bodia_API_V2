import rateLimit from "express-rate-limit";

/**
 * Limites de requisição por IP (RNF11).
 *
 * São dois, e não um, porque as ameaças são diferentes. O limite geral existe
 * contra abuso e engano de cliente; o do login existe contra FORÇA BRUTA de
 * senha, e por isso é muito mais estreito — sem ele, a única defesa contra
 * tentar milhares de senhas seria o custo do bcrypt.
 *
 * Fica em config/ porque os números são parâmetro de ambiente, não regra de
 * domínio: numa demonstração com muita gente na mesma rede eles precisam subir.
 *
 * ⚠️ O limite é por IP, e a API roda atrás do nginx na EC2. Sem
 * `app.set("trust proxy", ...)` todos os usuários chegariam com o IP do proxy e
 * dividiriam a mesma cota — ver o comentário em app.ts.
 */

const MINUTO = 60 * 1000;

export const limiteGeral = rateLimit({
    windowMs: 15 * MINUTO,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Muitas requisições. Tente de novo em alguns minutos." },
});

/**
 * Vale para login E cadastro: os dois criam sessão, e deixar o cadastro de fora
 * daria ao atacante um oráculo de e-mails já registrados (o 409) sem limite
 * nenhum.
 */
export const limiteAutenticacao = rateLimit({
    windowMs: 15 * MINUTO,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Tentativa que dá certo não conta: quem acerta a senha de primeira não
    // deve gastar cota, só quem erra.
    skipSuccessfulRequests: true,
    message: { message: "Muitas tentativas. Tente de novo em alguns minutos." },
});
