// Two approaches: 
// Client = one connection
// Pool = multiple connection, recommended for a server. For an API use Pool

// A JWT is a signed token your server issues after a user logs in
// It has three parts: 
// Header - algorithm used to sign it
// Payload - Data you embed, like the user's ID and username
// Signature - the header + payload signed with a secret key only your server knows

// - When the client gets the token, it stores and sends it with future requests, usually in the authorization header
// - Your server verifies the signature to confirm the token is legitimate and wasn't tampered with - no database lookup needed
// - If the signature is valid you trust the payload

// Access token:
// Short-lived (minutes/hours), sent with every request to prove identity, because it expires quickly a stolen token has limited damage

// Refresh token:
// Long-lived (days/weeks), stored securely, used to get a ne access token when the current one expires, This is stored 
// in the database so it can be revoked
// Flow: user logs in -> server issues both -> 
// when the access token expires, the client sends a refresh token to a /refresh endpoint to get a new token without logging in again

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL
    })
});