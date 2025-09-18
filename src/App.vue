<script setup>
import { ref, nextTick, onMounted, computed, reactive, watch, onBeforeUnmount } from 'vue';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/github-dark.css';
import { inject } from "@vercel/analytics"
import { injectSpeedInsights } from '@vercel/speed-insights';
import { useDark } from "@vueuse/core";
import localforage from 'localforage';
import { DialogRoot, DialogContent, DialogPortal, DialogOverlay } from 'reka-ui';

import { createConversation, storeMessages, deleteConversation as deleteConv } from './composables/storeConversations'
import { updateMemory } from './composables/memory';
import { handleIncomingMessage } from './composables/message'
import { availableModels } from './composables/availableModels';
import Settings from './composables/settings';

import MessageForm from './components/MessageForm.vue';
import ChatPanel from './components/ChatPanel.vue';
import AppSidebar from './components/AppSidebar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import TopBar from './components/TopBar.vue';
import { Icon } from "@iconify/vue";


// Inject Vercel's analytics and performance insights
inject();
injectSpeedInsights();


const isDark = useDark();

const messages = ref([]);
const isLoading = ref(false);
const controller = ref(new AbortController()); // Used to abort fetch requests
const chatPanel = ref(null); // Reference to the ChatPanel component, used to be able to manually scroll down
const currConvo = ref('');
const conversationTitle = ref('');

const sidebarOpen = ref(window.innerWidth > 900);
const chatLoading = ref(false);
const isTyping = ref(false);
const isSettingsOpen = ref(false);
const settingsInitialTab = ref('general'); // Controls which tab opens in settings panel
const isScrolledTop = ref(true); // Track if chat is scrolled to top

// Make availableModels reactive
const models = ref(availableModels);

// Initialize the Settings composable reactively
const settingsManager = reactive(new Settings());

onMounted(async () => {
  await settingsManager.loadSettings();
  // Make sure selected_model_id is set to a default if not already set
  if (!settingsManager.settings.selected_model_id) {
    settingsManager.settings.selected_model_id = "qwen/qwen3-32b"; // Default model ID
  }
  // Update the selected model name if not already set
  if (!settingsManager.settings.selected_model_name) {
    settingsManager.settings.selected_model_name = "Qwen 3 32B"; // Default model name
  }
});

/**
 * Computed property to get the name of the currently selected model from settings.
 * This will be displayed in the MessageForm.
 */
const selectedModelName = computed(() => {
  return settingsManager.settings.selected_model_name || 'Loading...';
});

/**
 * Computed property to get the ID of the currently selected model from settings.
 * This will be used to highlight the selected model in the MessageForm.
 */
