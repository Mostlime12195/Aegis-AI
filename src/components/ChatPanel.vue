<script setup>
import { onMounted, onUnmounted, ref, watch, nextTick, computed, reactive } from "vue";
import { Icon } from "@iconify/vue";
import hljs from "highlight.js";
import { chatPanelMd as md } from '../utils/markdown';
import StreamingMessage from './StreamingMessage.vue';
import LoadingSpinner from './LoadingSpinner.vue';

// Initialize markdown-it with plugins (without markdown-it-katex)
// Using shared instance from utils/markdown.js


// Add custom fence rule for code blocks
const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
}

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const langName = info ? info.split(/\s+/g)[0] : '';

  // Handle code blocks
  const code = token.content;
  const lang = langName || 'text';
  const langDisplay = lang;

  let highlightedCode;
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlightedCode = hljs.highlight(code, {
        language: lang,
        ignoreIllegals: true,
      }).value;
    } catch (__) {
      highlightedCode = md.utils.escapeHtml(code);
    }
  } else {
    highlightedCode = md.utils.escapeHtml(code);
  }

  // Build HTML using string concatenation to avoid template literal parsing issues
  return ''
    + '<div class="code-block-wrapper">'
    + '<div class="code-block-header">'
    + '<span class="code-language">' + langDisplay + '</span>'
    + '<div class="code-actions">'
    + '<button class="code-action-button" onclick="window.downloadCode(event.currentTarget, \'' + langDisplay + '\')" title="Download file">'
    + '<span>Download</span>'
    + '</button>'
    + '<button class="code-action-button" onclick="window.copyCode(event.currentTarget)" title="Copy code">'
    + '<span>Copy</span>'
    + '</button>'
    + '</div>'
    + '</div>'
    + '<pre><code class="hljs ' + md.utils.escapeHtml(lang) + '">' + highlightedCode + '</code></pre>'
    + '</div>';
}

const props = defineProps({
  currConvo: {
    type: [String, Number, Object],
    default: null
  },
  currMessages: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  conversationTitle: {
    type: String,
    default: ''
  },
  showWelcome: {
    type: Boolean,
    default: false
  },
  isDark: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["send-message", "set-message", "scroll"]);

const langExtMap = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  html: "html",
  css: "css",
  vue: "vue",
  json: "json",
  markdown: "md",
  shell: "sh",
  bash: "sh",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  go: "go",
  rust: "rs",
  ruby: "rb",
  php: "php",
  sql: "sql",
  xml: "xml",
  yaml: "yml",
}

const liveReasoningTimers = reactive({});
const timerIntervals = {};
const messageLoadingStates = reactive({});

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const isAtBottom = ref(true);
const chatWrapper = ref(null);

const messages = computed(() => {
  if (!props.currMessages) return [];
  return props.currMessages;
});

const scrollToEnd = (behavior = "smooth") => {
  if (!chatWrapper.value) return;
  chatWrapper.value.scrollTo({
    top: chatWrapper.value.scrollHeight,
    behavior,
  });
};

const handleScroll = () => {
  if (!chatWrapper.value) return;
  isAtBottom.value =
    Math.abs(
      chatWrapper.value.scrollHeight -
      chatWrapper.value.scrollTop -
      chatWrapper.value.clientHeight,
    ) < 10;

  const isAtTop = chatWrapper.value.scrollTop === 0;
  emit('scroll', { isAtTop });
};

