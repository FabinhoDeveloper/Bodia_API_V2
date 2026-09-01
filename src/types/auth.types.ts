/** Tipos da autenticação. */

export interface LoginInput {
    email: string;
    senha: string;
}

/** Os dados do usuário que o app exibe assim que a sessão começa. */
export interface UsuarioAutenticado {
    usuarioId: string;
    nome: string;
    sobrenome: string;
    email: string;
}

/**
 * O que login e cadastro devolvem: o token e quem ele identifica.
 *
 * O token vem SEPARADO do usuário, e não misturado num objeto só, porque os
 * dois têm destinos diferentes no app — o token vai para o armazenamento e para
 * o cabeçalho de toda requisição seguinte, o usuário vai para a tela. Achatar
 * os dois convidaria a gravar o objeto inteiro onde só o token deveria estar.
 */
export interface SessaoIniciada {
    token: string;
    usuario: UsuarioAutenticado;
}
