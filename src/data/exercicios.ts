// Catálogo de exercícios de musculação.
//
// Diferente de `alimentos.ts` (importado da TACO), este catálogo é escrito à mão
// por não existir tabela pública equivalente. Não há valor nutricional/numérico
// aqui — só nome, grupo muscular e biomecânica estrutural.
//
// `sessoes` usa exatamente os nomes que EngineService.SPLIT_POR_DIAS produz.
// `articulacoes` lista as articulações sob carga, e casa com os chips de
// restrição física do app (Joelho, Ombro, Lombar, Punho, Cotovelo) — é o que
// permite remover exercícios contraindicados antes de o prompt ser montado.
// `equipamento` é o insumo de `data/dificuldade-treino.ts`, que recorta o
// catálogo pelo nível de experiência do usuário.

export type Sessao = "Corpo inteiro" | "Push" | "Pull" | "Legs" | "Upper" | "Lower";
export type Articulacao = "Joelho" | "Ombro" | "Lombar" | "Punho" | "Cotovelo";

/**
 * Com o que o exercício é executado.
 *
 * É fato objetivo, conferível lendo o nome do exercício — e por isso é escrito
 * aqui em vez de deduzido. Deduzir do `nome` não funcionaria: 37 dos 100
 * exercícios não dizem o equipamento nele. "Leg press 45 graus", "Cadeira
 * extensora", "Hack squat" e "Mesa flexora" são máquina sem a palavra máquina;
 * "Levantamento terra", "Good morning" e "Agachamento frontal" são barra sem a
 * palavra barra.
 *
 * Existe para alimentar `data/dificuldade-treino.ts`, que decide o que entra no
 * catálogo de um iniciante. Não é enviado ao modelo.
 */
export type Equipamento = "MAQUINA" | "POLIA" | "SMITH" | "HALTER" | "BARRA" | "PESO_CORPORAL";

export interface Exercicio {
    id: number;
    nome: string;
    grupoMuscular: string;
    sessoes: Sessao[];
    articulacoes: Articulacao[];
    equipamento: Equipamento;
}

const PUSH: Sessao[] = ["Push", "Upper"];
const PUSH_COMPOSTO: Sessao[] = ["Push", "Upper", "Corpo inteiro"];
const PULL: Sessao[] = ["Pull", "Upper"];
const PULL_COMPOSTO: Sessao[] = ["Pull", "Upper", "Corpo inteiro"];
const PERNA: Sessao[] = ["Legs", "Lower"];
const PERNA_COMPOSTO: Sessao[] = ["Legs", "Lower", "Corpo inteiro"];
const CORE: Sessao[] = ["Legs", "Lower", "Corpo inteiro"];

