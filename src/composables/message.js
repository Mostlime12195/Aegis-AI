/**
 * @file message.js
 * @description Core logic for the Aegis AI API Interface, handling Hack Club LLM endpoint configuration
 * and streaming responses using manual fetch() processing.
 */

import { availableModels } from "./availableModels";
import { generateSystemPrompt } from "./systemPrompt";
import { loadMemory } from "./memory";

// Helper function to find a model by ID, including nested models in categories
function findModelById(models, id) {
  for (const model of models) {
    if (model.id === id) {
      return model;
    }
    if (model.models && Array.isArray(model.models)) {
      const found = findModelById(model.models, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**\n * Main entry point for processing all incoming user messages for the API interface.\n * It determines the correct API configuration and streams the LLM response.\n *\n * @param {string} query - The user's message\n * @param {Array} plainMessages - Conversation history (e.g., [{ role: \"user\", content: \"...\"}, { role: \"assistant\", content: \"...\"}])\n * @param {AbortController} controller - AbortController instance for cancelling API requests\n * @param {string} selectedModel - The model chosen by the user\n * @param {object} modelParameters - Object containing all configurable model parameters (temperature, top_p, max_tokens, seed, reasoning)\n * @param {object} settings - User settings object containing user_name, user_occupation, and custom_instructions\n * @param {string[]} toolNames - Array of available tool names\n * @param {boolean} isSearchEnabled - Whether the browser search tool is enabled\n * @yields {Object} A chunk object with content and/or reasoning\n *   @property {string|null} content - The main content of the response chunk\n *   @property {string|null} reasoning - Any reasoning information included in the response chunk\n */
export async function* handleIncomingMessage(
  query,
  plainMessages,
  controller,
  selectedModel = "qwen/qwen3-32b",
  modelParameters = {},
  settings = {},
  toolNames = [],
  isSearchEnabled = false
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

    // Determine which tools are actually being used
    const usedTools = [];
    if (isSearchEnabled && toolNames.includes("browser_search")) {
      usedTools.push("browser_search");
    }

    // Generate system prompt based on settings and used tools
    const systemPrompt = await generateSystemPrompt(
      usedTools,
      settings,
      memoryFacts
    );

    // Initialize requestBody with required fields
    const requestBody = {
      model: selectedModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...plainMessages,
        { role: "user", content: query },
      ],
      stream: true,
    };

    // Add model parameters, but filter out invalid ones
    if (modelParameters) {
      // Add valid parameters that the API expects
      const validParams = ["temperature", "top_p", "max_tokens", "seed"];
      validParams.forEach((param) => {
        if (modelParameters[param] !== undefined) {
          requestBody[param] = modelParameters[param];
        }
      });
    }

    // Conditionally add browser_search tool if enabled
    if (isSearchEnabled && toolNames.includes("browser_search")) {
      requestBody.tools = [{ type: "browser_search" }];
    }

    // Add reasoning parameters only if the model supports reasoning
    // Use the imported availableModels instead of the function parameter
    const selectedModelInfo = findModelById(availableModels, selectedModel);
    if (selectedModelInfo && selectedModelInfo.reasoning) {
      requestBody.reasoning_format = "parsed";

      // Add reasoning_effort if specified in model parameters and enabled
      if (
        modelParameters?.reasoning?.enabled &&
        modelParameters?.reasoning?.effort
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

                // Handle executed tools
                let executedTools = [];
                if (choice.delta?.executed_tools) {
                  console.log(
                    "Executed tools received from API:",
                    choice.delta.executed_tools
                  );
                  executedTools = choice.delta.executed_tools;
                }

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

                  console.log("Content chunk received:", choice.delta.content);

                  yield {
                    content: choice.delta.content,
                    reasoning: null,
                    executed_tools: executedTools,
                  };
                  console.log(
                    "Yielded message chunk with executed_tools:",
                    executedTools
                  );
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
                    executed_tools: executedTools,
                  };
                  console.log(
                    "Yielded reasoning chunk with executed_tools:",
                    executedTools
                  );
                }

                // Handle case where we have executed_tools but no content or reasoning
                if (choice.delta?.executed_tools && !choice.delta?.content && !choice.delta?.reasoning) {
                  console.log("Yielding executed_tools only chunk:", executedTools);
                  yield {
                    content: null,
                    reasoning: null,
                    executed_tools: executedTools,
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
