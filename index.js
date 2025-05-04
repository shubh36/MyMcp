import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// 🚀 MCP Server setup
const server = new McpServer({
  name: "Channel Sent Count Fetcher",
  version: "1.1.0"
});

// 🌐 Function to call the API
async function getSentCountByChannel(cid, channel, start, end, tz = "Asia/Jakarta") {
  const url = "http://vertica-csr-348419287.us-east-1.elb.amazonaws.com/v1/campaign-summary-reports";
  const body = {
    cid,
    input: {
      start,
      end,
      tz,
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
    console.log(`➡️ Sending request for ${channel.toUpperCase()}...`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error(`❌ Failed ${channel.toUpperCase()} API call:`, response.status);
      return { error: `API error: ${response.status}` };
    }

    const json = await response.json();
    console.log(`✅ Received ${channel.toUpperCase()} response:`, JSON.stringify(json, null, 2));
    return json;
  } catch (err) {
    console.error(`🔥 Error calling ${channel.toUpperCase()} API:`, err);
    return { error: err.message };
  }
}

// 🔨 Register tool per channel
function createChannelTool(channel) {
  server.tool(
    `get${channel.charAt(0).toUpperCase() + channel.slice(1)}SentCount`,
    {
      clientId: z.number(),
      start: z.string().default("2025-03-18 00:00:00"),
      end: z.string().default("2025-03-18 23:59:59"),
      tz: z.string().default("Asia/Jakarta")
    },
    async ({ clientId, start, end, tz }) => {
      const apiResponse = await getSentCountByChannel(clientId, channel, start, end, tz);
      let sent = null;
      let reason = "";

      try {
        const series = apiResponse.data?.[0]?.series;
        const sentEntry = series?.find(s => s.name === "total_sent");
        sent = sentEntry?.data?.[0];
        if (sent == null) reason = "Missing total_sent data.";
      } catch (e) {
        reason = `Parsing error: ${e.message}`;
      }

      return {
        content: [
          {
            type: "text",
            text: sent != null
              ? `${channel.toUpperCase()} sent count for client ID ${clientId} is ${sent}.`
              : `⚠️ Unable to retrieve ${channel.toUpperCase()} sent count for client ID ${clientId}.\nReason: ${reason}`
          }
        ]
      };
    }
  );
}

// ✅ Register tools
["email", "sms", "apn", "whatsapp"].forEach(createChannelTool);

// 🧩 Unified multi-channel tool
server.tool(
  "getAllChannelSentCounts",
  {
    clientId: z.number(),
    start: z.string().default("2025-03-18 00:00:00"),
    end: z.string().default("2025-03-18 23:59:59"),
    tz: z.string().default("Asia/Jakarta"),
    channels: z.array(z.enum(["email", "sms", "apn", "whatsapp"])).default(["email", "sms", "apn", "whatsapp"])
  },
  async ({ clientId, start, end, tz, channels }) => {
    const results = [];

    for (const channel of channels) {
      const apiResponse = await getSentCountByChannel(clientId, channel, start, end, tz);
      let sent = null;
      let reason = "";

      try {
        const series = apiResponse.data?.[0]?.series;
        const sentEntry = series?.find(s => s.name === "total_sent");
        sent = sentEntry?.data?.[0];
        if (sent == null) reason = "Missing total_sent data.";
      } catch (e) {
        reason = `Parsing error: ${e.message}`;
      }

      results.push(
        sent != null
          ? `✅ ${channel.toUpperCase()}: ${sent}`
          : `⚠️ ${channel.toUpperCase()} failed. Reason: ${reason}`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: `📊 Sent counts for Client ID ${clientId}:\n` + results.join("\n")
        }
      ]
    };
  }
);

// 🚀 Start the server
async function init() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
init();
