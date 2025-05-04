import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// ---------------------------
// 🚀 Initialize MCP Server
// ---------------------------
const server = new McpServer({
  name: "Campaign Sent Count Fetcher",
  version: "1.0.0"
});

// ---------------------------
// 🌐 API Call Utility
// ---------------------------
async function getSentCountByChannel(cid, channel) {
  const url = "http://vertica-csr-348419287.us-east-1.elb.amazonaws.com/v1/campaign-summary-reports";

  const requestBody = {
    cid,
    input: {
      start: "2025-03-18 00:00:00",
      end: "2025-03-18 23:59:59",
      tz: "Asia/Jakarta",
      campaign_type: "broadcast",
      tags: [],
      combinations: [{ channel, msgid: [] }]
    },
    output: {
      channel: [channel],
      categories: ["d"],
      total: ["sent"]
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      return { error: `API error: ${response.status}` };
    }

    return await response.json();
  } catch (error) {
    return { error: error.message || "Unknown error" };
  }
}

// ---------------------------
// 📊 Result Parser
// ---------------------------
function parseSentCount(response) {
  try {
    const series = response.data?.[0]?.series;
    const sentEntry = series?.find(s => s.name === "total_sent");
    return sentEntry?.data?.[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------
// 🛠️ Create Tool per Channel
// ---------------------------
function registerChannelTool(channel) {
  server.tool(
    `get${channel.charAt(0).toUpperCase() + channel.slice(1)}SentCount`,
    { clientId: z.number() },
    async ({ clientId }) => {
      const res = await getSentCountByChannel(clientId, channel);
      const sent = parseSentCount(res);

      return {
        content: [
          {
            type: "text",
            text: sent !== null
              ? `✅ ${channel.toUpperCase()} sent count for client ID ${clientId}: ${sent}`
              : `⚠️ Failed to retrieve ${channel.toUpperCase()} sent count for client ID ${clientId}.`
          }
        ]
      };
    }
  );
}

// Register tools for individual channels
["email", "sms", "apn", "whatsapp"].forEach(registerChannelTool);

// ---------------------------
// 🧰 Tool: All Channel Counts
// ---------------------------
server.tool(
  "getAllChannelSentCounts",
  { clientId: z.number() },
  async ({ clientId }) => {
    const channels = ["email", "sms", "apn", "whatsapp"];
    const results = [];

    for (const channel of channels) {
      const res = await getSentCountByChannel(clientId, channel);
      const sent = parseSentCount(res);

      results.push(
        sent !== null
          ? `✅ ${channel.toUpperCase()}: ${sent}`
          : `⚠️ ${channel.toUpperCase()}: Failed to retrieve count`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: `📦 Sent counts for client ID ${clientId}:\n` + results.join("\n")
        }
      ]
    };
  }
);

// ---------------------------
// 🚀 Start MCP Server (Cursor-ready)
// ---------------------------
async function init() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
init();
