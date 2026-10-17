import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Pusat kontrol Developer untuk seluruh store dalam satu aplikasi bersama.
 * Hanya bisa diakses dengan header `x-control-secret` = DEVELOPER_CONTROL_SECRET.
 */

const storeFields = {
  store_code: z.string().max(64).optional(),
  store_name: z.string().max(200).optional(),
  store_email: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  owner_name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  app_version: z.string().max(40).optional(),
  dev_contact: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
  logo_url: z.string().max(400000).optional(),
  device_code: z.string().max(128).optional(),
  allowed_ips: z.array(z.string().max(64)).max(50).optional(),
  allowed_devices: z
    .array(z.object({ code: z.string().max(128), label: z.string().max(120) }))
    .max(50)
    .optional(),

  active: z.boolean().optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
};

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...storeFields }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), ...storeFields }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  z.object({
    action: z.literal("extend"),
    id: z.string().uuid(),
    days: z.number().int().min(1).max(3650),
  }),
  z.object({
    action: z.literal("branding"),
    logo_url: z.string().max(400000).optional(),
    app_icon_url: z.string().max(400000).optional(),
    login_title: z.string().max(200).optional(),
    login_note: z.string().max(1000).optional(),
    app_name: z.string().max(120).optional(),
    app_version: z.string().max(40).optional(),
    release_date: z.string().max(40).optional(),
    developer_name: z.string().max(200).optional(),
    developer_email: z.string().max(200).optional(),
    developer_contact: z.string().max(60).optional(),
  }),
  z.object({
    action: z.literal("developer-account"),
    email: z.string().email(),
    full_name: z.string().max(200).default("Developer"),
    redirect_to: z.string().url(),
  }),
  z.object({
    action: z.literal("developer-remove"),
    user_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("modules"),
    id: z.string().uuid(),
    modules: z.record(z.string().max(40), z.boolean()),
  }),
  z.object({
    action: z.literal("assign"),
    id: z.string().uuid(),
    email: z.string().email(),
    full_name: z.string().max(200).default(""),
    role: z.enum(["installer", "admin", "kasir"]).default("installer"),
    redirect_to: z.string().url(),
  }),
]);

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Hasil pemeriksaan kunci: `ok`, `wrong` (kunci salah), atau `unconfigured`
 * (kunci Developer belum dipasang di lingkungan ini — biasanya saat aplikasi
 * dijalankan di PC lokal tanpa berkas .env.local).
 */
function authorize(request: Request): "ok" | "wrong" | "unconfigured" {
  const secret = process.env["DEVELOPER_CONTROL_SECRET"] ?? "";
  if (secret.length === 0) return "unconfigured";
  const provided =
    request.headers.get("x-control-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(secret, provided) ? "ok" : "wrong";
}

function denied(state: "wrong" | "unconfigured") {
  if (state === "unconfigured") {
    return new Response(
      "Kunci Developer belum dipasang di aplikasi ini. Saat menjalankan di PC lokal, isi DEVELOPER_CONTROL_SECRET dan SUPABASE_SERVICE_ROLE_KEY di berkas .env.local (lihat README).",
      { status: 503 },
    );
  }
  return new Response("Kunci Developer salah.", { status: 401 });
}

/**
 * Ambil klien admin. Bila kunci akses penuh database belum tersedia
 * (biasanya saat aplikasi dijalankan di PC lokal), kirim pesan jelas.
 */
async function loadAdmin() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { admin: supabaseAdmin, error: null as Response | null };
  } catch {
    return {
      admin: null,
      error: new Response(
        "Kunci akses penuh database belum dipasang di aplikasi ini. Saat menjalankan di PC lokal, isi SUPABASE_SERVICE_ROLE_KEY di berkas .env.local, atau pakai aplikasi online untuk menu Developer.",
        { status: 503 },
      ),
    };
  }
}

const columns =
  "id, store_code, store_name, store_email, address, city, owner_name, phone, app_version, dev_contact, note, active, expires_at, created_at, logo_url, device_code, allowed_ips, allowed_devices";


