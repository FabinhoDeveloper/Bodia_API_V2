export default class HealthService {
    check() {
        return { status: "ok", timestamp: new Date().toISOString() };
    }
}
