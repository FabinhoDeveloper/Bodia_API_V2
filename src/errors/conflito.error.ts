/**
 * Recurso que já existe e não pode ser duplicado — hoje, e-mail já cadastrado.
 * O errorHandler global traduz em **409**, como faz com ValidationError → 400.
 */
export default class ConflitoError extends Error {}
