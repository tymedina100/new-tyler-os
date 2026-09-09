import { revalidatePath } from "next/cache";
import { authConfig } from "@/server/auth/auth-config";
import { getDb } from "@/server/db/client";
import { handleMobileRequest, mobileErrorResponse } from "@/server/mobile/mobile-http";
import { MobileHttpError } from "@/server/mobile/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const config = authConfig();
    if (config.mode !== "guarded")
      throw new MobileHttpError(503, "unavailable", "Mobile access is not configured.");
    const { path = [] } = await context.params;
    const response = await handleMobileRequest(getDb(), config, request, path);
    if (response.ok && ["POST", "PATCH"].includes(request.method) && path[0] !== "session")
      revalidatePath("/", "layout");
    return response;
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
