import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// 🚀 MCP Server setup
const server = new McpServer({
  name: "Cee BillingData Fetcher",
  version: "1.0.0"
});

// 🎯 Dummy MAU data based on client name
async function getMauByClientName(clientName) {
  const name = clientName.toLowerCase();
  if (name === "dream11") return { mau: 14050600 };
  if (name === "bajajfinserv") return { mau: 1066070 };
  return { error: "Unable to get MAU data for the specified client." };
}

// 🛠️ Tool: Get MAU Data
server.tool(
  "getMauDataByClientName",
  {
    clientName: z.string()
  },
  async ({ clientName }) => {
    const data = await getMauByClientName(clientName);
    return {
      content: [{ type: "text", text: JSON.stringify(data) }]
    };
  }
);

// 📊 API call to fetch campaign summary
async function getCampaignSummaryReport(cid) {
  const url = "http://vertica-csr-348419287.us-east-1.elb.amazonaws.com/v1/campaign-summary-reports";

  const body = {
    cid: cid,
    input: {
      start: "2025-03-18 00:00:00",
      end: "2025-03-18 23:59:59",
      tz: "Asia/Jakarta",
      campaign_type: "broadcast",
      tags: [],
      combinations: [{ channel: "email", msgid: [] }]
    },
    output: {
      channel: ["email"],
      categories: ["d"],
      total: ["sent"]
    }
  };

  try {
    console.log("➡️ Sending request to campaign summary API with body:");
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

    console.log("✅ Received response from campaign summary API:");
    console.log(JSON.stringify(jsonResponse, null, 2));

    return jsonResponse;
  } catch (error) {
    console.error("🔥 Exception while calling campaign summary API:", error);
    return { error: error.message || "Unknown error" };
  }
}

// 🛠️ Tool: Get Campaign Summary
server.tool(
  "getCampaignSummaryReport",
  {
    cid: z.number()
  },
  async ({ cid }) => {
    const apiResponse = await getCampaignSummaryReport(cid);
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
      reason = "Exception occurred during response parsing.";
      console.error("❌ Parsing error:", e);
    }

    if (sent !== null && sent !== undefined) {
      return {
        content: [
          {
            type: "text",
            text: `Email sent count for client ID ${cid} is ${sent}.`
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `I'm still unable to retrieve the email sent count for client ID ${cid} due to a technical issue.\nReason: ${reason}`
          }
        ]
      };
    }
  }
);

// 🛠️ Tool: Fallback or future use
server.tool(
  "getEmailSentCount",
  {
    clientId: z.number()
  },
  async ({ clientId }) => {
    const apiResponse = await getCampaignSummaryReport(clientId);
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
      reason = "Exception occurred during response parsing.";
      console.error("❌ Parsing error:", e);
    }

    if (sent !== null && sent !== undefined) {
      return {
        content: [
          {
            type: "text",
            text: `Email sent count for client ID ${clientId} is ${sent}.`
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `I'm still unable to retrieve the email sent count for client ID ${clientId} due to a technical issue.\nReason: ${reason}\nWould you like to try a different client ID, or is there another way I can assist you? If this is urgent, you might want to check whether the backend service is running or if there are any connectivity issues.`
          }
        ]
      };
    }
  }
);

// 🚀 Initialize with Stdio for Cursor
async function init() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

init();
