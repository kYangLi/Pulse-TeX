import re
from openai import AsyncOpenAI

from pulse_tex.core.config import Config


JOURNAL_STYLES = {
    "nature": {
        "name": "Nature",
        "colors": {
            "primary": "#333333",
            "secondary": "#3B82F6",
            "accent": "#EF4444",
            "success": "#10B981",
            "warning": "#F59E0B",
            "background": "#FFFFFF",
            "text": "#1F2937",
        },
        "stroke_width": 2,
        "font_family": "Arial, Helvetica, sans-serif",
        "font_size": 12,
        "border_radius": 8,
        "shadow": "drop-shadow(2px 2px 4px rgba(0,0,0,0.1))",
    },
    "science": {
        "name": "Science",
        "colors": {
            "primary": "#1A1A1A",
            "secondary": "#0077B6",
            "accent": "#D62828",
            "success": "#2D6A4F",
            "warning": "#E9C46A",
            "background": "#FFFFFF",
            "text": "#1A1A1A",
        },
        "stroke_width": 1.5,
        "font_family": "Times New Roman, serif",
        "font_size": 11,
        "border_radius": 4,
        "shadow": "drop-shadow(1px 1px 3px rgba(0,0,0,0.15))",
    },
    "ieee": {
        "name": "IEEE",
        "colors": {
            "primary": "#000000",
            "secondary": "#0055A4",
            "accent": "#C41E3A",
            "success": "#228B22",
            "warning": "#FFB000",
            "background": "#FFFFFF",
            "text": "#000000",
        },
        "stroke_width": 1,
        "font_family": "Times New Roman, serif",
        "font_size": 10,
        "border_radius": 0,
        "shadow": "none",
    },
    "minimal": {
        "name": "Minimal",
        "colors": {
            "primary": "#374151",
            "secondary": "#6B7280",
            "accent": "#9CA3AF",
            "success": "#9CA3AF",
            "warning": "#9CA3AF",
            "background": "#FFFFFF",
            "text": "#374151",
        },
        "stroke_width": 1.5,
        "font_family": "Inter, sans-serif",
        "font_size": 11,
        "border_radius": 6,
        "shadow": "none",
    },
}


DIAGRAM_TYPES = {
    "flowchart": "Flowchart / Process diagram",
    "schematic": "Scientific schematic (physical models, experiments)",
    "architecture": "System architecture / Block diagram",
    "comparison": "Comparison diagram (before/after, A/B)",
    "timeline": "Timeline / Sequence diagram",
}


class DiagramService:
    def __init__(self):
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            api_key = Config.AI_API_KEY
            if not api_key:
                raise ValueError("AI API key not configured")
            self._client = AsyncOpenAI(
                api_key=api_key,
                base_url=f"{Config.AI_BASE_URL}/v1",
            )
        return self._client

    @property
    def model(self) -> str:
        return Config.AI_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(Config.AI_API_KEY)

    def get_available_styles(self) -> dict:
        return {
            style_id: {"name": style["name"], "description": f"Suitable for {style['name']} publications"}
            for style_id, style in JOURNAL_STYLES.items()
        }

    def get_diagram_types(self) -> dict:
        return DIAGRAM_TYPES

    async def refine_sketch(
        self,
        sketch_svg: str,
        description: str,
        style: str = "nature",
        context: str | None = None,
        previous_iterations: list[str] | None = None,
    ) -> dict:
        style_config = JOURNAL_STYLES.get(style, JOURNAL_STYLES["nature"])

        system_prompt = f"""You are a scientific illustration expert specializing in creating publication-quality diagrams for top journals like Nature, Science, and IEEE.

Your task: Transform the user's rough sketch into a polished, publication-ready SVG diagram.

Style Requirements ({style_config["name"]} style):
- Colors: Primary {style_config["colors"]["primary"]}, Secondary {style_config["colors"]["secondary"]}, Accent {style_config["colors"]["accent"]}, Success {style_config["colors"]["success"]}
- Stroke width: {style_config["stroke_width"]}px
- Font: {style_config["font_family"]}, size {style_config["font_size"]}pt
- Border radius: {style_config["border_radius"]}px
- Shadow: {style_config["shadow"]}

SVG Technical Requirements:
1. Use clean, semantic SVG structure
2. Group related elements with <g> tags
3. Add appropriate <title> and <desc> for accessibility
4. Use viewBox for responsive scaling
5. Ensure all text is selectable (not converted to paths)
6. Add drop shadow filter if style requires
7. Use consistent spacing (20-30px between elements)
8. Center align text within shapes
9. Use smooth bezier curves for connections

Output: Return ONLY the SVG code, no explanations or markdown."""

        user_message = f"""User's rough sketch SVG:
```xml
{sketch_svg[:3000]}
```

User's description of what they want:
{description}

{f"Paper context for reference:\n{context[:1500]}" if context else ""}

{f"Previous versions for iterative improvement:\n{chr(10).join(previous_iterations[-2:])}" if previous_iterations else ""}

Please create a polished, publication-ready version of this diagram."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )

        refined_svg = response.choices[0].message.content or ""
        refined_svg = self._extract_svg(refined_svg)

        return {
            "refined_svg": refined_svg,
            "style": style,
            "style_name": style_config["name"],
        }

    async def generate_from_text(
        self,
        description: str,
        style: str = "nature",
        diagram_type: str = "flowchart",
        context: str | None = None,
    ) -> dict:
        style_config = JOURNAL_STYLES.get(style, JOURNAL_STYLES["nature"])
        diagram_desc = DIAGRAM_TYPES.get(diagram_type, DIAGRAM_TYPES["flowchart"])

        system_prompt = f"""You are a scientific illustration expert creating publication-quality diagrams from text descriptions.

