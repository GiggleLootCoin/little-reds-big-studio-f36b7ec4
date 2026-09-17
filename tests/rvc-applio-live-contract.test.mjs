import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@gradio/client";

function labelFor(parameter) {
  return `${parameter.label ?? ""} ${parameter.parameter_name ?? ""}`.toLowerCase();
}

function hasInferenceInputs(endpoint) {
  const labels = (endpoint.parameters ?? []).map(labelFor);
  return (
    labels.some((label) => label.includes("voice model")) &&
    labels.some((label) => label.includes("index file")) &&
    labels.some(
      (label) =>
        label.includes("select audio") ||
        label.includes("input audio") ||
        label.includes("audio input"),
    )
  );
}

test(
  "current ApplioX Space exposes a usable RVC inference endpoint",
  { timeout: 120_000 },
  async () => {
    const app = await Client.connect("IAHispano/ApplioX");
    const api = await app.view_api({ all_endpoints: true });
    const endpoints = [
      ...Object.entries(api?.named_endpoints ?? {}),
      ...Object.entries(api?.unnamed_endpoints ?? {}),
    ];
    const candidates = endpoints.filter(([, endpoint]) => hasInferenceInputs(endpoint));

    assert.ok(
      candidates.length > 0,
      "ApplioX does not expose the required RVC inference inputs",
    );

    const candidate = candidates.find(([, endpoint]) =>
      (endpoint.returns ?? []).some((output) =>
        String(output.component ?? "").toLowerCase().includes("audio"),
      ),
    );

    assert.ok(
      candidate,
      "ApplioX exposes RVC inputs but no audio-producing inference endpoint",
    );
  },
);
