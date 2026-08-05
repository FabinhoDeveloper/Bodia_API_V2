/**
 * Erro de entrada inválida. O errorHandler global (src/middlewares/errorHandler.ts)
 * reconhece esta classe e responde 400 com a mensagem do erro, em vez do 500
 * genérico usado para qualquer outra exceção.
 */
export default class ValidationError extends Error {}
