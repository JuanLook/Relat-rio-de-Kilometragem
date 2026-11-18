/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { CompanyColumn } from './components/CompanyColumn';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import {
  ConfirmCloseWeekModal,
  ConfirmDeleteEntryModal,
  ConfirmReopenWeekModal,
  GoogleSheetsSyncModal,
  TeamShareModal,
} from './components/Modals';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { QuickEntryForm } from './components/QuickEntryForm';
import {
  createAndSyncGoogleSpreadsheet,
  exportMonthToExcel,
  MonthExportPayload,
  syncExistingGoogleSpreadsheet,
} from './lib/exportService';
import {
  authorizeGoogleWorkspace,
  formatFirebaseAuthError,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './lib/firebase';
import {
  addLocalEntry,
  closeLocalWeek,
  deleteLocalEntry,
  loadLocalMonthStore,
  reopenLocalWeek,
  updateLocalEntry,
} from './lib/localFallbackService';
import { formatKm } from './lib/validation';
import {
  addMileageEntry,
  closeActiveWeek,
  deleteMileageEntry,
  ensureMonthInitialized,
  joinWorkspaceManually,
  removeWorkspaceMember,
  reopenClosedWeek,
  resolveOrCreateWorkspace,
  subscribeToMonthData,
  subscribeToWorkspace,
  updateMileageEntry,
  updateWorkspaceAdminSettings,
  updateWorkspaceSpreadsheet,
} from './lib/workspaceService';
import {
  CompanyType,
  MileageEntry,
  MonthModule,
  MONTHS_PT,
  WeekClosure,
  Workspace,
  WorkspaceMember,
} from './types';

function readInviteParamsFromUrl(): { workspaceId: string; inviteCode: string } | null {
  const params = new URLSearchParams(window.location.search);
  const workspaceId = params.get('painel')?.trim() || '';
  const inviteCode = params.get('convite')?.trim() || '';
  if (workspaceId && inviteCode) {
    return { workspaceId, inviteCode };
  }
  return null;
}

export default function App() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [suggestNewTab, setSuggestNewTab] = useState<boolean>(
    () => typeof window !== 'undefined' && window.self !== window.top,
  );

  const [pendingInvite] = useState<{ workspaceId: string; inviteCode: string } | null>(() =>
    readInviteParamsFromUrl(),
  );

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  const [monthModule, setMonthModule] = useState<MonthModule | null>(null);
  const [weeks, setWeeks] = useState<Record<number, WeekClosure>>({});
  const [entriesById, setEntriesById] = useState<Record<string, MileageEntry>>({});
  const [monthLoading, setMonthLoading] = useState(false);

  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showCloseWeekModal, setShowCloseWeekModal] = useState(false);
  const [reopenWeekTarget, setReopenWeekTarget] = useState<number | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<MileageEntry | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [isProcessingModal, setIsProcessingModal] = useState(false);

  // Toast feedback banner
  const [toast, setToast] = useState<{
    message: string;
    linkUrl?: string;
    linkLabel?: string;
  } | null>(null);

  const showNotice = (message: string, linkUrl?: string, linkLabel?: string) => {
    setToast({ message, linkUrl, linkLabel });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // 1. Auth Lifecycle
  useEffect(() => {
    const unsub = initAuth((currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        setLocalMode(false);
        setAuthError(null);
      } else {
        setWorkspaceId(null);
        setWorkspace(null);
        setMembers([]);
      }
    });
    return () => unsub();
  }, []);

  // 1b. Load Local Fallback Store when operating in browser-local mode
  useEffect(() => {
    if (user || !localMode) return;
    const localStore = loadLocalMonthStore(selectedYear, selectedMonth);
    setMonthModule(localStore.monthModule);
    setWeeks(localStore.weeks);
    setEntriesById(localStore.entriesById);
    setMonthLoading(false);
  }, [user, localMode, selectedYear, selectedMonth]);

  // 2. Resolve or Create Shared Corporate Workspace once Authenticated
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setWorkspaceLoading(true);

    resolveOrCreateWorkspace(user, pendingInvite)
      .then((resolvedId) => {
        if (cancelled) return;
        setWorkspaceId(resolvedId);
        if (pendingInvite) {
          window.history.replaceState({}, document.title, window.location.pathname);
          showNotice('Você foi conectado ao painel corporativo compartilhado.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAuthError(
            err instanceof Error ? err.message : 'Erro ao carregar espaço corporativo.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setWorkspaceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, pendingInvite]);

  // 3. Subscribe to Workspace Metadata & Collaborators
  useEffect(() => {
    if (!workspaceId || !user) return;
    const unsub = subscribeToWorkspace(workspaceId, setWorkspace, setMembers);
    return () => unsub();
  }, [workspaceId, user]);

  // 4. Initialize & Subscribe to Selected Month Module (1..12)
  useEffect(() => {
    if (!workspaceId || !user) return;
    let cancelled = false;
    setMonthLoading(true);

    ensureMonthInitialized(workspaceId, selectedYear, selectedMonth, user.uid)
      .catch((err) => {
        console.error('Failed to initialize month:', err);
      });

    const unsubMonth = subscribeToMonthData({
      workspaceId,
      year: selectedYear,
      month: selectedMonth,
      onUpdate: (data) => {
        if (cancelled) return;
        setMonthModule(data.monthModule);
        setWeeks(data.weeks);
        setEntriesById(data.entriesById);
        setMonthLoading(data.loading);
      },
    });

    return () => {
      cancelled = true;
      unsubMonth();
    };
  }, [workspaceId, selectedYear, selectedMonth, user]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      await googleSignIn();
    } catch (err) {
      const formatted = formatFirebaseAuthError(err);
      setAuthError(formatted.message);
      setSuggestNewTab(formatted.suggestNewTab);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setLocalMode(false);
    await logout();
  };

  const entries = useMemo(() => Object.values(entriesById), [entriesById]);
  const totalWeeks = monthModule?.totalWeeks || 1;
  const activeWeekNumber = monthModule?.activeWeekNumber || 1;
  const activeWeekDoc = weeks[activeWeekNumber];
  const isActiveWeekLocked = Boolean(activeWeekDoc?.isLocked);

  // Calculate Monthly Totals (V1, UP, General) and Active Week Live Totals
  const summary = useMemo(() => {
    let monthV1 = 0;
    let monthUP = 0;

    for (let w = 1; w <= totalWeeks; w++) {
      const wDoc = weeks[w];
      if (wDoc?.isLocked) {
        monthV1 += wDoc.lockedTotalV1;
        monthUP += wDoc.lockedTotalUP;
      } else {
        for (const e of entries) {
          if (e.weekNumber === w) {
            if (e.company === 'V1') monthV1 += e.kmResult;
            else monthUP += e.kmResult;
          }
        }
      }
    }

    const activeWeekV1 = entries
      .filter((e) => e.weekNumber === activeWeekNumber && e.company === 'V1')
      .reduce((acc, e) => acc + e.kmResult, 0);

    const activeWeekUP = entries
      .filter((e) => e.weekNumber === activeWeekNumber && e.company === 'UP')
      .reduce((acc, e) => acc + e.kmResult, 0);

    return {
      monthV1: Math.round(monthV1 * 100) / 100,
      monthUP: Math.round(monthUP * 100) / 100,
      monthGeneral: Math.round((monthV1 + monthUP) * 100) / 100,
      activeWeekV1: Math.round(activeWeekV1 * 100) / 100,
      activeWeekUP: Math.round(activeWeekUP * 100) / 100,
    };
  }, [entries, weeks, totalWeeks, activeWeekNumber]);

  const handleAddEntry = async (formData: {
    company: CompanyType;
    dateDisplay: string;
    dateSortKey: string;
    kmStart: number;
    kmEnd: number;
    description: string;
  }) => {
    if (localMode && !user) {
      const currentStore = loadLocalMonthStore(selectedYear, selectedMonth);
      const { nextStore, entryId } = addLocalEntry(currentStore, formData);
      setMonthModule(nextStore.monthModule);
      setWeeks(nextStore.weeks);
      setEntriesById(nextStore.entriesById);
      setHighlightedEntryId(entryId);
      setTimeout(() => {
        setHighlightedEntryId((prev) => (prev === entryId ? null : prev));
      }, 2200);
      showNotice(
        `Lançamento adicionado localmente na Tabela ${formData.company} (Semana ${activeWeekNumber}).`,
      );
      return;
    }

    if (!workspaceId || !user) return;
    setIsSubmittingEntry(true);
    try {
      const currentEntryIds = activeWeekDoc?.entryIds || [];
      const createdId = await addMileageEntry({
        workspaceId,
        year: selectedYear,
        month: selectedMonth,
        weekNumber: activeWeekNumber,
        existingEntryIds: currentEntryIds,
        user,
        ...formData,
      });
      setHighlightedEntryId(createdId);
      setTimeout(() => {
        setHighlightedEntryId((prev) => (prev === createdId ? null : prev));
      }, 2200);
      showNotice(
        `Lançamento adicionado na Tabela ${formData.company} (Semana ${activeWeekNumber}) e ordenado por data.`,
      );
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  const handleUpdateEntry = async (params: {
    entryId: string;
    company: CompanyType;
    dateDisplay: string;
    dateSortKey: string;
    kmStart: number;
    kmEnd: number;
    description: string;
  }) => {
    if (localMode && !user) {
      const currentStore = loadLocalMonthStore(selectedYear, selectedMonth);
      const nextStore = updateLocalEntry(currentStore, params);
      setEntriesById(nextStore.entriesById);
      showNotice('Registro atualizado e reordenado cronologicamente.');
      return;
    }

    if (!workspaceId || !user || !monthModule) return;
    await updateMileageEntry({
      workspaceId,
      monthId: monthModule.monthId,
      user,
      ...params,
    });
    showNotice('Registro atualizado e reordenado cronologicamente.');
  };

  const handleConfirmDeleteEntry = async () => {
    if (localMode && !user && deleteEntryTarget) {
      const currentStore = loadLocalMonthStore(selectedYear, selectedMonth);
      const nextStore = deleteLocalEntry(currentStore, deleteEntryTarget);
      setWeeks(nextStore.weeks);
      setEntriesById(nextStore.entriesById);
      setDeleteEntryTarget(null);
      showNotice('Registro excluído com sucesso.');
      return;
    }

    if (!workspaceId || !monthModule || !deleteEntryTarget) return;
    setIsProcessingModal(true);
    try {
      const targetWeek = weeks[deleteEntryTarget.weekNumber];
      await deleteMileageEntry({
        workspaceId,
        monthId: monthModule.monthId,
        weekId: deleteEntryTarget.weekId,
        entryId: deleteEntryTarget.id,
        existingEntryIds: targetWeek?.entryIds || [],
      });
      setDeleteEntryTarget(null);
      showNotice('Registro excluído com sucesso.');
    } finally {
      setIsProcessingModal(false);
    }
  };

  const handleConfirmCloseWeek = async () => {
    if (localMode && !user) {
      const closedNum = activeWeekNumber;
      const currentStore = loadLocalMonthStore(selectedYear, selectedMonth);
      const nextStore = closeLocalWeek(
        currentStore,
        summary.activeWeekV1,
        summary.activeWeekUP,
      );
      setMonthModule(nextStore.monthModule);
      setWeeks(nextStore.weeks);
      setShowCloseWeekModal(false);
      showNotice(`Semana ${closedNum} encerrada com totais fixados no rodapé.`);
      return;
    }

    if (!workspaceId || !monthModule || !user) return;
    setIsProcessingModal(true);
    try {
      const closedNum = activeWeekNumber;
      await closeActiveWeek({
        workspaceId,
        monthModule,
        weeksMap: weeks,
        weekNumberToClose: closedNum,
        totalV1ForWeek: summary.activeWeekV1,
        totalUPForWeek: summary.activeWeekUP,
        userUid: user.uid,
      });
      setShowCloseWeekModal(false);
      showNotice(`Semana ${closedNum} encerrada com totais fixados no rodapé.`);
    } finally {
      setIsProcessingModal(false);
    }
  };

  const handleConfirmReopenWeek = async () => {
    if (localMode && !user && reopenWeekTarget !== null) {
      const target = reopenWeekTarget;
      const currentStore = loadLocalMonthStore(selectedYear, selectedMonth);
      const nextStore = reopenLocalWeek(currentStore, target);
      setMonthModule(nextStore.monthModule);
      setWeeks(nextStore.weeks);
      setReopenWeekTarget(null);
      showNotice(`Semana ${target} reaberta para edição.`);
      return;
    }

    if (!workspaceId || !monthModule || reopenWeekTarget === null) return;
    setIsProcessingModal(true);
    try {
      const target = reopenWeekTarget;
      await reopenClosedWeek({
        workspaceId,
        monthModule,
        weekNumberToReopen: target,
      });
      setReopenWeekTarget(null);
      showNotice(`Semana ${target} reaberta para edição.`);
    } finally {
      setIsProcessingModal(false);
    }
  };

  const buildCurrentExportPayload = (): MonthExportPayload => ({
    year: selectedYear,
    month: selectedMonth,
    totalWeeks,
    weeks,
    entries,
  });

  const handleDownloadExcel = () => {
    exportMonthToExcel(buildCurrentExportPayload());
    const mName = MONTHS_PT.find((m) => m.number === selectedMonth)?.name || selectedMonth;
    showNotice(`Arquivo Excel (.xlsx) de ${mName}/${selectedYear} gerado para download.`);
  };

  /**
   * Obtains in-memory Google Workspace OAuth access token via incremental consent popup.
   */
  const ensureGoogleToken = async (): Promise<string> => {
    const existingToken = getAccessToken();
    if (existingToken) return existingToken;
    return authorizeGoogleWorkspace();
  };

  const handleCreateNewGoogleSheet = async () => {
    if (!workspace) return;
    setIsProcessingModal(true);
    try {
      const token = await ensureGoogleToken();
      const result = await createAndSyncGoogleSpreadsheet({
        accessToken: token,
        payload: buildCurrentExportPayload(),
      });
      await updateWorkspaceSpreadsheet({
        workspaceId: workspace.id,
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        spreadsheetTitle: result.spreadsheetTitle,
      });
      showNotice(
        `Planilha criada e sincronizada na aba "${result.tabTitle}".`,
        result.spreadsheetUrl,
        'Abrir no Google Sheets',
      );
    } finally {
      setIsProcessingModal(false);
    }
  };

  const handleUpdateExistingGoogleSheet = async (targetSpreadsheetId: string) => {
    if (!workspace) return;
    setIsProcessingModal(true);
    try {
      const token = await ensureGoogleToken();
      const result = await syncExistingGoogleSpreadsheet({
        accessToken: token,
        spreadsheetId: targetSpreadsheetId,
        payload: buildCurrentExportPayload(),
      });
      await updateWorkspaceSpreadsheet({
        workspaceId: workspace.id,
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        spreadsheetTitle: result.spreadsheetTitle,
      });
      showNotice(
        `Aba "${result.tabTitle}" sincronizada com sucesso no Google Sheets.`,
        result.spreadsheetUrl,
        'Abrir no Google Sheets',
      );
    } finally {
      setIsProcessingModal(false);
    }
  };

  const selectedMonthObj =
    MONTHS_PT.find((m) => m.number === selectedMonth) || MONTHS_PT[0];

  const availableYears = useMemo(() => {
    const base = now.getFullYear();
    return [base - 1, base, base + 1, base + 2];
  }, [now]);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-800/90 bg-[#0B0F17]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#painel"
            className="text-base sm:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            Controle KM Corporativo
          </a>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          {(user && workspace) || localMode ? (
            <nav
              aria-label="Navegação Principal"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
            >
              <a
                href="#lancamento"
                className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Lançamentos
              </a>
              {user && workspace && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowTeamModal(true)}
                    className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Compartilhar Equipe
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSheetsModal(true)}
                    className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Google Sheets
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Exportar Excel
              </button>
              <PWAInstallButton variant="nav" />
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
              <span className="whitespace-nowrap shrink-0">Módulos Mensais</span>
              <span className="whitespace-nowrap shrink-0">Fechamento Semanal</span>
              <span className="whitespace-nowrap shrink-0">Tabelas V1 &amp; UP</span>
              <span className="whitespace-nowrap shrink-0">Google Sheets &amp; Excel</span>
            </nav>
          )}

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            {!authReady ? (
              <span className="text-xs text-slate-400 whitespace-nowrap">Carregando...</span>
            ) : user ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sair ({user.displayName?.split(' ')[0] || 'Conta'})
              </button>
            ) : (
              <GoogleSignInButton
                onClick={() => void handleLogin()}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Conectando...' : 'Entrar com Google'}
              />
            )}
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main id="painel" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
        {!authReady || workspaceLoading ? (
          <div className="space-y-4 py-8" aria-busy="true">
            <div className="h-12 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="h-24 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
              <div className="h-24 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
              <div className="h-24 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
              <div className="h-24 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
            </div>
            <div className="h-36 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
          </div>
        ) : !user && !localMode ? (
          /* Clean Corporate Sign-In Workspace */
          <div className="py-12 md:py-20 max-w-3xl mx-auto space-y-8">
            {pendingInvite && (
              <div className="bg-blue-950/40 border border-blue-800/70 rounded-xl p-4 text-sm text-blue-200">
                Convite corporativo detectado. Entre com sua conta Google abaixo para abrir e
                utilizar o painel compartilhado em tempo real.
              </div>
            )}

            <div className="space-y-4">
              <p className="text-xs font-medium text-slate-400">
                Gestão de Frota &amp; Serviços · Empresas V1 e UP
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-100 text-balance">
                Controle Corporativo de Quilometragem e Fechamento Semanal
              </h1>
              <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
                Registre deslocamentos diários para V1 e UP em 12 módulos mensais independentes,
                com cálculo automático de quilometragem, ordenação cronológica por data, trava de
                fechamento semanal, acesso compartilhado com sua gestão e exportação direta para
                Google Sheets e Excel.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <GoogleSignInButton
                onClick={() => void handleLogin()}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Autenticando...' : 'Entrar com Google para Acessar'}
              />

              {suggestNewTab && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 px-4 inline-flex items-center gap-2 rounded-lg text-xs font-semibold text-slate-200 bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Abrir em Nova Guia</span>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                </a>
              )}

              <PWAInstallButton variant="card" />

              <button
                type="button"
                onClick={() => setLocalMode(true)}
                className="h-10 px-3.5 inline-flex items-center rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Usar no Modo Local (Navegador)
              </button>
            </div>

            {authError && (
              <div
                role="alert"
                className="bg-amber-950/30 border border-amber-800/70 rounded-xl p-4 space-y-2 text-xs text-amber-200"
              >
                <p className="leading-relaxed">{authError}</p>
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-4"
                  >
                    <span>Abrir aplicativo em nova guia para fazer login</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setLocalMode(true)}
                    className="font-semibold text-slate-200 hover:text-white underline underline-offset-4 cursor-pointer"
                  >
                    Ou acessar agora em Modo Local
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-800">
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-1.5">
                <h2 className="text-sm font-semibold text-slate-100">01. 12 Módulos Mensais</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Navegue de Janeiro a Dezembro com registros e semanas totalmente independentes por
                  mês.
                </p>
              </div>
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-1.5">
                <h2 className="text-sm font-semibold text-slate-100">
                  02. Fechamento Semanal V1 &amp; UP
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Trave o rodapé semanal de ambas as empresas em um clique e abra automaticamente a
                  próxima semana.
                </p>
              </div>
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-1.5">
                <h2 className="text-sm font-semibold text-slate-100">
                  03. Acesso Conjunto &amp; Drive
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Compartilhe o link com seu gestor para uso simultâneo e sincronize planilhas no
                  Google Sheets ou Excel.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Authenticated Corporate Dashboard */
          <div className="space-y-6">
            {/* Non-blocking Feedback Toast */}
            {toast && (
              <div
                role="status"
                className="bg-[#111827] border border-emerald-800/70 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{toast.message}</span>
                  {toast.linkUrl && (
                    <a
                      href={toast.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-4 ml-1"
                    >
                      <span>{toast.linkLabel || 'Abrir'}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label="Fechar aviso"
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 1. Month Selector Bar (12 Independent Modules + Year) */}
            <section
              aria-label="Seletor de Meses"
              className="bg-[#111827] border border-slate-800 rounded-xl p-2 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2"
            >
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1 flex-1">
                {MONTHS_PT.map((m) => {
                  const isActive = m.number === selectedMonth;
                  return (
                    <button
                      key={m.number}
                      type="button"
                      onClick={() => setSelectedMonth(m.number)}
                      className={`h-9 px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="hidden xl:inline">{m.name}</span>
                      <span className="xl:hidden">{m.shortName}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between lg:justify-end gap-2 px-1 lg:pl-2 lg:border-l lg:border-slate-800">
                <label htmlFor="year-select" className="text-xs text-slate-400 whitespace-nowrap">
                  Ano:
                </label>
                <select
                  id="year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-9 px-2.5 bg-[#0B0F17] border border-slate-700 rounded-lg text-xs font-mono tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* Monthly Summary KPIs & Weekly Closing Control Strip (Single-Elevation Blocks) */}
            <section
              aria-label="Resumo Acumulado do Mês e Controle Semanal"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-4"
            >
              {/* Total V1 */}
              <div className="xl:col-span-2 bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xs text-slate-400">
                  Total Mês V1 · {selectedMonthObj.shortName}/{selectedYear}
                </span>
                <div className="mt-2 text-xl font-mono tabular-nums font-semibold text-blue-400">
                  {formatKm(summary.monthV1)} km
                </div>
              </div>

              {/* Total UP */}
              <div className="xl:col-span-2 bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xs text-slate-400">
                  Total Mês UP · {selectedMonthObj.shortName}/{selectedYear}
                </span>
                <div className="mt-2 text-xl font-mono tabular-nums font-semibold text-emerald-400">
                  {formatKm(summary.monthUP)} km
                </div>
              </div>

              {/* Total Geral */}
              <div className="xl:col-span-3 bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xs text-slate-400">
                  Total Geral Acumulado ({selectedMonthObj.name})
                </span>
                <div className="mt-2 text-2xl font-mono tabular-nums font-bold text-slate-100">
                  {formatKm(summary.monthGeneral)} km
                </div>
              </div>

              {/* Weekly Closing Control + Export / Share Actions */}
              <div className="sm:col-span-2 xl:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-300">
                    <span className="font-semibold text-slate-100">
                      Semana {activeWeekNumber} {isActiveWeekLocked ? 'Fechada' : 'Aberta'}
                    </span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-slate-400">
                      {totalWeeks} {totalWeeks === 1 ? 'semana no mês' : 'semanas no mês'}
                    </span>
                  </div>

                  {workspace?.spreadsheetUrl && (
                    <a
                      href={workspace.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 whitespace-nowrap shrink-0"
                    >
                      <span>Planilha no Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isActiveWeekLocked}
                    onClick={() => setShowCloseWeekModal(true)}
                    className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Fechar Semana {activeWeekNumber}</span>
                  </button>

                  {user && workspace && (
                    <button
                      type="button"
                      onClick={() => setShowSheetsModal(true)}
                      className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Google Sheets</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadExcel}
                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-400" />
                    <span>Excel (.xlsx)</span>
                  </button>

                  {user && workspace ? (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal(true)}
                      className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-slate-300" />
                      <span>Equipe ({members.length})</span>
                    </button>
                  ) : (
                    <span className="text-xs text-amber-300">
                      Modo Local · Entre com Google no topo para Nuvem &amp; Sheets
                    </span>
                  )}

                  <PWAInstallButton variant="control" />
                </div>
              </div>
            </section>

            {/* 2. Quick Entry Top Form */}
            <div id="lancamento">
              <QuickEntryForm
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                activeWeekNumber={activeWeekNumber}
                isActiveWeekLocked={isActiveWeekLocked}
                isSubmitting={isSubmittingEntry}
                onAddEntry={handleAddEntry}
              />
            </div>

            {/* Search / Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Exibindo módulo de{' '}
                <strong className="text-slate-200">
                  {selectedMonthObj.name} / {selectedYear}
                </strong>{' '}
                · Duas colunas independentes (V1 e UP)
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por data ou descrição..."
                  aria-label="Filtrar lançamentos por data ou descrição"
                  className="w-full h-9 pl-8 pr-3 bg-[#111827] border border-slate-800 focus:border-slate-600 focus:outline-none rounded-lg text-xs text-slate-200 placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* 4. Two Separate General Columns: Left = Tabela V1, Right = Tabela UP */}
            {monthLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-64 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
                <div className="h-64 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <CompanyColumn
                  company="V1"
                  totalWeeks={totalWeeks}
                  activeWeekNumber={activeWeekNumber}
                  weeks={weeks}
                  entries={entries}
                  searchQuery={searchQuery}
                  highlightedEntryId={highlightedEntryId}
                  onUpdateEntry={handleUpdateEntry}
                  onRequestDeleteEntry={(entry) => setDeleteEntryTarget(entry)}
                  onRequestReopenWeek={(wNum) => setReopenWeekTarget(wNum)}
                />

                <CompanyColumn
                  company="UP"
                  totalWeeks={totalWeeks}
                  activeWeekNumber={activeWeekNumber}
                  weeks={weeks}
                  entries={entries}
                  searchQuery={searchQuery}
                  highlightedEntryId={highlightedEntryId}
                  onUpdateEntry={handleUpdateEntry}
                  onRequestDeleteEntry={(entry) => setDeleteEntryTarget(entry)}
                  onRequestReopenWeek={(wNum) => setReopenWeekTarget(wNum)}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Quiet Corporate Footer */}
      <footer className="border-t border-slate-800/80 py-4 mt-12">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>Controle Corporativo de Quilometragem — Operações V1 &amp; UP</span>
          <span>Sincronização em nuvem · Google Sheets &amp; Excel (.xlsx)</span>
        </div>
      </footer>

      {/* Modals */}
      {showCloseWeekModal && (
        <ConfirmCloseWeekModal
          weekNumber={activeWeekNumber}
          totalWeeks={totalWeeks}
          monthNumber={selectedMonth}
          year={selectedYear}
          weekTotalV1={summary.activeWeekV1}
          weekTotalUP={summary.activeWeekUP}
          isProcessing={isProcessingModal}
          onConfirm={() => void handleConfirmCloseWeek()}
          onClose={() => setShowCloseWeekModal(false)}
        />
      )}

      {reopenWeekTarget !== null && (
        <ConfirmReopenWeekModal
          weekNumber={reopenWeekTarget}
          isProcessing={isProcessingModal}
          onConfirm={() => void handleConfirmReopenWeek()}
          onClose={() => setReopenWeekTarget(null)}
        />
      )}

      {deleteEntryTarget !== null && (
        <ConfirmDeleteEntryModal
          entry={deleteEntryTarget}
          isProcessing={isProcessingModal}
          onConfirm={() => void handleConfirmDeleteEntry()}
          onClose={() => setDeleteEntryTarget(null)}
        />
      )}

      {showTeamModal && workspace && user && (
        <TeamShareModal
          workspace={workspace}
          members={members}
          currentUserId={user.uid}
          onJoinOtherWorkspace={async (wsId, code) => {
            const joinedId = await joinWorkspaceManually(user, wsId, code);
            setWorkspaceId(joinedId);
            showNotice('Conectado com sucesso ao painel compartilhado.');
          }}
          onRotateCode={async () => {
            await updateWorkspaceAdminSettings({
              workspace,
              name: workspace.name,
              rotateCode: true,
            });
            showNotice('Novo código de convite gerado.');
          }}
          onRemoveMember={async (targetUid) => {
            const isSelf = targetUid === user.uid;
            await removeWorkspaceMember({
              workspace,
              targetUserId: targetUid,
              isOwnerAction: workspace.ownerId === user.uid,
            });
            if (isSelf) {
              const freshId = await resolveOrCreateWorkspace(user, null);
              setWorkspaceId(freshId);
              setShowTeamModal(false);
            } else {
              showNotice('Acesso do colaborador removido.');
            }
          }}
          onClose={() => setShowTeamModal(false)}
        />
      )}

      {showSheetsModal && workspace && (
        <GoogleSheetsSyncModal
          workspace={workspace}
          monthNumber={selectedMonth}
          year={selectedYear}
          entryCount={entries.length}
          isSyncing={isProcessingModal}
          onCreateNewSheet={handleCreateNewGoogleSheet}
          onUpdateExistingSheet={handleUpdateExistingGoogleSheet}
          onClose={() => setShowSheetsModal(false)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
