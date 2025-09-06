<template>
  <div class="no-padding">
    <!-- Static container for completed elements -->
    <div ref="staticContainer" class="no-padding markdown-content"></div>

    <!-- Streaming container for current element being rendered -->
    <div ref="streamingContainer" class="no-padding markdown-content"></div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItKatex from "markdown-it-katex";
import hljs from 'highlight.js';

// props
const props = defineProps({
  content: { type: String, default: '' },
  isComplete: { type: Boolean, default: false }
});

const emit = defineEmits(['complete', 'start']);

// DOM refs (match your template)
const staticContainer = ref(null);
const streamingContainer = ref(null);

// markdown-it instance + plugins with highlighting
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (__) { }
    }
    return '';
  }
})
  .use(markdownItFootnote)
  .use(markdownItTaskLists, { enabled: false, label: true, bulletMarker: "-" })
  .use(markdownItKatex);

// Add custom fence rule for code blocks (same as in ChatPanel)
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

// Internal state
let appendedBlockCount = 0;   // how many complete blocks we've appended to static container
let tailMarkdown = '';        // the current tail (not-yet-moved text)
let prevContent = '';         // last seen prop content string
let lastRenderKey = '';       // avoid redundant streaming innerHTML writes
let hasEmittedStart = false;  // track if we've emitted the start event

