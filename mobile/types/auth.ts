/** Available user roles in the system */
export type UserRole = 'admin' | 'dispatcher' | 'technician';

/** Authenticated user info returned from the API */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  vendorId: string | null;
  displayName: string;
}

/** Request body for POST /api/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Successful login response from the API */
export interface LoginResponse {
  token: string;
  user: AuthUser;
}
