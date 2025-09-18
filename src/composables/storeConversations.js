import localforage from "localforage";
import { emitter } from "@/emitter";

export async function createConversation(plainMessages, lastUpdated) {
  const conversationId = crypto.randomUUID();

  const systemPrompt = `You are an AI with the task of shortening and summarising messages into a short title. You must summarise the given messages based on their content into at most a 20 character title. Each conversation is between a user and an AI chatbot. The messages provided to you are the first messages of the conversation. The title must be general enough to apply to what you think the conversation will be about. Only output the title, without any additional explainations or commentary.`;

  // Ensure that the messages are in a format suitable for storage,
  // Without this, an error occurs.
  let rawMessages = plainMessages.map((msg) => ({
    id: msg.id, // Include all necessary properties
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp, // Date objects are fine here
    complete: msg.complete,
    // Add reasoning properties for assistant messages
    ...(msg.role === "assistant" && {
      reasoning: msg.reasoning,
      reasoningStartTime: msg.reasoningStartTime,
      reasoningEndTime: msg.reasoningEndTime,
      reasoningDuration: msg.reasoningDuration,
      executed_tools: msg.executed_tools ? JSON.parse(JSON.stringify(msg.executed_tools)) : [], // Ensure executed_tools are serializable
    }),
    // Add any other properties your message objects might have
  }));

  let title = "Untitled";

  try {
    const response = await fetch("https://ai.hackclub.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          ...rawMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        ],
        model: "moonshotai/kimi-k2-instruct-0905",
        stream: false,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      title = data.choices?.[0]?.message?.content || "Untitled";
    }
  } catch (error) {
    console.error("Error generating title:", error);
  }

  try {
    // Store full conversation
    await localforage.setItem(`conversation_${conversationId}`, {
      title,
      lastUpdated,
      messages: rawMessages,
    });

    // Store metadata separately (only ID, title, and timestamp)
    const metadata =
      (await localforage.getItem("conversations_metadata")) || [];
    metadata.push({ id: conversationId, title, lastUpdated });
    await localforage.setItem("conversations_metadata", metadata);

    emitter.emit("updateConversations");

    console.log("Conversation saved successfully!");
    return conversationId;
  } catch (error) {
    console.error("Error creating conversation:", error);
  }
}

export async function storeMessages(
  conversationId,
  plainMessages,
  lastUpdated
) {
  // Attempt to get the existing conversation data.
  const data = await localforage.getItem(`conversation_${conversationId}`);
  if (!data) {
    console.warn(`No conversation found for id ${conversationId}.`);
    return;
  }

  let rawMessages = plainMessages.map((msg) => ({
    id: msg.id, // Include all necessary properties
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp, // Date objects are fine here
    complete: msg.complete,
    // Add reasoning properties for assistant messages
    ...(msg.role === "assistant" && {
      reasoning: msg.reasoning,
      reasoningStartTime: msg.reasoningStartTime,
      reasoningEndTime: msg.reasoningEndTime,
      reasoningDuration: msg.reasoningDuration,
      executed_tools: msg.executed_tools ? JSON.parse(JSON.stringify(msg.executed_tools)) : [], // Ensure executed_tools are serializable
    }),
    // Add any other properties your message objects might have
  }));

  console.log("Storing messages, checking for executed_tools:");
  rawMessages.forEach((msg, index) => {
    if (msg.role === "assistant") {
      console.log(`Message ${index} executed_tools:`, msg.executed_tools);
    }
  });

  const title = data.title || "Untitled";

  // Store full conversation
  await localforage.setItem(`conversation_${conversationId}`, {
    title,
    lastUpdated,
    messages: rawMessages,
  });

  // Optionally update metadata. If you want to replace existing metadata,
  // you can filter out the old entry before pushing the new one.
  const metadata = (await localforage.getItem("conversations_metadata")) || [];
  // Remove any existing entry with the same id:
  const updatedMetadata = metadata.filter((m) => m.id !== conversationId);
  updatedMetadata.push({ id: conversationId, title, lastUpdated });
  await localforage.setItem("conversations_metadata", updatedMetadata);

  console.log("Conversation saved successfully!");
}

export async function deleteConversation(conversationId) {
  // Remove full conversation data
  await localforage.removeItem(`conversation_${conversationId}`);

  // Update metadata by filtering out the deleted conversation.
  const metadata = (await localforage.getItem("conversations_metadata")) || [];
  const updatedMetadata = metadata.filter((m) => m.id !== conversationId);
  await localforage.setItem("conversations_metadata", updatedMetadata);

  // Emit an event so that the sidebar updates its list.
  emitter.emit("updateConversations");

  console.log(`Conversation ${conversationId} deleted successfully!`);
}
