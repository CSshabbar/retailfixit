import { config } from '../constants/config';
import type { ApiResponse } from '../types/api';

/** API error with HTTP status code for conflict detection */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

/** Centralized API client for all HTTP communication with the backend */
class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /** Sets the auth token for subsequent requests */
  setAuthToken(token: string | null): void {
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /** Performs a GET request with typed response, 10s timeout, and error handling */
  async get<T>(path: string): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        const code = body?.error?.code || `HTTP_${response.status}`;
        throw new ApiError(response.status, code, message);
      }

      const data = (await response.json()) as T;
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 10 seconds');
      }
      throw error;
    }
  }

  /** Performs a POST request with typed response, 10s timeout, and error handling */
  async post<T>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        const code = errorBody?.error?.code || `HTTP_${response.status}`;
        throw new ApiError(response.status, code, message);
      }

      const data = (await response.json()) as T;
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 10 seconds');
      }
      throw error;
    }
  }
  /** Performs a PATCH request with typed response, 10s timeout, and error handling */
  async patch<T>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        const code = errorBody?.error?.code || `HTTP_${response.status}`;
        throw new ApiError(response.status, code, message);
      }

      const data = (await response.json()) as T;
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 10 seconds');
      }
      throw error;
    }
  }
  /** Uploads a file via multipart/form-data */
  async uploadFile<T>(path: string, uri: string, fieldName: string, mimeType: string): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for uploads

    try {
      const fileName = uri.split('/').pop() || 'photo.jpg';
      const formData = new FormData();
      formData.append(fieldName, {
        uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);

      const url = `${this.baseUrl}${path}`;
      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        const code = errorBody?.error?.code || `HTTP_${response.status}`;
        throw new ApiError(response.status, code, message);
      }

      const data = (await response.json()) as T;
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Upload timed out after 30 seconds');
      }
      throw error;
    }
  }

  /** Performs a DELETE request */
  async delete<T>(path: string): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        const code = body?.error?.code || `HTTP_${response.status}`;
        throw new ApiError(response.status, code, message);
      }

      const data = (await response.json()) as T;
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 10 seconds');
      }
      throw error;
    }
  }
}

export const api = new ApiClient(config.apiBaseUrl);
