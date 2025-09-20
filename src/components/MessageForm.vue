<script setup>
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "reka-ui";

// Define component properties and emitted events
const props = defineProps({
  isLoading: Boolean,
  selectedModelId: String, // Add selected model ID to determine if search is supported
  availableModels: Array, // Add available models to check tool support
  settingsManager: Object, // Add settings manager prop
});
const emit = defineEmits([
  "send-message",
  "abort-controller",
  "typing",
  "empty",
]);

// Local state for search toggle
const isSearchEnabled = ref(false);

// Local state for reasoning effort
const reasoningEffort = ref("default");

// --- Reactive State ---
const inputMessage = ref("");
const textareaRef = ref(null); // Ref for the textarea element
const messageFormRoot = ref(null); // Ref for the root element

// Computed property to check if the input is empty (after trimming whitespace)
const trimmedMessage = computed(() => inputMessage.value.trim());

// Computed property to get the selected model object
const selectedModel = computed(() => {
  if (!props.selectedModelId || !props.availableModels) return null;

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

  return findModelById(props.availableModels, props.selectedModelId);
});

// Computed property to check if the current model supports reasoning effort
const isReasoningEffortSupported = computed(() => {
  return selectedModel.value && selectedModel.value.extra_parameters &&
    selectedModel.value.extra_parameters.reasoning_effort;
});

// Computed property to get reasoning effort options for the current model
// Reversing the order so that "high" appears at the top and "low" at the bottom
const reasoningEffortOptions = computed(() => {
  if (!isReasoningEffortSupported.value) return [];
  const options = selectedModel.value.extra_parameters.reasoning_effort[0];
  // For GPT OSS models, we want high at top and low at bottom
  if (selectedModel.value.id.includes('gpt-oss')) {
    return [...options].reverse();
  }
  return options;
});

// Computed property to get the default reasoning effort for the current model
const defaultReasoningEffort = computed(() => {
  if (!isReasoningEffortSupported.value) return "default";
  return selectedModel.value.extra_parameters.reasoning_effort[1];
});

// Computed property to check if the current model supports browser search
const isBrowserSearchSupported = computed(() => {
  if (!props.selectedModelId || !props.availableModels) return false;

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

  const selectedModel = findModelById(props.availableModels, props.selectedModelId);
  return selectedModel && selectedModel.extra_functions && selectedModel.extra_functions.includes('browser_search');
});

// Watch the computed property and update the ref
watch(
  () => props.settingsManager?.settings?.search_enabled,
  (newValue) => {
    isSearchEnabled.value = newValue || false;
  },
  { immediate: true }
);

// Watch the selected model and load the appropriate reasoning effort setting
watch(
  () => [props.selectedModelId, props.settingsManager?.settings?.model_settings],
  ([newModelId]) => {
    if (newModelId && props.settingsManager) {
      const savedReasoningEffort = props.settingsManager.getModelSetting(newModelId, "reasoning_effort");
      if (savedReasoningEffort !== undefined) {
        reasoningEffort.value = savedReasoningEffort;
      } else if (defaultReasoningEffort.value) {
        reasoningEffort.value = defaultReasoningEffort.value;
      } else {
        reasoningEffort.value = "default";
      }
    }
  },
  { immediate: true }
);

// --- Event Handlers ---

watch(inputMessage, (newValue) => {
  if (newValue.trim()) {
    emit("typing");
  } else {
    emit("empty");
  }
});

/**
 * Handles the main action button click.
 * If loading, it aborts the request. Otherwise, it submits the message.
 */
function handleActionClick() {
  if (props.isLoading) {
    emit("abort-controller");
  } else if (trimmedMessage.value) {
    submitMessage();
  }
}

/**
 * Handles the Enter key press on the textarea.
 * On desktop (>= 768px), Enter submits the message.
 * On mobile, Enter creates a new line, as Shift+Enter is often unavailable.
 * @param {KeyboardEvent} event
 */
function handleEnterKey(event) {
  if (window.innerWidth >= 768 && !event.shiftKey) {
    event.preventDefault(); // Prevent default newline behavior on desktop
    submitMessage();
  }
  // On mobile or with Shift key, allow the default behavior (newline).
}

