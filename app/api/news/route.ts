import { NextResponse } from "next/server";

const NEWS_SOURCE_URL = "https://inshorts.deta.dev/news?category=national";

export const revalidate = 600;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(NEWS_SOURCE_URL, {
      headers: {
        "User-Agent": "agentic-0f55a24d/1.0 (+https://agentic-0f55a24d.vercel.app)"
      },
      cache: "no-store"
    });

    if (!res.ok) {
      console.error("News source error", res.status, await res.text());
      return NextResponse.json({ error: "News source unavailable" }, { status: 502 });
    }

    const json = await res.json();

    const articles = Array.isArray(json?.data)
      ? json.data
          .filter(
            (item: any) =>
              typeof item.title === "string" &&
              typeof item.content === "string" &&
              typeof item.url === "string"
          )
          .map((item: any) => ({
            id: item?.id ?? item?.hashId ?? crypto.randomUUID(),
            title: item.title.trim(),
            content: item.content.trim(),
            imageUrl: item.imageUrl ?? null,
            url: item.url,
            author: item.author ?? "Inshorts",
            date: item.date ?? item.time
          }))
      : [];

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("News route failed", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
