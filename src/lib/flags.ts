// src/lib/flags.ts
//
// Feature flags da aplicação. T007 (feature 001-camada-aluno-simulados).
// A camada do aluno é liberada por flag para permitir rollout em campanha-piloto
// sem impacto na operação interna (staff).
//
// Lê de variável de ambiente; default desligado (fail-safe).

export const flags = {
  /** Camada do aluno (cadastro público, simulados de captação). Default: off. */
  alunoLayer: process.env.NEXT_PUBLIC_FEATURE_ALUNO_LAYER === "true",
} as const;

export type FeatureFlag = keyof typeof flags;

/** Retorna true se a flag estiver habilitada. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return flags[flag] === true;
}
