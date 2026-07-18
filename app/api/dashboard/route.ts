import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-server";
import { getDashboardData } from "@/lib/services/dashboard-service";
import { DashboardConfigurationError } from "@/lib/validations/dashboard";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const dashboard = await getDashboardData({
      role: auth.session.user.role,
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    if (error instanceof DashboardConfigurationError) {
      console.error(
        "[api/dashboard] Missing required env vars",
        error.missingEnvVars
      );

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error("[api/dashboard] Failed to build dashboard response", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno cargando el panel",
      },
      { status: 500 }
    );
  }
}
