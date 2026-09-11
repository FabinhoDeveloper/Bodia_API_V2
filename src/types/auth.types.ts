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

/**
 * Corpo de `POST /senha/redefinir` — vem da página aberta pelo link do e-mail.
 *
 * A confirmação viaja até o servidor, e não é conferida só na página, pela
 * mesma razão do aceite dos termos: a tela pode ser contornada, a rota não.
 */
export interface RedefinicaoSenhaInput {
    token: string;
    novaSenha: string;
    confirmacao: string;
}

/** Corpo de `PATCH /senha` — troca feita por quem já está logado. */
export interface AlteracaoSenhaInput {
    senhaAtual: string;
    novaSenha: string;
    confirmacao: string;
}
