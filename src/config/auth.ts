/**
 * Custo do bcrypt. 10 é o padrão da biblioteca e o equilíbrio usual entre
 * resistência a força bruta e tempo de resposta do cadastro.
 */
export const bcryptRounds = 10;

/**
 * Comprimento mínimo da senha — no cadastro, na redefinição por e-mail e na
 * troca dentro da conta.
 *
 * Mora aqui, e não num dos services, porque são três lugares que precisam do
 * MESMO número (quatro, contando a página de redefinição, que o mostra ao
 * usuário). Duas cópias deixariam a página aceitar uma senha que a API recusa.
 *
 * Por comprimento, não por composição obrigatória: ver `UserService.validarConta`.
 */
export const SENHA_MIN = 8;

/**
 * Por quanto tempo o link de redefinição vale. Curto o bastante para um e-mail
 * esquecido na caixa de entrada não servir dias depois; longo o bastante para o
 * SES entregar e a pessoa abrir com calma.
 */
export const REDEFINICAO_VALIDADE_MIN = 30;

/**
 * Intervalo mínimo entre dois e-mails de redefinição para a MESMA conta.
 *
 * O limite por IP (`limiteRecuperacaoSenha`) não cobre isto: de vários IPs, dá
 * para encher a caixa de entrada de alguém com e-mails que ela não pediu.
 */
export const REDEFINICAO_INTERVALO_MIN_SEG = 60;
