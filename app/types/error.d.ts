export interface ErrorResponse {
  __handled__?: boolean;
  _data?: {
    message?: string;
  };
}

export interface HandledError {
  __handled__?: boolean;
  response?: ErrorResponse;
}