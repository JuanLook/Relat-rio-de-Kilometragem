import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MonitorDown,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function getPreferredAppEntryUrl(preferPublishedOrigin = false): string {
  if (typeof window === 'undefined') return '/';
  const { origin, pathname, search } = window.location;
  const baseOrigin =
    preferPublishedOrigin && origin.startsWith('https://ais-dev-')
      ? origin.replace('https://ais-dev-', 'https://ais-pre-')
      : origin;
  return `${baseOrigin}${pathname}${search}`;
}

export function downloadWindowsUrlShortcut(targetUrl: string): void {
  const shortcutContent = `[InternetShortcut]\r\nURL=${targetUrl}\r\n`;
  const blob = new Blob([shortcutContent], { type: 'application/internet-shortcut' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = 'Controle KM Corporativo.url';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

interface PWAInstallButtonProps {
  variant?: 'nav' | 'card' | 'control';
  workspaceInviteUrl?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'control',
  workspaceInviteUrl,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [downloadedShortcut, setDownloadedShortcut] = useState(false);
  const [usePublishedUrl, setUsePublishedUrl] = useState(false);

  // Suppress install UI when already running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const shortcutUrl = workspaceInviteUrl || getPreferredAppEntryUrl(usePublishedUrl);
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isDevOrigin =
    typeof window !== 'undefined' && window.location.origin.startsWith('https://ais-dev-');

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  const handleCopyShortcutUrl = async () => {
    try {
      await navigator.clipboard.writeText(shortcutUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Fallback handled by readonly input selection
    }
  };

  const handleDownloadShortcutFile = () => {
    downloadWindowsUrlShortcut(shortcutUrl);
    setDownloadedShortcut(true);
    setTimeout(() => setDownloadedShortcut(false), 3000);
  };

  const buttonClass =
    variant === 'nav'
      ? 'hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5'
      : variant === 'card'
        ? 'h-10 px-4 inline-flex items-center gap-2 rounded-lg text-xs font-semibold text-slate-200 bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        : 'h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        className={buttonClass}
        title="Criar atalho na Área de Trabalho ou instalar como aplicativo"
      >
        {variant !== 'nav' && <MonitorDown className="w-3.5 h-3.5 text-blue-400" />}
        <span>{isInstallable ? 'Instalar Atalho' : 'Atalho Área de Trabalho'}</span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Criar Atalho na Área de Trabalho"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-base font-semibold text-slate-100">
                Criar Atalho na Área de Trabalho
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Fechar janela"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Option 1: One-click Windows/Desktop .url Shortcut File */}
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-100">
                      1. Baixar arquivo de atalho para o computador
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Baixe o atalho pronto e salve (ou mova de Downloads) para a sua{' '}
                      <strong className="text-slate-200">Área de Trabalho</strong>. Depois é só dar
                      dois cliques no ícone para abrir direto.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadShortcutFile}
                    className="h-9 px-3.5 inline-flex items-center gap-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    {downloadedShortcut ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {downloadedShortcut
                        ? 'Atalho Baixado!'
                        : 'Baixar Atalho (.url)'}
                    </span>
                  </button>

                  {isIframe && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors"
                    >
                      <span>Abrir em Nova Guia (para Instalar App)</span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                    </a>
                  )}
                </div>

                {isDevOrigin && !workspaceInviteUrl && (
                  <label className="flex items-start gap-2 text-xs text-slate-300 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={usePublishedUrl}
                      onChange={(e) => setUsePublishedUrl(e.target.checked)}
                      className="mt-0.5 accent-blue-600 rounded"
                    />
                    <span className="leading-relaxed text-slate-400">
                      Usar endereço publicado (<code className="font-mono text-slate-300">ais-pre-...</code>) —{' '}
                      <span className="text-amber-300/90">
                        marque apenas após publicar/compartilhar o app no AI Studio (senão dá erro 404).
                      </span>
                    </span>
                  </label>
                )}
              </div>

              {/* Option 2: Direct Browser App Installation (Chrome / Edge / Safari iOS) */}
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  {isIOS ? (
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <MonitorDown className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>
                    {isIOS
                      ? '2. Adicionar na Tela de Início (iPhone / iPad)'
                      : '2. Instalar como Aplicativo sem barra de navegador (Chrome / Edge)'}
                  </span>
                </div>

                {isIOS ? (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    1. Abra o link no Safari (fora do quadro de edição).<br />
                    2. Toque no botão <strong className="text-slate-200">Compartilhar</strong> na
                    barra inferior.<br />
                    3. Role e toque em <strong className="text-slate-200">Adicionar à Tela de Início</strong>.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    1. Abra o link em uma nova guia no Chrome ou Edge.<br />
                    2. Clique no menu <strong className="text-slate-200">⋮</strong> (canto superior
                    direito) → <strong className="text-slate-200">Transmitir, salvar e compartilhar</strong> →{' '}
                    <strong className="text-slate-200">Criar atalho...</strong> (ou{' '}
                    <strong className="text-slate-200">Instalar aplicativo</strong>).<br />
                    3. Marque <strong className="text-slate-200">Abrir como janela</strong> e clique
                    em Criar. O ícone aparecerá direto na sua Área de Trabalho.
                  </p>
                )}
              </div>

              {/* Direct URL Copy */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 block">
                  Link direto do aplicativo:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shortcutUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full h-9 px-3 bg-[#0B0F17] border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyShortcutUrl()}
                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Sem internet — modo em cache ativo.</span>
    </div>
  );
};
