import fs from 'fs';
import {
  assertFails,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

/**
 * Phase 0 Security TDD Suite — Verifies all "Dirty Dozen" payloads return PERMISSION_DENIED.
 */
export async function runDirtyDozenSecuritySuite(): Promise<void> {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'demo-corporate-km-security',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  try {
    // Seed valid baseline state bypassing rules
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws_valid'), {
        name: 'Painel Corporativo',
        ownerId: 'uid_owner',
        inviteCode: 'INVITE2026OK',
        memberIds: ['uid_owner'],
        spreadsheetId: '',
        spreadsheetUrl: '',
        spreadsheetTitle: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'workspaces', 'ws_valid', 'members', 'uid_owner'), {
        workspaceId: 'ws_valid',
        userId: 'uid_owner',
        displayName: 'Gestor',
        role: 'owner',
        inviteCodeUsed: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'workspaces', 'ws_valid', 'months', '2026_11'), {
        workspaceId: 'ws_valid',
        monthId: '2026_11',
        year: 2026,
        month: 11,
        activeWeekNumber: 2,
        totalWeeks: 2,
        createdBy: 'uid_owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'workspaces', 'ws_valid', 'months', '2026_11', 'weeks', 'W1'), {
        workspaceId: 'ws_valid',
        monthId: '2026_11',
        weekId: 'W1',
        weekNumber: 1,
        isLocked: true,
        lockedTotalV1: 120,
        lockedTotalUP: 50,
        entryIds: ['entry_locked'],
        createdBy: 'uid_owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'workspaces', 'ws_valid', 'months', '2026_11', 'weeks', 'W2'), {
        workspaceId: 'ws_valid',
        monthId: '2026_11',
        weekId: 'W2',
        weekNumber: 2,
        isLocked: false,
        lockedTotalV1: 0,
        lockedTotalUP: 0,
        entryIds: ['entry_open'],
        createdBy: 'uid_owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'workspaces', 'ws_valid', 'months', '2026_11', 'entries', 'entry_locked'), {
        workspaceId: 'ws_valid',
        monthId: '2026_11',
        weekId: 'W1',
        weekNumber: 1,
        company: 'V1',
        dateDisplay: '05/11/2026',
        dateSortKey: '2026-11-05',
        kmStart: 1000,
        kmEnd: 1120,
        kmResult: 120,
        description: 'Atendimento externo',
        createdBy: 'uid_owner',
        authorName: 'Gestor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'workspaces', 'ws_valid', 'months', '2026_11', 'entries', 'entry_open'), {
        workspaceId: 'ws_valid',
        monthId: '2026_11',
        weekId: 'W2',
        weekNumber: 2,
        company: 'UP',
        dateDisplay: '12/11/2026',
        dateSortKey: '2026-11-12',
        kmStart: 2000,
        kmEnd: 2050,
        kmResult: 50,
        description: 'Rota operacional',
        createdBy: 'uid_owner',
        authorName: 'Gestor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'userSettings', 'uid_owner'), {
        userId: 'uid_owner',
        activeWorkspaceId: 'ws_valid',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    const unverifiedDb = testEnv
      .authenticatedContext('uid_unverified', { email_verified: false })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext('uid_owner', { email_verified: true })
      .firestore();
    const attackerDb = testEnv
      .authenticatedContext('uid_attacker', { email_verified: true })
      .firestore();

    // 1. Unverified Email Spoof
    await assertFails(
      setDoc(doc(unverifiedDb, 'userSettings', 'uid_unverified'), {
        userId: 'uid_unverified',
        activeWorkspaceId: 'ws_valid',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 2. Shadow Field Injection
    await assertFails(
      updateDoc(doc(ownerDb, 'workspaces', 'ws_valid'), {
        spreadsheetId: 'sheet123',
        isAdmin: true,
        updatedAt: serverTimestamp(),
      }),
    );

    // 3. ID Poisoning (Oversized / invalid characters)
    const poisonedId = 'x'.repeat(250);
    await assertFails(
      setDoc(doc(ownerDb, 'workspaces', poisonedId), {
        name: 'Bad ID',
        ownerId: 'uid_owner',
        inviteCode: 'VALIDCODE123',
        memberIds: ['uid_owner'],
        spreadsheetId: '',
        spreadsheetUrl: '',
        spreadsheetTitle: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 4. Self-Assigned Owner Escalation
    await assertFails(
      setDoc(doc(attackerDb, 'workspaces', 'ws_valid', 'members', 'uid_attacker'), {
        workspaceId: 'ws_valid',
        userId: 'uid_attacker',
        displayName: 'Intruder',
        role: 'owner',
        inviteCodeUsed: 'INVITE2026OK',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 5. Wrong Invite Code Brute Join
    await assertFails(
      setDoc(doc(attackerDb, 'workspaces', 'ws_valid', 'members', 'uid_attacker'), {
        workspaceId: 'ws_valid',
        userId: 'uid_attacker',
        displayName: 'Intruder',
        role: 'editor',
        inviteCodeUsed: 'WRONGCODE99',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 6. Orphaned Workspace Write (missing atomic member record)
    await assertFails(
      setDoc(doc(attackerDb, 'workspaces', 'ws_orphan'), {
        name: 'Orphan WS',
        ownerId: 'uid_attacker',
        inviteCode: 'CODE123456',
        memberIds: ['uid_attacker'],
        spreadsheetId: '',
        spreadsheetUrl: '',
        spreadsheetTitle: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 7. Negative / Inverted Mileage Manipulation (kmEnd < kmStart)
    await assertFails(
      setDoc(doc(ownerDb, 'workspaces', 'ws_valid', 'months', '2026_11', 'entries', 'entry_bad_km'), {
        workspaceId: 'ws_valid',
        monthId: '2026_11',
        weekId: 'W2',
        weekNumber: 2,
        company: 'V1',
        dateDisplay: '15/11/2026',
        dateSortKey: '2026-11-15',
        kmStart: 500,
        kmEnd: 450,
        kmResult: -50,
        description: 'KM invertido',
        createdBy: 'uid_owner',
        authorName: 'Gestor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 8. Closed Week Tampering (deleting or editing an entry in W1 where isLocked == true)
    await assertFails(
      deleteDoc(doc(ownerDb, 'workspaces', 'ws_valid', 'months', '2026_11', 'entries', 'entry_locked')),
    );

    // 9. Cross-User Settings Snooping
    await assertFails(getDoc(doc(attackerDb, 'userSettings', 'uid_owner')));

    // 10. Blanket List Scraping
    await assertFails(
      getDocs(collection(ownerDb, 'workspaces', 'ws_valid', 'months', '2026_11', 'entries')),
    );

    // 11. Immutable Author Rewrite
    await assertFails(
      updateDoc(doc(ownerDb, 'workspaces', 'ws_valid', 'months', '2026_11', 'entries', 'entry_open'), {
        createdBy: 'uid_someone_else',
        updatedAt: serverTimestamp(),
      }),
    );

    // 12. Denial-of-Wallet Oversized String
    await assertFails(
      setDoc(doc(ownerDb, 'workspaces', 'ws_valid', 'months', '2026_11', 'entries', 'entry_huge'), {
        workspaceId: 'ws_valid',
        monthId: '2026_11',
        weekId: 'W2',
        weekNumber: 2,
        company: 'V1',
        dateDisplay: '16/11/2026',
        dateSortKey: '2026-11-16',
        kmStart: 100,
        kmEnd: 200,
        kmResult: 100,
        description: 'A'.repeat(5000),
        createdBy: 'uid_owner',
        authorName: 'Gestor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
}
