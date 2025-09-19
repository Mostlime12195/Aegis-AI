import MarkdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTaskLists from "markdown-it-task-lists";
import markdownItTexmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js";

// Simple markdown-it plugin for detecting citations in the format 【N†Lx-Ly】
function markdownItCitation(md, options) {
  // Alternative approach: Post-process text tokens
  const defaultTextRenderer =
    md.renderer.rules.text ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.text = function (tokens, idx, options, env, self) {
    const token = tokens[idx];

    // If this text token contains citations, process them
    if (
      token.content &&
      (token.content.includes("【") ||
        token.content.includes("［") ||
        token.content.includes("⟦"))
    ) {
      // Process citations in the text content
      const citationPattern = /([【［⟦])((\d+)†L\d+-L\d+)([】］⟧])/g;
      let newContent = token.content.replace(
        citationPattern,
        function (
          match,
          openBracket,
          citationContent,
          citationIndex,
          closeBracket
        ) {
          // Create an anchor tag with a placeholder href that we'll update later
          return `<a class="citation-button" data-citation-content="${citationContent}" data-citation-marker href="#" target="_blank" onclick="event.preventDefault();">${openBracket}${citationContent}${closeBracket}</a>`;
        }
      );

      // Return the processed content
      return newContent;
    }

    // Default rendering
    return defaultTextRenderer(tokens, idx, options, env, self);
  };

  // Renderer for citation tokens (if we create them directly)
  md.renderer.rules.citation = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const citationContent = token.content;

    // Create a styled citation element with data attributes
    return `<a class="citation-button" data-citation-content="${citationContent}" data-citation-marker href="#" target="_blank" onclick="event.preventDefault();">【${citationContent}】</a>`;
  };
}

// Shared fence renderer for code blocks
function addCodeBlockRenderer(md) {
  // Add custom fence rule for code blocks
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";
    const langName = info ? info.split(/\s+/g)[0] : "";

    // Handle code blocks
    const code = token.content;
    const lang = langName || "text";
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

    // Build HTML using template literals for better readability
    // Note: We're using JSON.stringify to safely escape values that might contain backticks or other special characters
    const safeLangDisplay = JSON.stringify(langDisplay);
    const safeLangClass = md.utils.escapeHtml(lang);

    // For the visible language display, we can use the original langDisplay since it's just displayed text
    // and doesn't need escaping in the same way as attribute values or JavaScript code

    return `<div class="code-block-wrapper">
  <div class="code-block-header">
    <span class="code-language">${langDisplay}</span>
    <div class="code-actions">
      <button class="code-action-button" onclick="window.downloadCode(event.currentTarget, ${safeLangDisplay})" title="Download file">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 15.575q-.2 0-.375-.062T11.3 15.3l-3.6-3.6q-.3-.3-.288-.7t.288-.7q.3-.3.713-.312t.712.287L11 12.15V5q0-.425.288-.712T12 4t.713.288T13 5v7.15l1.875-1.875q.3-.3.713-.288t.712.313q.275.3.288.7t-.288.7l-3.6 3.6q-.15.15-.325.213t-.375.062M6 20q-.825 0-1.412-.587T4 18v-2q0-.425.288-.712T5 15t.713.288T6 16v2h12v-2q0-.425.288-.712T19 15t.713.288T20 16v2q0 .825-.587 1.413T18 20z" stroke-width="0.1" stroke="currentColor" />
        </svg>
        <span>Download</span>
      </button>
      <button class="code-action-button" onclick="window.copyCode(event.currentTarget)" title="Copy code">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" stroke-width="0.1" d="M9 18q-.825 0-1.412-.587T7 16V4q0-.825.588-1.412T9 2h9q.825 0 1.413.588T20 4v12q0 .825-.587 1.413T18 18zm0-2h9V4H9zm-4 6q-.825 0-1.412-.587T3 20V7q0-.425.288-.712T4 6t.713.288T5 7v13h10q.425 0 .713.288T16 21t-.288.713T15 22zm4-6V4z" />
        </svg>
        <span>Copy</span>
      </button>
    </div>
  </div>
  <pre><code class="hljs ${safeLangClass}">${highlightedCode}</code></pre>
</div>`;
  };
}

