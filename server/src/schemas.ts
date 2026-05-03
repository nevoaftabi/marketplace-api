import z from 'zod';

export const CreateTaskBody = z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(10000),
    pay: z.number().multipleOf(0.01).max(9999999999.99)
});

export const UpdateTaskBody = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(10000).optional(),
    pay: z.number().multipleOf(0.01).max(9999999999.99).optional()
}).refine(data => Object.values(data).some(v => v !== undefined), {
    message: "At least one field must be provied"
});

export const UpdateTaskParams = z.object({
    id: z.uuid()
});

export const GetTaskParams = z.object({
    id: z.uuid()
});

export const RegisterSchema = z.object({
  username: z.string().min(1).max(20),
  password: z.string().min(10).max(50),
  email: z.email(),
});

export const LoginSchema = z.object({
    username: z.string().min(1).max(20),
    password: z.string().min(1).max(50)
});

export const DeleteTaskParams = z.object({
    id: z.uuid()
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const GetTasksSchema = z.object({
  page: z.coerce.number().min(1).max(10).default(1),
  limit: z.coerce.number(),
});

export const parseOrThrow = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
};

export const StripeSubscribeBody = z.object({
  plan: z.enum(["basic", "unlimited"])
});

export const WsAuthMessage = z.object({
    type: z.literal('auth'),
    token: z.string()
});

export const WsMessagePayload = z.object({
    type: z.literal('message'),
    taskId: z.uuid(),
    recipientId: z.uuid(),
    content: z.string().min(1).max(2000)
});

export const GetTaskMessages = z.object({
  id: z.uuid()
})