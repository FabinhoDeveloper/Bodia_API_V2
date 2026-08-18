/**
 * Credencial inválida. O errorHandler global traduz em **401**, como já faz com
 * ValidationError → 400 e ConflitoError → 409.
 */
export default class AutenticacaoError extends Error {}
