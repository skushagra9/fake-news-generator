import { Router } from "express";
import { prisma } from "../db";

export const sourcesRouter = Router();

sourcesRouter.get("/", async (_req, res, next) => {
  try {
    const sources = await prisma.source.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, rssUrl: true },
    });
    res.json({ sources });
  } catch (err) {
    next(err);
  }
});
