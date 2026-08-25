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
