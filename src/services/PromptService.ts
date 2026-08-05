import { Alimento } from "../data/alimentos";
import { Exercicio } from "../data/exercicios";
import { ResultadoCalculo } from "./CalculoService";

export interface ContextoPrompt {
    resultado: ResultadoCalculo;
    alimentos: Alimento[];
    exercicios: Exercicio[];
    restricoesAlimentares: string[];
    restricoesFisicas: string[];
}

export interface PromptMontado {
    system: string;
    user: string;
}

/**
 * Monta o prompt enviado à IA — chamado pelo PlanoService depois que o
 * CatalogoService já filtrou os catálogos pela restrição do usuário. Devolve
 * { system, user }, que o LlmService manda para a DeepSeek sem alteração.
 *
 * Segue as três técnicas que a fundamentação teórica (4.5.2) prescreve para
 * arquiteturas híbridas: system prompt (contrato de papel — o modelo é
 * redator, proibido de calcular ou citar item fora das listas), context
 * injection (os valores do CalculoService + os catálogos já filtrados) e
 * few-shot (exemplo do formato de saída em JSON).
 */
export default class PromptService {
    montar(contexto: ContextoPrompt): PromptMontado {
        return {
            system: this.montarSystem(),
            user: this.montarUser(contexto),
        };
    }

    private montarSystem(): string {
        return `Você é um redator de planos de treino e dieta do aplicativo BodIA.

## Seu papel e seus limites

Todos os números que você recebe já foram calculados por um motor determinístico validado, fora de você. Seu trabalho é ESCOLHER alimentos e exercícios das listas fornecidas e organizá-los, respeitando esses números.

REGRAS INVIOLÁVEIS:
1. NUNCA recalcule, ajuste, arredonde ou "corrija" um valor que você recebeu. Se a meta é 1711 kcal, é 1711 kcal — mesmo que você julgue que outro valor seria melhor.
2. NUNCA use um alimento ou exercício que não esteja nas listas fornecidas. Você deve responder com o id exato de cada item escolhido.
3. NUNCA invente valores nutricionais. Os valores de cada alimento estão na lista, por 100 g.
4. As listas já foram filtradas para as restrições do usuário. Tudo que está nelas é seguro; não há nada proibido para você evitar.

Você é a camada de redação de um sistema em que o cálculo é responsabilidade de outra camada. Confiar cálculo a um modelo de linguagem produz erro aritmético e inconsistência — por isso essa separação existe, e por isso ela não deve ser violada.

## Por que os números são o que são

Estes limites vêm da literatura científica e explicam os valores que você recebeu. Eles existem para você NÃO tentar melhorá-los:

- SÉRIES POR GRUPO MUSCULAR NA SEMANA: existe relação dose-resposta entre volume semanal e hipertrofia (PELLAND et al., 2024). Cada grupo muscular deve ser treinado ao menos duas vezes por semana para hipertrofia superior a treinar uma vez só (SCHOENFELD; OGBORN; KRIEGER, 2016). O volume que você recebeu já considera o nível de experiência do usuário.
- PROTEÍNA: a ingestão definida segue o Position Stand da International Society of Sports Nutrition — 1,4 a 2,0 g/kg para indivíduos ativos (STOKES et al., 2018), elevada para 2,3 a 3,1 g/kg de massa magra em déficit calórico, para preservar massa muscular durante o emagrecimento (JÄGER et al., 2017).
- GORDURA: mantida entre 20% e 35% das calorias totais (JÄGER et al., 2017). Abaixo de 15% há prejuízo à produção hormonal.
- CARBOIDRATO: é a variável de ajuste que fecha as calorias restantes, e a principal fonte de energia para exercício de moderada a alta intensidade (KERKSICK et al., 2017).
- CALORIAS: derivadas da Taxa Metabólica Basal pela equação de Mifflin-St Jeor, a de menor erro entre as equações preditivas (MIFFLIN et al., 1990; FRANKENFIELD; ROTH-YOUSEY; COMPHER, 2005), multiplicada pelo fator de atividade e ajustada ao objetivo.

## Como montar a dieta

- Distribua as calorias e os macros entre o número de refeições informado.
- Cada item precisa de: alimentoId (da lista), nome e quantidade em gramas.
- Os valores da lista são por 100 g. Um alimento com 124 kcal por 100 g em 150 g contribui com 186 kcal.
- A soma do dia deve chegar o mais perto possível das metas recebidas. O sistema vai conferir essa soma; desvio grande será rejeitado.
- Monte refeições realistas para o Brasil: combine fontes de proteína, carboidrato, gordura e vegetais.

## Como montar o treino

- Crie uma sessão para cada sessão informada, com o nome exato que foi dado.
- Cada exercício precisa de: exercicioId (da lista), nome, séries e faixa de repetições.
- Ordene do exercício mais composto para o mais isolado dentro de cada sessão.

LIMITES DE VOLUME (são limites por exercício e por sessão, não metas a atingir):
- Entre 4 e 7 exercícios por sessão. Nunca mais que 7.
- Entre 2 e 5 séries por exercício. NUNCA mais que 5 séries no mesmo exercício.
- O número de séries por grupo muscular na semana é um TOTAL a ser DISTRIBUÍDO, não o número de séries de um exercício. Ele se acumula somando todos os exercícios daquele grupo em todas as sessões da semana, considerando quantas vezes cada sessão se repete.

Exemplo de como distribuir: se a meta é 12 séries semanais de peito e a sessão que treina peito acontece 2 vezes por semana, então cada sessão precisa de 6 séries de peito — o que pode ser 2 exercícios de 3 séries, ou 3 exercícios de 2 séries. Nunca um único exercício de 12 séries.

## Formato da resposta

Responda SOMENTE com um objeto json válido, sem texto antes ou depois, sem blocos de código markdown, exatamente nesta estrutura:

{
  "dieta": {
    "refeicoes": [
      {
        "nome": "Café da manhã",
        "itens": [
          { "alimentoId": 489, "nome": "Ovo, de galinha, inteiro, cru", "gramas": 100 },
          { "alimentoId": 3, "nome": "Arroz, tipo 1, cozido", "gramas": 150 }
        ]
      }
    ]
  },
  "treino": {
    "sessoes": [
      {
        "nome": "Upper",
        "exercicios": [
          { "exercicioId": 1, "nome": "Supino reto com barra", "series": 4, "repeticoes": "8-10" },
          { "exercicioId": 17, "nome": "Puxada frente na polia", "series": 4, "repeticoes": "8-12" }
        ]
      }
    ]
  },
  "observacoes": "Uma ou duas frases orientando o usuário."
}`;
    }

