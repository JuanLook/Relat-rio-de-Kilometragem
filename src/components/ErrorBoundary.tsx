import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  technicalDetails: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
    technicalDetails: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'Ocorreu um erro inesperado na aplicação.';
    let details: string | null = null;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed === 'object' && 'operationType' in parsed) {
        details = JSON.stringify(parsed, null, 2);
        if (String(parsed.error).includes('Quota exceeded')) {
          readable =
            'O limite diário gratuito de leituras/gravações do banco em nuvem foi atingido. A cota será renovada automaticamente amanhã.';
        } else {
          readable = `Permissão ou validação recusada ao acessar "${parsed.path || 'dados'}" (${parsed.operationType}).`;
        }
      }
    } catch {
      // Plain error message
    }

    return {
      hasError: true,
      errorMessage: readable,
      technicalDetails: details,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught application error:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '', technicalDetails: null });
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-100">
                Não foi possível concluir a operação
              </h1>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{this.state.errorMessage}</p>
            {this.state.technicalDetails && (
              <pre className="text-xs font-mono bg-[#0B0F17] border border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-400">
                {this.state.technicalDetails}
              </pre>
            )}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Recarregar Painel</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
