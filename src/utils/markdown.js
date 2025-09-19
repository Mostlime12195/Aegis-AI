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

// Add texmath only to chatPanel instance with support for both dollar signs and brackets
chatPanelMd.use(markdownItTexmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets'],
  katexOptions: {
    throwOnError: false,
    errorColor: " #cc0000",
  }
});

export { chatPanelMd, streamingMessageMd };
