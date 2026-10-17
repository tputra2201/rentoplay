import { createFileRoute } from "@tanstack/react-router";
import { ThemePicker } from "@/components/ThemePicker";

export const Route = createFileRoute("/_authenticated/tema")({
  head: () => ({
    meta: [
      { title: "Tema Tampilan — RenToPlay" },
      {
        name: "description",
        content:
          "Pilih tema tampilan aplikasi RenToPlay: gelap, kuning, atau berwarna.",
      },
      { property: "og:title", content: "Tema Tampilan — RenToPlay" },
      {
        property: "og:description",
        content: "Atur latar aplikasi agar nyaman dipakai di layar kasir maupun tablet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemaPage,
});

function TemaPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Tema Tampilan</h1>
      </header>
      <ThemePicker />
    </div>
  );
}
