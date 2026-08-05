import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-server";
import {
  DASHBOARD_TAB_IDS,
  DASHBOARD_WIDGET_DEFINITIONS,
  DashboardPreferencesServiceError,
  getDashboardPreferences,
  upsertDashboardPreferences,
  type DashboardWidgetId,
} from "@/lib/services/dashboard-preferences-service";

const dashboardWidgetIds = new Set<DashboardWidgetId>(
  DASHBOARD_WIDGET_DEFINITIONS.map((widget) => widget.id)
);
const dashboardWidgetDefinitionsById = new Map<
  DashboardWidgetId,
  (typeof DASHBOARD_WIDGET_DEFINITIONS)[number]
>(DASHBOARD_WIDGET_DEFINITIONS.map((widget) => [widget.id, widget]));

const dashboardTabSchema = z.enum(DASHBOARD_TAB_IDS);
const dashboardWidgetIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value): value is DashboardWidgetId =>
      dashboardWidgetIds.has(value as DashboardWidgetId),
    { message: "Widget invalido" }
  );

const dashboardWidgetOrderSchema = z
  .object({
    summary: z.array(dashboardWidgetIdSchema).optional(),
    operations: z.array(dashboardWidgetIdSchema).optional(),
    audit: z.array(dashboardWidgetIdSchema).optional(),
  })
  .strict()
  .superRefine((widgetOrder, ctx) => {
    const seenWidgetIds = new Set<DashboardWidgetId>();

    for (const tab of DASHBOARD_TAB_IDS) {
      for (const [index, widgetId] of (widgetOrder[tab] ?? []).entries()) {
        const widget = dashboardWidgetDefinitionsById.get(widgetId);

        if (widget?.tabId !== tab) {
          ctx.addIssue({
            code: "custom",
            message: "Widget invalido para la pestana",
            path: [tab, index],
          });
        }

        if (seenWidgetIds.has(widgetId)) {
          ctx.addIssue({
            code: "custom",
            message: "Widget duplicado",
            path: [tab, index],
          });
        }

        seenWidgetIds.add(widgetId);
      }
    }
  });

const dashboardPreferencesPatchSchema = z
  .object({
    defaultTab: dashboardTabSchema.optional(),
    widgetOrder: dashboardWidgetOrderSchema.optional(),
    hiddenWidgets: z.array(dashboardWidgetIdSchema).optional(),
  })
  .strict();

function handleDashboardPreferencesError(error: unknown) {
  if (error instanceof DashboardPreferencesServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[api/dashboard/preferences] Failed to load preferences", error);

  return NextResponse.json(
    { error: "Error interno cargando preferencias del panel" },
    { status: 500 }
  );
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const preferences = await getDashboardPreferences({
      userId: auth.session.user.id,
      role: auth.session.user.role,
    });

    return NextResponse.json(preferences);
  } catch (error) {
    return handleDashboardPreferencesError(error);
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = dashboardPreferencesPatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    const preferences = await upsertDashboardPreferences({
      userId: auth.session.user.id,
      role: auth.session.user.role,
      preferences: parsed.data,
    });

    return NextResponse.json(preferences);
  } catch (error) {
    return handleDashboardPreferencesError(error);
  }
}
