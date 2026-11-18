import { CompanyType, MileageEntry, MonthModule, WeekClosure } from '../types';
import { buildMonthId, buildWeekId, generateSafeId } from './validation';

const STORAGE_PREFIX = 'corp_km_local_v1';

interface LocalMonthStore {
  monthModule: MonthModule;
  weeks: Record<number, WeekClosure>;
  entriesById: Record<string, MileageEntry>;
}

function getStorageKey(year: number, month: number): string {
  return `${STORAGE_PREFIX}_${buildMonthId(year, month)}`;
}

export function loadLocalMonthStore(year: number, month: number): LocalMonthStore {
  const monthId = buildMonthId(year, month);
  const key = getStorageKey(year, month);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalMonthStore;
      if (parsed && parsed.monthModule && parsed.weeks && parsed.entriesById) {
        return parsed;
      }
    }
  } catch {
    // Fallback to clean initial month state
  }

  return {
    monthModule: {
      workspaceId: 'local_workspace',
      monthId,
      year,
      month,
      activeWeekNumber: 1,
      totalWeeks: 1,
      createdBy: 'local_user',
    },
    weeks: {
      1: {
        workspaceId: 'local_workspace',
        monthId,
        weekId: 'W1',
        weekNumber: 1,
        isLocked: false,
        lockedTotalV1: 0,
        lockedTotalUP: 0,
        entryIds: [],
        createdBy: 'local_user',
      },
    },
    entriesById: {},
  };
}

export function saveLocalMonthStore(year: number, month: number, store: LocalMonthStore): void {
  const key = getStorageKey(year, month);
  localStorage.setItem(key, JSON.stringify(store));
}

export function addLocalEntry(
  store: LocalMonthStore,
  params: {
    company: CompanyType;
    dateDisplay: string;
    dateSortKey: string;
    kmStart: number;
    kmEnd: number;
    description: string;
  },
): { nextStore: LocalMonthStore; entryId: string } {
  const weekNumber = store.monthModule.activeWeekNumber;
  const weekId = buildWeekId(weekNumber);
  const entryId = generateSafeId('km', 12);
  const kmResult = Math.round((params.kmEnd - params.kmStart) * 100) / 100;

  const entry: MileageEntry = {
    id: entryId,
    workspaceId: 'local_workspace',
    monthId: store.monthModule.monthId,
    weekId,
    weekNumber,
    company: params.company,
    dateDisplay: params.dateDisplay,
    dateSortKey: params.dateSortKey,
    kmStart: params.kmStart,
    kmEnd: params.kmEnd,
    kmResult,
    description: params.description,
    createdBy: 'local_user',
    authorName: 'Modo Local',
  };

  const currentWeek = store.weeks[weekNumber];
  const nextStore: LocalMonthStore = {
    ...store,
    weeks: {
      ...store.weeks,
      [weekNumber]: {
        ...currentWeek,
        entryIds: [...currentWeek.entryIds, entryId],
      },
    },
    entriesById: {
      ...store.entriesById,
      [entryId]: entry,
    },
  };

  saveLocalMonthStore(store.monthModule.year, store.monthModule.month, nextStore);
  return { nextStore, entryId };
}

export function updateLocalEntry(
  store: LocalMonthStore,
  params: {
    entryId: string;
    company: CompanyType;
    dateDisplay: string;
    dateSortKey: string;
    kmStart: number;
    kmEnd: number;
    description: string;
  },
): LocalMonthStore {
  const existing = store.entriesById[params.entryId];
  if (!existing) return store;

  const kmResult = Math.round((params.kmEnd - params.kmStart) * 100) / 100;
  const nextStore: LocalMonthStore = {
    ...store,
    entriesById: {
      ...store.entriesById,
      [params.entryId]: {
        ...existing,
        company: params.company,
        dateDisplay: params.dateDisplay,
        dateSortKey: params.dateSortKey,
        kmStart: params.kmStart,
        kmEnd: params.kmEnd,
        kmResult,
        description: params.description,
      },
    },
  };

  saveLocalMonthStore(store.monthModule.year, store.monthModule.month, nextStore);
  return nextStore;
}

export function deleteLocalEntry(store: LocalMonthStore, entry: MileageEntry): LocalMonthStore {
  const nextEntries = { ...store.entriesById };
  delete nextEntries[entry.id];

  const targetWeek = store.weeks[entry.weekNumber];
  const nextStore: LocalMonthStore = {
    ...store,
    weeks: {
      ...store.weeks,
      [entry.weekNumber]: {
        ...targetWeek,
        entryIds: targetWeek.entryIds.filter((id) => id !== entry.id),
      },
    },
    entriesById: nextEntries,
  };

  saveLocalMonthStore(store.monthModule.year, store.monthModule.month, nextStore);
  return nextStore;
}

export function closeLocalWeek(
  store: LocalMonthStore,
  totalV1ForWeek: number,
  totalUPForWeek: number,
): LocalMonthStore {
  const weekToClose = store.monthModule.activeWeekNumber;
  const totalWeeks = store.monthModule.totalWeeks;

  const nextWeeks: Record<number, WeekClosure> = {
    ...store.weeks,
    [weekToClose]: {
      ...store.weeks[weekToClose],
      isLocked: true,
      lockedTotalV1: Math.round(totalV1ForWeek * 100) / 100,
      lockedTotalUP: Math.round(totalUPForWeek * 100) / 100,
    },
  };

  let nextActiveWeek = weekToClose;
  let nextTotalWeeks = totalWeeks;

  let existingOpen: number | null = null;
  for (let w = totalWeeks; w >= 1; w--) {
    if (w !== weekToClose && nextWeeks[w] && !nextWeeks[w].isLocked) {
      existingOpen = w;
      break;
    }
  }

  if (existingOpen !== null) {
    nextActiveWeek = existingOpen;
  } else if (totalWeeks < 12) {
    nextTotalWeeks = totalWeeks + 1;
    nextActiveWeek = nextTotalWeeks;
    nextWeeks[nextTotalWeeks] = {
      workspaceId: 'local_workspace',
      monthId: store.monthModule.monthId,
      weekId: buildWeekId(nextTotalWeeks),
      weekNumber: nextTotalWeeks,
      isLocked: false,
      lockedTotalV1: 0,
      lockedTotalUP: 0,
      entryIds: [],
      createdBy: 'local_user',
    };
  }

  const nextStore: LocalMonthStore = {
    ...store,
    monthModule: {
      ...store.monthModule,
      activeWeekNumber: nextActiveWeek,
      totalWeeks: nextTotalWeeks,
    },
    weeks: nextWeeks,
  };

  saveLocalMonthStore(store.monthModule.year, store.monthModule.month, nextStore);
  return nextStore;
}

export function reopenLocalWeek(store: LocalMonthStore, weekNumber: number): LocalMonthStore {
  const nextStore: LocalMonthStore = {
    ...store,
    monthModule: {
      ...store.monthModule,
      activeWeekNumber: weekNumber,
    },
    weeks: {
      ...store.weeks,
      [weekNumber]: {
        ...store.weeks[weekNumber],
        isLocked: false,
      },
    },
  };

  saveLocalMonthStore(store.monthModule.year, store.monthModule.month, nextStore);
  return nextStore;
}