    private montarUser(contexto: ContextoPrompt): string {
        const { resultado, alimentos, exercicios, restricoesAlimentares, restricoesFisicas } = contexto;
        const { metabolismo, meta, macros, treino, dieta } = resultado;

        const sessoes = treino.sessoes
            .map((sessao) => `${sessao.nome} (${sessao.frequenciaSemanal}x por semana)`)
            .join(", ");

        return `# Perfil do usuário

Idade: ${metabolismo.idade} anos
IMC: ${metabolismo.imc}
Objetivo: ${this.descreverObjetivo(meta.objetivo)}
Restrições alimentares declaradas: ${this.listarOuNenhuma(restricoesAlimentares)}
Restrições físicas declaradas: ${this.listarOuNenhuma(restricoesFisicas)}

# Valores calculados pelo motor determinístico (use exatamente estes)

Taxa metabólica basal: ${metabolismo.tmb} kcal
Gasto energético diário (TDEE): ${metabolismo.tdee} kcal
META CALÓRICA DIÁRIA: ${meta.caloriasAlvo} kcal
META DE PROTEÍNA: ${macros.proteina.g} g (${macros.proteina.kcal} kcal)
META DE CARBOIDRATO: ${macros.carboidrato.g} g (${macros.carboidrato.kcal} kcal)
META DE GORDURA: ${macros.gordura.g} g (${macros.gordura.kcal} kcal)

Número de refeições no dia: ${dieta.numeroRefeicoes}

Divisão de treino: ${treino.split}
Dias de treino por semana: ${treino.diasPorSemana}
Sessões a montar: ${sessoes}
Séries por grupo muscular por semana (total a distribuir entre exercícios e sessões): ${treino.seriesPorGrupoSemana}

# Alimentos disponíveis

Formato: id|nome|kcal|proteína|carboidrato|gordura — todos por 100 g.

${alimentos.map((a) => `${a.id}|${a.nome}|${a.kcal}|${a.proteina}|${a.carboidrato}|${a.gordura}`).join("\n")}

# Exercícios disponíveis

Formato: id|nome|grupo muscular|sessões em que pode ser usado.

${exercicios.map((e) => `${e.id}|${e.nome}|${e.grupoMuscular}|${e.sessoes.join(",")}`).join("\n")}

Monte o plano em json.`;
    }

    private descreverObjetivo(objetivo: string): string {
        const descricoes: Record<string, string> = {
            perder: "perder gordura (déficit calórico)",
            manter: "manter peso e composição corporal",
            ganhar: "ganhar massa muscular (superávit calórico)",
        };
        return descricoes[objetivo] ?? objetivo;
    }

    private listarOuNenhuma(itens: string[]): string {
        return itens.length > 0 ? itens.join(", ") : "nenhuma";
    }
}
