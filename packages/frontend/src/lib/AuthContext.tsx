import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === '1';
const LOCAL_TOKEN = 'local-admin-token';
const LOCAL_USER_KEY = 'metro.localUser';

interface AuthState {
  user: { username: string; groups: string[] } | null;
  isLoading: boolean;
  isAdmin: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true, isAdmin: false });

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    if (LOCAL_MODE) {
      const stored = localStorage.getItem(LOCAL_USER_KEY);
      if (stored) {
        setState({ user: { username: stored, groups: ['admin'] }, isLoading: false, isAdmin: true });
      } else {
        setState({ user: null, isLoading: false, isAdmin: false });
      }
      return;
    }
    try {
      const cognitoUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const groups = (session.tokens?.accessToken?.payload['cognito:groups'] as string[]) ?? [];
      setState({
        user: { username: cognitoUser.username, groups },
        isLoading: false,
        isAdmin: groups.includes('admin')
      });
    } catch {
      setState({ user: null, isLoading: false, isAdmin: false });
    }
  }

  async function login(username: string, password: string) {
    if (LOCAL_MODE) {
      if (!username || !password) throw new Error('Usuario y contraseña requeridos');
      localStorage.setItem(LOCAL_USER_KEY, username);
      await checkAuth();
      return;
    }
    await signIn({ username, password });
    await checkAuth();
  }

  async function logout() {
    if (LOCAL_MODE) {
      localStorage.removeItem(LOCAL_USER_KEY);
      setState({ user: null, isLoading: false, isAdmin: false });
      return;
    }
    await signOut();
    setState({ user: null, isLoading: false, isAdmin: false });
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
    <AuthContext.Provider value={{ ...state, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
