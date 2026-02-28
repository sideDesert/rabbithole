"""Note tools — save learning notes to the filesystem."""

from app.config import PLANS_DIR
from app.tools.registry import tool_registry, ToolContext


@tool_registry.register(
    agents=["feynman"],
    description="Save learning notes for a concept. Writes markdown to the plan's notes directory.",
    parameters={
        "type": "object",
        "properties": {
            "concept": {
                "type": "string",
                "description": "The concept these notes are about",
            },
            "content": {
                "type": "string",
                "description": "The notes content in markdown format",
            },
        },
        "required": ["concept", "content"],
    },
)
async def create_notes(concept: str, content: str, *, ctx: ToolContext) -> dict:
    if not ctx.topic_slug:
        return {"error": "No topic_slug set on this thread — create a plan first"}

    notes_dir = PLANS_DIR / ctx.topic_slug / "notes"
    notes_dir.mkdir(parents=True, exist_ok=True)

    # Slugify concept name for filename
    slug = concept.lower().replace(" ", "-").replace("/", "-")
    note_path = notes_dir / f"{slug}.md"

    # Append if exists, create if new
    header = f"# {concept}\n\n"
    if note_path.exists():
        existing = note_path.read_text()
        note_path.write_text(existing + "\n\n---\n\n" + content)
    else:
        note_path.write_text(header + content + "\n")

    return {"status": "saved", "path": str(note_path)}