const selectedModelId = computed(() => {
  return settingsManager.settings.selected_model_id || "";
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Handles sending a message to the AI.
 * Retrieves current API configuration from settingsManager.
 * @param {string} message - The user's message.
 */
async function sendMessage(message) {
  if (!message.trim() || isLoading.value) return;

  controller.value = new AbortController();
  isLoading.value = true;
  isTyping.value = false;

  const userPrompt = message;

  // Exclude the last (empty) assistant message if it exists
  const plainMessages = messages.value
    .filter(msg => msg.complete)
    .map(msg => ({
      role: msg.role,
      content: msg.content
    }));

  messages.value.push({
    id: generateId(),
    role: "user",
    content: userPrompt,
    timestamp: new Date(),
    complete: true,
  });
  console.log("Pushed user message to messages array");
  // Safely log full messages array
  try {
    console.log("Full messages array after user message push:", JSON.parse(JSON.stringify(messages.value)));
  } catch (e) {
    console.log("Could not serialize full messages array after user message push:", messages.value);
  }

  // Update global memory with the user's message and conversation context
  // Run in background without blocking the UI
  if (settingsManager.settings.global_memory_enabled) {
    // Non-blocking memory update - don't await this
    updateMemory(userPrompt, messages)
      .catch(error => {
        console.error("Error updating memory:", error);
        // Silently handle memory update errors to avoid disrupting chat flow
      });
  }

      const assistantMsg = {
      id: generateId(),
      role: "assistant",
      reasoning: "",
      content: "",
      executed_tools: [], // Add executed_tools array (using underscore naming convention)
      timestamp: new Date(),
      complete: false,
      reasoningStartTime: null,
      reasoningEndTime: null,
      reasoningDuration: null,
      error: false, // Add error flag
      errorDetails: null // Add error details storage
    };

    console.log("Created new assistant message:", assistantMsg);

  messages.value.push(assistantMsg);
  console.log("Pushed assistant message to messages array:", assistantMsg);
  // Safely log full messages array
  try {
    // console.log("Full messages array after push:", JSON.parse(JSON.stringify(messages.value)));
  } catch (e) {
    // console.log("Could not serialize full messages array after push:", messages.value);
  }

  if (!currConvo.value) {
    currConvo.value = await createConversation(messages.value, new Date());
    if (currConvo.value) {
      const convData = await localforage.getItem(`conversation_${currConvo.value}`);
      conversationTitle.value = convData?.title || "";
    }
  }

  await nextTick();
  // Use requestAnimationFrame for more reliable scrolling
  requestAnimationFrame(() => {
    chatPanel.value?.scrollToEnd("smooth");
  });

  // Get current model details from the settingsManager (reactive instance)
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

  const selectedModelDetails = findModelById(availableModels, settingsManager.settings.selected_model_id);

  if (!selectedModelDetails) {
    console.error("No model selected or model details not found. Aborting message send.");
    assistantMsg.content = (assistantMsg.content ? assistantMsg.content + "\n\n" : "") + "Error: No AI model selected.";
    assistantMsg.complete = true;
    isLoading.value = false;
    return;
  }

  // Update the selected model name in settings for the UI
  settingsManager.settings.selected_model_name = selectedModelDetails.name;

  const selected_model_id = selectedModelDetails.id;
  const model_parameters = selectedModelDetails.extra_parameters || {}; // This object contains model parameters

  try {
    const streamGenerator = handleIncomingMessage(
      userPrompt,
      plainMessages,
      controller.value, // Pass the controller's instance
      selected_model_id,
      model_parameters, // Pass the entire model_parameters object
      settingsManager.settings, // Pass user settings
      selectedModelDetails.extra_functions || [], // Pass available tool names
      settingsManager.settings.search_enabled || false // Pass search toggle state
    );

    for await (const chunk of streamGenerator) {

      // Process content - handle empty strings but not null/undefined
      if (chunk.content !== null && chunk.content !== undefined) {
        assistantMsg.content += chunk.content;

        // Set reasoning end time when we first get content after reasoning started
        if (
          chunk.content &&
          assistantMsg.reasoningStartTime !== null &&
          assistantMsg.reasoningEndTime === null
        ) {
          assistantMsg.reasoningEndTime = new Date();
        }
      }

      // Process reasoning - handle empty strings but not null/undefined
      if (chunk.reasoning !== null && chunk.reasoning !== undefined) {
        assistantMsg.reasoning += chunk.reasoning;

        // Set reasoning start time if not set
        if (assistantMsg.reasoningStartTime === null) {
          assistantMsg.reasoningStartTime = new Date();
        }
      }

      // Process executed tools
      if (chunk.executed_tools && chunk.executed_tools.length > 0) {
        console.log("Processing executed tools in chunk:", chunk.executed_tools);
        console.log("Chunk type:", { hasContent: !!chunk.content, hasReasoning: !!chunk.reasoning });
        // Add new tools to the executed_tools array, avoiding duplicates
        chunk.executed_tools.forEach(tool => {
          console.log("Processing tool:", tool);
          // Check if tool with same index already exists
          const existingToolIndex = assistantMsg.executed_tools.findIndex(t => t.index === tool.index);
          if (existingToolIndex >= 0) {
            // Update existing tool
            console.log("Updating existing tool at index:", existingToolIndex);
            assistantMsg.executed_tools[existingToolIndex] = tool;
          } else {
            // Add new tool
            console.log("Adding new tool");
            assistantMsg.executed_tools.push(tool);
          }
        });
        console.log("Updated executed_tools array:", assistantMsg.executed_tools);
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

      if (chatPanel.value?.isAtBottom) {
        chatPanel.value.scrollToEnd("smooth");
      }
    }

  } catch (error) {
    console.error('Error in stream processing:', error);
    // Delete this entire catch block
  } finally {
    assistantMsg.complete = true;
    isLoading.value = false;

    // Calculate reasoning duration in the finally block
    if (assistantMsg.reasoningStartTime !== null) {
      const endTime = assistantMsg.reasoningEndTime !== null ? assistantMsg.reasoningEndTime : new Date();
      assistantMsg.reasoningDuration = endTime.getTime() - assistantMsg.reasoningStartTime.getTime();
    }

    // Enhanced error handling in finally block
    if (assistantMsg.complete && !assistantMsg.content && assistantMsg.errorDetails) {
      assistantMsg.content = `
[ERROR: ${assistantMsg.errorDetails.message}]`;
      if (assistantMsg.errorDetails.status) {
        assistantMsg.content += ` HTTP ${assistantMsg.errorDetails.status}`;
      }
    }

    // Make sure we have a copy of the final message
    console.log("Final message update, executed_tools:", assistantMsg.executed_tools);
    // Use Vue's array mutation method to ensure reactivity
    messages.value.splice(messages.value.length - 1, 1, { ...assistantMsg });
    await storeMessages(currConvo.value, messages.value, new Date());
  }
}

/**
 * Toggles the sidebar open/closed.
 */
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

/**
 * Changes the current conversation to the given ID.
 * @param {string} id - The ID of the conversation to load.
 */
async function changeConversation(id) {
  chatLoading.value = true;
  messages.value = [];
  currConvo.value = id;

  const conv = await localforage.getItem(`conversation_${currConvo.value}`);
  console.log("Loaded conversation data:", conv);
  // --- START CHANGES HERE: Convert date strings back to Date objects ---
  if (conv?.messages) {
    messages.value = conv.messages.map(msg => {
      console.log("Processing stored message:", msg);
      if (msg.role === 'assistant') {
        const processedMsg = {
          ...msg,
          // Convert ISO strings back to Date objects if they exist
          reasoningStartTime: msg.reasoningStartTime ? new Date(msg.reasoningStartTime) : null,
          reasoningEndTime: msg.reasoningEndTime ? new Date(msg.reasoningEndTime) : null,
          // Ensure executed_tools property exists
          executed_tools: msg.executed_tools || []
        };
        console.log("Processed assistant message executed_tools:", processedMsg.executed_tools);
        return processedMsg;
      }
      return msg;
    });
  } else {
    messages.value = [];
  }
  // --- END CHANGES HERE ---

  conversationTitle.value = conv?.title || '';
  chatLoading.value = false;

  // Ensure scroll to bottom happens after DOM update
  await nextTick();
  // Use a more reliable approach to ensure scroll happens
  requestAnimationFrame(() => {
    chatPanel.value?.scrollToEnd("instant");
  });
}

/**
 * Deletes a conversation by its ID.
 * @param {string} id - The ID of the conversation to delete.
 */
async function deleteConversation(id) {
  await deleteConv(id)
  if (currConvo.value === id) {
    currConvo.value = '';
    messages.value = [];
    conversationTitle.value = '';
  }
}

/**
 * Starts a new blank conversation.
 */
async function newConversation() {
  currConvo.value = '';
  messages.value = [];
  conversationTitle.value = '';
}

/**
 * Handles scroll events from the ChatPanel component.
 * @param {Object} event - The scroll event object
 * @param {boolean} event.isAtTop - Whether the user is scrolled to the top
 */
function handleChatScroll(event) {
  isScrolledTop.value = event.isAtTop;
}

/**
 * Handles model selection from the MessageForm component.
 * Updates the settings with the selected model.
 */
function handleModelSelect(modelId, modelName) {
  settingsManager.settings.selected_model_id = modelId;
  settingsManager.settings.selected_model_name = modelName;  // Trigger a reactive update
  settingsManager.saveSettings();
}

/**\\n * Opens the settings panel to a specific tab.\
 *  * @param {string} tabKey - The key of the tab to open (e.g., 'general', 'api').\
 *  */
function openSettingsPanel(tabKey = 'general') {
  settingsInitialTab.value = tabKey;
  isSettingsOpen.value = true;
}



</script>

<template>
  <div class="app-container">
    <Suspense>
      <AppSidebar :curr-convo="currConvo" :messages="messages" :is-open="sidebarOpen"
        @close-sidebar="sidebarOpen = false" @toggle-sidebar="toggleSidebar" @change-conversation="changeConversation"
        :is-dark="isDark" @delete-conversation="deleteConversation" @new-conversation="newConversation"
        @reload-settings="settingsManager.loadSettings" @open-settings="openSettingsPanel('general')" />
      <!-- Opens to General tab -->
    </Suspense>
    <!--
      Restructured layout:
      - app-container: Main flex container with sidebar
      - main-container: Full width/height container for chat content
      - ChatPanel: Takes full width with internal max-width constraint
      - MessageForm: Fixed position at bottom, centered with dynamic width
    -->
    <div class="main-container" :class="{ 'sidebar-open': sidebarOpen }">
      <TopBar :is-scrolled-top="isScrolledTop" :selected-model-name="selectedModelName"
        :selected-model-id="selectedModelId" :toggle-sidebar="toggleSidebar" :sidebar-open="sidebarOpen"
        @model-selected="handleModelSelect" />

      <ChatPanel ref="chatPanel" :curr-convo="currConvo" :curr-messages="messages" :isLoading="isLoading"
        :conversationTitle="conversationTitle" :show-welcome="!currConvo && !isTyping" :is-dark="isDark"
        @set-message="text => $refs.messageForm.setMessage(text)" @scroll="handleChatScroll" />
      <MessageForm ref="messageForm" :is-loading="isLoading"
        :selected-model-id="selectedModelId" :available-models="models"
        :selected-model-name="selectedModelName" :settings-manager="settingsManager"
        @typing="isTyping = true" @empty="isTyping = false"
        @send-message="sendMessage" @abort-controller="controller.abort()"/>
    </div>
    <DialogRoot v-model:open="isSettingsOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 bg-black/25" />
        <div class="fixed inset-0 overflow-y-auto">
          <div class="flex min-h-full items-center justify-center p-4 text-center">
            <DialogContent
              class="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-800 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]">
              <SettingsPanel :is-open="isSettingsOpen" :initial-tab="settingsInitialTab"
                @close="isSettingsOpen = false; settingsInitialTab = 'general';"
                @reload-settings="settingsManager.loadSettings" />
            </DialogContent>
          </div>
        </div>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>

<style>
a:hover {
  background-color: transparent;
}

/* Removed CSS variables as they are now in base.css */
html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100dvh;
  width: 100vw;
  background: var(--bg);
  color: var(--text-primary);
  font-family: var(--font);
  overflow: hidden;
}

img {
  user-select: none;
  -moz-user-select: none;
  -webkit-user-drag: none;
  -webkit-user-select: none;
  -ms-user-select: none;
}

button {
  background: transparent;
  border: none;
  padding: 8px;
  cursor: pointer;
  outline: none;
  border-radius: 12px;
  text-align: center;
  transition: all 0.2s ease;
  color: var(--text-primary);
}

button:hover {
  background-color: var(--bg-tertiary);
}

.app-container {
  display: flex;
  padding: 0;
  height: 100dvh;
  max-width: 100vw;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bg);
  position: relative;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

/*
  .main-container fills the viewport height and available width.
  Uses flexbox to allow the chat panel to grow/shrink and keep the message form at the bottom.
*/
.main-container {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  height: 100dvh;
  position: relative;
  background: inherit;
  width: 100%;
  overflow: hidden;
  transition: margin-left 0.3s cubic-bezier(.4, 1, .6, 1);
}

/* Sidebar open shifts main content right by sidebar width (280px) */
@media (min-width: 900px) {
  .main-container.sidebar-open {
    margin-left: 280px;
  }
}

/* Top bar styling */
.top-bar {
  height: 60px;
  background-color: var(--bg);
  width: 100%;
  z-index: 1000;
  flex-shrink: 0;
  border-bottom: 1px solid transparent;
  transition: border-bottom 0.2s ease;
}

.top-bar.with-border {
  border-bottom: 1px solid var(--border);
}

/* Update fade transition timing */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Dark mode settings */

.dark #app {
  background: var(--bg);
  color: var(--text-primary);
}

/* Other display size styles */

@media (max-width: 1024px) {
  .flag {
    display: none;
  }
}

@media (max-width: 768px) {

  #disclaimer {
    margin-top: -16px;
    font-size: smaller;
  }

  .app-container {
    padding: 0;
    /* Remove padding that was causing scrollbar */
  }

  header {
    padding-top: 0px;
  }
}

.global-menu-toggle {
  position: fixed;
  z-index: 1800;
  background: transparent;
  border: none;
  box-shadow: none;
  top: 8px;
  left: 8px;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  transition: all 0.18s, transform 0.2s;
  cursor: pointer;
}

.global-menu-toggle:hover {
  background: var(--btn-hover);
  transform: scale(1.05);
}

.dark .global-menu-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}

.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  z-index: 1001;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  background: transparent;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>