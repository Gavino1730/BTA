import express, { type Express } from "express";
import path from "path";

interface RegisterCoachShellRoutesOptions {
  coachDist: string;
  removedLegacyCoachRoutes: readonly string[];
}

export function registerCoachStaticRoutes(app: Express, options: RegisterCoachShellRoutesOptions): void {
  app.use(express.static(options.coachDist, { index: false }));

  app.get([...options.removedLegacyCoachRoutes], (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}

export function registerCoachCatchAllRoute(app: Express, coachDist: string): void {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(coachDist, "index.html"), (err) => {
      if (err) {
        res.status(404).json({ error: "Not found" });
      }
    });
  });
}
