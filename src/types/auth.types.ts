/** Tipos da autenticação. */

export interface LoginInput {
    email: string;
    senha: string;
}

/**
 * O que o login devolve ao app. Enquanto não há JWT, o app guarda o
 * `usuarioId` e o usa para pedir o próprio plano.
 */
export interface UsuarioAutenticado {
    usuarioId: string;
    nome: string;
    sobrenome: string;
    email: string;
}
