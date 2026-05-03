import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import {
  parseOrThrow,
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
  StripeSubscribeBody,
  GetTasksSchema,
  GetTaskMessages,
} from "../schemas.ts";
import { prisma } from "../db.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { BASIC_TASKS_ALLOWED, FREE_TASKS_ALLOWED, PRICE_IDS, stripe } from "../stripe";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

if (!ACCESS_TOKEN_SECRET) {
  throw Error("ACCESS_TOKEN_SECRET missing");
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeaders = req.headers["authorization"] || res.sendStatus(401);
    const token = authHeaders.toString().replace("Bearer ", "");
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET!);
    res.locals.user = decoded;
    next();
  } catch (e) {
    res.sendStatus(401);
  }
};

export const router = Router();

router.get("/users", async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, username: true },
    });
    return res.status(200).json(users);
  } catch (e) {
    return res.sendStatus(500);
  }
});

router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: res.locals.user.id,
      },
    });

    if (user?.plan !== "unlimited") {
      const taskCount = await prisma.task.count({
        where: {
          userId: user?.id,
        },
      });

      if (
        (user?.plan === "free" && taskCount >= FREE_TASKS_ALLOWED) ||
        (user?.plan === "basic" && taskCount >= BASIC_TASKS_ALLOWED)
      ) {
        return res.sendStatus(402);
      }
    }

    const parsed = parseOrThrow(CreateTaskBody, req.body);

    await prisma.task.create({
      data: {
        description: parsed.description,
        pay: parsed.pay,
        title: parsed.title,
        user: { connect: { id: res.locals.user.id } },
      },
    });
    return res.sendStatus(201);
  } catch (e) {
    if (e instanceof ZodError) return res.sendStatus(400);
    return res.sendStatus(500);
  }
});

router.post("/subscribe", async (req: Request, res: Response) => {
  try {
    console.log('--------------------')
    console.log(PRICE_IDS.basic, PRICE_IDS.unlimited)
    const parsed = parseOrThrow(StripeSubscribeBody, req.body);
    const user = await prisma.user.findUnique({
      where: {
        id: res.locals.user.id,
      },
    });

    if (!user) {
      return res.sendStatus(404);
    }

    const session = await stripe.checkout.sessions.create({
      customer: user.stripeCustomerId as string,
      mode: "payment",
      line_items: [{ price: PRICE_IDS[parsed.plan], quantity: 1 }],
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/cancel",
    });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    if(error instanceof ZodError) {
      return res.sendStatus(400);
    }
    console.log(error);
    return res.sendStatus(500);
  }
});

router.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const parsedParams = parseOrThrow(UpdateTaskParams, req.params);
    const parsedBody = parseOrThrow(UpdateTaskBody, req.body);
    await prisma.task.update({
      data: parsedBody,
      where: { id: parsedParams.id, userId: res.locals.user.id },
    });
    return res.sendStatus(200);
  } catch (error) {
    if (error instanceof ZodError) return res.sendStatus(400);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.sendStatus(404);
    }
    return res.sendStatus(500);
  }
});

router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const parsed = parseOrThrow(DeleteTaskParams, req.params);
    await prisma.task.delete({
      where: { id: parsed.id, userId: res.locals.user.id },
    });
    return res.sendStatus(200);
  } catch (error) {
    if (error instanceof ZodError) return res.sendStatus(400);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.sendStatus(404);
    }
    return res.sendStatus(500);
  }
});

router.get("/tasks/:taskId/messages", async (req: Request, res: Response) => {
  try {
    
  }
  catch {

  }
}); 

