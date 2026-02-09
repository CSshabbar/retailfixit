import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';
import * as authService from '../services/auth';
import { getDatabase, clearLocalData } from '../services/localDb';
import type { AuthUser } from '../types/auth';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Provides auth state and login/logout functions to the app */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from SecureStore on mount
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await authService.getToken();
        if (savedToken && !authService.isTokenExpired(savedToken)) {
          api.setAuthToken(savedToken);
          const payload = authService.decodeTokenPayload(savedToken);
          setToken(savedToken);
          setUser({
            id: (payload as unknown as Record<string, string>).userId,
            email: payload.email,
            role: payload.role as AuthUser['role'],
            vendorId: payload.vendorId,
            displayName: payload.email,
          });
        } else if (savedToken) {
          // Token expired, clean up
          await authService.removeToken();
          clearLocalData(getDatabase());
        }
      } catch {
        // Failed to restore, start fresh
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Clear any previous user's cached data before loading new user
    clearLocalData(getDatabase());
    const response = await authService.login(email, password);
    await authService.saveToken(response.token);
    api.setAuthToken(response.token);
    setToken(response.token);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.removeToken();
    api.setAuthToken(null);
    clearLocalData(getDatabase());
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to access auth state and functions. Must be used inside AuthProvider. */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
