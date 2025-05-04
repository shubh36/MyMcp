import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// 🚀 MCP Server setup
const server = new McpServer({
  name: "Apis Data Fetcher",
  version: "1.0.0"
});

// 📊 API call to fetch campaign summary for a specific channel
async function getSentCountByChannel(cid, channel) {
  const url = "http://vertica-csr-348419287.us-east-1.elb.amazonaws.com/v1/campaign-summary-reports";

  const body = {
    cid: cid,
    input: {
      start: "2025-03-18 00:00:00",
      end: "2025-03-18 23:59:59",
      tz: "Asia/Jakarta",
      campaign_type: "broadcast",
      tags: [],
      combinations: [{ channel: channel, msgid: [] }]
    },
    output: {
      channel: [channel],
      categories: ["d"],
      total: ["sent"]
    }
  };

  try {
    console.log(`➡️ Sending request to campaign summary API for ${channel}:`);
    console.log(JSON.stringify(body, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error("❌ API request failed with status:", response.status);
      return { error: `API error: ${response.status}` };
    }

    const jsonResponse = await response.json();
    console.log(`✅ Response from API for ${channel}:`);
    console.log(JSON.stringify(jsonResponse, null, 2));
    return jsonResponse;
  } catch (error) {
    console.error(`🔥 Error calling API for ${channel}:`, error);
    return { error: error.message || "Unknown error" };
  }
}

// 🛠️ Tool generator for email, sms, apn
function createChannelTool(channel) {
  server.tool(
    `get${channel.charAt(0).toUpperCase() + channel.slice(1)}SentCount`,
    {
      clientId: z.number()
    },
    async ({ clientId }) => {
      const apiResponse = await getSentCountByChannel(clientId, channel);
      let sent = null;
      let reason = "";

      try {
        const series = apiResponse.data?.[0]?.series;
        if (Array.isArray(series)) {
          const sentEntry = series.find(s => s.name === "total_sent");
          if (sentEntry && Array.isArray(sentEntry.data)) {
            sent = sentEntry.data[0];
          } else {
            reason = "total_sent not found or data array missing.";
          }
        } else {
          reason = "series array is missing or not in expected format.";
        }
      } catch (e) {
        reason = `Parsing error: ${e.message}`;
        console.error("❌ Parsing error:", e);
      }

      if (sent !== null && sent !== undefined) {
        return {
          content: [
            {
              type: "text",
              text: `${channel.toUpperCase()} sent count for client ID ${clientId} is ${sent}.`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Unable to retrieve ${channel.toUpperCase()} sent count for client ID ${clientId}.\nReason: ${reason}`
            }
          ]
        };
      }
    }
  );
}

// 🛠️ Register tools
createChannelTool("email");
createChannelTool("sms");
createChannelTool("apn");

// 🛠️ Unified tool: Get all channel counts
server.tool(
  "getAllChannelSentCounts",
  {
    clientId: z.number()
  },
  async ({ clientId }) => {
    const channels = ["email", "sms", "apn"];
    const results = [];

    for (const channel of channels) {
      const apiResponse = await getSentCountByChannel(clientId, channel);
      let sent = null;
      let reason = "";

      try {
        const series = apiResponse.data?.[0]?.series;
        if (Array.isArray(series)) {
          const sentEntry = series.find(s => s.name === "total_sent");
          if (sentEntry && Array.isArray(sentEntry.data)) {
            sent = sentEntry.data[0];
          } else {
            reason = "total_sent not found or data array missing.";
          }
        } else {
          reason = "series array is missing or not in expected format.";
        }
      } catch (e) {
        reason = `Parsing error: ${e.message}`;
      }

      if (sent !== null && sent !== undefined) {
        results.push(`✅ ${channel.toUpperCase()} sent count: ${sent}`);
      } else {
        results.push(`⚠️ ${channel.toUpperCase()} failed. Reason: ${reason}`);
      }
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

// 🚀 Start MCP server
async function init() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

init();
