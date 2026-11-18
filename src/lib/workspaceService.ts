import { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import {
  CompanyType,
  MileageEntry,
  MonthModule,
  WeekClosure,
  Workspace,
  WorkspaceMember,
} from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  buildMonthId,
  buildWeekId,
  generateInviteCode,
  generateSafeId,
  sanitizeAuthorName,
  VALIDATION_LIMITS,
} from './validation';

/**
 * Bootstraps or resolves the user's active corporate workspace, handling 1-click invite links
 * (e.g. ?painel=ws_xxx&convite=CODE) so collaborators like a manager/boss join seamlessly.
 */
export async function resolveOrCreateWorkspace(
  user: User,
  inviteParams?: { workspaceId: string; inviteCode: string } | null,
): Promise<string> {
  const authorName = sanitizeAuthorName(user.displayName || user.email?.split('@')[0]);

  // 1. Handle incoming team invite link if present
  if (
    inviteParams &&
    VALIDATION_LIMITS.safeIdRegex.test(inviteParams.workspaceId) &&
    VALIDATION_LIMITS.safeIdRegex.test(inviteParams.inviteCode)
  ) {
    const targetWsId = inviteParams.workspaceId;
    const memberPath = `workspaces/${targetWsId}/members/${user.uid}`;
    let alreadyMember = false;

    try {
      const existingMemberSnap = await getDoc(doc(db, memberPath));
      alreadyMember = existingMemberSnap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, memberPath);
    }

    if (!alreadyMember) {
      try {
        await setDoc(doc(db, memberPath), {
          workspaceId: targetWsId,
          userId: user.uid,
          displayName: authorName,
          role: 'editor',
          inviteCodeUsed: inviteParams.inviteCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, memberPath);
      }

      // Append new collaborator UID to workspace memberIds roster
      const wsPath = `workspaces/${targetWsId}`;
      try {
        const wsSnap = await getDoc(doc(db, wsPath));
        if (wsSnap.exists()) {
          const currentIds: string[] = Array.isArray(wsSnap.data().memberIds)
            ? wsSnap.data().memberIds
            : [];
          if (!currentIds.includes(user.uid) && currentIds.length < 10) {
            await updateDoc(doc(db, wsPath), {
              memberIds: [...currentIds, user.uid],
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, wsPath);
      }
    }

    // Persist activeWorkspaceId in userSettings
    const settingsPath = `userSettings/${user.uid}`;
    try {
      const settingsSnap = await getDoc(doc(db, settingsPath));
      if (settingsSnap.exists()) {
        await updateDoc(doc(db, settingsPath), {
          activeWorkspaceId: targetWsId,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, settingsPath), {
          userId: user.uid,
          activeWorkspaceId: targetWsId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, settingsPath);
    }

    return targetWsId;
  }

  // 2. Check existing userSettings pointer
  const settingsPath = `userSettings/${user.uid}`;
  let existingWorkspaceId: string | null = null;
  let hasSettingsDoc = false;

  try {
    const settingsSnap = await getDoc(doc(db, settingsPath));
    if (settingsSnap.exists()) {
      hasSettingsDoc = true;
      existingWorkspaceId = settingsSnap.data().activeWorkspaceId || null;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, settingsPath);
  }

  if (existingWorkspaceId) {
    // Verify user is still an authorized member of that workspace
    const memberCheckPath = `workspaces/${existingWorkspaceId}/members/${user.uid}`;
    try {
      const memberSnap = await getDoc(doc(db, memberCheckPath));
      if (memberSnap.exists()) {
        return existingWorkspaceId;
      }
    } catch {
      // Membership was revoked; create a fresh workspace below
    }
  }

  // 3. Provision a brand-new Corporate Workspace atomically
  const newWorkspaceId = generateSafeId('ws', 14);
  const inviteCode = generateInviteCode();
  const batch = writeBatch(db);

  batch.set(doc(db, 'workspaces', newWorkspaceId), {
    name: 'Controle Corporativo V1 & UP',
    ownerId: user.uid,
    inviteCode,
    memberIds: [user.uid],
    spreadsheetId: '',
    spreadsheetUrl: '',
    spreadsheetTitle: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'workspaces', newWorkspaceId, 'members', user.uid), {
    workspaceId: newWorkspaceId,
    userId: user.uid,
    displayName: authorName,
    role: 'owner',
    inviteCodeUsed: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (hasSettingsDoc) {
    batch.update(doc(db, settingsPath), {
      activeWorkspaceId: newWorkspaceId,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(doc(db, settingsPath), {
      userId: user.uid,
      activeWorkspaceId: newWorkspaceId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workspaces/${newWorkspaceId}`);
  }

  return newWorkspaceId;
}

/**
 * Joins an existing corporate workspace manually using Workspace ID + Invite Code.
 */
export async function joinWorkspaceManually(
  user: User,
  workspaceId: string,
  inviteCode: string,
): Promise<string> {
  return resolveOrCreateWorkspace(user, {
    workspaceId: workspaceId.trim(),
    inviteCode: inviteCode.trim(),
  });
}

/**
 * Ensures the MonthModule (YYYY_MM) and its initial Week 1 (W1) exist in Firestore.
 */
export async function ensureMonthInitialized(
  workspaceId: string,
  year: number,
  month: number,
  userUid: string,
): Promise<void> {
  const monthId = buildMonthId(year, month);
  const monthPath = `workspaces/${workspaceId}/months/${monthId}`;
  const week1Path = `workspaces/${workspaceId}/months/${monthId}/weeks/W1`;

  let monthExists = false;
  let week1Exists = false;

  try {
    const [mSnap, wSnap] = await Promise.all([
      getDoc(doc(db, monthPath)),
      getDoc(doc(db, week1Path)),
    ]);
    monthExists = mSnap.exists();
    week1Exists = wSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, monthPath);
  }

  if (monthExists && week1Exists) {
    return;
  }

  const batch = writeBatch(db);
  if (!monthExists) {
    batch.set(doc(db, monthPath), {
      workspaceId,
      monthId,
      year,
      month,
      activeWeekNumber: 1,
      totalWeeks: 1,
      createdBy: userUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  if (!week1Exists) {
    batch.set(doc(db, week1Path), {
      workspaceId,
      monthId,
      weekId: 'W1',
      weekNumber: 1,
      isLocked: false,
      lockedTotalV1: 0,
      lockedTotalUP: 0,
      entryIds: [],
      createdBy: userUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, monthPath);
  }
}

/**
 * Adds a new mileage record into the currently open week of the selected month.
 */
export async function addMileageEntry(params: {
  workspaceId: string;
  year: number;
  month: number;
  weekNumber: number;
  existingEntryIds: string[];
  company: CompanyType;
  dateDisplay: string;
  dateSortKey: string;
  kmStart: number;
  kmEnd: number;
  description: string;
  user: User;
}): Promise<string> {
  const {
    workspaceId,
    year,
    month,
    weekNumber,
    existingEntryIds,
    company,
    dateDisplay,
    dateSortKey,
    kmStart,
    kmEnd,
    description,
    user,
  } = params;

  if (existingEntryIds.length >= VALIDATION_LIMITS.maxEntriesPerWeek) {
    throw new Error(
      `Limite de ${VALIDATION_LIMITS.maxEntriesPerWeek} registros por semana atingido. Feche a semana atual para abrir a próxima.`,
    );
  }

  const monthId = buildMonthId(year, month);
  const weekId = buildWeekId(weekNumber);
  const entryId = generateSafeId('km', 14);
  const kmResult = Math.round((kmEnd - kmStart) * 100) / 100;
  const authorName = sanitizeAuthorName(user.displayName || user.email?.split('@')[0]);
  const cleanDescription = description.trim().slice(0, VALIDATION_LIMITS.descriptionMaxLength);

  const entryPath = `workspaces/${workspaceId}/months/${monthId}/entries/${entryId}`;
  const weekPath = `workspaces/${workspaceId}/months/${monthId}/weeks/${weekId}`;

  const batch = writeBatch(db);
  batch.set(doc(db, entryPath), {
    workspaceId,
    monthId,
    weekId,
    weekNumber,
    company,
    dateDisplay,
    dateSortKey,
    kmStart,
    kmEnd,
    kmResult,
    description: cleanDescription,
    createdBy: user.uid,
    authorName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, weekPath), {
    entryIds: [...existingEntryIds, entryId],
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, entryPath);
  }

  return entryId;
}

/**
 * Updates an existing mileage record in an open week.
 */
export async function updateMileageEntry(params: {
  workspaceId: string;
  monthId: string;
  entryId: string;
  company: CompanyType;
  dateDisplay: string;
  dateSortKey: string;
  kmStart: number;
  kmEnd: number;
  description: string;
  user: User;
}): Promise<void> {
  const {
    workspaceId,
    monthId,
    entryId,
    company,
    dateDisplay,
    dateSortKey,
    kmStart,
    kmEnd,
    description,
    user,
  } = params;

  const entryPath = `workspaces/${workspaceId}/months/${monthId}/entries/${entryId}`;
  const kmResult = Math.round((kmEnd - kmStart) * 100) / 100;
  const authorName = sanitizeAuthorName(user.displayName || user.email?.split('@')[0]);
  const cleanDescription = description.trim().slice(0, VALIDATION_LIMITS.descriptionMaxLength);

  try {
    await updateDoc(doc(db, entryPath), {
      company,
      dateDisplay,
      dateSortKey,
      kmStart,
      kmEnd,
      kmResult,
      description: cleanDescription,
      authorName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, entryPath);
  }
}

/**
 * Deletes an existing mileage record from an open week and removes its ID from the week index.
 */
export async function deleteMileageEntry(params: {
  workspaceId: string;
  monthId: string;
  weekId: string;
  entryId: string;
  existingEntryIds: string[];
}): Promise<void> {
  const { workspaceId, monthId, weekId, entryId, existingEntryIds } = params;
  const entryPath = `workspaces/${workspaceId}/months/${monthId}/entries/${entryId}`;
  const weekPath = `workspaces/${workspaceId}/months/${monthId}/weeks/${weekId}`;

  const batch = writeBatch(db);
  batch.delete(doc(db, entryPath));
  batch.update(doc(db, weekPath), {
    entryIds: existingEntryIds.filter((id) => id !== entryId),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, entryPath);
  }
}

/**
 * Closes the currently active week, locks its V1 & UP totals, and automatically opens the next week
 * (or switches back to an already existing open week if this was a reopened historical week).
 */
export async function closeActiveWeek(params: {
  workspaceId: string;
  monthModule: MonthModule;
  weeksMap: Record<number, WeekClosure>;
  weekNumberToClose: number;
  totalV1ForWeek: number;
  totalUPForWeek: number;
  userUid: string;
}): Promise<void> {
  const {
    workspaceId,
    monthModule,
    weeksMap,
    weekNumberToClose,
    totalV1ForWeek,
    totalUPForWeek,
    userUid,
  } = params;

  const { monthId, totalWeeks } = monthModule;
  const weekId = buildWeekId(weekNumberToClose);
  const weekPath = `workspaces/${workspaceId}/months/${monthId}/weeks/${weekId}`;
  const monthPath = `workspaces/${workspaceId}/months/${monthId}`;

  const batch = writeBatch(db);

  // 1. Lock the current week with fixed V1 and UP totals
  batch.update(doc(db, weekPath), {
    isLocked: true,
    lockedTotalV1: Math.round(totalV1ForWeek * 100) / 100,
    lockedTotalUP: Math.round(totalUPForWeek * 100) / 100,
    updatedAt: serverTimestamp(),
  });

  // 2. Check if another existing week is already unlocked (e.g. after closing a temporarily reopened week)
  let existingOpenWeek: number | null = null;
  for (let w = totalWeeks; w >= 1; w--) {
    if (w !== weekNumberToClose && weeksMap[w] && !weeksMap[w].isLocked) {
      existingOpenWeek = w;
      break;
    }
  }

  if (existingOpenWeek !== null) {
    batch.update(doc(db, monthPath), {
      activeWeekNumber: existingOpenWeek,
      totalWeeks,
      updatedAt: serverTimestamp(),
    });
  } else if (totalWeeks < VALIDATION_LIMITS.maxWeeksPerMonth) {
    // 3. Create and open the next sequential week automatically
    const nextWeekNumber = totalWeeks + 1;
    const nextWeekId = buildWeekId(nextWeekNumber);
    const nextWeekPath = `workspaces/${workspaceId}/months/${monthId}/weeks/${nextWeekId}`;

    batch.set(doc(db, nextWeekPath), {
      workspaceId,
      monthId,
      weekId: nextWeekId,
      weekNumber: nextWeekNumber,
      isLocked: false,
      lockedTotalV1: 0,
      lockedTotalUP: 0,
      entryIds: [],
      createdBy: userUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, monthPath), {
      activeWeekNumber: nextWeekNumber,
      totalWeeks: nextWeekNumber,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, weekPath);
  }
}

/**
 * Reopens a previously closed week for adjustments and sets it as the active week.
 */
export async function reopenClosedWeek(params: {
  workspaceId: string;
  monthModule: MonthModule;
  weekNumberToReopen: number;
}): Promise<void> {
  const { workspaceId, monthModule, weekNumberToReopen } = params;
  const { monthId, totalWeeks } = monthModule;
  const weekId = buildWeekId(weekNumberToReopen);
  const weekPath = `workspaces/${workspaceId}/months/${monthId}/weeks/${weekId}`;
  const monthPath = `workspaces/${workspaceId}/months/${monthId}`;

  const batch = writeBatch(db);
  batch.update(doc(db, weekPath), {
    isLocked: false,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, monthPath), {
    activeWeekNumber: weekNumberToReopen,
    totalWeeks,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, weekPath);
  }
}

/**
 * Updates the linked Google Sheets reference on the shared workspace.
 */
export async function updateWorkspaceSpreadsheet(params: {
  workspaceId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
}): Promise<void> {
  const { workspaceId, spreadsheetId, spreadsheetUrl, spreadsheetTitle } = params;
  const wsPath = `workspaces/${workspaceId}`;

  try {
    await updateDoc(doc(db, wsPath), {
      spreadsheetId: spreadsheetId.slice(0, VALIDATION_LIMITS.spreadsheetIdMaxLength),
      spreadsheetUrl: spreadsheetUrl.slice(0, VALIDATION_LIMITS.spreadsheetUrlMaxLength),
      spreadsheetTitle: spreadsheetTitle.slice(0, VALIDATION_LIMITS.spreadsheetTitleMaxLength),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, wsPath);
  }
}

/**
 * Updates workspace name or rotates invite code (owner only).
 */
export async function updateWorkspaceAdminSettings(params: {
  workspace: Workspace;
  name: string;
  rotateCode?: boolean;
}): Promise<void> {
  const { workspace, name, rotateCode } = params;
  const wsPath = `workspaces/${workspace.id}`;
  const cleanName = name.trim().slice(0, VALIDATION_LIMITS.workspaceNameMaxLength) || workspace.name;
  const nextInviteCode = rotateCode ? generateInviteCode() : workspace.inviteCode;

  try {
    await updateDoc(doc(db, wsPath), {
      name: cleanName,
      inviteCode: nextInviteCode,
      memberIds: workspace.memberIds,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, wsPath);
  }
}

/**
 * Removes a collaborator from the workspace (owner removing editor, or editor leaving).
 */
export async function removeWorkspaceMember(params: {
  workspace: Workspace;
  targetUserId: string;
  isOwnerAction: boolean;
}): Promise<void> {
  const { workspace, targetUserId, isOwnerAction } = params;
  const memberPath = `workspaces/${workspace.id}/members/${targetUserId}`;
  const wsPath = `workspaces/${workspace.id}`;

  try {
    await deleteDoc(doc(db, memberPath));
    if (isOwnerAction) {
      const filteredIds = workspace.memberIds.filter((id) => id !== targetUserId);
      if (filteredIds.length >= 1) {
        await updateDoc(doc(db, wsPath), {
          name: workspace.name,
          inviteCode: workspace.inviteCode,
          memberIds: filteredIds,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, memberPath);
  }
}

/**
 * Subscribes to a Workspace document and resolves its WorkspaceMember profiles.
 */
export function subscribeToWorkspace(
  workspaceId: string,
  onWorkspace: (ws: Workspace | null) => void,
  onMembers: (members: WorkspaceMember[]) => void,
): () => void {
  const wsPath = `workspaces/${workspaceId}`;
  let memberUnsubs: (() => void)[] = [];

  const cleanupMembers = () => {
    memberUnsubs.forEach((u) => u());
    memberUnsubs = [];
  };

  const unsubWs = onSnapshot(
    doc(db, wsPath),
    (snap) => {
      cleanupMembers();
      if (!snap.exists()) {
        onWorkspace(null);
        onMembers([]);
        return;
      }
      const data = snap.data();
      const ws: Workspace = {
        id: snap.id,
        name: data.name,
        ownerId: data.ownerId,
        inviteCode: data.inviteCode,
        memberIds: Array.isArray(data.memberIds) ? data.memberIds : [data.ownerId],
        spreadsheetId: data.spreadsheetId || '',
        spreadsheetUrl: data.spreadsheetUrl || '',
        spreadsheetTitle: data.spreadsheetTitle || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
      onWorkspace(ws);

      const membersMap: Record<string, WorkspaceMember> = {};
      for (const uid of ws.memberIds) {
        const mPath = `workspaces/${workspaceId}/members/${uid}`;
        const unsubM = onSnapshot(
          doc(db, mPath),
          (mSnap) => {
            if (mSnap.exists()) {
              membersMap[uid] = mSnap.data() as WorkspaceMember;
            } else {
              delete membersMap[uid];
            }
            onMembers(Object.values(membersMap));
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, mPath);
          },
        );
        memberUnsubs.push(unsubM);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, wsPath);
    },
  );

  return () => {
    cleanupMembers();
    unsubWs();
  };
}

/**
 * Subscribes in real time to a MonthModule, all its Weeks (W1..W{totalWeeks}),
 * and all MileageEntries referenced by those weeks via direct verified get listeners.
 */
export function subscribeToMonthData(params: {
  workspaceId: string;
  year: number;
  month: number;
  onUpdate: (payload: {
    monthModule: MonthModule | null;
    weeks: Record<number, WeekClosure>;
    entriesById: Record<string, MileageEntry>;
    loading: boolean;
  }) => void;
}): () => void {
  const { workspaceId, year, month, onUpdate } = params;
  const monthId = buildMonthId(year, month);
  const monthPath = `workspaces/${workspaceId}/months/${monthId}`;

  let currentMonth: MonthModule | null = null;
  const weeksMap: Record<number, WeekClosure> = {};
  const entriesMap: Record<string, MileageEntry> = {};

  const weekUnsubs = new Map<number, () => void>();
  const entryUnsubs = new Map<string, () => void>();

  const emit = (loading = false) => {
    onUpdate({
      monthModule: currentMonth,
      weeks: { ...weeksMap },
      entriesById: { ...entriesMap },
      loading,
    });
  };

  const syncEntryListeners = () => {
    const desiredEntryIds = new Set<string>();
    Object.values(weeksMap).forEach((w) => {
      w.entryIds.forEach((id) => desiredEntryIds.add(id));
    });

    // Unsubscribe removed entries
    for (const [entryId, unsub] of entryUnsubs.entries()) {
      if (!desiredEntryIds.has(entryId)) {
        unsub();
        entryUnsubs.delete(entryId);
        delete entriesMap[entryId];
      }
    }

    // Subscribe to newly added entries
    for (const entryId of desiredEntryIds) {
      if (!entryUnsubs.has(entryId)) {
        const entryPath = `workspaces/${workspaceId}/months/${monthId}/entries/${entryId}`;
        const unsubEntry = onSnapshot(
          doc(db, entryPath),
          (eSnap) => {
            if (eSnap.exists()) {
              entriesMap[entryId] = {
                id: eSnap.id,
                ...(eSnap.data() as Omit<MileageEntry, 'id'>),
              };
            } else {
              delete entriesMap[entryId];
            }
            emit(false);
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, entryPath);
          },
        );
        entryUnsubs.set(entryId, unsubEntry);
      }
    }
  };

  const unsubMonth = onSnapshot(
    doc(db, monthPath),
    (mSnap) => {
      if (!mSnap.exists()) {
        currentMonth = null;
        emit(false);
        return;
      }

      currentMonth = mSnap.data() as MonthModule;
      const totalWeeks = currentMonth.totalWeeks || 1;

      // Clean up weeks beyond totalWeeks
      for (const [wNum, unsub] of weekUnsubs.entries()) {
        if (wNum > totalWeeks) {
          unsub();
          weekUnsubs.delete(wNum);
          delete weeksMap[wNum];
        }
      }

      // Attach listeners for W1..W{totalWeeks}
      for (let w = 1; w <= totalWeeks; w++) {
        if (!weekUnsubs.has(w)) {
          const wId = buildWeekId(w);
          const wPath = `workspaces/${workspaceId}/months/${monthId}/weeks/${wId}`;
          const unsubW = onSnapshot(
            doc(db, wPath),
            (wSnap) => {
              if (wSnap.exists()) {
                const wData = wSnap.data();
                weeksMap[w] = {
                  ...(wData as WeekClosure),
                  entryIds: Array.isArray(wData.entryIds) ? wData.entryIds : [],
                };
              } else {
                delete weeksMap[w];
              }
              syncEntryListeners();
              emit(false);
            },
            (err) => {
              handleFirestoreError(err, OperationType.GET, wPath);
            },
          );
          weekUnsubs.set(w, unsubW);
        }
      }

      emit(false);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, monthPath);
    },
  );

  return () => {
    unsubMonth();
    weekUnsubs.forEach((u) => u());
    weekUnsubs.clear();
    entryUnsubs.forEach((u) => u());
    entryUnsubs.clear();
  };
}
