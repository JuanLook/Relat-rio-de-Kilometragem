import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { CompanyType, MONTHS_PT } from '../types';
import {
  applyDateMask,
  formatKm,
  parseAndValidateDate,
  VALIDATION_LIMITS,
} from '../lib/validation';

interface QuickEntryFormProps {
  selectedYear: number;
  selectedMonth: number;
  activeWeekNumber: number;
  isActiveWeekLocked: boolean;
  isSubmitting: boolean;
  onAddEntry: (data: {
    company: CompanyType;
    dateDisplay: string;
    dateSortKey: string;
    kmStart: number;
    kmEnd: number;
    description: string;
  }) => Promise<void>;
}

export const QuickEntryForm: React.FC<QuickEntryFormProps> = ({
  selectedYear,
  selectedMonth,
  activeWeekNumber,
  isActiveWeekLocked,
  isSubmitting,
  onAddEntry,
}) => {
  const [company, setCompany] = useState<CompanyType>('V1');
  const [dateInput, setDateInput] = useState('');
  const [kmStartInput, setKmStartInput] = useState('');
  const [kmEndInput, setKmEndInput] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const dateRef = useRef<HTMLInputElement>(null);

  const selectedMonthName =
    MONTHS_PT.find((m) => m.number === selectedMonth)?.name || `Mês ${selectedMonth}`;

  // Real-time KM calculation & validation
  const kmCalc = useMemo(() => {
    const hasStart = kmStartInput.trim() !== '';
    const hasEnd = kmEndInput.trim() !== '';

    if (!hasStart && !hasEnd) {
      return { ready: false, valid: true, diff: null as number | null, error: null as string | null };
    }

    const startVal = Number(kmStartInput);
    const endVal = Number(kmEndInput);

    if (hasStart && (Number.isNaN(startVal) || startVal < 0 || startVal > VALIDATION_LIMITS.maxKmValue)) {
      return {
        ready: false,
        valid: false,
        diff: null,
        error: 'KM Inicial inválido.',
      };
    }

    if (hasEnd && (Number.isNaN(endVal) || endVal < 0 || endVal > VALIDATION_LIMITS.maxKmValue)) {
      return {
        ready: false,
        valid: false,
        diff: null,
        error: 'KM Final inválido.',
      };
    }

    if (hasStart && hasEnd) {
      if (endVal < startVal) {
        return {
          ready: false,
          valid: false,
          diff: endVal - startVal,
          error: 'KM Final não pode ser menor que o KM Inicial.',
        };
      }
      return {
        ready: true,
        valid: true,
        diff: Math.round((endVal - startVal) * 100) / 100,
        error: null,
      };
    }

    return { ready: false, valid: true, diff: null, error: null };
  }, [kmStartInput, kmEndInput]);

  // Real-time date notice if user typed a valid date from a different month/year than selected module
  const dateStatus = useMemo(() => {
    if (dateInput.length < 10) return null;
    const parsed = parseAndValidateDate(dateInput);
    if (!parsed.valid) {
      return { type: 'error' as const, message: parsed.error || 'Data inválida.' };
    }
    if (parsed.month !== selectedMonth || parsed.year !== selectedYear) {
      const typedMonthName = MONTHS_PT.find((m) => m.number === parsed.month)?.name || parsed.month;
      return {
        type: 'warning' as const,
        message: `Atenção: data pertence a ${typedMonthName}/${parsed.year}, mas será gravada no módulo atual (${selectedMonthName}/${selectedYear}).`,
      };
    }
    return null;
  }, [dateInput, selectedMonth, selectedYear, selectedMonthName]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    setDateInput(applyDateMask(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isActiveWeekLocked) {
      setFormError('Todas as semanas deste mês estão fechadas. Reabra uma semana para lançar.');
      return;
    }

    const parsedDate = parseAndValidateDate(dateInput);
    if (!parsedDate.valid) {
      setFormError(parsedDate.error || 'Informe uma data válida (DD/MM/AAAA).');
      return;
    }

    if (kmStartInput.trim() === '' || kmEndInput.trim() === '') {
      setFormError('Preencha o KM Inicial e o KM Final.');
      return;
    }

    const kmStart = Number(kmStartInput);
    const kmEnd = Number(kmEndInput);

    if (
      Number.isNaN(kmStart) ||
      Number.isNaN(kmEnd) ||
      kmStart < 0 ||
      kmEnd < 0 ||
      kmStart > VALIDATION_LIMITS.maxKmValue ||
      kmEnd > VALIDATION_LIMITS.maxKmValue
    ) {
      setFormError('Valores de quilometragem fora do intervalo permitido.');
      return;
    }

    if (kmEnd < kmStart) {
      setFormError('O KM Final não pode ser menor que o KM Inicial.');
      return;
    }

    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setFormError('Informe a descrição do serviço realizado.');
      return;
    }

    try {
      await onAddEntry({
        company,
        dateDisplay: parsedDate.dateDisplay,
        dateSortKey: parsedDate.dateSortKey,
        kmStart,
        kmEnd,
        description: trimmedDesc,
      });

      // Clear all form inputs while keeping selected company toggle (KM Inicial stays blank!)
      setDateInput('');
      setKmStartInput('');
      setKmEndInput('');
      setDescription('');
      setFormError(null);
      dateRef.current?.focus();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar registro.');
    }
  };

  const activeError = kmCalc.error || (dateStatus?.type === 'error' ? dateStatus.message : null) || formError;

  return (
    <section
      aria-label="Formulário de Entrada Rápida"
      className="bg-[#111827] border border-slate-800 rounded-xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="text-sm font-semibold text-slate-100">Entrada Rápida</span>
          <span aria-hidden="true">·</span>
          <span>
            Destino: Semana {activeWeekNumber} ({isActiveWeekLocked ? 'Fechada' : 'Aberta'})
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {selectedMonthName} / {selectedYear}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          Ordenação cronológica automática por data
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* 1. Company Radio Toggle (V1 / UP) */}
          <div className="md:col-span-2">
            <span className="block text-xs font-medium text-slate-300 mb-1.5">Empresa</span>
            <div
              role="radiogroup"
              aria-label="Seletor de Empresa"
              className="grid grid-cols-2 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg h-10"
            >
              <label
                className={`flex items-center justify-center rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  company === 'V1'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="company"
                  value="V1"
                  checked={company === 'V1'}
                  onChange={() => setCompany('V1')}
                  className="sr-only"
                />
                <span>V1</span>
              </label>

              <label
                className={`flex items-center justify-center rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  company === 'UP'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="company"
                  value="UP"
                  checked={company === 'UP'}
                  onChange={() => setCompany('UP')}
                  className="sr-only"
                />
                <span>UP</span>
              </label>
            </div>
          </div>

          {/* 2. Date Input with Automatic DD/MM/AAAA Mask */}
          <div className="md:col-span-2">
            <label htmlFor="entry-date" className="block text-xs font-medium text-slate-300 mb-1.5">
              Data
            </label>
            <input
              ref={dateRef}
              id="entry-date"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="DD/MM/AAAA"
              maxLength={10}
              value={dateInput}
              onChange={handleDateChange}
              disabled={isActiveWeekLocked || isSubmitting}
              className="w-full h-10 px-3 bg-[#0B0F17] border border-slate-700 focus:border-blue-500 focus:outline-none rounded-lg text-sm font-mono tabular-nums text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
            />
          </div>

          {/* 3. KM Inicial (Always blank initially / after submit) */}
          <div className="md:col-span-2">
            <label
              htmlFor="entry-km-start"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              KM Inicial
            </label>
            <input
              id="entry-km-start"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="Ex: 45120"
              value={kmStartInput}
              onChange={(e) => {
                setFormError(null);
                setKmStartInput(e.target.value);
              }}
              disabled={isActiveWeekLocked || isSubmitting}
              className="w-full h-10 px-3 bg-[#0B0F17] border border-slate-700 focus:border-blue-500 focus:outline-none rounded-lg text-sm font-mono tabular-nums text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
            />
          </div>

          {/* 4. KM Final */}
          <div className="md:col-span-2">
            <label
              htmlFor="entry-km-end"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              KM Final
            </label>
            <input
              id="entry-km-end"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="Ex: 45185"
              value={kmEndInput}
              onChange={(e) => {
                setFormError(null);
                setKmEndInput(e.target.value);
              }}
              disabled={isActiveWeekLocked || isSubmitting}
              className={`w-full h-10 px-3 bg-[#0B0F17] border rounded-lg text-sm font-mono tabular-nums text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-50 ${
                !kmCalc.valid
                  ? 'border-red-500 focus:border-red-400'
                  : 'border-slate-700 focus:border-blue-500'
              }`}
            />
          </div>

          {/* 5. Real-time Calculated Resultado (KM) */}
          <div className="md:col-span-1">
            <span className="block text-xs font-medium text-slate-300 mb-1.5 whitespace-nowrap">
              Resultado
            </span>
            <div
              aria-live="polite"
              className={`h-10 px-2.5 flex items-center justify-end rounded-lg border text-sm font-mono tabular-nums font-semibold ${
                !kmCalc.valid
                  ? 'bg-red-950/30 border-red-800/70 text-red-300'
                  : kmCalc.ready
                    ? 'bg-[#0B0F17] border-slate-700 text-emerald-400'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-500'
              }`}
            >
              {kmCalc.diff !== null ? `${formatKm(kmCalc.diff)} km` : '—'}
            </div>
          </div>

          {/* 6. Service Description */}
          <div className="md:col-span-3">
            <label
              htmlFor="entry-description"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Descrição do Serviço
            </label>
            <div className="flex items-center gap-2">
              <input
                id="entry-description"
                type="text"
                maxLength={VALIDATION_LIMITS.descriptionMaxLength}
                placeholder="Ex: Visita técnica cliente centro"
                value={description}
                onChange={(e) => {
                  setFormError(null);
                  setDescription(e.target.value);
                }}
                disabled={isActiveWeekLocked || isSubmitting}
                className="w-full h-10 px-3 bg-[#0B0F17] border border-slate-700 focus:border-blue-500 focus:outline-none rounded-lg text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isActiveWeekLocked || isSubmitting || !kmCalc.valid}
                className={`h-10 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  company === 'V1'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>{isSubmitting ? 'Salvando...' : 'Adicionar'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Feedback / Validation Messages */}
        {activeError && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs text-red-300 pt-1"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{activeError}</span>
          </div>
        )}

        {!activeError && dateStatus?.type === 'warning' && (
          <div className="flex items-center gap-2 text-xs text-amber-300 pt-1">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{dateStatus.message}</span>
          </div>
        )}
      </form>
    </section>
  );
};
