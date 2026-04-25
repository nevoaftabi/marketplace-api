// TODO:
// Refactor the code to use parseOrThrow
// Rate limiting
// Owner can reject or accept claims

import express, { NextFunction, Request, Response } from "express";
import { prisma } from "./db";
import { z, ZodError } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "../generated/prisma/client.ts";
import jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
import {
  CreateTaskBody,
  GetTaskParams,
  LoginSchema,
  RegisterSchema,
  DeleteTaskParams,
  UpdateTaskParams,
  UpdateTaskBody,
  CreateClaimParams,
  GetTaskClaimParams,
} from "./schemas.ts";
import rateLimit from "express-rate-limit";

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

// Tracks how many requests each IP address makes within a time window
// Once an IP exceeds the limit, it returns a 429 response and blocks further requests until the window resets
// Each IP gets 100 requests per 15 minutes before getting blocked
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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
    const decoded = jwt.verify(parsed.refreshToken, REFRESH_TOKEN_SECRET) as {
      id: string;
    };

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },
    });

    if (user?.refreshToken !== parsed.refreshToken) {
      return res.sendStatus(401);
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
      },
    );

    return res.status(200).json({ accessToken });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.sendStatus(401);
    }

    return res.sendStatus(500);
  }
});

app.use("/auth", (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeaders = req.headers["authorization"] || res.sendStatus(401);
    const token = authHeaders.toString().replace("Bearer ", "");

    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

    // res.locals is an object used to store request-specific variables that are passed
    // directly to the view engine during the rendeing proceess
    res.locals.user = decoded;
    next();
  } catch (e) {
    res.sendStatus(401);
  }
});

app.get("/health", (_, res: Response) => {
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
    if (e instanceof ZodError) {
      return res.sendStatus(400);
    }

    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return res.status(409).json({ error: "Username or email already taken" });
    }

    return res.sendStatus(500);
  }
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

app.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(LoginSchema, req.body);
    const user = await prisma.user.findUnique({
      where: {
        username: parsed.username,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatches = await bcrypt.compare(
      parsed.password,
      user.password,
    );

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
      },
    );

    const refreshToken = jwt.sign(
      { id: user.id, username: user.username },
      REFRESH_TOKEN_SECRET,
      {
        expiresIn: REFRESH_TOKEN_TTL as SignOptions["expiresIn"],
      },
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: { refreshToken },
    });

    return res.status(200).json({ accessToken, refreshToken });
  } catch (e) {
    if (e instanceof ZodError) {
      return res.sendStatus(400);
    }
    return res.sendStatus(500);
  }
});

const GetTasksSchema = z.object({
  page: z.coerce.number().min(1).max(10).default(1),
  limit: z.coerce.number(),
});

app.get("/tasks", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(GetTasksSchema, req.query);
    const skip = (parsed.page - 1) * 10;

    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({ skip, take: parsed.limit }),
      prisma.task.count(),
    ]);

    return res
      .status(200)
      .json({ tasks, total, page: parsed.page, limit: parsed.limit });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }

    return res.sendStatus(500);
  }
});

app.post("/auth/tasks", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(CreateTaskBody, req.body);
    await prisma.task.create({
      data: {
        description: parsed.description,
        pay: parsed.pay,
        title: parsed.title,

        // prisma needs a relation to connect
        user: { connect: { id: res.locals.user.id } },
      },
    });

    return res.sendStatus(201);
  } catch (e) {
    if (e instanceof ZodError) {
      return res.sendStatus(400);
    }
    return res.sendStatus(500);
  }
});

const AcceptClaimSchema = z.object({
  id: z.uuid(),
});

app.post(
  "/auth/tasks/:id/claim/accept",
  async (req: Request, res: Response) => {
    try {
      const parsed = parseOrThrow(AcceptClaimSchema, req.params);

      const task = await prisma.task.findUnique({
        where: {
          id: parsed.id,
          userId: res.locals.user.id
        }
      });

      const claim = await prisma.claim.findUnique({ where: { taskId: parsed.id }});

      if(!claim) return res.sendStatus(404);
      if(claim.accepted) return res.sendStatus(409);

      await prisma.claim.update({
        where: {
          taskId: parsed.id,
        },
        data: {
          accepted: true,
        },
      });

      return res.sendStatus(200);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.sendStatus(400);
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return res.sendStatus(404);
      }

      return res.sendStatus(500);
    }
  },
);

app.delete("/auth/tasks/:id", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(DeleteTaskParams, req.params);

    await prisma.task.delete({
      where: {
        id: parsed.id,
        userId: res.locals.user.id,
      },
    });

    return res.sendStatus(200);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.sendStatus(404);
    }

    return res.sendStatus(500);
  }
});

// Secure this route later
app.get("/auth/users", async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        password: false,
      },
    });
    return res.status(200).json(users);
  } catch (e) {
    return res.sendStatus(500);
  }
});

app.get("/auth/tasks/:id/claim", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(GetTaskClaimParams, req.params);
    const claim = await prisma.claim.findUnique({
      where: {
        taskId: parsed.id,
      },
    });

    return res.status(200).json(claim);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.sendStatus(404);
    }

    return res.sendStatus(500);
  }
});

app.post("/auth/tasks/:id/claim", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(CreateClaimParams, req.params);

    await prisma.claim.create({
      data: {
        taskId: parsed.id,
        userId: res.locals.user.id,
      },
    });

    return res.sendStatus(201);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ error: "Task has already been claimed" });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2025" || error.code === "P2003")
    ) {
      return res.sendStatus(404);
    }

    return res.sendStatus(500);
  }
});

app.patch("/auth/tasks/:id", async (req: Request, res: Response) => {
  try {
    const parsedParams = parseOrThrow(UpdateTaskParams, req.params);
    const parsedBody = parseOrThrow(UpdateTaskBody, req.body);

    await prisma.task.update({
      data: parsedBody,
      where: {
        id: parsedParams.id,
        userId: res.locals.user.id,
      },
    });

    return res.sendStatus(200);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.sendStatus(404);
    }

    return res.sendStatus(500);
  }
});

const parseOrThrow = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
};

app.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(GetTaskParams, req.params);

    const task = await prisma.task.findUnique({
      where: {
        id: parsed.id,
      },
    });

    return res.status(200).json(task);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }

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
