export const REQUIRED_DASHBOARD_ENV_VARS = ["AUTH_SECRET", "DATABASE_URL"] as const;

export class DashboardConfigurationError extends Error {
  constructor(readonly missingEnvVars: readonly string[]) {
    super(
      `Configuración incompleta del servidor. Faltan: ${missingEnvVars.join(", ")}`
    );
  }
}

function getMissingEnvVars(envVars: readonly string[]) {
  return envVars.filter((name) => !process.env[name]?.trim());
}

export function assertDashboardConfiguration() {
  const missingEnvVars = getMissingEnvVars(REQUIRED_DASHBOARD_ENV_VARS);

  if (missingEnvVars.length > 0) {
    throw new DashboardConfigurationError(missingEnvVars);
  }
}
