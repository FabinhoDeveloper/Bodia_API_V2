import { Alimento } from "../data/alimentos";
import { ResultadoCalculo } from "../types/perfil.types";
import { PromptMontado } from "./prompt.types";

/** Uma refeição já com os alimentos escolhidos na chamada 1. */
export interface RefeicaoSelecionada {
    nome: string;
    alimentos: Alimento[];
}

export interface ContextoQuantidades {
    resultado: ResultadoCalculo;
    refeicoes: RefeicaoSelecionada[];
}

/**
 * CHAMADA 2 da dieta: quantas gramas de cada alimento já escolhido.
 *
 * A diferença que faz esta chamada funcionar é o TAMANHO do espaço de busca.
 * Antes, o modelo escolhia gramas entre os 284 alimentos do catálogo enquanto
 * decidia quais usar, e o resultado está registrado no comentário de
 * `iaTimeoutMs` em config/ia.ts: raciocínio estourando o teto de tokens e
 * resposta vazia depois de 328 segundos.
 *
 * Aqui ele recebe 3 a 5 alimentos por refeição, todos já definidos, e só
 * precisa dosar. É aritmética simples sobre um punhado de números.
 */
export default class DietaQuantidadesPrompt {
    montar(contexto: ContextoQuantidades): PromptMontado {
        return {
            system: this.montarSystem(),
            user: this.montarUser(contexto),
        };
    }

    private montarSystem(): string {
        return `Você define as porções de um cardápio já escolhido, no aplicativo BodIA.

## Sua única tarefa

Para cada alimento que você recebeu, dizer QUANTAS GRAMAS entram na refeição.

Os alimentos já foram escolhidos e as metas já foram calculadas por um motor determinístico validado, fora de você. Você não escolhe alimento e não recalcula meta.

REGRAS INVIOLÁVEIS:
1. Use TODOS os alimentos recebidos em cada refeição, e SOMENTE eles. Não acrescente, não remova, não troque.
2. NUNCA altere, arredonde ou "corrija" uma meta que você recebeu. Se a meta é 419 kcal, é 419 kcal.
3. Use gramas redondas e realistas de porção (20, 50, 100, 120, 150, 200...). Uma porção de arroz é 100-200 g, não 37 g.
4. Os valores nutricionais na lista são por 100 g. Um alimento com 124 kcal por 100 g em 150 g contribui com 186 kcal.

## Por que as metas são o que são

Estes limites vêm da literatura e explicam os números que você recebeu — existem para você NÃO tentar melhorá-los:

- PROTEÍNA: segue o Position Stand da International Society of Sports Nutrition — 1,4 a 2,0 g/kg para indivíduos ativos (STOKES et al., 2018), elevada para 2,3 a 3,1 g/kg de massa magra em déficit calórico, preservando massa muscular durante o emagrecimento (JÄGER et al., 2017).
- GORDURA: entre 20% e 35% das calorias totais (JÄGER et al., 2017). Abaixo de 15% há prejuízo à produção hormonal.
- CARBOIDRATO: fecha as calorias restantes e é a principal fonte de energia para exercício de moderada a alta intensidade (KERKSICK et al., 2017).
- CALORIAS: derivadas da Taxa Metabólica Basal pela equação de Mifflin-St Jeor, a de menor erro entre as preditivas (MIFFLIN et al., 1990), multiplicada pelo fator de atividade e ajustada ao objetivo.

## Precisão

Uma diferença de até 5% na meta de cada refeição é perfeitamente aceitável. NÃO procure a combinação matematicamente perfeita: faça uma escolha razoável de porções e siga em frente. Uma estimativa boa e rápida vale mais que uma busca exaustiva.

## Formato da resposta

Responda SOMENTE com um objeto json válido, sem texto antes ou depois e sem blocos de código markdown, exatamente nesta estrutura:

{
  "refeicoes": [
    {
      "nome": "Café da manhã",
      "itens": [
        { "alimentoId": 268, "nome": "Pão, francês", "gramas": 100 },
        { "alimentoId": 489, "nome": "Ovo, de galinha, inteiro, cozido", "gramas": 100 }
      ]
    }
  ]
}`;
    }

    private montarUser(contexto: ContextoQuantidades): string {
        const { resultado, refeicoes } = contexto;
        const { meta, macros } = resultado;

        const metaPorNome = new Map(resultado.dieta.refeicoes.map((r) => [r.nome, r]));

        const blocos = refeicoes.map((refeicao) => {
            const alvo = metaPorNome.get(refeicao.nome);

            const cabecalho = alvo
                ? `## ${refeicao.nome} — meta: ${alvo.kcal} kcal | proteína ${alvo.proteina} g | carboidrato ${alvo.carboidrato} g | gordura ${alvo.gordura} g`
                : `## ${refeicao.nome}`;

            const itens = refeicao.alimentos
                .map((a) => `${a.id}|${a.nome}|${a.kcal}|${a.proteina}|${a.carboidrato}|${a.gordura}`)
                .join("\n");

            return `${cabecalho}\n\n${itens}`;
        });

        return `# Metas do dia (já calculadas — use exatamente estes valores)

META CALÓRICA DIÁRIA: ${meta.caloriasAlvo} kcal
META DE PROTEÍNA: ${macros.proteina.g} g
META DE CARBOIDRATO: ${macros.carboidrato.g} g
META DE GORDURA: ${macros.gordura.g} g

# Refeições e os alimentos já escolhidos

Formato de cada alimento: id|nome|kcal|proteína|carboidrato|gordura — por 100 g.

${blocos.join("\n\n")}

Defina as gramas de cada alimento em json.`;
    }
}