watch(
  messages,
  (newMessages) => {
    if (isAtBottom.value) {
      nextTick(() => scrollToEnd("instant"));
    }

    newMessages.forEach((msg) => {
      if (timerIntervals[msg.id]) {
        clearInterval(timerIntervals[msg.id]);
        delete timerIntervals[msg.id];
      }

      // Handle loading states for assistant messages
      if (msg.role === 'assistant') {
        // Show loading spinner for new messages that are not complete and have no content
        if (!msg.complete && (!msg.content || msg.content.length === 0)) {
          if (messageLoadingStates[msg.id] !== true) {
            messageLoadingStates[msg.id] = true;
          }
        }
        // Hide loading spinner as soon as the message has content (streaming started) or is complete
        else if ((msg.content && msg.content.length > 0) || msg.complete) {
          if (messageLoadingStates[msg.id] !== false) {
            messageLoadingStates[msg.id] = false;
          }
        }
      }

      if (msg.role === "assistant" && msg.reasoning) {
        if (msg.complete) {
          if (msg.reasoningDuration) {
            liveReasoningTimers[msg.id] =
              `Thought for ${formatDuration(msg.reasoningDuration)}`;
          }
          else if (msg.reasoningStartTime && msg.reasoningEndTime) {
            const duration =
              msg.reasoningEndTime.getTime() - msg.reasoningStartTime.getTime();
            liveReasoningTimers[msg.id] =
              `Thought for ${formatDuration(duration)}`;
          }
          else if (msg.reasoningStartTime) {
            liveReasoningTimers[msg.id] = "Thought for a moment";
          }
          return;
        }

        if (!timerIntervals[msg.id]) {
          const startTime = msg.reasoningStartTime || new Date();
          timerIntervals[msg.id] = setInterval(() => {
            const elapsed = new Date().getTime() - startTime.getTime();
            liveReasoningTimers[msg.id] =
              `Thinking for ${formatDuration(elapsed)}...`;
          }, 100);
        }
      }
    });

    const currentMessageIds = newMessages.map((msg) => msg.id);
    Object.keys(timerIntervals).forEach((timerId) => {
      if (!currentMessageIds.includes(timerId)) {
        clearInterval(timerIntervals[timerId]);
        delete timerIntervals[timerId];
        delete liveReasoningTimers[timerId];
      }
    });

    // Clean up loading states for removed messages
    Object.keys(messageLoadingStates).forEach((msgId) => {
      if (!currentMessageIds.includes(msgId)) {
        delete messageLoadingStates[msgId];
      }
    });
  },
  { deep: true, immediate: true },
);

watch(
  () => props.currConvo,
  (newConvo, oldConvo) => {
    if (newConvo && newConvo !== oldConvo) {
      nextTick(() => {
        requestAnimationFrame(() => {
          scrollToEnd("instant");
        });
      });
    }
  }
);

onMounted(() => {
  nextTick(() => scrollToEnd("instant"));

  // Make functions available globally
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
});

onUnmounted(() => {
  // Clean up all timers
  Object.values(timerIntervals).forEach(timer => {
    clearInterval(timer);
  });
});

function copyCode(button) {
  const codeEl = button
    .closest(".code-block-wrapper")
    .querySelector("pre code");
  const text = codeEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const textEl = button.querySelector("span");
    textEl.textContent = "Copied!";
    button.classList.add("copied");
    setTimeout(() => {
      textEl.textContent = "Copy";
      button.classList.remove("copied");
    }, 2000);
  });
};

