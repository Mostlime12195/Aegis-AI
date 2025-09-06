<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { PopoverRoot, PopoverTrigger, PopoverContent } from "reka-ui";
import { availableModels } from "../composables/availableModels";
import { Icon } from "@iconify/vue";

// Define component properties and emitted events
const props = defineProps({
  isLoading: Boolean,
  selectedModelName: {
    // Prop to display the current model name
    type: String,
    default: "Default Model",
  },
  selectedModelId: {
    type: String,
    default: "",
  },
  onModelSelect: {
    type: Function,
    default: () => { },
  },
});
const emit = defineEmits([
  "send-message",
  "abort-controller",
  "typing",
  "empty",
]);

// --- Reactive State ---
const inputMessage = ref("");
const textareaRef = ref(null); // Ref for the textarea element

// Computed property to check if the input is empty (after trimming whitespace)
const trimmedMessage = computed(() => inputMessage.value.trim());

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
    textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
  }
});

// --- Model Selection ---
function selectModelFromModal(modelId) {
  const selectedModel = availableModels.find((model) => model.id === modelId);
  if (selectedModel && typeof props.onModelSelect === 'function') {
    props.onModelSelect(modelId, selectedModel.name);
  }
}

// --- Exposed Methods ---

/**
 * Allows the parent component to programmatically set the input message.
 * @param {string} text - The message to set in the textarea.
 */
function setMessage(text) {
  inputMessage.value = text;
}

// Expose the setMessage function to be called from the parent component
defineExpose({ setMessage });
</script>

<template>
  <div class="input-section">
    <div class="input-area-wrapper">
      <textarea ref="textareaRef" v-model="inputMessage" :disabled="isLoading" @keydown.enter="handleEnterKey"
        placeholder="Type your message..." class="chat-textarea" rows="1"></textarea>

      <div class="input-actions">
        <!-- CHANGE: Added container with relative positioning for proper popover placement -->
        <div class="model-selector-wrapper">
          <PopoverRoot>
            <PopoverTrigger class="action-btn model-selector-btn"
              :aria-label="`Change model, currently ${props.selectedModelName}`">
              <span class="model-name-display">{{
                props.selectedModelName
              }}</span>
              <svg class="dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </PopoverTrigger>

            <PopoverContent class="model-selector-popover" side="top" align="start" :side-offset="8">
              <div class="popover-content">
                <ul class="model-list">
                  <li v-for="model in availableModels" :key="model.id" class="model-list-item" :class="{
                    selected:
                      model.id ===
                      props.selectedModelId,
                  }" @click="
                    () => {
                      selectModelFromModal(model.id);
                    }
                  ">
                    <div class="model-info">
                      <strong>{{ model.name }}</strong>
                    </div>
                    <span v-if="
                      model.id ===
                      props.selectedModelId
                    " class="selected-indicator">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  </li>
                </ul>
              </div>
            </PopoverContent>
          </PopoverRoot>
        </div>

        <button type="submit" class="action-btn send-btn" :disabled="!trimmedMessage && !isLoading"
          @click="handleActionClick" :aria-label="isLoading ? 'Stop generation' : 'Send message'">
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
  max-width: 800px;
  margin: 0 auto;
  padding: 8px 12px 0;
  box-sizing: border-box;
  z-index: 1000;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
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

.model-selector-btn {
  gap: 10px;
  padding: 10px 16px;
  font-size: 1rem;
  font-weight: 500;
  color: var(--btn-model-selector-text);
  border-radius: 12px;
  white-space: nowrap;
  align-items: center;
}

.model-selector-btn:hover {
  background-color: var(--btn-hover);
}

.model-name-display {
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
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

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px 0;
  gap: 8px;
}

/* --- MODEL SELECTOR POPOVER --- */
.model-selector-wrapper {
  position: relative;
}

.model-selector-btn {
  position: relative;
  z-index: 1999;
}

.model-list {
  list-style: none;
  padding: 8px;
  margin: 0;
  overflow-y: auto;
  background: var(--popover-bg);
  border-radius: 16px;
}

.model-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: none;
  color: var(--popover-list-item-text);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
  font-size: 0.95em;
  border-radius: 8px;
  margin-bottom: 4px;
}

.model-list-item:hover {
  background-color: var(--btn-hover);
}

.model-list-item.selected {
  background-color: var(--btn-hover);
  color: var(--popover-list-item-selected-text);
  font-weight: 500;
}

.model-info strong {
  display: block;
  font-size: 1em;
}

.selected-indicator {
  color: var(--primary-background);
  flex-shrink: 0;
  transform: translateY(3px);
  margin-left: 12px;
}

.selected-indicator svg {
  width: 16px;
  height: 16px;
}

/* Animation for popover */
@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.5) translateY(50px);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.model-selector-popover {
  animation: popIn 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  min-width: 300px;
  max-width: 200px;
}

/* Ensure MessageForm stays at the bottom */
.message-form {
  width: 100%;
  background: none;
  flex-shrink: 0;
  padding: 8px 0;
  margin: 0;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

/* Adjust message form position when sidebar is open */
@media (min-width: 900px) {
  .sidebar-open .input-section {
    left: 280px;
    right: 0;
    width: calc(100% - 280px);
    transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
  }
}
</style>
