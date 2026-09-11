import { PrismaClient } from "@prisma/client";

/**
 * Os links de redefinição de senha (RF03) — `TokenRedefinicaoSenha`.
 *
 * Só recebe e grava o HASH do token. O token em texto nasce e morre no
 * AuthService e no e-mail; se aparecesse aqui, um log de query o vazaria.
 */
export default class RedefinicaoSenhaRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }

    /** Quando o usuário pediu o último link, ou `null` se não há nenhum pendente. */
    async ultimaSolicitacaoEm(usuarioId: string): Promise<Date | null> {
        const ultimo = await this.prismaClient.tokenRedefinicaoSenha.findFirst({
            where: { usuarioId },
            orderBy: { criadoEm: "desc" },
            select: { criadoEm: true },
        });

        return ultimo?.criadoEm ?? null;
    }

    /**
     * Grava o link novo e APAGA os anteriores do mesmo usuário, na mesma
     * transação: só o e-mail mais recente abre alguma coisa. Sem isso, quem
     * pedisse três vezes teria três links válidos esquecidos na caixa de entrada.
     */
    async substituir(usuarioId: string, tokenHash: string, expiraEm: Date): Promise<void> {
        await this.prismaClient.$transaction([
            this.prismaClient.tokenRedefinicaoSenha.deleteMany({ where: { usuarioId } }),
            this.prismaClient.tokenRedefinicaoSenha.create({
                data: { usuarioId, tokenHash, expiraEm },
            }),
        ]);
    }

    /**
     * Consome o link e grava a senha nova — as duas coisas ou nenhuma.
     *
     * Devolve `false` se o link não existe, já foi usado ou expirou; o service
     * não precisa (nem deve) dizer qual dos três.
     *
     * O uso único é garantido pelo `deleteMany` com `count === 1`, e não pela
     * leitura: dois cliques simultâneos leem a mesma linha, mas o Postgres só
     * deixa um dos DELETEs apagá-la — o segundo espera o primeiro terminar e
     * encontra zero linhas.
     *
     * `senhaAlteradaEm` sai junto e é o que derruba as sessões abertas com a
     * senha antiga (ver middlewares/autenticacao.ts).
     */
    async consumirERedefinir(tokenHash: string, senhaHash: string, agora: Date): Promise<boolean> {
        return this.prismaClient.$transaction(async (tx) => {
            const valido = { tokenHash, expiraEm: { gt: agora } };

            const token = await tx.tokenRedefinicaoSenha.findFirst({
                where: valido,
                select: { usuarioId: true },
            });

            if (!token) return false;

            const { count } = await tx.tokenRedefinicaoSenha.deleteMany({ where: valido });

            if (count !== 1) return false;

            await tx.usuario.update({
                where: { id: token.usuarioId },
                data: { senhaHash, senhaAlteradaEm: agora },
            });

            // Um link pedido antes, se ainda houver, não pode redefinir de novo
            // a senha que acabou de ser escolhida.
            await tx.tokenRedefinicaoSenha.deleteMany({ where: { usuarioId: token.usuarioId } });

            return true;
        });
    }
}
