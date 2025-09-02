import localforage from "localforage";

// Define the key used for storing memory in localforage
const MEMORY_STORAGE_KEY = "global_chatbot_memory";

/**
 * Loads the global memory from localforage.
 * @returns {Promise<Array>} - Array of memory facts
 */
export async function loadMemory() {
  try {
    const stored_memory = await localforage.getItem(MEMORY_STORAGE_KEY);
    if (stored_memory) {
      const global_memory_array = JSON.parse(stored_memory);
      if (Array.isArray(global_memory_array)) {
        // Extract just the fact strings for backward compatibility
        return global_memory_array.map((item) =>
          typeof item === "string" ? item : item.fact
        );
      }
    }
  } catch (err) {
    console.error("Error loading global memory:", err);
  }
  return [];
}

/**
 * Deletes a specific memory fact from the global memory.
 * @param {string} fact - The fact to delete
 * @returns {Promise<void>}
 */
export async function deleteMemory(fact) {
  try {
    const stored_memory = await localforage.getItem(MEMORY_STORAGE_KEY);
    if (stored_memory) {
      let global_memory_array = JSON.parse(stored_memory);
      if (Array.isArray(global_memory_array)) {
        // Filter out the fact to delete (handle both old and new formats)
        global_memory_array = global_memory_array.filter((existing_fact) => {
          if (typeof existing_fact === "string") {
            return existing_fact !== fact;
          } else {
            return existing_fact.fact !== fact;
          }
        });

        // Save the updated memory array or remove if empty
        if (global_memory_array.length > 0) {
          await localforage.setItem(
            MEMORY_STORAGE_KEY,
            JSON.stringify(global_memory_array)
          );
        } else {
          await localforage.removeItem(MEMORY_STORAGE_KEY);
        }

        console.log("Memory fact deleted:", fact);
      }
    }
  } catch (err) {
    console.error("Error deleting memory fact:", err);
    throw new Error("Error deleting memory fact: " + err);
  }
}

/**
 * Clears all memory facts from the global memory.
 * @returns {Promise<void>}
 */
export async function clearAllMemory() {
  try {
    await localforage.removeItem(MEMORY_STORAGE_KEY);
    console.log("All memory cleared");
  } catch (err) {
    console.error("Error clearing all memory:", err);
    throw new Error("Error clearing all memory: " + err);
  }
}

/**
 * Updates the global memory based on the latest message, conversation context,
 * and existing memory. It uses an AI model to determine necessary memory operations
 * (add, remove, modify, clear).
 *
 * @param {string} message - The user's current message.
 * @param {object} context - The full conversation context/history.
 * @throws {Error} - Throws an error if any step of the process fails.
 */
