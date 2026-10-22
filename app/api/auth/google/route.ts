import { NextResponse } from "next/server";
import {
  createAccountSession,
  publicAccount,
  SESSION_COOKIE,
  verifyGoogleCredential,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { credential?: unknown };
    if (typeof body.credential !== "string") {
      return NextResponse.json({ message: "Google did not return a valid sign-in response." }, { status: 400 });
    }

    const identity = await verifyGoogleCredential(body.credential);
    const session = await createAccountSession(identity);
    const response = NextResponse.json({ authenticated: true, account: publicAccount(session.account) });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: session.maxAge,
    });
    return response;
  } catch (error) {
    console.error("Google sign-in error", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Google sign-in could not be completed." },
      { status: 401 },
    );
  }
}
