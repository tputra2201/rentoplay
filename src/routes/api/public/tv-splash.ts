import { createFileRoute } from "@tanstack/react-router";

/**
 * Menyajikan video splash MP4 milik store ke aplikasi TV Companion.
 * Bucket tv-splash bersifat privat; rute ini hanya membaca berkas
 * splash.mp4 per store (media publik, bukan data pribadi) agar TV
 * dapat mengunduhnya satu kali lalu menyimpannya di memori TV.
 */
export const Route = createFileRoute("/api/public/tv-splash")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const store = new URL(request.url).searchParams.get("store") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(store)) {
          return new Response("store tidak valid", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("tv-splash")
          .download(`${store}/splash.mp4`);
        if (error || !data) return new Response("Video splash belum diunggah", { status: 404 });
        return new Response(data, {
          headers: {
            "content-type": "video/mp4",
            "content-length": String(data.size),
            "cache-control": "no-cache",
          },
        });
      },
    },
  },
});
