<script setup>
import { ref, nextTick, onMounted, computed, reactive, watch, onBeforeUnmount } from 'vue';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/github-dark.css';
import { inject } from "@vercel/analytics"
import { injectSpeedInsights } from '@vercel/speed-insights';
import { useDark } from "@vueuse/core";
import localforage from 'localforage';
import { DialogRoot, DialogContent, DialogPortal, DialogOverlay } from 'reka-ui';

import { availableModels } from './composables/availableModels';
import Settings from './composables/settings';
import { useMessagesManager } from './composables/messagesManager';

import MessageForm from './components/MessageForm.vue';
import ChatPanel from './components/ChatPanel.vue';
import AppSidebar from './components/AppSidebar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ParameterConfigPanel from './components/ParameterConfigPanel.vue'
import TopBar from './components/TopBar.vue';


// Inject Vercel's analytics and performance insights
inject();
injectSpeedInsights();


const isDark = useDark();

// Initialize the Settings composable reactively
const settingsManager = reactive(new Settings());

// Reference to the ChatPanel component, used to be able to manually scroll down
const chatPanel = ref(null);

// Initialize the MessagesManager
const messagesManager = useMessagesManager(settingsManager, chatPanel);

// Destructure commonly used properties from messagesManager
const {
  messages,
  isLoading,
  controller,
  currConvo,
  conversationTitle,
  isIncognito,
  isTyping,
  chatLoading,
  sendMessage,
  changeConversation,
  deleteConversation,
  newConversation,
  toggleIncognito
} = messagesManager;

const messageForm = ref(null); // Reference to the MessageForm component

const sidebarOpen = ref(window.innerWidth > 900);
const parameterConfigPanelOpen = ref(false);
const isSettingsOpen = ref(false);
const settingsInitialTab = ref('general'); // Controls which tab opens in settings panel
const isScrolledTop = ref(true); // Track if chat is scrolled to the top

// Make availableModels reactive
const models = ref(availableModels);

// Watch for sidebar changes to update MessageForm position
watch([sidebarOpen, parameterConfigPanelOpen], () => {
  updateMessageFormPosition();
});

// Add resize observer for main container
let mainContainerResizeObserver = null;

onMounted(async () => {
  await settingsManager.loadSettings();
  // Make sure selected_model_id is set to a default if not already set
  if (!settingsManager.settings.selected_model_id) {
    settingsManager.settings.selected_model_id = "qwen/qwen3-32b"; // Default model ID
  }

  // Set up resize observer for main container
  const mainContainer = document.querySelector('.main-container');
  if (mainContainer) {
    mainContainerResizeObserver = new ResizeObserver(() => {
      updateMessageFormPosition();
    });
    mainContainerResizeObserver.observe(mainContainer);
  }

  // Initial update
  updateMessageFormPosition();
});

onBeforeUnmount(() => {
  if (mainContainerResizeObserver) {
    mainContainerResizeObserver.disconnect();
  }
});

// Function to update MessageForm position and width based on chat container
function updateMessageFormPosition() {
  if (!messageForm.value || !chatPanel.value || !chatPanel.value.chatWrapper) return;

  const chatWrapper = chatPanel.value.chatWrapper;
  const formElement = messageForm.value.$el ? messageForm.value.$el.value || messageForm.value.$el : messageForm.value;

  if (!chatWrapper || !formElement) return;

  // Get chat container dimensions
  const chatRect = chatWrapper.getBoundingClientRect();
  const chatContainer = chatWrapper.querySelector('.chat-container');

  if (!chatContainer) {
    // Fallback to chatWrapper if chat-container not found
    formElement.style.width = `${chatRect.width}px`;
    formElement.style.left = `${chatRect.left}px`;
    return;
  }

  // Get the chat-container dimensions (this is what we want to match)
  const containerRect = chatContainer.getBoundingClientRect();

  // Apply dimensions to MessageForm to match chat-container content area
  formElement.style.width = `${containerRect.width}px`;
  formElement.style.left = `${containerRect.left}px`;
  formElement.style.right = `${window.innerWidth - containerRect.right}px`;
}

/**
 * Computed property to get the name of the currently selected model from settings.
 * This will be displayed in the MessageForm.
 */
const selectedModelName = computed(() => {
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

  // Find the model in our available models and return its name
  const selectedModel = findModelById(availableModels, settingsManager.settings.selected_model_id);
  return selectedModel ? selectedModel.name : 'Loading...';
});

/**
 * Computed property to get the ID of the currently selected model from settings.
 * This will be used to highlight the selected model in the MessageForm.
 */
