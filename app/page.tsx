"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardAdminView } from "@/components/dashboard/dashboard-admin-view";
import type {
  DashboardPreferencesConfig,
  DashboardPreferencesSaveHandler,
} from "@/components/dashboard/dashboard-layout";
import {
  adminDashboardQuickLinks,
  staffDashboardQuickLinks,
} from "@/components/dashboard/dashboard-quick-links";
import { DashboardStaffView } from "@/components/dashboard/dashboard-staff-view";
import { PanelLoadingSkeleton } from "@/components/dashboard/panel-loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import { dashboardErrorMessage } from "@/lib/helpers/dashboard-formatters";
import type { DashboardData } from "@/lib/types";

type LoadMode = "initial" | "refresh";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDashboardWidgetOrder(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const widgetOrder: NonNullable<DashboardPreferencesConfig["widgetOrder"]> = {};

  for (const [sectionId, widgetIds] of Object.entries(value)) {
    const parsedWidgetIds = readStringList(widgetIds);

    if (parsedWidgetIds?.length) {
      widgetOrder[sectionId] = parsedWidgetIds;
    }
  }

  return Object.keys(widgetOrder).length > 0 ? widgetOrder : undefined;
}

function parseDashboardPreferences(
  value: unknown
): DashboardPreferencesConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    defaultTab:
      typeof value.defaultTab === "string" ? value.defaultTab.trim() : undefined,
    widgetOrder: parseDashboardWidgetOrder(value.widgetOrder),
    hiddenWidgets: readStringList(value.hiddenWidgets),
  };
}

async function fetchDashboardPreferences() {
  const json = await fetchJson<unknown>("/api/dashboard/preferences");
  return parseDashboardPreferences(json);
}

export default function PanelPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [preferences, setPreferences] =
    useState<DashboardPreferencesConfig | null>(null);
  const [initialError, setInitialError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPanel = useCallback(async (mode: LoadMode = "initial") => {
    const isRefresh = mode === "refresh";

    if (isRefresh) {
      setIsRefreshing(true);
      setRefreshError("");
    } else {
      setIsInitialLoading(true);
      setInitialError("");
    }

    try {
      if (isRefresh) {
        const json = await fetchJson<DashboardData>("/api/dashboard");
        setData(json);
      } else {
        const [dashboardResult, preferencesResult] = await Promise.allSettled([
          fetchJson<DashboardData>("/api/dashboard"),
          fetchDashboardPreferences(),
        ]);

        if (preferencesResult.status === "fulfilled") {
          setPreferences(preferencesResult.value);
        } else {
          console.warn(
            "[dashboard] Error loading /api/dashboard/preferences",
            preferencesResult.reason
          );
          setPreferences(null);
        }

        if (dashboardResult.status === "rejected") {
          throw dashboardResult.reason;
        }

        setData(dashboardResult.value);
      }

      setInitialError("");
      setRefreshError("");
    } catch (err) {
      console.error("[dashboard] Error loading /api/dashboard", err);
      if (isRefresh) {
        setRefreshError(dashboardErrorMessage(err, "actualizar"));
      } else {
        setInitialError(dashboardErrorMessage(err, "cargar"));
      }
    } finally {
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setIsInitialLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadPanel("initial");
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadPanel]);

  const handleRefresh = useCallback(() => {
    void loadPanel("refresh");
  }, [loadPanel]);

  const handlePreferencesSave = useCallback<DashboardPreferencesSaveHandler>(
    async (nextPreferences) => {
      const json = await fetchJson<unknown>("/api/dashboard/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextPreferences),
      });
      const savedPreferences = parseDashboardPreferences(json);

      if (!savedPreferences) {
        throw new Error("Respuesta invalida guardando preferencias");
      }

      setPreferences(savedPreferences);
      return savedPreferences;
    },
    []
  );

  if (isInitialLoading && !data) {
    return <PanelLoadingSkeleton />;
  }

  if (!data && initialError) {
    return (
      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <PageHeader
          title="Panel"
          description="Resumen diario del club para abrir el día con criterio operativo."
        />
        <section className="app-panel-strong rounded-[2rem] p-5">
          <EmptyState
            title="No se pudo cargar el panel"
            message={initialError}
            className="bg-white/70"
          />
          <button
            type="button"
            onClick={() => void loadPanel("initial")}
            disabled={isInitialLoading}
            className="app-button-primary mt-4 w-full rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isInitialLoading ? "Reintentando..." : "Reintentar"}
          </button>
        </section>
      </main>
    );
  }

  if (!data) {
    return <PanelLoadingSkeleton />;
  }

  const isAdmin = data.role === "ADMIN";
  const quickLinks = isAdmin ? adminDashboardQuickLinks : staffDashboardQuickLinks;

  if (!isAdmin) {
    return (
      <DashboardStaffView
        data={data}
        quickLinks={quickLinks}
        preferences={preferences}
        onPreferencesSave={handlePreferencesSave}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
        onRefresh={handleRefresh}
      />
    );
  }

  return (
    <DashboardAdminView
      data={data}
      quickLinks={quickLinks}
      preferences={preferences}
      onPreferencesSave={handlePreferencesSave}
      isRefreshing={isRefreshing}
      refreshError={refreshError}
      onRefresh={handleRefresh}
    />
  );
}
