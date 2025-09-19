// Shared utility functions for code blocks
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

export function copyCode(button) {
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
}

export function downloadCode(button, lang) {
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
}

// Make functions globally available for inline onclick handlers
if (typeof window !== 'undefined') {
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
}