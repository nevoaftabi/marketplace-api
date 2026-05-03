import express, { NextFunction, Request, Response, Router } from "express";
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
  WsMessagePayload,
  WsAuthMessage
} from "./schemas.ts";
import rateLimit from "express-rate-limit";
import { authMiddleware, router as authRouter } from "./routes/auth.ts";
import Stripe from "stripe";
import { stripe } from "./stripe.ts";
import { createServer } from "http";
import { WebSocketServer, WebSocket as WS } from "ws";

const app = express();

const {
  PORT,
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  STRIPE_SECRET_KEY,
} = process.env;

if (
  !PORT ||
  !ACCESS_TOKEN_SECRET ||
  !REFRESH_TOKEN_SECRET ||
  !ACCESS_TOKEN_TTL ||
  !REFRESH_TOKEN_TTL ||
  !STRIPE_SECRET_KEY
) {
  throw Error("ERROR: Missing environment variables");
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
});

// Creates an HTTP server manually and passes express into it. 
// This lets websockets and http share the same port
const server = createServer(app);

// Attaches a websocket server to the same http serno ver. Any ws:// connectiosn come here.
const wss = new WebSocketServer({ server });

// An in-memory lookup of userId->socket. When a user A wants to send to user B you look up B's socket
// here and write to it directly 
const clients = new Map<string, WS>();

// fires whenever a new websocket connection is opened. each connection gets its own userId varaible
wss.on("connection", (ws) => {
  let userId: string | null = null;

  // whenever the client sends data, you parse the json and handle it based on msg.type
  ws.on("message", async (data) => {
    const msg = JSON.parse(data.toString());

    // the client sends their own jwt token. you verify it, extract the userId, and storethe socket in clients
    if (msg.type === "auth") {
      
      try {
        const result = WsAuthMessage.safeParse(msg);
        if(!result.success) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth' }));
          return;
        }
        const decoded = jwt.verify(msg.token, ACCESS_TOKEN_SECRET!) as {
          id: string;
        };
        userId = decoded.id;
        clients.set(userId, ws);
        ws.send(JSON.stringify({ type: "auth", success: true }));
      } catch {
        ws.send(JSON.stringify({ type: "auth", success: false }));
        ws.close();
      }
    }
    else if (msg.type === "message") {
      const result = WsMessagePayload.safeParse(msg)
      if(!result.success) {
        ws.send(JSON.stringify({ type: 'error', message: "Invalid message"}));
        return;
      }
      // the client wants to send a chat message
      if (!userId) {
        ws.close();
        return;
      }

      // save the message to the db
      await prisma.message.create({
        data: {
          senderId: userId,
          taskId: msg.taskId,
          content: msg.content,
        },
      });

      // look up recipient socket and send the message in real time
      const recipientSocket = clients.get(msg.recipientId);
      if (recipientSocket) {
        recipientSocket.send(
          JSON.stringify({
            type: "message",
            senderId: userId,
            content: msg.content,
            taskId: msg.taskId,
          }),
        );
      }
    }
  });
  ws.on("close", () => {
    // fires when the connection drops. you can remove the user from clients so you don't try to send 
    // to a dead socket
    if (userId) {
      clients.delete(userId);
    }
  });
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

    let user: Awaited<ReturnType<typeof prisma.user.create>> | null = null;
    try {
      user = await prisma.user.create({
        data: { ...parsed, password: hashedPassword },
      });

      let customer: Stripe.Customer | null = await stripe.customers.create({
        email: parsed.email,
      });

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          stripeCustomerId: customer.id,
        },
      });
    } catch (stripeError) {
      await prisma.user.delete({
        where: {
          id: user?.id,
        },
      });

      return res.sendStatus(500);
    }

    return res.sendStatus(201);
  } catch (e) {
    if (e instanceof ZodError)
      return res.status(400).json(e.flatten().fieldErrors);
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return res.status(409).json({ error: "Username or email already taken" });
    }
    return res.sendStatus(500);
  }
});

app.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(LoginSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { username: parsed.username },
    });

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const passwordMatches = await bcrypt.compare(
      parsed.password,
      user.password,
    );
    if (!passwordMatches)
      return res.status(401).json({ message: "Invalid credentials" });

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

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    return res.status(200).json({ accessToken, refreshToken });
  } catch (e) {
    if (e instanceof ZodError)
      return res.status(400).json(e.flatten().fieldErrors);
    return res.sendStatus(500);
  }
});

app.get("/tasks", async (req: Request, res: Response) => {
  let userId: string | null = null;
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    try {
      const token = authHeader.replace("Bearer ", "");
      const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET!) as { id: string };
      userId = decoded.id;
    } catch {}
  }
  try {
    const parsed = parseOrThrow(GetTasksSchema, req.query);
    const skip = (parsed.page - 1) * parsed.limit;

    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({
        skip,
        take: parsed.limit,
        select: {
          id: true,
          title: true,
          description: true,
          pay: true,
          user: { select: { username: true } },
          claim: { select: { userId: true } },
        },
        where: {
          OR: [{ claim: null }, { claim: { userId: userId ?? undefined } }],
        },
      }),
      prisma.task.count(),
    ]);

    return res.status(200).json({
      tasks: tasks.map(({ user, claim, pay, ...rest }) => ({
        ...rest,
        pay: parseFloat(pay.toString()),
        username: user.username,
        claimed: userId ? claim?.userId === userId : false,
      })),
      total,
      page: parsed.page,
      limit: parsed.limit,
    });
  } catch (error) {
    if (error instanceof ZodError)
      return res.status(400).json(error.flatten().fieldErrors);
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

const ensureStripeCustomers = async () => {
  const users = await prisma.user.findMany({
    where: {
      stripeCustomerId: null,
    },
  });

  for (const user of users) {
    const customer = await stripe.customers.create({
      email: user.email,
    });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        stripeCustomerId: customer.id,
      },
    });
  }
};

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// app.listen(3000, async () => {
//   //await ensureStripeCustomers();
//   console.log(`Listening on port ${PORT}`);
// });