// Function to process citations and update anchor tags with proper URLs
function processCitationsInPlace(containerElement, executedTools) {
  // Validate inputs
  if (!containerElement || !executedTools) {
    return;
  }

  // Find all citation markers within the container
  const citationMarkers = containerElement.querySelectorAll(
    "[data-citation-marker]"
  );

  citationMarkers.forEach((marker) => {
    const citationContent = marker.getAttribute("data-citation-content");

    if (citationContent) {
      // Extract the index from the citation content (format: N†Lx-Ly)
      const citationIndexMatch = citationContent.match(/^(\d+)†/);
      const citationIndex = citationIndexMatch
        ? parseInt(citationIndexMatch[1])
        : null;

      // Try to find URL from executedTools using the correct pattern
      let url = null;
      if (citationIndex !== null && executedTools && executedTools.length > 0) {
        const toolCall = executedTools.find(
          (tool) => tool.index === citationIndex && tool.output
        );

        if (toolCall && toolCall.output) {
          // Extract URL using the correct pattern: "L1: URL: [url]"
          const urlMatch = toolCall.output.match(
            /L1:\s*URL:\s*(https?:\/\/[^\s"<>]+)/
          );
          if (urlMatch) {
            url = urlMatch[1];
          } else {
            // Fallback to general URL pattern
            const fallbackUrlMatch =
              toolCall.output.match(/https?:\/\/[^\s"<>]+/);
            if (fallbackUrlMatch) {
              url = fallbackUrlMatch[0];
            }
          }
        }
      }

      // If we still don't have a URL, try to extract it directly from the citation content
      if (!url) {
        // Try to extract URL from citation content itself
        const urlMatch = citationContent.match(/https?:\/\/[^\s"<>]+/);
        url = urlMatch ? urlMatch[0] : null;
      }

      // Create display text - use domain name or URL if available
      let displayText = citationContent;
      if (url) {
        try {
          const urlObj = new URL(url);
          displayText = urlObj.hostname.replace("www.", "");
        } catch {
          // If URL parsing fails, use the full URL or a portion of it
          displayText = url.length > 30 ? url.substring(0, 27) + "..." : url;
        }
      }

      // Update the content to show just the display text
      marker.innerHTML = `<span class="citation-content">${displayText}</span>`;

      // Set the href attribute if we have a URL
      if (url) {
        marker.setAttribute("href", url);
        // Remove the onclick handler since we now have a real href
        marker.removeAttribute("onclick");
      }
      // If no URL, keep the placeholder href="#" and onclick handler
    }
  });
}

// Function to process citations and make them interactive (for pre-DOM insertion)
function processCitations(htmlContent, executedTools) {
  // Create a temporary div to parse the HTML
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlContent;

  // Process citations in place within the temporary div
  processCitationsInPlace(tempDiv, executedTools);

  return tempDiv.innerHTML;
}

// Create a shared markdown-it instance
const createMarkdownInstance = () => {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang }).value;
        } catch (__) {}
      }
      return "";
    },
  })
    .use(markdownItFootnote)
    .use(markdownItTaskLists, {
      enabled: false,
      label: true,
      bulletMarker: "-",
    })
    .use(markdownItCitation);

  // Add the processCitations functions to the markdown instance
  md.processCitations = processCitations;
  md.processCitationsInPlace = processCitationsInPlace;

  return md;
};

// Create instances for each component type
const chatPanelMd = createMarkdownInstance();
const streamingMessageMd = createMarkdownInstance();

// Add shared code block renderer to both instances
addCodeBlockRenderer(chatPanelMd);
addCodeBlockRenderer(streamingMessageMd);

// Add texmath only to chatPanel instance with support for both dollar signs and brackets
chatPanelMd.use(markdownItTexmath, {
  engine: katex,
  delimiters: ["dollars", "brackets"],
  katexOptions: {
    throwOnError: false,
    errorColor: " #cc0000",
  },
});

export { chatPanelMd, streamingMessageMd };