// Make sure global functions are available
if (typeof window.copyCode !== 'function') {
  window.copyCode = function (button) {
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
}

if (typeof window.downloadCode !== 'function') {
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
  };

  window.downloadCode = function (button, lang) {
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
}

// --- Utilities ---

// Simple block split on blank lines (original approach)
function splitIntoBlocks(markdown) {
  if (!markdown) return [''];
  return markdown.split(/\n{2,}/).map(s => s === undefined ? '' : s);
}

// Render block to HTML
function renderBlockHtml(mdText) {
  if (!mdText || mdText.trim().length === 0) return '';
  return md.render(mdText);
}

// Append DOM element directly to static container
function appendElementToStatic() {
  if (!staticContainer.value || !streamingContainer.value) return;

  // Move all children from streaming container to static container
  while (streamingContainer.value.firstChild) {
    staticContainer.value.appendChild(streamingContainer.value.firstChild);
  }
}

// Replace streaming container content (avoid churn when identical)
function setStreamingHtml(html) {
  if (!streamingContainer.value) return;
  if (lastRenderKey === html) return;
  lastRenderKey = html;

  streamingContainer.value.innerHTML = html || '';
}

// Flush entire message into static container (used on complete)
function finalizeAll(fullText) {
  if (!staticContainer.value) return;

  // Clear containers to prevent duplication
  staticContainer.value.innerHTML = '';
  if (streamingContainer.value) {
    streamingContainer.value.innerHTML = '';
  }

  const fullHtml = md.render(fullText || '');

  // Set the streaming container with the full HTML and then move it to static container
  setStreamingHtml(fullHtml);
  appendElementToStatic();

  tailMarkdown = '';
  appendedBlockCount = 0;
  lastRenderKey = '';
  prevContent = fullText || '';
}

// Process appended suffix only (keeps streaming live)
function processAppendedSuffix(suffix) {
  if (!suffix || suffix.length === 0) {
    // no-op but still keep streaming block rendered
    const blocks = splitIntoBlocks(tailMarkdown);
    const streamingBlock = blocks.length ? blocks[blocks.length - 1] : '';
    setStreamingHtml(renderBlockHtml(streamingBlock));
    return;
  }

  // Append suffix to tail buffer
  const previousTail = tailMarkdown;
  tailMarkdown = tailMarkdown ? (tailMarkdown + suffix) : suffix;

  // Split blocks in tail; any block except last is "complete"
  const blocks = splitIntoBlocks(tailMarkdown);
  const completeBlocks = blocks.length > 1 ? blocks.slice(0, blocks.length - 1) : [];

  // Only append complete blocks that are actually new
  // Compare with what we had before to avoid duplication
  const previousBlocks = splitIntoBlocks(previousTail);
  const previousCompleteCount = previousBlocks.length > 1 ? previousBlocks.length - 1 : 0;

  // Append any newly-complete blocks (only the actually new ones)
  if (completeBlocks.length > previousCompleteCount) {
    // Accumulate all newly-complete blocks in the streaming container
    let accumulatedHtml = '';
    for (let i = previousCompleteCount; i < completeBlocks.length; i++) {
      const html = renderBlockHtml(completeBlocks[i]);
      if (html) {
        accumulatedHtml += html;
      }
    }

    // Set the streaming container with all accumulated HTML and then move it to static container
    if (accumulatedHtml) {
      setStreamingHtml(accumulatedHtml);
      appendElementToStatic();
    }

    appendedBlockCount = completeBlocks.length;
  }

  // streaming block is last block in tail (or empty)
  const streamingBlock = blocks.length ? blocks[blocks.length - 1] : '';
  const streamingHtml = renderBlockHtml(streamingBlock);
  setStreamingHtml(streamingHtml);
}

// Fallback when new content is not a simple append (replace/rewind)
function handleNonPrefixReplace(newContent, isComplete) {
  if (isComplete) {
    finalizeAll(newContent);
    prevContent = newContent || '';
    return;
  }

  // Non-prefix change: conservative reset & re-render
  if (staticContainer.value) staticContainer.value.innerHTML = '';
  appendedBlockCount = 0;
  tailMarkdown = '';
  lastRenderKey = '';  // Reset lastRenderKey as well
  prevContent = '';    // Reset prevContent to avoid confusion

  const blocks = splitIntoBlocks(newContent || '');
  const completeBlocks = blocks.length > 1 ? blocks.slice(0, blocks.length - 1) : [];

  // Accumulate all complete blocks
  let accumulatedHtml = '';
  for (let i = 0; i < completeBlocks.length; i++) {
    const html = renderBlockHtml(completeBlocks[i]);
    if (html) {
      accumulatedHtml += html;
    }
    appendedBlockCount++;
  }

  // Set the streaming container with all accumulated HTML and then move it to static container
  if (accumulatedHtml) {
    setStreamingHtml(accumulatedHtml);
    appendElementToStatic();
  }
  tailMarkdown = blocks.length ? blocks[blocks.length - 1] : '';
  setStreamingHtml(renderBlockHtml(tailMarkdown));

  // Update prevContent to current content
  prevContent = newContent || '';
}

// Main logic executed immediately on prop change (no debounce)
function processContentNow(newContent, isComplete) {
  newContent = newContent || '';

  // If marked complete, finalize entire content
  if (isComplete) {
    finalizeAll(newContent);
    prevContent = newContent;

    // Emit event to notify parent that message is complete
    emit('complete');

    return;
  }

  // If there was no previous content, treat as fresh
  if (!prevContent) {
    // Emit start event when streaming begins
    if (!hasEmittedStart) {
      emit('start');
      hasEmittedStart = true;
    }
    
    // Init: split into blocks and render
    handleNonPrefixReplace(newContent, false);
    prevContent = newContent;
    return;
  }

  // Fast check: is this an append (prevContent is prefix of newContent)?
  if (newContent.startsWith(prevContent)) {
    const suffix = newContent.slice(prevContent.length);
    processAppendedSuffix(suffix);
    prevContent = newContent;
    return;
  }

  // Check if this is actually a rewind/replacement case
  // Only do full replacement if content is significantly different
  if (!newContent.startsWith(prevContent.substring(0, Math.min(prevContent.length, newContent.length)))) {
    // Otherwise, fallback to conservative replace handling
    handleNonPrefixReplace(newContent, isComplete);
    return;
  }

  // For minor changes that aren't simple appends, still treat as append with empty suffix
  // This handles cases where whitespace or formatting might have changed
  processAppendedSuffix('');
  prevContent = newContent;
}

// Watch props and run immediately (no debounce)
watch(
  () => [props.content, props.isComplete],
  ([newContent, isComplete]) => {
    // Reset the start flag when content is cleared or reset
    if (!newContent || newContent.length < prevContent.length) {
      hasEmittedStart = false;
    }
    
    processContentNow(newContent || '', isComplete);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  // nothing to clean up here
});
</script>

<style>
.no-padding {
  padding: 0;
}
</style>