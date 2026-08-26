"use client";

import { useMemo, useState } from "react";

import type {
  DashboardPreferencesConfig,
  DashboardSectionConfig,
  DashboardWidgetConfig,
} from "@/components/dashboard/dashboard-layout";

type DashboardCustomizeDraft = {
  defaultTab: string;
  widgetOrder: Record<string, string[]>;
  hiddenWidgets: string[];
};

const dashboardWidgetLabels: Record<string, string> = {
  "kpi-cards": "Indicadores",
  "quick-actions": "Accesos directos",
  cash: "Caja",
  "stock-valuation": "Valoracion de stock",
  sales: "Ventas",
  finance: "Finanzas",
  access: "Accesos",
  "low-stock": "Stock bajo",
  alerts: "Alertas",
  audit: "Auditoria",
};

function getWidgetLabel(widgetId: string) {
  return dashboardWidgetLabels[widgetId] ?? widgetId;
}

function getOrderedWidgetIds(
  section: DashboardSectionConfig,
  widgets: DashboardWidgetConfig[],
  preferences: DashboardPreferencesConfig | null | undefined
) {
  const sectionWidgets = widgets
    .filter((widget) => widget.sectionId === section.id && !widget.hidden)
    .sort((first, second) => first.order - second.order);
  const sectionWidgetIds = new Set(sectionWidgets.map((widget) => widget.id));
  const orderedWidgetIds: string[] = [];

  for (const widgetId of preferences?.widgetOrder?.[section.id] ?? []) {
    if (sectionWidgetIds.has(widgetId) && !orderedWidgetIds.includes(widgetId)) {
      orderedWidgetIds.push(widgetId);
    }
  }

  for (const widget of sectionWidgets) {
    if (!orderedWidgetIds.includes(widget.id)) {
      orderedWidgetIds.push(widget.id);
    }
  }

  return orderedWidgetIds;
}

function buildDefaultPreferences(
  sections: DashboardSectionConfig[],
  widgets: DashboardWidgetConfig[]
): DashboardPreferencesConfig {
  return {
    defaultTab: sections[0]?.id ?? "",
    widgetOrder: Object.fromEntries(
      sections.map((section) => [
        section.id,
        getOrderedWidgetIds(section, widgets, null),
      ])
    ),
    hiddenWidgets: [],
  };
}

function buildCustomizeDraft({
  sections,
  widgets,
  preferences,
}: {
  sections: DashboardSectionConfig[];
  widgets: DashboardWidgetConfig[];
  preferences: DashboardPreferencesConfig | null | undefined;
}): DashboardCustomizeDraft {
  const sectionIds = new Set(sections.map((section) => section.id));
  const allowedWidgetIds = new Set(
    widgets
      .filter((widget) => !widget.hidden)
      .map((widget) => widget.id)
  );
  const defaultPreferences = buildDefaultPreferences(sections, widgets);
  const defaultTab =
    preferences?.defaultTab && sectionIds.has(preferences.defaultTab)
      ? preferences.defaultTab
      : defaultPreferences.defaultTab ?? "";

  return {
    defaultTab,
    widgetOrder: Object.fromEntries(
      sections.map((section) => [
        section.id,
        getOrderedWidgetIds(section, widgets, preferences),
      ])
    ),
    hiddenWidgets: (preferences?.hiddenWidgets ?? []).filter((widgetId) =>
      allowedWidgetIds.has(widgetId)
    ),
  };
}

function moveWidget(
  widgetOrder: Record<string, string[]>,
  sectionId: string,
  widgetId: string,
  direction: -1 | 1
) {
  const currentOrder = widgetOrder[sectionId] ?? [];
  const currentIndex = currentOrder.indexOf(widgetId);
  const nextIndex = currentIndex + direction;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) {
    return widgetOrder;
  }

  const nextOrder = [...currentOrder];
  [nextOrder[currentIndex], nextOrder[nextIndex]] = [
    nextOrder[nextIndex],
    nextOrder[currentIndex],
  ];

  return {
    ...widgetOrder,
    [sectionId]: nextOrder,
  };
}

function toPreferencesConfig(
  draft: DashboardCustomizeDraft
): DashboardPreferencesConfig {
  return {
    defaultTab: draft.defaultTab,
    widgetOrder: draft.widgetOrder,
    hiddenWidgets: draft.hiddenWidgets,
  };
}

