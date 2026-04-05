import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { api } from '../api/client';
import type { AuthResponse, AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  setSession: (response: AuthResponse) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACCESS_TOKEN_KEY = 'mcq_access_token';
const USER_KEY = 'mcq_user';

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export function AuthProvider({ children }: PropsWithChildren) {
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const setSession = (response: AuthResponse) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
  };

  const clearSession = () => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const refreshAccessToken = async () => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = api
        .post<AuthResponse>('/auth/refresh', {})
        .then(({ data }) => {
          setSession(data);
          return data.accessToken;
        })
        .catch(() => {
          clearSession();
          return null;
        })
        .finally(() => {
          refreshInFlight.current = null;
        });
    }

    return refreshInFlight.current;
  };

  useEffect(() => {
    const requestId = api.interceptors.request.use((config) => {
      if (accessToken && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    });

    const responseId = api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as RetryConfig | undefined;
        if (!config || config._retry || error.response?.status !== 401 || config.url?.includes('/auth/refresh')) {
          return Promise.reject(error);
        }

        config._retry = true;
        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) {
          return Promise.reject(error);
        }

        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(config);
      },
    );

    return () => {
      api.interceptors.request.eject(requestId);
      api.interceptors.response.eject(responseId);
    };
  }, [accessToken]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    setSession(data);
  };

  const register = async (email: string, password: string, name?: string) => {
    const { data } = await api.post<AuthResponse>('/auth/register', { email, password, name });
    setSession(data);
  };

  const logout = async () => {
    if (accessToken) {
      await api.post('/auth/logout', {});
    }
    clearSession();
  };

  const value = useMemo(
    () => ({ user, accessToken, login, register, setSession, logout }),
    [user, accessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