export async function updateMemory(message, context) {
  let global_memory_array = []; // Memory will be managed as an array of objects with fact and timestamp

  try {
    // Load existing global memory from local storage
    // It's now stored as a JSON string representing an array
    const stored_memory = await localforage.getItem(MEMORY_STORAGE_KEY);
    if (stored_memory) {
      // Parse the stored JSON string into an array
      global_memory_array = JSON.parse(stored_memory);
      // Ensure it's actually an array, default to empty if not
      if (!Array.isArray(global_memory_array)) {
        console.warn(
          "Stored memory is not an array. Initializing with empty memory."
        );
        global_memory_array = [];
      }
    }
  } catch (err) {
    // Handle errors during memory loading or parsing
    console.error("Error loading or parsing global memory:", err);
    throw new Error("Error loading or parsing global memory: " + err);
  }

  // Convert memory array to strings for the AI (for backward compatibility)
  const memory_strings = global_memory_array.map((item) =>
    typeof item === "string" ? item : item.fact
  );

  // System prompt for memory operations (with detailed JSON structure explanation)
  const system_prompt = `You are a highly selective memory manager for a chatbot's long-term global memory. Your task is to analyze the user's latest message and the conversation history, considering the existing memory, and determine the necessary updates to the global memory.

Current date and time: ${new Date()}

The output must be a 100% valid JSON object with the exact following structure:
{
  "operation": "add" | "remove" | "modify" | "clear" | "none",
  "facts": {
    "add": ["fact1", "fact2", ...],
    "remove": ["fact1", "fact2", ...],
    "modify": [
      {
        "old": "old fact string",
        "new": "new fact string"
      },
      ...
    ]
  }
}

Detailed field specifications:
- "operation" (required): Must be exactly one of these strings:
  * "add": For adding new, enduring facts about the user
  * "remove": For removing facts that are contradicted or explicitly requested to be deleted
  * "modify": For updating existing facts with new information
  * "clear": Only when the user explicitly commands to clear ALL memory
  * "none": When no memory changes are needed
  
- "facts" (optional for "none" and "clear", required for others): 
  * "add" array: Contains new fact strings to be added to memory
  * "remove" array: Contains existing fact strings to be removed from memory
  * "modify" array: Contains objects with "old" and "new" fact strings for updating

Criteria for operations:
1. **Add**: New, enduring, actionable facts about the user (name, significant preferences, long-term goals. ONLY add facts that are relevant outside of the current conversation)
2. **Remove**: Facts explicitly contradicted or requested to be removed by the user. Also remove outdated or contradictory facts.
3. **Modify**: Existing facts that need updating with new information
4. **Clear**: Only when user explicitly commands to clear ALL memory
5. **None**: When no changes are needed

Special considerations for time-based facts:
- When storing time-related information, prefer specific dates over relative terms (e.g., "meeting on 2023-12-15" instead of "meeting in 3 months")
- This prevents facts from becoming outdated as time passes
- For relative time references, convert them to absolute dates when possible

Critical response requirements:
- Output ONLY the valid JSON object with the exact structure defined above
- Facts must be concise, clear strings
- For "modify" operations, provide objects with exactly "old" and "new" properties
- If operation is "none" or "clear", you may omit the "facts" property or send an empty object
- Ensure your response is parseable JSON without any markdown formatting or extra text
`;

  try {
    // Call the chat completion API to get suggested memory operations in JSON format
    const response = await fetch("https://ai.hackclub.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2-instruct",
        messages: [
          {
            role: "system",
            content: system_prompt, // Use the new structured prompt
          },
          {
            role: "user",
            content: `User message: "${message}"\n\nConversation context (recent messages):\n${JSON.stringify(context.value)}\n\nCurrent global memory (as a list of facts):\n${JSON.stringify(memory_strings)}`,
          },
        ],
        stream: false, // Need the full JSON response
        response_format: {
          type: "json_object",
        },
      }),
    });

    // Check if the API call was successful
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        "API Error:",
        response.status,
        response.statusText,
        errorBody
      );
      throw new Error(
        `API request failed with status ${response.status}: ${errorBody}`
      );
    }

    const data = await response.json();

    // Extract the JSON content from the API response
    let memory_operations;
    try {
      memory_operations = JSON.parse(data.choices[0]?.message?.content);
    } catch (parseError) {
      console.error(
        "Failed to parse AI response as JSON:",
        data.choices[0]?.message?.content
      );
      throw new Error("AI response is not valid JSON: " + parseError.message);
    }

    console.log("AI response:", memory_operations);

    // Validate the structure of the AI response
    if (!memory_operations || typeof memory_operations !== "object") {
      throw new Error("AI response is not a valid object");
    }

    if (!memory_operations.operation) {
      throw new Error("AI response missing required 'operation' field");
    }

    const validOperations = ["add", "remove", "modify", "clear", "none"];
    if (!validOperations.includes(memory_operations.operation)) {
      throw new Error(
        `AI response has invalid operation: ${memory_operations.operation}`
      );
    }

    // Validate facts structure based on operation
    if (
      memory_operations.operation === "add" ||
      memory_operations.operation === "remove" ||
      memory_operations.operation === "modify"
    ) {
      if (
        !memory_operations.facts ||
        typeof memory_operations.facts !== "object"
      ) {
        throw new Error(
          `AI response missing required 'facts' object for operation ${memory_operations.operation}`
        );
      }

      if (
        memory_operations.operation === "add" &&
        (!Array.isArray(memory_operations.facts.add) ||
          !memory_operations.facts.add.every((f) => typeof f === "string"))
      ) {
        throw new Error("AI response 'facts.add' must be an array of strings");
      }

      if (
        memory_operations.operation === "remove" &&
        (!Array.isArray(memory_operations.facts.remove) ||
          !memory_operations.facts.remove.every((f) => typeof f === "string"))
      ) {
        throw new Error(
          "AI response 'facts.remove' must be an array of strings"
        );
      }

      if (memory_operations.operation === "modify") {
        if (!Array.isArray(memory_operations.facts.modify)) {
          throw new Error("AI response 'facts.modify' must be an array");
        }

        for (const mod of memory_operations.facts.modify) {
          if (
            !mod ||
            typeof mod !== "object" ||
            typeof mod.old !== "string" ||
            typeof mod.new !== "string"
          ) {
            throw new Error(
              "AI response 'facts.modify' must be an array of objects with 'old' and 'new' string properties"
            );
          }
        }
      }
    }

    // --- Apply Memory Operations based on AI's JSON output ---
    let updated_memory_array = [...global_memory_array]; // Start with current memory

    switch (memory_operations.operation) {
      case "clear":
        updated_memory_array = []; // Clear all memory
        console.log("Memory operation: CLEAR");
        break;

      case "add":
      case "remove":
      case "modify": {
        // Handle all fact operations in sequence

        // Process adds if present
        if (
          memory_operations.operation === "add" ||
          memory_operations.facts?.add?.length > 0
        ) {
          const facts_to_add = memory_operations.facts?.add || [];
          facts_to_add.forEach((fact) => {
            const trimmed_fact = fact.trim();
            if (trimmed_fact) {
              // Check if fact already exists (handle both old and new formats)
              const exists = updated_memory_array.some((item) =>
                typeof item === "string"
                  ? item === trimmed_fact
                  : item.fact === trimmed_fact
              );

              if (!exists) {
                // Add with timestamp
                updated_memory_array.push({
                  fact: trimmed_fact,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          });
        }

        // Process removes if present
        if (
          memory_operations.operation === "remove" ||
          memory_operations.facts?.remove?.length > 0
        ) {
          const facts_to_remove = memory_operations.facts?.remove || [];
          facts_to_remove.forEach((fact) => {
            const trimmed_fact = fact.trim();
            // Filter out the fact to delete (handle both old and new formats)
            updated_memory_array = updated_memory_array.filter(
              (existing_fact) => {
                if (typeof existing_fact === "string") {
                  return existing_fact !== trimmed_fact;
                } else {
                  return existing_fact.fact !== trimmed_fact;
                }
              }
            );
          });
        }

        // Process modifications if present
        if (
          memory_operations.operation === "modify" ||
          memory_operations.facts?.modify?.length > 0
        ) {
          const modifications = memory_operations.facts?.modify || [];
          modifications.forEach((mod) => {
            const old_fact = mod.old?.trim();
            const new_fact = mod.new?.trim();
            if (old_fact && new_fact) {
              // Find and update the fact (handle both old and new formats)
              const index = updated_memory_array.findIndex((item) =>
                typeof item === "string"
                  ? item === old_fact
                  : item.fact === old_fact
              );

              if (index !== -1) {
                // Replace with new fact and update timestamp
                updated_memory_array[index] = {
                  fact: new_fact,
                  timestamp: new Date().toISOString(),
                };
              } else {
                console.warn(
                  `Attempted to modify non-existent fact: "${old_fact}"`
                );
              }
            }
          });
        }

        console.log(
          `Memory operations: ${memory_operations.operation}, Added: ${memory_operations.facts?.add?.length || 0}, Removed: ${memory_operations.facts?.remove?.length || 0}, Modified: ${memory_operations.facts?.modify?.length || 0}`
        );
        break;
      }

      case "none":
        console.log("Memory operation: NONE (No changes needed)");
        break;

      default:
        console.warn(
          `Unknown memory operation received from AI: "${memory_operations.operation}". No memory changes applied.`
        );
        break;
    }

    // Ensure uniqueness after operations (especially adds)
    // Create a map to track unique facts
    const factMap = new Map();
    updated_memory_array.forEach((item) => {
      const fact = typeof item === "string" ? item : item.fact;
      // Keep the latest version of each fact
      if (!factMap.has(fact) || (typeof item === "object" && item.timestamp)) {
        factMap.set(fact, item);
      }
    });

    // Convert map back to array
    updated_memory_array = Array.from(factMap.values()).filter((item) => {
      const fact = typeof item === "string" ? item : item.fact;
      return fact;
    });

    // Save the updated memory array (as a JSON string)
    if (updated_memory_array.length > 0) {
      await localforage.setItem(
        MEMORY_STORAGE_KEY,
        JSON.stringify(updated_memory_array)
      );
      console.log("Global memory saved:", updated_memory_array);
    } else {
      // If memory is empty, remove the item from localforage
      await localforage.removeItem(MEMORY_STORAGE_KEY);
      console.log("Global memory cleared and removed from storage.");
    }
  } catch (err) {
    // Handle errors during API call, parsing, or processing
    console.error(
      "Error processing user message for global memory adjustments:",
      err
    );
    throw new Error(
      "Error analyzing user message for global memory adjustments: " + err
    );
  }
}
