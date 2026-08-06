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

// ---------------------------------------------------------------------------
// Regras de exclusão
//
// A TACO inteira tem 591 alimentos com energia. Injetar tudo no prompt fazia o
// modelo queimar raciocínio sem controle procurando a combinação que fechasse os
// macros — numa medição real gastou os 32000 tokens inteiros e devolveu conteúdo
// vazio. Reduzir o catálogo encolhe o espaço de busca.
//
// As regras são mecânicas de propósito: dá para auditar por que cada item saiu,
// e regenerar o catálogo é reproduzível.
// ---------------------------------------------------------------------------

// "Outros alimentos industrializados" fica de fora desta lista de propósito: só
// 5 itens, e 3 deles são ingredientes legítimos (azeitona preta, azeitona verde
// e leite de coco — este último é a base de receita vegana que o CatalogoService
// protege explicitamente). Os outros 2 (chantilly e maionese) saem pela regra de
// ultraprocessados.
const CATEGORIAS_FORA = [
    "Produtos açucarados",
    "Bebidas (alcoólicas e não alcoólicas)",
    "Alimentos preparados",
    "Miscelâneas",
];

// Só nestas o "cru" é impróprio: ninguém come arroz ou frango cru. Fruta e
// hortaliça crua ficam, porque é assim que se comem.
const CATEGORIAS_QUE_EXIGEM_COZIMENTO = [
    "Cereais e derivados",
    "Leguminosas e derivados",
    "Carnes e derivados",
    "Pescados e frutos do mar",
    // Ovo cru chegou a aparecer num plano gerado antes desta categoria entrar aqui.
    "Ovos e derivados",
];

// Consumidos crus mesmo estando em categoria que normalmente exige cozimento.
const CRU_COMESTIVEL = /aveia|amendoim|castanha|noz|linhaça|gergelim/i;

const ULTRAPROCESSADO =
    /caldo de (carne|galinha)|frit[ao]|à milanesa|empada|coxinha|croquete|apresuntado|charque|carne, seca|salsicha|linguiça|mortadela|salame|presunto|hamb[úu]rguer|nugget|biscoito|bolo|pastel|cereal matinal|mingau|creme de (arroz|milho), pó|farinha láctea|macarrão, instantâneo|curau|pamonha|canjica|polenta|nhoque|seleta|chantilly|maionese/i;

const VISCERA = /fígado|bucho|língua|coração|rim,|miolo de|dobradinha|sarapatel|mocotó|toucinho|banha|orelha|rabo/i;

const FRUTA_INCOMUM =
    /abiu|atemóia|cajá|ciriguela|cupuaçu|fruta-pão|graviola|jambo|jamelão|macaúba|mamão verde|nêspera|pequi|pinha|pitanga|tamarindo|tucumã|umbu|jaca|carambola|biribá|sapoti|açaí|cacau|caqui|romã/i;

const PEIXE_INCOMUM = /corimba|corvina|dourada|lambari|manjuba|porquinho|pintado|tucunaré|cação|abadejo|pescadinha/i;

const HORTALICA_INCOMUM =
    /alfavaca|almeirão|caruru|catalonha|jurubeba|maxixe|serralha|taioba|chicória|chuchu|jiló|cará|nabo|mostarda|rabanete|aipo|alho-poró/i;

/** Devolve o motivo da exclusão, ou null se o alimento deve ficar. */
function motivoExclusao(nome: string, categoria: string): string | null {
    if (CATEGORIAS_FORA.includes(categoria)) return "categoria fora do escopo";
    if (ULTRAPROCESSADO.test(nome)) return "ultraprocessado/embutido/frito/doce";
    if (VISCERA.test(nome)) return "víscera, miúdo ou gordura animal";
    if (
        CATEGORIAS_QUE_EXIGEM_COZIMENTO.includes(categoria) &&
        /,\s*cr[ua]/i.test(nome) &&
        !CRU_COMESTIVEL.test(nome)
    ) {
        return "cru (a versão cozida já está no catálogo)";
    }
    if (FRUTA_INCOMUM.test(nome)) return "fruta regional/incomum";
    if (PEIXE_INCOMUM.test(nome)) return "peixe regional/incomum";
    if (HORTALICA_INCOMUM.test(nome)) return "hortaliça pouco comum";
    return null;
}

async function main() {
    console.log(`Baixando ${FONTE} ...`);
    const resposta = await fetch(FONTE);

    if (!resposta.ok) {
        throw new Error(`Falha ao baixar a TACO: HTTP ${resposta.status}`);
    }

    const registros = (await resposta.json()) as RegistroTaco[];
    console.log(`Recebidos ${registros.length} registros.`);

    const comEnergia = registros.filter((registro) => numero(registro.energy_kcal) > 0);
    console.log(`${registros.length - comEnergia.length} descartados por não terem energia.`);

    const excluidosPorMotivo = new Map<string, number>();

    const alimentos = comEnergia
        .filter((registro) => {
            const motivo = motivoExclusao(registro.description, registro.category);
            if (motivo) {
                excluidosPorMotivo.set(motivo, (excluidosPorMotivo.get(motivo) ?? 0) + 1);
                return false;
            }
            return true;
        })
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

    console.log("\nExcluídos por regra:");
    [...excluidosPorMotivo.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([motivo, total]) => console.log(`  ${String(total).padStart(3)}  ${motivo}`));

    console.log(`\nMantidos ${alimentos.length} de ${comEnergia.length} alimentos.`);

    const linhas = alimentos.map(
        (a) =>
            `    { id: ${a.id}, nome: ${JSON.stringify(a.nome)}, categoria: ${JSON.stringify(a.categoria)},` +
            ` kcal: ${a.kcal}, proteina: ${a.proteina}, carboidrato: ${a.carboidrato},` +
            ` gordura: ${a.gordura}, fibra: ${a.fibra} },`,
    );

    const conteudo = `// GERADO POR scripts/importar-taco.ts — NÃO EDITAR À MÃO.
// Fonte: Tabela Brasileira de Composição de Alimentos (TACO), NEPA/UNICAMP.
// Todos os valores são por 100 g de alimento.
//
// A lista é um recorte da TACO: doces, bebidas, ultraprocessados, vísceras,
// itens crus que exigem cozimento e alimentos regionais pouco comuns ficam de
// fora. As regras estão no importador — para mudar o recorte, edite lá e
// regenere, nunca este arquivo.

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
