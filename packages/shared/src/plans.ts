export const PLANS = ['basico', 'profesional', 'empresarial', 'corporativo'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  basico: 'Basico',
  profesional: 'Profesional',
  empresarial: 'Empresarial',
  corporativo: 'Corporativo',
};

/**
 * Limite mensual por defecto de cada plan. `corporativo` es configurable, por lo
 * que su valor solo actua como semilla: siempre manda `organizations.monthly_limit`.
 */
export const PLAN_DEFAULT_MONTHLY_LIMIT: Record<Plan, number> = {
  basico: 2_000,
  profesional: 10_000,
  empresarial: 30_000,
  corporativo: 100_000,
};

export const isPlan = (value: string): value is Plan => (PLANS as readonly string[]).includes(value);
