import express, { NextFunction, Request, Response } from "express";
import { prisma } from "./db.ts";
import { ZodError } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "../generated/prisma/client.ts";
import jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
import {
  GetTaskParams,
  LoginSchema,
  RegisterSchema,
  GetTasksSchema,
  RefreshTokenSchema,
  parseOrThrow,
} from "./schemas.ts";
import rateLimit from "express-rate-limit";
import { authMiddleware, router as authRouter } from "./routes/auth.ts";

const app = express();

const {
  PORT,
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} = process.env;

if (
  !PORT ||
  !ACCESS_TOKEN_SECRET ||
  !REFRESH_TOKEN_SECRET ||
  !ACCESS_TOKEN_TTL ||
  !REFRESH_TOKEN_TTL
) {
  throw Error("ERROR: Missing environment variables");
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
});

app.use(limiter);
app.use(express.json());

app.use("/", (req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} - ${req.url}`);
  next();
});

app.post("/auth/refresh", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(RefreshTokenSchema, req.body);
    const decoded = jwt.verify(parsed.refreshToken, REFRESH_TOKEN_SECRET) as { id: string };

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (user?.refreshToken !== parsed.refreshToken) {
      return res.sendStatus(401);
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username },
      ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL as SignOptions["expiresIn"] },
    );

    return res.status(200).json({ accessToken });
  } catch (error) {
    if (error instanceof ZodError) return res.sendStatus(400);
    if (error instanceof jwt.JsonWebTokenError) return res.sendStatus(401);
    return res.sendStatus(500);
  }
});

app.use("/auth", authMiddleware, authRouter);

app.get("/health", (_: Request, res: Response) => {
  return res.sendStatus(200);
});

app.post("/register", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(RegisterSchema, req.body);
    const hashedPassword = await bcrypt.hash(parsed.password, 10);
    await prisma.user.create({
      data: { ...parsed, password: hashedPassword },
    });
    return res.sendStatus(201);
  } catch (e) {
    if (e instanceof ZodError) return res.sendStatus(400);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ error: "Username or email already taken" });
    }
    return res.sendStatus(500);
  }
});

app.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(LoginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { username: parsed.username } });

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const passwordMatches = await bcrypt.compare(parsed.password, user.password);
    if (!passwordMatches) return res.status(401).json({ message: "Invalid credentials" });

    const accessToken = jwt.sign(
      { id: user.id, username: user.username },
      ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL as SignOptions["expiresIn"] },
    );

    const refreshToken = jwt.sign(
      { id: user.id, username: user.username },
      REFRESH_TOKEN_SECRET,
      { expiresIn: REFRESH_TOKEN_TTL as SignOptions["expiresIn"] },
    );

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    return res.status(200).json({ accessToken, refreshToken });
  } catch (e) {
    if (e instanceof ZodError) return res.sendStatus(400);
    return res.sendStatus(500);
  }
});

app.get("/tasks", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(GetTasksSchema, req.query);
    const skip = (parsed.page - 1) * parsed.limit;

    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({
        skip,
        take: parsed.limit,
        select: { id: true, title: true, description: true, pay: true },
      }),
      prisma.task.count(),
    ]);

    return res.status(200).json({
      tasks: tasks.map((t) => ({ ...t, pay: parseFloat(t.pay.toString()) })),
      total,
      page: parsed.page,
      limit: parsed.limit,
    });
  } catch (error) {
    if (error instanceof ZodError) return res.sendStatus(400);
    return res.sendStatus(500);
  }
});

app.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(GetTaskParams, req.params);
    const task = await prisma.task.findUnique({ where: { id: parsed.id } });
    return res.status(200).json(task);
  } catch (error) {
    if (error instanceof ZodError) return res.sendStatus(400);
    return res.sendStatus(500);
  }
});

app.use((err: any, _: Request, res: Response, next: NextFunction) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON" });
  }
  return res.sendStatus(500);
});

app.listen(3000, () => console.log(`Listening on port ${PORT}`));
