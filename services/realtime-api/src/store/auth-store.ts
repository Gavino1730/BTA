import type { LocalAuthAccount, LocalAuthAccountInput, TenantScope } from "./store-types.js";

interface AuthStoreDependencies {
  resolveSchoolId: (scope?: TenantScope) => string;
  trimProfileField: (value: unknown, maxLength: number) => string;
  localAuthAccountsBySchool: Map<string, LocalAuthAccount[]>;
  findLocalAuthAccountByEmailForSchool: (schoolId: string, email: string) => LocalAuthAccount | null;
  upsertLocalAuthAccountForSchool: (schoolId: string, account: LocalAuthAccountInput) => LocalAuthAccount;
  touchLocalAuthAccountLoginForSchool: (schoolId: string, accountId: string) => LocalAuthAccount | null;
  setLocalAuthAccountsForSchool: (schoolId: string, accounts: LocalAuthAccount[]) => LocalAuthAccount[];
  persistSessions: () => void;
  persistLocalAuthAccountsForSchool: (schoolId: string, accounts: LocalAuthAccount[]) => void | Promise<void>;
}

export function createAuthStore(deps: AuthStoreDependencies) {
  const getLocalAuthAccountsByScope = (scope?: TenantScope): LocalAuthAccount[] => {
    return deps.localAuthAccountsBySchool.get(deps.resolveSchoolId(scope)) ?? [];
  };

  const getLocalAuthAccountByEmail = (email: string, scope?: TenantScope): LocalAuthAccount | null => {
    const schoolId = deps.resolveSchoolId(scope);
    return deps.findLocalAuthAccountByEmailForSchool(schoolId, email);
  };

  const getLocalAuthAccountsByEmailAcrossSchools = (email: string): LocalAuthAccount[] => {
    const normalizedEmail = deps.trimProfileField(email, 160).toLowerCase();
    if (!normalizedEmail) {
      return [];
    }

    return Array.from(deps.localAuthAccountsBySchool.values())
      .flat()
      .filter((account) => account.email === normalizedEmail);
  };

  const saveLocalAuthAccount = (account: LocalAuthAccountInput, scope?: TenantScope): LocalAuthAccount => {
    const schoolId = deps.resolveSchoolId(scope);
    const saved = deps.upsertLocalAuthAccountForSchool(schoolId, account);
    deps.persistSessions();
    void deps.persistLocalAuthAccountsForSchool(schoolId, deps.localAuthAccountsBySchool.get(schoolId) ?? []);
    return saved;
  };

  const recordLocalAuthLogin = (accountId: string, scope?: TenantScope): LocalAuthAccount | null => {
    const schoolId = deps.resolveSchoolId(scope);
    const saved = deps.touchLocalAuthAccountLoginForSchool(schoolId, accountId);
    deps.persistSessions();
    if (saved) {
      void deps.persistLocalAuthAccountsForSchool(schoolId, deps.localAuthAccountsBySchool.get(schoolId) ?? []);
    }
    return saved;
  };

  const deleteLocalAuthAccount = (accountId: string, scope?: TenantScope): boolean => {
    const schoolId = deps.resolveSchoolId(scope);
    const accounts = deps.localAuthAccountsBySchool.get(schoolId) ?? [];
    const next = accounts.filter((account) => account.accountId !== accountId);
    if (next.length === accounts.length) {
      return false;
    }

    deps.setLocalAuthAccountsForSchool(schoolId, next);
    deps.persistSessions();
    void deps.persistLocalAuthAccountsForSchool(schoolId, next);
    return true;
  };

  return {
    getLocalAuthAccountsByScope,
    getLocalAuthAccountByEmail,
    getLocalAuthAccountsByEmailAcrossSchools,
    saveLocalAuthAccount,
    recordLocalAuthLogin,
    deleteLocalAuthAccount,
  };
}