Diagram Type: {diagram_desc}

Style Requirements ({style_config["name"]} style):
- Colors: Primary {style_config["colors"]["primary"]}, Secondary {style_config["colors"]["secondary"]}, Accent {style_config["colors"]["accent"]}
- Stroke width: {style_config["stroke_width"]}px
- Font: {style_config["font_family"]}, size {style_config["font_size"]}pt
- Border radius: {style_config["border_radius"]}px
- Shadow: {style_config["shadow"]}

SVG Best Practices:
1. Clean, semantic structure with <g> groups
2. Responsive viewBox
3. Selectable text (not paths)
4. Consistent 20-30px spacing
5. Smooth connections with bezier curves
6. Clear visual hierarchy
7. Proper alignment and centering

Output: Return ONLY the SVG code, no explanations."""

        user_message = f"""Create a {diagram_type} diagram based on this description:

{description}

{f"Paper context:\n{context[:1500]}" if context else ""}

Generate a clean, publication-ready SVG diagram."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.4,
        )

        svg = response.choices[0].message.content or ""
        svg = self._extract_svg(svg)

        return {
            "svg": svg,
            "style": style,
            "style_name": style_config["name"],
            "diagram_type": diagram_type,
        }

    async def iterate_design(
        self,
        current_svg: str,
        feedback: str,
        style: str = "nature",
    ) -> dict:
        style_config = JOURNAL_STYLES.get(style, JOURNAL_STYLES["nature"])

        system_prompt = f"""You are a scientific illustration expert. The user wants to modify their existing diagram.

Current Style: {style_config["name"]}
- Colors: Primary {style_config["colors"]["primary"]}, Secondary {style_config["colors"]["secondary"]}
- Stroke: {style_config["stroke_width"]}px, Font: {style_config["font_family"]}

Make ONLY the requested changes while preserving the overall design quality.
Return ONLY the modified SVG code."""

        user_message = f"""Current diagram:
```xml
{current_svg[:3000]}
```

User's modification request:
{feedback}

Please modify the diagram accordingly and return the updated SVG."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )

        svg = response.choices[0].message.content or ""
        svg = self._extract_svg(svg)

        return {
            "svg": svg,
            "style": style,
            "feedback_addressed": feedback,
        }

    async def svg_to_tikz(self, svg: str, description: str | None = None) -> str:
        system_prompt = """You are a LaTeX/TikZ expert. Convert the given SVG diagram to clean, compilable TikZ code.

Requirements:
1. Use appropriate TikZ libraries (shapes, arrows, positioning, calc)
2. Maintain visual fidelity to the original
3. Use relative positioning where possible
4. Add helpful comments
5. Ensure the code compiles with standard LaTeX distributions
6. Return ONLY TikZ code wrapped in \\begin{tikzpicture}...\\end{tikzpicture}"""

        user_message = f"""Convert this SVG to TikZ:

```xml
{svg[:3000]}
```

{f"Context: {description}" if description else ""}

TikZ code:"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )

        tikz = response.choices[0].message.content or ""
        tikz = self._extract_tikz(tikz)

        return tikz

    def _extract_svg(self, content: str) -> str:
        svg_match = re.search(r"<svg[^>]*>.*?</svg>", content, re.DOTALL | re.IGNORECASE)
        if svg_match:
            return svg_match.group(0)

        code_block = re.search(r"```(?:xml|svg)?\s*\n(.*?)\n```", content, re.DOTALL)
        if code_block:
            svg_content = code_block.group(1)
            if "<svg" in svg_content.lower():
                return svg_content

        return content.strip()

    def _extract_tikz(self, content: str) -> str:
        tikz_match = re.search(r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}", content, re.DOTALL)
        if tikz_match:
            return tikz_match.group(0)

        code_block = re.search(r"```(?:latex|tex|tikz)?\s*\n(.*?)\n```", content, re.DOTALL)
        if code_block:
            tikz_content = code_block.group(1)
            if "tikzpicture" in tikz_content:
                return tikz_content

        return content.strip()


diagram_service = DiagramService()