export const EXERCICIOS: Exercicio[] = [
    // Peito
    { id: 1, nome: "Supino reto com barra", grupoMuscular: "Peito", equipamento: "BARRA", sessoes: PUSH_COMPOSTO, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 2, nome: "Supino inclinado com barra", grupoMuscular: "Peito", equipamento: "BARRA", sessoes: PUSH_COMPOSTO, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 3, nome: "Supino declinado com barra", grupoMuscular: "Peito", equipamento: "BARRA", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 4, nome: "Supino reto com halteres", grupoMuscular: "Peito", equipamento: "HALTER", sessoes: PUSH_COMPOSTO, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 5, nome: "Supino inclinado com halteres", grupoMuscular: "Peito", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 6, nome: "Supino reto na máquina", grupoMuscular: "Peito", equipamento: "MAQUINA", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 7, nome: "Crucifixo reto com halteres", grupoMuscular: "Peito", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 8, nome: "Crucifixo inclinado com halteres", grupoMuscular: "Peito", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 9, nome: "Voador (peck deck)", grupoMuscular: "Peito", equipamento: "MAQUINA", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 10, nome: "Crossover na polia", grupoMuscular: "Peito", equipamento: "POLIA", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 11, nome: "Flexão de braço", grupoMuscular: "Peito", equipamento: "PESO_CORPORAL", sessoes: PUSH_COMPOSTO, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 12, nome: "Mergulho em paralelas", grupoMuscular: "Peito", equipamento: "PESO_CORPORAL", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 13, nome: "Pullover com halter", grupoMuscular: "Peito", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Ombro"] },

    // Costas
    { id: 14, nome: "Barra fixa pronada", grupoMuscular: "Costas", equipamento: "PESO_CORPORAL", sessoes: PULL_COMPOSTO, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 15, nome: "Barra fixa supinada", grupoMuscular: "Costas", equipamento: "PESO_CORPORAL", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 16, nome: "Barra fixa pegada neutra", grupoMuscular: "Costas", equipamento: "PESO_CORPORAL", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 17, nome: "Puxada frente na polia", grupoMuscular: "Costas", equipamento: "POLIA", sessoes: PULL_COMPOSTO, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 18, nome: "Puxada supinada na polia", grupoMuscular: "Costas", equipamento: "POLIA", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 19, nome: "Puxada triângulo na polia", grupoMuscular: "Costas", equipamento: "POLIA", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 20, nome: "Remada curvada com barra", grupoMuscular: "Costas", equipamento: "BARRA", sessoes: PULL_COMPOSTO, articulacoes: ["Lombar", "Ombro", "Cotovelo"] },
    { id: 21, nome: "Remada cavalinho", grupoMuscular: "Costas", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Lombar", "Ombro", "Cotovelo"] },
    { id: 22, nome: "Remada unilateral com halter", grupoMuscular: "Costas", equipamento: "HALTER", sessoes: PULL_COMPOSTO, articulacoes: ["Lombar", "Ombro", "Cotovelo"] },
    { id: 23, nome: "Remada baixa na polia", grupoMuscular: "Costas", equipamento: "POLIA", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 24, nome: "Remada na máquina", grupoMuscular: "Costas", equipamento: "MAQUINA", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 25, nome: "Remada invertida", grupoMuscular: "Costas", equipamento: "PESO_CORPORAL", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 26, nome: "Pulldown com braços estendidos", grupoMuscular: "Costas", equipamento: "POLIA", sessoes: PULL, articulacoes: ["Ombro"] },
    { id: 27, nome: "Levantamento terra", grupoMuscular: "Costas", equipamento: "BARRA", sessoes: PULL_COMPOSTO, articulacoes: ["Lombar", "Joelho"] },
    { id: 28, nome: "Levantamento terra romeno", grupoMuscular: "Costas", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Lombar"] },
    { id: 29, nome: "Hiperextensão lombar", grupoMuscular: "Costas", equipamento: "PESO_CORPORAL", sessoes: PULL, articulacoes: ["Lombar"] },
    { id: 30, nome: "Encolhimento de ombros com halteres", grupoMuscular: "Trapézio", equipamento: "HALTER", sessoes: PULL, articulacoes: ["Ombro"] },

    // Ombro
    { id: 31, nome: "Desenvolvimento militar com barra", grupoMuscular: "Ombro", equipamento: "BARRA", sessoes: PUSH_COMPOSTO, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 32, nome: "Desenvolvimento com halteres", grupoMuscular: "Ombro", equipamento: "HALTER", sessoes: PUSH_COMPOSTO, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 33, nome: "Desenvolvimento Arnold", grupoMuscular: "Ombro", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 34, nome: "Desenvolvimento na máquina", grupoMuscular: "Ombro", equipamento: "MAQUINA", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 35, nome: "Elevação lateral com halteres", grupoMuscular: "Ombro", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 36, nome: "Elevação lateral na polia", grupoMuscular: "Ombro", equipamento: "POLIA", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 37, nome: "Elevação frontal com halteres", grupoMuscular: "Ombro", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 38, nome: "Crucifixo inverso (deltoide posterior)", grupoMuscular: "Ombro", equipamento: "HALTER", sessoes: PULL, articulacoes: ["Ombro"] },
    { id: 39, nome: "Face pull na polia", grupoMuscular: "Ombro", equipamento: "POLIA", sessoes: PULL, articulacoes: ["Ombro"] },
    { id: 40, nome: "Remada alta", grupoMuscular: "Ombro", equipamento: "BARRA", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo"] },

    // Bíceps
    { id: 41, nome: "Rosca direta com barra", grupoMuscular: "Bíceps", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Cotovelo", "Punho"] },
    { id: 42, nome: "Rosca alternada com halteres", grupoMuscular: "Bíceps", equipamento: "HALTER", sessoes: PULL, articulacoes: ["Cotovelo", "Punho"] },
    { id: 43, nome: "Rosca martelo", grupoMuscular: "Bíceps", equipamento: "HALTER", sessoes: PULL, articulacoes: ["Cotovelo", "Punho"] },
    { id: 44, nome: "Rosca concentrada", grupoMuscular: "Bíceps", equipamento: "HALTER", sessoes: PULL, articulacoes: ["Cotovelo"] },
    { id: 45, nome: "Rosca scott", grupoMuscular: "Bíceps", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Cotovelo", "Punho"] },
    { id: 46, nome: "Rosca inversa", grupoMuscular: "Bíceps", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Cotovelo", "Punho"] },
    { id: 47, nome: "Rosca na polia baixa", grupoMuscular: "Bíceps", equipamento: "POLIA", sessoes: PULL, articulacoes: ["Cotovelo", "Punho"] },
    { id: 48, nome: "Rosca 21", grupoMuscular: "Bíceps", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Cotovelo", "Punho"] },

    // Tríceps
    { id: 49, nome: "Tríceps testa com barra W", grupoMuscular: "Tríceps", equipamento: "BARRA", sessoes: PUSH, articulacoes: ["Cotovelo", "Punho"] },
    { id: 50, nome: "Tríceps corda na polia", grupoMuscular: "Tríceps", equipamento: "POLIA", sessoes: PUSH, articulacoes: ["Cotovelo"] },
    { id: 51, nome: "Tríceps barra na polia", grupoMuscular: "Tríceps", equipamento: "POLIA", sessoes: PUSH, articulacoes: ["Cotovelo", "Punho"] },
    { id: 52, nome: "Tríceps francês com halter", grupoMuscular: "Tríceps", equipamento: "HALTER", sessoes: PUSH, articulacoes: ["Cotovelo"] },
    { id: 53, nome: "Tríceps coice na polia", grupoMuscular: "Tríceps", equipamento: "POLIA", sessoes: PUSH, articulacoes: ["Cotovelo"] },
    { id: 54, nome: "Mergulho no banco", grupoMuscular: "Tríceps", equipamento: "PESO_CORPORAL", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 55, nome: "Supino fechado", grupoMuscular: "Tríceps", equipamento: "BARRA", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo", "Punho"] },
    { id: 56, nome: "Tríceps na máquina", grupoMuscular: "Tríceps", equipamento: "MAQUINA", sessoes: PUSH, articulacoes: ["Cotovelo"] },

    // Quadríceps
    { id: 57, nome: "Agachamento livre com barra", grupoMuscular: "Quadríceps", equipamento: "BARRA", sessoes: PERNA_COMPOSTO, articulacoes: ["Joelho", "Lombar"] },
    { id: 58, nome: "Agachamento frontal", grupoMuscular: "Quadríceps", equipamento: "BARRA", sessoes: PERNA, articulacoes: ["Joelho", "Lombar"] },
    { id: 59, nome: "Agachamento no smith", grupoMuscular: "Quadríceps", equipamento: "SMITH", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 60, nome: "Agachamento goblet", grupoMuscular: "Quadríceps", equipamento: "HALTER", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 61, nome: "Agachamento sumô", grupoMuscular: "Quadríceps", equipamento: "HALTER", sessoes: PERNA, articulacoes: ["Joelho", "Lombar"] },
    { id: 62, nome: "Agachamento búlgaro", grupoMuscular: "Quadríceps", equipamento: "HALTER", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 63, nome: "Leg press 45 graus", grupoMuscular: "Quadríceps", equipamento: "MAQUINA", sessoes: PERNA_COMPOSTO, articulacoes: ["Joelho"] },
    { id: 64, nome: "Hack squat", grupoMuscular: "Quadríceps", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 65, nome: "Cadeira extensora", grupoMuscular: "Quadríceps", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 66, nome: "Afundo com halteres", grupoMuscular: "Quadríceps", equipamento: "HALTER", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 67, nome: "Passada com halteres", grupoMuscular: "Quadríceps", equipamento: "HALTER", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 68, nome: "Avanço no smith", grupoMuscular: "Quadríceps", equipamento: "SMITH", sessoes: PERNA, articulacoes: ["Joelho"] },

    // Posterior de coxa e glúteo
    { id: 69, nome: "Mesa flexora", grupoMuscular: "Posterior de coxa", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 70, nome: "Cadeira flexora", grupoMuscular: "Posterior de coxa", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 71, nome: "Flexora em pé", grupoMuscular: "Posterior de coxa", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 72, nome: "Stiff com barra", grupoMuscular: "Posterior de coxa", equipamento: "BARRA", sessoes: PERNA_COMPOSTO, articulacoes: ["Lombar"] },
    { id: 73, nome: "Good morning", grupoMuscular: "Posterior de coxa", equipamento: "BARRA", sessoes: PERNA, articulacoes: ["Lombar"] },
    { id: 74, nome: "Levantamento terra sumô", grupoMuscular: "Posterior de coxa", equipamento: "BARRA", sessoes: PERNA, articulacoes: ["Lombar", "Joelho"] },
    { id: 75, nome: "Elevação pélvica (hip thrust)", grupoMuscular: "Glúteo", equipamento: "BARRA", sessoes: PERNA_COMPOSTO, articulacoes: ["Lombar"] },
    { id: 76, nome: "Coice na polia", grupoMuscular: "Glúteo", equipamento: "POLIA", sessoes: PERNA, articulacoes: [] },
    { id: 77, nome: "Extensão de quadril na máquina", grupoMuscular: "Glúteo", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: [] },
    { id: 78, nome: "Abdução de quadril na polia", grupoMuscular: "Glúteo", equipamento: "POLIA", sessoes: PERNA, articulacoes: [] },
    { id: 79, nome: "Cadeira abdutora", grupoMuscular: "Glúteo", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: [] },
    { id: 80, nome: "Cadeira adutora", grupoMuscular: "Adutores", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: [] },

    // Panturrilha
    { id: 81, nome: "Elevação de panturrilha em pé", grupoMuscular: "Panturrilha", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: [] },
    { id: 82, nome: "Elevação de panturrilha sentado", grupoMuscular: "Panturrilha", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: [] },
    { id: 83, nome: "Panturrilha no leg press", grupoMuscular: "Panturrilha", equipamento: "MAQUINA", sessoes: PERNA, articulacoes: ["Joelho"] },
    { id: 84, nome: "Panturrilha no smith", grupoMuscular: "Panturrilha", equipamento: "SMITH", sessoes: PERNA, articulacoes: [] },

    // Abdômen e core
    { id: 85, nome: "Prancha isométrica", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Ombro", "Lombar"] },
    { id: 86, nome: "Prancha lateral", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Ombro"] },
    { id: 87, nome: "Abdominal supra no solo", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Lombar"] },
    { id: 88, nome: "Abdominal infra (elevação de pernas)", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Lombar"] },
    { id: 89, nome: "Abdominal na polia alta", grupoMuscular: "Abdômen", equipamento: "POLIA", sessoes: CORE, articulacoes: ["Lombar"] },
    { id: 90, nome: "Elevação de joelhos suspenso", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Ombro"] },
    { id: 91, nome: "Abdominal canivete", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Lombar"] },
    { id: 92, nome: "Rotação russa", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Lombar"] },
    { id: 93, nome: "Abdominal bicicleta", grupoMuscular: "Abdômen", equipamento: "PESO_CORPORAL", sessoes: CORE, articulacoes: ["Lombar"] },

    // Antebraço
    { id: 94, nome: "Rosca de punho", grupoMuscular: "Antebraço", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Punho"] },
    { id: 95, nome: "Rosca de punho inversa", grupoMuscular: "Antebraço", equipamento: "BARRA", sessoes: PULL, articulacoes: ["Punho"] },
    { id: 96, nome: "Farmer's walk", grupoMuscular: "Antebraço", equipamento: "HALTER", sessoes: ["Pull", "Upper", "Corpo inteiro"], articulacoes: ["Punho", "Ombro", "Lombar"] },

    // Compostos adicionais
    { id: 97, nome: "Puxada na polia unilateral", grupoMuscular: "Costas", equipamento: "POLIA", sessoes: PULL, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 98, nome: "Crucifixo na máquina", grupoMuscular: "Peito", equipamento: "MAQUINA", sessoes: PUSH, articulacoes: ["Ombro"] },
    { id: 99, nome: "Desenvolvimento na polia", grupoMuscular: "Ombro", equipamento: "POLIA", sessoes: PUSH, articulacoes: ["Ombro", "Cotovelo"] },
    { id: 100, nome: "Extensão de tríceps unilateral na polia", grupoMuscular: "Tríceps", equipamento: "POLIA", sessoes: PUSH, articulacoes: ["Cotovelo"] },
];
