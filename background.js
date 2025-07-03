import { htmlToText } from "html-to-text";
console.log("Spam-Filter Extension: Background script loaded.");

// --- Configuration ---
const OLLAMA_API_URL = "http://localhost:11434/api/generate";
const OLLAMA_MODEL = "gemma3:27b";

const TAGS_TO_MANAGE = {
  is_advertise: { key: "adv", name: "Advertisement", color: "#FFC107" },
  is_business_approach: { key: "business", name: "Business As", color: "#2196F3" },
  is_personal_approach: { key: "personal", name: "Personal Ad", color: "#4CAF50" },
  is_service_important: { key: "important", name: "Service Important", color: "#F44336" },
  is_service_not_important: { key: "service-info", name: "Service Info", color: "#9E9E9E" },
  is_scam: { key: "scam", name: "Scam Alert", color: "#FF5722" },
  has_calendar_invite: { key: "calendar", name: "Appointment", color: "#7F07f2" },
  spf_fail: { key: "spf-fail", name: "SPF Fail", color: "#E91E63" },
  dkim_fail: { key: "dkim-fail", name: "DKIM Fail", color: "#E91E63" }
};

const PROMPT_TEMPLATE = `Hi, I like you to check and score an email based on the following structured data. Please respond as a single, clean JSON object with the specified properties.

### Email Headers
\`\`\`json
{headers}
\`\`\`

### Email Body (converted from HTML to plain text)
\`\`\`text
{body}
\`\`\`

### Attachments
\`\`\`json
{attachments}
\`\`\`

### INSTRUCTIONS
Based on the data above, please populate the following JSON object:
- sender: simply extract 'from'
- sender_consistent: check if from fields is consistent with headers and is not trying to spool identity
- spf_pass: (boolean) check if there is positive verification in spf headers (leave null if no information is available or for spf-soft fail with ~all)
- dkim_pass: (boolean) check if there is positive verification in dkim headers (leave null if no information is available)
- is_advertise: (boolean) check if email is advertising something and contains an offer
- is_business_approach: (boolean) check if email is a cold sales/business approach (or next message in the approach process where sender reply to self to refresh the approach in the mailbox). Consider typical sales and lead generation scenarios.
- is_personal_approach: (boolean) check if this is non-sales scenario approach from someone who likes to contact in a non-business context.
- is_service_important: (boolean) check if email contains important information related to service: bill, password reset, login link, 2fa code, expiration notice. Consider common services like electricity, bank account, netflix, or similar subscription service
- is_service_not_important: (boolean) check if email contains non critical information from service - like: daily posts update from linked in, AWS invitation for conference, cross sale, tips how to use product, surveys, new offers
- is_scam: (boolean) check if the mail sounds like a scam
- has_calendar_invite: (boolean) check if the mail has invitation to the call or meeting (with calendar appointment attached)
`;

const CONTEXT_TOKEN_LIMIT = 128000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const CONTEXT_CHAR_LIMIT = CONTEXT_TOKEN_LIMIT * CHARS_PER_TOKEN_ESTIMATE;

// --- Tag Management ---
async function ensureTagsExist() {
  try {
    const allTags = await messenger.messages.tags.list();
    const existingKeys = new Set(allTags.map(tag => tag.key));
    for (const tag of Object.values(TAGS_TO_MANAGE)) {
      if (!existingKeys.has(tag.key)) {
        await messenger.messages.tags.create(tag.key, tag.name, tag.color);
      }
    }
    console.log("Spam-Filter Extension: All required tags are present.");
  } catch (error) {
    console.error("Spam-Filter Extension: Error ensuring tags exist:", error);
  }
}

// --- Email Parsing Logic ---
function findEmailParts(parts) {
  let textBody = '';
  let htmlBody = '';
  const attachments = [];

  function recurse(part) {
    if (part.parts) {
      part.parts.forEach(recurse);
      return;
    }
    if (part.type === 'text/plain' && !part.isAttachment) {
      textBody = part.body;
    } else if (part.type === 'text/html' && !part.isAttachment) {
      htmlBody = part.body;
    } else if (part.isAttachment || part.name) {
      attachments.push({
        name: part.name,
        mimeType: part.type,
        size: part.size
      });
    }
  }

  parts.forEach(recurse);
  
  // Prefer HTML body, convert it to plain text. Fall back to plain text if no HTML.
  let finalBody = textBody;
  if (htmlBody) {
      finalBody = htmlToText(htmlBody, {
          wordwrap: 130
      });
  }
  
  return { body: finalBody, attachments };
}


