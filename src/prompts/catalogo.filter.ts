import { ALIMENTOS, Alimento } from "../data/alimentos";
import { EXERCICIOS, Exercicio, Sessao } from "../data/exercicios";
import { Dificuldade, cabeNoTeto, dificuldadeDe, proximoTeto } from "../data/dificuldade-treino";
import { DIFICULDADE_POR_NIVEL, GRUPOS_POR_SESSAO } from "../data/volume-treino";
import ValidationError from "../errors/validation.error";
import { NivelExperiencia } from "../types/perfil.types";

interface RegraRestricao {
    categorias: string[];
    palavras: string[];
}

// Itens de origem animal que escapam do filtro por categoria — a TACO tem pratos
// como "Pastel, de carne" catalogados em "Cereais e derivados".
// Alimentos vegetais cujo nome contém uma palavra de laticínio. Sem esta exceção,
// "Couve, manteiga" (uma hortaliça) sairia do cardápio de quem tem intolerância a
// lactose, e tofu e leite de coco sumiriam do cardápio vegano.
const VEGETAIS_COM_NOME_DE_LATICINIO = [/leite,? de coco/i, /soja,? queijo/i, /couve,? manteiga/i];

const PALAVRAS_CARNE = [
    "carne", "frango", "galinha", "bovin", "suín", "porco", "bacon", "presunt",
    "linguiç", "salsich", "mortadela", "salame", "toucinho", "banha", "fígado",
    "peixe", "pescada", "camarão", "atum", "sardinha", "bacalhau",
];

const REGRAS_ALIMENTARES: Record<string, RegraRestricao> = {
    Lactose: {
        categorias: ["Leite e derivados"],
        palavras: ["leite", "queijo", "manteiga", "iogurte", "requeij", "capuccino", "chocolate"],
    },
    Glúten: {
        categorias: [],
        palavras: [
            "trigo", "pão", "macarr", "aveia", "cevada", "centeio", "biscoito",
            "bolo", "farinha de rosca", "torrada", "cuscuz, paulista", "tabule",
            "yakisoba", "cerveja",
        ],
    },
    Amendoim: {
        categorias: [],
        palavras: ["amendoim", "paçoca", "pé-de-moleque"],
    },
    "Frutos do mar": {
        categorias: ["Pescados e frutos do mar"],
        palavras: ["camarão", "vatapá", "tacacá", "acarajé"],
    },
    Ovos: {
        categorias: ["Ovos e derivados"],
        palavras: ["ovo", "maionese", "bife à cavalo"],
    },
    Vegetariano: {
        categorias: ["Carnes e derivados", "Pescados e frutos do mar", "Alimentos preparados"],
        palavras: ["gelatina", ...PALAVRAS_CARNE],
    },
    Vegano: {
        categorias: [
            "Carnes e derivados", "Pescados e frutos do mar",
            "Leite e derivados", "Ovos e derivados", "Alimentos preparados",
        ],
        palavras: [
            "gelatina", "leite", "queijo", "manteiga", "iogurte", "requeij",
            "ovo", "maionese", "capuccino", ...PALAVRAS_CARNE,
        ],
    },
};

export interface CatalogosFiltrados {
    alimentos: Alimento[];
    exercicios: Exercicio[];
}

/**
 * Filtra os catálogos de alimentos e exercícios (src/data/) pela restrição do
 * usuário, ANTES de o PlanoPrompt montar o prompt — chamado pelo
 * PlanoIaGenerator logo no início de gerar().
 *
 * A restrição é aplicada aqui por código, removendo o item proibido da lista
 * que o modelo recebe, em vez de mandar a lista inteira e pedir para ele não
 * escolher. O LLM não pode violar uma restrição sobre um alimento que nunca viu.
 *
 * Regra de segurança: em restrição alimentar, falso positivo (remover um
 * alimento seguro) é aceitável; falso negativo (manter um proibido) não é —
 * por isso as regras erram para o lado de remover.
 */
export default class CatalogoFilter {
    filtrarAlimentos(restricoes: string[]): Alimento[] {
        const categoriasProibidas = new Set<string>();
        const palavrasProibidas: string[] = [];

        for (const restricao of restricoes) {
            const regra = REGRAS_ALIMENTARES[restricao];

            // Restrição em texto livre (campo "Outro" do onboarding) não tem regra
            // fixa: casa pelo próprio texto e, se não casar nada, segue apenas como
            // instrução no prompt.
            if (!regra) {
                palavrasProibidas.push(restricao.toLowerCase().trim());
                continue;
            }

            regra.categorias.forEach((categoria) => categoriasProibidas.add(categoria));
            palavrasProibidas.push(...regra.palavras);
        }

        const permitidos = ALIMENTOS.filter((alimento) => {
            if (categoriasProibidas.has(alimento.categoria)) return false;

            // Vegetal com nome de laticínio escapa da busca por palavra — mas nunca
            // da exclusão por categoria acima, que continua valendo.
            if (VEGETAIS_COM_NOME_DE_LATICINIO.some((padrao) => padrao.test(alimento.nome))) {
                return true;
            }

            const nome = alimento.nome.toLowerCase();
            return !palavrasProibidas.some((palavra) => palavra.length > 2 && nome.includes(palavra));
        });

        if (permitidos.length === 0) {
            throw new ValidationError(
                "As restrições alimentares informadas não deixam nenhum alimento disponível",
            );
        }

        return permitidos;
    }

