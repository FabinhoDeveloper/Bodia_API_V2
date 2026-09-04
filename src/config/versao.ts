import { statSync } from "node:fs";

/**
 * Marca da versao no ar, exposta pela rota `/`.
 *
 * `GIT_COMMIT` e exportada pelo `scripts/deploy.sh` antes do `pm2 reload
 * --update-env`, entao vem do ambiente do processo — nao do `.env`. Em dev ela
 * nao existe e o valor cai em "desconhecido".
 */
export const commit = process.env.GIT_COMMIT || "desconhecido";

/**
 * Capturado na carga do modulo, ou seja, no boot do processo. E o que denuncia
 * um reload quando o commit e o mesmo (um `workflow_dispatch`, por exemplo).
 */
export const iniciadoEm = new Date().toISOString();

/**
 * De onde o processo esta rodando: `dist` (build compilado, via `npm start`) ou
 * `src` (fonte, via `npm run dev`/tsx).
 *
 * Existe por um caso real que custou uma hora de investigacao: o app apontava
 * para a maquina local, o codigo novo estava no fonte com os testes passando, e
 * o processo no ar era `node dist/server.js` de um build de duas semanas antes.
 * O `GET /` respondia 200 com `commit: "desconhecido"` e nao acusava nada — a
 * marca de versao so servia depois de um deploy, que e quando `GIT_COMMIT`
 * existe. Em dev, que e onde se testa mudanca, ela era cega.
 */
export const origem = __filename.endsWith(".ts") ? "src" : "dist";

/**
 * Quando o arquivo em execucao foi escrito. Rodando de `dist`, e a hora do
 * `tsc` — se estiver muito atras da ultima alteracao no fonte, o processo esta
 * servindo build velho e um `npm run build` resolve.
 *
 * `statSync` roda uma vez, na carga do modulo, e nao por requisicao.
 */
export const compiladoEm = (() => {
    try {
        return statSync(__filename).mtime.toISOString();
    } catch {
        // Nunca vale derrubar a rota de saude por causa da marca de versao.
        return "desconhecido";
    }
})();
