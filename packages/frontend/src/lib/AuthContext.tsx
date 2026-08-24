import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { signIn, signOut, getCurrentUser, fetchAuthSession, confirmSignIn, updatePassword } from 'aws-amplify/auth';
import {
  UserRole,
  roleFromGroups,
  canManagePhotos as groupsCanManagePhotos,
  canManageUsers as groupsCanManageUsers
} from '@metro/shared';

const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === '1';
const LOCAL_TOKEN = 'local-admin-token';
const LOCAL_USER_KEY = 'metro.localUser';

interface AuthState {
  user: { username: string; email: string; groups: string[] } | null;
  isLoading: boolean;
  role: UserRole;
  /** Upload, tag, edit, rotate, delete photos: admin or editor. */
  canManagePhotos: boolean;
  /** Create, edit and delete users: admin only. */
  canManageUsers: boolean;
}

/** `new-password` means Cognito needs the user to replace a one-use credential. */
export type LoginResult = 'done' | 'new-password';

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<LoginResult>;
  /** Completes the FORCE_CHANGE_PASSWORD challenge started by `login`. */
  completeNewPassword: (newPassword: string) => Promise<void>;
  /** Voluntary change by an already signed-in user. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function stateFromGroups(username: string | null, groups: string[], email = ''): AuthState {
  return {
    // With UsernameAttributes: [email] the Cognito username is a generated
    // UUID, so `email` carries what a human should actually see.
    user: username ? { username, email: email || username, groups } : null,
    isLoading: false,
    role: roleFromGroups(groups),
    canManagePhotos: groupsCanManagePhotos(groups),
    canManageUsers: groupsCanManageUsers(groups)
  };
}

const LOGGED_OUT: AuthState = stateFromGroups(null, []);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...LOGGED_OUT, isLoading: true });

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    if (LOCAL_MODE) {
      const stored = localStorage.getItem(LOCAL_USER_KEY);
      setState(stored ? stateFromGroups(stored, ['admin'], stored) : LOGGED_OUT);
      return;
    }
    try {
      const cognitoUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const groups = (session.tokens?.accessToken?.payload['cognito:groups'] as string[]) ?? [];
      // The access token has no email claim; the id token does.
      const email = (session.tokens?.idToken?.payload?.email as string) ?? '';
      setState(stateFromGroups(cognitoUser.username, groups, email));
    } catch {
      setState(LOGGED_OUT);
    }
  }

  async function login(username: string, password: string): Promise<LoginResult> {
    if (LOCAL_MODE) {
      if (!username || !password) throw new Error('Usuario y contraseña requeridos');
      localStorage.setItem(LOCAL_USER_KEY, username);
      await checkAuth();
      return 'done';
    }
    const { nextStep } = await signIn({ username, password });
    if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      // Session stays half-open inside Amplify until completeNewPassword runs.
      return 'new-password';
    }
    await checkAuth();
    return 'done';
  }

  async function completeNewPassword(newPassword: string) {
    if (LOCAL_MODE) {
      await checkAuth();
      return;
    }
    await confirmSignIn({ challengeResponse: newPassword });
    await checkAuth();
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    if (LOCAL_MODE) return;
    await updatePassword({ oldPassword, newPassword });
  }

  async function logout() {
    if (LOCAL_MODE) {
      localStorage.removeItem(LOCAL_USER_KEY);
      setState(LOGGED_OUT);
      return;
    }
    await signOut();
    setState(LOGGED_OUT);
  }

  async function getToken(): Promise<string | null> {
    if (LOCAL_MODE) {
      return localStorage.getItem(LOCAL_USER_KEY) ? LOCAL_TOKEN : null;
    }
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  }

  return (
    <AuthContext.Provider
      value={{ ...state, login, completeNewPassword, changePassword, logout, getToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
