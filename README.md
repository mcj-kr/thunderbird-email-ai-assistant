# Thunderbird Email AI Assistant
> AI-powered, multi-provider mail tagging and classification engine for Thunderbird.

This Thunderbird MailExtension provides a powerful and flexible framework for AI-powered email analysis. It automatically processes incoming emails, sends them to a language model of your choice for analysis, and then applies tags based on the model's response. This allows for sophisticated, automated email classification and sorting.

## Key Features

- **Multi-Provider LLM Support**: Integrates with local models via Ollama and cloud-based models from OpenAI, Google Gemini, Anthropic Claude, Mistral, and DeepSeek.
- **Dynamic Email Analysis**: Intelligently extracts headers, text content (converting HTML to plain text), and attachment details for efficient and accurate analysis by the LLM.
- **Fully Configurable Tagging**: Allows users to define their own custom tags, colors, and LLM prompts for a completely personalized email classification system.
- **Privacy-Focused**: Gives users the choice between maximum privacy with a local Ollama instance or the power of cloud-based models, with clear privacy notices for each.
- **Secure Configuration**: Features a comprehensive options page for managing API keys and provider settings, using Thunderbird's runtime permissions API for security.

## Development

### Prerequisites

- **Node.js and npm**: Required for managing dependencies and running build scripts. You can download them from [nodejs.org](https://nodejs.org/).
- **Thunderbird**: The application this extension is built for.

### Build Instructions

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/mcj-kr/thunderbird-email-ai-assistant.git
    cd thunderbird-email-ai-assistant
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the extension:**
    This command runs webpack to bundle the scripts and then uses `web-ext` to package everything into a `.zip` file located in the `web-ext-artifacts/` directory.
    ```bash
    ./build.bash
    ```

## Installation

### Temporary Installation (for Development)

1.  Build the extension using the instructions above.
2.  In Thunderbird, go to `Tools > Add-ons and Themes`.
3.  Click the gear icon, select `Debug Add-ons`, and then click `Load Temporary Add-on...`.
4.  Select the generated `.zip` file from the `web-ext-artifacts/` directory.