    /**
     * O catálogo de exercícios que o modelo vai receber.
     *
     * Três cortes, todos AND: a articulação lesionada, o split do usuário e —
     * desde que `nivelExperiencia` passou a chegar até aqui — a dificuldade
     * técnica que o nível dele comporta. Ver `data/dificuldade-treino.ts` para
     * o porquê do terceiro, incluindo o que a literatura sustenta e o que não.
     *
     * `nivel` é opcional para não quebrar quem chama sem ele; ausente, nenhum
     * corte por dificuldade acontece.
     */
    filtrarExercicios(
        restricoes: string[],
        sessoes: string[],
        nivel?: NivelExperiencia,
    ): Exercicio[] {
        const lesoes = new Set(restricoes);

        const seguros = EXERCICIOS.filter((exercicio) => {
            const seguro = !exercicio.articulacoes.some((articulacao) => lesoes.has(articulacao));
            const serveAoSplit = exercicio.sessoes.some((sessao) => sessoes.includes(sessao));
            return seguro && serveAoSplit;
        });

        const permitidos = nivel
            ? this.recortarPorNivel(seguros, sessoes, DIFICULDADE_POR_NIVEL[nivel])
            : seguros;

        // Cada sessão do split precisa ter exercício sobrando, senão o modelo
        // receberia um treino impossível de montar.
        const sessaoVazia = sessoes.find(
            (sessao) => !permitidos.some((exercicio) => exercicio.sessoes.includes(sessao as Sessao)),
        );

        if (sessaoVazia) {
            throw new ValidationError(
                `As restrições físicas informadas não deixam nenhum exercício disponível para a sessão ${sessaoVazia}`,
            );
        }

        return permitidos;
    }

    /**
     * O corte por dificuldade, com uma válvula de folga por GRUPO MUSCULAR.
     *
     * O teto do nível vale para todo mundo, exceto onde ele deixaria um grupo
     * com orçamento de séries sem nenhum exercício. Aí ele sobe um degrau só
     * naquele grupo, e o relaxamento vai para o log.
     *
     * A folga existe porque o corte se SOMA às restrições físicas, e a
     * combinação é que aperta: sozinho, o teto de iniciante deixa pelo menos
     * três exercícios em todo grupo orçado (o mais apertado é posterior de coxa,
     * com mesa flexora, cadeira flexora e flexora em pé). Junto de uma lesão de
     * joelho ou lombar, pode zerar.
     *
     * É o mesmo espírito de `EngineService.orcarSessao`, que apara o orçamento
     * até caber em vez de falhar: um plano com um exercício acima do nível é
     * melhor que um 400 na cara de quem só queria treinar.
     */
    private recortarPorNivel(
        exercicios: Exercicio[],
        sessoes: string[],
        teto: Dificuldade,
    ): Exercicio[] {
        const relaxados = new Set(this.gruposSemExercicio(exercicios, sessoes, teto));

        for (const grupo of relaxados) {
            console.log(
                `[treino] "${grupo}" não tem exercício até ${teto} — ` +
                    `teto relaxado para ${proximoTeto(teto)} neste grupo`,
            );
        }

        return exercicios.filter((exercicio) => {
            const tetoDoGrupo = relaxados.has(exercicio.grupoMuscular) ? proximoTeto(teto) : teto;

            return cabeNoTeto(dificuldadeDe(exercicio), tetoDoGrupo);
        });
    }

    /**
     * Os grupos que TÊM orçamento de séries em alguma sessão do split e que
     * ficariam sem nenhum exercício sob este teto.
     *
     * Só grupos orçados entram na conta: adutores e antebraço estão no catálogo
     * mas não aparecem em `GRUPOS_POR_SESSAO`, então ficar sem exercício neles
     * não deixa buraco nenhum na prescrição.
     */
    private gruposSemExercicio(
        exercicios: Exercicio[],
        sessoes: string[],
        teto: Dificuldade,
    ): string[] {
        const orcados = new Set(
            sessoes.flatMap((sessao) => {
                const papeis = GRUPOS_POR_SESSAO[sessao];

                return papeis ? [...papeis.primario, ...papeis.secundario] : [];
            }),
        );

        return [...orcados].filter(
            (grupo) =>
                !exercicios.some(
                    (exercicio) =>
                        exercicio.grupoMuscular === grupo &&
                        cabeNoTeto(dificuldadeDe(exercicio), teto),
                ),
        );
    }
}
