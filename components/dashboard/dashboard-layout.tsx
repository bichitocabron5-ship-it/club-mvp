"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

import { DashboardCustomizePanel } from "@/components/dashboard/dashboard-customize-panel";
import { PageHeader } from "@/components/ui/page-header";

export type DashboardSectionConfig = {
  id: string;
  label: string;
  description: string;
  emptyMessage?: string;
};

export type DashboardWidgetConfig = {
  id: string;
  sectionId: DashboardSectionConfig["id"];
  order: number;
  hidden?: boolean;
  className?: string;
  content: ReactNode;
};

export type DashboardPreferencesConfig = {
  defaultTab?: string;
  widgetOrder?: Record<string, string[]>;
  hiddenWidgets?: string[];
};

export type DashboardPreferencesSaveHandler = (
  preferences: DashboardPreferencesConfig
) => Promise<DashboardPreferencesConfig | null>;

function compareDashboardWidgets(
  first: DashboardWidgetConfig,
  second: DashboardWidgetConfig,
  preferredWidgetOrder: ReadonlyMap<string, number>
) {
  const firstPreferredOrder = preferredWidgetOrder.get(first.id);
  const secondPreferredOrder = preferredWidgetOrder.get(second.id);

  if (
    firstPreferredOrder !== undefined ||
    secondPreferredOrder !== undefined
  ) {
    return (
      (firstPreferredOrder ?? Number.MAX_SAFE_INTEGER) -
      (secondPreferredOrder ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return first.order - second.order;
}

function getDefaultSectionId(
  visibleSections: DashboardSectionConfig[],
  preferences: DashboardPreferencesConfig | null | undefined
) {
  const preferredSectionId = preferences?.defaultTab;

  if (
    preferredSectionId &&
    visibleSections.some((section) => section.id === preferredSectionId)
  ) {
    return preferredSectionId;
  }

  return visibleSections[0]?.id ?? "";
}

export function DashboardLayout({
  title,
  description,
  statusBar,
  sections,
  widgets,
  preferences,
  onPreferencesSave,
}: {
  title: string;
  description: string;
  statusBar: ReactNode;
  sections: DashboardSectionConfig[];
  widgets: DashboardWidgetConfig[];
  preferences?: DashboardPreferencesConfig | null;
  onPreferencesSave: DashboardPreferencesSaveHandler;
}) {
  const customizePanelId = "dashboard-customize-panel";
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const hiddenWidgetIds = useMemo(() => {
    const allowedWidgetIds = new Set(widgets.map((widget) => widget.id));
    const configuredHiddenWidgets = preferences?.hiddenWidgets ?? [];

    return new Set(
      configuredHiddenWidgets.filter((widgetId) =>
        allowedWidgetIds.has(widgetId)
      )
    );
  }, [preferences, widgets]);

  const preferredWidgetOrder = useMemo(() => {
    const widgetById = new Map(widgets.map((widget) => [widget.id, widget]));
    const order = new Map<string, number>();
    let nextOrder = 0;

    for (const section of sections) {
      const preferredWidgetIds = preferences?.widgetOrder?.[section.id] ?? [];

      for (const widgetId of preferredWidgetIds) {
        const widget = widgetById.get(widgetId);

        if (
          !widget ||
          widget.hidden ||
          widget.sectionId !== section.id ||
          hiddenWidgetIds.has(widget.id) ||
          order.has(widget.id)
        ) {
          continue;
        }

        order.set(widget.id, nextOrder);
        nextOrder += 1;
      }
    }

    return order;
  }, [hiddenWidgetIds, preferences, sections, widgets]);

  const visibleSections = useMemo(
    () =>
      sections.filter((section) =>
        widgets.some(
          (widget) =>
            widget.sectionId === section.id &&
            !widget.hidden &&
            !hiddenWidgetIds.has(widget.id)
        )
      ),
    [hiddenWidgetIds, sections, widgets]
  );
  const defaultSectionId = useMemo(
    () => getDefaultSectionId(visibleSections, preferences),
    [preferences, visibleSections]
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const activeSection =
    visibleSections.find((section) => section.id === selectedSectionId) ??
    visibleSections.find((section) => section.id === defaultSectionId) ??
    visibleSections[0];

  const widgetsBySection = useMemo(() => {
    return visibleSections.reduce<Record<string, DashboardWidgetConfig[]>>((acc, section) => {
      acc[section.id] = widgets
        .filter(
          (widget) =>
            widget.sectionId === section.id &&
            !widget.hidden &&
            !hiddenWidgetIds.has(widget.id)
        )
        .sort((first, second) =>
          compareDashboardWidgets(first, second, preferredWidgetOrder)
        );
      return acc;
    }, {});
  }, [hiddenWidgetIds, preferredWidgetOrder, visibleSections, widgets]);

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    sectionIndex: number
  ) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();

    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      (sectionIndex + direction + visibleSections.length) % visibleSections.length;
    const nextSectionId = visibleSections[nextIndex]?.id ?? "";

    setSelectedSectionId(nextSectionId);
    window.requestAnimationFrame(() => {
      document.getElementById(`dashboard-tab-${nextSectionId}`)?.focus();
    });
  }

  async function handlePreferencesSave(
    nextPreferences: DashboardPreferencesConfig
  ) {
    const savedPreferences = await onPreferencesSave(nextPreferences);
    setSelectedSectionId(null);
    setIsCustomizeOpen(false);
    return savedPreferences;
  }

  const customizeControls = (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          aria-expanded={isCustomizeOpen}
          aria-controls={customizePanelId}
          onClick={() => setIsCustomizeOpen((isOpen) => !isOpen)}
          className="app-button-secondary rounded-full px-4 py-2 text-sm font-bold"
        >
          Personalizar dashboard
        </button>
      </div>

      {isCustomizeOpen ? (
        <DashboardCustomizePanel
          id={customizePanelId}
          sections={sections}
          widgets={widgets}
          preferences={preferences}
          onClose={() => setIsCustomizeOpen(false)}
          onSave={handlePreferencesSave}
        />
      ) : null}
    </>
  );

  if (!activeSection) {
    return (
      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <PageHeader title={title} description={description} />
        <div className="space-y-5">
          {statusBar}
          {customizeControls}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader title={title} description={description} />

      <div className="space-y-5">
        {statusBar}
        {customizeControls}

        <section
          aria-label="Secciones del dashboard"
          className="rounded-[1.5rem] border border-black/8 bg-white/75 p-2 shadow-sm"
        >
          <div
            role="tablist"
            aria-label="Navegación interna del dashboard"
            className="flex gap-2 overflow-x-auto"
          >
            {visibleSections.map((section, index) => {
              const isActive = section.id === activeSection.id;

              return (
                <button
                  key={section.id}
                  id={`dashboard-tab-${section.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`dashboard-panel-${section.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setSelectedSectionId(section.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`min-w-36 rounded-[1.1rem] px-4 py-3 text-left text-sm font-black ${
                    isActive
                      ? "app-button-primary"
                      : "text-[var(--foreground)] hover:bg-black/[0.04]"
                  }`}
                >
                  <span className="block">{section.label}</span>
                  <span
                    className={`mt-1 block text-xs font-semibold ${
                      isActive ? "text-white/80" : "app-muted"
                    }`}
                  >
                    {widgetsBySection[section.id]?.length ?? 0} widgets
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-black">{activeSection.label}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 app-muted">
              {activeSection.description}
            </p>
          </div>

          {visibleSections.map((section) => {
            const sectionWidgets = widgetsBySection[section.id] ?? [];
            const isActive = section.id === activeSection.id;

            return (
              <section
                key={section.id}
                id={`dashboard-panel-${section.id}`}
                role="tabpanel"
                aria-labelledby={`dashboard-tab-${section.id}`}
                hidden={!isActive}
                data-dashboard-section={section.id}
              >
                {sectionWidgets.length === 0 ? (
                  <div className="app-panel rounded-[2rem] p-5 text-sm app-muted">
                    {section.emptyMessage ?? "Sin widgets visibles."}
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-12">
                    {sectionWidgets.map((widget) => (
                      <div
                        key={widget.id}
                        data-dashboard-widget={widget.id}
                        className={widget.className ?? "xl:col-span-12"}
                      >
                        {widget.content}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