function downloadCode(button, lang) {
  const codeEl = button
    .closest(".code-block-wrapper")
    .querySelector("pre code");
  const code = codeEl.innerText;
  const extension = langExtMap[lang.toLowerCase()] || "txt";
  const filename = `code-${Date.now()}.${extension}`;
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Render message content with markdown
function renderMessageContent(content, executedTools) {
  // Render Markdown - the citation plugin will handle citations automatically
  const html = md.render(content || '');

  // Create a temporary div to hold the HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Process citations in place within the temporary div
  md.processCitationsInPlace(tempDiv, executedTools);

  // Return the processed HTML
  return tempDiv.innerHTML;
}



const renderReasoningContent = (content) => {
  // First render Markdown
  let html = md.render(content || '');

  // For reasoning content, we need to handle processing in a controlled way
  // This will be handled by the watch function that monitors message updates

  return html;
};

// Function to handle when streaming message starts
function onStreamingMessageStart(messageId) {
  // We don't need to change the loading state here since it's already handled by the watcher
}

// Function to handle when a streaming message is complete
function onStreamingMessageComplete(messageId) {
  // Set loading state to false when streaming is complete
  if (messageLoadingStates[messageId] !== false) {
    messageLoadingStates[messageId] = false;
  }
}

defineExpose({ scrollToEnd, isAtBottom });
</script>

<template>
  <div class="chat-wrapper" ref="chatWrapper" @scroll="handleScroll">
    <div class="chat-container">
      <h1 v-if="messages.length < 1" class="welcome-message">What do you need help with?</h1>
      <div class="messages-layer">
        <template v-for="message in messages" :key="message.id">
          <div class="message" :class="message.role" :data-message-id="message.id">
            <div class="message-content">
              <details v-if="message.role === 'assistant' && message.reasoning" class="reasoning-details">
                <summary class="reasoning-summary">
                  <span class="reasoning-toggle-icon">
                    <Icon icon="material-symbols:keyboard-arrow-down-rounded" width="24" height="24" />
                  </span>
                  <span class="reasoning-text">
                    <span v-if="liveReasoningTimers[message.id]">{{
                      liveReasoningTimers[message.id]
                    }}</span>
                    <span v-else-if="message.reasoningDuration > 0">Thought for
                      {{ formatDuration(message.reasoningDuration) }}</span>
                    <span v-else-if="
                      message.reasoningStartTime && message.reasoningEndTime
                    ">Thought for a moment</span>
                    <span v-else-if="message.reasoning && message.complete">Thought for a moment</span>
                    <span v-else>Reasoning</span>
                  </span>
                </summary>
                <div class="reasoning-content-wrapper">
                  <div class="reasoning-content markdown-content" v-html="renderReasoningContent(message.reasoning)">
                  </div>
                </div>
              </details>

              <div class="bubble">
                <div v-if="message.role == 'user'">{{ message.content }}</div>
                <div v-else-if="message.complete" class="markdown-content"
                  v-html="renderMessageContent(message.content, message.executed_tools || [])"></div>
                <div v-else>
                  <div v-if="messageLoadingStates[message.id]" class="loading-animation">
                    <LoadingSpinner />
                  </div>
                  <StreamingMessage :content="message.content" :is-complete="message.complete"
                    :executed-tools="message.executed_tools || []" @complete="onStreamingMessageComplete(message.id)"
                    @start="onStreamingMessageStart(message.id)" />
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style>
.chat-wrapper {
  --bubble-user-bg: var(--primary);
  --bubble-user-text: var(--primary-foreground);
  --text-primary-light: var(--text-primary);
  --text-secondary-light: var(--text-secondary);
  --text-primary-dark: var(--text-primary);
  --text-secondary-dark: var(--text-secondary);
  --reasoning-border-light: var(--border);
  --reasoning-border-dark: var(--border);
  --code-bg: #0d1117;
  --code-header-bg: #161b22;
  --code-border: #30363d;
  --code-text: #c9d1d9;
  --code-action-text: #8b949e;
  --code-action-hover-bg: rgba(173, 186, 199, 0.1);
  --code-action-hover-text: #c9d1d9;
  --code-bg-light: #e4dfd8;
  --code-header-bg-light: #ddd7d1;
  --code-border-light: #cabdb6;
  --code-text-light: #3a2119;
  --code-action-text-light: #63564b;
  --code-action-hover-bg-light: rgba(192, 74, 44, 0.1);
  --code-action-hover-text-light: #3a2119;
  --code-comment-light: #6b7280;
  --code-keyword-light: #9d1d04;
  --code-function-light: #2d4a7e;
  --code-string-light: #9d5b04;
  --code-number-light: #106f5d;
  --code-variable-light: #5b3a88;
  --code-property-light: #046d3d;
  --code-comment-dark: #8b949e;
  --code-keyword-dark: #ff7b72;
  --code-function-dark: #d2a8ff;
  --code-string-dark: #a5d6ff;
  --code-number-dark: #79c0ff;
  --code-variable-dark: #ffa657;
  --code-property-dark: #7ee787;
  flex: 1;
  overflow-y: auto;
  position: relative;
  padding-bottom: 120px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  scrollbar-gutter: stable both-edges;
}

.chat-container {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 12px;
  box-sizing: border-box;
  position: relative;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.welcome-message {
  text-align: center;
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-primary-light);
  margin: calc(1rem + 10vh) 0;
  width: 100%;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.dark .welcome-message {
  color: var(--text-primary-dark);
}

.message {
  display: block;
  width: 100%;
  max-width: 800px;
  margin: 1.5rem auto;
  position: relative;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.message.user {
  justify-content: flex-end;
  display: flex;
  width: 100%;
}

.message-content {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.message.user .message-content {
  align-items: flex-end;
  max-width: 85%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.bubble {
  display: block;
  padding: 12px 16px;
  border-radius: 18px;
  line-height: 1.5;
  font-size: 1rem;
  width: 100%;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.message.user .bubble {
  background: var(--bubble-user-bg);
  color: var(--bubble-user-text);
  white-space: pre-wrap;
  border-bottom-right-radius: 4px;
  margin-left: auto;
  max-width: calc(800px * 0.85);
  width: fit-content;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
  text-align: left;
  /* Ensure text alignment within the bubble */
}

.message.assistant .bubble {
  padding: 0;
  color: var(--text-primary-light);
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.dark .message.assistant .bubble {
  color: var(--text-primary-dark);
}

.reasoning-details {
  background: none;
  border: none;
  padding: 0;
  margin-bottom: 0.75rem;
  order: -1;
  width: 100%;
  max-width: 800px;
  margin: 0 auto 0.75rem auto;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.reasoning-summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary-light);
  font-size: 0.9em;
  font-weight: 500;
  margin-bottom: 0.5rem;
  user-select: none;
}

.dark .reasoning-summary {
  color: var(--text-secondary-dark);
}

.reasoning-summary::-webkit-details-marker {
  display: none;
}

.reasoning-toggle-icon {
  transition: transform 0.2s ease-in-out;
  display: flex;
  align-items: center;
  margin-left: -10px;
  transform: rotate(-90deg);
}

.reasoning-details[open] .reasoning-toggle-icon {
  transform: rotate(0deg);
}

.reasoning-content-wrapper {
  padding-left: 1.25rem;
  border-left: 2px solid var(--reasoning-border-light);
}

.dark .reasoning-content-wrapper {
  border-left-color: var(--reasoning-border-dark);
}

.reasoning-content {
  color: var(--text-secondary-light);
}

.dark .reasoning-content {
  color: var(--text-secondary-dark);
}

.reasoning-details:not([open]) .reasoning-content-wrapper {
  display: none;
}

.markdown-content .code-block-wrapper {
  background-color: var(--code-bg-light);
  border: 1px solid var(--code-border-light);
  border-radius: 8px;
  margin: 1em 0;
  overflow: hidden;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.dark .markdown-content .code-block-wrapper {
  background-color: var(--code-bg);
  border-color: var(--code-border);
}

.code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--code-header-bg-light);
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--code-border-light);
  position: sticky;
  top: 0;
  z-index: 10;
}

.dark .code-block-header {
  background-color: var(--code-header-bg);
  border-bottom-color: var(--code-border);
}

.code-language {
  font-family: monospace;
  font-size: 0.85em;
  color: var(--code-action-text-light);
  text-transform: lowercase;
}

.dark .code-language {
  color: var(--code-action-text);
}

.code-actions {
  display: flex;
  gap: 4px;
}

.code-action-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--code-action-text-light);
  padding: 4px 8px;
  font-size: 0.8em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.dark .code-action-button {
  color: var(--code-action-text);
}

.code-action-button:hover {
  background-color: var(--code-action-hover-bg-light);
  color: var(--code-action-hover-text-light);
}

.dark .code-action-button:hover {
  background-color: var(--code-action-hover-bg);
  color: var(--code-action-hover-text);
}

.code-action-button.copied {
  color: #3fb950;
}

.code-action-button svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.code-block-wrapper pre {
  margin: 0;
  padding: 0;
  overflow-x: auto;
}

.code-block-wrapper pre code.hljs {
  display: block;
  padding: 16px;
  background: transparent;
  color: var(--code-text-light);
  font-size: 0.9em;
  line-height: 1.6;
}

.dark .code-block-wrapper pre code.hljs {
  color: var(--code-text);
}

.markdown-content {
  color: var(--text-primary-light);
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  box-sizing: border-box;
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
}

.dark .markdown-content {
  color: var(--text-primary-dark);
}

.markdown-content>*:first-child {
  margin-top: 0;
}

.markdown-content>*:last-child {
  margin-bottom: 0;
}

.markdown-content hr {
  border: none;
  border-top: 1px solid var(--reasoning-border-light);
  margin: 1.5em 0;
}

.dark .markdown-content hr {
  border-top-color: rgba(139, 148, 158, 0.3);
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  margin-top: 1.2em;
  margin-bottom: 0;
  font-weight: 700;
}

.dark .markdown-content h1,
.dark .markdown-content h2,
.dark .markdown-content h3 {
  font-weight: 700;
}

.markdown-content p {
  margin: 0.8em 0;
}

.markdown-content strong,
.markdown-content b {
  font-weight: 700;
  color: var(--text-primary-light);
}

.dark .markdown-content strong,
.dark .markdown-content b {
  color: var(--text-primary-dark);
}

.markdown-content ul,
.markdown-content ol {
  margin: 1em 0;
  padding-left: 2em;
}

.markdown-content li.task-list-item {
  list-style-type: none;
  position: relative;
  margin-bottom: 0.5em;
}

.markdown-content li.task-list-item input[type="checkbox"] {
  position: absolute;
  left: -2em;
  width: 1.2em;
  height: 1.2em;
  border: 1px solid var(--reasoning-border-light);
  border-radius: 3px;
  background-color: var(--background);
  transition: all 0.2s ease-in-out;
  margin-top: 0.2em;
  pointer-events: none;
  cursor: default;
  appearance: none;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}

.dark .markdown-content li.task-list-item input[type="checkbox"] {
  border-color: var(--reasoning-border-dark);
  background-color: var(--code-header-bg);
}

.markdown-content li.task-list-item input[type="checkbox"]:checked {
  background-color: #3fb950;
  border-color: #3fb950;
}

.markdown-content li.task-list-item input[type="checkbox"]:checked::after {
  content: "";
  position: absolute;
  left: 0.3em;
  top: 0.1em;
  width: 0.4em;
  height: 0.7em;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.markdown-content li.task-list-item input[type="checkbox"]+span {
  margin-left: 0.5em;
}

.markdown-content p,
.markdown-content li {
  text-rendering: optimizeSpeed;
}

.dark .markdown-content li.task-list-item input[type="checkbox"]:checked+span {
  color: var(--text-secondary-dark);
}

.markdown-content blockquote {
  border-left: 4px solid var(--reasoning-border-light);
  margin: 1.5em 0;
  padding: 0.5em 1.2em;
  color: var(--text-secondary-light);
  border-radius: 4px;
}

.dark .markdown-content blockquote {
  border-left-color: var(--reasoning-border-dark);
  color: var(--text-secondary-dark);
}

.markdown-content code:not(.hljs) {
  background-color: rgba(139, 148, 158, 0.1);
  color: var(--text-primary-light);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.85em;
}

.dark .markdown-content code:not(.hljs) {
  background-color: var(--code-header-bg);
  color: var(--code-text);
}

.markdown-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-content table th,
.markdown-content table td {
  padding: 8px 12px;
  text-align: left;
}

.markdown-content table th {
  border-bottom: 2px solid var(--reasoning-border-light);
  font-weight: 600;
  color: var(--text-primary-light);
}

.dark .markdown-content table th {
  border-bottom-color: var(--reasoning-border-dark);
  color: var(--text-primary-dark);
}

.markdown-content table td {
  border-bottom: 1px solid var(--reasoning-border-light);
}

.dark .markdown-content table td {
  border-bottom-color: var(--reasoning-border-dark);
}

.markdown-content table tr:last-child td {
  border-bottom: none;
}

.katex-inline {
  vertical-align: middle;
}

.katex-display {
  display: block;
  text-align: center;
  margin: 1em 0;
}

.markdown-content .katex-html {
  display: inline-block;
}

.loading-animation {
  display: flex;
  padding: 12px 16px;
  width: 100%;
  box-sizing: border-box;
  align-items: center;
}

.markdown-content pre code.hljs {
  color: var(--code-text-light);
  background: var(--code-bg-light);
}

.markdown-content pre code.hljs .hljs-comment {
  color: var(--code-comment-light);
}

.markdown-content pre code.hljs .hljs-keyword {
  color: var(--code-keyword-light);
}

.markdown-content pre code.hljs .hljs-function {
  color: var(--code-function-light);
}

.markdown-content pre code.hljs .hljs-string {
  color: var(--code-string-light);
}

.markdown-content pre code.hljs .hljs-number {
  color: var(--code-number-light);
}

.markdown-content pre code.hljs .hljs-variable {
  color: var(--code-variable-light);
}

.markdown-content pre code.hljs .hljs-property {
  color: var(--code-property-light);
}

.dark .markdown-content pre code.hljs {
  color: var(--code-text);
  background: var(--code-bg);
}

.dark .markdown-content pre code.hljs .hljs-comment {
  color: var(--code-comment-dark);
}

.dark .markdown-content pre code.hljs .hljs-keyword {
  color: var(--code-keyword-dark);
}

.dark .markdown-content pre code.hljs .hljs-function {
  color: var(--code-function-dark);
}

.dark .markdown-content pre code.hljs .hljs-string {
  color: var(--code-string-dark);
}

.dark .markdown-content pre code.hljs .hljs-number {
  color: var(--code-number-dark);
}

.dark .markdown-content pre code.hljs .hljs-variable {
  color: var(--code-variable-dark);
}

.dark .markdown-content pre code.hljs .hljs-property {
  color: var(--code-property-dark);
}

.dark .markdown-content pre code.hljs .hljs-punctuation,
.dark .markdown-content pre code.hljs .hljs-tag,
.dark .markdown-content pre code.hljs .hljs-operator,
.dark .markdown-content pre code.hljs .hljs-bracket {
  color: #e6edf3;
}

.dark .markdown-content pre code.hljs .hljs-template-variable,
.dark .markdown-content pre code.hljs .hljs-template-tag {
  color: #f0f6fc;
}
</style>
