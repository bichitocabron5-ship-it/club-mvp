import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { DashboardRole } from "@/lib/types";

export const DASHBOARD_DEFAULT_TAB = "summary" as const;

export const DASHBOARD_TAB_IDS = ["summary", "operations", "audit"] as const;
export type DashboardTabId = (typeof DASHBOARD_TAB_IDS)[number];

export const ADMIN_DASHBOARD_TAB_IDS = [
  "summary",
  "operations",
  "audit",
] as const satisfies readonly DashboardTabId[];

export const STAFF_DASHBOARD_TAB_IDS = [
  "summary",
  "operations",
] as const satisfies readonly DashboardTabId[];

export const DASHBOARD_WIDGET_DEFINITIONS = [
  { id: "kpi-cards", tabId: "summary", defaultOrder: 10 },
  { id: "quick-actions", tabId: "summary", defaultOrder: 20 },
  { id: "cash", tabId: "operations", defaultOrder: 10, adminOnly: true },
  {
    id: "stock-valuation",
    tabId: "operations",
    defaultOrder: 20,
    adminOnly: true,
  },
  { id: "sales", tabId: "operations", defaultOrder: 30, adminOnly: true },
  { id: "finance", tabId: "operations", defaultOrder: 40, adminOnly: true },
  { id: "access", tabId: "operations", defaultOrder: 50, staffDefaultOrder: 20 },
  { id: "low-stock", tabId: "operations", defaultOrder: 60, staffDefaultOrder: 10 },
  { id: "alerts", tabId: "audit", defaultOrder: 10, adminOnly: true },
  { id: "audit", tabId: "audit", defaultOrder: 20, adminOnly: true },
] as const satisfies ReadonlyArray<{
  id: string;
  tabId: DashboardTabId;
  defaultOrder: number;
  staffDefaultOrder?: number;
  adminOnly?: true;
}>;

export type DashboardWidgetDefinition =
  (typeof DASHBOARD_WIDGET_DEFINITIONS)[number];
export type DashboardWidgetId = DashboardWidgetDefinition["id"];
export type DashboardWidgetOrder = Partial<
  Record<DashboardTabId, DashboardWidgetId[]>
>;

export type DashboardPreferences = {
  defaultTab: DashboardTabId;
  widgetOrder: DashboardWidgetOrder;
  hiddenWidgets: DashboardWidgetId[];
};

export type DashboardPreferencesInput = {
  defaultTab?: unknown;
  widgetOrder?: unknown;
  hiddenWidgets?: unknown;
};

export type DashboardPreferencesUserInput = {
  userId: number | string;
  role: DashboardRole;
};

export type UpsertDashboardPreferencesInput = DashboardPreferencesUserInput & {
  preferences: DashboardPreferencesInput;
};

type DashboardPreferenceScope = {
  tabs: readonly DashboardTabId[];
  tabSet: ReadonlySet<DashboardTabId>;
  widgets: DashboardWidgetDefinition[];
  widgetMap: ReadonlyMap<DashboardWidgetId, DashboardWidgetDefinition>;
};

const dashboardPreferenceSelect = {
  defaultTab: true,
  widgetOrder: true,
  hiddenWidgets: true,
} satisfies Prisma.DashboardPreferenceSelect;

type DashboardPreferenceRecord = Prisma.DashboardPreferenceGetPayload<{
  select: typeof dashboardPreferenceSelect;
}>;

export class DashboardPreferencesServiceError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function isAdminDashboardRole(role: DashboardRole) {
  return role === "ADMIN";
}

function isAdminOnlyWidget(widget: DashboardWidgetDefinition) {
  return "adminOnly" in widget && widget.adminOnly === true;
}

function getDashboardWidgetDefaultOrder(
  widget: DashboardWidgetDefinition,
  isAdmin: boolean
) {
  return isAdmin || !("staffDefaultOrder" in widget)
    ? widget.defaultOrder
    : widget.staffDefaultOrder;
}

function normalizeUserId(userId: number | string) {
  const value = typeof userId === "string" ? Number(userId) : userId;

  if (!Number.isInteger(value) || value <= 0) {
    throw new DashboardPreferencesServiceError("Usuario invalido", 400);
  }

  return value;
}

