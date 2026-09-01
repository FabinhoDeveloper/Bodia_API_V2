/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    // Variáveis de ambiente que os módulos de config leem na CARGA precisam
    // existir antes do primeiro import — ver tests/setup.ts.
    setupFiles: ["<rootDir>/tests/setup.ts"],
    testMatch: ["**/*.test.ts"],
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
    },
};
