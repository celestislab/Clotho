import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Standalone test client for the Clotho MCP bridge.
 */
async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/bridge-main.ts"],
  });

  const client = new Client({ name: "clotho-test-client", version: "0.1.0" });

  console.log("[Test] Connecting to bridge...");
  await client.connect(transport);
  console.log("[Test] Connected.\n");

  console.log("[Test] Listing tools...");
  const tools = await client.listTools();
  console.log(JSON.stringify(tools, null, 2));
  console.log();

  console.log("[Test] Calling get_state...");
  const stateResult = await client.callTool({ name: "get_state", arguments: {} });
  console.log(JSON.stringify(stateResult, null, 2));
  console.log();

  console.log("[Test] Calling get_goal_status...");
  const statusResult = await client.callTool({ name: "get_goal_status", arguments: {} });
  console.log(JSON.stringify(statusResult, null, 2));
  console.log();

  console.log("[Test] Done. Closing.");
  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("[Test] Fatal error:", err);
  process.exit(1);
});