function getDashboardPreferenceScope(role: DashboardRole): DashboardPreferenceScope {
  const isAdmin = isAdminDashboardRole(role);
  const tabs = isAdmin ? ADMIN_DASHBOARD_TAB_IDS : STAFF_DASHBOARD_TAB_IDS;
  const tabSet = new Set<DashboardTabId>(tabs);
  const widgets = DASHBOARD_WIDGET_DEFINITIONS.filter(
    (widget) => tabSet.has(widget.tabId) && (isAdmin || !isAdminOnlyWidget(widget))
  ).sort(
    (first, second) =>
      getDashboardWidgetDefaultOrder(first, isAdmin) -
      getDashboardWidgetDefaultOrder(second, isAdmin)
  );

  return {
    tabs,
    tabSet,
    widgets,
    widgetMap: new Map(widgets.map((widget) => [widget.id, widget])),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isDashboardTabId(value: string): value is DashboardTabId {
  return (DASHBOARD_TAB_IDS as readonly string[]).includes(value);
}

function createEmptyWidgetOrder(tabs: readonly DashboardTabId[]) {
  const order: DashboardWidgetOrder = {};

  for (const tab of tabs) {
    order[tab] = [];
  }

  return order;
}

function appendWidgetToOrder(
  order: DashboardWidgetOrder,
  widget: DashboardWidgetDefinition
) {
  const tabOrder = order[widget.tabId];

  if (tabOrder) {
    tabOrder.push(widget.id);
  }
}

function normalizeWidgetOrder(
  value: unknown,
  scope: DashboardPreferenceScope
): DashboardWidgetOrder {
  const order = createEmptyWidgetOrder(scope.tabs);
  const seenWidgetIds = new Set<DashboardWidgetId>();

  if (isRecord(value)) {
    for (const tab of scope.tabs) {
      for (const rawWidgetId of readStringList(value[tab])) {
        const widget = scope.widgetMap.get(rawWidgetId as DashboardWidgetId);

        if (!widget || widget.tabId !== tab || seenWidgetIds.has(widget.id)) {
          continue;
        }

        appendWidgetToOrder(order, widget);
        seenWidgetIds.add(widget.id);
      }
    }
  } else {
    for (const rawWidgetId of readStringList(value)) {
      const widget = scope.widgetMap.get(rawWidgetId as DashboardWidgetId);

      if (!widget || seenWidgetIds.has(widget.id)) {
        continue;
      }

      appendWidgetToOrder(order, widget);
      seenWidgetIds.add(widget.id);
    }
  }

  for (const widget of scope.widgets) {
    if (seenWidgetIds.has(widget.id)) {
      continue;
    }

    appendWidgetToOrder(order, widget);
  }

  return order;
}

function normalizeHiddenWidgets(
  value: unknown,
  scope: DashboardPreferenceScope
): DashboardWidgetId[] {
  const hiddenWidgets: DashboardWidgetId[] = [];
  const seenWidgetIds = new Set<DashboardWidgetId>();

  for (const rawWidgetId of readStringList(value)) {
    const widget = scope.widgetMap.get(rawWidgetId as DashboardWidgetId);

    if (!widget || seenWidgetIds.has(widget.id)) {
      continue;
    }

    hiddenWidgets.push(widget.id);
    seenWidgetIds.add(widget.id);
  }

  return hiddenWidgets;
}

function tabHasVisibleWidgets(
  tab: DashboardTabId,
  widgetOrder: DashboardWidgetOrder,
  hiddenWidgetIds: ReadonlySet<DashboardWidgetId>
) {
  return (widgetOrder[tab] ?? []).some(
    (widgetId) => !hiddenWidgetIds.has(widgetId)
  );
}

function normalizeDefaultTab(
  value: unknown,
  scope: DashboardPreferenceScope,
  widgetOrder: DashboardWidgetOrder,
  hiddenWidgets: DashboardWidgetId[]
): DashboardTabId {
  const rawTab = typeof value === "string" ? value.trim() : "";
  const candidate =
    isDashboardTabId(rawTab) && scope.tabSet.has(rawTab)
      ? rawTab
      : DASHBOARD_DEFAULT_TAB;
  const hiddenWidgetIds = new Set(hiddenWidgets);

  if (tabHasVisibleWidgets(candidate, widgetOrder, hiddenWidgetIds)) {
    return candidate;
  }

  return (
    scope.tabs.find((tab) =>
      tabHasVisibleWidgets(tab, widgetOrder, hiddenWidgetIds)
    ) ?? DASHBOARD_DEFAULT_TAB
  );
}

function mergeDashboardPreferencesInput(
  base: DashboardPreferencesInput,
  input: DashboardPreferencesInput
): DashboardPreferencesInput {
  return {
    defaultTab:
      input.defaultTab !== undefined ? input.defaultTab : base.defaultTab,
    widgetOrder:
      input.widgetOrder !== undefined ? input.widgetOrder : base.widgetOrder,
    hiddenWidgets:
      input.hiddenWidgets !== undefined
        ? input.hiddenWidgets
        : base.hiddenWidgets,
  };
}

function recordToPreferencesInput(
  record: DashboardPreferenceRecord
): DashboardPreferencesInput {
  return {
    defaultTab: record.defaultTab,
    widgetOrder: record.widgetOrder,
    hiddenWidgets: record.hiddenWidgets,
  };
}

export function getDefaultDashboardPreferences(
  role: DashboardRole
): DashboardPreferences {
  const scope = getDashboardPreferenceScope(role);

  return {
    defaultTab: DASHBOARD_DEFAULT_TAB,
    widgetOrder: normalizeWidgetOrder(undefined, scope),
    hiddenWidgets: [],
  };
}

export function normalizeDashboardPreferences(
  input: DashboardPreferencesInput | null | undefined,
  role: DashboardRole
): DashboardPreferences {
  if (!input || !isRecord(input)) {
    return getDefaultDashboardPreferences(role);
  }

  const scope = getDashboardPreferenceScope(role);
  const widgetOrder = normalizeWidgetOrder(input.widgetOrder, scope);
  const hiddenWidgets = normalizeHiddenWidgets(input.hiddenWidgets, scope);

  return {
    defaultTab: normalizeDefaultTab(
      input.defaultTab,
      scope,
      widgetOrder,
      hiddenWidgets
    ),
    widgetOrder,
    hiddenWidgets,
  };
}

export async function getDashboardPreferences({
  userId,
  role,
}: DashboardPreferencesUserInput): Promise<DashboardPreferences> {
  const normalizedUserId = normalizeUserId(userId);
  const preference = await prisma.dashboardPreference.findUnique({
    where: {
      userId: normalizedUserId,
    },
    select: dashboardPreferenceSelect,
  });

  if (!preference) {
    return getDefaultDashboardPreferences(role);
  }

  return normalizeDashboardPreferences(
    recordToPreferencesInput(preference),
    role
  );
}

export async function upsertDashboardPreferences({
  userId,
  role,
  preferences,
}: UpsertDashboardPreferencesInput): Promise<DashboardPreferences> {
  const normalizedUserId = normalizeUserId(userId);
  const currentPreference = await prisma.dashboardPreference.findUnique({
    where: {
      userId: normalizedUserId,
    },
    select: dashboardPreferenceSelect,
  });
  const basePreferences = currentPreference
    ? recordToPreferencesInput(currentPreference)
    : getDefaultDashboardPreferences(role);
  const normalizedPreferences = normalizeDashboardPreferences(
    mergeDashboardPreferencesInput(basePreferences, preferences),
    role
  );
  const savedPreference = await prisma.dashboardPreference.upsert({
    where: {
      userId: normalizedUserId,
    },
    create: {
      userId: normalizedUserId,
      defaultTab: normalizedPreferences.defaultTab,
      widgetOrder: normalizedPreferences.widgetOrder as Prisma.InputJsonValue,
      hiddenWidgets:
        normalizedPreferences.hiddenWidgets as Prisma.InputJsonValue,
    },
    update: {
      defaultTab: normalizedPreferences.defaultTab,
      widgetOrder: normalizedPreferences.widgetOrder as Prisma.InputJsonValue,
      hiddenWidgets:
        normalizedPreferences.hiddenWidgets as Prisma.InputJsonValue,
    },
    select: dashboardPreferenceSelect,
  });

  return normalizeDashboardPreferences(
    recordToPreferencesInput(savedPreference),
    role
  );
}
