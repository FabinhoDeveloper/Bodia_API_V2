/**
 * Gera src/data/alimentos.ts a partir da Tabela Brasileira de Composição de
 * Alimentos (TACO — NEPA/UNICAMP), distribuída em JSON no repositório público
 * https://github.com/marcelosanto/tabela_taco
 *
 * Rodar com: npx tsx scripts/importar-taco.ts
 *
 * O script existe versionado para documentar a procedência dos dados: nenhum
 * valor nutricional é escrito à mão.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FONTE = "https://raw.githubusercontent.com/marcelosanto/tabela_taco/master/TACO.json";
const DESTINO = resolve(__dirname, "../src/data/alimentos.ts");

interface RegistroTaco {
    id: number;
    description: string;
    category: string;
    energy_kcal: number | string;
    protein_g: number | string;
    carbohydrate_g: number | string;
    lipid_g: number | string;
    fiber_g: number | string;
}

// A TACO usa sentinelas textuais: "NA" (não analisado), "Tr" (traços) e "".
// Todos viram 0 — "traços" é nutricionalmente desprezível e "não analisado"
// não pode virar um número inventado.
function numero(valor: number | string): number {
    if (typeof valor === "number" && Number.isFinite(valor)) {
        return Math.round(valor * 100) / 100;
    }
    return 0;
}

async function main() {
    console.log(`Baixando ${FONTE} ...`);
    const resposta = await fetch(FONTE);

    if (!resposta.ok) {
        throw new Error(`Falha ao baixar a TACO: HTTP ${resposta.status}`);
    }

    const registros = (await resposta.json()) as RegistroTaco[];
    console.log(`Recebidos ${registros.length} registros.`);

    const alimentos = registros
        .filter((registro) => numero(registro.energy_kcal) > 0)
        .map((registro) => ({
            id: registro.id,
            nome: registro.description,
            categoria: registro.category,
            kcal: numero(registro.energy_kcal),
            proteina: numero(registro.protein_g),
            carboidrato: numero(registro.carbohydrate_g),
            gordura: numero(registro.lipid_g),
            fibra: numero(registro.fiber_g),
        }));

    const descartados = registros.length - alimentos.length;
    console.log(`Mantidos ${alimentos.length} alimentos (${descartados} sem energia, descartados).`);

    const linhas = alimentos.map(
        (a) =>
            `    { id: ${a.id}, nome: ${JSON.stringify(a.nome)}, categoria: ${JSON.stringify(a.categoria)},` +
            ` kcal: ${a.kcal}, proteina: ${a.proteina}, carboidrato: ${a.carboidrato},` +
            ` gordura: ${a.gordura}, fibra: ${a.fibra} },`,
    );

    const conteudo = `// GERADO POR scripts/importar-taco.ts — NÃO EDITAR À MÃO.
// Fonte: Tabela Brasileira de Composição de Alimentos (TACO), NEPA/UNICAMP.
// Todos os valores são por 100 g de alimento.

export interface Alimento {
    id: number;
    nome: string;
    categoria: string;
    kcal: number;
    proteina: number;
    carboidrato: number;
    gordura: number;
    fibra: number;
}

export const ALIMENTOS: Alimento[] = [
${linhas.join("\n")}
];
`;

    mkdirSync(dirname(DESTINO), { recursive: true });
    writeFileSync(DESTINO, conteudo, "utf8");
    console.log(`Escrito em ${DESTINO}`);
}

main().catch((erro) => {
    console.error(erro);
    process.exit(1);
});
