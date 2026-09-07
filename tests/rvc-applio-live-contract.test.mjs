import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@gradio/client";

test(
  "current ApplioX Space exposes a usable RVC inference endpoint",
  { timeout: 120_000 },
  async () => {
    const app = await Client.connect("IAHispano/ApplioX", {
      analytics_enabled: false,
    });
    const api = await app.view_api();
    const endpoints = Object.entries(api?.named_endpoints ?? {});
    const candidate = endpoints.find(([, endpoint]) => {
      const labels = endpoint.parameters.map((parameter) => parameter.label.toLowerCase());
      const returnsAudio = endpoint.returns.some((output) =>
        output.component.toLowerCase().includes("audio"),
      );
      return (
        labels.some((label) => label.includes("select audio")) &&
        labels.some((label) => label.includes("voice model")) &&
        labels.some((label) => label.includes("index file")) &&
        returnsAudio
      );
    });

    assert.ok(candidate, "ApplioX does not expose the required RVC inference contract");
    assert.ok(candidate[0].startsWith("/"));
  },
);
