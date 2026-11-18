import React, { useState } from 'react';
import { Check, Lock, LockOpen, Pencil, Trash2, X } from 'lucide-react';
import { CompanyType, MileageEntry, WeekClosure } from '../types';
import {
  applyDateMask,
  formatKm,
  parseAndValidateDate,
  sortEntriesChronologically,
  VALIDATION_LIMITS,
} from '../lib/validation';

interface CompanyColumnProps {
  company: CompanyType;
  totalWeeks: number;
  activeWeekNumber: number;
  weeks: Record<number, WeekClosure>;
  entries: MileageEntry[];
  searchQuery: string;
  highlightedEntryId: string | null;
  onUpdateEntry: (params: {
    entryId: string;
    company: CompanyType;
    dateDisplay: string;
    dateSortKey: string;
    kmStart: number;
    kmEnd: number;
    description: string;
  }) => Promise<void>;
  onRequestDeleteEntry: (entry: MileageEntry) => void;
  onRequestReopenWeek: (weekNumber: number) => void;
}

export const CompanyColumn: React.FC<CompanyColumnProps> = ({
  company,
  totalWeeks,
  activeWeekNumber,
  weeks,
  entries,
  searchQuery,
  highlightedEntryId,
  onUpdateEntry,
  onRequestDeleteEntry,
  onRequestReopenWeek,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editKmStart, setEditKmStart] = useState('');
  const [editKmEnd, setEditKmEnd] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const companyEntries = entries.filter((e) => e.company === company);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  // Monthly company total uses locked week totals for closed weeks and live sum for open weeks
  let companyMonthTotal = 0;
  for (let w = 1; w <= totalWeeks; w++) {
    const wDoc = weeks[w];
    if (wDoc?.isLocked) {
      companyMonthTotal += company === 'V1' ? wDoc.lockedTotalV1 : wDoc.lockedTotalUP;
    } else {
      companyMonthTotal += companyEntries
        .filter((e) => e.weekNumber === w)
        .reduce((acc, item) => acc + item.kmResult, 0);
    }
  }

  const startEditing = (entry: MileageEntry) => {
    setEditingId(entry.id);
    setEditDate(entry.dateDisplay);
    setEditKmStart(String(entry.kmStart));
    setEditKmEnd(String(entry.kmEnd));
    setEditDescription(entry.description);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEditing = async (entry: MileageEntry) => {
    setEditError(null);
    const parsedDate = parseAndValidateDate(editDate);
    if (!parsedDate.valid) {
      setEditError(parsedDate.error || 'Data inválida.');
      return;
    }

    if (editKmStart.trim() === '' || editKmEnd.trim() === '') {
      setEditError('Informe KM Inicial e KM Final.');
      return;
    }

    const kmStart = Number(editKmStart);
    const kmEnd = Number(editKmEnd);

    if (
      Number.isNaN(kmStart) ||
      Number.isNaN(kmEnd) ||
      kmStart < 0 ||
      kmEnd < 0 ||
      kmStart > VALIDATION_LIMITS.maxKmValue ||
      kmEnd > VALIDATION_LIMITS.maxKmValue
    ) {
      setEditError('KM inválido.');
      return;
    }

    if (kmEnd < kmStart) {
      setEditError('KM Final não pode ser menor que o KM Inicial.');
      return;
    }

    const trimmedDesc = editDescription.trim();
    if (!trimmedDesc) {
      setEditError('Informe a descrição.');
      return;
    }

    setSavingEdit(true);
    try {
      await onUpdateEntry({
        entryId: entry.id,
        company: entry.company,
        dateDisplay: parsedDate.dateDisplay,
        dateSortKey: parsedDate.dateSortKey,
        kmStart,
        kmEnd,
        description: trimmedDesc,
      });
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar alteração.');
    } finally {
      setSavingEdit(false);
    }
  };

  const accentText = company === 'V1' ? 'text-blue-400' : 'text-emerald-400';
  const weekNumbers = Array.from({ length: Math.max(totalWeeks, 1) }, (_, idx) => idx + 1);

  return (
    <section aria-label={`Tabela ${company}`} className="space-y-4 min-w-0">
      {/* Column Header on Canvas (No nested card wrapper) */}
      <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
            Tabela {company}
          </h2>
          <span className="text-xs text-slate-400">
            · {companyEntries.length}{' '}
            {companyEntries.length === 1 ? 'registro no mês' : 'registros no mês'}
          </span>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 mr-2">Acumulado {company}:</span>
          <span className={`text-base font-mono tabular-nums font-semibold ${accentText}`}>
            {formatKm(companyMonthTotal)} km
          </span>
        </div>
      </div>

      {/* Sequential Weekly Tables */}
      <div className="space-y-5">
        {weekNumbers.map((weekNum) => {
          const weekDoc = weeks[weekNum];
          const isLocked = Boolean(weekDoc?.isLocked);
          const isActiveOpen = weekNum === activeWeekNumber && !isLocked;

          const allWeekEntries = sortEntriesChronologically(
            companyEntries.filter((e) => e.weekNumber === weekNum),
          );

          const visibleWeekEntries = normalizedQuery
            ? allWeekEntries.filter(
                (e) =>
                  e.description.toLowerCase().includes(normalizedQuery) ||
                  e.dateDisplay.includes(normalizedQuery) ||
                  e.authorName.toLowerCase().includes(normalizedQuery),
              )
            : allWeekEntries;

          const liveWeekTotal = allWeekEntries.reduce((acc, item) => acc + item.kmResult, 0);
          const displayWeekTotal = isLocked
            ? company === 'V1'
              ? weekDoc?.lockedTotalV1 ?? liveWeekTotal
              : weekDoc?.lockedTotalUP ?? liveWeekTotal
            : liveWeekTotal;

          return (
            <div
              key={`${company}-W${weekNum}`}
              className={`bg-[#111827] border rounded-xl overflow-hidden ${
                isActiveOpen ? 'border-slate-700' : 'border-slate-800/90'
              }`}
            >
              {/* Week Header Bar */}
              <div className="px-4 py-3 bg-[#0F1624] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  {isLocked ? (
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <LockOpen className={`w-3.5 h-3.5 shrink-0 ${accentText}`} />
                  )}
                  <span className="text-sm font-semibold text-slate-100">
                    Semana {weekNum}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span className={isLocked ? 'text-slate-400' : accentText}>
                    {isLocked ? 'Fechada (Edição bloqueada)' : 'Aberta para lançamentos'}
                  </span>
                </div>

                {isLocked && (
                  <button
                    type="button"
                    onClick={() => onRequestReopenWeek(weekNum)}
                    className="text-xs font-medium text-slate-300 hover:text-white underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Reabrir Semana
                  </button>
                )}
              </div>

              {/* High-Density Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400 bg-[#111827]">
                      <th className="py-2.5 pl-4 pr-2 whitespace-nowrap">Data</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">KM Inicial</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">KM Final</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">Resultado (KM)</th>
                      <th className="py-2.5 px-3">Descrição</th>
                      <th className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {visibleWeekEntries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-7 px-4 text-center text-xs text-slate-500"
                        >
                          {normalizedQuery
                            ? 'Nenhum registro encontrado para a busca atual nesta semana.'
                            : isLocked
                              ? `Semana ${weekNum} encerrada sem lançamentos para ${company}.`
                              : `Nenhum registro na Semana ${weekNum} para ${company}. Utilize o formulário acima para adicionar.`}
                        </td>
                      </tr>
                    ) : (
                      visibleWeekEntries.map((entry) => {
                        const isRowEditing = editingId === entry.id && !isLocked;
                        const isHighlighted = highlightedEntryId === entry.id;

                        if (isRowEditing) {
                          const startNum = Number(editKmStart);
                          const endNum = Number(editKmEnd);
                          const previewDiff =
                            editKmStart.trim() !== '' &&
                            editKmEnd.trim() !== '' &&
                            !Number.isNaN(startNum) &&
                            !Number.isNaN(endNum)
                              ? Math.round((endNum - startNum) * 100) / 100
                              : null;

                          return (
                            <React.Fragment key={entry.id}>
                              <tr className="bg-slate-800/40">
                                <td className="py-2 pl-4 pr-1.5">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={editDate}
                                    onChange={(e) => setEditDate(applyDateMask(e.target.value))}
                                    aria-label="Editar Data"
                                    className="w-28 h-8 px-2 bg-[#0B0F17] border border-slate-600 rounded text-xs font-mono tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-2 px-1.5 text-right">
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={editKmStart}
                                    onChange={(e) => setEditKmStart(e.target.value)}
                                    aria-label="Editar KM Inicial"
                                    className="w-24 h-8 px-2 bg-[#0B0F17] border border-slate-600 rounded text-xs font-mono tabular-nums text-right text-slate-100 focus:border-blue-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-2 px-1.5 text-right">
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={editKmEnd}
                                    onChange={(e) => setEditKmEnd(e.target.value)}
                                    aria-label="Editar KM Final"
                                    className="w-24 h-8 px-2 bg-[#0B0F17] border border-slate-600 rounded text-xs font-mono tabular-nums text-right text-slate-100 focus:border-blue-500 focus:outline-none"
                                  />
                                </td>
                                <td
                                  className={`py-2 px-2 text-right font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
                                    previewDiff !== null && previewDiff < 0
                                      ? 'text-red-400'
                                      : 'text-emerald-400'
                                  }`}
                                >
                                  {previewDiff !== null ? `${formatKm(previewDiff)} km` : '—'}
                                </td>
                                <td className="py-2 px-2">
                                  <input
                                    type="text"
                                    maxLength={VALIDATION_LIMITS.descriptionMaxLength}
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    aria-label="Editar Descrição"
                                    className="w-full min-w-[140px] h-8 px-2 bg-[#0B0F17] border border-slate-600 rounded text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-2 pl-2 pr-4 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={savingEdit}
                                      onClick={() => void saveEditing(entry)}
                                      title="Salvar alteração"
                                      aria-label="Salvar alteração"
                                      className="p-1.5 rounded text-emerald-400 hover:bg-emerald-950/60 transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingEdit}
                                      onClick={cancelEditing}
                                      title="Cancelar edição"
                                      aria-label="Cancelar edição"
                                      className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {editError && (
                                <tr className="bg-red-950/20">
                                  <td colSpan={6} className="py-1.5 px-4 text-xs text-red-300">
                                    {editError}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        }

                        return (
                          <tr
                            key={entry.id}
                            className={`transition-colors hover:bg-slate-800/35 ${
                              isHighlighted ? 'bg-blue-950/40' : ''
                            }`}
                          >
                            <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-xs text-slate-200 whitespace-nowrap">
                              {entry.dateDisplay}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                              {formatKm(entry.kmStart)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                              {formatKm(entry.kmEnd)}
                            </td>
                            <td
                              className={`py-2.5 px-2 text-right font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${accentText}`}
                            >
                              {formatKm(entry.kmResult)} km
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-200">
                              <div className="line-clamp-2 break-words" title={entry.description}>
                                {entry.description}
                              </div>
                            </td>
                            <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
                              {isLocked ? (
                                <span
                                  className="text-xs text-slate-600 select-none"
                                  title="Semana fechada"
                                >
                                  Travado
                                </span>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditing(entry)}
                                    title="Editar linha"
                                    aria-label={`Editar lançamento de ${entry.dateDisplay}`}
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRequestDeleteEntry(entry)}
                                    title="Excluir linha"
                                    aria-label={`Excluir lançamento de ${entry.dateDisplay}`}
                                    className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* Weekly Footer Total Row */}
                  <tfoot>
                    <tr
                      className={`border-t border-slate-800 ${
                        isLocked ? 'bg-[#0D1422]' : 'bg-[#0F1624]/60'
                      }`}
                    >
                      <td colSpan={3} className="py-3 pl-4 pr-2 text-xs font-semibold text-slate-200">
                        {isLocked
                          ? `Total de KM Rodados da Semana ${weekNum} (Fixado)`
                          : `Subtotal Parcial — Semana ${weekNum}`}
                      </td>
                      <td
                        className={`py-3 px-2 text-right font-mono tabular-nums text-sm font-semibold whitespace-nowrap ${
                          isLocked ? 'text-slate-100' : accentText
                        }`}
                      >
                        {formatKm(displayWeekTotal)} km
                      </td>
                      <td colSpan={2} className="py-3 pl-3 pr-4 text-right text-xs text-slate-400">
                        {allWeekEntries.length}{' '}
                        {allWeekEntries.length === 1 ? 'viagem' : 'viagens'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
