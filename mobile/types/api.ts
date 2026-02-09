/** Response from the GET /api/health endpoint */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  environment: string;
  services: {
    api: string;
    cosmosDb: string;
  };
  version: string;
}

/** Generic wrapper for API responses */
export interface ApiResponse<T> {
  data: T;
  status: number;
}
