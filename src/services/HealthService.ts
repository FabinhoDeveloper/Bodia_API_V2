/**
 * Confirma que a API está de pé — usado por GET /api/health. Não depende de
 * banco nem de nenhum outro serviço; existe só como prova de que a estrutura
 * em camadas (Route → Controller → Service) funciona ponta a ponta.
 */
export default class HealthService {
    check() {
        return { status: "ok", timestamp: new Date().toISOString() };
    }
}
