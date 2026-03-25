export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'other';

export interface Account {
  id: string;
  itemId: string;
  name: string;
  type: AccountType;
  subType: string | null;
  balance: number;
  liveBalance: number | null;
  hasLiveBalance: boolean;
  limit: number | null;
  mask: string | null;
  color: string | null;
  institutionId: string | null;
  isManual: boolean;
  isUserHidden: boolean;
  isUserClosed: boolean;
  latestBalanceUpdate: string | null;
  hasHistoricalUpdates: boolean;
}

export interface AccountFilter {
  types?: AccountType[];
  includeHidden?: boolean;
  includeClosed?: boolean;
}