// --- Core Logic ---

/**
 * Emits the message to the parent, then clears the input.
 */
async function submitMessage() {
  emit("send-message", inputMessage.value);
  inputMessage.value = "";
  // Force textarea resize after clearing
  await nextTick();
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
}

/**
 * Watches the input message to automatically resize the textarea.
 */
watch(inputMessage, async () => {
  // Wait for the DOM to update before calculating the new height

  await nextTick();
  if (textareaRef.value) {
    // Temporarily set height to 'auto' to correctly calculate the new scrollHeight

    textareaRef.value.style.height = "auto";
    // Set the height to match the content, up to the max-height defined in CSS

    // If the content is empty, let CSS handle the min-height

    if (inputMessage.value !== "") {
      textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
    }
  }
});

// --- Exposed Methods ---

/**
 * Allows the parent component to programmatically set the input message.
 * @param {string} text - The message to set in the textarea.
 */
function setMessage(text) {
  inputMessage.value = text;
}

/**
 * Toggles the search functionality and updates the settings
 */
function toggleSearch() {
  isSearchEnabled.value = !isSearchEnabled.value;
  // Update the setting in the settings manager
  if (props.settingsManager) {
    props.settingsManager.setSetting("search_enabled", isSearchEnabled.value);
    props.settingsManager.saveSettings();
  }
}

/**
 * Toggles the reasoning effort and updates the settings
 */
function toggleReasoning() {
  // For qwen3-32b, toggle between "default" and "none"
  reasoningEffort.value = reasoningEffort.value === "default" ? "none" : "default";
  // Update the setting in the settings manager
  if (props.settingsManager && props.selectedModelId) {
    props.settingsManager.setModelSetting(props.selectedModelId, "reasoning_effort", reasoningEffort.value);
    props.settingsManager.saveSettings();
  }
}

/**
 * Sets the reasoning effort for GPT-OSS models and updates the settings
 * @param {string} value - The selected reasoning effort value
 */
function setReasoningEffort(value) {
  reasoningEffort.value = value;
  // Update the setting in the settings manager
  if (props.settingsManager && props.selectedModelId) {
    props.settingsManager.setModelSetting(props.selectedModelId, "reasoning_effort", value);
    props.settingsManager.saveSettings();
  }
}

// Expose the setMessage function to be called from the parent component
defineExpose({ setMessage, toggleSearch, toggleReasoning, setReasoningEffort, $el: messageFormRoot });
</script>

<template>
  <div ref="messageFormRoot" class="input-section">
    <div class="input-area-wrapper">
      <textarea ref="textareaRef" v-model="inputMessage" :disabled="isLoading" @keydown.enter="handleEnterKey"
        placeholder="Type your message..." class="chat-textarea" rows="1"></textarea>

      <div class="input-actions">
        <!-- Search toggle button -->
        <button v-if="isBrowserSearchSupported" type="button" class="feature-button search-toggle-btn"
          :class="{ 'search-enabled': isSearchEnabled }" @click="toggleSearch"
          :aria-label="isSearchEnabled ? 'Disable web search' : 'Enable web search'">
          <Icon icon="material-symbols:globe" width="22" height="22" />
          <span class="search-label">Search</span>
        </button>

        <!-- Reasoning toggle for qwen3-32b -->
        <button v-if="selectedModel && selectedModel.id === 'qwen/qwen3-32b' && isReasoningEffortSupported"
          type="button" class="feature-button search-toggle-btn"
          :class="{ 'search-enabled': reasoningEffort === 'default' }" @click="toggleReasoning"
          :aria-label="reasoningEffort === 'default' ? 'Disable reasoning' : 'Enable reasoning'">
          <Icon icon="material-symbols:lightbulb" width="22" height="22" />
          <span class="search-label">Reasoning</span>
        </button>

        <!-- Reasoning effort dropdown for GPT-OSS models with more than 2 options -->
        <DropdownMenuRoot
          v-if="selectedModel && selectedModel.id !== 'qwen/qwen3-32b' && isReasoningEffortSupported && reasoningEffortOptions.length > 2">
          <DropdownMenuTrigger class="feature-button search-toggle-btn">
            <Icon icon="material-symbols:lightbulb" width="22" height="22" />
            <span>{{ reasoningEffort.charAt(0).toUpperCase() + reasoningEffort.slice(1) }} Reasoning</span>
          </DropdownMenuTrigger>

          <DropdownMenuContent class="popover-dropdown reasoning-effort-dropdown" side="top" align="center"
            :side-offset="8">
            <div class="dropdown-scroll-container">
              <DropdownMenuItem v-for="option in reasoningEffortOptions" :key="option" class="reasoning-effort-item"
                :class="{ selected: option === reasoningEffort }" @click="() => setReasoningEffort(option)">
                <span>{{ option.charAt(0).toUpperCase() + option.slice(1) }} Reasoning</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenuRoot>

        <button type="submit" class="action-btn send-btn" :disabled="!trimmedMessage && !isLoading"
          @click="handleActionClick" :aria-label="isLoading ? 'Stop generation' : 'Send message'"
          style="margin-left: auto;">
          <Icon v-if="!isLoading" icon="material-symbols:send-rounded" width="22" height="22" />
          <Icon v-else icon="material-symbols:stop-rounded" width="22" height="22" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- LAYOUT & STRUCTURE --- */
