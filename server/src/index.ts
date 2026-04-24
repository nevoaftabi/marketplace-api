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

    return res.status(200).json({accessToken});
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
    console.log(e);
  }
});

app.get("/health", (_, res: Response) => {
  return res.sendStatus(200);
});

app.post("/register", async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

  try {
    await prisma.user.create({
      data: { ...parsed.data, password: hashedPassword },
    });

    return res.sendStatus(201);
  } catch (e) {
    console.log(e);

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
  const parsed = LoginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        username: parsed.data?.username,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatches = await bcrypt.compare(
      parsed.data.password,
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
    console.log(e);
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
    console.log(error);
    if (error instanceof ZodError) {
      return res.sendStatus(400);
    }

    return res.sendStatus(500);
  }
});

app.post("/auth/tasks", async (req: Request, res: Response) => {
  try {
    const parsed = CreateTaskBody.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    await prisma.task.create({
      data: {
        description: parsed.data.description,
        pay: parsed.data.pay,
        title: parsed.data.title,

        // prisma needs a relation to connect
        user: { connect: { id: res.locals.user.id } },
      },
    });

    return res.sendStatus(201);
  } catch (e) {
    console.log(e);
    return res.sendStatus(500);
  }
});

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
    console.log(error);
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
    console.log(e);

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
    console.log(error);

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
    console.log(error);
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
    console.log(error);

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
