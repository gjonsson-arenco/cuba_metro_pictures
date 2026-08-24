import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

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
    await signIn({ username, password });
    await checkAuth();
  }

  async function logout() {
    await signOut();
    setState({ user: null, isLoading: false, isAdmin: false });
  }

  async function getToken(): Promise<string | null> {
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
