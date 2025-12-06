// Slack /shash Command for DigitalOcean Agent API
// Endpoint: https://cuqeb4ldya4kcnq53n4rd5lt.agents.do-ai.run
// Uses OpenAI-compatible format

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DigitalOcean Agent Configuration
const AGENT_ENDPOINT = 'https://cuqeb4ldya4kcnq53n4rd5lt.agents.do-ai.run/api/v1/chat/completions';
const AGENT_ACCESS_KEY = 'D9GPV84Mt5ar6zH-ccPsEtduaZAPBEhx';

// Slack Configuration
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Send query to DigitalOcean Agent using OpenAI-compatible format
async function sendQueryToAgent(userQuery) {
  try {
    const response = await axios({
      method: 'POST',
      url: AGENT_ENDPOINT,
      headers: {
        'Authorization': `Bearer ${AGENT_ACCESS_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'n/a', // Not needed for agent endpoints
        messages: [
          {
            role: 'user',
            content: userQuery
          }
        ],
        // Optional: include retrieval info for knowledge base queries
        include_retrieval_info: true
      },
      timeout: 30000 // 30 second timeout
    });

    return response.data;
  } catch (error) {
    console.error('Agent API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
}

// Format the agent's response for Slack
function formatAgentResponse(data, query, userName) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Query from ${userName}:*\n> ${query}`
      }
    },
    {
      type: 'divider'
    }
  ];

  // Extract the response content
  let responseText = '';
  
  if (data.choices && data.choices.length > 0) {
    responseText = data.choices[0].message.content;
  } else if (data.content) {
    responseText = data.content;
  } else if (typeof data === 'string') {
    responseText = data;
  } else {
    responseText = JSON.stringify(data, null, 2);
  }

  // Add response section
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Response:*\n${responseText}`
    }
  });

  // Add retrieval info if available
  if (data.retrieval) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `📚 Sources: ${data.retrieval.sources?.length || 0} documents referenced`
      }]
    });
  }

  // Add timestamp
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `🤖 DigitalOcean Agent • <!date^${Math.floor(Date.now()/1000)}^{date_short_pretty} at {time}|now>`
    }]
  });

  return blocks;
}

// ====================
// /shash SLASH COMMAND
// ====================
// Usage: /shash your query here
// Example: /shash what is the weather in San Francisco?

app.post('/slack/shash', async (req, res) => {
  try {
    const { text, user_name, response_url } = req.body;
    const query = text.trim();

    // Validate query
    if (!query) {
      return res.json({
        response_type: 'ephemeral',
        text: '❌ Please provide a query.\n\n*Usage:* `/shash your question here`\n*Example:* `/shash what are the latest AI trends?`'
      });
    }

    // Acknowledge immediately (Slack requires response within 3 seconds)
    res.json({
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⏳ Processing query: "${query}"...`
          }
        }
      ]
    });

    // Send query to DigitalOcean Agent
    console.log(`Sending query to agent: ${query}`);
    const result = await sendQueryToAgent(query);
    console.log('Agent response received:', JSON.stringify(result, null, 2));

    // Format and send response back to Slack
    const blocks = formatAgentResponse(result, query, user_name);

    await axios.post(response_url, {
      replace_original: true,
      response_type: 'in_channel',
      blocks: blocks
    });

  } catch (error) {
    console.error('Error processing /shash command:', error);
    
    // Send error message to user
    const errorMessage = error.response?.data?.error?.message || 
                        error.response?.data?.message || 
                        error.message || 
                        'Unknown error occurred';

    await axios.post(req.body.response_url, {
      replace_original: true,
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ *Error processing your query*`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error:* ${errorMessage}\n\n*Query:* ${req.body.text}`
          }
        },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: 'Try again or contact your administrator if the issue persists.'
          }]
        }
      ]
    });
  }
});

// ====================
// STREAMING VERSION (Optional)
// ====================
// If you want to show "thinking" animation while waiting

app.post('/slack/shash-stream', async (req, res) => {
  try {
    const { text, user_name, response_url } = req.body;
    const query = text.trim();

    if (!query) {
      return res.json({
        response_type: 'ephemeral',
        text: '❌ Please provide a query. Usage: `/shash your question here`'
      });
    }

    // Acknowledge with animated loading
    res.json({
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Query:* ${query}\n\n⏳ Thinking...`
          }
        }
      ]
    });

    // Update message to show processing
    setTimeout(async () => {
      await axios.post(response_url, {
        replace_original: true,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Query:* ${query}\n\n🤖 Consulting knowledge base...`
            }
          }
        ]
      });
    }, 1000);

    // Get response from agent
    const result = await sendQueryToAgent(query);

    // Send final response
    const blocks = formatAgentResponse(result, query, user_name);
    await axios.post(response_url, {
      replace_original: true,
      response_type: 'in_channel',
      blocks: blocks
    });

  } catch (error) {
    console.error('Error:', error);
    await axios.post(req.body.response_url, {
      replace_original: true,
      response_type: 'ephemeral',
      text: `❌ Error: ${error.message}`
    });
  }
});

// ====================
// TESTING ENDPOINTS
// ====================

// Test the agent directly
app.get('/test-agent', async (req, res) => {
  try {
    const query = req.query.q || 'Hello, how are you?';
    console.log(`Testing agent with query: ${query}`);
    
    const result = await sendQueryToAgent(query);
    
    res.json({
      success: true,
      query: query,
      result: result,
      formatted_response: result.choices?.[0]?.message?.content || 'No response'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    agent_endpoint: AGENT_ENDPOINT,
    configured: !!AGENT_ACCESS_KEY
  });
});

// Webhook to receive notifications FROM the agent (optional)
app.post('/webhook/agent-callback', async (req, res) => {
  try {
    console.log('Received callback from agent:', req.body);
    
    // Verify authorization
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${AGENT_ACCESS_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Post notification to Slack channel
    if (SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
      await axios.post('https://slack.com/api/chat.postMessage', {
        channel: process.env.SLACK_CHANNEL_ID,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🔔 Agent Notification' }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`\`\`${JSON.stringify(req.body, null, 2)}\`\`\``
            }
          }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Slack + DigitalOcean Agent Integration`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n📡 Server: http://localhost:${PORT}`);
  console.log(`🤖 Agent: ${AGENT_ENDPOINT}`);
  console.log(`🔑 Access Key: ${AGENT_ACCESS_KEY.substring(0, 10)}...`);
  console.log(`\n✅ Ready to receive /shash commands!\n`);
  console.log(`🧪 Test agent: http://localhost:${PORT}/test-agent?q=hello`);
  console.log(`💚 Health check: http://localhost:${PORT}/health\n`);
  console.log(`${'='.repeat(60)}\n`);
});
