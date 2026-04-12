interface PasswordResetRequestResponseOptions {
  message: string;
  expiresInMinutes: number;
  resetPath: string;
  resetToken: string;
  exposeResetMaterials: boolean;
}

export interface PasswordResetRequestResponse {
  message: string;
  expiresInMinutes: number;
  resetPath?: string;
  resetToken?: string;
}

export function buildPasswordResetRequestResponse(options: PasswordResetRequestResponseOptions): PasswordResetRequestResponse {
  const response: PasswordResetRequestResponse = {
    message: options.message,
    expiresInMinutes: options.expiresInMinutes,
  };

  if (options.exposeResetMaterials) {
    response.resetPath = options.resetPath;
    response.resetToken = options.resetToken;
  }

  return response;
}