// --- Ollama Integration ---
function buildPrompt(structuredData) {
    const headersJSON = JSON.stringify(structuredData.headers, null, 2);
    const attachmentsJSON = JSON.stringify(structuredData.attachments, null, 2);

    const frameSize = PROMPT_TEMPLATE
        .replace('{headers}', headersJSON)
        .replace('{body}', '')
        .replace('{attachments}', attachmentsJSON)
        .length;

    const maxBodyLength = CONTEXT_CHAR_LIMIT - frameSize;
    let emailBody = structuredData.body;

    if (emailBody.length > maxBodyLength) {
        console.warn(`Spam-Filter Extension: Body length (${emailBody.length}) exceeds remaining space (${maxBodyLength}). Truncating.`);
        emailBody = emailBody.substring(0, maxBodyLength);
    }

    const finalPrompt = PROMPT_TEMPLATE
        .replace('{headers}', headersJSON)
        .replace('{body}', emailBody)
        .replace('{attachments}', attachmentsJSON);
    
    if (finalPrompt.length > CONTEXT_CHAR_LIMIT) {
        console.error("Spam-Filter Extension: Final prompt still too long after body truncation. Performing hard cut.");
        return finalPrompt.substring(0, CONTEXT_CHAR_LIMIT);
    }

    return finalPrompt;
}

async function analyzeEmailWithOllama(structuredData) {
  const prompt = buildPrompt(structuredData);
  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        format: "json",
        stream: false
      }),
    });
    if (!response.ok) throw new Error(`Ollama API request failed: ${response.status}`);
    const result = await response.json();
    console.log("Spam-Filter Extension: scoring results: ", result.response);
    return JSON.parse(result.response);
  } catch (error) {
    console.error("Spam-Filter Extension: Error communicating with Ollama:", error);
    return null;
  }
}

// --- Main Logic ---
messenger.messages.onNewMailReceived.addListener(async (folder, messages) => {
  console.log("Spam-Filter Extension: Received", messages.messages.length, "new message(s) in", folder.name);
  for (const message of messages.messages) {
    try {
      console.log("Spam-Filter Extension: Processing message ID:", message.id);
      
      const fullMessage = await messenger.messages.getFull(message.id);
      const { body, attachments } = findEmailParts(fullMessage.parts);
      
      const structuredData = {
          headers: fullMessage.headers,
          body: body,
          attachments: attachments
      };

      const analysis = await analyzeEmailWithOllama(structuredData);
      if (!analysis) {
        console.log("Spam-Filter Extension: Skipping tagging due to analysis failure for ID:", message.id);
        continue;
      }

      const messageDetails = await messenger.messages.get(message.id);
      const tagSet = new Set(messageDetails.tags || []);
      
      if (analysis.is_advertise) tagSet.add(TAGS_TO_MANAGE.is_advertise.key);
      if (analysis.is_business_approach) tagSet.add(TAGS_TO_MANAGE.is_business_approach.key);
      if (analysis.has_calendar_invite) tagSet.add(TAGS_TO_MANAGE.has_calendar_invite.key);
      if (analysis.is_personal_approach) tagSet.add(TAGS_TO_MANAGE.is_personal_approach.key);
      if (analysis.is_service_important) tagSet.add(TAGS_TO_MANAGE.is_service_important.key);
      if (analysis.is_service_not_important) tagSet.add(TAGS_TO_MANAGE.is_service_not_imoprtant.key);
      if (analysis.is_scam || analysis.spf_pass === false || analysis.dkim_pass === false) tagSet.add(TAGS_TO_MANAGE.is_scam.key);
      if (analysis.spf_pass === false) tagSet.add(TAGS_TO_MANAGE.spf_fail.key);
      if (analysis.dkim_pass === false) tagSet.add(TAGS_TO_MANAGE.dkim_fail.key);

      await messenger.messages.update(message.id, { tags: Array.from(tagSet) });
      console.log("Spam-Filter Extension: Successfully applied analysis tags to message ID:", message.id, Array.from(tagSet));

    } catch (error) {
      console.error("Spam-Filter Extension: Error processing message ID:", message.id, error);
    }
  }
});

// Initialize
ensureTagsExist();
