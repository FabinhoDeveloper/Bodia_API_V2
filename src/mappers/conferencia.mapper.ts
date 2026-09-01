import { DESVIO_ACEITAVEL_PERCENTUAL } from "../generators/validador-macros";
import { ConferenciaDTO, PlanoValidado, Validacao, ValidacaoVolume } from "../types/plano.types";

/**
 * Converte a saída dos dois validadores no formato que a tela de revisão exibe
 * (RF22).
 *
 * Fica em `mappers/` pela mesma razão dos outros: é tradução entre o formato
 * interno e o contrato da API. O `Validacao` interno é organizado por
 * macronutriente nomeado (`calorias`, `proteina`, ...), o que é cômodo para
 * quem calcula e ruim para quem renderiza uma lista — o app teria de saber a
 * ordem e o rótulo de cada chave.
 */
export default class ConferenciaMapper {
    /** Rótulo e unidade de cada linha, na ordem em que a tela as mostra. */
    private static readonly LINHAS: {
        chave: keyof Omit<Validacao, "dentroDoLimite">;
        nome: string;
        unidade: string;
    }[] = [
        { chave: "calorias", nome: "Calorias", unidade: "kcal" },
        { chave: "proteina", nome: "Proteína", unidade: "g" },
        { chave: "carboidrato", nome: "Carboidrato", unidade: "g" },
        { chave: "gordura", nome: "Gordura", unidade: "g" },
    ];

    montar({ validacao, validacaoVolume }: PlanoValidado): ConferenciaDTO {
        return {
            // Os DOIS precisam passar: um plano com a dieta certa e o treino com
            // metade do volume prescrito não está conferido.
            dentroDoLimite: validacao.dentroDoLimite && validacaoVolume.dentroDoLimite,
            toleranciaPercentual: DESVIO_ACEITAVEL_PERCENTUAL,
            macros: ConferenciaMapper.LINHAS.map(({ chave, nome, unidade }) => ({
                nome,
                unidade,
                meta: validacao[chave].meta,
                obtido: validacao[chave].obtido,
                desvioPercentual: validacao[chave].desvioPercentual,
            })),
            volume: {
                dentroDoLimite: validacaoVolume.dentroDoLimite,
                sessoesForaDoOrcamento: this.sessoesForaDoOrcamento(validacaoVolume),
            },
        };
    }

    /**
     * Só os NOMES das sessões fora do orçamento, e não o desvio grupo a grupo.
     *
     * O detalhe por grupo muscular interessa a quem depura a geração, e continua
     * no log do servidor; para o usuário, "o volume de Upper ficou fora do
     * previsto" é a informação inteira — a decomposição em séries de bíceps não
     * o ajuda a decidir nada.
     */
    private sessoesForaDoOrcamento(validacaoVolume: ValidacaoVolume): string[] {
        return validacaoVolume.sessoes
            .filter((sessao) => !sessao.dentroDoLimite)
            .map((sessao) => sessao.sessao);
    }
}
