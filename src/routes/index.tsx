import { createFileRoute } from "@tanstack/react-router";
import { IndependentStudioHome } from "@/components/studio/IndependentStudioHome";

const SITE_URL = "https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev";
const TITLE = "Little Red's Big Studio — Independent";
const DESCRIPTION = "An independent Android-first creative studio experiment with Buddy, music, voice, artwork, video and free/open workflows.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
    ],
  }),
  component: IndependentStudioHome,
});
