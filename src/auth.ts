import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { accounts, users, verificationTokens } from "@/db/schema";
import { db } from "@/db";
import { isVerifyAuthEnabled, isVerifyEmail } from "@/lib/verify-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
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
  },
  callbacks: {
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
