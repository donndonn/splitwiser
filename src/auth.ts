import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { accounts, users, verificationTokens } from "@/db/schema";
import { db } from "@/db";
import { createUserWithAdmission } from "@/lib/auth-request-context";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { isVerifyAuthEnabled, isVerifyEmail } from "@/lib/verify-auth";

const drizzleAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  verificationTokensTable: verificationTokens,
});

const adapter: Adapter = {
  ...drizzleAdapter,
  // Matches DrizzleAdapter: the users table allows a null email.
  createUser: async (profile) =>
    (await createUserWithAdmission(db, profile)) as AdapterUser,
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    // AUTH_APPLE_ID is the Services ID. AUTH_APPLE_SECRET is a short-lived JWT
    // (npx auth add apple). Missing env does not throw here; Apple sign-in
    // fails at runtime until both are set. Hide My Email uses a private-relay
    // address, so it will not match an existing Google mailbox.
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    ...(isVerifyAuthEnabled()
      ? [
          Credentials({
            credentials: {
              email: { label: "Email", type: "email" },
              secret: { label: "Secret", type: "password" },
            },
            async authorize(credentials) {
              const expected = process.env.SPLITWISER_VERIFY_SECRET;
              const email = String(credentials?.email ?? "")
                .trim()
                .toLowerCase();
              const secret = String(credentials?.secret ?? "");
              if (!expected || secret !== expected || !isVerifyEmail(email)) {
                return null;
              }
              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);
              if (!user) return null;
              return {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
              };
            },
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      return new URL(safeCallbackPath(url, baseUrl), baseUrl).toString();
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  trustHost: true,
});
