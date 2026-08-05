import { ALIMENTOS, Alimento } from "../data/alimentos";
import { EXERCICIOS, Exercicio, Sessao } from "../data/exercicios";
import ValidationError from "../errors/ValidationError";

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
 * usuário, ANTES de o PromptService montar o prompt — chamado pelo
 * PlanoService logo no início de gerar().
 *
 * A restrição é aplicada aqui por código, removendo o item proibido da lista
 * que o modelo recebe, em vez de mandar a lista inteira e pedir para ele não
 * escolher. O LLM não pode violar uma restrição sobre um alimento que nunca viu.
 *
 * Regra de segurança: em restrição alimentar, falso positivo (remover um
 * alimento seguro) é aceitável; falso negativo (manter um proibido) não é —
 * por isso as regras erram para o lado de remover.
 */
export default class CatalogoService {
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

    filtrarExercicios(restricoes: string[], sessoes: string[]): Exercicio[] {
        const lesoes = new Set(restricoes);

        const permitidos = EXERCICIOS.filter((exercicio) => {
            const seguro = !exercicio.articulacoes.some((articulacao) => lesoes.has(articulacao));
            const serveAoSplit = exercicio.sessoes.some((sessao) => sessoes.includes(sessao));
            return seguro && serveAoSplit;
        });

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
}
