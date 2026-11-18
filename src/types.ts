import { Timestamp } from 'firebase/firestore';

export type CompanyType = 'V1' | 'UP';

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  memberIds: string[];
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  displayName: string;
  role: 'owner' | 'editor';
  inviteCodeUsed: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MonthModule {
  workspaceId: string;
  monthId: string;
  year: number;
  month: number;
  activeWeekNumber: number;
  totalWeeks: number;
  createdBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface WeekClosure {
  workspaceId: string;
  monthId: string;
  weekId: string;
  weekNumber: number;
  isLocked: boolean;
  lockedTotalV1: number;
  lockedTotalUP: number;
  entryIds: string[];
  createdBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MileageEntry {
  id: string;
  workspaceId: string;
  monthId: string;
  weekId: string;
  weekNumber: number;
  company: CompanyType;
  dateDisplay: string;
  dateSortKey: string;
  kmStart: number;
  kmEnd: number;
  kmResult: number;
  description: string;
  createdBy: string;
  authorName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MonthOption {
  number: number;
  name: string;
  shortName: string;
}

export const MONTHS_PT: MonthOption[] = [
  { number: 1, name: 'Janeiro', shortName: 'Jan' },
  { number: 2, name: 'Fevereiro', shortName: 'Fev' },
  { number: 3, name: 'Março', shortName: 'Mar' },
  { number: 4, name: 'Abril', shortName: 'Abr' },
  { number: 5, name: 'Maio', shortName: 'Mai' },
  { number: 6, name: 'Junho', shortName: 'Jun' },
  { number: 7, name: 'Julho', shortName: 'Jul' },
  { number: 8, name: 'Agosto', shortName: 'Ago' },
  { number: 9, name: 'Setembro', shortName: 'Set' },
  { number: 10, name: 'Outubro', shortName: 'Out' },
  { number: 11, name: 'Novembro', shortName: 'Nov' },
  { number: 12, name: 'Dezembro', shortName: 'Dez' },
];