.input-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  margin: 0 auto;
  padding: 8px 12px 0;
  box-sizing: border-box;
  z-index: 1000;
  background: transparent; /* Remove background to avoid covering content */
}

.input-area-wrapper {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 28px 28px 0 0;
  padding: 8px;
  box-shadow: var(--shadow-default);
  position: relative;
  z-index: 10;
}

.chat-textarea {
  display: block;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  resize: none;
  color: var(--text-primary);
  font-size: 1rem;
  line-height: 1.5;
  min-height: 24px;
  max-height: 250px;
  overflow-y: auto;
}

.chat-textarea:focus {
  outline: none;
}

/* --- BUTTONS --- */
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    transform 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.send-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: var(--btn-send-bg);
  color: var(--btn-send-text);
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background-color: var(--btn-send-hover-bg);
}

.send-btn:disabled {
  background-color: var(--btn-send-disabled-bg);
  cursor: not-allowed;
  transform: none;
}

.send-btn:disabled .icon-send {
  stroke: var(--btn-send-text);
  opacity: 0.7;
}

/* Feature button base styles */
.feature-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;

  color: var(--btn-model-selector-text);
  border: 1px solid var(--border);
  cursor: pointer;
  flex-shrink: 0;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.2s ease;
  height: 36px;
  margin: 0;
}

.feature-button:hover:not(:disabled) {
  background-color: var(--btn-model-selector-hover-bg);
}

.search-toggle-btn.search-enabled {
  background-color: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

.search-toggle-btn.search-enabled:hover:not(:disabled) {
  background-color: var(--primary-600);
  border-color: var(--primary-600);
}

.search-label {
  font-weight: 500;
  font-size: 13px;
}

.input-actions {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 8px 4px 0;
  gap: 6px;
  width: 100%;
}

/* Adjust message form position when sidebar is open */
@media (min-width: 900px) {
  .sidebar-open .input-section {
    left: 280px;
    right: 0;
    width: calc(100% - 280px);
  }
}

/* Reasoning effort dropdown styles */
.reasoning-effort-dropdown {
  animation: popIn 0.2s ease-out forwards;
  min-width: 200px;
  background: var(--popover-bg);
  border-radius: 12px;
  padding: 6px;
  box-shadow: var(--popover-shadow);
  border: 1px solid var(--popover-border);
  z-index: 1001;
}

.reasoning-effort-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: none;
  color: var(--popover-list-item-text);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  font-size: 0.95rem;
  border-radius: 6px;
  margin-bottom: 2px;
  border: none;
}

.reasoning-effort-item:hover {
  background-color: var(--popover-list-item-bg-hover);
}

.reasoning-effort-item.selected {
  background-color: var(--popover-list-item-selected-bg);
  color: var(--popover-list-item-selected-text);
  font-weight: 500;
}

/* Animation for dropdown */
@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.95) translateY(-5px);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
