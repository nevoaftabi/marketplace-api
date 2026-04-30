import { Stripe } from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

export const PRICE_IDS: Record<string, string> = {
    get basic() { return process.env.STRIPE_BASIC_PRICE_ID! },
    get unlimited() { return process.env.STRIPE_UNLIMITED_PRICE_ID! }
}

export const FREE_TASKS_ALLOWED = 5;
export const BASIC_TASKS_ALLOWED = 20;

export const stripe = new Stripe(STRIPE_SECRET_KEY as string);