const selectedModelId = computed(() => {
  return settingsManager.settings.selected_model_id || "";
});

/**
 * Toggles the sidebar open/closed.
 */
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
  // On mobile, when closing the sidebar, we might want to ensure focus returns to the main content
  if (!sidebarOpen.value && window.innerWidth < 900) {
    // Focus on main content area for accessibility
    nextTick(() => {
      const mainContent = document.querySelector('.content-wrapper');
      if (mainContent) {
        mainContent.focus();
      }
    });
  }
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
  settingsManager.saveSettings();
}

/**
 * Opens the settings panel to a specific tab.
 * @param {string} tabKey - The key of the tab to open (e.g., 'general', 'api').
 */
function openSettingsPanel(tabKey = 'general') {
  settingsInitialTab.value = tabKey;
  isSettingsOpen.value = true;
}

/**
 * Handles parameter config save event.
 * @param {object} params - The parameter configuration object
 */
function handleParameterConfigSave(params) {
  console.log("Parameter config saved:", params);
  // The settings are already saved in the ParameterConfigPanel component
  // This function can be used for any additional actions needed after saving
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
    <ParameterConfigPanel :is-open="parameterConfigPanelOpen" :settings-manager="settingsManager"
      @close="parameterConfigPanelOpen = false" @save="handleParameterConfigSave" />
    <!--
      Restructured layout:
      - app-container: Main flex container with sidebar
      - main-container: Full width/height container for chat content
      - ChatPanel: Takes full width with internal max-width constraint
      - MessageForm: Fixed position at bottom, centered with dynamic width
    -->
    <div class="main-container"
      :class="{ 'sidebar-open': sidebarOpen, 'parameter-config-open': parameterConfigPanelOpen }">
      <TopBar :is-scrolled-top="isScrolledTop" :selected-model-name="selectedModelName"
        :selected-model-id="selectedModelId" :toggle-sidebar="toggleSidebar" :sidebar-open="sidebarOpen"
        :is-incognito="isIncognito" :show-incognito-button="!currConvo && messages.length === 0" :messages="messages"
        :parameter-config-open="parameterConfigPanelOpen" @model-selected="handleModelSelect"
        @toggle-incognito="toggleIncognito"
        @toggle-parameter-config="parameterConfigPanelOpen = !parameterConfigPanelOpen" />

      <div class="content-wrapper">
        <ChatPanel ref="chatPanel" :curr-convo="currConvo" :curr-messages="messages" :isLoading="isLoading"
          :conversationTitle="conversationTitle" :show-welcome="!currConvo && !isTyping" :is-dark="isDark"
          :is-incognito="isIncognito" @set-message="text => $refs.messageForm.setMessage(text)"
          @scroll="handleChatScroll" />
      </div>
      <MessageForm ref="messageForm" :is-loading="isLoading" :selected-model-id="selectedModelId"
        :available-models="models" :selected-model-name="selectedModelName" :settings-manager="settingsManager"
        @typing="isTyping = true" @empty="isTyping = false" @send-message="sendMessage"
        @abort-controller="controller.abort()" />
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
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
  z-index: 10;
}

/* Content wrapper to handle scrolling */
.content-wrapper {
  flex: 1;
  overflow-y: auto;
  position: relative;
  width: 100%;
}

/* Sidebar open shifts main content right by sidebar width (280px) */
@media (min-width: 900px) {
  .main-container.sidebar-open {
    margin-left: 280px;
  }

  .main-container.parameter-config-open {
    margin-right: 300px;
  }

  .main-container.sidebar-open.parameter-config-open {
    margin-left: 280px;
    margin-right: 300px;
  }
}

/* Top bar styling */

/* Update fade transition timing */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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

  /* Ensure proper sidebar behavior on mobile - use overlay instead of transform */
  .main-container {
    transition: none;
    /* Remove transitions that interfere with positioning */
    transform: none;
  }

  .main-container.sidebar-open,
  .main-container.parameter-config-open,
  .main-container.sidebar-open.parameter-config-open {
    transform: none;
    margin: 0;
  }
}

/* Mobile-specific styles - use overlay instead of transform for better positioning */
@media (max-width: 900px) {
  .main-container {
    transform: none;
    /* Remove transforms that interfere with fixed positioning */
    margin: 0;
    /* Reset any margin changes */
  }

  /* Use overlay positioning for mobile panels */
  .sidebar-open .main-container,
  .parameter-config-open .main-container {
    transform: none;
    margin: 0;
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