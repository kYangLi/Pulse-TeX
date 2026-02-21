from openai import AsyncOpenAI

from pulse_tex.core.config import Config


class AIService:
    def __init__(self):
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            api_key = Config.AI_API_KEY
            if not api_key:
                raise ValueError("AI API key not configured")
            base_url = Config.AI_BASE_URL
            if not base_url.endswith("/v1"):
                base_url = f"{base_url.rstrip('/')}/v1"
            self._client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
            )
        return self._client

    @property
    def model(self) -> str:
        return Config.AI_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(Config.AI_API_KEY)

    async def chat(
        self,
        message: str,
        context: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if context:
            messages.append(
                {
                    "role": "user",
                    "content": f"Context (from my paper):\n{context}\n\nMy question: {message}",
                }
            )
        else:
            messages.append({"role": "user", "content": message})

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.7,
        )
        return response.choices[0].message.content or ""

    async def chat_stream(
        self,
        message: str,
        context: str | None = None,
        system_prompt: str | None = None,
    ):
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if context:
            messages.append(
                {
                    "role": "user",
                    "content": f"Context (from my paper):\n{context}\n\nMy question: {message}",
                }
            )
        else:
            messages.append({"role": "user", "content": message})

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.7,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def polish(self, text: str, style: str = "academic") -> str:
        system_prompt = """You are an academic writing assistant. Your task is to polish and improve the given text while maintaining its original meaning. 
- Improve clarity, grammar, and flow
- Use formal academic language
- Preserve any LaTeX commands and mathematical notation exactly as they are
- Return ONLY the polished text, no explanations"""

        style_hints = {
            "academic": "Use formal academic style suitable for journal publication.",
            "concise": "Make the text more concise while preserving key information.",
            "detailed": "Expand and elaborate with more details and examples.",
        }

        user_message = f"""Style: {style_hints.get(style, style_hints["academic"])}

Text to polish:
{text}

Polished text:"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""

    async def translate(self, text: str, direction: str = "en") -> str:
        if direction == "en":
            lang_pair = "Chinese to English"
            target = "English"
        else:
            lang_pair = "English to Chinese"
            target = "Chinese"

        system_prompt = f"""You are a professional academic translator. Translate the given text from {lang_pair}.
- Maintain academic rigor and precision
- Preserve all LaTeX commands and mathematical notation exactly
- Return ONLY the translation, no explanations"""

        user_message = f"""Translate the following text to {target}:

{text}

Translation:"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""

    async def explain_error(self, log_content: str, source_code: str | None = None) -> str:
        system_prompt = """You are a LaTeX expert helping debug compilation errors. 
Analyze the error log and explain in simple terms:
1. What went wrong
2. Where the error occurred (line number if available)
3. How to fix it

Be concise and helpful. If you can identify the exact issue, provide the corrected code snippet."""

        user_message = f"""Here is the LaTeX compilation error log:

```
{log_content[:4000]}
```
"""

        if source_code:
            user_message += f"""
The source .tex file content:
```
{source_code[:2000]}
```
"""

        user_message += "\nPlease explain the error and how to fix it:"

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.5,
        )
        return response.choices[0].message.content or ""

    async def generate_tikz(self, description: str) -> str:
        system_prompt = """You are a TikZ/LaTeX expert. Generate clean, compilable TikZ code based on the user's description.

Rules:
- Return ONLY the TikZ code, wrapped in ```latex ... ```
- Use standard TikZ libraries when needed
- Include necessary \\usetikzlibrary commands
- Make the code well-commented and readable
- Ensure the code is complete and compilable"""

        user_message = f"""Generate TikZ code for the following:

{description}

TikZ code:"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""

    async def generate_plot(self, description: str, data: str | None = None) -> str:
        system_prompt = """You are a Python/Matplotlib expert. Generate Python code to create scientific plots.

Rules:
- Return ONLY the Python code, wrapped in ```python ... ```
- Use matplotlib for plotting
- Save the figure as PDF: plt.savefig('figure.pdf', bbox_inches='tight', dpi=300)
- Include proper labels, legends, and styling
- Handle data parsing if CSV/string data is provided
- Make publication-ready figures"""

        user_message = f"""Generate Python/Matplotlib code for the following plot:

{description}
"""

        if data:
            user_message += f"""
Data provided:
{data[:1000]}
"""

        user_message += "\nPython code:"

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""


ai_service = AIService()