export const Route = createFileRoute("/api/public/store-registry")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = authorize(request);
        if (auth !== "ok") return denied(auth);
        const { admin: supabaseAdmin, error: adminError } = await loadAdmin();
        if (!supabaseAdmin) return adminError!;
        const [{ data, error }, { data: members }, { data: developers }] = await Promise.all([
          supabaseAdmin.from("stores").select(columns).order("created_at"),
          supabaseAdmin.from("store_members").select("store_id"),
          supabaseAdmin.from("developer_accounts").select("user_id, email, created_at"),
        ]);
        if (error) return new Response(error.message, { status: 500 });
        const counts = new Map<string, number>();
        for (const row of (members ?? []) as { store_id: string }[]) {
          counts.set(row.store_id, (counts.get(row.store_id) ?? 0) + 1);
        }
        const stores = ((data ?? []) as { id: string }[]).map((row) => ({
          ...row,
          members: counts.get(row.id) ?? 0,
        }));
        return Response.json({ stores, developers: developers ?? [] });
      },
      POST: async ({ request }) => {
        const auth = authorize(request);
        if (auth !== "ok") return denied(auth);
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const body = parsed.data;
        const { admin: supabaseAdmin, error: adminError } = await loadAdmin();
        if (!supabaseAdmin) return adminError!;

        if (body.action === "create") {
          const { action: _a, ...values } = body;
          const { data, error } = await supabaseAdmin
            .from("stores")
            .insert(values as never)
            .select(columns)
            .maybeSingle();
          if (error) return new Response(error.message, { status: 500 });
          return Response.json({ store: { ...(data as object), members: 0 } });
        }

        if (body.action === "update" || body.action === "extend") {
          let values: Record<string, unknown>;
          if (body.action === "extend") {
            const { data: current } = await supabaseAdmin
              .from("stores")
              .select("expires_at")
              .eq("id", body.id)
              .maybeSingle();
            const currentIso = (current as { expires_at: string } | null)?.expires_at;
            const base = currentIso ? new Date(currentIso) : new Date();
            const start = base.getTime() > Date.now() ? base : new Date();
            values = {
              expires_at: new Date(
                start.getTime() + body.days * 24 * 60 * 60 * 1000,
              ).toISOString(),
            };
          } else {
            const { action: _a, id: _id, ...rest } = body;
            values = rest;
          }
          const { data, error } = await supabaseAdmin
            .from("stores")
            .update(values as never)
            .eq("id", body.id)
            .select(columns)
            .maybeSingle();
          if (error) return new Response(error.message, { status: 500 });
          return Response.json({ store: data });
        }

        if (body.action === "delete") {
          const { error } = await supabaseAdmin.from("stores").delete().eq("id", body.id);
          if (error) return new Response(error.message, { status: 500 });
          return Response.json({ ok: true });
        }

        if (body.action === "branding") {
          const { action: _a, ...values } = body;
          const { data, error } = await supabaseAdmin
            .from("app_branding")
            .upsert({ id: "default", ...values } as never, { onConflict: "id" })
            .select(
              "logo_url, app_icon_url, login_title, login_note, app_name, app_version, release_date, developer_name, developer_email, developer_contact",
            )
            .maybeSingle();
          if (error) return new Response(error.message, { status: 500 });
          return Response.json({ branding: data });
        }

        if (body.action === "developer-remove") {
          const { error } = await supabaseAdmin
            .from("developer_accounts")
            .delete()
            .eq("user_id", body.user_id);
          if (error) return new Response(error.message, { status: 500 });
          return Response.json({ ok: true });
        }

        if (body.action === "developer-account") {
          const { data: all, error: allError } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          if (allError) return new Response(allError.message, { status: 500 });
          const wanted = body.email.toLowerCase();
          const found = all.users.find((u) => (u.email ?? "").toLowerCase() === wanted);
          let devId = found?.id;
          let emailSent: "invite" | "reset" = "invite";
          if (!devId) {
            const { data: created, error: inviteError } =
              await supabaseAdmin.auth.admin.inviteUserByEmail(body.email, {
                data: { full_name: body.full_name },
                redirectTo: body.redirect_to,
              });
            if (inviteError) return new Response(inviteError.message, { status: 500 });
            devId = created.user!.id;
          } else if (!found?.last_sign_in_at) {
            const { error: reinviteError } =
              await supabaseAdmin.auth.admin.inviteUserByEmail(body.email, {
                data: { full_name: body.full_name },
                redirectTo: body.redirect_to,
              });
            if (reinviteError) return new Response(reinviteError.message, { status: 500 });
          } else {
            const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
              body.email,
              { redirectTo: body.redirect_to },
            );
            if (resetError) return new Response(resetError.message, { status: 500 });
            emailSent = "reset";
          }

          await supabaseAdmin
            .from("profiles")
            .upsert({ id: devId, full_name: body.full_name } as never, { onConflict: "id" });
          await supabaseAdmin.from("user_roles").delete().eq("user_id", devId);
          const { error: roleError } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: devId, role: "installer" } as never);
          if (roleError) return new Response(roleError.message, { status: 500 });
          const { error: devError } = await supabaseAdmin
            .from("developer_accounts")
            .upsert({ user_id: devId, email: body.email } as never, {
              onConflict: "user_id",
            });
          if (devError) return new Response(devError.message, { status: 500 });
          return Response.json({ ok: true, emailSent, user_id: devId });
        }

        if (body.action === "modules") {
          // Modul aktif disimpan di baris pengaturan `businessProfile` milik store,
          // digabung dengan isi lama agar pengaturan lain (label unit dsb.) utuh.
          const { data: existing } = await supabaseAdmin
            .from("store_data")
            .select("payload")
            .eq("store_id", body.id)
            .eq("kind", "settings")
            .eq("entity_id", "businessProfile")
            .maybeSingle();
          const oldProfile =
            ((existing as { payload?: { businessProfile?: Record<string, unknown> } } | null)
              ?.payload?.businessProfile ?? {}) as Record<string, unknown>;
          const oldModules = (oldProfile.modules ?? {}) as Record<string, unknown>;
          const nextProfile = {
            ...oldProfile,
            modules: { ...oldModules, ...body.modules },
          };
          const { error } = await supabaseAdmin.from("store_data").upsert(
            {
              store_id: body.id,
              kind: "settings",
              entity_id: "businessProfile",
              payload: { businessProfile: nextProfile },
              deleted: false,
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: "store_id,kind,entity_id" },
          );
          if (error) return new Response(error.message, { status: 500 });
          return Response.json({ ok: true, modules: nextProfile.modules });
        }

        // assign: tautkan / undang akun sebagai pengelola store ini
        const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (listError) return new Response(listError.message, { status: 500 });
        const email = body.email.toLowerCase();
        const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
        let userId = existing?.id;
        let invited = false;
        let emailSent: "invite" | "reset" | null = null;

        if (!userId) {
          const { data: created, error: inviteError } =
            await supabaseAdmin.auth.admin.inviteUserByEmail(body.email, {
              data: { full_name: body.full_name },
              redirectTo: body.redirect_to,
            });
          if (inviteError) return new Response(inviteError.message, { status: 500 });
          userId = created.user!.id;
          invited = true;
          emailSent = "invite";
        } else if (!existing?.last_sign_in_at) {
          // Akun sudah ada tapi belum pernah masuk: kirim ulang undangan.
          const { error: reinviteError } =
            await supabaseAdmin.auth.admin.inviteUserByEmail(body.email, {
              data: { full_name: body.full_name },
              redirectTo: body.redirect_to,
            });
          if (reinviteError) return new Response(reinviteError.message, { status: 500 });
          emailSent = "invite";
        } else {
          // Akun aktif: kirim tautan buat sandi baru agar bisa langsung masuk.
          const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
            body.email,
            { redirectTo: body.redirect_to },
          );
          if (resetError) return new Response(resetError.message, { status: 500 });
          emailSent = "reset";
        }

        await supabaseAdmin.from("profiles").upsert(
          {
            id: userId,
            ...(body.full_name ? { full_name: body.full_name } : {}),
            ...(invited ? { must_change_password: true } : {}),
          } as never,
          { onConflict: "id" },
        );
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: userId, role: body.role } as never);
        if (roleError) return new Response(roleError.message, { status: 500 });
        const { error: memberError } = await supabaseAdmin
          .from("store_members")
          .upsert({ user_id: userId, store_id: body.id } as never, {
            onConflict: "user_id",
          });
        if (memberError) return new Response(memberError.message, { status: 500 });

        return Response.json({ ok: true, invited, emailSent });
      },
    },
  },
});
