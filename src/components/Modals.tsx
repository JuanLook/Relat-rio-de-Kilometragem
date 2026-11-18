import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  LockOpen,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { MileageEntry, MONTHS_PT, Workspace, WorkspaceMember } from '../types';
import { extractSpreadsheetId, formatKm } from '../lib/validation';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({ title, onClose, children }) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 1. Close Active Week Confirmation Modal                                    */
/* -------------------------------------------------------------------------- */
export const ConfirmCloseWeekModal: React.FC<{
  weekNumber: number;
  totalWeeks: number;
  monthNumber: number;
  year: number;
  weekTotalV1: number;
  weekTotalUP: number;
  isProcessing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({
  weekNumber,
  totalWeeks,
  monthNumber,
  year,
  weekTotalV1,
  weekTotalUP,
  isProcessing,
  onConfirm,
  onClose,
}) => {
  const monthName = MONTHS_PT.find((m) => m.number === monthNumber)?.name || monthNumber;
  const willCreateNext = weekNumber === totalWeeks && totalWeeks < 12;

  return (
    <ModalShell title={`Fechar Semana ${weekNumber} — ${monthName}/${year}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-300 leading-relaxed">
          Ao confirmar o fechamento da <strong className="text-slate-100">Semana {weekNumber}</strong>,
          os totais abaixo serão fixados no rodapé das tabelas V1 e UP e a edição desta semana será
          bloqueada.
        </p>

        <div className="grid grid-cols-3 gap-3 bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 text-center">
          <div>
            <div className="text-xs text-slate-400 mb-1">Total V1</div>
            <div className="text-sm font-mono tabular-nums font-semibold text-blue-400">
              {formatKm(weekTotalV1)} km
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Total UP</div>
            <div className="text-sm font-mono tabular-nums font-semibold text-emerald-400">
              {formatKm(weekTotalUP)} km
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Soma da Semana</div>
            <div className="text-sm font-mono tabular-nums font-semibold text-slate-100">
              {formatKm(weekTotalV1 + weekTotalUP)} km
            </div>
          </div>
        </div>

        {willCreateNext && (
          <p className="text-xs text-slate-400">
            A <strong className="text-slate-200">Semana {totalWeeks + 1}</strong> será criada e aberta
            automaticamente logo abaixo para os próximos lançamentos do mês.
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            <span>{isProcessing ? 'Fechando...' : `Confirmar Fechamento`}</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Reopen Week Confirmation Modal                                          */
/* -------------------------------------------------------------------------- */
export const ConfirmReopenWeekModal: React.FC<{
  weekNumber: number;
  isProcessing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ weekNumber, isProcessing, onConfirm, onClose }) => {
  return (
    <ModalShell title={`Reabrir Semana ${weekNumber}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-300 leading-relaxed">
          Deseja reabrir a <strong className="text-slate-100">Semana {weekNumber}</strong> para
          correções ou novos lançamentos? Ela passará a ser a semana ativa até que você clique em
          &ldquo;Fechar Semana&rdquo; novamente.
        </p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <LockOpen className="w-4 h-4" />
            <span>{isProcessing ? 'Reabrindo...' : `Reabrir Semana ${weekNumber}`}</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Delete Entry Confirmation Modal                                         */
/* -------------------------------------------------------------------------- */
export const ConfirmDeleteEntryModal: React.FC<{
  entry: MileageEntry;
  isProcessing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ entry, isProcessing, onConfirm, onClose }) => {
  return (
    <ModalShell title="Excluir Registro de Quilometragem" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-300 leading-relaxed">
          Tem certeza que deseja excluir este lançamento da empresa{' '}
          <strong className="text-slate-100">{entry.company}</strong>?
        </p>

        <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Data:</span>
            <span className="font-mono tabular-nums text-slate-100">{entry.dateDisplay}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Trecho:</span>
            <span className="font-mono tabular-nums text-slate-100">
              {formatKm(entry.kmStart)} → {formatKm(entry.kmEnd)} ({formatKm(entry.kmResult)} km)
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400 shrink-0">Descrição:</span>
            <span className="text-slate-200 text-right truncate">{entry.description}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isProcessing ? 'Excluindo...' : 'Excluir Linha'}</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Team Sharing Modal (Share easily with Boss / Collaborators)             */
/* -------------------------------------------------------------------------- */
export const TeamShareModal: React.FC<{
  workspace: Workspace;
  members: WorkspaceMember[];
  currentUserId: string;
  onJoinOtherWorkspace: (wsId: string, code: string) => Promise<void>;
  onRotateCode: () => Promise<void>;
  onRemoveMember: (targetUserId: string) => Promise<void>;
  onClose: () => void;
}> = ({
  workspace,
  members,
  currentUserId,
  onJoinOtherWorkspace,
  onRotateCode,
  onRemoveMember,
  onClose,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [joinWsId, setJoinWsId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showManualJoin, setShowManualJoin] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = workspace.ownerId === currentUserId;
  const isDevOrigin = window.location.origin.startsWith('https://ais-dev-');
  const publicOrigin = isDevOrigin
    ? window.location.origin.replace('https://ais-dev-', 'https://ais-pre-')
    : window.location.origin;
  const shareUrl = `${publicOrigin}${window.location.pathname}?painel=${encodeURIComponent(workspace.id)}&convite=${encodeURIComponent(workspace.inviteCode)}`;

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setActionError('Não foi possível copiar automaticamente. Selecione e copie o link abaixo.');
    }
  };

  const handleManualJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!joinWsId.trim() || !joinCode.trim()) {
      setActionError('Preencha o ID do Painel e o Código de Convite.');
      return;
    }
    setBusy(true);
    try {
      await onJoinOtherWorkspace(joinWsId.trim(), joinCode.trim());
      onClose();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Código ou ID inválido. Verifique com quem enviou o convite.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Acesso Compartilhado da Equipe (Você + Gestor)" onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-2.5">
          <p className="text-sm text-slate-300 leading-relaxed">
            Envie o link de convite abaixo para o seu chefe. Ao abrir e clicar em{' '}
            <strong className="text-slate-100">Entrar com Google</strong> (com qualquer conta Google),
            ele acessará este mesmo painel em tempo real.
          </p>

          {isDevOrigin && (
            <div className="bg-amber-950/30 border border-amber-800/70 rounded-lg p-3 text-xs text-amber-200 leading-relaxed">
              <strong>Atenção antes de enviar:</strong> o endereço público{' '}
              <code className="font-mono">ais-pre-...</code> só abre (sem erro 404) depois que você
              publicar ou compartilhar o app clicando no botão <strong>Share / Deploy</strong> no
              topo do AI Studio.
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              readOnly
              value={shareUrl}
              aria-label="Link de convite da equipe"
              onFocus={(e) => e.currentTarget.select()}
              className="w-full h-10 px-3 bg-[#0B0F17] border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCopyInviteLink()}
              className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1">
            <span>
              ID: <strong className="font-mono text-slate-300">{workspace.id}</strong> · Código:{' '}
              <strong className="font-mono text-slate-300">{workspace.inviteCode}</strong>
            </span>
            {isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onRotateCode();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Gerar novo código</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Members Roster */}
        <div className="border-t border-slate-800 pt-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Users className="w-4 h-4 text-slate-400" />
            <span>Membros Conectados ({members.length}/10)</span>
          </div>
          <div className="divide-y divide-slate-800 bg-[#0B0F17] border border-slate-800 rounded-lg">
            {members.map((m) => (
              <div
                key={m.userId}
                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-medium text-slate-200">{m.displayName}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {m.role === 'owner' ? 'Proprietário' : 'Colaborador / Gestor'}
                    {m.userId === currentUserId ? ' (Você)' : ''}
                  </span>
                </div>
                {m.role !== 'owner' && (isOwner || m.userId === currentUserId) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onRemoveMember(m.userId);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    title="Remover acesso"
                    className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>{m.userId === currentUserId ? 'Sair' : 'Remover'}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Optional Manual Join */}
        <div className="border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowManualJoin((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer"
          >
            {showManualJoin
              ? 'Ocultar entrada por código manual'
              : 'Recebeu um ID e código de outro painel? Entrar manualmente'}
          </button>

          {showManualJoin && (
            <form onSubmit={(e) => void handleManualJoin(e)} className="mt-3 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="ID do Painel (ex: ws_...)"
                  value={joinWsId}
                  onChange={(e) => setJoinWsId(e.target.value)}
                  className="h-9 px-3 bg-[#0B0F17] border border-slate-700 rounded-lg text-xs font-mono text-slate-100"
                />
                <input
                  type="text"
                  placeholder="Código de Convite"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="h-9 px-3 bg-[#0B0F17] border border-slate-700 rounded-lg text-xs font-mono text-slate-100"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 cursor-pointer"
                >
                  Conectar ao Painel
                </button>
              </div>
            </form>
          )}
        </div>

        {actionError && <p className="text-xs text-red-400">{actionError}</p>}
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. Google Sheets / Google Drive Sync & Confirmation Modal                  */
/* -------------------------------------------------------------------------- */
export const GoogleSheetsSyncModal: React.FC<{
  workspace: Workspace;
  monthNumber: number;
  year: number;
  entryCount: number;
  isSyncing: boolean;
  onCreateNewSheet: () => Promise<void>;
  onUpdateExistingSheet: (targetSpreadsheetId: string) => Promise<void>;
  onClose: () => void;
}> = ({
  workspace,
  monthNumber,
  year,
  entryCount,
  isSyncing,
  onCreateNewSheet,
  onUpdateExistingSheet,
  onClose,
}) => {
  const monthName = MONTHS_PT.find((m) => m.number === monthNumber)?.name || `Mês ${monthNumber}`;
  const tabName = `${monthName} ${year}`;
  const hasLinkedSheet = Boolean(workspace.spreadsheetId);

  const [customSheetInput, setCustomSheetInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLinkAndSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const extracted = extractSpreadsheetId(customSheetInput);
    if (!extracted) {
      setLocalError('Cole um link válido do Google Sheets ou o ID da planilha.');
      return;
    }
    try {
      await onUpdateExistingSheet(extracted);
      onClose();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao sincronizar planilha.');
    }
  };

  return (
    <ModalShell title="Sincronizar com Google Sheets / Google Drive" onClose={onClose}>
      <div className="space-y-4">
        {hasLinkedSheet ? (
          <div className="space-y-4">
            <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {workspace.spreadsheetTitle || 'Planilha Corporativa Vinculada'}
                </span>
                {workspace.spreadsheetUrl && (
                  <a
                    href={workspace.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0"
                  >
                    <span>Abrir no Drive</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Confirmação de atualização: os dados da aba{' '}
                <strong className="text-slate-200">&ldquo;{tabName}&rdquo;</strong> ({entryCount}{' '}
                {entryCount === 1 ? 'lançamento' : 'lançamentos'}) serão atualizados na planilha
                acima no seu Google Drive. Outras abas mensais permanecerão intactas.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={isSyncing}
                onClick={async () => {
                  setLocalError(null);
                  try {
                    await onCreateNewSheet();
                    onClose();
                  } catch (err) {
                    setLocalError(
                      err instanceof Error ? err.message : 'Erro ao criar nova planilha.',
                    );
                  }
                }}
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer"
              >
                Criar uma nova planilha separada no Drive
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={async () => {
                    setLocalError(null);
                    try {
                      await onUpdateExistingSheet(workspace.spreadsheetId);
                      onClose();
                    } catch (err) {
                      setLocalError(
                        err instanceof Error ? err.message : 'Erro ao atualizar planilha.',
                      );
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isSyncing ? 'Sincronizando...' : `Confirmar e Atualizar Aba`}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Crie automaticamente uma planilha oficial no seu{' '}
              <strong className="text-slate-100">Google Drive</strong> com a aba{' '}
              <strong className="text-slate-100">&ldquo;{tabName}&rdquo;</strong> formatada para V1 e
              UP. Você poderá compartilhá-la na pasta do seu gestor no Drive.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSyncing}
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSyncing}
                onClick={async () => {
                  setLocalError(null);
                  try {
                    await onCreateNewSheet();
                    onClose();
                  } catch (err) {
                    setLocalError(err instanceof Error ? err.message : 'Falha ao criar planilha.');
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isSyncing ? 'Criando no Drive...' : 'Criar Planilha no Google Sheets'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Option to link an already-shared spreadsheet URL from Google Drive */}
        <div className="border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowLinkInput((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer"
          >
            {showLinkInput
              ? 'Ocultar vínculo por link'
              : 'Já possui uma planilha compartilhada no Google Drive? Vincular pelo link'}
          </button>

          {showLinkInput && (
            <form onSubmit={(e) => void handleLinkAndSync(e)} className="mt-3 space-y-2">
              <p className="text-xs text-slate-400">
                Ao confirmar abaixo, a aba &ldquo;{tabName}&rdquo; da planilha informada será
                criada ou atualizada:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Cole o link https://docs.google.com/spreadsheets/d/..."
                  value={customSheetInput}
                  onChange={(e) => setCustomSheetInput(e.target.value)}
                  className="w-full h-9 px-3 bg-[#0B0F17] border border-slate-700 rounded-lg text-xs text-slate-100"
                />
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="h-9 px-3.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Confirmar e Vincular
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Dica: na janela de permissão do Google, caso apareça o aviso de aplicativo em teste do seu
          projeto Cloud, clique em &ldquo;Avançado&rdquo; → &ldquo;Acessar&rdquo; e marque as
          permissões do Google Sheets/Drive.
        </p>

        {localError && <p className="text-xs text-red-400">{localError}</p>}
      </div>
    </ModalShell>
  );
};
