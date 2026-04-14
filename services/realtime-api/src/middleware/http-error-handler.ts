import type { Express, NextFunction, Request, Response } from "express";

interface StripeLikeError {
  type?: string;
  statusCode?: number;
  message?: string;
  param?: string;
  requestId?: string;
}

interface RegisterHttpErrorHandlerOptions {
  isCorsError: (error: unknown) => boolean;
  loggerError: (message: string, context: Record<string, unknown>) => void;
}

export function registerHttpErrorHandler(app: Express, options: RegisterHttpErrorHandlerOptions): void {
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = String(res.getHeader("x-request-id") ?? "").trim() || undefined;

    if (options.isCorsError(error)) {
      if (!res.headersSent) {
        res.status(403).json({
          error: "CORS not allowed",
          code: "cors_not_allowed",
          requestId,
        });
      }
      return;
    }

    const stripeLikeError = error as StripeLikeError;
    const isStripeError = typeof stripeLikeError?.type === "string" && stripeLikeError.type.startsWith("Stripe");
    const statusCode = Number(stripeLikeError?.statusCode);
    const safeStatus = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600
      ? statusCode
      : 500;

    options.loggerError("http.unhandled_error", {
      requestId,
      path: req.path,
      method: req.method,
      isStripeError,
      statusCode: safeStatus,
      stripeType: stripeLikeError?.type,
      stripeParam: stripeLikeError?.param,
      stripeRequestId: stripeLikeError?.requestId,
      error,
    });

    if (res.headersSent) {
      return;
    }

    if (isStripeError) {
      res.status(safeStatus).json({
        error: stripeLikeError.message || "Billing request failed",
        code: "stripe_request_failed",
        requestId,
      });
      return;
    }

    res.status(500).json({
      error: "Internal server error",
      requestId,
    });
  });
}
