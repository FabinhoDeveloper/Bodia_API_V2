import { PlanoGerado } from "../services/PlanoService";

/**
 * Plano fixo, no MESMO formato que o LLM devolve, usado enquanto o fluxo da IA
 * está desativado (flag SIMULAR_IA). Serve para o resto do produto — telas,
 * persistência, registro de treino e refeição — ser desenvolvido sem depender
 * de uma chamada que hoje leva ~3 min e falha com frequência.
 *
 * LIMITAÇÃO DELIBERADA: é estático, então NÃO respeita o perfil nem as
 * restrições. Um usuário vegano recebe frango, e as calorias não batem com a
 * meta dele — os desvios calculados vão sair altos de propósito. Isso é
 * esperado; não é bug. Quando a IA voltar, é ela quem passa a montar isto.
 *
 * Os ids são REAIS dos catálogos (alimentos.ts e exercicios.ts), para que a
 * validação de ids passe e a persistência funcione como chave estrangeira.
 */
export const PLANO_SIMULADO: PlanoGerado = {
    dieta: {
        refeicoes: [
            {
                nome: "Café da manhã",
                itens: [
                    { alimentoId: 488, nome: "Ovo, de galinha, inteiro, cozido/10minutos", gramas: 100 },
                    { alimentoId: 52, nome: "Pão, trigo, forma, integral", gramas: 60 },
                    { alimentoId: 182, nome: "Banana, prata, crua", gramas: 100 },
                ],
            },
            {
                nome: "Almoço",
                itens: [
                    { alimentoId: 410, nome: "Frango, peito, sem pele, grelhado", gramas: 150 },
                    { alimentoId: 3, nome: "Arroz, tipo 1, cozido", gramas: 150 },
                    { alimentoId: 561, nome: "Feijão, carioca, cozido", gramas: 100 },
                    { alimentoId: 78, nome: "Alface, crespa, crua", gramas: 40 },
                    { alimentoId: 157, nome: "Tomate, com semente, cru", gramas: 60 },
                    { alimentoId: 260, nome: "Azeite, de oliva, extra virgem", gramas: 5 },
                ],
            },
            {
                nome: "Lanche da tarde",
                itens: [
                    { alimentoId: 448, nome: "Iogurte, natural", gramas: 170 },
                    { alimentoId: 7, nome: "Aveia, flocos, crua", gramas: 30 },
                    { alimentoId: 222, nome: "Maçã, Fuji, com casca, crua", gramas: 130 },
                ],
            },
            {
                nome: "Jantar",
                itens: [
                    { alimentoId: 301, nome: "Merluza, filé, assado", gramas: 150 },
                    { alimentoId: 88, nome: "Batata, doce, cozida", gramas: 150 },
                    { alimentoId: 100, nome: "Brócolis, cozido", gramas: 80 },
                    { alimentoId: 260, nome: "Azeite, de oliva, extra virgem", gramas: 5 },
                ],
            },
        ],
    },
    treino: {
        sessoes: [
            {
                nome: "Upper",
                exercicios: [
                    { exercicioId: 1, nome: "Supino reto com barra", series: 4, repeticoes: "8-10" },
                    { exercicioId: 17, nome: "Puxada frente na polia", series: 4, repeticoes: "8-12" },
                    { exercicioId: 20, nome: "Remada curvada com barra", series: 3, repeticoes: "8-12" },
                    { exercicioId: 33, nome: "Desenvolvimento Arnold", series: 3, repeticoes: "10-12" },
                    { exercicioId: 44, nome: "Rosca concentrada", series: 3, repeticoes: "10-15" },
                    { exercicioId: 49, nome: "Tríceps testa com barra W", series: 3, repeticoes: "10-15" },
                ],
            },
            {
                nome: "Lower",
                exercicios: [
                    { exercicioId: 57, nome: "Agachamento livre com barra", series: 4, repeticoes: "6-10" },
                    { exercicioId: 66, nome: "Afundo com halteres", series: 3, repeticoes: "10-12" },
                    { exercicioId: 73, nome: "Good morning", series: 3, repeticoes: "10-12" },
                    { exercicioId: 70, nome: "Cadeira flexora", series: 3, repeticoes: "10-15" },
                    { exercicioId: 82, nome: "Elevação de panturrilha sentado", series: 4, repeticoes: "12-20" },
                    { exercicioId: 88, nome: "Abdominal infra (elevação de pernas)", series: 3, repeticoes: "12-20" },
                ],
            },
        ],
    },
    observacoes:
        "Plano de demonstração. Mantenha a hidratação ao longo do dia e registre as cargas a cada treino para acompanhar a progressão.",
};