export function DashboardCustomizePanel({
  id,
  sections,
  widgets,
  preferences,
  onClose,
  onSave,
}: {
  id: string;
  sections: DashboardSectionConfig[];
  widgets: DashboardWidgetConfig[];
  preferences: DashboardPreferencesConfig | null | undefined;
  onClose: () => void;
  onSave: (
    preferences: DashboardPreferencesConfig
  ) => Promise<DashboardPreferencesConfig | null>;
}) {
  const defaultPreferences = useMemo(
    () => buildDefaultPreferences(sections, widgets),
    [sections, widgets]
  );
  const widgetById = useMemo(
    () => new Map(widgets.map((widget) => [widget.id, widget])),
    [widgets]
  );
  const [draft, setDraft] = useState(() =>
    buildCustomizeDraft({ sections, widgets, preferences })
  );
  const [saveError, setSaveError] = useState("");
  const [savingAction, setSavingAction] = useState<"save" | "reset" | null>(
    null
  );

  const hiddenWidgetIds = useMemo(
    () => new Set(draft.hiddenWidgets),
    [draft.hiddenWidgets]
  );

  async function savePreferences(
    nextPreferences: DashboardPreferencesConfig,
    action: "save" | "reset"
  ) {
    setSavingAction(action);
    setSaveError("");

    try {
      await onSave(nextPreferences);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar las preferencias"
      );
    } finally {
      setSavingAction(null);
    }
  }

  function handleWidgetVisibilityChange(widgetId: string, visible: boolean) {
    setDraft((currentDraft) => {
      const currentHiddenWidgets = new Set(currentDraft.hiddenWidgets);

      if (visible) {
        currentHiddenWidgets.delete(widgetId);
      } else {
        currentHiddenWidgets.add(widgetId);
      }

      return {
        ...currentDraft,
        hiddenWidgets: Array.from(currentHiddenWidgets),
      };
    });
  }

  function handleMoveWidget(
    sectionId: string,
    widgetId: string,
    direction: -1 | 1
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      widgetOrder: moveWidget(
        currentDraft.widgetOrder,
        sectionId,
        widgetId,
        direction
      ),
    }));
  }

  const isSaving = savingAction !== null;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="app-panel-strong rounded-[2rem] p-4 md:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-black">
            Personalizar dashboard
          </h2>
          <p className="mt-1 text-sm app-muted">
            Preferencias visibles para tu usuario en este panel.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="app-button-secondary w-full rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <label className="text-sm font-bold">
          Pestaña inicial
          <select
            value={draft.defaultTab}
            onChange={(event) =>
              setDraft((currentDraft) => ({
                ...currentDraft,
                defaultTab: event.target.value,
              }))
            }
            disabled={isSaving}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white/85 px-3 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 xl:grid-cols-3">
          {sections.map((section) => {
            const sectionWidgetIds = draft.widgetOrder[section.id] ?? [];

            return (
              <section
                key={section.id}
                aria-labelledby={`${id}-${section.id}-title`}
                className="rounded-[1.5rem] border border-black/10 bg-white/70 p-3"
              >
                <h3
                  id={`${id}-${section.id}-title`}
                  className="text-sm font-black"
                >
                  {section.label}
                </h3>

                <div className="mt-3 space-y-2">
                  {sectionWidgetIds.map((widgetId, index) => {
                    const widget = widgetById.get(widgetId);
                    const label = getWidgetLabel(widgetId);
                    const isVisible = !hiddenWidgetIds.has(widgetId);
                    const checkboxId = `${id}-${section.id}-${widgetId}`;

                    if (!widget) {
                      return null;
                    }

                    return (
                      <div
                        key={widgetId}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-3 py-2"
                      >
                        <label
                          htmlFor={checkboxId}
                          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            checked={isVisible}
                            onChange={(event) =>
                              handleWidgetVisibilityChange(
                                widgetId,
                                event.target.checked
                              )
                            }
                            disabled={isSaving}
                            className="h-4 w-4 shrink-0 accent-emerald-700 disabled:cursor-not-allowed"
                          />
                          <span className="min-w-0 break-words">{label}</span>
                        </label>

                        <button
                          type="button"
                          onClick={() =>
                            handleMoveWidget(section.id, widgetId, -1)
                          }
                          disabled={isSaving || index === 0}
                          aria-label={`Subir ${label}`}
                          className="min-h-9 min-w-9 rounded-full border border-black/10 px-2 py-1 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleMoveWidget(section.id, widgetId, 1)
                          }
                          disabled={
                            isSaving || index === sectionWidgetIds.length - 1
                          }
                          aria-label={`Bajar ${label}`}
                          className="min-h-9 min-w-9 rounded-full border border-black/10 px-2 py-1 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↓
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {saveError ? (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900"
        >
          {saveError}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={() => void savePreferences(defaultPreferences, "reset")}
          disabled={isSaving}
          className="app-button-secondary w-full rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {savingAction === "reset"
            ? "Restaurando..."
            : "Restaurar por defecto"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="w-full rounded-full px-4 py-2 text-sm font-bold hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() =>
            void savePreferences(toPreferencesConfig(draft), "save")
          }
          disabled={isSaving}
          className="app-button-primary w-full rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {savingAction === "save" ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </section>
  );
}
