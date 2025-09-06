// Available models from Hack Club
export const availableModels = [
  {
    id: "qwen/qwen3-32b",
    name: "Qwen 3 32B",
    description: "Fast, general-purpose reasoning",
    reasoning: true,
    extra_functions: [],
    extra_parameters: {
      reasoning_effort: [["default", "none"], "default"],
    },
    default: true,
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    description: "Powerful STEM reasoning",
    reasoning: true,
    extra_functions: ["browser_search", "code_interpreter"],
    extra_parameters: {
      reasoning_effort: [["low", "medium", "high"], "medium"],
    },
  },
  {
    id: "moonshotai/kimi-k2-instruct-0905",
    name: "Kimi K2 0905",
    description: "Powerful general-purpose chat model",
    reasoning: false,
    extra_functions: [],
    extra_parameters: {},
  },
  {
    category: "Legacy Models",
    models: [
      {
        id: "moonshotai/kimi-k2-instruct",
        name: "Kimi K2",
        description:
          "Powerful general-purpose chat model, original flavor of Kimi K2",
        reasoning: false,
        extra_functions: [],
        extra_parameters: {},
      },
      {
        id: "openai/gpt-oss-20b",
        name: "GPT OSS 20B",
        description: "Lightning-fast STEM reasoning",
        reasoning: true,
        extra_functions: ["browser_search", "code_interpreter"],
        extra_parameters: {
          reasoning_effort: [["low", "medium", "high"], "medium"],
        },
      },
      {
        id: "meta-llama/llama-4-maverick",
        name: "LLaMA 4 Maverick",
        description: "Lightning-fast general-purpose non-reasoning model",
        reasoning: false,
        extra_functions: [],
        extra_parameters: {},
      },
    ],
  },
];

export default availableModels;
