import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import type { LoginResponse } from '../types/auth';

const TOKEN_KEY = 'auth_token';

/** Logs in with email/password and returns the login response */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/api/auth/login', { email, password });
  return response.data;
}

/** Saves the JWT token to secure storage */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** Retrieves the JWT token from secure storage */
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

/** Removes the JWT token from secure storage */
export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Decodes the JWT payload without verification (server already verified) */
export function decodeTokenPayload(token: string): { exp: number; email: string; role: string; vendorId: string | null } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const payload = JSON.parse(atob(parts[1]));
  return payload;
}

/** Checks if a JWT token has expired */
export function isTokenExpired(token: string): boolean {
  try {
    const { exp } = decodeTokenPayload(token);
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}
