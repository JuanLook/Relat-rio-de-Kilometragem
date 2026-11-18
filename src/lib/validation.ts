import blueprint from '../../firebase-blueprint.json';
import { MileageEntry } from '../types';

/**
 * Validation constants extracted directly from firebase-blueprint.json
 * to guarantee strict synchronicity between UI inputs and Firestore rules.
 */
const entryProps = blueprint.entities.MileageEntry.properties;
const workspaceProps = blueprint.entities.Workspace.properties;

export const VALIDATION_LIMITS = {
  descriptionMaxLength: entryProps.description.maxLength ?? 240,
  descriptionMinLength: entryProps.description.minLength ?? 1,
  authorNameMaxLength: entryProps.authorName.maxLength ?? 80,
  workspaceNameMaxLength: workspaceProps.name.maxLength ?? 80,
  inviteCodeMinLength: workspaceProps.inviteCode.minLength ?? 8,
  inviteCodeMaxLength: workspaceProps.inviteCode.maxLength ?? 32,
  spreadsheetIdMaxLength: workspaceProps.spreadsheetId.maxLength ?? 128,
  spreadsheetUrlMaxLength: workspaceProps.spreadsheetUrl.maxLength ?? 300,
  spreadsheetTitleMaxLength: workspaceProps.spreadsheetTitle.maxLength ?? 120,
  dateDisplayRegex: new RegExp(entryProps.dateDisplay.pattern),
  dateSortKeyRegex: new RegExp(entryProps.dateSortKey.pattern),
  safeIdRegex: new RegExp(workspaceProps.ownerId.pattern),
  maxEntriesPerWeek: 100,
  maxWeeksPerMonth: 12,
  maxKmValue: 9999999,
};

/**
 * Formats user numeric input into DD/MM/AAAA mask automatically as digits are typed.
 */
export function applyDateMask(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

export interface ParsedDateResult {
  valid: boolean;
  dateDisplay: string;
  dateSortKey: string;
  day: number;
  month: number;
  year: number;
  error?: string;
}

/**
 * Validates a DD/MM/AAAA string against real calendar rules (including leap years)
 * and produces a chronological YYYY-MM-DD sort key.
 */
export function parseAndValidateDate(value: string): ParsedDateResult {
  const trimmed = value.trim();
  if (trimmed.length < 10) {
    return {
      valid: false,
      dateDisplay: trimmed,
      dateSortKey: '',
      day: 0,
      month: 0,
      year: 0,
      error: 'Digite a data completa no formato DD/MM/AAAA.',
    };
  }

  if (!VALIDATION_LIMITS.dateDisplayRegex.test(trimmed)) {
    return {
      valid: false,
      dateDisplay: trimmed,
      dateSortKey: '',
      day: 0,
      month: 0,
      year: 0,
      error: 'Data inválida. Use o formato DD/MM/AAAA.',
    };
  }

  const [ddStr, mmStr, yyyyStr] = trimmed.split('/');
  const day = Number(ddStr);
  const month = Number(mmStr);
  const year = Number(yyyyStr);

  if (year < 2020 || year > 2100) {
    return {
      valid: false,
      dateDisplay: trimmed,
      dateSortKey: '',
      day,
      month,
      year,
      error: 'O ano deve estar entre 2020 e 2100.',
    };
  }

  // Verify real calendar day (e.g. rejects 31/02 or 31/04)
  const constructed = new Date(year, month - 1, day);
  if (
    constructed.getFullYear() !== year ||
    constructed.getMonth() !== month - 1 ||
    constructed.getDate() !== day
  ) {
    return {
      valid: false,
      dateDisplay: trimmed,
      dateSortKey: '',
      day,
      month,
      year,
      error: 'Dia inexistente para o mês informado.',
    };
  }

  const dateSortKey = `${yyyyStr}-${mmStr}-${ddStr}`;
  if (!VALIDATION_LIMITS.dateSortKeyRegex.test(dateSortKey)) {
    return {
      valid: false,
      dateDisplay: trimmed,
      dateSortKey: '',
      day,
      month,
      year,
      error: 'Formato de data inválido.',
    };
  }

  return {
    valid: true,
    dateDisplay: trimmed,
    dateSortKey,
    day,
    month,
    year,
  };
}

/**
 * Formats Month ID as YYYY_MM matching Firestore blueprint pattern.
 */
export function buildMonthId(year: number, month: number): string {
  return `${year}_${String(month).padStart(2, '0')}`;
}

/**
 * Formats Week ID as W1..W12 matching Firestore blueprint pattern.
 */
export function buildWeekId(weekNumber: number): string {
  return `W${weekNumber}`;
}

/**
 * Sorts mileage entries chronologically ascending by dateSortKey (YYYY-MM-DD),
 * breaking ties deterministically by creation timestamp and ID.
 */
export function sortEntriesChronologically(entries: MileageEntry[]): MileageEntry[] {
  return [...entries].sort((a, b) => {
    const dateCompare = a.dateSortKey.localeCompare(b.dateSortKey);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    const timeA = a.createdAt?.toMillis?.() ?? 0;
    const timeB = b.createdAt?.toMillis?.() ?? 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Formats numeric mileage values using Brazilian locale conventions.
 */
export function formatKm(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(Math.round(value * 100) / 100);
}

/**
 * Sanitizes display strings to fit blueprint volumetric constraints.
 */
export function sanitizeAuthorName(rawName: string | null | undefined): string {
  const cleaned = (rawName ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return 'Colaborador';
  }
  return cleaned.slice(0, VALIDATION_LIMITS.authorNameMaxLength);
}

/**
 * Generates a URL-safe alphanumeric ID matching ^[a-zA-Z0-9_\-]+$.
 */
export function generateSafeId(prefix: string, length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let token = '';
  for (let i = 0; i < length; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return `${prefix}_${token}`;
}

/**
 * Generates a human-friendly uppercase alphanumeric invite code (10 chars).
 */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

/**
 * Extracts a Google Sheets spreadsheetId from either a full Google Docs URL or raw ID.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1].slice(0, VALIDATION_LIMITS.spreadsheetIdMaxLength);
  }
  if (/^[a-zA-Z0-9_-]{15,128}$/.test(trimmed)) {
    return trimmed;
  }
  return '';
}
