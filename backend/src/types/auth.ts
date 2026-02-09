/** Available user roles in the system */
export type UserRole = 'admin' | 'dispatcher' | 'technician';

/** User document as stored in Cosmos DB Users container */
export interface UserDocument {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  vendorId: string | null;
  tenantId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

/** JWT token payload claims */
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  vendorId: string | null;
}

/** Request body for POST /api/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Successful login response */
export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    vendorId: string | null;
    displayName: string;
  };
}

/** Standard error response body */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

// Augment Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
