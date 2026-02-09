import "server-only";

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

async function ensureBootstrapUser() {
  const env = getEnv();
  const existing = await prisma.user.findFirst();
  if (existing) return;
  const passwordHash = await hash(env.ADMIN_BOOTSTRAP_PASSWORD, 12);
  await prisma.user.create({
    data: {
      email: env.ADMIN_BOOTSTRAP_EMAIL,
      passwordHash,
      name: "Admin"
    }
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        await ensureBootstrapUser();

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });
        if (!user) return null;

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name
        };
      }
    })
  ],
  pages: {
    signIn: "/login"
  }
};
