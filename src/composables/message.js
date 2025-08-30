/**
 * @file message.js
 * @description Core logic for the Aegis AI API Interface, handling Hack Club LLM endpoint configuration
 * and streaming responses using manual fetch() processing.
 */

import { availableModels } from "./availableModels";
import { generateSystemPrompt } from "./systemPrompt";
import { loadMemory } from "./memory";

/**\n * Main entry point for processing all incoming user messages for the API interface.\n * It determines the correct API configuration and streams the LLM response.\n *\n * @param {string} query - The user's message\n * @param {Array} plainMessages - Conversation history (e.g., [{ role: \"user\", content: \"...\"}, { role: \"assistant\", content: \"...\"}])\n * @param {AbortController} controller - AbortController instance for cancelling API requests\n * @param {string} selectedModel - The model chosen by the user\n * @param {object} modelParameters - Object containing all configurable model parameters (temperature, top_p, max_tokens, seed, reasoning)\n * @param {object} settings - User settings object containing user_name, user_occupation, and custom_instructions\n * @param {string[]} toolNames - Array of available tool names\n * @yields {Object} A chunk object with content and/or reasoning\n *   @property {string|null} content - The main content of the response chunk\n *   @property {string|null} reasoning - Any reasoning information included in the response chunk\n */
export async function* handleIncomingMessage(
  query,
  plainMessages,
  controller,
  selectedModel = "qwen/qwen3-32b",
  modelParameters = {},
  settings = {},
  toolNames = []
) {
  try {
    // Validate required parameters
    if (!query || !plainMessages || !controller) {
      throw new Error("Missing required parameters for handleIncomingMessage");
    }

    // Load memory facts if memory is enabled
    let memoryFacts = [];
    if (settings.global_memory_enabled) {
      memoryFacts = await loadMemory();
    }

    // Generate system prompt based on settings and available tools
    const systemPrompt = await generateSystemPrompt(toolNames, settings, memoryFacts);

    // Add the system prompt and current user query to the messages for the LLM call
    const messagesToSend = [
      { role: "system", content: systemPrompt },
      ...plainMessages,
      { role: "user", content: query },
    ];

    // Prepare the request body according to Groq API specification
    const requestBody = {
      model: selectedModel,
      messages: messagesToSend,
      temperature: modelParameters.temperature,
      top_p: modelParameters.top_p,
      stream: true, // Enable streaming
    };

    // Add optional parameters only if they are not null/undefined
    if (modelParameters.max_tokens != null) {
      requestBody.max_tokens = modelParameters.max_tokens;
    }

    if (modelParameters.seed != null) {
      requestBody.seed = modelParameters.seed;
    }

    if (modelParameters.presence_penalty != null) {
      requestBody.presence_penalty = modelParameters.presence_penalty;
    }

    if (modelParameters.frequency_penalty != null) {
      requestBody.frequency_penalty = modelParameters.frequency_penalty;
    }

    // Add reasoning parameters only if the model supports reasoning
    const selectedModelInfo = availableModels.find(
      (model) => model.id === selectedModel
    );
    if (selectedModelInfo && selectedModelInfo.reasoning) {
      requestBody.reasoning_format = "parsed";

      // Add reasoning_effort if specified in model parameters and enabled
      if (
        modelParameters.reasoning?.enabled &&
        modelParameters.reasoning.effort
      ) {
        requestBody.reasoning_effort = modelParameters.reasoning.effort;
      }
    }

    // Make the API request using fetch
    const response = await fetch("https://ai.hackclub.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    // Check if the response is ok
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || "Unknown error";

      throw new Error(
        `API request failed with status ${response.status}: ${errorMessage}`
      );
    }

    // Process the streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Track reasoning timing
    let reasoningStarted = false;
    let reasoningStartTime = null;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last incomplete line in the buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6); // Remove "data: " prefix

            if (data === "[DONE]") {
              // Stream is complete
              break;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle different types of responses
              if (parsed.choices && parsed.choices[0]) {
                const choice = parsed.choices[0];

                // Handle content delta
                if (choice.delta?.content) {
                  // If we have reasoning enabled and we're getting text content,
                  // this means the reasoning phase is complete
                  if (
                    modelParameters.reasoning?.enabled &&
                    !reasoningStarted &&
                    choice.delta.content
                  ) {
                    reasoningStarted = true;
                  }

                  yield {
                    content: choice.delta.content,
                    reasoning: null,
                  };
                }

                // Handle reasoning delta (if available in the response format)
                if (choice.delta?.reasoning) {
                  // Track when reasoning starts
                  if (!reasoningStartTime) {
                    reasoningStartTime = new Date();
                  }

                  yield {
                    content: null,
                    reasoning: choice.delta.reasoning,
                  };
                }

                // Handle finish reason
                if (choice.finish_reason) {
                  // Handle finish event if needed
                }
              }

              // Handle error in response
              if (parsed.error) {
                yield {
                  content: `\n\n[ERROR: ${parsed.error.message}]`,
                  reasoning: null,
                  error: true,
                  errorDetails: {
                    name: parsed.error.type || "APIError",
                    message: parsed.error.message,
                  },
                };
              }
            } catch (parseError) {
              // Skip lines that aren't valid JSON
              console.warn("Failed to parse stream data:", data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    // Handle abort errors specifically
    if (error.name === "AbortError") {
      yield { content: "\n\n[STREAM CANCELED]", reasoning: null };
      return;
    }

    const errorMessage = error.message || "No detailed information";
    yield {
      content: `\n\n[CRITICAL ERROR: Aegis AI failed to dispatch request. ${errorMessage}]`,
      reasoning: null,
      error: true,
      errorDetails: {
        name: error.name || "UnknownError",
        message: errorMessage,
        rawError: error.toString(),
      },
    };
  }
}
