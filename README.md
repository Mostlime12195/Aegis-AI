# Libre AI Studio

Libre AI Studio is a **free, unlimited** AI ChatBot that uses various models through [Hack Club's free API](https://ai.hackclub.com).
Libre AI Studio does **not** sell your user information, and all chat & user data is stored locally, on your device. However, Hack Club does log all API usage.

## Features

- All data is stored locally on your device. No data is stored on the internet (outside of Hack Club's logs).
- Full Markdown & LaTeX Support.
- Support for multiple chats.
- Detailed code-blocks, including syntax highlighting, downloading, and a copy button.
- Customizable with name, occupation, and custom instructions.
- Reasoning is visible.
- For GPT-OSS models, advanced web search is supported with inline citations.
- Some models support customizable reasoning effort (low, medium, and high for GPT-OSS models and a reasoning toggle for Qwen3 32b).
- Incognito mode to prevent chat history from being saved.
- Global memory to remember user details/preferences/opinions across chats.
- Parameter configuration panel with temperature, top_p, and seed options.

## Todo

- Canvas/Code Panel
- Tree-of-Thought (Multiple instances of the same or different models working together to solve a problem at the same time)

Please suggest more ideas in the Issues tab.

## VSCode Setup

[VSCode](https://code.visualstudio.com/).

### Clone Project and Move into Its Folder

```sh
git clone https://github.com/Mostlime12195/Quasar-AI-Chatbot.git
cd quasar-ai-chatbot
```

### Install Dependencies

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```
