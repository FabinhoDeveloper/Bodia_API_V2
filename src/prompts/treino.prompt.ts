import { Exercicio } from "../data/exercicios";
import { ResultadoCalculo } from "../types/perfil.types";
import { PromptMontado } from "./prompt.types";

export interface ContextoTreino {
    resultado: ResultadoCalculo;
    exercicios: Exercicio[];
    restricoesFisicas: string[];
}

/**
 * CHAMADA 3: montar o treino. Independente da dieta — o PlanoIaGenerator roda
 * as duas em paralelo.
 *
 * Separá-la da dieta não foi só organização: antes, o mesmo prompt carregava os
 * 591 alimentos da TACO junto com os exercícios, e o modelo alternava entre
 * dosar gramas e distribuir séries na mesma resposta. Aqui o contexto tem só o
 * que diz respeito a treino.
 */
export default class TreinoPrompt {
    montar(contexto: ContextoTreino): PromptMontado {
        return {
            system: this.montarSystem(),
            user: this.montarUser(contexto),
        };
    }

    private montarSystem(): string {
        return `Você monta treinos de musculação no aplicativo BodIA.

## Seu papel e seus limites

O volume, a divisão e a frequência já foram calculados por um motor determinístico validado, fora de você. Seu trabalho é ESCOLHER exercícios da lista fornecida e distribuir as séries respeitando esses números.

REGRAS INVIOLÁVEIS:
1. NUNCA recalcule, ajuste ou "corrija" um valor que você recebeu.
2. NUNCA use um exercício que não esteja na lista. Responda com o id exato de cada um.
3. Crie uma sessão para cada sessão informada, com o nome exato que foi dado.
4. Cada exercício precisa de: exercicioId, nome, séries e faixa de repetições.
5. Ordene do exercício mais composto para o mais isolado dentro de cada sessão.
6. A lista já foi filtrada para as restrições físicas do usuário. Tudo nela é seguro.

## Por que os números são o que são

- SÉRIES POR GRUPO MUSCULAR NA SEMANA: existe relação dose-resposta entre volume semanal e hipertrofia (PELLAND et al., 2024). Cada grupo muscular deve ser treinado ao menos duas vezes por semana para hipertrofia superior a treinar uma vez só (SCHOENFELD; OGBORN; KRIEGER, 2016). O volume que você recebeu já considera o nível de experiência do usuário.

## LIMITES DE VOLUME (limites, não metas a atingir)

- Entre 4 e 7 exercícios por sessão. Nunca mais que 7.
- Entre 2 e 5 séries por exercício. NUNCA mais que 5 séries no mesmo exercício.
- O número de séries por grupo muscular na semana é um TOTAL a ser DISTRIBUÍDO, não o número de séries de um exercício. Ele se acumula somando todos os exercícios daquele grupo em todas as sessões da semana, considerando quantas vezes cada sessão se repete.

Exemplo de como distribuir: se a meta é 12 séries semanais de peito e a sessão que treina peito acontece 2 vezes por semana, então cada sessão precisa de 6 séries de peito — o que pode ser 2 exercícios de 3 séries, ou 3 exercícios de 2 séries. Nunca um único exercício de 12 séries.

## Formato da resposta

Responda SOMENTE com um objeto json válido, sem texto antes ou depois e sem blocos de código markdown, exatamente nesta estrutura:

{
  "sessoes": [
    {
      "nome": "Upper",
      "exercicios": [
        { "exercicioId": 1, "nome": "Supino reto com barra", "series": 4, "repeticoes": "8-10" },
        { "exercicioId": 17, "nome": "Puxada frente na polia", "series": 4, "repeticoes": "8-12" }
      ]
    }
  ],
  "observacoes": "Uma ou duas frases orientando o usuário."
}`;
    }

    private montarUser(contexto: ContextoTreino): string {
        const { resultado, exercicios, restricoesFisicas } = contexto;
        const { metabolismo, meta, treino } = resultado;

        const sessoes = treino.sessoes
            .map((sessao) => `${sessao.nome} (${sessao.frequenciaSemanal}x por semana)`)
            .join(", ");

        return `# Perfil do usuário

Idade: ${metabolismo.idade} anos
IMC: ${metabolismo.imc}
Objetivo: ${this.descreverObjetivo(meta.objetivo)}
Restrições físicas declaradas: ${restricoesFisicas.length > 0 ? restricoesFisicas.join(", ") : "nenhuma"}

# Estrutura calculada pelo motor determinístico (use exatamente estes valores)

Divisão de treino: ${treino.split}
Dias de treino por semana: ${treino.diasPorSemana}
Sessões a montar: ${sessoes}
Séries por grupo muscular por semana (total a distribuir entre exercícios e sessões): ${treino.seriesPorGrupoSemana}

# Exercícios disponíveis

Formato: id|nome|grupo muscular|sessões em que pode ser usado.

${exercicios.map((e) => `${e.id}|${e.nome}|${e.grupoMuscular}|${e.sessoes.join(",")}`).join("\n")}

Monte o treino em json.`;
    }

    private descreverObjetivo(objetivo: string): string {
        const descricoes: Record<string, string> = {
            perder: "perder gordura (déficit calórico)",
            manter: "manter peso e composição corporal",
            ganhar: "ganhar massa muscular (superávit calórico)",
        };
        return descricoes[objetivo] ?? objetivo;
    }
}
