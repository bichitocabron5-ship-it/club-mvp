"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardAdminView } from "@/components/dashboard/dashboard-admin-view";
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

export default function PanelPage() {
  const [data, setData] = useState<DashboardData | null>(null);
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
      const json = await fetchJson<DashboardData>("/api/dashboard");
      setData(json);
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
          <EmptyState message={initialError} className="bg-white/70" />
          <button
            type="button"
            onClick={() => void loadPanel("initial")}
            disabled={isInitialLoading}
            className="app-button-primary mt-4 rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
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
      isRefreshing={isRefreshing}
      refreshError={refreshError}
      onRefresh={handleRefresh}
    />
  );
}
