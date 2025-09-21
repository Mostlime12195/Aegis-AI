import { ref, computed, nextTick } from 'vue';
import localforage from 'localforage';
import { createConversation as createNewConversation, storeMessages, deleteConversation as deleteConv } from './storeConversations';
import { updateMemory } from './memory';
import { handleIncomingMessage } from '@/composables/message';
import { availableModels } from './availableModels';
import DEFAULT_PARAMETERS from './defaultParameters';

/**
 * Creates a centralized message manager for handling all chat message operations
 * @param {Object} settingsManager - The settings manager instance
 * @param {Object} chatPanel - Reference to the ChatPanel component
 * @returns {Object} Messages manager with reactive state and methods
 */
export function useMessagesManager(settingsManager, chatPanel) {
  // Reactive state for messages
  const messages = ref([]);
  const isLoading = ref(false);
  const controller = ref(new AbortController());
  const currConvo = ref('');
  const conversationTitle = ref('');
  const isIncognito = ref(false);
  const isTyping = ref(false);
  const chatLoading = ref(false);

  // Make availableModels accessible
  settingsManager.availableModels = availableModels;

  // Computed properties
  const hasMessages = computed(() => messages.value.length > 0);
  const isEmptyConversation = computed(() => !currConvo.value && messages.value.length === 0);

  /**
   * Generates a unique ID for messages
   * @returns {string} Unique ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Adds a user message to the messages array
   * @param {string} content - The user's message content
   */
  function addUserMessage(content) {
    if (!content.trim()) return;

    const userMessage = {
      id: generateId(),
      role: "user",
      content: content,
      timestamp: new Date(),
      complete: true,
    };

    messages.value.push(userMessage);
  }

  /**
   * Creates a new assistant message and adds it to the messages array
   * @returns {Object} The created assistant message object
   */
  function createAssistantMessage() {
    const assistantMsg = {
      id: generateId(),
      role: "assistant",
      reasoning: "",
      content: "",
      executed_tools: [],
      timestamp: new Date(),
      complete: false,
      // New timing properties
      apiCallTime: new Date(), // Time when the API was called
      firstTokenTime: null,    // Time when the first token was received
      completionTime: null,    // Time when the message was completed
      // Token counting
      tokenCount: 0,           // Total tokens used
      reasoningStartTime: null,
      reasoningEndTime: null,
      reasoningDuration: null,
      error: false,
      errorDetails: null
    };

    messages.value.push(assistantMsg);
    return assistantMsg;
  }

  /**
   * Updates an assistant message with new content
   * @param {Object} message - The message to update
   * @param {Object} updates - The updates to apply
   */
  function updateAssistantMessage(message, updates) {
    const index = messages.value.findIndex(m => m.id === message.id);
    if (index !== -1) {
      // Use Vue's array mutation method to ensure reactivity
      messages.value.splice(index, 1, { ...messages.value[index], ...updates });
    }
  }

  /**
   * Sends a message to the AI and handles the response
   * @param {string} message - The user's message
   */
  async function sendMessage(message) {
    if (!message.trim() || isLoading.value) return;

    controller.value = new AbortController();
    isLoading.value = true;
    isTyping.value = false;

    // Add user message
    addUserMessage(message);

    // Update global memory with the user's message
    if (settingsManager.settings.global_memory_enabled && !isIncognito.value) {
      updateMemory(message, messages)
        .catch(error => {
          console.error("Error updating memory:", error);
        });
    }

    // Create assistant message
    const assistantMsg = createAssistantMessage();

    // Create conversation if needed
    if (!currConvo.value && !isIncognito.value) {
      currConvo.value = await createNewConversation(messages.value, new Date());
      if (currConvo.value) {
        const convData = await localforage.getItem(`conversation_${currConvo.value}`);
        conversationTitle.value = convData?.title || "";
      }
    }

    await nextTick();
    // Use requestAnimationFrame for more reliable scrolling
    requestAnimationFrame(() => {
      chatPanel?.value?.scrollToEnd("smooth");
    });

    // Get current model details
    const selectedModelDetails = findModelById(settingsManager.availableModels, settingsManager.settings.selected_model_id);

    if (!selectedModelDetails) {
      console.error("No model selected or model details not found. Aborting message send.");
      updateAssistantMessage(assistantMsg, {
        content: (assistantMsg.content ? assistantMsg.content + "\n\n" : "") + "Error: No AI model selected.",
        complete: true
      });
      isLoading.value = false;
      return;
    }

    // Construct model parameters
    const savedReasoningEffort = settingsManager.getModelSetting(selectedModelDetails.id, "reasoning_effort") ||
      (selectedModelDetails.extra_parameters?.reasoning_effort?.[1] || "default");

    const parameterConfig = settingsManager.settings.parameter_config || { ...DEFAULT_PARAMETERS };

    const model_parameters = {
      ...parameterConfig,
      ...selectedModelDetails.extra_parameters,
      reasoning: {
        enabled: true,
        effort: savedReasoningEffort
      }
    };

    try {
      const streamGenerator = handleIncomingMessage(
        message,
        messages.value.filter(msg => msg.complete).map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        controller.value,
        settingsManager.settings.selected_model_id,
        model_parameters,
        settingsManager.settings,
        selectedModelDetails.extra_functions || [],
        settingsManager.settings.search_enabled || false,
        isIncognito.value
      );

      // Track if we've received the first token
      let firstTokenReceived = false;

      for await (const chunk of streamGenerator) {
        // Process content
        if (chunk.content !== null && chunk.content !== undefined) {
          assistantMsg.content += chunk.content;

          // Track first token time
          if (!firstTokenReceived) {
            assistantMsg.firstTokenTime = new Date();
            firstTokenReceived = true;
          }

          // Count tokens (simple character-based approximation)
          // In a real implementation, you might want to use a proper tokenizer
          assistantMsg.tokenCount += chunk.content.trim().split(/\s+/).length;

          if (
            chunk.content &&
            assistantMsg.reasoningStartTime !== null &&
            assistantMsg.reasoningEndTime === null
          ) {
            assistantMsg.reasoningEndTime = new Date();
          }
        }

        // Process reasoning
        if (chunk.reasoning !== null && chunk.reasoning !== undefined) {
          assistantMsg.reasoning += chunk.reasoning;

          // Track first token time for reasoning
          if (!firstTokenReceived) {
            assistantMsg.firstTokenTime = new Date();
            firstTokenReceived = true;
          }

          // Count tokens for reasoning
          assistantMsg.tokenCount += chunk.reasoning.trim().split(/\s+/).length;

          if (assistantMsg.reasoningStartTime === null) {
            assistantMsg.reasoningStartTime = new Date();
          }
        }

        // Process executed tools
        if (chunk.executed_tools && chunk.executed_tools.length > 0) {
          chunk.executed_tools.forEach(tool => {
            const existingToolIndex = assistantMsg.executed_tools.findIndex(t => t.index === tool.index);
            if (existingToolIndex >= 0) {
              assistantMsg.executed_tools[existingToolIndex] = tool;
            } else {
              assistantMsg.executed_tools.push(tool);
            }
          });
        }

        // Update the messages array with a new object to trigger reactivity
        console.log("Updating messages array, current executed_tools:", assistantMsg.executed_tools);
        // Create a new object with a copy of the assistantMsg to ensure reactivity
        const updatedMsg = {
          ...assistantMsg,
          executed_tools: [...assistantMsg.executed_tools] // Create a new array to ensure reactivity
        };
        // Use Vue's array mutation method to ensure reactivity
        messages.value.splice(messages.value.length - 1, 1, updatedMsg);
        // Safely log full messages array
        try {
          console.log("Full messages array after update:", JSON.parse(JSON.stringify(messages.value))); // Log full messages array
        } catch (e) {
          console.log("Could not serialize full messages array after update:", messages.value);
        }

        // Allow Vue to render updates before scrolling
        await new Promise(resolve => setTimeout(resolve, 0));

        if (chatPanel?.value?.isAtBottom) {
          chatPanel.value.scrollToEnd("smooth");
        }
      }

    } catch (error) {
      console.error('Error in stream processing:', error);
    } finally {
      // Mark message as complete and set completion time
      updateAssistantMessage(assistantMsg, {
        complete: true,
        completionTime: new Date(),
        reasoningDuration: assistantMsg.reasoningStartTime !== null ? 
          (assistantMsg.reasoningEndTime !== null ? 
            assistantMsg.reasoningEndTime.getTime() - assistantMsg.reasoningStartTime.getTime() : 
            new Date().getTime() - assistantMsg.reasoningStartTime.getTime()) : 
          null
      });

      // Handle error display
      if (assistantMsg.complete && !assistantMsg.content && assistantMsg.errorDetails) {
        updateAssistantMessage(assistantMsg, {
          content: `\n[ERROR: ${assistantMsg.errorDetails.message}]` +
            (assistantMsg.errorDetails.status ? ` HTTP ${assistantMsg.errorDetails.status}` : '')
        });
      }

      isLoading.value = false;

      // Store messages if not in incognito mode
      if (!isIncognito.value) {
        await storeMessages(currConvo.value, messages.value, new Date());
      }
    }
  }

  /**
   * Helper function to find a model by ID
   * @param {Array} models - Array of models to search
   * @param {string} id - Model ID to find
   * @returns {Object|null} Found model or null
   */
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

  /**
   * Changes the current conversation
   * @param {string} id - Conversation ID to load
   */
  async function changeConversation(id) {
    if (isIncognito.value) {
      return;
    }

    chatLoading.value = true;
    messages.value = [];
    currConvo.value = id;

    const conv = await localforage.getItem(`conversation_${currConvo.value}`);
    if (conv?.messages) {
      messages.value = conv.messages.map(msg => {
        if (msg.role === 'assistant') {
          return {
            ...msg,
            apiCallTime: msg.apiCallTime ? new Date(msg.apiCallTime) : null,
            firstTokenTime: msg.firstTokenTime ? new Date(msg.firstTokenTime) : null,
            completionTime: msg.completionTime ? new Date(msg.completionTime) : null,
            reasoningStartTime: msg.reasoningStartTime ? new Date(msg.reasoningStartTime) : null,
            reasoningEndTime: msg.reasoningEndTime ? new Date(msg.reasoningEndTime) : null,
            executed_tools: msg.executed_tools || []
          };
        }
        return msg;
      });
    } else {
      messages.value = [];
    }

    conversationTitle.value = conv?.title || '';
    chatLoading.value = false;
  }

  /**
   * Deletes a conversation
   * @param {string} id - Conversation ID to delete
   */
  async function deleteConversation(id) {
    if (isIncognito.value) {
      return;
    }

    await deleteConv(id);
    if (currConvo.value === id) {
      currConvo.value = '';
      messages.value = [];
      conversationTitle.value = '';
    }
  }

  /**
   * Starts a new conversation
   */
  async function newConversation() {
    currConvo.value = '';
    messages.value = [];
    conversationTitle.value = '';
    isIncognito.value = false;
  }

  /**
   * Toggles incognito mode
   */
  function toggleIncognito() {
    isIncognito.value = !isIncognito.value;
  }

  // Return the reactive state and methods
  return {
    // Reactive state
    messages,
    isLoading,
    controller,
    currConvo,
    conversationTitle,
    isIncognito,
    isTyping,
    chatLoading,
    
    // Computed properties
    hasMessages,
    isEmptyConversation,
    
    // Methods
    sendMessage,
    changeConversation,
    deleteConversation,
    newConversation,
    toggleIncognito,
    generateId
  };
}